import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { validateAnalyticsMeasurementPlan } from "../../../../packages/analytics-engine/src/measurement-plan.js";
import {
  AnalyticsMeasurementPlanSchema,
  AnalyticsProjectPlanApplyRequestSchema,
  AnalyticsProjectPlanApplyResponseSchema,
  AnalyticsProjectPlanPreviewSchema,
  AnalyticsProjectPlanRecordSchema,
  AnalyticsProjectPlanValidationResponseSchema
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedProjectAccess } from "../api-helpers.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";

const Params = z.object({ id: z.string().uuid() }).strict();
const options = { bodyLimit: 256 * 1024 };

export function registerAnalyticsPlanRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  app.get("/v1/projects/:id/analytics/plan", async (request, reply) => {
    const context = await requireAccess(request, reply, dependencies, "management-read");
    if (context === null) return;
    const current = await context.store.read({
      projectId: context.projectId,
      actorUserId: context.member.member_id
    });
    if (current === null) return reply.status(404).send({ error: "analytics_plan_not_found" });
    return reply.send(AnalyticsProjectPlanRecordSchema.parse(current));
  });

  app.post("/v1/projects/:id/analytics/plan/validate", options, async (request, reply) => {
    const context = await requireAccess(request, reply, dependencies, "management-read");
    if (context === null) return;
    const plan = parsePlan(request.body, context.projectId);
    if (plan === null) return reply.status(400).send({ error: "invalid_payload" });
    const result = validateAnalyticsMeasurementPlan(plan);
    return reply.send(
      AnalyticsProjectPlanValidationResponseSchema.parse(
        result.valid ? { valid: true } : { valid: false, issues: result.issues }
      )
    );
  });

  app.post("/v1/projects/:id/analytics/plan/preview", options, async (request, reply) => {
    const context = await requireAccess(request, reply, dependencies, "management-write");
    if (context === null) return;
    const plan = parsePlan(request.body, context.projectId);
    if (plan === null) return reply.status(400).send({ error: "invalid_payload" });
    const result = await context.store.preview({ actorUserId: context.member.member_id, plan });
    if (result.kind !== "preview") return sendFailure(reply, result.kind);
    return reply.send(AnalyticsProjectPlanPreviewSchema.parse(result.preview));
  });

  app.post("/v1/projects/:id/analytics/plan/apply", options, async (request, reply) => {
    const context = await requireAccess(request, reply, dependencies, "management-write");
    if (context === null) return;
    const body = AnalyticsProjectPlanApplyRequestSchema.safeParse(request.body);
    if (
      !body.success ||
      body.data.plan.scope.kind !== "project" ||
      body.data.plan.scope.project_id.toLowerCase() !== context.projectId
    )
      return reply.status(400).send({ error: "invalid_payload" });
    const result = await context.store.apply({
      actorUserId: context.member.member_id,
      plan: body.data.plan,
      previewHash: body.data.preview_hash
    });
    await recordAuditLog(dependencies.auditLogging, {
      organization_id: context.organizationId,
      actor_user_id: context.member.member_id,
      actor_type: resolveAuditActorType(request.headers),
      action: "analytics_plan.apply",
      target_type: "analytics_plan",
      target_id: context.projectId,
      status: result.kind === "applied" ? "success" : "failure",
      ip_address: request.ip,
      metadata:
        result.kind === "applied"
          ? {
              project_id: context.projectId,
              revision: result.plan.revision,
              catalog_revision: result.plan.catalog_revision,
              replayed: result.replayed
            }
          : { project_id: context.projectId, reason: result.kind }
    });
    if (result.kind !== "applied") return sendFailure(reply, result.kind);
    return reply.send(
      AnalyticsProjectPlanApplyResponseSchema.parse({
        plan: result.plan,
        replayed: result.replayed
      })
    );
  });
}

function parsePlan(
  input: unknown,
  projectId: string
): z.infer<typeof AnalyticsMeasurementPlanSchema> | null {
  const parsed = AnalyticsMeasurementPlanSchema.safeParse(input);
  return parsed.success &&
    parsed.data.scope.kind === "project" &&
    parsed.data.scope.project_id.toLowerCase() === projectId
    ? parsed.data
    : null;
}

async function requireAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  bucket: "management-read" | "management-write"
): Promise<{
  projectId: string;
  organizationId: string;
  member: NonNullable<Awaited<ReturnType<typeof requireRateLimitedProjectAccess>>>["member"];
  store: NonNullable<ApiDependencies["analyticsPlans"]>;
} | null> {
  const params = Params.safeParse(request.params);
  if (!params.success) {
    await reply.status(400).send({ error: "invalid_payload" });
    return null;
  }
  const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
    bucket,
    projectId: params.data.id
  });
  if (auth === null) return null;
  if (auth.access.effective_role !== "owner" && auth.access.effective_role !== "admin") {
    await reply.status(403).send({ error: "forbidden" });
    return null;
  }
  if (dependencies.analyticsPlans === undefined) {
    await reply.status(404).send({ error: "analytics_plans_not_available" });
    return null;
  }
  reply.header("Cache-Control", "private, no-store");
  return {
    projectId: params.data.id.toLowerCase(),
    organizationId: auth.access.organization_id,
    member: auth.member,
    store: dependencies.analyticsPlans
  };
}

function sendFailure(
  reply: FastifyReply,
  kind: "invalid" | "forbidden" | "conflict" | "capacity_exceeded"
): FastifyReply {
  return reply
    .status(kind === "invalid" ? 400 : kind === "forbidden" ? 403 : 409)
    .send({ error: `analytics_plan_${kind}` });
}
