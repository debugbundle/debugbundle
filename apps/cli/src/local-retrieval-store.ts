import { readFile as readFileFromFs, writeFile as writeFileToFs } from "node:fs/promises";
import { join } from "node:path";

import { RetrievalApiError } from "../../../packages/retrieval-client/src/index.js";
import {
  deriveIncidentReasonFromSignal,
  deriveIncidentReasonFromSourceEventTypes,
  type IncidentReason
} from "../../../packages/storage/src/index.js";
import { isRecord, resolveWorkspacePath } from "./cli-fs-helpers.js";

type FileReader = (path: string, encoding: BufferEncoding) => Promise<string>;
type FileWriter = (path: string, contents: string, encoding: BufferEncoding) => Promise<void>;

export type LocalRetrievalStoreDependencies = {
  cwd?: () => string;
  readFile?: FileReader;
  writeFile?: FileWriter;
};

type LocalConnection = {
  mode: "local-only" | "connected";
};

export type LocalIncidentRecord = {
  incident_id: string;
  source: "local";
  project_id: string;
  service_id: string;
  service_name: string;
  service_runtime: string | null;
  service_framework: string | null;
  environment: string;
  fingerprint: string;
  fingerprint_version: string;
  title: string;
  severity: string;
  status: "open" | "resolved";
  resolved_at?: string | null;
  regressed_at?: string | null;
  first_seen_at: string;
  last_seen_at: string;
  occurrence_count: number;
  source_event_id: string;
  source_occurred_at: string;
  source_event_types: string[];
  matched_fields: string[];
  incident_reason?: IncidentReason;
  bundle_path: string;
  reproduction_path: string;
  generation_number: number;
};

export type LocalState = {
  version: 1;
  last_processed_event_file: string | null;
  incidents: Record<string, LocalIncidentRecord>;
};

const CONNECTION_FILE_PATH = ".debugbundle/local/connection.json";
const STATE_FILE_PATH = ".debugbundle/local/state.json";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function createReadError(status: number, code: string): RetrievalApiError {
  return new RetrievalApiError(status, code);
}

async function readJsonFile(path: string, dependencies?: LocalRetrievalStoreDependencies): Promise<unknown> {
  const readFile = dependencies?.readFile ?? readFileFromFs;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (isRecord(error) && error["code"] === "ENOENT") {
      throw error;
    }

    throw createReadError(400, "invalid_local_json");
  }
}

function parseLocalConnection(candidate: unknown): LocalConnection {
  if (!isRecord(candidate) || (candidate["mode"] !== "local-only" && candidate["mode"] !== "connected")) {
    throw createReadError(400, "invalid_local_connection_config");
  }

  return {
    mode: candidate["mode"]
  };
}

function parseLocalIncident(candidate: unknown): LocalIncidentRecord {
  if (!isRecord(candidate)) {
    throw createReadError(400, "invalid_local_state");
  }

  const requiredStringFields = [
    "incident_id",
    "project_id",
    "service_id",
    "service_name",
    "environment",
    "fingerprint",
    "fingerprint_version",
    "title",
    "severity",
    "first_seen_at",
    "last_seen_at",
    "source_event_id",
    "source_occurred_at",
    "bundle_path",
    "reproduction_path"
  ] as const;

  for (const field of requiredStringFields) {
    if (typeof candidate[field] !== "string") {
      throw createReadError(400, "invalid_local_state");
    }
  }

  if (candidate["source"] !== "local") {
    throw createReadError(400, "invalid_local_state");
  }
  if (candidate["status"] !== "open" && candidate["status"] !== "resolved") {
    throw createReadError(400, "invalid_local_state");
  }
  const resolvedAt = candidate["resolved_at"];
  const regressedAt = candidate["regressed_at"];
  if (resolvedAt !== undefined && resolvedAt !== null && typeof resolvedAt !== "string") {
    throw createReadError(400, "invalid_local_state");
  }
  if (regressedAt !== undefined && regressedAt !== null && typeof regressedAt !== "string") {
    throw createReadError(400, "invalid_local_state");
  }
  if (typeof candidate["occurrence_count"] !== "number" || typeof candidate["generation_number"] !== "number") {
    throw createReadError(400, "invalid_local_state");
  }
  if (!isStringArray(candidate["source_event_types"]) || !isStringArray(candidate["matched_fields"])) {
    throw createReadError(400, "invalid_local_state");
  }

  const serviceRuntime = candidate["service_runtime"];
  const serviceFramework = candidate["service_framework"];
  const incidentReason = candidate["matched_fields"].includes("request_anomaly")
    ? deriveIncidentReasonFromSignal({
        event_type: "request_event",
        event_class: "incident_signal",
        request_anomaly: true
      })
    : deriveIncidentReasonFromSourceEventTypes(candidate["source_event_types"]);
  if (serviceRuntime !== null && typeof serviceRuntime !== "string") {
    throw createReadError(400, "invalid_local_state");
  }
  if (serviceFramework !== null && typeof serviceFramework !== "string") {
    throw createReadError(400, "invalid_local_state");
  }

  return {
    incident_id: candidate["incident_id"] as string,
    source: "local",
    project_id: candidate["project_id"] as string,
    service_id: candidate["service_id"] as string,
    service_name: candidate["service_name"] as string,
    service_runtime: serviceRuntime,
    service_framework: serviceFramework,
    environment: candidate["environment"] as string,
    fingerprint: candidate["fingerprint"] as string,
    fingerprint_version: candidate["fingerprint_version"] as string,
    title: candidate["title"] as string,
    severity: candidate["severity"] as string,
    status: candidate["status"],
    ...(resolvedAt === undefined ? {} : { resolved_at: resolvedAt }),
    ...(regressedAt === undefined ? {} : { regressed_at: regressedAt }),
    first_seen_at: candidate["first_seen_at"] as string,
    last_seen_at: candidate["last_seen_at"] as string,
    occurrence_count: candidate["occurrence_count"],
    source_event_id: candidate["source_event_id"] as string,
    source_occurred_at: candidate["source_occurred_at"] as string,
    source_event_types: [...candidate["source_event_types"]],
    matched_fields: [...candidate["matched_fields"]],
    ...(incidentReason === null ? {} : { incident_reason: incidentReason }),
    bundle_path: candidate["bundle_path"] as string,
    reproduction_path: candidate["reproduction_path"] as string,
    generation_number: candidate["generation_number"]
  };
}

