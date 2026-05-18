import { gunzipSync } from "node:zlib";
import type { FastifyInstance } from "fastify";

import {
  buildBundleObjectKey,
  buildIncidentContextRecord,
  buildReproductionObjectKey,
  type IncidentContextArtifactRecord
} from "../../../../packages/storage/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import {
  isObjectNotFoundError,
  parseIncidentsCursor,
  parseLogsCursor,
  requireRateLimitedMemberAuth
} from "../api-helpers.js";
import { IncidentParamsSchema, IncidentsQuerySchema, LogsQuerySchema } from "../schemas.js";

async function readBundleArtifactForIncident(input: {
  dependencies: ApiDependencies;
  organizationId: string;
  incidentId: string;
  projectId: string;
}): Promise<IncidentContextArtifactRecord> {
  const key = buildBundleObjectKey(input.projectId, input.incidentId);

  try {
    const compressed = await input.dependencies.objectStoreReader.getObject({ key });
    return {
      status: "ready",
      body: JSON.parse(gunzipSync(compressed).toString("utf8"))
    };
  } catch (error) {
    if (isObjectNotFoundError(error)) {
      const failureReason = await input.dependencies.incidentRetrieval.getBundleFailureReasonForOrganization?.({
        organization_id: input.organizationId,
        incident_id: input.incidentId
      });

      if (failureReason === "monthly_quota_exceeded") {
        return {
          status: "failed",
          reason: failureReason
        };
      }

      if (input.dependencies.bundleRegeneration !== undefined) {
        const regenerationQueued = await input.dependencies.bundleRegeneration.requestRegeneration({
          organization_id: input.organizationId,
          project_id: input.projectId,
          incident_id: input.incidentId
        });

        if (!regenerationQueued) {
          return {
            status: "failed",
            reason: "bundle_source_unavailable"
          };
        }
      }

      return {
        status: "pending"
      };
    }

    return {
      status: "failed",
      reason: "bundle_artifact_unavailable"
    };
  }
}

async function readReproductionArtifactForIncident(input: {
  dependencies: ApiDependencies;
  incidentId: string;
  projectId: string;
}): Promise<IncidentContextArtifactRecord> {
  const key = buildReproductionObjectKey(input.projectId, input.incidentId);

  try {
    const compressed = await input.dependencies.objectStoreReader.getObject({ key });
    return {
      status: "ready",
      body: JSON.parse(gunzipSync(compressed).toString("utf8"))
    };
  } catch (error) {
    if (isObjectNotFoundError(error)) {
      return {
        status: "pending"
      };
    }

    return {
      status: "failed",
      reason: "reproduction_artifact_unavailable"
    };
  }
}

