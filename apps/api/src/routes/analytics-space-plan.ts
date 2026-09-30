import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { validateAnalyticsMeasurementPlan } from "../../../../packages/analytics-engine/src/measurement-plan.js";
import {
  AnalyticsMeasurementPlanSchema,
  AnalyticsProjectPlanValidationResponseSchema,
  AnalyticsSpacePlanApplyRequestSchema,
  AnalyticsSpacePlanApplyResponseSchema,
  AnalyticsSpacePlanPreviewSchema,
  AnalyticsSpacePlanRecordSchema
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedMemberAuth } from "../api-helpers.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";

const Params = z.object({ id: z.string().uuid() }).strict();
const options = { bodyLimit: 256 * 1024 };

/** Source authorization and reviewed-content locking remain in the shared space-plan store. */
export function registerAnalyticsSpacePlanRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  app.get("/v1/analytics/spaces/:id/plan", async (request, reply) => {
    const context = await requireAccess(request, reply, dependencies, false);
    if (context === null) return;
    const plan = await context.store.read({
      actorUserId: context.member.member_id,
      spaceId: context.spaceId
    });
    if (plan === null) return reply.status(404).send({ error: "analytics_space_plan_not_found" });
    return reply.send(AnalyticsSpacePlanRecordSchema.parse(plan));
  });

  app.post("/v1/analytics/spaces/:id/plan/validate", options, async (request, reply) => {
    const context = await requireAccess(request, reply, dependencies, false);
    if (context === null) return;
    const plan = parsePlan(request.body, context.spaceId);
    if (plan === null) return reply.status(400).send({ error: "invalid_payload" });
    const result = validateAnalyticsMeasurementPlan(plan);
    return reply.send(
      AnalyticsProjectPlanValidationResponseSchema.parse(
        result.valid ? { valid: true } : { valid: false, issues: result.issues }
      )
    );
  });

  app.post("/v1/analytics/spaces/:id/plan/preview", options, async (request, reply) => {
    const context = await requireAccess(request, reply, dependencies, true);
    if (context === null) return;
    const plan = parsePlan(request.body, context.spaceId);
    if (plan === null) return reply.status(400).send({ error: "invalid_payload" });
    if (plan.reports.length > 0) return sendFailure(reply, "mode_unavailable");
    const result = await context.store.preview({ actorUserId: context.member.member_id, plan });
    if (result.kind !== "preview") return sendFailure(reply, result.kind);
    return reply.send(AnalyticsSpacePlanPreviewSchema.parse(result.preview));
  });

  app.post("/v1/analytics/spaces/:id/plan/apply", options, async (request, reply) => {
    const context = await requireAccess(request, reply, dependencies, true);
    if (context === null) return;
    const body = AnalyticsSpacePlanApplyRequestSchema.safeParse(request.body);
    if (!body.success || parsePlan(body.data.plan, context.spaceId) === null)
      return reply.status(400).send({ error: "invalid_payload" });
    if (body.data.plan.reports.length > 0) return sendFailure(reply, "mode_unavailable");
    const result = await context.store.apply({
      actorUserId: context.member.member_id,
      plan: body.data.plan,
      previewHash: body.data.preview_hash
    });
    await recordAuditLog(dependencies.auditLogging, {
      organization_id: context.member.organization_id,
      actor_user_id: context.member.member_id,
      actor_type: resolveAuditActorType(request.headers),
      action: "analytics_space_plan.apply",
      target_type: "analytics_space",
      target_id: context.spaceId,
      status: result.kind === "applied" ? "success" : "failure",
      ip_address: request.ip,
      metadata:
        result.kind === "applied"
          ? { revision: result.plan.revision, replayed: result.replayed }
          : { reason: result.kind }
    });
    if (result.kind !== "applied") return sendFailure(reply, result.kind);
    return reply.send(
      AnalyticsSpacePlanApplyResponseSchema.parse({ plan: result.plan, replayed: result.replayed })
    );
  });
}

function parsePlan(
  value: unknown,
  spaceId: string
): z.infer<typeof AnalyticsMeasurementPlanSchema> | null {
  const parsed = AnalyticsMeasurementPlanSchema.safeParse(value);
  return parsed.success &&
    parsed.data.scope.kind === "space" &&
    parsed.data.scope.space_id.toLowerCase() === spaceId
    ? parsed.data
    : null;
}

async function requireAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  write: boolean
): Promise<{
  member: NonNullable<Awaited<ReturnType<typeof requireRateLimitedMemberAuth>>>;
  spaceId: string;
  store: NonNullable<ApiDependencies["analyticsSpacePlans"]>;
} | null> {
  const params = Params.safeParse(request.params);
  if (!params.success) {
    await reply.status(400).send({ error: "invalid_payload" });
    return null;
  }
  const member = await requireRateLimitedMemberAuth(
    request,
    reply,
    dependencies,
    write ? "management-write" : "management-read"
  );
  if (member === null) return null;
  if (member.role !== "owner") {
    await reply.status(403).send({ error: "forbidden" });
    return null;
  }
  if (dependencies.analyticsSpacePlans === undefined) {
    await reply.status(404).send({ error: "analytics_space_plans_not_available" });
    return null;
  }
  reply.header("Cache-Control", "private, no-store");
  return {
    member,
    spaceId: params.data.id.toLowerCase(),
    store: dependencies.analyticsSpacePlans
  };
}

function sendFailure(
  reply: FastifyReply,
  kind: "invalid" | "forbidden" | "conflict" | "mode_unavailable" | "capacity_exceeded"
): FastifyReply {
  return reply
    .status(kind === "invalid" ? 400 : kind === "forbidden" ? 403 : 409)
    .send({ error: `analytics_space_plan_${kind}` });
}
