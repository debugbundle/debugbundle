import { readdir as readdirFromFs, rm as rmFromFs, lstat as statFromFs } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

import { readManaged, safePath, writeManaged } from "../../../packages/agent-setup/src/files.js";
import { parseIncidentId } from "../../../packages/retrieval-client/src/index.js";

import { sanitizeTelemetry } from "../../../packages/redaction/src/index.js";
import { isRecord, isMissingPathError } from "./cli-fs-helpers.js";
import { attachSourceToPayload } from "./retrieval-source.js";

type DirectoryMaker = (path: string, options: { recursive: true }) => Promise<void>;
type DirectoryReader = (path: string) => Promise<string[]>;
type FileReader = (filePath: string, encoding: "utf8") => Promise<string>;
type FileRemover = (path: string, options: { force: true }) => Promise<void>;
type FileStatReader = (path: string) => Promise<{ atimeMs: number; mtimeMs: number }>;
type FileWriter = (filePath: string, contents: string, encoding: "utf8") => Promise<void>;

export type CloudArtifactCacheDependencies = {
  cwd?: () => string;
  mkdir?: DirectoryMaker;
  now?: () => Date;
  readFile?: FileReader;
  readdir?: DirectoryReader;
  rm?: FileRemover;
  stat?: FileStatReader;
  writeFile?: FileWriter;
};

const CLOUD_BUNDLE_DIRECTORY_PATH = ".debugbundle/bundles/cloud";
const CLOUD_REPRODUCTION_DIRECTORY_PATH = ".debugbundle/bundles/cloud/reproductions";
const CLOUD_CACHE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function safeCachedArtifact(value: unknown): unknown {
  const result = sanitizeTelemetry(value, { maxTotalBytes: 512 * 1024 });
  if (!result.ok) throw new Error("privacy_projection_unavailable");
  return result.value;
}

export async function cacheCloudBundleArtifact(
  input: { incidentId: string; bundle: unknown },
  dependencies?: CloudArtifactCacheDependencies
): Promise<unknown> {
  parseIncidentId(input.incidentId);
  await pruneExpiredCloudArtifacts(dependencies);

  const bundle = safeCachedArtifact(attachSourceToPayload(input.bundle, "cloud"));

  await persistCloudArtifact(
    join(getWorkspaceRoot(dependencies), CLOUD_BUNDLE_DIRECTORY_PATH),
    `${input.incidentId}.bundle.json`,
    bundle,
    dependencies
  );

  return bundle;
}

export async function cacheCloudReproductionArtifact(
  input: { incidentId: string; reproduction: unknown },
  dependencies?: CloudArtifactCacheDependencies
): Promise<unknown> {
  parseIncidentId(input.incidentId);
  await pruneExpiredCloudArtifacts(dependencies);

  const reproduction = safeCachedArtifact(attachSourceToPayload(input.reproduction, "cloud"));

  await persistCloudArtifact(
    join(getWorkspaceRoot(dependencies), CLOUD_REPRODUCTION_DIRECTORY_PATH),
    `${input.incidentId}.reproduction.json`,
    reproduction,
    dependencies
  );

  return reproduction;
}

export async function syncCloudIncidentCacheStatus(
  input: {
    incidentId: string;
    incident: {
      status?: string;
      resolved_at?: string | null;
    };
  },
  dependencies?: CloudArtifactCacheDependencies
): Promise<void> {
  parseIncidentId(input.incidentId);
  await pruneExpiredCloudArtifacts(dependencies);

  await Promise.all([
    updateCachedArtifactStatus(
      join(
        getWorkspaceRoot(dependencies),
        CLOUD_BUNDLE_DIRECTORY_PATH,
        `${input.incidentId}.bundle.json`
      ),
      input,
      dependencies
    ),
    updateCachedArtifactStatus(
      join(
        getWorkspaceRoot(dependencies),
        CLOUD_REPRODUCTION_DIRECTORY_PATH,
        `${input.incidentId}.reproduction.json`
      ),
      input,
      dependencies
    )
  ]);
}

