import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  AnalyticsWriterApplyRequestSchema,
  AnalyticsWriterApplyResultSchema,
  AnalyticsWriterChangeSchema,
  AnalyticsWriterListSchema,
  AnalyticsWriterPreviewSchema
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedProjectAccess } from "../api-helpers.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";

const Params = z.object({ id: z.string().uuid() }).strict();

export function registerAnalyticsWriterRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  app.get("/v1/projects/:id/analytics/writers", async (request, reply) => {
    const context = await requireAccess(request, reply, dependencies, "management-read");
    if (context === null) return;
    const listed = await context.store.list({
      projectId: context.projectId,
      actorUserId: context.member.member_id
    });
    if (listed === null) return reply.status(404).send({ error: "project_not_found" });
    return reply.send(AnalyticsWriterListSchema.parse(listed));
  });

  app.post("/v1/projects/:id/analytics/writers/preview", async (request, reply) => {
    const context = await requireAccess(request, reply, dependencies, "management-write");
    if (context === null) return;
    const change = AnalyticsWriterChangeSchema.safeParse(request.body);
    if (!change.success) return reply.status(400).send({ error: "invalid_payload" });
    const result = await context.store.preview({
      projectId: context.projectId,
      actorUserId: context.member.member_id,
      change: change.data
    });
    if (result.kind !== "preview") return sendFailure(reply, result.kind);
    return reply.send(AnalyticsWriterPreviewSchema.parse(result.preview));
  });

  app.post("/v1/projects/:id/analytics/writers/apply", async (request, reply) => {
    const context = await requireAccess(request, reply, dependencies, "management-write");
    if (context === null) return;
    const body = AnalyticsWriterApplyRequestSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "invalid_payload" });
    const result = await context.store.apply({
      projectId: context.projectId,
      actorUserId: context.member.member_id,
      change: body.data.change,
      previewHash: body.data.preview_hash
    });
    const applied = result.kind === "applied";
    await recordAuditLog(dependencies.auditLogging, {
      organization_id: context.organizationId,
      actor_user_id: context.member.member_id,
      actor_type: resolveAuditActorType(request.headers),
      action: `analytics_writer.${body.data.change.action}`,
      target_type: "analytics_writer",
      target_id: applied ? result.result.writer.id : context.projectId,
      status: applied ? "success" : "failure",
      ip_address: request.ip,
      metadata: applied
        ? {
            project_id: context.projectId,
            revision: result.result.revision,
            replayed: result.result.replayed,
            disposition: result.result.disposition
          }
        : { project_id: context.projectId, reason: result.kind }
    });
    if (result.kind !== "applied") return sendFailure(reply, result.kind);
    return reply.send(AnalyticsWriterApplyResultSchema.parse(result.result));
  });
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
  store: NonNullable<ApiDependencies["analyticsWriters"]>;
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
  if (dependencies.analyticsWriters === undefined) {
    await reply.status(404).send({ error: "analytics_writers_not_available" });
    return null;
  }
  reply.header("Cache-Control", "private, no-store");
  return {
    projectId: params.data.id.toLowerCase(),
    organizationId: auth.access.organization_id,
    member: auth.member,
    store: dependencies.analyticsWriters
  };
}

function sendFailure(
  reply: FastifyReply,
  kind: "invalid" | "forbidden" | "conflict" | "capacity_exceeded"
): FastifyReply {
  return reply
    .status(kind === "invalid" ? 400 : kind === "forbidden" ? 403 : 409)
    .send({ error: `analytics_writer_${kind}` });
}
