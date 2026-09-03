import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { OPENAI_HOSTED_MCP_SCOPES } from "../../../../packages/auth/src/index.js";
import type { OpenAiOAuthStore } from "../../../../packages/storage/src/index.js";
import { resolveBrowserSession } from "../api-helpers.js";
import type { ApiDependencies } from "../api-types.js";
import { recordAuditLog } from "../audit-logging.js";

const RevokeConnectionBodySchema = z.object({ grant_id: z.string().uuid() }).strict();

export function registerOpenAiConnectionRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies,
  store: Pick<OpenAiOAuthStore, "listConnectionsForUser" | "revokeConnectionForUser">
): void {
  app.get("/v1/openai/connections", async (request, reply) => {
    const session = await resolveBrowserSession(request.headers.cookie, dependencies);
    if (session === null) {
      return reply.status(401).send({ error: "invalid_session" });
    }

    const now = Date.now();
    const connections = await store.listConnectionsForUser({
      userId: session.user_id,
      organizationId: session.organization_id
    });
    reply.header("Cache-Control", "no-store");
    return reply.send({
      connections: connections.map((connection) => ({
        grant_id: connection.grantId,
        client_name: connection.clientName,
        organization_name: connection.organizationName,
        product_scopes: connection.scopes.filter((scope) =>
          OPENAI_HOSTED_MCP_SCOPES.includes(scope as (typeof OPENAI_HOSTED_MCP_SCOPES)[number])
        ),
        consented_at: connection.consentedAt,
        expires_at: connection.expiresAt,
        revoked_at: connection.revokedAt,
        status:
          connection.revokedAt !== null
            ? "revoked"
            : new Date(connection.expiresAt).getTime() <= now
              ? "expired"
              : "active"
      }))
    });
  });

  app.post("/v1/openai/connections/revoke", async (request, reply) => {
    const session = await resolveBrowserSession(request.headers.cookie, dependencies);
    if (session === null) {
      return reply.status(401).send({ error: "invalid_session" });
    }
    const parsed = RevokeConnectionBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const revoked = await store.revokeConnectionForUser({
      grantId: parsed.data.grant_id,
      userId: session.user_id,
      organizationId: session.organization_id
    });
    if (!revoked) {
      return reply.status(404).send({ error: "openai_connection_not_found" });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: session.organization_id,
      actor_user_id: session.user_id,
      actor_type: "browser_session",
      action: "openai_connection.revoked",
      target_type: "oauth_authorization_grant",
      target_id: parsed.data.grant_id,
      status: "success",
      ip_address: request.ip,
      metadata: { reason: "user_revoked" }
    });
    reply.header("Cache-Control", "no-store");
    return reply.send({ revoked: true });
  });
}
