import { RetrievalApiError, formatMutationOutcomeError } from "../../../packages/retrieval-client/src/index.js";
import { sanitizeTelemetry } from "../../../packages/redaction/src/index.js";
import {
  buildIncidentContextRecord,
  type IncidentContextArtifactRecord,
  type IncidentContextRecord,
  type IncidentReason
} from "../../../packages/storage/src/index.js";
import {
  createAuthenticatedRetrievalApi,
  mapCliAuthErrorToResult,
  runAuthenticatedCliCommand
} from "./auth-context.js";
import type { CloudArtifactCacheDependencies } from "./cloud-artifact-cache.js";
import {
  getLocalBundle,
  getLocalIncident,
  getLocalReproduction,
  listLocalIncidents,
  readLocalConnectionConfig,
  type LocalRetrievalStoreDependencies
} from "./local-retrieval-store.js";
import {
  attachSourceToIncidentContext,
  attachSourceToRecord,
  isNotFoundRetrievalError,
  paginateIncidents,
  type RetrievalSource
} from "./retrieval-source.js";
import type { CliCommandResult } from "./token-commands.js";

export interface IncidentLike {
  incident_id: string;
  title: string;
  severity: string;
  status: string;
  occurrence_count?: number;
  environment?: string;
  resolved_at?: string | null | undefined;
  last_seen_at?: string;
  source?: RetrievalSource;
  incident_reason?: IncidentReason | undefined;
  cache_warning?: string;
}

export interface LogLike {
  event_id: string;
  event_type: string;
  occurred_at: string;
  is_sampled: boolean;
  level: string | null;
}

export function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof RetrievalApiError)) {
    return 1;
  }

  if (error.status === 401) {
    return 2;
  }

  if (error.status === 404) {
    return 3;
  }

  if (error.status === 400) {
    return 4;
  }

  return 1;
}

export function formatRetrievalErrorOutput(error: unknown, json?: boolean): string {
  const mutationOutput = formatMutationOutcomeError(error, json);
  if (mutationOutput !== null) return mutationOutput;
  let message: string;
  try {
    message = safeEvidence(error instanceof Error ? error.message : String(error));
  } catch {
    message = "retrieval_unavailable";
  }
  if (error instanceof RetrievalApiError && error.status === 200 && error.code === "invalid_response_shape") {
    return [
      message,
      "The API returned HTTP success, but the client could not validate the response. Check the CLI and Node.js versions; this does not establish an API outage."
    ].join("\n");
  }

  return message;
}

function safeEvidence<T>(value: T): T {
  const protectedValue = sanitizeTelemetry(value, { maxTotalBytes: 512 * 1024 });
  if (!protectedValue.ok) throw new RetrievalApiError(503, "privacy_projection_unavailable");
  return protectedValue.value as T;
}

export function safeJsonStringify(value: unknown): string {
  return JSON.stringify(safeEvidence(value));
}

export function formatIncidentTable(incidents: IncidentLike[]): string {
  incidents = safeEvidence(incidents);
  if (incidents.length === 0) {
    return "No incidents found.";
  }

  const showSource = incidents.some((incident) => incident.source !== undefined);

  return incidents
    .map((incident) => {
      const sourcePrefix = showSource ? `${incident.source ?? "unknown"} | ` : "";
      return `${sourcePrefix}${incident.incident_id} | ${incident.severity} | ${incident.status} | ${incident.title}${incident.cache_warning === undefined ? "" : " | Cloud change confirmed; local cache unavailable."}`;
    })
    .join("\n");
}

export function formatIncidentDetail(incident: IncidentLike): string {
  incident = safeEvidence(incident);
  return [
    `Incident: ${incident.incident_id}`,
    ...(incident.source === undefined ? [] : [`Source: ${incident.source}`]),
    `Title: ${incident.title}`,
    ...(incident.cache_warning === undefined ? [] : ["Cloud change confirmed; local cache unavailable. Refresh the cached evidence before using it."]),
    `Severity: ${incident.severity}`,
    `Status: ${incident.status}`,
    `Environment: ${incident.environment ?? "unknown"}`,
    `Occurrences: ${incident.occurrence_count ?? 0}`,
    ...(incident.incident_reason === undefined
      ? []
      : [
          `Reason: ${incident.incident_reason.kind}`,
          `Why: ${incident.incident_reason.description}`
        ]),
    ...(incident.resolved_at !== undefined && incident.resolved_at !== null ? [`Resolved at: ${incident.resolved_at}`] : [])
  ].join("\n");
}

