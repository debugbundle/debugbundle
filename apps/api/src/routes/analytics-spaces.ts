import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  AnalyticsSpaceApplySchema,
  AnalyticsSpaceChangeSchema,
  AnalyticsSpacePreviewSchema,
  AnalyticsSpaceResponseSchema,
  AnalyticsSpacesResponseSchema
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedMemberAuth } from "../api-helpers.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";

const SpaceParams = z.object({ id: z.string().uuid() }).strict();
const ListQuery = z.object({ organization_id: z.string().uuid() }).strict();

export function registerAnalyticsSpaceRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  app.get("/v1/analytics/spaces", async (request, reply) => {
    const context = await requireAccess(request, reply, dependencies, false);
    if (context === null) return;
    const query = ListQuery.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: "invalid_payload" });
    const spaces = await context.store.list({
      actorUserId: context.member.member_id,
      organizationId: query.data.organization_id
    });
    return reply.send(AnalyticsSpacesResponseSchema.parse({ spaces }));
  });
  app.get("/v1/analytics/spaces/:id", async (request, reply) => {
    const context = await requireAccess(request, reply, dependencies, false);
    if (context === null) return;
    const params = SpaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_payload" });
    const space = await context.store.read({
      actorUserId: context.member.member_id,
      spaceId: params.data.id
    });
    if (space === null) return reply.status(404).send({ error: "analytics_space_not_found" });
    return reply.send(AnalyticsSpaceResponseSchema.parse({ space, replayed: false }));
  });
  for (const target of ["/v1/analytics/spaces", "/v1/analytics/spaces/:id"]) {
    app.post(`${target}/preview`, async (request, reply) => {
      const context = await requireAccess(request, reply, dependencies, true);
      if (context === null) return;
      const params = target.endsWith(":id") ? SpaceParams.safeParse(request.params) : null;
      const change = AnalyticsSpaceChangeSchema.safeParse(request.body);
      if (params?.success === false || !change.success)
        return reply.status(400).send({ error: "invalid_payload" });
      const result = await context.store.preview({
        actorUserId: context.member.member_id,
        spaceId: params?.data?.id ?? null,
        change: change.data
      });
      if (result.kind !== "preview") return sendFailure(reply, result.kind);
      return reply.send(AnalyticsSpacePreviewSchema.parse(result.preview));
    });
    app.post(`${target}/apply`, async (request, reply) => {
      const context = await requireAccess(request, reply, dependencies, true);
      if (context === null) return;
      const params = target.endsWith(":id") ? SpaceParams.safeParse(request.params) : null;
      const body = AnalyticsSpaceApplySchema.safeParse(request.body);
      if (params?.success === false || !body.success)
        return reply.status(400).send({ error: "invalid_payload" });
      const spaceId = params?.data?.id ?? null;
      const result = await context.store.apply({
        actorUserId: context.member.member_id,
        spaceId,
        change: body.data.change,
        previewHash: body.data.preview_hash
      });
      const applied = result.kind === "applied";
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: applied ? result.space.organization_id : context.member.organization_id,
        actor_user_id: context.member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: `analytics_space.${body.data.change.action}`,
        target_type: "analytics_space",
        target_id: applied ? result.space.id : (spaceId ?? "create"),
        status: applied ? "success" : "failure",
        ip_address: request.ip,
        metadata: applied
          ? { revision: result.space.revision, replayed: result.replayed }
          : { reason: result.kind }
      });
      if (result.kind !== "applied") return sendFailure(reply, result.kind);
      return reply.send(
        AnalyticsSpaceResponseSchema.parse({ space: result.space, replayed: result.replayed })
      );
    });
  }
}

async function requireAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  manage: boolean
): Promise<{
  member: NonNullable<Awaited<ReturnType<typeof requireRateLimitedMemberAuth>>>;
  store: NonNullable<ApiDependencies["analyticsSpaces"]>;
} | null> {
  const member = await requireRateLimitedMemberAuth(
    request,
    reply,
    dependencies,
    manage ? "management-write" : "management-read"
  );
  if (member === null) return null;
  // The domain also checks live owning-organization authority and every old/new source under locks.
  if (manage && member.role !== "owner") {
    await reply.status(403).send({ error: "forbidden" });
    return null;
  }
  if (dependencies.analyticsSpaces === undefined) {
    await reply.status(404).send({ error: "analytics_spaces_not_available" });
    return null;
  }
  reply.header("Cache-Control", "private, no-store");
  return { member, store: dependencies.analyticsSpaces };
}
function sendFailure(
  reply: FastifyReply,
  kind: "invalid" | "forbidden" | "conflict" | "project_already_linked" | "capacity_exceeded"
): FastifyReply {
  return reply
    .status(kind === "invalid" ? 400 : kind === "forbidden" ? 403 : 409)
    .send({ error: `analytics_space_${kind}` });
}