export function registerIncidentRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.get("/v1/incidents", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "retrieval-read");
    if (member === null) {
      return;
    }

    const parsedQuery = IncidentsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({
        error: "invalid_query"
      });
    }

    const parsedCursor = parseIncidentsCursor(parsedQuery.data.cursor);
    if (parsedQuery.data.cursor !== undefined && parsedCursor === null) {
      return reply.status(400).send({
        error: "invalid_query"
      });
    }

    const incidentsRequest: {
      organization_id: string;
      project_id?: string;
      environment?: string;
      service?: string;
      status?: "open" | "resolved" | "regressed";
      severity?: "low" | "medium" | "high" | "critical";
      cursor?: { last_seen_at: string; incident_id: string };
      limit: number;
    } = {
      organization_id: member.organization_id,
      limit: parsedQuery.data.limit
    };

    if (parsedQuery.data.project_id !== undefined) {
      incidentsRequest.project_id = parsedQuery.data.project_id;
    }
    if (parsedQuery.data.environment !== undefined) {
      incidentsRequest.environment = parsedQuery.data.environment;
    }
    if (parsedQuery.data.service !== undefined) {
      incidentsRequest.service = parsedQuery.data.service;
    }
    if (parsedQuery.data.status !== undefined) {
      incidentsRequest.status = parsedQuery.data.status;
    }
    if (parsedQuery.data.severity !== undefined) {
      incidentsRequest.severity = parsedQuery.data.severity;
    }
    if (parsedCursor !== null) {
      incidentsRequest.cursor = parsedCursor;
    }

    const incidents = await dependencies.incidentRetrieval.listIncidentsForOrganization(incidentsRequest);

    const nextCursorRecord = incidents.length >= parsedQuery.data.limit ? incidents.at(-1) : undefined;
    const nextCursor =
      nextCursorRecord === undefined ? null : `${nextCursorRecord.last_seen_at}|${nextCursorRecord.incident_id}`;

    return reply.status(200).send({
      incidents,
      next_cursor: nextCursor
    });
  });

  app.get("/v1/incidents/:id", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "retrieval-read");
    if (member === null) {
      return;
    }

    const parsedParams = IncidentParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({
        error: "invalid_incident_id"
      });
    }

    const incident = await dependencies.incidentRetrieval.getIncidentForOrganization({
      organization_id: member.organization_id,
      incident_id: parsedParams.data.id
    });

    if (incident === null) {
      return reply.status(404).send({
        error: "incident_not_found"
      });
    }

    return reply.status(200).send({
      incident
    });
  });

  app.get("/v1/incidents/:id/context", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "retrieval-read");
    if (member === null) {
      return;
    }

    const parsedParams = IncidentParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({
        error: "invalid_incident_id"
      });
    }

    const incident = await dependencies.incidentRetrieval.getIncidentForOrganization({
      organization_id: member.organization_id,
      incident_id: parsedParams.data.id
    });

    if (incident === null) {
      return reply.status(404).send({
        error: "incident_not_found"
      });
    }

    const [bundle, reproduction, logs] = await Promise.all([
      readBundleArtifactForIncident({
        dependencies,
        organizationId: member.organization_id,
        incidentId: incident.incident_id,
        projectId: incident.project_id
      }),
      readReproductionArtifactForIncident({
        dependencies,
        incidentId: incident.incident_id,
        projectId: incident.project_id
      }),
      dependencies.incidentRetrieval.listIncidentLogsForOrganization({
        organization_id: member.organization_id,
        incident_id: incident.incident_id,
        limit: 20
      })
    ]);

    return reply.status(200).send(
      buildIncidentContextRecord({
        incident,
        bundle,
        reproduction,
        logs: {
          logs,
          next_cursor: null
        }
      })
    );
  });

  app.post("/v1/incidents/:id/resolve", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "retrieval-write");
    if (member === null) {
      return;
    }

    if (dependencies.incidentRetrieval.resolveIncidentForOrganization === undefined) {
      return reply.status(500).send({
        error: "incident_resolution_unavailable"
      });
    }

    const parsedParams = IncidentParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({
        error: "invalid_incident_id"
      });
    }

    const incident = await dependencies.incidentRetrieval.resolveIncidentForOrganization({
      organization_id: member.organization_id,
      incident_id: parsedParams.data.id,
      resolved_by_member_id: member.member_id,
      resolved_at: new Date().toISOString()
    });

    if (incident === null) {
      return reply.status(404).send({
        error: "incident_not_found"
      });
    }

    return reply.status(200).send({
      incident
    });
  });

  app.post("/v1/incidents/:id/reopen", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "retrieval-write");
    if (member === null) {
      return;
    }

    if (dependencies.incidentRetrieval.reopenIncidentForOrganization === undefined) {
      return reply.status(500).send({
        error: "incident_reopen_unavailable"
      });
    }

    const parsedParams = IncidentParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({
        error: "invalid_incident_id"
      });
    }

    const incident = await dependencies.incidentRetrieval.reopenIncidentForOrganization({
      organization_id: member.organization_id,
      incident_id: parsedParams.data.id
    });

    if (incident === null) {
      return reply.status(404).send({
        error: "incident_not_found"
      });
    }

    return reply.status(200).send({
      incident
    });
  });

  app.get("/v1/incidents/:id/bundle", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "retrieval-read");
    if (member === null) {
      return;
    }

    const parsedParams = IncidentParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({
        error: "invalid_incident_id"
      });
    }

    const incident = await dependencies.incidentRetrieval.getIncidentForOrganization({
      organization_id: member.organization_id,
      incident_id: parsedParams.data.id
    });

    if (incident === null) {
      return reply.status(404).send({
        error: "incident_not_found"
      });
    }

    const key = buildBundleObjectKey(incident.project_id, incident.incident_id);

    let compressed: Buffer;
    try {
      compressed = await dependencies.objectStoreReader.getObject({ key });
    } catch (error) {
      if (isObjectNotFoundError(error)) {
        const failureReason = await dependencies.incidentRetrieval.getBundleFailureReasonForOrganization?.({
          organization_id: member.organization_id,
          incident_id: parsedParams.data.id
        });

        // Non-retryable: quota exceeded is a billing-level block.
        if (failureReason === "monthly_quota_exceeded") {
          return reply.status(200).send({
            status: "failed",
            reason: failureReason
          });
        }

        // Attempt auto-regeneration: the events still exist, so re-enqueue a build.
        if (dependencies.bundleRegeneration !== undefined) {
          const regenerationQueued = await dependencies.bundleRegeneration.requestRegeneration({
            organization_id: member.organization_id,
            project_id: incident.project_id,
            incident_id: incident.incident_id
          });

          if (!regenerationQueued) {
            return reply.status(200).send({
              status: "failed",
              reason: "bundle_source_unavailable"
            });
          }
        }

        return reply.status(200).send({
          status: "pending"
        });
      }

      return reply.status(200).send({
        status: "failed",
        reason: "bundle_artifact_unavailable"
      });
    }

    try {
      const parsedBundle: unknown = JSON.parse(gunzipSync(compressed).toString("utf8"));
      return reply.status(200).send(parsedBundle);
    } catch {
      return reply.status(200).send({
        status: "failed",
        reason: "bundle_artifact_invalid"
      });
    }
  });

  app.get("/v1/incidents/:id/reproduction", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "retrieval-read");
    if (member === null) {
      return;
    }

    const parsedParams = IncidentParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({
        error: "invalid_incident_id"
      });
    }

    const incident = await dependencies.incidentRetrieval.getIncidentForOrganization({
      organization_id: member.organization_id,
      incident_id: parsedParams.data.id
    });

    if (incident === null) {
      return reply.status(404).send({
        error: "incident_not_found"
      });
    }

    const key = buildReproductionObjectKey(incident.project_id, incident.incident_id);

    try {
      const body = await dependencies.objectStoreReader.getObject({ key });
      const parsedReproduction: unknown = JSON.parse(gunzipSync(body).toString("utf8"));
      return reply.status(200).send(parsedReproduction);
    } catch (error) {
      if (isObjectNotFoundError(error)) {
        return reply.status(200).send({
          status: "pending"
        });
      }

      return reply.status(404).send({
        error: "reproduction_not_found"
      });
    }
  });

  app.get("/v1/logs", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "retrieval-read");
    if (member === null) {
      return;
    }

    const parsedQuery = LogsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({
        error: "invalid_query"
      });
    }

    const parsedCursor = parseLogsCursor(parsedQuery.data.cursor);
    if (parsedQuery.data.cursor !== undefined && parsedCursor === null) {
      return reply.status(400).send({
        error: "invalid_query"
      });
    }

    const logsRequest: {
      organization_id: string;
      incident_id: string;
      limit: number;
      level?: string;
      cursor?: { occurred_at: string; event_id: string };
    } = {
      organization_id: member.organization_id,
      incident_id: parsedQuery.data.incident_id,
      limit: parsedQuery.data.limit
    };

    if (parsedQuery.data.level !== undefined) {
      logsRequest.level = parsedQuery.data.level;
    }
    if (parsedCursor !== null) {
      logsRequest.cursor = parsedCursor;
    }

    const logs = await dependencies.incidentRetrieval.listIncidentLogsForOrganization(logsRequest);

    const nextCursorRecord = logs.length >= parsedQuery.data.limit ? logs.at(-1) : undefined;
    const nextCursor =
      nextCursorRecord === undefined ? null : `${nextCursorRecord.occurred_at}|${nextCursorRecord.event_id}`;

    return reply.status(200).send({
      logs,
      next_cursor: nextCursor
    });
  });
}
