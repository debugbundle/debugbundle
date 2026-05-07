import {
  mkdir as mkdirFromFs,
  readFile as readFileFromFs,
  readdir as readdirFromFs,
  rm as rmFromFs,
  stat as statFromFs,
  writeFile as writeFileFromFs
} from "node:fs/promises";
import { join } from "node:path";

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

export async function cacheCloudBundleArtifact(
  input: { incidentId: string; bundle: unknown },
  dependencies?: CloudArtifactCacheDependencies
): Promise<unknown> {
  await pruneExpiredCloudArtifacts(dependencies);

  const bundle = attachSourceToPayload(input.bundle, "cloud");

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
  await pruneExpiredCloudArtifacts(dependencies);

  const reproduction = attachSourceToPayload(input.reproduction, "cloud");

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
  await pruneExpiredCloudArtifacts(dependencies);

  await Promise.all([
    updateCachedArtifactStatus(
      join(getWorkspaceRoot(dependencies), CLOUD_BUNDLE_DIRECTORY_PATH, `${input.incidentId}.bundle.json`),
      input,
      dependencies
    ),
    updateCachedArtifactStatus(
      join(getWorkspaceRoot(dependencies), CLOUD_REPRODUCTION_DIRECTORY_PATH, `${input.incidentId}.reproduction.json`),
      input,
      dependencies
    )
  ]);
}

function getWorkspaceRoot(dependencies?: CloudArtifactCacheDependencies): string {
  return (dependencies?.cwd ?? process.cwd)();
}

async function pruneExpiredCloudArtifacts(dependencies?: CloudArtifactCacheDependencies): Promise<void> {
  await pruneCloudArtifactCache({ olderThanMs: CLOUD_CACHE_RETENTION_MS }, dependencies);
}

export async function pruneCloudArtifactCache(
  input: { olderThanMs: number },
  dependencies?: CloudArtifactCacheDependencies
): Promise<{ removed: number; retained: number }> {
  const now = (dependencies?.now ?? (() => new Date()))().getTime();
  const [bundleDirectoryCounts, reproductionDirectoryCounts] = await Promise.all([
    pruneExpiredArtifactsInDirectory(join(getWorkspaceRoot(dependencies), CLOUD_BUNDLE_DIRECTORY_PATH), now, input.olderThanMs, dependencies),
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

      const filePath = join(directoryPath, fileName);
      let fileStats: { atimeMs: number; mtimeMs: number };

      try {
        fileStats = await stat(filePath);
      } catch (error) {
        if (isMissingPathError(error)) {
          return { removed: 0, retained: 0 };
        }

        throw error;
      }

      const lastAccessedAt = Number.isFinite(fileStats.atimeMs) ? fileStats.atimeMs : fileStats.mtimeMs;
      if (now - lastAccessedAt <= olderThanMs) {
        return { removed: 0, retained: 1 };
      }

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
  const readFile = dependencies?.readFile ?? readFileFromFs;
  const writeFile = dependencies?.writeFile ?? writeFileFromFs;

  let payload: unknown;
  try {
    payload = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (isMissingPathError(error) || error instanceof SyntaxError) {
      return;
    }

    throw error;
  }

  const nextPayload = applyIncidentStatusToPayload(payload, input.incidentId, input.incident);
  await writeFile(filePath, `${JSON.stringify(attachSourceToPayload(nextPayload, "cloud"), null, 2)}\n`, "utf8");
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
  const matchesIncident = typeof payload["incident_id"] !== "string" || payload["incident_id"] === incidentId;

  if (matchesIncident && Object.hasOwn(payload, "status") && incident.status !== undefined) {
    nextPayload["status"] = incident.status;
  }

  if (matchesIncident && (Object.hasOwn(payload, "resolved_at") || incident.resolved_at !== undefined)) {
    nextPayload["resolved_at"] = incident.resolved_at ?? null;
  }

  if (isRecord(payload["incident"])) {
    nextPayload["incident"] = applyIncidentStatusToPayload(payload["incident"], incidentId, incident);
  }

  return nextPayload;
}

async function persistCloudArtifact(
  directoryPath: string,
  fileName: string,
  payload: unknown,
  dependencies?: CloudArtifactCacheDependencies
): Promise<void> {
  const mkdir = dependencies?.mkdir ?? mkdirFromFs;
  const writeFile = dependencies?.writeFile ?? writeFileFromFs;

  await mkdir(directoryPath, { recursive: true });
  await writeFile(join(directoryPath, fileName), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}