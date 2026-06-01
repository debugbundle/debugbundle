import { gunzipSync } from "node:zlib";
import type { FastifyInstance } from "fastify";

import { buildImprovementBundleObjectKey } from "../../../../packages/storage/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import {
  isObjectNotFoundError,
  parseImprovementsCursor,
  requireRateLimitedMemberAuth,
  requireRateLimitedProjectAccess
} from "../api-helpers.js";
import {
  ImprovementParamsSchema,
  ImprovementSnoozeBodySchema,
  ImprovementsQuerySchema,
  ProjectImprovementParamsSchema
} from "../schemas.js";

function buildBundlePendingOrFailureState(input: {
  kind: string;
  relatedIncidentIds: string[];
  bundleGenerationNumber: number;
  bundleFailureReason: string | null;
}): { status: "pending" } | { status: "failed"; reason: string; related_incident_ids?: string[] } {
  if (input.kind === "recurring_incident" || input.kind === "post_deploy_regression") {
    return {
      status: "failed",
      reason: "covered_by_incident_bundle",
      related_incident_ids: input.relatedIncidentIds
    };
  }

  if (input.bundleFailureReason !== null) {
    return {
      status: "failed",
      reason: input.bundleFailureReason
    };
  }

  if (input.bundleGenerationNumber === 0) {
    return {
      status: "failed",
      reason: "bundle_not_generated_yet"
    };
  }

  return {
    status: "pending"
  };
}

