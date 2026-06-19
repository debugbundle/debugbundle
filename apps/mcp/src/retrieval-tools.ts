import { RetrievalApiError } from "../../../packages/retrieval-client/src/index.js";
import { buildIncidentContextRecord } from "../../../packages/storage/src/index.js";
import {
  cacheCloudBundleArtifact,
  cacheCloudReproductionArtifact,
  syncCloudIncidentCacheStatus
} from "../../cli/src/cloud-artifact-cache.js";
import {
  attachSourceToIncidentContext,
  attachSourceToRecord,
  isNotFoundRetrievalError,
  paginateIncidents,
  type RetrievalSource
} from "../../cli/src/retrieval-source.js";
import {
  getLocalBundle,
  getLocalIncident,
  getLocalReproduction,
  listLocalIncidents,
  reopenLocalIncident,
  readLocalConnectionConfig,
  resolveLocalIncident
} from "../../cli/src/local-retrieval-store.js";

export const RETRIEVAL_MCP_TOOL_NAMES = [
  "list_incidents",
  "get_incident",
  "get_incident_context",
  "resolve_incident",
  "resolve_incidents",
  "reopen_incident",
  "reopen_incidents",
  "get_bundle",
  "get_reproduction",
  "get_logs"
] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof RetrievalApiError) {
    throw new Error(`mcp_tool_error:${error.code}`);
  }

  throw new Error("mcp_tool_error:unknown_error");
}

function readBearerToken(input: Record<string, unknown>): string | null {
  return typeof input["bearerToken"] === "string" && input["bearerToken"].length > 0 ? input["bearerToken"] : null;
}

async function requireCloudBearerToken(input: Record<string, unknown>): Promise<string> {
  const bearerToken = readBearerToken(input);
  if (bearerToken !== null) {
    return bearerToken;
  }

  if ((await readLocalConnectionConfig())?.mode === "local-only") {
    throw new RetrievalApiError(401, "local_only_project");
  }

  throw new RetrievalApiError(401, "auth_required");
}

function readSource(input: Record<string, unknown>): RetrievalSource | null {
  if (input["source"] === "local" || input["source"] === "cloud") {
    return input["source"];
  }

  return null;
}

async function shouldUseLocalSource(input: Record<string, unknown>): Promise<boolean> {
  const source = readSource(input);
  if (source === "local") {
    return true;
  }

  if (source === "cloud") {
    return false;
  }

  return readBearerToken(input) === null && (await readLocalConnectionConfig())?.mode === "local-only";
}

async function shouldCombineLocalAndCloudSource(input: Record<string, unknown>): Promise<boolean> {
  if (readSource(input) !== null) {
    return false;
  }

  return (await readLocalConnectionConfig())?.mode === "connected";
}

function resolveIncidentListStatusFilter(status: string | undefined): string | undefined {
  if (status === "all") {
    return undefined;
  }

  return status ?? "active";
}

function readIncidentListFilters(input: Record<string, unknown>): {
  projectId?: string;
  environment?: string;
  service?: string;
  status?: string;
  severity?: string;
  firstSeenAfter?: string;
  attentionAfter?: string;
  cursor?: string;
  limit?: number;
} {
  const requestInput: {
    projectId?: string;
    environment?: string;
    service?: string;
    status?: string;
    severity?: string;
    firstSeenAfter?: string;
    attentionAfter?: string;
    cursor?: string;
    limit?: number;
  } = {};

  if (typeof input["projectId"] === "string") {
    requestInput.projectId = input["projectId"];
  }
  if (typeof input["environment"] === "string") {
    requestInput.environment = input["environment"];
  }
  if (typeof input["service"] === "string") {
    requestInput.service = input["service"];
  }
  const status = resolveIncidentListStatusFilter(typeof input["status"] === "string" ? input["status"] : undefined);
  if (status !== undefined) {
    requestInput.status = status;
  }
  if (typeof input["severity"] === "string") {
    requestInput.severity = input["severity"];
  }
  if (typeof input["firstSeenAfter"] === "string") {
    requestInput.firstSeenAfter = input["firstSeenAfter"];
  }
  if (typeof input["attentionAfter"] === "string") {
    requestInput.attentionAfter = input["attentionAfter"];
  }
  if (typeof input["cursor"] === "string") {
    requestInput.cursor = input["cursor"];
  }
  if (typeof input["limit"] === "number") {
    requestInput.limit = input["limit"];
  }

  return requestInput;
}