export function formatObjectOutput(payload: unknown): string {
  return JSON.stringify(safeEvidence(payload), null, 2);
}

export function readIncidentIdsInput(input: { incidentId?: string; incidentIds?: string[] }): string[] {
  if (Array.isArray(input.incidentIds) && input.incidentIds.length > 0) {
    return input.incidentIds;
  }

  if (typeof input.incidentId === "string" && input.incidentId.length > 0) {
    return [input.incidentId];
  }

  return [];
}

function formatIncidentContextDetail(context: IncidentContextRecord): string {
  context = safeEvidence(context);
  const incidentSource = context.incident["source"];
  const visibility = typeof context.visibility === "object" && context.visibility !== null && !Array.isArray(context.visibility)
    ? (context.visibility as {
        grouping?: unknown;
        bundle_regeneration?: unknown;
        spike_detection?: unknown;
        notification_cooldown?: unknown;
      })
    : null;
  const lines = [
    `Incident: ${context.incident.incident_id}`,
    ...(typeof incidentSource === "string" ? [`Source: ${incidentSource}`] : []),
    `Title: ${context.incident.title}`,
    `Severity: ${context.incident.severity}`,
    `Status: ${context.incident.status}`,
    `Reason: ${context.incident_reason?.kind ?? "unknown"}`,
    `Why: ${context.primary_signal.description}`,
    `Primary signal: ${context.primary_signal.event_type ?? "unknown"}`,
    `Bundle: ${context.bundle.status}`,
    `Reproduction: ${context.reproduction.status}`,
    `Logs: ${context.logs.source} (${context.logs.items.length})`,
    `Fingerprint: ${context.grouping.fingerprint}`,
    `Matched fields: ${context.grouping.matched_fields.join(", ")}`
  ];

  if (context.primary_signal.request_method !== null || context.primary_signal.response_status !== null) {
    lines.push(
      `Request: ${context.primary_signal.request_method ?? "unknown"} ${context.primary_signal.route_template ?? context.primary_signal.request_path ?? "unknown"}`
    );
    lines.push(`Response status: ${context.primary_signal.response_status ?? "unknown"}`);
  }

  if (context.primary_signal.error_type !== null) {
    lines.push(`Error type: ${context.primary_signal.error_type}`);
  }
  if (context.primary_signal.error_message !== null) {
    lines.push(`Error message: ${context.primary_signal.error_message}`);
  }
  if (context.deploy.commit_sha !== null || context.deploy.deploy_version !== null) {
    lines.push(
      `Deploy: ${context.deploy.deploy_version ?? "unknown"} (${context.deploy.commit_sha ?? "unknown"})`
    );
  }
  if (typeof visibility?.grouping === "string") {
    lines.push(`Grouping visibility: ${visibility.grouping}`);
  }
  if (typeof visibility?.bundle_regeneration === "string") {
    lines.push(`Bundle regeneration: ${visibility.bundle_regeneration}`);
  }
  if (typeof visibility?.spike_detection === "string") {
    lines.push(`Spike detection: ${visibility.spike_detection}`);
  }
  if (typeof visibility?.notification_cooldown === "string") {
    lines.push(`Notification cooldown: ${visibility.notification_cooldown}`);
  }
  if (context.redaction !== null) {
    lines.push(`Redaction: ${context.redaction.redacted ? "redacted" : "not_redacted"}`);
    if (context.redaction.fields.length > 0) {
      lines.push(`Redacted fields: ${context.redaction.fields.join(", ")}`);
    }
  }
  if (context.suggested_next_checks.length > 0) {
    lines.push("Suggested next checks:");
    lines.push(...context.suggested_next_checks.map((item) => `- ${item}`));
  }

  return lines.join("\n");
}

export function formatLogsTable(logs: LogLike[]): string {
  logs = safeEvidence(logs);
  if (logs.length === 0) {
    return "No logs found.";
  }

  return logs
    .map((log) => `${log.occurred_at} | ${log.level ?? "unknown"} | ${log.event_type} | ${log.event_id}`)
    .join("\n");
}