// Called only after the lifecycle API has returned a validated success. An
// optional local cache failure must not turn that confirmed write into failure.
export async function syncCloudIncidentMutationCache(
  incident: Record<string, unknown>,
  dependencies?: CloudArtifactCacheDependencies
): Promise<void> {
  try {
    await syncCloudIncidentCacheStatus(
      {
        incidentId: String(incident["incident_id"]),
        incident: {
          ...(typeof incident["status"] === "string" ? { status: incident["status"] } : {}),
          resolved_at:
            incident["status"] === "resolved" && typeof incident["resolved_at"] === "string"
              ? incident["resolved_at"]
              : null
        }
      },
      dependencies
    );
  } catch {
    incident["cache_warning"] = "cloud_cache_update_unavailable";
  }
}

function getWorkspaceRoot(dependencies?: CloudArtifactCacheDependencies): string {
  return (dependencies?.cwd ?? process.cwd)();
}

async function pruneExpiredCloudArtifacts(
  dependencies?: CloudArtifactCacheDependencies
): Promise<void> {
  await pruneCloudArtifactCache({ olderThanMs: CLOUD_CACHE_RETENTION_MS }, dependencies);
}

export async function pruneCloudArtifactCache(
  input: { olderThanMs: number },
  dependencies?: CloudArtifactCacheDependencies
): Promise<{ removed: number; retained: number }> {
  const now = (dependencies?.now ?? (() => new Date()))().getTime();
  const [bundleDirectoryCounts, reproductionDirectoryCounts] = await Promise.all([
    pruneExpiredArtifactsInDirectory(
      join(getWorkspaceRoot(dependencies), CLOUD_BUNDLE_DIRECTORY_PATH),
      now,
      input.olderThanMs,
      dependencies
    ),
    pruneExpiredArtifactsInDirectory(
      join(getWorkspaceRoot(dependencies), CLOUD_REPRODUCTION_DIRECTORY_PATH),
      now,
      input.olderThanMs,
      dependencies
    )
  ]);

  return {
    removed: bundleDirectoryCounts.removed + reproductionDirectoryCounts.removed,
    retained: bundleDirectoryCounts.retained + reproductionDirectoryCounts.retained
  };
}

async function pruneExpiredArtifactsInDirectory(
  directoryPath: string,
  now: number,
  olderThanMs: number,
  dependencies?: CloudArtifactCacheDependencies
): Promise<{ removed: number; retained: number }> {
  await checkedCachePath(directoryPath, dependencies);
  const readdir = dependencies?.readdir ?? readdirFromFs;
  const rm = dependencies?.rm ?? rmFromFs;
  const stat = dependencies?.stat ?? statFromFs;

  let fileNames: string[];
  try {
    fileNames = await readdir(directoryPath);
  } catch (error) {
    if (isMissingPathError(error)) {
      return { removed: 0, retained: 0 };
    }

    throw error;
  }

  const counts = await Promise.all(
    fileNames.map(async (fileName) => {
      if (fileName === "reproductions") {
        return { removed: 0, retained: 0 };
      }

      // Only cache-owned artifacts are retention candidates; leave unknown files alone.
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.(bundle|reproduction)\.json$/.test(fileName)) {
        return { removed: 0, retained: 0 };
      }
      const filePath = await checkedCachePath(join(directoryPath, fileName), dependencies);
      let fileStats: { atimeMs: number; mtimeMs: number };

      try {
        fileStats = await stat(filePath);
      } catch (error) {
        if (isMissingPathError(error)) {
          return { removed: 0, retained: 0 };
        }

        throw error;
      }

      const lastAccessedAt = Number.isFinite(fileStats.atimeMs)
        ? fileStats.atimeMs
        : fileStats.mtimeMs;
      if (now - lastAccessedAt <= olderThanMs) {
        return { removed: 0, retained: 1 };
      }

      await checkedCachePath(filePath, dependencies);
      await rm(filePath, { force: true });
      return { removed: 1, retained: 0 };
    })
  );

  return counts.reduce(
    (summary, count) => ({
      removed: summary.removed + count.removed,
      retained: summary.retained + count.retained
    }),
    { removed: 0, retained: 0 }
  );
}