async function listAllCloudIncidents(
  input: Record<string, unknown>,
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
    }): Promise<{ incidents: unknown[]; next_cursor: string | null }>;
  }
): Promise<Array<Record<string, unknown> & { source: RetrievalSource }>> {
  const filters = readIncidentListFilters(input);
  const incidents: Array<Record<string, unknown> & { source: RetrievalSource }> = [];
  let cursor: string | undefined;

  while (true) {
    const response = await api.listIncidents({
      bearerToken: await requireCloudBearerToken(input),
      ...(filters.projectId === undefined ? {} : { projectId: filters.projectId }),
      ...(filters.environment === undefined ? {} : { environment: filters.environment }),
      ...(filters.service === undefined ? {} : { service: filters.service }),
      ...(filters.status === undefined ? {} : { status: filters.status }),
      ...(filters.severity === undefined ? {} : { severity: filters.severity }),
      ...(filters.firstSeenAfter === undefined ? {} : { firstSeenAfter: filters.firstSeenAfter }),
      ...(filters.attentionAfter === undefined ? {} : { attentionAfter: filters.attentionAfter }),
      ...(cursor === undefined ? {} : { cursor })
    });

    incidents.push(...response.incidents.map((incident) => attachSourceToRecord(incident as Record<string, unknown>, "cloud")));

    if (response.next_cursor === null) {
      return incidents;
    }

    cursor = response.next_cursor;
  }
}

async function readLocalIncidentContext(input: { incidentId: string }): Promise<Record<string, unknown>> {
  const incident = await getLocalIncident({
    incidentId: input.incidentId
  });

  let bundle: {
    status: "ready" | "pending" | "failed";
    body?: unknown;
    reason?: string | null;
  };
  try {
    bundle = {
      status: "ready",
      body: await getLocalBundle({
        incidentId: input.incidentId
      })
    };
  } catch (error) {
    bundle = {
      status: "failed",
      reason: error instanceof Error ? error.message : String(error)
    };
  }

  let reproduction: {
    status: "ready" | "pending" | "failed";
    body?: unknown;
    reason?: string | null;
  };
  try {
    reproduction = {
      status: "ready",
      body: await getLocalReproduction({
        incidentId: input.incidentId
      })
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
  }) as Record<string, unknown>;
}