export type AuthenticatedRetrievalDependencies = Parameters<typeof createAuthenticatedRetrievalApi>[1] &
  LocalRetrievalStoreDependencies &
  CloudArtifactCacheDependencies;

export function mapErrorToResult(error: unknown): CliCommandResult {
  return {
    exitCode: mapErrorToExitCode(error),
    output: formatRetrievalErrorOutput(error)
  };
}

export function mapUnsupportedReopenResult(): CliCommandResult {
  return {
    exitCode: 4,
    output: "reopen_not_supported"
  };
}

export async function shouldUseLocalRetrieval(
  source: RetrievalSource | undefined,
  dependencies?: LocalRetrievalStoreDependencies
): Promise<boolean> {
  if (source === "local") {
    return true;
  }

  if (source === "cloud") {
    return false;
  }

  return (await readLocalConnectionConfig(dependencies))?.mode === "local-only";
}

export async function shouldCombineLocalAndCloudRetrieval(
  source: RetrievalSource | undefined,
  dependencies?: LocalRetrievalStoreDependencies
): Promise<boolean> {
  if (source !== undefined) {
    return false;
  }

  return (await readLocalConnectionConfig(dependencies))?.mode === "connected";
}

async function listAllCloudIncidents(
  input: {
    bearerToken: string;
    projectId?: string;
    environment?: string;
    service?: string;
    status?: string;
    severity?: string;
    firstSeenAfter?: string;
    attentionAfter?: string;
  },
  api: {
    listIncidents(input: {
      bearerToken: string;
      projectId?: string;
      environment?: string;
      service?: string;
      status?: string;
      severity?: string;
      firstSeenAfter?: string;
      attentionAfter?: string;
      cursor?: string;
    }): Promise<{ incidents: IncidentLike[]; next_cursor: string | null }>;
  }
): Promise<Array<IncidentLike & { source: RetrievalSource }>> {
  const incidents: Array<IncidentLike & { source: RetrievalSource }> = [];
  let cursor: string | undefined;

  while (true) {
    const response = await api.listIncidents({
      bearerToken: input.bearerToken,
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      ...(input.environment === undefined ? {} : { environment: input.environment }),
      ...(input.service === undefined ? {} : { service: input.service }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.severity === undefined ? {} : { severity: input.severity }),
      ...(input.firstSeenAfter === undefined ? {} : { firstSeenAfter: input.firstSeenAfter }),
      ...(input.attentionAfter === undefined ? {} : { attentionAfter: input.attentionAfter }),
      ...(cursor === undefined ? {} : { cursor })
    });

    incidents.push(
      ...response.incidents.map((incident) =>
        attachSourceToRecord(incident as IncidentLike & Record<string, unknown>, "cloud")
      )
    );

    if (response.next_cursor === null) {
      return incidents;
    }

    cursor = response.next_cursor;
  }
}

async function mapCombinedIncidentListResult(
  input: {
    bearerToken: string;
    projectId?: string;
    environment?: string;
    service?: string;
    status?: string;
    severity?: string;
    firstSeenAfter?: string;
    attentionAfter?: string;
    cursor?: string;
    limit?: number;
    json?: boolean;
  },
  api: {
    listIncidents(input: {
      bearerToken: string;
      projectId?: string;
      environment?: string;
      service?: string;
      status?: string;
      severity?: string;
      firstSeenAfter?: string;
      attentionAfter?: string;
      cursor?: string;
    }): Promise<{ incidents: IncidentLike[]; next_cursor: string | null }>;
  },
  dependencies?: LocalRetrievalStoreDependencies
): Promise<CliCommandResult> {
  type IncidentListEntry = IncidentLike & { last_seen_at: string };

  const localIncidents = await listLocalIncidents(
    {
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      ...(input.environment === undefined ? {} : { environment: input.environment }),
      ...(input.service === undefined ? {} : { service: input.service }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.severity === undefined ? {} : { severity: input.severity }),
      ...(input.firstSeenAfter === undefined ? {} : { firstSeenAfter: input.firstSeenAfter }),
      ...(input.attentionAfter === undefined ? {} : { attentionAfter: input.attentionAfter })
    },
    dependencies
  );
  const cloudIncidents = await listAllCloudIncidents(
    {
      bearerToken: input.bearerToken,
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      ...(input.environment === undefined ? {} : { environment: input.environment }),
      ...(input.service === undefined ? {} : { service: input.service }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.severity === undefined ? {} : { severity: input.severity }),
      ...(input.firstSeenAfter === undefined ? {} : { firstSeenAfter: input.firstSeenAfter }),
      ...(input.attentionAfter === undefined ? {} : { attentionAfter: input.attentionAfter })
    },
    api
  );
  const incidents = paginateIncidents<IncidentListEntry>(
    [...localIncidents.incidents, ...cloudIncidents] as IncidentListEntry[],
    {
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      ...(input.limit === undefined ? {} : { limit: input.limit })
    }
  );

  return {
    exitCode: 0,
    output: input.json ? safeJsonStringify(incidents) : formatIncidentTable(incidents.incidents)
  };
}

