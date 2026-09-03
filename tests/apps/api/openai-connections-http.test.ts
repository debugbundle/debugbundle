import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ApiDependencies } from "../../../apps/api/src/api-types.js";
import { registerOpenAiConnectionRoutes } from "../../../apps/api/src/routes/openai-connections.js";

const apps: FastifyInstance[] = [];
const GRANT_ID = "00000000-0000-4000-8000-000000000001";

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function dependencies(createAuditLog = vi.fn()): ApiDependencies {
  return {
    webAuth: {
      resolveSessionByToken: vi.fn().mockResolvedValue({
        session_id: "session_1",
        user_id: "user_1",
        email: "member@example.com",
        email_verified_at: "2026-08-30T10:00:00.000Z",
        organization_id: "org_1",
        role: "member",
        created_at: "2026-08-30T10:00:00.000Z",
        expires_at: "2026-08-30T22:00:00.000Z",
        revoked_at: null
      })
    },
    auditLogging: { createAuditLog }
  } as unknown as ApiDependencies;
}

describe("OpenAI connection management HTTP boundary", () => {
  it("lists and revokes only the signed-in user's current-organization grant", async () => {
    const listConnectionsForUser = vi.fn().mockResolvedValue([
      {
        grantId: GRANT_ID,
        clientId: "https://chatgpt.com/oauth/client.json",
        clientName: "ChatGPT and Codex",
        organizationName: "Acme Engineering",
        scopes: ["openid", "email", "debugbundle:projects:read", "unexpected:scope"],
        consentedAt: "2026-08-30T10:00:00.000Z",
        expiresAt: "2099-09-29T10:00:00.000Z",
        revokedAt: null
      }
    ]);
    const revokeConnectionForUser = vi.fn().mockResolvedValue(true);
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const app = Fastify();
    apps.push(app);
    registerOpenAiConnectionRoutes(app, dependencies(createAuditLog), {
      listConnectionsForUser,
      revokeConnectionForUser
    });

    const listed = await app.inject({
      method: "GET",
      url: "/v1/openai/connections",
      headers: { cookie: "dbundle_session=secret" }
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.headers["cache-control"]).toBe("no-store");
    expect(listed.json()).toEqual({
      connections: [
        {
          grant_id: GRANT_ID,
          client_name: "ChatGPT and Codex",
          organization_name: "Acme Engineering",
          product_scopes: ["debugbundle:projects:read"],
          consented_at: "2026-08-30T10:00:00.000Z",
          expires_at: "2099-09-29T10:00:00.000Z",
          revoked_at: null,
          status: "active"
        }
      ]
    });
    expect(listConnectionsForUser).toHaveBeenCalledWith({
      userId: "user_1",
      organizationId: "org_1"
    });

    const revoked = await app.inject({
      method: "POST",
      url: "/v1/openai/connections/revoke",
      headers: { cookie: "dbundle_session=secret" },
      payload: { grant_id: GRANT_ID }
    });
    expect(revoked.statusCode).toBe(200);
    expect(revokeConnectionForUser).toHaveBeenCalledWith({
      grantId: GRANT_ID,
      userId: "user_1",
      organizationId: "org_1"
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_1",
        actor_user_id: "user_1",
        action: "openai_connection.revoked",
        target_id: GRANT_ID
      })
    );
  });

  it("does not disclose unowned or malformed grants", async () => {
    const app = Fastify();
    apps.push(app);
    const revokeConnectionForUser = vi.fn().mockResolvedValue(false);
    registerOpenAiConnectionRoutes(app, dependencies(), {
      listConnectionsForUser: vi.fn().mockResolvedValue([]),
      revokeConnectionForUser
    });

    const malformed = await app.inject({
      method: "POST",
      url: "/v1/openai/connections/revoke",
      headers: { cookie: "dbundle_session=secret" },
      payload: { grant_id: "not-a-grant-id" }
    });
    expect(malformed.statusCode).toBe(400);
    expect(revokeConnectionForUser).not.toHaveBeenCalled();

    const missing = await app.inject({
      method: "POST",
      url: "/v1/openai/connections/revoke",
      headers: { cookie: "dbundle_session=secret" },
      payload: { grant_id: GRANT_ID }
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: "openai_connection_not_found" });
  });
});
