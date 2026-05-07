import { mkdir as mkdirFromFs, readdir as readdirFromFs, rm as rmFromFs, stat as statFromFs } from "node:fs/promises";
import { join } from "node:path";

import { isMissingPathError, resolveWorkspacePath } from "./cli-fs-helpers.js";
import { readLocalState, writeLocalState, type LocalIncidentRecord, type LocalRetrievalStoreDependencies, type LocalState } from "./local-retrieval-store.js";
import { pruneCloudArtifactCache, type CloudArtifactCacheDependencies } from "./cloud-artifact-cache.js";
import type { CliCommandResult } from "./token-commands.js";

type DirectoryReader = (path: string) => Promise<string[]>;
type DirectoryMaker = (path: string, options: { recursive: true }) => Promise<void>;
type FileRemover = (path: string, options: { force: true; recursive?: boolean }) => Promise<void>;
type FileStatReader = (path: string) => Promise<{ mtimeMs: number }>;

type CleanCommandDependencies = LocalRetrievalStoreDependencies &
  CloudArtifactCacheDependencies & {
    mkdir?: DirectoryMaker;
    readdir?: DirectoryReader;
    rm?: FileRemover;
    stat?: FileStatReader;
  };

const LOCAL_EVENTS_DIRECTORY_PATH = ".debugbundle/local/events";
const LOCAL_RELAY_SPOOL_DIRECTORY_PATH = ".debugbundle/local/browser-relay-spool";
const LOCAL_BUNDLE_DIRECTORY_PATH = ".debugbundle/bundles/local";
const LOCAL_REPRODUCTION_DIRECTORY_PATH = ".debugbundle/bundles/local/reproductions";
const CLOUD_BUNDLE_DIRECTORY_PATH = ".debugbundle/bundles/cloud";
const CLOUD_REPRODUCTION_DIRECTORY_PATH = ".debugbundle/bundles/cloud/reproductions";
const DEFAULT_PROCESSED_EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_RELAY_SPOOL_DELIVERED_RETENTION_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RELAY_SPOOL_UNDELIVERED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_CLOUD_CACHE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const LOCAL_INCIDENT_RETENTION_LIMIT = 50;
const RELAY_SPOOL_DELIVERED_MARKER_SUFFIX = ".delivered";

type CleanSummary = {
  status: "ok";
  processed_event_files_removed: number;
  processed_event_files_retained: number;
  relay_spool_files_removed: number;
  relay_spool_files_retained: number;
  cloud_cache_files_removed: number;
  cloud_cache_files_retained: number;
  local_incidents_removed: number;
  local_incidents_retained: number;
  reset_applied?: true;
};

function formatCleanOutput(summary: CleanSummary): string {
  return [
    "DebugBundle clean report.",
    `Status: ${summary.status}`,
    `Processed event files removed: ${summary.processed_event_files_removed}`,
    `Processed event files retained: ${summary.processed_event_files_retained}`,
    `Relay spool files removed: ${summary.relay_spool_files_removed}`,
    `Relay spool files retained: ${summary.relay_spool_files_retained}`,
    `Cloud cache files removed: ${summary.cloud_cache_files_removed}`,
    `Cloud cache files retained: ${summary.cloud_cache_files_retained}`,
    `Local incidents removed: ${summary.local_incidents_removed}`,
    `Local incidents retained: ${summary.local_incidents_retained}`,
    ...(summary.reset_applied === true ? ["Runtime reset applied: true"] : [])
  ].join("\n");
}

function parseOlderThan(value: string): number | null {
  const match = /^(\d+)d$/.exec(value);
  if (match === null) {
    return null;
  }

  return Number.parseInt(match[1]!, 10) * 24 * 60 * 60 * 1000;
}

