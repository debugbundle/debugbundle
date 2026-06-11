import { RetrievalApiError } from "../../../packages/retrieval-client/src/index.js";
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
import {
  cacheCloudBundleArtifact,
  cacheCloudReproductionArtifact,
  syncCloudIncidentCacheStatus,
  type CloudArtifactCacheDependencies
} from "./cloud-artifact-cache.js";
import {
  getLocalBundle,
  getLocalIncident,
  getLocalReproduction,
  listLocalIncidents,
  reopenLocalIncident,
  readLocalConnectionConfig,
  resolveLocalIncident,
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

interface IncidentLike {
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
}

interface LogLike {
  event_id: string;
  event_type: string;
  occurred_at: string;
  is_sampled: boolean;
  level: string | null;
}

function mapErrorToExitCode(error: unknown): number {
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

function formatIncidentTable(incidents: IncidentLike[]): string {
  if (incidents.length === 0) {
    return "No incidents found.";
  }

  const showSource = incidents.some((incident) => incident.source !== undefined);

  return incidents
    .map((incident) => {
      const sourcePrefix = showSource ? `${incident.source ?? "unknown"} | ` : "";
      return `${sourcePrefix}${incident.incident_id} | ${incident.severity} | ${incident.status} | ${incident.title}`;
    })
    .join("\n");
}

function formatIncidentDetail(incident: IncidentLike): string {
  return [
    `Incident: ${incident.incident_id}`,
    ...(incident.source === undefined ? [] : [`Source: ${incident.source}`]),
    `Title: ${incident.title}`,
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

function formatObjectOutput(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

function readIncidentIdsInput(input: { incidentId?: string; incidentIds?: string[] }): string[] {
  if (Array.isArray(input.incidentIds) && input.incidentIds.length > 0) {
    return input.incidentIds;
  }

  if (typeof input.incidentId === "string" && input.incidentId.length > 0) {
    return [input.incidentId];
  }

  return [];
}

function formatIncidentContextDetail(context: IncidentContextRecord): string {
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

function formatLogsTable(logs: LogLike[]): string {
  if (logs.length === 0) {
    return "No logs found.";
  }

  return logs
    .map((log) => `${log.occurred_at} | ${log.level ?? "unknown"} | ${log.event_type} | ${log.event_id}`)
    .join("\n");
}

type AuthenticatedRetrievalDependencies = Parameters<typeof createAuthenticatedRetrievalApi>[1] &
  LocalRetrievalStoreDependencies &
  CloudArtifactCacheDependencies;

function mapErrorToResult(error: unknown): CliCommandResult {
  return {
    exitCode: mapErrorToExitCode(error),
    output: error instanceof Error ? error.message : String(error)
  };
}

function mapUnsupportedReopenResult(): CliCommandResult {
  return {
    exitCode: 4,
    output: "reopen_not_supported"
  };
}

async function shouldUseLocalRetrieval(
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

async function shouldCombineLocalAndCloudRetrieval(
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
      ...(input.firstSeenAfter === undefined ? {} : { firstSeenAfter: input.firstSeenAfter })
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
      ...(input.firstSeenAfter === undefined ? {} : { firstSeenAfter: input.firstSeenAfter })
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
    output: input.json ? JSON.stringify(incidents) : formatIncidentTable(incidents.incidents)
  };
}

function mapAuthOrRetrievalError(error: unknown): CliCommandResult {
  return mapCliAuthErrorToResult(error) ?? mapErrorToResult(error);
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
      cursor?: string;
      limit?: number;
    }): Promise<{ incidents: IncidentLike[]; next_cursor: string | null }>;
  }
): Promise<CliCommandResult> {
  try {
    const requestInput: {
      bearerToken: string;
      projectId?: string;
      environment?: string;
      service?: string;
      status?: string;
      severity?: string;
      firstSeenAfter?: string;
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
    if (input.status !== undefined) {
      requestInput.status = input.status;
    }
    if (input.severity !== undefined) {
      requestInput.severity = input.severity;
    }
    if (input.firstSeenAfter !== undefined) {
      requestInput.firstSeenAfter = input.firstSeenAfter;
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
        output: JSON.stringify(incidents)
      };
    }

    return {
      exitCode: 0,
      output: formatIncidentTable(incidents.incidents)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
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
    cursor?: string;
    limit?: number;
    json?: boolean;
  },
  dependencies?: AuthenticatedRetrievalDependencies
): Promise<CliCommandResult> {
  if (await shouldUseLocalRetrieval(input.source, dependencies)) {
    try {
      const incidents = await listLocalIncidents(
        {
          ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
          ...(input.environment === undefined ? {} : { environment: input.environment }),
          ...(input.service === undefined ? {} : { service: input.service }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.severity === undefined ? {} : { severity: input.severity }),
          ...(input.firstSeenAfter === undefined ? {} : { firstSeenAfter: input.firstSeenAfter }),
          ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
          ...(input.limit === undefined ? {} : { limit: input.limit })
        },
        dependencies
      );

      return {
        exitCode: 0,
        output: input.json ? JSON.stringify(incidents) : formatIncidentTable(incidents.incidents)
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
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.severity === undefined ? {} : { severity: input.severity }),
          ...(input.firstSeenAfter === undefined ? {} : { firstSeenAfter: input.firstSeenAfter }),
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
        output: JSON.stringify({ incident })
      };
    }

    return {
      exitCode: 0,
      output: formatIncidentDetail(incident)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
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
      output: input.json ? JSON.stringify(context) : formatIncidentContextDetail(context)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
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
        output: input.json ? JSON.stringify(context) : formatIncidentContextDetail(context)
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
        output: input.json ? JSON.stringify(context) : formatIncidentContextDetail(context)
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
        output: input.json ? JSON.stringify({ incident }) : formatIncidentDetail(incident)
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
        output: input.json ? JSON.stringify({ incident }) : formatIncidentDetail(incident)
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

export async function resolveIncidentCommand(
  input: { bearerToken: string; incidentId?: string; incidentIds?: string[]; json?: boolean },
  api: {
    resolveIncident(input: { bearerToken: string; incidentId: string }): Promise<IncidentLike>;
    resolveIncidents?: (input: { bearerToken: string; incidentIds: string[] }) => Promise<IncidentLike[]>;
  }
): Promise<CliCommandResult> {
  const incidentIds = readIncidentIdsInput(input);

  try {
    if (incidentIds.length > 1 && api.resolveIncidents !== undefined) {
      const incidents = await api.resolveIncidents({
        bearerToken: input.bearerToken,
        incidentIds
      });
      if (input.json) {
        return {
          exitCode: 0,
          output: JSON.stringify({ incidents })
        };
      }

      return {
        exitCode: 0,
        output: formatIncidentTable(incidents)
      };
    }

    const incident = await api.resolveIncident({
      bearerToken: input.bearerToken,
      incidentId: incidentIds[0]!
    });
    if (input.json) {
      return {
        exitCode: 0,
        output: JSON.stringify({ incident })
      };
    }

    return {
      exitCode: 0,
      output: formatIncidentDetail(incident)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function resolveIncidentWithAuthCommand(
  input: { authFilePath?: string; incidentId?: string; incidentIds?: string[]; source?: RetrievalSource; json?: boolean },
  dependencies?: AuthenticatedRetrievalDependencies
): Promise<CliCommandResult> {
  const incidentIds = readIncidentIdsInput(input);

  if (await shouldUseLocalRetrieval(input.source, dependencies)) {
    try {
      const incidents = await Promise.all(
        incidentIds.map((incidentId) => resolveLocalIncident({ incidentId }, dependencies))
      );
      return {
        exitCode: 0,
        output:
          input.json
            ? JSON.stringify(incidents.length === 1 ? { incident: incidents[0] } : { incidents })
            : incidents.length === 1
              ? formatIncidentDetail(incidents[0]!)
              : formatIncidentTable(incidents)
      };
    } catch (error) {
      return mapErrorToResult(error);
    }
  }

  if (await shouldCombineLocalAndCloudRetrieval(input.source, dependencies)) {
    try {
      const localIncidents = new Map<string, IncidentLike>();
      const cloudIncidentIds: string[] = [];

      for (const incidentId of incidentIds) {
        try {
          localIncidents.set(incidentId, await resolveLocalIncident({ incidentId }, dependencies));
        } catch (error) {
          if (!isNotFoundRetrievalError(error)) {
            return mapErrorToResult(error);
          }

          cloudIncidentIds.push(incidentId);
        }
      }

      if (cloudIncidentIds.length === 0) {
        const incidents = incidentIds.map((incidentId) => localIncidents.get(incidentId)!);
        return {
          exitCode: 0,
          output:
            input.json
              ? JSON.stringify(incidents.length === 1 ? { incident: incidents[0] } : { incidents })
              : incidents.length === 1
                ? formatIncidentDetail(incidents[0]!)
                : formatIncidentTable(incidents)
        };
      }

      return runAuthenticatedCliCommand(input, {
        createApi: createAuthenticatedRetrievalApi,
        dependencies,
        runCommand: async (authState, api) => {
          const cloudIncidents =
            cloudIncidentIds.length === 1
              ? [
                  attachSourceToRecord(
                    (await api.resolveIncident({
                      bearerToken: authState.bearer_token,
                      incidentId: cloudIncidentIds[0]!
                    })) as IncidentLike & Record<string, unknown>,
                    "cloud"
                  )
                ]
              : (await api.resolveIncidents({
                  bearerToken: authState.bearer_token,
                  incidentIds: cloudIncidentIds
                })).map((incident) =>
                  attachSourceToRecord(incident as IncidentLike & Record<string, unknown>, "cloud")
                );

          for (const incident of cloudIncidents) {
            await syncCloudIncidentCacheStatus(
              {
                incidentId: incident.incident_id,
                incident: {
                  ...(typeof incident.status === "string" ? { status: incident.status } : {}),
                  resolved_at: incident.resolved_at ?? null
                }
              },
              dependencies
            );
            localIncidents.set(incident.incident_id, incident);
          }

          const incidents = incidentIds.map((incidentId) => localIncidents.get(incidentId)!);
          return {
            exitCode: 0,
            output:
              input.json
                ? JSON.stringify(incidents.length === 1 ? { incident: incidents[0] } : { incidents })
                : incidents.length === 1
                  ? formatIncidentDetail(incidents[0]!)
                  : formatIncidentTable(incidents)
          };
        }
      });
    } catch (error) {
      if (!(error instanceof Error)) {
        return mapErrorToResult(error);
      }

      return mapErrorToResult(error);
    }
  }

  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedRetrievalApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; incidentId?: string; incidentIds?: string[]; json?: boolean } =
        incidentIds.length === 1
          ? {
              bearerToken: authState.bearer_token,
              incidentId: incidentIds[0]!
            }
          : {
              bearerToken: authState.bearer_token,
              incidentIds
            };

      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return resolveIncidentCommand(commandInput, {
        resolveIncident: async (requestInput) => {
          const incident = attachSourceToRecord(
            (await api.resolveIncident(requestInput)) as IncidentLike & Record<string, unknown>,
            "cloud"
          );

          await syncCloudIncidentCacheStatus(
            {
              incidentId: incident.incident_id,
              incident: {
                ...(typeof incident.status === "string" ? { status: incident.status } : {}),
                resolved_at: incident.resolved_at ?? null
              }
            },
            dependencies
          );

          return incident;
        },
        resolveIncidents: async (requestInput) => {
          const incidents = (await api.resolveIncidents(requestInput)).map((incident) =>
            attachSourceToRecord(incident as IncidentLike & Record<string, unknown>, "cloud")
          );

          for (const incident of incidents) {
            await syncCloudIncidentCacheStatus(
              {
                incidentId: incident.incident_id,
                incident: {
                  ...(typeof incident.status === "string" ? { status: incident.status } : {}),
                  resolved_at: incident.resolved_at ?? null
                }
              },
              dependencies
            );
          }

          return incidents;
        }
      });
    }
  });
}

export async function reopenIncidentCommand(
  input: { bearerToken: string; incidentId?: string; incidentIds?: string[]; json?: boolean },
  api: {
    reopenIncident?: (input: { bearerToken: string; incidentId: string }) => Promise<IncidentLike>;
    reopenIncidents?: (input: { bearerToken: string; incidentIds: string[] }) => Promise<IncidentLike[]>;
  }
): Promise<CliCommandResult> {
  const incidentIds = readIncidentIdsInput(input);

  if (api.reopenIncident === undefined) {
    return mapUnsupportedReopenResult();
  }

  try {
    if (incidentIds.length > 1 && api.reopenIncidents !== undefined) {
      const incidents = await api.reopenIncidents({
        bearerToken: input.bearerToken,
        incidentIds
      });
      if (input.json) {
        return {
          exitCode: 0,
          output: JSON.stringify({ incidents })
        };
      }

      return {
        exitCode: 0,
        output: formatIncidentTable(incidents)
      };
    }

    const incident = await api.reopenIncident({
      bearerToken: input.bearerToken,
      incidentId: incidentIds[0]!
    });
    if (input.json) {
      return {
        exitCode: 0,
        output: JSON.stringify({ incident })
      };
    }

    return {
      exitCode: 0,
      output: formatIncidentDetail(incident)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function reopenIncidentWithAuthCommand(
  input: { authFilePath?: string; incidentId?: string; incidentIds?: string[]; source?: RetrievalSource; json?: boolean },
  dependencies?: AuthenticatedRetrievalDependencies
): Promise<CliCommandResult> {
  const incidentIds = readIncidentIdsInput(input);

  if (await shouldUseLocalRetrieval(input.source, dependencies)) {
    try {
      const incidents = await Promise.all(
        incidentIds.map((incidentId) => reopenLocalIncident({ incidentId }, dependencies))
      );
      return {
        exitCode: 0,
        output:
          input.json
            ? JSON.stringify(incidents.length === 1 ? { incident: incidents[0] } : { incidents })
            : incidents.length === 1
              ? formatIncidentDetail(incidents[0]!)
              : formatIncidentTable(incidents)
      };
    } catch (error) {
      return mapErrorToResult(error);
    }
  }

  if (await shouldCombineLocalAndCloudRetrieval(input.source, dependencies)) {
    try {
      const localIncidents = new Map<string, IncidentLike>();
      const cloudIncidentIds: string[] = [];

      for (const incidentId of incidentIds) {
        try {
          localIncidents.set(incidentId, await reopenLocalIncident({ incidentId }, dependencies));
        } catch (error) {
          if (!isNotFoundRetrievalError(error)) {
            return mapErrorToResult(error);
          }

          cloudIncidentIds.push(incidentId);
        }
      }

      if (cloudIncidentIds.length === 0) {
        const incidents = incidentIds.map((incidentId) => localIncidents.get(incidentId)!);
        return {
          exitCode: 0,
          output:
            input.json
              ? JSON.stringify(incidents.length === 1 ? { incident: incidents[0] } : { incidents })
              : incidents.length === 1
                ? formatIncidentDetail(incidents[0]!)
                : formatIncidentTable(incidents)
        };
      }

      return runAuthenticatedCliCommand(input, {
        createApi: createAuthenticatedRetrievalApi,
        dependencies,
        runCommand: async (authState, api) => {
          const cloudIncidents =
            cloudIncidentIds.length === 1
              ? [
                  attachSourceToRecord(
                    (await api.reopenIncident({
                      bearerToken: authState.bearer_token,
                      incidentId: cloudIncidentIds[0]!
                    })) as IncidentLike & Record<string, unknown>,
                    "cloud"
                  )
                ]
              : (await api.reopenIncidents({
                  bearerToken: authState.bearer_token,
                  incidentIds: cloudIncidentIds
                })).map((incident) =>
                  attachSourceToRecord(incident as IncidentLike & Record<string, unknown>, "cloud")
                );

          for (const incident of cloudIncidents) {
            await syncCloudIncidentCacheStatus(
              {
                incidentId: incident.incident_id,
                incident: {
                  ...(typeof incident.status === "string" ? { status: incident.status } : {}),
                  resolved_at: null
                }
              },
              dependencies
            );
            localIncidents.set(incident.incident_id, incident);
          }

          const incidents = incidentIds.map((incidentId) => localIncidents.get(incidentId)!);
          return {
            exitCode: 0,
            output:
              input.json
                ? JSON.stringify(incidents.length === 1 ? { incident: incidents[0] } : { incidents })
                : incidents.length === 1
                  ? formatIncidentDetail(incidents[0]!)
                  : formatIncidentTable(incidents)
          };
        }
      });
    } catch (error) {
      if (!(error instanceof Error)) {
        return mapErrorToResult(error);
      }

      return mapErrorToResult(error);
    }
  }

  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedRetrievalApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; incidentId?: string; incidentIds?: string[]; json?: boolean } =
        incidentIds.length === 1
          ? {
              bearerToken: authState.bearer_token,
              incidentId: incidentIds[0]!
            }
          : {
              bearerToken: authState.bearer_token,
              incidentIds
            };

      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return reopenIncidentCommand(commandInput, {
        reopenIncident: async (requestInput) => {
          const incident = attachSourceToRecord(
            (await api.reopenIncident(requestInput)) as IncidentLike & Record<string, unknown>,
            "cloud"
          );

          await syncCloudIncidentCacheStatus(
            {
              incidentId: incident.incident_id,
              incident: {
                ...(typeof incident.status === "string" ? { status: incident.status } : {}),
                resolved_at: null
              }
            },
            dependencies
          );

          return incident;
        },
        reopenIncidents: async (requestInput) => {
          const incidents = (await api.reopenIncidents(requestInput)).map((incident) =>
            attachSourceToRecord(incident as IncidentLike & Record<string, unknown>, "cloud")
          );

          for (const incident of incidents) {
            await syncCloudIncidentCacheStatus(
              {
                incidentId: incident.incident_id,
                incident: {
                  ...(typeof incident.status === "string" ? { status: incident.status } : {}),
                  resolved_at: null
                }
              },
              dependencies
            );
          }

          return incidents;
        }
      });
    }
  });
}

export async function getBundleCommand(
  input: { bearerToken: string; incidentId: string; json?: boolean },
  api: { getBundle(input: { bearerToken: string; incidentId: string }): Promise<unknown> }
): Promise<CliCommandResult> {
  try {
    const bundle = await api.getBundle(input);
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(bundle) : formatObjectOutput(bundle)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function getBundleWithAuthCommand(
  input: { authFilePath?: string; incidentId: string; source?: RetrievalSource; json?: boolean },
  dependencies?: AuthenticatedRetrievalDependencies
): Promise<CliCommandResult> {
  if (await shouldUseLocalRetrieval(input.source, dependencies)) {
    try {
      const bundle = await getLocalBundle({ incidentId: input.incidentId }, dependencies);
      return {
        exitCode: 0,
        output: input.json ? JSON.stringify(bundle) : formatObjectOutput(bundle)
      };
    } catch (error) {
      return mapErrorToResult(error);
    }
  }

  if (await shouldCombineLocalAndCloudRetrieval(input.source, dependencies)) {
    try {
      const bundle = await getLocalBundle({ incidentId: input.incidentId }, dependencies);
      return {
        exitCode: 0,
        output: input.json ? JSON.stringify(bundle) : formatObjectOutput(bundle)
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

      return getBundleCommand(commandInput, {
        getBundle: async (requestInput) =>
          cacheCloudBundleArtifact(
            {
              incidentId: input.incidentId,
              bundle: await api.getBundle(requestInput)
            },
            dependencies
          )
      });
    }
  });
}

export async function getLogsCommand(
  input: {
    bearerToken: string;
    incidentId: string;
    level?: string;
    cursor?: string;
    limit?: number;
    json?: boolean;
  },
  api: {
    getLogs(input: {
      bearerToken: string;
      incidentId: string;
      level?: string;
      cursor?: string;
      limit?: number;
    }): Promise<{ logs: LogLike[]; next_cursor: string | null }>;
  }
): Promise<CliCommandResult> {
  try {
    const requestInput: {
      bearerToken: string;
      incidentId: string;
      level?: string;
      cursor?: string;
      limit?: number;
    } = {
      bearerToken: input.bearerToken,
      incidentId: input.incidentId
    };

    if (input.level !== undefined) {
      requestInput.level = input.level;
    }
    if (input.cursor !== undefined) {
      requestInput.cursor = input.cursor;
    }
    if (input.limit !== undefined) {
      requestInput.limit = input.limit;
    }

    const logs = await api.getLogs(requestInput);
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(logs) : formatLogsTable(logs.logs)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function getLogsWithAuthCommand(
  input: {
    authFilePath?: string;
    incidentId: string;
    level?: string;
    cursor?: string;
    limit?: number;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedRetrievalApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedRetrievalApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: {
        bearerToken: string;
        incidentId: string;
        level?: string;
        cursor?: string;
        limit?: number;
        json?: boolean;
      } = {
        bearerToken: authState.bearer_token,
        incidentId: input.incidentId
      };

      if (input.level !== undefined) {
        commandInput.level = input.level;
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

      return getLogsCommand(commandInput, {
        getLogs: (requestInput) => api.listLogs(requestInput)
      });
    }
  });
}

export async function getReproductionCommand(
  input: { bearerToken: string; incidentId: string; json?: boolean },
  api: { getReproduction(input: { bearerToken: string; incidentId: string }): Promise<unknown> }
): Promise<CliCommandResult> {
  try {
    const reproduction = await api.getReproduction(input);
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(reproduction) : formatObjectOutput(reproduction)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function getReproductionWithAuthCommand(
  input: { authFilePath?: string; incidentId: string; source?: RetrievalSource; json?: boolean },
  dependencies?: AuthenticatedRetrievalDependencies
): Promise<CliCommandResult> {
  if (await shouldUseLocalRetrieval(input.source, dependencies)) {
    try {
      const reproduction = await getLocalReproduction({ incidentId: input.incidentId }, dependencies);
      return {
        exitCode: 0,
        output: input.json ? JSON.stringify(reproduction) : formatObjectOutput(reproduction)
      };
    } catch (error) {
      return mapErrorToResult(error);
    }
  }

  if (await shouldCombineLocalAndCloudRetrieval(input.source, dependencies)) {
    try {
      const reproduction = await getLocalReproduction({ incidentId: input.incidentId }, dependencies);
      return {
        exitCode: 0,
        output: input.json ? JSON.stringify(reproduction) : formatObjectOutput(reproduction)
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

      return getReproductionCommand(commandInput, {
        getReproduction: async (requestInput) =>
          cacheCloudReproductionArtifact(
            {
              incidentId: input.incidentId,
              reproduction: await api.getReproduction(requestInput)
            },
            dependencies
          )
      });
    }
  });
}
