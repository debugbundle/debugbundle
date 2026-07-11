import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  AnalyticsSavedFunnelCreateSchema,
  AnalyticsSavedFunnelKeySchema,
  AnalyticsSavedFunnelResponseSchema,
  AnalyticsSavedFunnelsResponseSchema,
  AnalyticsSavedFunnelUpdateSchema,
  getTierCapabilities
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedProjectAccess } from "../api-helpers.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";
import { ProjectParamsSchema } from "../schemas.js";

const SavedFunnelParamsSchema = ProjectParamsSchema.extend({
  funnelKey: AnalyticsSavedFunnelKeySchema
}).strict();

type SavedFunnelAccessContext = {
  management: NonNullable<ApiDependencies["analyticsSavedFunnels"]>;
  memberId: string;
  actorType: ReturnType<typeof resolveAuditActorType>;
  scope: { organization_id: string; project_id: string };
};

export function registerAnalyticsSavedFunnelRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  app.get("/v1/projects/:id/analytics/saved-funnels", async (request, reply) => {
    const context = await requireSavedFunnelAccess(request, reply, dependencies, false);
    if (context === null) return;
    const funnels = await context.management.listSavedFunnelsForProject(context.scope);
    return reply.status(200).send(AnalyticsSavedFunnelsResponseSchema.parse({ funnels }));
  });

  app.post("/v1/projects/:id/analytics/saved-funnels", async (request, reply) => {
    const context = await requireSavedFunnelAccess(request, reply, dependencies, true);
    if (context === null) return;
    const body = AnalyticsSavedFunnelCreateSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "invalid_payload" });

    const result = await context.management.createSavedFunnelForProject({
      ...context.scope,
      created_by_user_id: context.memberId,
      definition: body.data
    });
    if (result.status !== "created") {
      const status = result.status === "project_not_found" ? 404 : 409;
      await auditSavedFunnel(
        request,
        dependencies,
        context,
        "create",
        body.data.funnel_key,
        "failure",
        result.status
      );
      return reply.status(status).send({ error: `analytics_saved_funnel_${result.status}` });
    }
    await auditSavedFunnel(
      request,
      dependencies,
      context,
      "create",
      body.data.funnel_key,
      "success"
    );
    return reply
      .status(201)
      .send(AnalyticsSavedFunnelResponseSchema.parse({ funnel: result.funnel }));
  });

  app.patch("/v1/projects/:id/analytics/saved-funnels/:funnelKey", async (request, reply) => {
    const params = SavedFunnelParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_saved_funnel" });
    const context = await requireSavedFunnelAccess(request, reply, dependencies, true);
    if (context === null) return;
    const body = AnalyticsSavedFunnelUpdateSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "invalid_payload" });
    const funnel = await context.management.updateSavedFunnelForProject({
      ...context.scope,
      funnel_key: params.data.funnelKey,
      update: body.data
    });
    if (funnel === null) {
      await auditSavedFunnel(
        request,
        dependencies,
        context,
        "update",
        params.data.funnelKey,
        "failure",
        "not_found"
      );
      return reply.status(404).send({ error: "analytics_saved_funnel_not_found" });
    }
    await auditSavedFunnel(
      request,
      dependencies,
      context,
      "update",
      params.data.funnelKey,
      "success"
    );
    return reply.status(200).send(AnalyticsSavedFunnelResponseSchema.parse({ funnel }));
  });

  app.delete("/v1/projects/:id/analytics/saved-funnels/:funnelKey", async (request, reply) => {
    const params = SavedFunnelParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_saved_funnel" });
    const context = await requireSavedFunnelAccess(request, reply, dependencies, true);
    if (context === null) return;
    const funnel = await context.management.archiveSavedFunnelForProject({
      ...context.scope,
      funnel_key: params.data.funnelKey
    });
    if (funnel === null) {
      await auditSavedFunnel(
        request,
        dependencies,
        context,
        "archive",
        params.data.funnelKey,
        "failure",
        "not_found"
      );
      return reply.status(404).send({ error: "analytics_saved_funnel_not_found" });
    }
    await auditSavedFunnel(
      request,
      dependencies,
      context,
      "archive",
      params.data.funnelKey,
      "success"
    );
    return reply.status(200).send(AnalyticsSavedFunnelResponseSchema.parse({ funnel }));
  });
}

async function requireSavedFunnelAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  requireManage: boolean
): Promise<SavedFunnelAccessContext | null> {
  const params = ProjectParamsSchema.passthrough().safeParse(request.params);
  if (!params.success) {
    await reply.status(400).send({ error: "invalid_project_id" });
    return null;
  }
  const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
    bucket: requireManage ? "management-write" : "management-read",
    projectId: params.data.id
  });
  if (auth === null) return null;
  if (!getTierCapabilities(auth.access.organization_plan).analytics_bundle) {
    await reply.status(403).send({ error: "upgrade_required" });
    return null;
  }
  if (
    requireManage &&
    auth.access.effective_role !== "owner" &&
    auth.access.effective_role !== "admin"
  ) {
    await reply.status(403).send({ error: "forbidden" });
    return null;
  }
  if (dependencies.analyticsSavedFunnels === undefined) {
    await reply.status(404).send({ error: "analytics_saved_funnels_not_available" });
    return null;
  }
  return {
    management: dependencies.analyticsSavedFunnels,
    memberId: auth.member.member_id,
    actorType: resolveAuditActorType(request.headers),
    scope: { organization_id: auth.access.organization_id, project_id: params.data.id }
  };
}

async function auditSavedFunnel(
  request: FastifyRequest,
  dependencies: ApiDependencies,
  context: NonNullable<Awaited<ReturnType<typeof requireSavedFunnelAccess>>>,
  action: "create" | "update" | "archive",
  funnelKey: string,
  status: "success" | "failure",
  reason?: string
): Promise<void> {
  await recordAuditLog(dependencies.auditLogging, {
    organization_id: context.scope.organization_id,
    actor_user_id: context.memberId,
    actor_type: context.actorType,
    action: `analytics_saved_funnel.${action}`,
    target_type: "analytics_saved_funnel",
    target_id: `${context.scope.project_id}:${funnelKey}`,
    status,
    ip_address: request.ip,
    metadata: {
      project_id: context.scope.project_id,
      funnel_key: funnelKey,
      ...(reason === undefined ? {} : { reason })
    }
  });
}