async function cleanProcessedEventFiles(
  input: { removeAllProcessed: boolean; now: Date },
  dependencies: CleanCommandDependencies
): Promise<{ removed: number; retained: number }> {
  const readdir = dependencies.readdir ?? readdirFromFs;
  const rm = dependencies.rm ?? rmFromFs;
  const stat = dependencies.stat ?? statFromFs;
  const rootDirectory = (dependencies.cwd ?? process.cwd)();
  const eventsDirectoryPath = join(rootDirectory, LOCAL_EVENTS_DIRECTORY_PATH);
  const state = await readLocalState(dependencies);
  const lastProcessedEventFile = state.last_processed_event_file;

  let eventFileNames: string[];
  try {
    eventFileNames = (await readdir(eventsDirectoryPath)).filter((fileName) => fileName.endsWith(".events.json")).sort();
  } catch (error) {
    if (isMissingPathError(error)) {
      return { removed: 0, retained: 0 };
    }

    throw error;
  }

  let removed = 0;
  let retained = 0;
  for (const fileName of eventFileNames) {
    const isProcessed = lastProcessedEventFile !== null && fileName <= lastProcessedEventFile;
    if (!isProcessed) {
      retained += 1;
      continue;
    }

    if (!input.removeAllProcessed) {
      const fileStats = await stat(join(eventsDirectoryPath, fileName));
      if (input.now.getTime() - fileStats.mtimeMs <= DEFAULT_PROCESSED_EVENT_RETENTION_MS) {
        retained += 1;
        continue;
      }
    }

    await rm(join(eventsDirectoryPath, fileName), { force: true });
    removed += 1;
  }

  return { removed, retained };
}

async function cleanRelaySpoolFiles(
  input: { now: Date },
  dependencies: CleanCommandDependencies
): Promise<{ removed: number; retained: number }> {
  const readdir = dependencies.readdir ?? readdirFromFs;
  const rm = dependencies.rm ?? rmFromFs;
  const stat = dependencies.stat ?? statFromFs;
  const rootDirectory = (dependencies.cwd ?? process.cwd)();
  const spoolDirectoryPath = join(rootDirectory, LOCAL_RELAY_SPOOL_DIRECTORY_PATH);

  let spoolFileNames: string[];
  try {
    spoolFileNames = (await readdir(spoolDirectoryPath)).filter((fileName) => fileName.endsWith(".events.json")).sort();
  } catch (error) {
    if (isMissingPathError(error)) {
      return { removed: 0, retained: 0 };
    }

    throw error;
  }

  let removed = 0;
  let retained = 0;

  for (const fileName of spoolFileNames) {
    const spoolFilePath = join(spoolDirectoryPath, fileName);
    const deliveredMarkerPath = `${spoolFilePath}${RELAY_SPOOL_DELIVERED_MARKER_SUFFIX}`;

    const spoolFileStats = await stat(spoolFilePath);

    let deliveredMarkerMtimeMs: number | null = null;
    try {
      deliveredMarkerMtimeMs = (await stat(deliveredMarkerPath)).mtimeMs;
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error;
      }
    }

    const retentionMs =
      deliveredMarkerMtimeMs === null
        ? DEFAULT_RELAY_SPOOL_UNDELIVERED_RETENTION_MS
        : DEFAULT_RELAY_SPOOL_DELIVERED_RETENTION_MS;
    const ageBaseMs = deliveredMarkerMtimeMs ?? spoolFileStats.mtimeMs;

    if (input.now.getTime() - ageBaseMs <= retentionMs) {
      retained += 1;
      continue;
    }

    await rm(spoolFilePath, { force: true });
    if (deliveredMarkerMtimeMs !== null) {
      await rm(deliveredMarkerPath, { force: true });
    }
    removed += 1;
  }

  return { removed, retained };
}

function sortLocalIncidentRemovalPriority(left: LocalIncidentRecord, right: LocalIncidentRecord): number {
  if (left.status !== right.status) {
    return left.status === "resolved" ? -1 : 1;
  }

  const bySeenAt = left.last_seen_at.localeCompare(right.last_seen_at);
  if (bySeenAt !== 0) {
    return bySeenAt;
  }

  return left.incident_id.localeCompare(right.incident_id);
}

