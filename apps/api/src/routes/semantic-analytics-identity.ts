import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  hashToken,
  readBearerToken,
  validateAnalyticsWriterToken,
  type AnalyticsWriterContext
} from "../../../../packages/auth/src/index.js";
import {
  AnalyticsIdentityAssociationSchema,
  AnalyticsIdentityContextCreateSchema,
  AnalyticsIdentityContextSchema,
  AnalyticsIdentityRevokeSchema,
  AnalyticsIdentityRevocationSchema,
  AnalyticsSubjectErasureReceiptSchema,
  AnalyticsSubjectErasureRequestSchema
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { recordAuditLog } from "../audit-logging.js";

const BODY_LIMIT_BYTES = 4096;
const Params = z.object({ id: z.string().uuid() }).strict();
type Authorized = { credentialHash: string; writer: AnalyticsWriterContext };

/** Candidate first-party relay lifecycle. Default composition leaves every route closed. */
export function registerSemanticAnalyticsIdentityRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  const options = { bodyLimit: BODY_LIMIT_BYTES };
  app.post("/v1/analytics/identity/contexts", options, async (request, reply) => {
    const auth = await authorize(request, reply, dependencies);
    if (auth === null) return reply;
    const parsed = AnalyticsIdentityContextCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      await audit(request, dependencies, auth.writer, "create", "invalid");
      return reply.status(400).send({ error: "invalid_payload" });
    }
    const result = await dependencies.semanticAnalyticsIdentityContexts!.create(
      auth.credentialHash,
      parsed.data
    );
    await audit(request, dependencies, auth.writer, "create", result.kind);
    if (result.kind !== "created") return failure(reply, result.kind);
    return reply.send(AnalyticsIdentityContextSchema.parse(result.context));
  });

  app.post("/v1/analytics/identity/contexts/:id/associate", options, async (request, reply) => {
    const auth = await authorize(request, reply, dependencies);
    if (auth === null) return reply;
    const params = Params.safeParse(request.params);
    const parsed = AnalyticsIdentityAssociationSchema.safeParse(request.body);
    if (
      !params.success ||
      !parsed.success ||
      params.data.id.toLowerCase() !== parsed.data.context_id.toLowerCase()
    ) {
      await audit(request, dependencies, auth.writer, "associate", "invalid");
      return reply.status(400).send({ error: "invalid_payload" });
    }
    const result = await dependencies.semanticAnalyticsIdentityContexts!.associate(
      auth.credentialHash,
      parsed.data
    );
    await audit(request, dependencies, auth.writer, "associate", result.kind);
    if (result.kind !== "associated") return failure(reply, result.kind);
    return reply.send(AnalyticsIdentityContextSchema.parse(result.context));
  });

  app.post("/v1/analytics/identity/contexts/revoke", options, async (request, reply) => {
    const auth = await authorize(request, reply, dependencies);
    if (auth === null) return reply;
    const parsed = AnalyticsIdentityRevokeSchema.safeParse(request.body);
    if (!parsed.success) {
      await audit(request, dependencies, auth.writer, "revoke", "invalid");
      return reply.status(400).send({ error: "invalid_payload" });
    }
    const result = await dependencies.semanticAnalyticsIdentityContexts!.revoke(
      auth.credentialHash,
      parsed.data
    );
    await audit(request, dependencies, auth.writer, "revoke", result.kind);
    if (result.kind !== "revoked") return failure(reply, result.kind);
    return reply.send(AnalyticsIdentityRevocationSchema.parse(result.receipt));
  });

  app.post("/v1/analytics/identity/erasures", options, async (request, reply) => {
    const auth = await authorize(request, reply, dependencies, "erasure");
    if (auth === null) return reply;
    const parsed = AnalyticsSubjectErasureRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      await audit(request, dependencies, auth.writer, "erase", "invalid");
      return reply.status(400).send({ error: "invalid_payload" });
    }
    const result = await dependencies.semanticAnalyticsSubjectErasure!.request(
      auth.credentialHash,
      parsed.data
    );
    await audit(request, dependencies, auth.writer, "erase", result.kind);
    if (result.kind !== "accepted") return failure(reply, result.kind);
    return reply.status(202).send(AnalyticsSubjectErasureReceiptSchema.parse(result.receipt));
  });
}

async function authorize(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  operation: "context" | "erasure" = "context"
): Promise<Authorized | null> {
  reply.header("Cache-Control", "private, no-store");
  reply.header("Vary", "Authorization, Origin");
  const bearer = readBearerToken(request.headers.authorization);
  const writers = dependencies.analyticsWriters;
  if (bearer === null || writers === undefined || request.headers.origin !== undefined) {
    await reply.status(401).send({ error: "invalid_analytics_writer" });
    return null;
  }
  const validated = await validateAnalyticsWriterToken(
    bearer,
    (credentialHash) => writers.resolveByTokenHash(credentialHash),
    { allowedKinds: operation === "erasure" ? ["relay", "server"] : ["relay"] }
  );
  if (!validated.ok) {
    await reply.status(401).send({ error: "invalid_analytics_writer" });
    return null;
  }
  if (
    (operation === "context" && dependencies.semanticAnalyticsIdentityContexts?.enabled !== true) ||
    (operation === "erasure" && dependencies.semanticAnalyticsSubjectErasure?.enabled !== true)
  ) {
    await reply.status(503).send({ error: "analytics_identity_unavailable" });
    return null;
  }
  return { credentialHash: hashToken(bearer), writer: validated.context };
}

function failure(reply: FastifyReply, kind: string): FastifyReply {
  if (kind !== "invalid" && kind !== "unavailable" && kind !== "conflict")
    return reply.status(503).send({ error: "analytics_identity_unavailable" });
  return reply
    .status(kind === "invalid" ? 400 : 409)
    .send({ error: kind === "invalid" ? "invalid_payload" : "analytics_identity_unavailable" });
}

async function audit(
  request: FastifyRequest,
  dependencies: ApiDependencies,
  writer: AnalyticsWriterContext,
  action: "create" | "associate" | "revoke" | "erase",
  outcome: string
): Promise<void> {
  await recordAuditLog(dependencies.auditLogging, {
    organization_id: writer.organization_id,
    actor_user_id: null,
    actor_type: "system",
    action: `analytics_identity_context.${action}`,
    target_type: "analytics_project",
    target_id: writer.project_id,
    status:
      outcome === "created" ||
      outcome === "associated" ||
      outcome === "revoked" ||
      outcome === "accepted"
        ? "success"
        : "failure",
    ip_address: request.ip,
    metadata: { writer_id: writer.writer_id, outcome }
  });
}
