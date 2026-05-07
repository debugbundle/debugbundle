import { describe, expect, it, vi } from "vitest";

import { createPostgresAuthStore, type Queryable } from "../../../packages/storage/src/index.js";

describe("postgres auth store", () => {
  it("should create user accounts and verify emails", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: "usr_123",
            email: "owen@example.com",
            email_verified_at: null,
            organization_id: "org_123",
            role: "owner"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ user_id: "usr_123" }] })
      .mockResolvedValueOnce({ rows: [{ user_id: "usr_123" }] });
    const store = createPostgresAuthStore({ query } as Queryable);

    const created = await store.createUserAccount({
      email: "owen@example.com",
      organization_name: "Owen Workspace",
      organization_slug: "owen-workspace",
      accepted_terms_at: "2026-03-16T00:00:00.000Z",
      created_at: "2026-03-16T00:00:00.000Z"
    });
    const verified = await store.markUserEmailVerified({
      user_id: "usr_123",
      verified_at: "2026-03-16T00:10:00.000Z"
    });

    expect(created).toEqual({
      user_id: "usr_123",
      email: "owen@example.com",
      email_verified_at: null,
      organization_id: "org_123",
      role: "owner"
    });
    expect(verified).toBe(true);
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("accepted_terms_at");
  });

  it("should resolve a user account by normalized email", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          user_id: "usr_123",
          email: "owen@example.com",
          email_verified_at: null,
          organization_id: "org_123",
          role: "owner"
        }
      ]
    });
    const store = createPostgresAuthStore({ query } as Queryable);

    const account = await store.findUserAccountByEmail("OWEN@example.com");

    expect(account).toEqual({
      user_id: "usr_123",
      email: "owen@example.com",
      email_verified_at: null,
      organization_id: "org_123",
      role: "owner"
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("FROM users u"), ["owen@example.com"]);
  });

  it("should create, resolve, and revoke session records", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            session_id: "ses_123",
            user_id: "usr_123",
            email: "owen@example.com",
            email_verified_at: null,
            organization_id: "org_123",
            role: "owner",
            created_at: "2026-03-16T00:00:00.000Z",
            expires_at: "2026-03-16T12:00:00.000Z",
            revoked_at: null,
            has_email_auth: true,
            has_github_oauth: false
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            session_id: "ses_123",
            user_id: "usr_123",
            email: "owen@example.com",
            email_verified_at: null,
            organization_id: "org_123",
            role: "owner",
            created_at: "2026-03-16T00:00:00.000Z",
            expires_at: "2026-03-16T12:00:00.000Z",
            revoked_at: null,
            has_email_auth: true,
            has_github_oauth: false
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ session_id: "ses_123" }] })
      .mockResolvedValueOnce({ rows: [{ session_id: "ses_456" }, { session_id: "ses_789" }], rowCount: 2 });
    const store = createPostgresAuthStore({ query } as Queryable);

    const created = await store.createSession({
      user_id: "usr_123",
      organization_id: "org_123",
      session_token_hash: "hash_session",
      expires_at: "2026-03-16T12:00:00.000Z"
    });
    const resolved = await store.resolveSessionByTokenHash("hash_session");
    const revoked = await store.revokeSessionByTokenHash({
      session_token_hash: "hash_session",
      revoked_at: "2026-03-16T01:00:00.000Z"
    });
    const revokedOthers = await store.revokeOtherSessionsForUser({
      user_id: "usr_123",
      except_session_token_hash: "hash_session",
      revoked_at: "2026-03-16T01:05:00.000Z"
    });

    expect(created?.session_id).toBe("ses_123");
    expect(resolved?.user_id).toBe("usr_123");
    expect(revoked).toBe(true);
    expect(revokedOthers).toBe(2);

    const revokeOtherSessionsSql = String(query.mock.calls[3]?.[0] ?? "");
    expect(revokeOtherSessionsSql).toContain("UPDATE sessions");
    expect(revokeOtherSessionsSql).toContain("session_token_hash <>");
  });

  it("should return null when session creation is blocked by suspension flags", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createPostgresAuthStore({ query } as Queryable);

    const created = await store.createSession({
      user_id: "usr_123",
      organization_id: "org_123",
      session_token_hash: "hash_session",
      expires_at: "2026-03-16T12:00:00.000Z"
    });

    expect(created).toBeNull();
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("om.suspended_at IS NULL");
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("org.suspended_at IS NULL");
  });

  it("should replace and consume email auth challenges", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            challenge_id: "challenge_123",
            email: "owen@example.com",
            accepted_terms_at: "2026-03-16T00:00:00.000Z",
            expires_at: "2026-03-17T00:00:00.000Z",
            used_at: null
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            email: "owen@example.com",
            accepted_terms_at: "2026-03-16T00:00:00.000Z"
          }
        ]
      });
    const store = createPostgresAuthStore({ query } as Queryable);

    const challenge = await store.replaceEmailAuthChallenge({
      email: "owen@example.com",
      code_hash: "hash_code",
      accepted_terms_at: "2026-03-16T00:00:00.000Z",
      replaced_at: "2026-03-16T00:00:00.000Z",
      expires_at: "2026-03-17T00:00:00.000Z"
    });
    const consumed = await store.consumeEmailAuthChallenge({
      email: "owen@example.com",
      code_hash: "hash_code",
      used_at: "2026-03-16T01:00:00.000Z"
    });

    expect(challenge).toEqual({
      challenge_id: "challenge_123",
      email: "owen@example.com",
      accepted_terms_at: "2026-03-16T00:00:00.000Z",
      expires_at: "2026-03-17T00:00:00.000Z",
      used_at: null
    });
    expect(consumed).toEqual({
      email: "owen@example.com",
      accepted_terms_at: "2026-03-16T00:00:00.000Z"
    });

    expect(query).toHaveBeenCalledTimes(2);

    const replaceSql = String(query.mock.calls[0]?.[0] ?? "");
    expect(replaceSql).toContain("UPDATE email_auth_challenges");
    expect(replaceSql).toContain("INSERT INTO email_auth_challenges");

    const consumeSql = String(query.mock.calls[1]?.[0] ?? "");
    expect(consumeSql).toContain("UPDATE email_auth_challenges");
    expect(consumeSql).toContain("AND used_at IS NULL");
    expect(consumeSql).toContain("expires_at >");
    expect(consumeSql).toContain("RETURNING email");
  });

  it("should upsert github user accounts by provider identity or email", async (): Promise<void> => {
    const existingIdentityQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: "usr_123",
            email: "owen@example.com",
            email_verified_at: "2026-03-17T00:00:00.000Z",
            organization_id: "org_123",
            role: "owner"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ oauth_identity_id: "oauth_123" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: "usr_123",
            email: "owen@example.com",
            email_verified_at: "2026-03-17T00:00:00.000Z",
            organization_id: "org_123",
            role: "owner"
          }
        ]
      });
    const newUserQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: "usr_456",
            email: "new@example.com",
            email_verified_at: "2026-03-17T00:00:00.000Z",
            organization_id: "org_456",
            role: "owner"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ oauth_identity_id: "oauth_456" }] });

    const existingIdentityStore = createPostgresAuthStore({ query: existingIdentityQuery } as Queryable) as unknown as {
      upsertGitHubUserAccount: (input: { github_user_id: string; email: string; verified_at: string }) => Promise<unknown>;
    };
    const newUserStore = createPostgresAuthStore({ query: newUserQuery } as Queryable) as unknown as {
      upsertGitHubUserAccount: (input: { github_user_id: string; email: string; verified_at: string; accepted_terms_at?: string }) => Promise<unknown>;
    };

    const existingIdentity = await existingIdentityStore.upsertGitHubUserAccount({
      github_user_id: "ghu_123",
      email: "owen@example.com",
      verified_at: "2026-03-17T00:00:00.000Z"
    });
    const newUser = await newUserStore.upsertGitHubUserAccount({
      github_user_id: "ghu_456",
      email: "new@example.com",
      verified_at: "2026-03-17T00:00:00.000Z",
      accepted_terms_at: "2026-03-17T00:00:00.000Z"
    });

    expect(existingIdentity).toEqual({
      user_id: "usr_123",
      email: "owen@example.com",
      email_verified_at: "2026-03-17T00:00:00.000Z",
      organization_id: "org_123",
      role: "owner",
      created_user: false
    });
    expect(newUser).toEqual({
      user_id: "usr_456",
      email: "new@example.com",
      email_verified_at: "2026-03-17T00:00:00.000Z",
      organization_id: "org_456",
      role: "owner",
      created_user: true
    });
    expect(String(newUserQuery.mock.calls[2]?.[0] ?? "")).toContain("accepted_terms_at");
  });
  it("should look up existing user accounts by email and github provider user id", async (): Promise<void> => {
    const findUserQuery = vi.fn().mockResolvedValue({
      rows: [
        {
          user_id: "usr_email",
          email: "owen@example.com",
          email_verified_at: null,
          organization_id: "org_email",
          role: "owner"
        }
      ]
    });
    const findGitHubQuery = vi.fn().mockResolvedValue({
      rows: [
        {
          user_id: "usr_github",
          email: "owen@example.com",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          organization_id: "org_github",
          role: "owner"
        }
      ]
    });
    const emailStore = createPostgresAuthStore({ query: findUserQuery } as Queryable);
    const githubStore = createPostgresAuthStore({ query: findGitHubQuery } as Queryable);

    await expect(emailStore.findUserAccountByEmail?.("OWEN@example.com")).resolves.toEqual({
      user_id: "usr_email",
      email: "owen@example.com",
      email_verified_at: null,
      organization_id: "org_email",
      role: "owner"
    });
    await expect(githubStore.findGitHubUserAccountByProviderUserId?.("ghu_123")).resolves.toEqual({
      user_id: "usr_github",
      email: "owen@example.com",
      email_verified_at: "2026-03-17T00:00:00.000Z",
      organization_id: "org_github",
      role: "owner"
    });

    expect(findUserQuery).toHaveBeenCalledWith(expect.stringContaining("WHERE lower(u.email) = $1"), ["owen@example.com"]);
    expect(findGitHubQuery).toHaveBeenCalledWith(expect.stringContaining("AND oi.provider_user_id = $1"), ["ghu_123"]);
  });
});