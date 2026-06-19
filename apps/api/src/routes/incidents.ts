import { gunzipSync } from "node:zlib";
import type { FastifyInstance } from "fastify";

import {
  buildBundleObjectKey,
  buildIncidentContextRecord,
  buildReproductionObjectKey,
  type IncidentContextArtifactRecord,
  type IncidentRetrievalRecord
} from "../../../../packages/storage/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import {
  isObjectNotFoundError,
  parseIncidentsCursor,
  parseLogsCursor,
  requireRateLimitedMemberAuth,
  serializeCursorTimestamp
} from "../api-helpers.js";
import { BulkIncidentMutationBodySchema, IncidentParamsSchema, IncidentsQuerySchema, LogsQuerySchema } from "../schemas.js";

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

async function resolveProjectOrganizationId(input: {
  dependencies: ApiDependencies;
  memberId: string;
  fallbackOrganizationId: string;
  projectId: string;
}): Promise<string> {
  const access = await input.dependencies.projectManagement?.resolveProjectAccessForUser?.({
    user_id: input.memberId,
    project_id: input.projectId
  });

  return access?.organization_id ?? input.fallbackOrganizationId;
}

function dedupeIncidentIds(incidentIds: string[]): string[] {
  return [...new Set(incidentIds)];
}

async function resolveBulkIncidentOrganizationGroups(input: {
  dependencies: ApiDependencies;
  member: { member_id: string; organization_id: string };
  incidentIds: string[];
}): Promise<{ incidents: IncidentRetrievalRecord[]; groups: Map<string, string[]> } | null> {
  const incidents = await Promise.all(
    input.incidentIds.map((incidentId) =>
      input.dependencies.incidentRetrieval.getIncidentForOrganization({
        organization_id: input.member.organization_id,
        incident_id: incidentId,
        user_id: input.member.member_id
      })
    )
  );

  if (incidents.some((incident) => incident === null)) {
    return null;
  }

  const resolvedIncidents = incidents as IncidentRetrievalRecord[];
  const organizationIds = await Promise.all(
    resolvedIncidents.map((incident) =>
      resolveProjectOrganizationId({
        dependencies: input.dependencies,
        memberId: input.member.member_id,
        fallbackOrganizationId: input.member.organization_id,
        projectId: incident.project_id
      })
    )
  );

  const groups = new Map<string, string[]>();
  for (const [index, organizationId] of organizationIds.entries()) {
    const incidentId = resolvedIncidents[index]!.incident_id;
    const current = groups.get(organizationId);
    if (current === undefined) {
      groups.set(organizationId, [incidentId]);
    } else {
      current.push(incidentId);
    }
  }

  return { incidents: resolvedIncidents, groups };
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
      user_id?: string;
      project_id?: string;
      environment?: string;
      service?: string;
      status?: "active" | "open" | "resolved" | "regressed";
      severity?: "low" | "medium" | "high" | "critical";
      first_seen_after?: string;
      attention_after?: string;
      cursor?: { last_seen_at: string; incident_id: string };
      limit: number;
    } = {
      organization_id: member.organization_id,
      user_id: member.member_id,
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
    if (parsedQuery.data.first_seen_after !== undefined) {
      incidentsRequest.first_seen_after = parsedQuery.data.first_seen_after;
    }
    if (parsedQuery.data.attention_after !== undefined) {
      incidentsRequest.attention_after = parsedQuery.data.attention_after;
    }
    if (parsedCursor !== null) {
      incidentsRequest.cursor = parsedCursor;
    }

    const incidents = await dependencies.incidentRetrieval.listIncidentsForOrganization(incidentsRequest);

    const nextCursorRecord = incidents.length >= parsedQuery.data.limit ? incidents.at(-1) : undefined;
    const nextCursor =
      nextCursorRecord === undefined ? null : `${serializeCursorTimestamp(nextCursorRecord.last_seen_at)}|${nextCursorRecord.incident_id}`;

    return reply.status(200).send({
      incidents,
      next_cursor: nextCursor
    });
  });

  app.post("/v1/incidents/resolve", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "retrieval-write");
    if (member === null) {
      return;
    }

    if (dependencies.incidentRetrieval.resolveIncidentsForOrganization === undefined) {
      return reply.status(500).send({
        error: "incident_resolution_unavailable"
      });
    }

    const parsedBody = BulkIncidentMutationBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_body"
      });
    }

    const incidentIds = dedupeIncidentIds(parsedBody.data.incident_ids);
    const targets = await resolveBulkIncidentOrganizationGroups({
      dependencies,
      member,
      incidentIds
    });
    if (targets === null) {
      return reply.status(404).send({
        error: "incident_not_found"
      });
    }

    const resolvedAt = new Date().toISOString();
    const incidentsById = new Map<string, IncidentRetrievalRecord>();
    for (const [organizationId, groupedIncidentIds] of targets.groups.entries()) {
      const incidents = await dependencies.incidentRetrieval.resolveIncidentsForOrganization({
        organization_id: organizationId,
        incident_ids: groupedIncidentIds,
        user_id: member.member_id,
        resolved_by_member_id: member.member_id,
        resolved_at: resolvedAt
      });
      for (const incident of incidents) {
        incidentsById.set(incident.incident_id, incident);
      }
    }

    if (incidentsById.size !== incidentIds.length) {
      return reply.status(404).send({
        error: "incident_not_found"
      });
    }

    return reply.status(200).send({
      incidents: incidentIds.map((incidentId) => incidentsById.get(incidentId)!)
    });
  });

  app.post("/v1/incidents/reopen", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "retrieval-write");
    if (member === null) {
      return;
    }

    if (dependencies.incidentRetrieval.reopenIncidentsForOrganization === undefined) {
      return reply.status(500).send({
        error: "incident_reopen_unavailable"
      });
    }

    const parsedBody = BulkIncidentMutationBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_body"
      });
    }

    const incidentIds = dedupeIncidentIds(parsedBody.data.incident_ids);
    const targets = await resolveBulkIncidentOrganizationGroups({
      dependencies,
      member,
      incidentIds
    });
    if (targets === null) {
      return reply.status(404).send({
        error: "incident_not_found"
      });
    }

    const incidentsById = new Map<string, IncidentRetrievalRecord>();
    for (const [organizationId, groupedIncidentIds] of targets.groups.entries()) {
      const incidents = await dependencies.incidentRetrieval.reopenIncidentsForOrganization({
        organization_id: organizationId,
        incident_ids: groupedIncidentIds,
        user_id: member.member_id
      });
      for (const incident of incidents) {
        incidentsById.set(incident.incident_id, incident);
      }
    }

    if (incidentsById.size !== incidentIds.length) {
      return reply.status(404).send({
        error: "incident_not_found"
      });
    }

    return reply.status(200).send({
      incidents: incidentIds.map((incidentId) => incidentsById.get(incidentId)!)
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
      incident_id: parsedParams.data.id,
      user_id: member.member_id
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
      incident_id: parsedParams.data.id,
      user_id: member.member_id
    });

    if (incident === null) {
      return reply.status(404).send({
        error: "incident_not_found"
      });
    }

    const projectOrganizationId = await resolveProjectOrganizationId({
      dependencies,
      memberId: member.member_id,
      fallbackOrganizationId: member.organization_id,
      projectId: incident.project_id
    });

    const [bundle, reproduction, logs] = await Promise.all([
      readBundleArtifactForIncident({
        dependencies,
        organizationId: projectOrganizationId,
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
        user_id: member.member_id,
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

    const existingIncident = await dependencies.incidentRetrieval.getIncidentForOrganization({
      organization_id: member.organization_id,
      incident_id: parsedParams.data.id,
      user_id: member.member_id
    });

    if (existingIncident === null) {
      return reply.status(404).send({
        error: "incident_not_found"
      });
    }

    const projectOrganizationId = await resolveProjectOrganizationId({
      dependencies,
      memberId: member.member_id,
      fallbackOrganizationId: member.organization_id,
      projectId: existingIncident.project_id
    });

    const incident = await dependencies.incidentRetrieval.resolveIncidentForOrganization({
      organization_id: projectOrganizationId,
      incident_id: parsedParams.data.id,
      user_id: member.member_id,
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

    const existingIncident = await dependencies.incidentRetrieval.getIncidentForOrganization({
      organization_id: member.organization_id,
      incident_id: parsedParams.data.id,
      user_id: member.member_id
    });

    if (existingIncident === null) {
      return reply.status(404).send({
        error: "incident_not_found"
      });
    }

    const projectOrganizationId = await resolveProjectOrganizationId({
      dependencies,
      memberId: member.member_id,
      fallbackOrganizationId: member.organization_id,
      projectId: existingIncident.project_id
    });

    const incident = await dependencies.incidentRetrieval.reopenIncidentForOrganization({
      organization_id: projectOrganizationId,
      incident_id: parsedParams.data.id,
      user_id: member.member_id
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
      incident_id: parsedParams.data.id,
      user_id: member.member_id
    });

    if (incident === null) {
      return reply.status(404).send({
        error: "incident_not_found"
      });
    }

    const projectOrganizationId = await resolveProjectOrganizationId({
      dependencies,
      memberId: member.member_id,
      fallbackOrganizationId: member.organization_id,
      projectId: incident.project_id
    });

    const key = buildBundleObjectKey(incident.project_id, incident.incident_id);

    let compressed: Buffer;
    try {
      compressed = await dependencies.objectStoreReader.getObject({ key });
    } catch (error) {
      if (isObjectNotFoundError(error)) {
        const failureReason = await dependencies.incidentRetrieval.getBundleFailureReasonForOrganization?.({
          organization_id: projectOrganizationId,
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
            organization_id: projectOrganizationId,
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
      incident_id: parsedParams.data.id,
      user_id: member.member_id
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
      user_id?: string;
      incident_id: string;
      limit: number;
      level?: string;
      cursor?: { occurred_at: string; event_id: string };
    } = {
      organization_id: member.organization_id,
      user_id: member.member_id,
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
      nextCursorRecord === undefined ? null : `${serializeCursorTimestamp(nextCursorRecord.occurred_at)}|${nextCursorRecord.event_id}`;

    return reply.status(200).send({
      logs,
      next_cursor: nextCursor
    });
  });
}