export function createRetrievalMcpTools(api: {
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
  }): Promise<{ incidents: unknown[]; next_cursor: string | null }>;
  getIncident(input: { bearerToken: string; incidentId: string }): Promise<unknown>;
  getIncidentContext(input: { bearerToken: string; incidentId: string }): Promise<unknown>;
  resolveIncident(input: { bearerToken: string; incidentId: string }): Promise<unknown>;
  resolveIncidents?(input: { bearerToken: string; incidentIds: string[] }): Promise<unknown[]>;
  reopenIncident(input: { bearerToken: string; incidentId: string }): Promise<unknown>;
  reopenIncidents?(input: { bearerToken: string; incidentIds: string[] }): Promise<unknown[]>;
  getBundle(input: { bearerToken: string; incidentId: string }): Promise<unknown>;
  getLogs(input: {
    bearerToken: string;
    incidentId: string;
    level?: string;
    cursor?: string;
    limit?: number;
  }): Promise<unknown>;
  getReproduction(input: { bearerToken: string; incidentId: string }): Promise<unknown>;
}): Record<(typeof RETRIEVAL_MCP_TOOL_NAMES)[number], (input: Record<string, unknown>) => Promise<unknown>> {
  type IncidentListEntry = {
    incident_id: string;
    last_seen_at: string;
  } & Record<string, unknown>;

  return {
    async list_incidents(input) {
      try {
        const incidentFilters = readIncidentListFilters(input);

        if (await shouldUseLocalSource(input)) {
          return await listLocalIncidents(incidentFilters);
        }

        if (await shouldCombineLocalAndCloudSource(input)) {
          const localIncidents = await listLocalIncidents({
            ...(incidentFilters.projectId === undefined ? {} : { projectId: incidentFilters.projectId }),
            ...(incidentFilters.environment === undefined ? {} : { environment: incidentFilters.environment }),
            ...(incidentFilters.service === undefined ? {} : { service: incidentFilters.service }),
            ...(incidentFilters.status === undefined ? {} : { status: incidentFilters.status }),
            ...(incidentFilters.severity === undefined ? {} : { severity: incidentFilters.severity }),
            ...(incidentFilters.firstSeenAfter === undefined ? {} : { firstSeenAfter: incidentFilters.firstSeenAfter }),
            ...(incidentFilters.attentionAfter === undefined ? {} : { attentionAfter: incidentFilters.attentionAfter })
          });
          const cloudIncidents = await listAllCloudIncidents(input, {
            listIncidents: (requestInput) => api.listIncidents(requestInput)
          });

          return paginateIncidents<IncidentListEntry>(
            [...localIncidents.incidents, ...cloudIncidents] as IncidentListEntry[],
            {
              ...(incidentFilters.cursor === undefined ? {} : { cursor: incidentFilters.cursor }),
              ...(incidentFilters.limit === undefined ? {} : { limit: incidentFilters.limit })
            }
          );
        }

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
          bearerToken: await requireCloudBearerToken(input)
        };
        if (incidentFilters.projectId !== undefined) {
          requestInput.projectId = incidentFilters.projectId;
        }
        if (incidentFilters.environment !== undefined) {
          requestInput.environment = incidentFilters.environment;
        }
        if (incidentFilters.service !== undefined) {
          requestInput.service = incidentFilters.service;
        }
        if (incidentFilters.status !== undefined) {
          requestInput.status = incidentFilters.status;
        }
        if (incidentFilters.severity !== undefined) {
          requestInput.severity = incidentFilters.severity;
        }
        if (incidentFilters.firstSeenAfter !== undefined) {
          requestInput.firstSeenAfter = incidentFilters.firstSeenAfter;
        }
        if (incidentFilters.attentionAfter !== undefined) {
          requestInput.attentionAfter = incidentFilters.attentionAfter;
        }
        if (incidentFilters.cursor !== undefined) {
          requestInput.cursor = incidentFilters.cursor;
        }
        if (incidentFilters.limit !== undefined) {
          requestInput.limit = incidentFilters.limit;
        }

        const incidents = await api.listIncidents(requestInput);
        return {
          ...incidents,
          incidents: incidents.incidents.map((incident) => attachSourceToRecord(incident as Record<string, unknown>, "cloud"))
        };
      } catch (error) {
        mapMcpError(error);
      }
    },
    async get_incident(input) {
      try {
        if (await shouldUseLocalSource(input)) {
          return {
            incident: await getLocalIncident({
              incidentId: String(input["incidentId"])
            })
          };
        }

        if (await shouldCombineLocalAndCloudSource(input)) {
          try {
            return {
              incident: await getLocalIncident({
                incidentId: String(input["incidentId"])
              })
            };
          } catch (error) {
            if (!isNotFoundRetrievalError(error)) {
              throw error;
            }
          }
        }

        return {
          incident: attachSourceToRecord(
            (await api.getIncident({
              bearerToken: await requireCloudBearerToken(input),
              incidentId: String(input["incidentId"])
            })) as Record<string, unknown>,
            "cloud"
          )
        };
      } catch (error) {
        mapMcpError(error);
      }
    },
    async get_incident_context(input) {
      try {
        if (await shouldUseLocalSource(input)) {
          return await readLocalIncidentContext({
            incidentId: String(input["incidentId"])
          });
        }

        if (await shouldCombineLocalAndCloudSource(input)) {
          try {
            return await readLocalIncidentContext({
              incidentId: String(input["incidentId"])
            });
          } catch (error) {
            if (!isNotFoundRetrievalError(error)) {
              throw error;
            }
          }
        }

        return attachSourceToIncidentContext(
          (await api.getIncidentContext({
            bearerToken: await requireCloudBearerToken(input),
            incidentId: String(input["incidentId"])
          })) as {
            incident: Record<string, unknown>;
          } & Record<string, unknown>,
          "cloud"
        );
      } catch (error) {
        mapMcpError(error);
      }
    },
    async resolve_incident(input) {
      try {
        if (await shouldUseLocalSource(input)) {
          return {
            incident: await resolveLocalIncident({
              incidentId: String(input["incidentId"])
            })
          };
        }

        if (await shouldCombineLocalAndCloudSource(input)) {
          try {
            return {
              incident: await resolveLocalIncident({
                incidentId: String(input["incidentId"])
              })
            };
          } catch (error) {
            if (!isNotFoundRetrievalError(error)) {
              throw error;
            }
          }
        }

        return {
          incident: await (async () => {
            const incident = attachSourceToRecord(
              (await api.resolveIncident({
                bearerToken: await requireCloudBearerToken(input),
                incidentId: String(input["incidentId"])
              })) as Record<string, unknown>,
              "cloud"
            );

            await syncCloudIncidentCacheStatus({
              incidentId: String(input["incidentId"]),
              incident: {
                ...(typeof incident["status"] === "string" ? { status: incident["status"] } : {}),
                resolved_at:
                  typeof incident["resolved_at"] === "string" || incident["resolved_at"] === null
                    ? incident["resolved_at"]
                    : null
              }
            });

            return incident;
          })()
        };
      } catch (error) {
        mapMcpError(error);
      }
    },
    async resolve_incidents(input) {
      try {
        const incidentIds = Array.from(
          new Set((Array.isArray(input["incidentIds"]) ? input["incidentIds"] : []).map((value) => String(value)))
        );
        const localIncidents = new Map<string, Record<string, unknown>>();
        const cloudIncidentIds: string[] = [];

        if (await shouldUseLocalSource(input)) {
          return {
            incidents: await Promise.all(
              incidentIds.map((incidentId) => resolveLocalIncident({ incidentId }))
            )
          };
        }

        if (await shouldCombineLocalAndCloudSource(input)) {
          for (const incidentId of incidentIds) {
            try {
              localIncidents.set(incidentId, await resolveLocalIncident({ incidentId }));
            } catch (error) {
              if (!isNotFoundRetrievalError(error)) {
                throw error;
              }

              cloudIncidentIds.push(incidentId);
            }
          }
        } else {
          cloudIncidentIds.push(...incidentIds);
        }

        if (cloudIncidentIds.length > 0) {
          const cloudIncidents =
            api.resolveIncidents === undefined
              ? await Promise.all(
                  cloudIncidentIds.map(async (incidentId) =>
                    attachSourceToRecord(
                      (await api.resolveIncident({
                        bearerToken: await requireCloudBearerToken(input),
                        incidentId
                      })) as Record<string, unknown>,
                      "cloud"
                    )
                  )
                )
              : ((await api.resolveIncidents({
                  bearerToken: await requireCloudBearerToken(input),
                  incidentIds: cloudIncidentIds
                })) as Record<string, unknown>[]).map((incident) => attachSourceToRecord(incident, "cloud"));

          for (const incident of cloudIncidents) {
            await syncCloudIncidentCacheStatus({
              incidentId: String(incident["incident_id"]),
              incident: {
                ...(typeof incident["status"] === "string" ? { status: incident["status"] } : {}),
                resolved_at:
                  typeof incident["resolved_at"] === "string" || incident["resolved_at"] === null
                    ? incident["resolved_at"]
                    : null
              }
            });
            localIncidents.set(String(incident["incident_id"]), incident);
          }
        }

        return {
          incidents: incidentIds.map((incidentId) => localIncidents.get(incidentId)!)
        };
      } catch (error) {
        mapMcpError(error);
      }
    },
    async reopen_incident(input) {
      try {
        if (await shouldUseLocalSource(input)) {
          return {
            incident: await reopenLocalIncident({
              incidentId: String(input["incidentId"])
            })
          };
        }

        if (await shouldCombineLocalAndCloudSource(input)) {
          try {
            return {
              incident: await reopenLocalIncident({
                incidentId: String(input["incidentId"])
              })
            };
          } catch (error) {
            if (!isNotFoundRetrievalError(error)) {
              throw error;
            }
          }
        }

        return {
          incident: await (async () => {
            const incident = attachSourceToRecord(
              (await api.reopenIncident({
                bearerToken: await requireCloudBearerToken(input),
                incidentId: String(input["incidentId"])
              })) as Record<string, unknown>,
              "cloud"
            );

            await syncCloudIncidentCacheStatus({
              incidentId: String(input["incidentId"]),
              incident: {
                ...(typeof incident["status"] === "string" ? { status: incident["status"] } : {}),
                resolved_at: null
              }
            });

            return incident;
          })()
        };
      } catch (error) {
        mapMcpError(error);
      }
    },
    async reopen_incidents(input) {
      try {
        const incidentIds = Array.from(
          new Set((Array.isArray(input["incidentIds"]) ? input["incidentIds"] : []).map((value) => String(value)))
        );
        const localIncidents = new Map<string, Record<string, unknown>>();
        const cloudIncidentIds: string[] = [];

        if (await shouldUseLocalSource(input)) {
          return {
            incidents: await Promise.all(
              incidentIds.map((incidentId) => reopenLocalIncident({ incidentId }))
            )
          };
        }

        if (await shouldCombineLocalAndCloudSource(input)) {
          for (const incidentId of incidentIds) {
            try {
              localIncidents.set(incidentId, await reopenLocalIncident({ incidentId }));
            } catch (error) {
              if (!isNotFoundRetrievalError(error)) {
                throw error;
              }

              cloudIncidentIds.push(incidentId);
            }
          }
        } else {
          cloudIncidentIds.push(...incidentIds);
        }

        if (cloudIncidentIds.length > 0) {
          const cloudIncidents =
            api.reopenIncidents === undefined
              ? await Promise.all(
                  cloudIncidentIds.map(async (incidentId) =>
                    attachSourceToRecord(
                      (await api.reopenIncident({
                        bearerToken: await requireCloudBearerToken(input),
                        incidentId
                      })) as Record<string, unknown>,
                      "cloud"
                    )
                  )
                )
              : ((await api.reopenIncidents({
                  bearerToken: await requireCloudBearerToken(input),
                  incidentIds: cloudIncidentIds
                })) as Record<string, unknown>[]).map((incident) => attachSourceToRecord(incident, "cloud"));

          for (const incident of cloudIncidents) {
            await syncCloudIncidentCacheStatus({
              incidentId: String(incident["incident_id"]),
              incident: {
                ...(typeof incident["status"] === "string" ? { status: incident["status"] } : {}),
                resolved_at: null
              }
            });
            localIncidents.set(String(incident["incident_id"]), incident);
          }
        }

        return {
          incidents: incidentIds.map((incidentId) => localIncidents.get(incidentId)!)
        };
      } catch (error) {
        mapMcpError(error);
      }
    },
    async get_bundle(input) {
      try {
        if (await shouldUseLocalSource(input)) {
          return await getLocalBundle({
            incidentId: String(input["incidentId"])
          });
        }

        if (await shouldCombineLocalAndCloudSource(input)) {
          try {
            return await getLocalBundle({
              incidentId: String(input["incidentId"])
            });
          } catch (error) {
            if (!isNotFoundRetrievalError(error)) {
              throw error;
            }
          }
        }

        return cacheCloudBundleArtifact(
          {
            incidentId: String(input["incidentId"]),
            bundle: await api.getBundle({
              bearerToken: await requireCloudBearerToken(input),
              incidentId: String(input["incidentId"])
            })
          }
        );
      } catch (error) {
        mapMcpError(error);
      }
    },
    async get_logs(input) {
      try {
        const requestInput: {
          bearerToken: string;
          incidentId: string;
          level?: string;
          cursor?: string;
          limit?: number;
        } = {
          bearerToken: await requireCloudBearerToken(input),
          incidentId: String(input["incidentId"])
        };
        if (typeof input["level"] === "string") {
          requestInput.level = input["level"];
        }
        if (typeof input["cursor"] === "string") {
          requestInput.cursor = input["cursor"];
        }
        if (typeof input["limit"] === "number") {
          requestInput.limit = input["limit"];
        }

        return await api.getLogs(requestInput);
      } catch (error) {
        mapMcpError(error);
      }
    },
    async get_reproduction(input) {
      try {
        if (await shouldUseLocalSource(input)) {
          return await getLocalReproduction({
            incidentId: String(input["incidentId"])
          });
        }

        if (await shouldCombineLocalAndCloudSource(input)) {
          try {
            return await getLocalReproduction({
              incidentId: String(input["incidentId"])
            });
          } catch (error) {
            if (!isNotFoundRetrievalError(error)) {
              throw error;
            }
          }
        }

        return cacheCloudReproductionArtifact(
          {
            incidentId: String(input["incidentId"]),
            reproduction: await api.getReproduction({
              bearerToken: await requireCloudBearerToken(input),
              incidentId: String(input["incidentId"])
            })
          }
        );
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}