function mapAuthOrRetrievalError(error: unknown): CliCommandResult {
  return mapCliAuthErrorToResult(error) ?? mapErrorToResult(error);
}

function resolveIncidentListStatusFilter(status: string | undefined): string | undefined {
  if (status === "all") {
    return undefined;
  }

  return status ?? "active";
}

export async function listIncidentsCommand(
  input: {
    bearerToken: string;
    projectId?: string;
    environment?: string;
    service?: string;
    status?: string;
    severity?: string;
    firstSeenAfter?: string;
    attentionAfter?: string;
    cursor?: string;
    limit?: number;
    json?: boolean;
  },
  api: {
    listIncidents(input: {
      bearerToken: string;
      projectId?: string;
      environment?: string;
      service?: string;
      status?: string;
      severity?: string;
      firstSeenAfter?: string;
      attentionAfter?: string;
      cursor?: string;
      limit?: number;
    }): Promise<{ incidents: IncidentLike[]; next_cursor: string | null }>;
  }
): Promise<CliCommandResult> {
  try {
    const statusFilter = resolveIncidentListStatusFilter(input.status);
    const requestInput: {
      bearerToken: string;
      projectId?: string;
      environment?: string;
      service?: string;
      status?: string;
      severity?: string;
      firstSeenAfter?: string;
      attentionAfter?: string;
      cursor?: string;
      limit?: number;
    } = {
      bearerToken: input.bearerToken
    };

    if (input.projectId !== undefined) {
      requestInput.projectId = input.projectId;
    }
    if (input.environment !== undefined) {
      requestInput.environment = input.environment;
    }
    if (input.service !== undefined) {
      requestInput.service = input.service;
    }
    if (statusFilter !== undefined) {
      requestInput.status = statusFilter;
    }
    if (input.severity !== undefined) {
      requestInput.severity = input.severity;
    }
    if (input.firstSeenAfter !== undefined) {
      requestInput.firstSeenAfter = input.firstSeenAfter;
    }
    if (input.attentionAfter !== undefined) {
      requestInput.attentionAfter = input.attentionAfter;
    }
    if (input.cursor !== undefined) {
      requestInput.cursor = input.cursor;
    }
    if (input.limit !== undefined) {
      requestInput.limit = input.limit;
    }

    const incidents = await api.listIncidents(requestInput);
    if (input.json) {
      return {
        exitCode: 0,
        output: safeJsonStringify(incidents)
      };
    }

    return {
      exitCode: 0,
      output: formatIncidentTable(incidents.incidents)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: formatRetrievalErrorOutput(error) };
  }
}

