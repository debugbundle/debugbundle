import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createPostgresOpenAiOAuthStore,
  type Queryable
} from "../../../packages/storage/src/index.js";

const TEST_KEY = randomBytes(32).toString("base64url");

describe("Postgres OpenAI OAuth grant lifecycle", () => {
  it("lists retained connections only for the signed-in user and organization", async () => {
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      void sql;
      void params;
      return {
        rows: [
          {
            grant_id: "grant_1",
            client_id: "https://chatgpt.com/oauth/client.json",
            organization_name: "Acme Engineering",
            scopes: ["openid", "email", "debugbundle:projects:read"],
            consented_at: "2026-08-30T10:00:00.000Z",
            expires_at: "2026-09-29T10:00:00.000Z",
            revoked_at: null
          }
        ]
      };
    });
    const store = createPostgresOpenAiOAuthStore({ query } as unknown as Queryable, TEST_KEY);

    await expect(
      store.listConnectionsForUser({ userId: "user_1", organizationId: "org_1" })
    ).resolves.toEqual([
      {
        grantId: "grant_1",
        clientId: "https://chatgpt.com/oauth/client.json",
        clientName: "ChatGPT and Codex",
        organizationName: "Acme Engineering",
        scopes: ["openid", "email", "debugbundle:projects:read"],
        consentedAt: "2026-08-30T10:00:00.000Z",
        expiresAt: "2026-09-29T10:00:00.000Z",
        revokedAt: null
      }
    ]);
    expect(query.mock.calls[0]?.[0]).toContain("g.user_id = $1");
    expect(query.mock.calls[0]?.[0]).toContain("g.organization_id = $2");
    expect(query.mock.calls[0]?.[1]).toEqual(["user_1", "org_1"]);
  });

  it("revokes only an owned connection and its remaining refresh family", async () => {
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      void sql;
      void params;
      return { rows: [{ revoked: true }] };
    });
    const store = createPostgresOpenAiOAuthStore({ query } as unknown as Queryable, TEST_KEY);

    await expect(
      store.revokeConnectionForUser({
        grantId: "grant_1",
        userId: "user_1",
        organizationId: "org_1"
      })
    ).resolves.toBe(true);

    expect(query.mock.calls[0]?.[0]).toContain("g.user_id = $2");
    expect(query.mock.calls[0]?.[0]).toContain("g.organization_id = $3");
    expect(query.mock.calls[0]?.[0]).toContain("oauth_refresh_tokens");
    expect(query.mock.calls[0]?.[0]).toContain("oauth_provider_artifacts");
    expect(query.mock.calls[0]?.[0]).toContain(
      "revocation_reason = COALESCE(revocation_reason, 'user_revoked')"
    );
  });

  it("checks the immutable grant binding and current membership on every token use", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      void sql;
      void params;
      return { rows: [{ active: true }] };
    });
    const store = createPostgresOpenAiOAuthStore({ query } as unknown as Queryable, TEST_KEY);

    await expect(
      store.isGrantActive({
        grantId: "grant_1",
        userId: "user_1",
        organizationId: "org_1",
        clientId: "https://chatgpt.com/oauth/client.json",
        resource: "https://mcp.debugbundle.com",
        scopes: ["debugbundle:projects:read"]
      })
    ).resolves.toBe(true);

    const [sql, params] = query.mock.calls[0] ?? [];
    expect(sql).toContain("oauth_authorization_grants");
    expect(sql).toContain("organization_members");
    expect(sql).toContain("om.suspended_at IS NULL");
    expect(sql).toContain("o.suspended_at IS NULL");
    expect(sql).toContain("g.scopes @>");
    expect(params).toEqual([
      "grant_1",
      "user_1",
      "org_1",
      "https://chatgpt.com/oauth/client.json",
      "https://mcp.debugbundle.com",
      ["debugbundle:projects:read"]
    ]);
  });

  it("resolves provider grant claims by keyed hash and revokes without plaintext persistence", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT") && sql.includes("provider_grant_id_hash")) {
        return {
          rows: [
            {
              grant_id: "grant_1",
              user_id: "user_1",
              organization_id: "org_1"
            }
          ]
        };
      }
      return { rows: [] };
    });
    const store = createPostgresOpenAiOAuthStore({ query } as unknown as Queryable, TEST_KEY);

    await expect(store.resolveProviderGrantClaims("provider-grant-secret")).resolves.toEqual({
      grantId: "grant_1",
      userId: "user_1",
      organizationId: "org_1"
    });
    await store.revokeGrant("grant_1", "user_revoked");

    expect(JSON.stringify(query.mock.calls[0])).not.toContain("provider-grant-secret");
    expect(query.mock.calls[1]?.[0]).toContain("revoked_at = COALESCE(revoked_at, now())");
  });

  it("uses bounded physical-retention cleanup and protects live credentials", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      void sql;
      void params;
      return { rows: [{ deleted: 1 }] };
    });
    const store = createPostgresOpenAiOAuthStore({ query } as unknown as Queryable, TEST_KEY);

    await expect(store.cleanupExpiredCredentials({ limit: 500 })).resolves.toEqual({
      providerArtifacts: 1,
      authorizationCodes: 1,
      refreshTokens: 1,
      grants: 1
    });
    expect(query).toHaveBeenCalledTimes(4);
    for (const [sql, params] of query.mock.calls) {
      expect(sql).toContain("LIMIT $1");
      expect(params).toEqual([500]);
    }
    expect(query.mock.calls[1]?.[0]).toContain("interval '24 hours'");
    expect(query.mock.calls[2]?.[0]).toContain("interval '30 days'");
    expect(query.mock.calls[2]?.[0]).toContain("used_at IS NOT NULL");
    expect(query.mock.calls[3]?.[0]).toContain("interval '90 days'");
  });
});