function parseLocalState(candidate: unknown): LocalState {
  if (!isRecord(candidate) || candidate["version"] !== 1 || !isRecord(candidate["incidents"])) {
    throw createReadError(400, "invalid_local_state");
  }

  const incidents = Object.fromEntries(
    Object.entries(candidate["incidents"]).map(([incidentId, incident]) => [incidentId, parseLocalIncident(incident)])
  );

  const lastProcessedEventFile = candidate["last_processed_event_file"];
  if (lastProcessedEventFile !== null && typeof lastProcessedEventFile !== "string") {
    throw createReadError(400, "invalid_local_state");
  }

  return {
    version: 1,
    last_processed_event_file: lastProcessedEventFile,
    incidents
  };
}

function getWorkspaceRoot(dependencies?: LocalRetrievalStoreDependencies): string {
  return (dependencies?.cwd ?? process.cwd)();
}

function getStateFilePath(rootDirectory: string): string {
  return join(rootDirectory, STATE_FILE_PATH);
}

function buildCursor(incident: LocalIncidentRecord): string {
  return `${incident.last_seen_at}|${incident.incident_id}`;
}

function sortIncidentsDescending(left: LocalIncidentRecord, right: LocalIncidentRecord): number {
  const bySeenAt = right.last_seen_at.localeCompare(left.last_seen_at);
  if (bySeenAt !== 0) {
    return bySeenAt;
  }

  return right.incident_id.localeCompare(left.incident_id);
}