export async function listIncidentsWithAuthCommand(
  input: {
    authFilePath?: string;
    source?: RetrievalSource;
    projectId?: string;
    environment?: string;
    service?: string;
    status?: string;
    severity?: string;
    firstSeenAfter?: string;
    attentionAfter?: string;
    cursor?: string;
    limit?: number;
    json?: boolean;
  },
  dependencies?: AuthenticatedRetrievalDependencies
): Promise<CliCommandResult> {
  const statusFilter = resolveIncidentListStatusFilter(input.status);

  if (await shouldUseLocalRetrieval(input.source, dependencies)) {
    try {
      const incidents = await listLocalIncidents(
        {
          ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
          ...(input.environment === undefined ? {} : { environment: input.environment }),
          ...(input.service === undefined ? {} : { service: input.service }),
          ...(statusFilter === undefined ? {} : { status: statusFilter }),
          ...(input.severity === undefined ? {} : { severity: input.severity }),
          ...(input.firstSeenAfter === undefined ? {} : { firstSeenAfter: input.firstSeenAfter }),
          ...(input.attentionAfter === undefined ? {} : { attentionAfter: input.attentionAfter }),
          ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
          ...(input.limit === undefined ? {} : { limit: input.limit })
        },
        dependencies
      );

      return {
        exitCode: 0,
        output: input.json ? safeJsonStringify(incidents) : formatIncidentTable(incidents.incidents)
      };
    } catch (error) {
      return mapErrorToResult(error);
    }
  }

  if (await shouldCombineLocalAndCloudRetrieval(input.source, dependencies)) {
    try {
      const { authState, api } = await createAuthenticatedRetrievalApi(input, dependencies);

      return await mapCombinedIncidentListResult(
        {
          bearerToken: authState.bearer_token,
          ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
          ...(input.environment === undefined ? {} : { environment: input.environment }),
          ...(input.service === undefined ? {} : { service: input.service }),
          ...(statusFilter === undefined ? {} : { status: statusFilter }),
          ...(input.severity === undefined ? {} : { severity: input.severity }),
          ...(input.firstSeenAfter === undefined ? {} : { firstSeenAfter: input.firstSeenAfter }),
          ...(input.attentionAfter === undefined ? {} : { attentionAfter: input.attentionAfter }),
          ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
          ...(input.limit === undefined ? {} : { limit: input.limit }),
          ...(input.json === undefined ? {} : { json: input.json })
        },
        {
          listIncidents: (requestInput) => api.listIncidents(requestInput)
        },
        dependencies
      );
    } catch (error) {
      return mapAuthOrRetrievalError(error);
    }
  }

  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedRetrievalApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: {
        bearerToken: string;
        projectId?: string;
        environment?: string;
        service?: string;
        status?: string;
        severity?: string;
        firstSeenAfter?: string;
        attentionAfter?: string;
        cursor?: string;
        limit?: number;
        json?: boolean;
      } = {
        bearerToken: authState.bearer_token
      };

      if (input.projectId !== undefined) {
        commandInput.projectId = input.projectId;
      }
      if (input.environment !== undefined) {
        commandInput.environment = input.environment;
      }
      if (input.service !== undefined) {
        commandInput.service = input.service;
      }
      if (input.status !== undefined) {
        commandInput.status = input.status;
      }
      if (input.severity !== undefined) {
        commandInput.severity = input.severity;
      }
      if (input.firstSeenAfter !== undefined) {
        commandInput.firstSeenAfter = input.firstSeenAfter;
      }
      if (input.attentionAfter !== undefined) {
        commandInput.attentionAfter = input.attentionAfter;
      }
      if (input.cursor !== undefined) {
        commandInput.cursor = input.cursor;
      }
      if (input.limit !== undefined) {
        commandInput.limit = input.limit;
      }
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return listIncidentsCommand(commandInput, {
        listIncidents: async (requestInput) => {
          const incidents = await api.listIncidents(requestInput);
          return {
            ...incidents,
            incidents: incidents.incidents.map((incident) =>
              attachSourceToRecord(incident as IncidentLike & Record<string, unknown>, "cloud")
            )
          };
        }
      });
    }
  });
}

export async function getIncidentCommand(
  input: { bearerToken: string; incidentId: string; json?: boolean },
  api: { getIncident(input: { bearerToken: string; incidentId: string }): Promise<IncidentLike> }
): Promise<CliCommandResult> {
  try {
    const incident = await api.getIncident(input);
    if (input.json) {
      return {
        exitCode: 0,
        output: safeJsonStringify({ incident })
      };
    }

    return {
      exitCode: 0,
      output: formatIncidentDetail(incident)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: formatRetrievalErrorOutput(error) };
  }
}

