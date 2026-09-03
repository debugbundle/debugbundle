import { createHash, randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createPostgresOidcProviderAdapterFactory,
  type Queryable
} from "../../../packages/storage/src/index.js";

const TEST_KEY = randomBytes(32).toString("base64url");

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("Postgres oidc-provider adapter", () => {
  it("persists only hashed lookup keys and an encrypted payload", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      void sql;
      void params;
      return { rows: [] };
    });
    const Adapter = createPostgresOidcProviderAdapterFactory(
      { query } as unknown as Queryable,
      TEST_KEY
    );
    const adapter = new Adapter("AuthorizationCode");

    await adapter.upsert(
      "plaintext-code",
      {
        jti: "plaintext-code",
        grantId: "grant-secret",
        uid: "session-secret",
        userCode: "user-code-secret",
        accountId: "user_1"
      },
      300
    );

    const [, params] = query.mock.calls[0] ?? [];
    expect(params).toBeDefined();
    const serialized = JSON.stringify(params);
    expect(serialized).not.toContain("plaintext-code");
    expect(serialized).not.toContain("grant-secret");
    expect(serialized).not.toContain("session-secret");
    expect(serialized).not.toContain("user-code-secret");
    expect(serialized).not.toContain("user_1");
    expect(serialized).not.toContain(sha256("plaintext-code"));
    expect(serialized).toContain("encv1.");
  });

  it("round-trips the encrypted provider payload and consumed marker", async () => {
    const storedRows: Array<Record<string, unknown>> = [];
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes("INSERT INTO oauth_provider_artifacts")) {
        storedRows[0] = {
          payload: params[2],
          consumed_at: null
        };
        return { rows: [] };
      }
      if (sql.includes("SELECT payload")) {
        return { rows: storedRows };
      }
      return { rows: [] };
    });
    const Adapter = createPostgresOidcProviderAdapterFactory(
      { query } as unknown as Queryable,
      TEST_KEY
    );
    const adapter = new Adapter("Session");
    const payload = { jti: "session-id", uid: "session-uid", accountId: "user_1" };

    await adapter.upsert("session-id", payload, 600);
    await expect(adapter.find("session-id")).resolves.toEqual(payload);

    storedRows[0] = { ...storedRows[0], consumed_at: "2026-08-30T00:00:00.000Z" };
    await expect(adapter.findByUid("session-uid")).resolves.toEqual({
      ...payload,
      consumed: expect.any(Number)
    });
  });

  it("performs consume, destroy, and grant revocation with hashed identifiers", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      void params;
      return { rows: sql.includes("RETURNING") ? [{ id: "row" }] : [] };
    });
    const Adapter = createPostgresOidcProviderAdapterFactory(
      { query } as unknown as Queryable,
      TEST_KEY
    );
    const adapter = new Adapter("RefreshToken");

    await adapter.consume("refresh-secret");
    await adapter.destroy("refresh-secret");
    await adapter.revokeByGrantId("grant-secret");

    expect(query).toHaveBeenCalledTimes(6);
    expect(JSON.stringify(query.mock.calls)).not.toContain("refresh-secret");
    expect(JSON.stringify(query.mock.calls)).not.toContain("grant-secret");
    expect(query.mock.calls[4]?.[0]).toContain("grant_id_hash");
    expect(query.mock.calls[5]?.[0]).toContain("provider_revoked");
  });

  it("mirrors complete authorization-code and refresh-token bindings into explicit lifecycle tables", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT id::text AS grant_id")) {
        return { rows: [{ grant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }] };
      }
      if (sql.includes("RETURNING id")) {
        return { rows: [{ id: "row" }] };
      }
      return { rows: [] };
    });
    const Adapter = createPostgresOidcProviderAdapterFactory(
      { query } as unknown as Queryable,
      TEST_KEY
    );

    await new Adapter("AuthorizationCode").upsert(
      "authorization-code-secret",
      {
        grantId: "provider-grant-secret",
        accountId: "11111111-1111-4111-8111-111111111111",
        clientId: "https://chatgpt.com/oauth/client.json",
        redirectUri: "https://chatgpt.com/connector_platform_oauth_redirect",
        resource: "https://mcp.debugbundle.com",
        scope: "openid email debugbundle:projects:read",
        codeChallenge: "pkce-challenge",
        codeChallengeMethod: "S256"
      },
      300
    );
    await new Adapter("RefreshToken").upsert(
      "refresh-token-secret",
      {
        grantId: "provider-grant-secret",
        accountId: "11111111-1111-4111-8111-111111111111",
        clientId: "https://chatgpt.com/oauth/client.json",
        resource: "https://mcp.debugbundle.com",
        scope: "openid email debugbundle:projects:read",
        rotations: 0
      },
      2_592_000
    );

    expect(query.mock.calls.some(([sql]) => sql.includes("oauth_authorization_codes"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.includes("oauth_refresh_tokens"))).toBe(true);
    const serialized = JSON.stringify(query.mock.calls);
    expect(serialized).not.toContain("authorization-code-secret");
    expect(serialized).not.toContain("refresh-token-secret");
    expect(serialized).not.toContain("provider-grant-secret");
  });

  it("atomically rejects a second consume before a parallel refresh can rotate twice", async () => {
    let providerConsumeCalls = 0;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("UPDATE oauth_provider_artifacts") && sql.includes("consumed_at")) {
        providerConsumeCalls += 1;
        return { rows: providerConsumeCalls === 1 ? [{ provider_id_hash: "hash" }] : [] };
      }
      if (sql.includes("UPDATE oauth_refresh_tokens") && sql.includes("used_at")) {
        return { rows: [{ id: "token" }] };
      }
      return { rows: [] };
    });
    const Adapter = createPostgresOidcProviderAdapterFactory(
      { query } as unknown as Queryable,
      TEST_KEY
    );
    const adapter = new Adapter("RefreshToken");

    await expect(adapter.consume("refresh-token-secret")).resolves.toBeUndefined();
    await expect(adapter.consume("refresh-token-secret")).rejects.toThrow(
      "oauth_provider_artifact_already_consumed"
    );
    expect(query.mock.calls.at(-1)?.[0]).toContain("reuse_detected_at");
    expect(query.mock.calls.at(-1)?.[0]).toContain("refresh_reuse");
  });
});