export function registerImprovementRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.get("/v1/improvements", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "retrieval-read");
    if (member === null) {
      return;
    }

    if (dependencies.improvementManagement === undefined) {
      return reply.status(404).send({ error: "improvements_not_available" });
    }

    const parsedQuery = ImprovementsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const parsedCursor = parseImprovementsCursor(parsedQuery.data.cursor);
    if (parsedQuery.data.cursor !== undefined && parsedCursor === null) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const improvements = await dependencies.improvementManagement.listImprovementsForOrganization({
      organization_id: member.organization_id,
      user_id: member.member_id,
      ...(parsedQuery.data.project_id === undefined ? {} : { project_id: parsedQuery.data.project_id }),
      ...(parsedQuery.data.environment === undefined ? {} : { environment: parsedQuery.data.environment }),
      ...(parsedQuery.data.service === undefined ? {} : { service: parsedQuery.data.service }),
      ...(parsedQuery.data.status === undefined ? {} : { status: parsedQuery.data.status }),
      ...(parsedQuery.data.severity === undefined ? {} : { severity: parsedQuery.data.severity }),
      ...(parsedQuery.data.kind === undefined ? {} : { kind: parsedQuery.data.kind }),
      ...(parsedCursor === null ? {} : { cursor: parsedCursor }),
      limit: parsedQuery.data.limit
    });

    const nextCursorRecord = improvements.length >= parsedQuery.data.limit ? improvements.at(-1) : undefined;
    const nextCursor =
      nextCursorRecord === undefined ? null : `${nextCursorRecord.last_detected_at}|${nextCursorRecord.improvement_id}`;

    return reply.status(200).send({
      improvements,
      next_cursor: nextCursor
    });
  });

  app.get("/v1/improvements/:id", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "retrieval-read");
    if (member === null) {
      return;
    }

    if (dependencies.improvementManagement === undefined) {
      return reply.status(404).send({ error: "improvements_not_available" });
    }

    const parsedParams = ImprovementParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_improvement_id" });
    }

    const improvement = await dependencies.improvementManagement.getImprovementForOrganization({
      organization_id: member.organization_id,
      improvement_id: parsedParams.data.id,
      user_id: member.member_id
    });

    if (improvement === null) {
      return reply.status(404).send({ error: "improvement_not_found" });
    }

    return reply.status(200).send({ improvement });
  });

  app.post("/v1/improvements/:id/resolve", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "retrieval-write");
    if (member === null) {
      return;
    }

    if (dependencies.improvementManagement?.resolveImprovementForOrganization === undefined) {
      return reply.status(404).send({ error: "improvement_resolution_unavailable" });
    }

    const parsedParams = ImprovementParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_improvement_id" });
    }

    const improvement = await dependencies.improvementManagement.resolveImprovementForOrganization({
      organization_id: member.organization_id,
      improvement_id: parsedParams.data.id,
      user_id: member.member_id,
      resolved_by_member_id: member.member_id,
      resolved_at: new Date().toISOString()
    });

    if (improvement === null) {
      return reply.status(404).send({ error: "improvement_not_found" });
    }

    return reply.status(200).send({ improvement });
  });

  app.post("/v1/improvements/:id/reopen", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "retrieval-write");
    if (member === null) {
      return;
    }

    if (dependencies.improvementManagement?.reopenImprovementForOrganization === undefined) {
      return reply.status(404).send({ error: "improvement_reopen_unavailable" });
    }

    const parsedParams = ImprovementParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_improvement_id" });
    }

    const improvement = await dependencies.improvementManagement.reopenImprovementForOrganization({
      organization_id: member.organization_id,
      improvement_id: parsedParams.data.id,
      user_id: member.member_id
    });

    if (improvement === null) {
      return reply.status(404).send({ error: "improvement_not_found" });
    }

    return reply.status(200).send({ improvement });
  });

  app.post("/v1/improvements/:id/snooze", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "retrieval-write");
    if (member === null) {
      return;
    }

    if (dependencies.improvementManagement?.snoozeImprovementForOrganization === undefined) {
      return reply.status(404).send({ error: "improvement_snooze_unavailable" });
    }

    const parsedParams = ImprovementParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_improvement_id" });
    }

    const parsedBody = ImprovementSnoozeBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_snooze_until" });
    }

    if (new Date(parsedBody.data.snoozed_until).getTime() <= Date.now()) {
      return reply.status(400).send({ error: "invalid_snooze_until" });
    }

    const improvement = await dependencies.improvementManagement.snoozeImprovementForOrganization({
      organization_id: member.organization_id,
      improvement_id: parsedParams.data.id,
      user_id: member.member_id,
      snoozed_until: parsedBody.data.snoozed_until
    });

    if (improvement === null) {
      return reply.status(404).send({ error: "improvement_not_found" });
    }

    return reply.status(200).send({ improvement });
  });

  app.get("/v1/projects/:id/improvements/:improvementId/bundle", async (request, reply) => {
    const parsedParams = ProjectImprovementParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_improvement_id" });
    }

    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "retrieval-read",
      projectId: parsedParams.data.id
    });
    if (auth === null) {
      return;
    }

    if (dependencies.improvementManagement === undefined) {
      return reply.status(404).send({ error: "improvements_not_available" });
    }

    const improvement = await dependencies.improvementManagement.getImprovementForOrganization({
      organization_id: auth.access.organization_id,
      improvement_id: parsedParams.data.improvementId,
      user_id: auth.member.member_id
    });
    if (improvement === null || improvement.project_id !== parsedParams.data.id) {
      return reply.status(404).send({ error: "improvement_not_found" });
    }

    const key = buildImprovementBundleObjectKey(parsedParams.data.id, parsedParams.data.improvementId);

    try {
      const compressed = await dependencies.objectStoreReader.getObject({ key });
      return reply.status(200).send(JSON.parse(gunzipSync(compressed).toString("utf8")));
    } catch (error) {
      if (isObjectNotFoundError(error)) {
        return reply.status(200).send(
          buildBundlePendingOrFailureState({
            kind: typeof improvement.kind === "string" ? improvement.kind : "",
            relatedIncidentIds: Array.isArray(improvement.related_incident_ids) ? improvement.related_incident_ids : [],
            bundleGenerationNumber: improvement.bundle_generation_number,
            bundleFailureReason: improvement.bundle_failure_reason
          })
        );
      }

      return reply.status(200).send({
        status: "failed",
        reason: "bundle_artifact_unavailable"
      });
    }
  });
}