async function readLocalIncidentContext(
  input: { incidentId: string },
  dependencies?: AuthenticatedRetrievalDependencies
): Promise<IncidentContextRecord> {
  const incident = await getLocalIncident({ incidentId: input.incidentId }, dependencies);

  let bundle: IncidentContextArtifactRecord;
  try {
    bundle = {
      status: "ready",
      body: await getLocalBundle({ incidentId: input.incidentId }, dependencies)
    };
  } catch (error) {
    bundle = {
      status: "failed",
      reason: error instanceof Error ? error.message : String(error)
    };
  }

  let reproduction: IncidentContextArtifactRecord;
  try {
    reproduction = {
      status: "ready",
      body: await getLocalReproduction({ incidentId: input.incidentId }, dependencies)
    };
  } catch (error) {
    reproduction = {
      status: "failed",
      reason: error instanceof Error ? error.message : String(error)
    };
  }

  return buildIncidentContextRecord({
    incident,
    bundle,
    reproduction
  });
}

export async function getIncidentContextCommand(
  input: { bearerToken: string; incidentId: string; json?: boolean },
  api: { getIncidentContext(input: { bearerToken: string; incidentId: string }): Promise<IncidentContextRecord> }
): Promise<CliCommandResult> {
  try {
    const context = await api.getIncidentContext({
      bearerToken: input.bearerToken,
      incidentId: input.incidentId
    });

    return {
      exitCode: 0,
      output: input.json ? safeJsonStringify(context) : formatIncidentContextDetail(context)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: formatRetrievalErrorOutput(error) };
  }
}

export async function getIncidentContextWithAuthCommand(
  input: { authFilePath?: string; incidentId: string; source?: RetrievalSource; json?: boolean },
  dependencies?: AuthenticatedRetrievalDependencies
): Promise<CliCommandResult> {
  if (await shouldUseLocalRetrieval(input.source, dependencies)) {
    try {
      const context = await readLocalIncidentContext({ incidentId: input.incidentId }, dependencies);
      return {
        exitCode: 0,
        output: input.json ? safeJsonStringify(context) : formatIncidentContextDetail(context)
      };
    } catch (error) {
      return mapErrorToResult(error);
    }
  }

  if (await shouldCombineLocalAndCloudRetrieval(input.source, dependencies)) {
    try {
      const context = await readLocalIncidentContext({ incidentId: input.incidentId }, dependencies);
      return {
        exitCode: 0,
        output: input.json ? safeJsonStringify(context) : formatIncidentContextDetail(context)
      };
    } catch (error) {
      if (!isNotFoundRetrievalError(error)) {
        return mapErrorToResult(error);
      }
    }
  }

  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedRetrievalApi,
    dependencies,
    runCommand: (authState, api) =>
      getIncidentContextCommand(
        {
          bearerToken: authState.bearer_token,
          incidentId: input.incidentId,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        {
          getIncidentContext: async (requestInput) =>
            attachSourceToIncidentContext(
              (await api.getIncidentContext(requestInput)) as IncidentContextRecord & {
                incident: Record<string, unknown>;
              },
              "cloud"
            ) as IncidentContextRecord
        }
      )
  });
}

export async function getIncidentWithAuthCommand(
  input: { authFilePath?: string; incidentId: string; source?: RetrievalSource; json?: boolean },
  dependencies?: AuthenticatedRetrievalDependencies
): Promise<CliCommandResult> {
  if (await shouldUseLocalRetrieval(input.source, dependencies)) {
    try {
      const incident = await getLocalIncident({ incidentId: input.incidentId }, dependencies);
      return {
        exitCode: 0,
        output: input.json ? safeJsonStringify({ incident }) : formatIncidentDetail(incident)
      };
    } catch (error) {
      return mapErrorToResult(error);
    }
  }

  if (await shouldCombineLocalAndCloudRetrieval(input.source, dependencies)) {
    try {
      const incident = await getLocalIncident({ incidentId: input.incidentId }, dependencies);
      return {
        exitCode: 0,
        output: input.json ? safeJsonStringify({ incident }) : formatIncidentDetail(incident)
      };
    } catch (error) {
      if (!isNotFoundRetrievalError(error)) {
        return mapErrorToResult(error);
      }
    }
  }

  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedRetrievalApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; incidentId: string; json?: boolean } = {
        bearerToken: authState.bearer_token,
        incidentId: input.incidentId
      };

      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return getIncidentCommand(commandInput, {
        getIncident: async (requestInput) =>
          attachSourceToRecord(
            (await api.getIncident(requestInput)) as IncidentLike & Record<string, unknown>,
            "cloud"
          )
      });
    }
  });
}