async function applyLocalIncidentRetention(
  dependencies: CleanCommandDependencies
): Promise<{ removed: number; retained: number }> {
  const rm = dependencies.rm ?? rmFromFs;
  const rootDirectory = (dependencies.cwd ?? process.cwd)();
  const state = await readLocalState(dependencies);
  const incidents = Object.values(state.incidents);

  if (incidents.length <= LOCAL_INCIDENT_RETENTION_LIMIT) {
    return {
      removed: 0,
      retained: incidents.length
    };
  }

  const incidentsToRemove = incidents
    .slice()
    .sort(sortLocalIncidentRemovalPriority)
    .slice(0, incidents.length - LOCAL_INCIDENT_RETENTION_LIMIT);
  const nextIncidents = { ...state.incidents };

  for (const incident of incidentsToRemove) {
    delete nextIncidents[incident.incident_id];
    await rm(resolveWorkspacePath(rootDirectory, incident.bundle_path), { force: true });
    await rm(resolveWorkspacePath(rootDirectory, incident.reproduction_path), { force: true });
  }

  await writeLocalState(
    {
      ...state,
      incidents: nextIncidents
    },
    dependencies
  );

  return {
    removed: incidentsToRemove.length,
    retained: Object.keys(nextIncidents).length
  };
}

async function countLocalIncidents(dependencies: CleanCommandDependencies): Promise<number> {
  return Object.keys((await readLocalState(dependencies)).incidents).length;
}

async function countDirectoryFiles(directoryPath: string, dependencies: CleanCommandDependencies, extension: string): Promise<number> {
  const readdir = dependencies.readdir ?? readdirFromFs;
  const rootDirectory = (dependencies.cwd ?? process.cwd)();

  try {
    return (await readdir(join(rootDirectory, directoryPath))).filter((fileName) => fileName.endsWith(extension)).length;
  } catch (error) {
    if (isMissingPathError(error)) {
      return 0;
    }

    throw error;
  }
}

async function countCloudArtifactFiles(dependencies: CleanCommandDependencies): Promise<number> {
  return (
    await countDirectoryFiles(CLOUD_BUNDLE_DIRECTORY_PATH, dependencies, ".json")
  ) + (
    await countDirectoryFiles(CLOUD_REPRODUCTION_DIRECTORY_PATH, dependencies, ".json")
  );
}

async function countRelaySpoolEventFiles(dependencies: CleanCommandDependencies): Promise<number> {
  return countDirectoryFiles(LOCAL_RELAY_SPOOL_DIRECTORY_PATH, dependencies, ".events.json");
}

async function resetRuntimeData(
  dependencies: CleanCommandDependencies
): Promise<{
  processedEvents: { removed: number; retained: number };
  relaySpool: { removed: number; retained: number };
  cloudCache: { removed: number; retained: number };
  localIncidents: { removed: number; retained: number };
}> {
  const mkdir = dependencies.mkdir ?? mkdirFromFs;
  const rm = dependencies.rm ?? rmFromFs;
  const rootDirectory = (dependencies.cwd ?? process.cwd)();
  const [processedEventFilesRemoved, relaySpoolFilesRemoved, cloudCacheFilesRemoved, localIncidentCount] = await Promise.all([
    countProcessedAndUnprocessedEventFiles(dependencies),
    countRelaySpoolEventFiles(dependencies),
    countCloudArtifactFiles(dependencies),
    countLocalIncidents(dependencies)
  ]);

  await rm(join(rootDirectory, LOCAL_EVENTS_DIRECTORY_PATH), { force: true, recursive: true });
  await rm(join(rootDirectory, LOCAL_RELAY_SPOOL_DIRECTORY_PATH), { force: true, recursive: true });
  await rm(join(rootDirectory, LOCAL_BUNDLE_DIRECTORY_PATH), { force: true, recursive: true });
  await rm(join(rootDirectory, CLOUD_BUNDLE_DIRECTORY_PATH), { force: true, recursive: true });

  await Promise.all([
    mkdir(join(rootDirectory, LOCAL_EVENTS_DIRECTORY_PATH), { recursive: true }),
    mkdir(join(rootDirectory, LOCAL_RELAY_SPOOL_DIRECTORY_PATH), { recursive: true }),
    mkdir(join(rootDirectory, LOCAL_REPRODUCTION_DIRECTORY_PATH), { recursive: true }),
    mkdir(join(rootDirectory, CLOUD_REPRODUCTION_DIRECTORY_PATH), { recursive: true })
  ]);

  const nextState: LocalState = {
    version: 1,
    last_processed_event_file: null,
    incidents: {}
  };
  await writeLocalState(nextState, dependencies);

  return {
    processedEvents: { removed: processedEventFilesRemoved, retained: 0 },
    relaySpool: { removed: relaySpoolFilesRemoved, retained: 0 },
    cloudCache: { removed: cloudCacheFilesRemoved, retained: 0 },
    localIncidents: { removed: localIncidentCount, retained: 0 }
  };
}