async function updateCachedArtifactStatus(
  filePath: string,
  input: {
    incidentId: string;
    incident: {
      status?: string;
      resolved_at?: string | null;
    };
  },
  dependencies?: CloudArtifactCacheDependencies
): Promise<void> {
  await checkedCachePath(filePath, dependencies);
  let raw: string | undefined;
  let payload: unknown;
  try {
    raw = dependencies?.readFile
      ? await dependencies.readFile(filePath, "utf8")
      : await readManaged(
          getWorkspaceRoot(dependencies),
          relative(getWorkspaceRoot(dependencies), filePath)
        );
    if (raw === undefined) return;
    if (Buffer.byteLength(raw, "utf8") > 512 * 1024) return;
    payload = JSON.parse(raw);
  } catch (error) {
    if (isMissingPathError(error) || error instanceof SyntaxError) {
      return;
    }

    throw error;
  }

  const nextPayload = applyIncidentStatusToPayload(payload, input.incidentId, input.incident);
  await writeCachedFile(
    filePath,
    `${JSON.stringify(safeCachedArtifact(attachSourceToPayload(nextPayload, "cloud")), null, 2)}\n`,
    raw,
    dependencies
  );
}

function applyIncidentStatusToPayload(
  payload: unknown,
  incidentId: string,
  incident: {
    status?: string;
    resolved_at?: string | null;
  }
): unknown {
  if (!isRecord(payload)) {
    return payload;
  }

  const nextPayload: Record<string, unknown> = { ...payload };
  const matchesIncident =
    typeof payload["incident_id"] !== "string" || payload["incident_id"] === incidentId;

  if (matchesIncident && Object.hasOwn(payload, "status") && incident.status !== undefined) {
    nextPayload["status"] = incident.status;
  }

  if (
    matchesIncident &&
    (Object.hasOwn(payload, "resolved_at") || incident.resolved_at !== undefined)
  ) {
    nextPayload["resolved_at"] = incident.resolved_at ?? null;
  }

  if (isRecord(payload["incident"])) {
    nextPayload["incident"] = applyIncidentStatusToPayload(
      payload["incident"],
      incidentId,
      incident
    );
  }

  return nextPayload;
}

async function persistCloudArtifact(
  directoryPath: string,
  fileName: string,
  payload: unknown,
  dependencies?: CloudArtifactCacheDependencies
): Promise<void> {
  if (basename(fileName) !== fileName || fileName.includes("\\"))
    throw new Error("Invalid cache filename.");
  const filePath = await checkedCachePath(join(directoryPath, fileName), dependencies);
  const root = getWorkspaceRoot(dependencies);
  const previous = await readManaged(root, relative(root, filePath));
  await writeCachedFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, previous, dependencies);
}

// Reuse the setup boundary's symlink checks, bounded no-follow reads and atomic
// compare-before-replace writes. Cache paths remain relative to the workspace.
async function checkedCachePath(
  filePath: string,
  dependencies?: CloudArtifactCacheDependencies
): Promise<string> {
  const root = getWorkspaceRoot(dependencies);
  return safePath(root, relative(root, filePath));
}

async function writeCachedFile(
  filePath: string,
  contents: string,
  expected: string | undefined,
  dependencies?: CloudArtifactCacheDependencies
): Promise<void> {
  await checkedCachePath(filePath, dependencies);
  if (dependencies?.writeFile) {
    await dependencies.mkdir?.(dirname(filePath), { recursive: true });
    await checkedCachePath(filePath, dependencies);
    await dependencies.writeFile(filePath, contents, "utf8");
    return;
  }
  const root = getWorkspaceRoot(dependencies);
  await writeManaged(root, relative(root, filePath), contents, expected);
}
