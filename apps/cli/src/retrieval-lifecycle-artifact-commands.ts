import { createAuthenticatedRetrievalApi, runAuthenticatedCliCommand } from "./auth-context.js";
import { cacheCloudBundleArtifact, cacheCloudReproductionArtifact, syncCloudIncidentMutationCache } from "./cloud-artifact-cache.js";
import { getLocalBundle, getLocalReproduction, reopenLocalIncident, resolveLocalIncident } from "./local-retrieval-store.js";
import { attachSourceToRecord, isNotFoundRetrievalError, type RetrievalSource } from "./retrieval-source.js";
import type { CliCommandResult } from "./token-commands.js";
import {
  type IncidentLike, type LogLike, type AuthenticatedRetrievalDependencies,
  mapErrorToExitCode, formatRetrievalErrorOutput, safeJsonStringify,
  formatIncidentTable, formatIncidentDetail, readIncidentIdsInput,
  mapUnsupportedReopenResult, shouldUseLocalRetrieval,
  shouldCombineLocalAndCloudRetrieval, mapErrorToResult,
  formatObjectOutput, formatLogsTable
} from "./retrieval-list-detail-commands.js";

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
          output: safeJsonStringify({ incidents })
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
        output: safeJsonStringify({ incident })
      };
    }

    return {
      exitCode: 0,
      output: formatIncidentDetail(incident)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: formatRetrievalErrorOutput(error, input.json) };
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
            ? safeJsonStringify(incidents.length === 1 ? { incident: incidents[0] } : { incidents })
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
              ? safeJsonStringify(incidents.length === 1 ? { incident: incidents[0] } : { incidents })
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
            await syncCloudIncidentMutationCache(incident, dependencies);
            localIncidents.set(incident.incident_id, incident);
          }

          const incidents = incidentIds.map((incidentId) => localIncidents.get(incidentId)!);
          return {
            exitCode: 0,
            output:
              input.json
                ? safeJsonStringify(incidents.length === 1 ? { incident: incidents[0] } : { incidents })
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

          await syncCloudIncidentMutationCache(incident, dependencies);

          return incident;
        },
        resolveIncidents: async (requestInput) => {
          const incidents = (await api.resolveIncidents(requestInput)).map((incident) =>
            attachSourceToRecord(incident as IncidentLike & Record<string, unknown>, "cloud")
          );

          for (const incident of incidents) {
            await syncCloudIncidentMutationCache(incident, dependencies);
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
          output: safeJsonStringify({ incidents })
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
        output: safeJsonStringify({ incident })
      };
    }

    return {
      exitCode: 0,
      output: formatIncidentDetail(incident)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: formatRetrievalErrorOutput(error, input.json) };
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
            ? safeJsonStringify(incidents.length === 1 ? { incident: incidents[0] } : { incidents })
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
              ? safeJsonStringify(incidents.length === 1 ? { incident: incidents[0] } : { incidents })
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
            await syncCloudIncidentMutationCache(incident, dependencies);
            localIncidents.set(incident.incident_id, incident);
          }

          const incidents = incidentIds.map((incidentId) => localIncidents.get(incidentId)!);
          return {
            exitCode: 0,
            output:
              input.json
                ? safeJsonStringify(incidents.length === 1 ? { incident: incidents[0] } : { incidents })
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

          await syncCloudIncidentMutationCache(incident, dependencies);

          return incident;
        },
        reopenIncidents: async (requestInput) => {
          const incidents = (await api.reopenIncidents(requestInput)).map((incident) =>
            attachSourceToRecord(incident as IncidentLike & Record<string, unknown>, "cloud")
          );

          for (const incident of incidents) {
            await syncCloudIncidentMutationCache(incident, dependencies);
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
      output: input.json ? safeJsonStringify(bundle) : formatObjectOutput(bundle)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: formatRetrievalErrorOutput(error, input.json) };
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
        output: input.json ? safeJsonStringify(bundle) : formatObjectOutput(bundle)
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
        output: input.json ? safeJsonStringify(bundle) : formatObjectOutput(bundle)
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
      output: input.json ? safeJsonStringify(logs) : formatLogsTable(logs.logs)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: formatRetrievalErrorOutput(error, input.json) };
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
      output: input.json ? safeJsonStringify(reproduction) : formatObjectOutput(reproduction)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: formatRetrievalErrorOutput(error, input.json) };
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
        output: input.json ? safeJsonStringify(reproduction) : formatObjectOutput(reproduction)
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
        output: input.json ? safeJsonStringify(reproduction) : formatObjectOutput(reproduction)
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