export async function cleanCommand(
  input: {
    events?: boolean;
    bundles?: boolean;
    all?: boolean;
    olderThan?: string;
    json?: boolean;
  },
  dependencies: CleanCommandDependencies = {}
): Promise<CliCommandResult> {
  if (input.olderThan !== undefined && input.bundles !== true) {
    return {
      exitCode: 4,
      output: "--older-than requires --bundles."
    };
  }

  const bundleRetentionMs = input.olderThan === undefined ? DEFAULT_CLOUD_CACHE_RETENTION_MS : parseOlderThan(input.olderThan);
  if (input.olderThan !== undefined && bundleRetentionMs === null) {
    return {
      exitCode: 4,
      output: "Invalid value for --older-than."
    };
  }

  const hasEventsFlag = input.events === true;
  const hasBundlesFlag = input.bundles === true;
  const hasAllFlag = input.all === true;
  const runEventsCleanup = hasEventsFlag || (!hasEventsFlag && !hasBundlesFlag);
  const runBundleCleanup = hasBundlesFlag || (!hasEventsFlag && !hasBundlesFlag);
  const runLocalIncidentCleanup = !hasAllFlag && !hasEventsFlag && !hasBundlesFlag;
  const now = (dependencies.now ?? (() => new Date()))();

  if (hasAllFlag) {
    const resetSummary = await resetRuntimeData(dependencies);
    const summary: CleanSummary = {
      status: "ok",
      processed_event_files_removed: resetSummary.processedEvents.removed,
      processed_event_files_retained: 0,
      relay_spool_files_removed: resetSummary.relaySpool.removed,
      relay_spool_files_retained: 0,
      cloud_cache_files_removed: resetSummary.cloudCache.removed,
      cloud_cache_files_retained: 0,
      local_incidents_removed: resetSummary.localIncidents.removed,
      local_incidents_retained: 0,
      reset_applied: true
    };

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(summary) : formatCleanOutput(summary)
    };
  }

  const processedEvents = runEventsCleanup
    ? await cleanProcessedEventFiles({ removeAllProcessed: input.events === true, now }, dependencies)
    : { removed: 0, retained: await countProcessedAndUnprocessedEventFiles(dependencies) };
  const relaySpool = await cleanRelaySpoolFiles({ now }, dependencies);
  const cloudCache = runBundleCleanup
    ? await pruneCloudArtifactCache({ olderThanMs: bundleRetentionMs ?? DEFAULT_CLOUD_CACHE_RETENTION_MS }, { ...dependencies, now: () => now })
    : await countCloudArtifactCache(dependencies);
  const localIncidents = runLocalIncidentCleanup
    ? await applyLocalIncidentRetention(dependencies)
    : { removed: 0, retained: await countLocalIncidents(dependencies) };

  const summary: CleanSummary = {
    status: "ok",
    processed_event_files_removed: processedEvents.removed,
    processed_event_files_retained: processedEvents.retained,
    relay_spool_files_removed: relaySpool.removed,
    relay_spool_files_retained: relaySpool.retained,
    cloud_cache_files_removed: cloudCache.removed,
    cloud_cache_files_retained: cloudCache.retained,
    local_incidents_removed: localIncidents.removed,
    local_incidents_retained: localIncidents.retained
  };

  return {
    exitCode: 0,
    output: input.json ? JSON.stringify(summary) : formatCleanOutput(summary)
  };
}

async function countProcessedAndUnprocessedEventFiles(dependencies: CleanCommandDependencies): Promise<number> {
  const readdir = dependencies.readdir ?? readdirFromFs;
  const rootDirectory = (dependencies.cwd ?? process.cwd)();

  try {
    return (await readdir(join(rootDirectory, LOCAL_EVENTS_DIRECTORY_PATH))).filter((fileName) => fileName.endsWith(".events.json")).length;
  } catch (error) {
    if (isMissingPathError(error)) {
      return 0;
    }

    throw error;
  }
}

async function countCloudArtifactCache(
  dependencies: CleanCommandDependencies
): Promise<{ removed: number; retained: number }> {
  return pruneCloudArtifactCache({ olderThanMs: Number.MAX_SAFE_INTEGER }, { ...dependencies, now: () => new Date(0) });
}