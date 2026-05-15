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

  it("should persist and read github device authorization records", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            request_id: "req_123",
            device_code: "device_code_123",
            user_code: "ABCD-EFGH",
            verification_uri: "https://github.com/login/device",
            interval_seconds: 5,
            expires_at: "2026-03-17T00:10:00.000Z",
            accepted_terms_at: "2026-03-17T00:00:00.000Z",
            created_at: "2026-03-17T00:00:00.000Z",
            completed_at: null,
            claimed_at: null,
            terminal_error: null,
            user_id: null,
            organization_id: null
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            request_id: "req_123",
            device_code: "device_code_123",
            user_code: "ABCD-EFGH",
            verification_uri: "https://github.com/login/device",
            interval_seconds: 5,
            expires_at: "2026-03-17T00:10:00.000Z",
            accepted_terms_at: "2026-03-17T00:00:00.000Z",
            created_at: "2026-03-17T00:00:00.000Z",
            completed_at: null,
            claimed_at: null,
            terminal_error: null,
            user_id: null,
            organization_id: null
          }
        ]
      });
    const store = createPostgresAuthStore({ query } as Queryable) as unknown as {
      createGitHubDeviceAuthorization: (input: {
        request_id: string;
        device_code: string;
        user_code: string;
        verification_uri: string;
        interval_seconds: number;
        expires_at: string;
        accepted_terms_at: string | null;
        created_at: string;
      }) => Promise<unknown>;
      getGitHubDeviceAuthorization: (requestId: string) => Promise<unknown>;
    };

    const created = await store.createGitHubDeviceAuthorization({
      request_id: "req_123",
      device_code: "device_code_123",
      user_code: "ABCD-EFGH",
      verification_uri: "https://github.com/login/device",
      interval_seconds: 5,
      expires_at: "2026-03-17T00:10:00.000Z",
      accepted_terms_at: "2026-03-17T00:00:00.000Z",
      created_at: "2026-03-17T00:00:00.000Z"
    });
    const fetched = await store.getGitHubDeviceAuthorization("req_123");

    expect(created).toEqual({
      request_id: "req_123",
      device_code: "device_code_123",
      user_code: "ABCD-EFGH",
      verification_uri: "https://github.com/login/device",
      interval_seconds: 5,
      expires_at: "2026-03-17T00:10:00.000Z",
      accepted_terms_at: "2026-03-17T00:00:00.000Z",
      created_at: "2026-03-17T00:00:00.000Z",
      completed_at: null,
      claimed_at: null,
      terminal_error: null,
      user_id: null,
      organization_id: null
    });
    expect(fetched).toEqual(created);
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("INSERT INTO github_device_authorizations");
    expect(String(query.mock.calls[1]?.[0] ?? "")).toContain("FROM github_device_authorizations");
  });

  it("should return null or throw for missing github device authorization writes", async (): Promise<void> => {
    const missingReadQuery = vi.fn().mockResolvedValue({ rows: [] });
    const insertFailureQuery = vi.fn().mockResolvedValue({ rows: [] });
    const missingReadStore = createPostgresAuthStore({ query: missingReadQuery } as Queryable) as unknown as {
      getGitHubDeviceAuthorization: (requestId: string) => Promise<unknown>;
    };
    const insertFailureStore = createPostgresAuthStore({ query: insertFailureQuery } as Queryable) as unknown as {
      createGitHubDeviceAuthorization: (input: {
        request_id: string;
        device_code: string;
        user_code: string;
        verification_uri: string;
        interval_seconds: number;
        expires_at: string;
        accepted_terms_at: string | null;
        created_at: string;
      }) => Promise<unknown>;
    };

    await expect(missingReadStore.getGitHubDeviceAuthorization("missing")).resolves.toBeNull();
    await expect(
      insertFailureStore.createGitHubDeviceAuthorization({
        request_id: "req_missing",
        device_code: "device_code_missing",
        user_code: "MISS-ING0",
        verification_uri: "https://github.com/login/device",
        interval_seconds: 5,
        expires_at: "2026-03-17T00:10:00.000Z",
        accepted_terms_at: null,
        created_at: "2026-03-17T00:00:00.000Z"
      })
    ).rejects.toThrow("github_device_authorization_insert_failed");
  });

  it("should update github device authorization terminal states", async (): Promise<void> => {
    const completeQuery = vi.fn().mockResolvedValueOnce({ rows: [{ request_id: "req_123" }] }).mockResolvedValueOnce({ rows: [] });
    const terminalErrorQuery = vi.fn().mockResolvedValueOnce({ rows: [{ request_id: "req_123" }] }).mockResolvedValueOnce({ rows: [] });
    const completeStore = createPostgresAuthStore({ query: completeQuery } as Queryable) as unknown as {
      completeGitHubDeviceAuthorization: (input: {
        request_id: string;
        user_id: string;
        organization_id: string;
        completed_at: string;
      }) => Promise<boolean>;
    };
    const terminalErrorStore = createPostgresAuthStore({ query: terminalErrorQuery } as Queryable) as unknown as {
      setGitHubDeviceAuthorizationTerminalError: (input: { request_id: string; terminal_error: string }) => Promise<boolean>;
    };

    await expect(
      completeStore.completeGitHubDeviceAuthorization({
        request_id: "req_123",
        user_id: "usr_123",
        organization_id: "org_123",
        completed_at: "2026-03-17T00:05:00.000Z"
      })
    ).resolves.toBe(true);
    await expect(
      completeStore.completeGitHubDeviceAuthorization({
        request_id: "req_123",
        user_id: "usr_123",
        organization_id: "org_123",
        completed_at: "2026-03-17T00:05:00.000Z"
      })
    ).resolves.toBe(false);

    await expect(
      terminalErrorStore.setGitHubDeviceAuthorizationTerminalError({
        request_id: "req_123",
        terminal_error: "access_denied"
      })
    ).resolves.toBe(true);
    await expect(
      terminalErrorStore.setGitHubDeviceAuthorizationTerminalError({
        request_id: "req_123",
        terminal_error: "expired_token"
      })
    ).resolves.toBe(false);
  });

  it("should claim github device authorization member tokens across terminal states", async (): Promise<void> => {
    const makeStore = (query: Queryable["query"]) =>
      createPostgresAuthStore({ query } as Queryable) as unknown as {
        claimGitHubDeviceAuthorizationMemberToken: (input: {
          request_id: string;
          token_id: string;
          token_hash: string;
          label: string;
          claimed_at: string;
        }) => Promise<unknown>;
      };

    const notFoundStore = makeStore(vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValue({ rows: [] }));
    const claimedStore = makeStore(
      vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ request_id: "req_123", user_id: "usr_123", organization_id: "org_123", expires_at: "2026-03-17T00:10:00.000Z", completed_at: "2026-03-17T00:01:00.000Z", claimed_at: "2026-03-17T00:02:00.000Z", terminal_error: null }] })
        .mockResolvedValue({ rows: [] })
    );
    const terminalErrorStore = makeStore(
      vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ request_id: "req_123", user_id: null, organization_id: null, expires_at: "2026-03-17T00:10:00.000Z", completed_at: null, claimed_at: null, terminal_error: "access_denied" }] })
        .mockResolvedValue({ rows: [] })
    );
    const expiredStore = makeStore(
      vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ request_id: "req_123", user_id: null, organization_id: null, expires_at: "2026-03-17T00:00:00.000Z", completed_at: null, claimed_at: null, terminal_error: null }] })
        .mockResolvedValue({ rows: [] })
    );
    const pendingStore = makeStore(
      vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ request_id: "req_123", user_id: null, organization_id: null, expires_at: "2026-03-17T00:10:00.000Z", completed_at: null, claimed_at: null, terminal_error: null }] })
        .mockResolvedValue({ rows: [] })
    );
    const successQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            request_id: "req_123",
            user_id: "usr_123",
            organization_id: "org_123",
            expires_at: "2026-03-17T00:10:00.000Z",
            completed_at: "2026-03-17T00:01:00.000Z",
            claimed_at: null,
            terminal_error: null
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            token_id: "tok_123",
            user_id: "usr_123",
            organization_id: "org_123",
            label: "GitHub CLI",
            created_at: "2026-03-17T00:02:00.000Z",
            last_used_at: null,
            revoked_at: null,
            expires_at: null
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const successStore = makeStore(successQuery);

    await expect(notFoundStore.claimGitHubDeviceAuthorizationMemberToken({ request_id: "req_missing", token_id: "tok_123", token_hash: "hash", label: "GitHub CLI", claimed_at: "2026-03-17T00:02:00.000Z" })).resolves.toBe("not_found");
    await expect(claimedStore.claimGitHubDeviceAuthorizationMemberToken({ request_id: "req_123", token_id: "tok_123", token_hash: "hash", label: "GitHub CLI", claimed_at: "2026-03-17T00:02:00.000Z" })).resolves.toBe("claimed");
    await expect(terminalErrorStore.claimGitHubDeviceAuthorizationMemberToken({ request_id: "req_123", token_id: "tok_123", token_hash: "hash", label: "GitHub CLI", claimed_at: "2026-03-17T00:02:00.000Z" })).resolves.toBe("terminal_error");
    await expect(expiredStore.claimGitHubDeviceAuthorizationMemberToken({ request_id: "req_123", token_id: "tok_123", token_hash: "hash", label: "GitHub CLI", claimed_at: "2026-03-17T00:02:00.000Z" })).resolves.toBe("expired");
    await expect(pendingStore.claimGitHubDeviceAuthorizationMemberToken({ request_id: "req_123", token_id: "tok_123", token_hash: "hash", label: "GitHub CLI", claimed_at: "2026-03-17T00:02:00.000Z" })).resolves.toBe("pending");
    await expect(successStore.claimGitHubDeviceAuthorizationMemberToken({ request_id: "req_123", token_id: "tok_123", token_hash: "hash", label: "GitHub CLI", claimed_at: "2026-03-17T00:02:00.000Z" })).resolves.toEqual({
      token_id: "tok_123",
      user_id: "usr_123",
      organization_id: "org_123",
      label: "GitHub CLI",
      created_at: "2026-03-17T00:02:00.000Z",
      last_used_at: null,
      revoked_at: null,
      expires_at: null
    });
    expect(String(successQuery.mock.calls[2]?.[0] ?? "")).toContain("INSERT INTO member_tokens");
    expect(String(successQuery.mock.calls[3]?.[0] ?? "")).toContain("SET claimed_at = $2::timestamptz");
  });

  it("should rollback claim failures and issue member tokens directly", async (): Promise<void> => {
    const failingClaimQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            request_id: "req_123",
            user_id: "usr_123",
            organization_id: "org_123",
            expires_at: "2026-03-17T00:10:00.000Z",
            completed_at: "2026-03-17T00:01:00.000Z",
            claimed_at: null,
            terminal_error: null
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const issueTokenQuery = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            token_id: "tok_456",
            user_id: "usr_456",
            organization_id: "org_456",
            label: "Manual token",
            created_at: "2026-03-17T00:02:00.000Z",
            last_used_at: null,
            revoked_at: null,
            expires_at: null
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] });
    const missingIssueQuery = vi.fn().mockResolvedValue({ rows: [] });
    const failingClaimStore = createPostgresAuthStore({ query: failingClaimQuery } as Queryable) as unknown as {
      claimGitHubDeviceAuthorizationMemberToken: (input: {
        request_id: string;
        token_id: string;
        token_hash: string;
        label: string;
        claimed_at: string;
      }) => Promise<unknown>;
    };
    const issueStore = createPostgresAuthStore({ query: issueTokenQuery } as Queryable) as unknown as {
      issueMemberTokenForUser: (input: {
        token_id: string;
        user_id: string;
        organization_id: string;
        token_hash: string;
        label: string;
        created_at: string;
      }) => Promise<unknown>;
    };
    const missingIssueStore = createPostgresAuthStore({ query: missingIssueQuery } as Queryable) as unknown as {
      issueMemberTokenForUser: (input: {
        token_id: string;
        user_id: string;
        organization_id: string;
        token_hash: string;
        label: string;
        created_at: string;
      }) => Promise<unknown>;
    };

    await expect(
      failingClaimStore.claimGitHubDeviceAuthorizationMemberToken({
        request_id: "req_123",
        token_id: "tok_123",
        token_hash: "hash",
        label: "GitHub CLI",
        claimed_at: "2026-03-17T00:02:00.000Z"
      })
    ).rejects.toThrow("github_device_authorization_member_token_insert_failed");
    expect(failingClaimQuery).toHaveBeenCalledWith("ROLLBACK", []);

    await expect(
      issueStore.issueMemberTokenForUser({
        token_id: "tok_456",
        user_id: "usr_456",
        organization_id: "org_456",
        token_hash: "hash_456",
        label: "Manual token",
        created_at: "2026-03-17T00:02:00.000Z"
      })
    ).resolves.toEqual({
      token_id: "tok_456",
      user_id: "usr_456",
      organization_id: "org_456",
      label: "Manual token",
      created_at: "2026-03-17T00:02:00.000Z",
      last_used_at: null,
      revoked_at: null,
      expires_at: null
    });
    await expect(
      missingIssueStore.issueMemberTokenForUser({
        token_id: "tok_missing",
        user_id: "usr_456",
        organization_id: "org_456",
        token_hash: "hash_missing",
        label: "Manual token",
        created_at: "2026-03-17T00:02:00.000Z"
      })
    ).rejects.toThrow("member_token_issue_failed");
  });

  it("should keep the primary claim failure when rollback also fails", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            request_id: "req_123",
            user_id: "usr_123",
            organization_id: "org_123",
            expires_at: "2026-03-17T00:10:00.000Z",
            completed_at: "2026-03-17T00:01:00.000Z",
            claimed_at: null,
            terminal_error: null
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("rollback_failed"));
    const store = createPostgresAuthStore({ query } as Queryable) as unknown as {
      claimGitHubDeviceAuthorizationMemberToken: (input: {
        request_id: string;
        token_id: string;
        token_hash: string;
        label: string;
        claimed_at: string;
      }) => Promise<unknown>;
    };

    await expect(
      store.claimGitHubDeviceAuthorizationMemberToken({
        request_id: "req_123",
        token_id: "tok_123",
        token_hash: "hash",
        label: "GitHub CLI",
        claimed_at: "2026-03-17T00:02:00.000Z"
      })
    ).rejects.toThrow("github_device_authorization_member_token_insert_failed");
    expect(query).toHaveBeenCalledWith("ROLLBACK", []);
  });

  it("should map member roles for github identities and sessions", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: "usr_member",
            email: "member@example.com",
            email_verified_at: "2026-03-17T00:00:00.000Z",
            organization_id: "org_member",
            role: "member"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            session_id: "ses_member",
            user_id: "usr_member",
            email: "member@example.com",
            email_verified_at: "2026-03-17T00:00:00.000Z",
            organization_id: "org_member",
            role: "member",
            created_at: "2026-03-17T00:00:00.000Z",
            expires_at: "2026-03-17T12:00:00.000Z",
            revoked_at: null,
            has_email_auth: true,
            has_github_oauth: true
          }
        ]
      });
    const store = createPostgresAuthStore({ query } as Queryable);

    await expect(store.findGitHubUserAccountByProviderUserId?.("ghu_member")).resolves.toEqual({
      user_id: "usr_member",
      email: "member@example.com",
      email_verified_at: "2026-03-17T00:00:00.000Z",
      organization_id: "org_member",
      role: "member"
    });
    await expect(store.resolveSessionByTokenHash("member_hash")).resolves.toEqual({
      session_id: "ses_member",
      user_id: "usr_member",
      email: "member@example.com",
      email_verified_at: "2026-03-17T00:00:00.000Z",
      organization_id: "org_member",
      role: "member",
      created_at: "2026-03-17T00:00:00.000Z",
      expires_at: "2026-03-17T12:00:00.000Z",
      revoked_at: null,
      avatar_object_key: null,
      has_email_auth: true,
      has_github_oauth: true
    });
  });
});
