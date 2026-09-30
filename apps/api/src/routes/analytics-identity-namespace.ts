import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  AnalyticsIdentityNamespaceApplySchema,
  AnalyticsIdentityNamespaceApplyRequestSchema,
  AnalyticsIdentityNamespaceChangeSchema,
  AnalyticsIdentityNamespacePreviewSchema,
  AnalyticsIdentityNamespaceRecordSchema
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedProjectAccess } from "../api-helpers.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";

const Params = z.object({ id: z.string().uuid() }).strict();
const options = { bodyLimit: 4096 };

/** Candidate owner configuration; default runtime leaves management closed until parity is complete. */
export function registerAnalyticsIdentityNamespaceRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  app.get("/v1/projects/:id/analytics/identity-namespace", async (request, reply) => {
    const context = await requireOwner(request, reply, dependencies, "management-read");
    if (context === null) return reply;
    const namespace = await context.store.read(context.actorUserId, context.projectId);
    if (namespace === null)
      return reply.status(404).send({ error: "analytics_identity_namespace_not_found" });
    return reply.send(AnalyticsIdentityNamespaceRecordSchema.parse(namespace));
  });

  app.post(
    "/v1/projects/:id/analytics/identity-namespace/preview",
    options,
    async (request, reply) => {
      const context = await requireOwner(request, reply, dependencies, "management-write");
      if (context === null) return reply;
      const body = AnalyticsIdentityNamespaceChangeSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: "invalid_payload" });
      const change = {
        actorUserId: context.actorUserId,
        projectId: context.projectId,
        expectedRevision: body.data.expected_revision,
        idempotencyKey: body.data.idempotency_key
      };
      const result = await context.store.preview(
        body.data.action === "configure"
          ? { ...change, action: "configure", keyFingerprint: body.data.key_fingerprint }
          : { ...change, action: "revoke" }
      );
      if (result.kind !== "preview") return failure(reply, result.kind);
      return reply.send(AnalyticsIdentityNamespacePreviewSchema.parse(result.preview));
    }
  );

  app.post(
    "/v1/projects/:id/analytics/identity-namespace/apply",
    options,
    async (request, reply) => {
      const context = await requireOwner(request, reply, dependencies, "management-write");
      if (context === null) return reply;
      const body = AnalyticsIdentityNamespaceApplyRequestSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: "invalid_payload" });
      const change = {
        actorUserId: context.actorUserId,
        projectId: context.projectId,
        expectedRevision: body.data.change.expected_revision,
        idempotencyKey: body.data.change.idempotency_key,
        previewHash: body.data.preview_hash
      };
      const result = await context.store.apply(
        body.data.change.action === "configure"
          ? { ...change, action: "configure", keyFingerprint: body.data.change.key_fingerprint }
          : { ...change, action: "revoke" }
      );
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: context.organizationId,
        actor_user_id: context.actorUserId,
        actor_type: resolveAuditActorType(request.headers),
        action: `analytics_identity_namespace.${body.data.change.action}`,
        target_type: "analytics_project",
        target_id: context.projectId,
        status: result.kind === "applied" ? "success" : "failure",
        ip_address: request.ip,
        metadata:
          result.kind === "applied"
            ? { namespace_revision: result.namespace.namespace_revision, replayed: result.replayed }
            : { reason: result.kind }
      });
      if (result.kind !== "applied") return failure(reply, result.kind);
      return reply.send(
        AnalyticsIdentityNamespaceApplySchema.parse({
          namespace: result.namespace,
          replayed: result.replayed
        })
      );
    }
  );
}

function failure(reply: FastifyReply, kind: "invalid" | "forbidden" | "conflict"): FastifyReply {
  return reply
    .status(kind === "invalid" ? 400 : kind === "forbidden" ? 403 : 409)
    .send({ error: `analytics_identity_namespace_${kind}` });
}

async function requireOwner(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  bucket: "management-read" | "management-write"
): Promise<{
  actorUserId: string;
  projectId: string;
  organizationId: string;
  store: NonNullable<ApiDependencies["analyticsIdentityNamespace"]>;
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
  if (auth.access.effective_role !== "owner") {
    await reply.status(403).send({ error: "forbidden" });
    return null;
  }
  reply.header("Cache-Control", "private, no-store");
  reply.header("Vary", "Authorization, Cookie");
  const store = dependencies.analyticsIdentityNamespace;
  if (store?.enabled !== true) {
    await reply.status(503).send({ error: "analytics_identity_namespace_unavailable" });
    return null;
  }
  return {
    actorUserId: auth.member.member_id,
    projectId: params.data.id.toLowerCase(),
    organizationId: auth.access.organization_id,
    store
  };
}