export async function readLocalConnectionConfig(
  dependencies?: LocalRetrievalStoreDependencies
): Promise<LocalConnection | null> {
  const rootDirectory = getWorkspaceRoot(dependencies);
  try {
    return parseLocalConnection(await readJsonFile(join(rootDirectory, CONNECTION_FILE_PATH), dependencies));
  } catch (error) {
    if (isRecord(error) && error["code"] === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function readLocalState(dependencies?: LocalRetrievalStoreDependencies): Promise<LocalState> {
  const rootDirectory = getWorkspaceRoot(dependencies);
  try {
    return parseLocalState(await readJsonFile(getStateFilePath(rootDirectory), dependencies));
  } catch (error) {
    if (isRecord(error) && error["code"] === "ENOENT") {
      return {
        version: 1,
        last_processed_event_file: null,
        incidents: {}
      };
    }

    if (error instanceof RetrievalApiError && error.code === "invalid_local_json") {
      throw createReadError(400, "invalid_local_state");
    }

    throw error;
  }
}

export async function writeLocalState(state: LocalState, dependencies?: LocalRetrievalStoreDependencies): Promise<void> {
  const rootDirectory = getWorkspaceRoot(dependencies);
  const writeFile = dependencies?.writeFile ?? writeFileToFs;
  await writeFile(getStateFilePath(rootDirectory), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function updateLocalIncidentStatus(
  input: { incidentId: string; status: "open" | "resolved" },
  dependencies?: LocalRetrievalStoreDependencies
): Promise<LocalIncidentRecord> {
  const state = await readLocalState(dependencies);
  const incident = state.incidents[input.incidentId];
  if (incident === undefined) {
    throw createReadError(404, "incident_not_found");
  }

  const nextIncident: LocalIncidentRecord = {
    ...incident,
    status: input.status,
    ...(input.status === "resolved" ? { resolved_at: new Date().toISOString() } : { resolved_at: null })
  };

  state.incidents[input.incidentId] = nextIncident;
  await writeLocalState(state, dependencies);
  return nextIncident;
}

export async function listLocalIncidents(
  input: {
    projectId?: string;
    environment?: string;
    service?: string;
    status?: string;
    severity?: string;
    firstSeenAfter?: string;
    attentionAfter?: string;
    cursor?: string;
    limit?: number;
  },
  dependencies?: LocalRetrievalStoreDependencies
): Promise<{ incidents: LocalIncidentRecord[]; next_cursor: string | null }> {
  const incidents = Object.values((await readLocalState(dependencies)).incidents)
    .filter((incident) => (input.projectId === undefined ? true : incident.project_id === input.projectId))
    .filter((incident) => (input.environment === undefined ? true : incident.environment === input.environment))
    .filter((incident) => (input.service === undefined ? true : incident.service_name === input.service))
    .filter((incident) => {
      if (input.status === undefined || input.status === "all") {
        return true;
      }
      if (input.status === "active") {
        return incident.status === "open";
      }

      return incident.status === input.status;
    })
    .filter((incident) => (input.severity === undefined ? true : incident.severity === input.severity))
    .filter((incident) => (input.firstSeenAfter === undefined ? true : incident.first_seen_at >= input.firstSeenAfter))
    .filter((incident) => {
      if (input.attentionAfter === undefined) {
        return true;
      }

      return incident.first_seen_at >= input.attentionAfter || (incident.regressed_at != null && incident.regressed_at >= input.attentionAfter);
    })
    .sort(sortIncidentsDescending);

  const startIndex = input.cursor === undefined ? 0 : incidents.findIndex((incident) => buildCursor(incident) === input.cursor) + 1;
  const pagedIncidents = input.limit === undefined ? incidents.slice(startIndex) : incidents.slice(startIndex, startIndex + input.limit);
  const hasMore = input.limit !== undefined && startIndex + input.limit < incidents.length;

  return {
    incidents: pagedIncidents,
    next_cursor: hasMore && pagedIncidents.length > 0 ? buildCursor(pagedIncidents[pagedIncidents.length - 1]!) : null
  };
}

export async function getLocalIncident(
  input: { incidentId: string },
  dependencies?: LocalRetrievalStoreDependencies
): Promise<LocalIncidentRecord> {
  const incident = (await readLocalState(dependencies)).incidents[input.incidentId];
  if (incident === undefined) {
    throw createReadError(404, "incident_not_found");
  }

  return incident;
}

export async function getLocalBundle(
  input: { incidentId: string },
  dependencies?: LocalRetrievalStoreDependencies
): Promise<unknown> {
  const rootDirectory = getWorkspaceRoot(dependencies);
  const incident = await getLocalIncident(input, dependencies);
  try {
    return await readJsonFile(resolveWorkspacePath(rootDirectory, incident.bundle_path), dependencies);
  } catch (error) {
    if (isRecord(error) && error["code"] === "ENOENT") {
      throw createReadError(404, "bundle_not_found");
    }

    if (error instanceof RetrievalApiError && error.code === "invalid_local_json") {
      throw createReadError(400, "invalid_local_bundle_artifact");
    }

    throw error;
  }
}

export async function getLocalReproduction(
  input: { incidentId: string },
  dependencies?: LocalRetrievalStoreDependencies
): Promise<unknown> {
  const rootDirectory = getWorkspaceRoot(dependencies);
  const incident = await getLocalIncident(input, dependencies);
  try {
    return await readJsonFile(resolveWorkspacePath(rootDirectory, incident.reproduction_path), dependencies);
  } catch (error) {
    if (isRecord(error) && error["code"] === "ENOENT") {
      throw createReadError(404, "reproduction_not_found");
    }

    if (error instanceof RetrievalApiError && error.code === "invalid_local_json") {
      throw createReadError(400, "invalid_local_reproduction_artifact");
    }

    throw error;
  }
}

export async function resolveLocalIncident(
  input: { incidentId: string },
  dependencies?: LocalRetrievalStoreDependencies
): Promise<LocalIncidentRecord> {
  return updateLocalIncidentStatus({ incidentId: input.incidentId, status: "resolved" }, dependencies);
}

export async function reopenLocalIncident(
  input: { incidentId: string },
  dependencies?: LocalRetrievalStoreDependencies
): Promise<LocalIncidentRecord> {
  return updateLocalIncidentStatus({ incidentId: input.incidentId, status: "open" }, dependencies);
}
