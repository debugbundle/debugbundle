import { describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../../packages/auth/src/index.js";
import { createApiServer } from "../../../apps/api/src/server.ts";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type AuthRateLimiterDependency = MockedMethods<NonNullable<ApiServerDependencies["authRateLimiter"]>>;
type AuditLoggingDependency = MockedMethods<NonNullable<ApiServerDependencies["auditLogging"]>>;
type WebAuthDependency = MockedMethods<NonNullable<ApiServerDependencies["webAuth"]>>;
type AccountManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["accountManagement"]>>;

function createServer(overrides: {
  authRateLimiter?: Partial<AuthRateLimiterDependency>;
  auditLogging?: Partial<AuditLoggingDependency>;
  webAuth?: Partial<WebAuthDependency> | undefined;
  accountManagement?: Partial<AccountManagementDependency>;
} = {}): ReturnType<typeof createApiServer> {
  const hasWebAuthOverride = Object.prototype.hasOwnProperty.call(overrides, "webAuth");
  const defaultWebAuth = mockedObject<NonNullable<ApiServerDependencies["webAuth"]>>({
    requestEmailCode: vi.fn().mockResolvedValue({ ok: true, code_sent: true }),
    verifyEmailCode: vi.fn().mockResolvedValue({
      ok: true,
      session_token: "session-secret",
      created_user: false,
      session: {
        session_id: "ses_123",
        user_id: "usr_123",
        email: "owen@example.com",
        email_verified_at: "2026-03-16T00:00:00.000Z",
        organization_id: "org_123",
        role: "owner",
        created_at: "2026-03-16T00:00:00.000Z",
        expires_at: "2026-03-16T04:00:00.000Z",
        revoked_at: null,
        has_email_auth: true,
        has_github_oauth: false
      }
    }),
    beginGithubAuth: vi.fn().mockResolvedValue({
      ok: true,
      authorization_url: "https://github.example.test/login/oauth/authorize?state=oauth-state",
      state: "oauth-state",
      expires_at: "2026-03-16T00:10:00.000Z"
    }),
    completeGithubAuth: vi.fn().mockResolvedValue({
      ok: true,
      session_token: "session-secret",
      created_user: false,
      accepted_terms_at: "2026-03-16T00:00:00.000Z",
      redirect_url: "http://localhost:5291/auth/github/callback",
      session: {
        session_id: "ses_123",
        user_id: "usr_123",
        email: "owen@example.com",
        email_verified_at: "2026-03-16T00:00:00.000Z",
        organization_id: "org_123",
        role: "owner",
        created_at: "2026-03-16T00:00:00.000Z",
        expires_at: "2026-03-16T04:00:00.000Z",
        revoked_at: null,
        has_email_auth: true,
        has_github_oauth: true
      }
    }),
    acceptInviteForSession: vi.fn().mockResolvedValue({
      ok: true,
      membership: {
        user_id: "usr_123",
        organization_id: "org_123",
        role: "owner"
      }
    }),
    resolveSessionByToken: vi.fn().mockResolvedValue(null),
    revokeSessionByToken: vi.fn().mockResolvedValue(true)
  });

  return createApiServer({
    ingestionPersistence: {
      persistAndEnqueue: vi.fn()
    },
    ingestionMetadata: {
      resolveProjectByTokenHash: vi.fn()
    },
    ...(overrides.authRateLimiter === undefined
      ? {}
      : {
          authRateLimiter: {
            claimRequest: overrides.authRateLimiter.claimRequest ?? vi.fn().mockResolvedValue({
              allowed: true,
              limit: 10,
              remaining: 9,
              retry_after_ms: 0
            })
          }
        }),
    memberAuth: mockedObject<ApiServerDependencies["memberAuth"]>({
      resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
    }),
    ...(hasWebAuthOverride
      ? (overrides.webAuth === undefined
          ? {}
          : {
              webAuth: mockedObject<NonNullable<ApiServerDependencies["webAuth"]>>({
                ...defaultWebAuth,
                ...overrides.webAuth
              })
            })
      : {
          webAuth: defaultWebAuth
        }),
    tokenManagement: mockedObject<ApiServerDependencies["tokenManagement"]>({
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    }),
    accountManagement: mockedObject<NonNullable<ApiServerDependencies["accountManagement"]>>({
      exportAccountForOrganization:
        overrides.accountManagement?.exportAccountForOrganization ?? vi.fn().mockResolvedValue(null),
      deleteAccountForOrganization:
        overrides.accountManagement?.deleteAccountForOrganization ?? vi.fn().mockResolvedValue(null)
    }),
    incidentRetrieval: {
      listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
      getIncidentForOrganization: vi.fn().mockResolvedValue(null),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: {
      getObject: vi.fn()
    },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
      retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
    },
    ...(overrides.auditLogging === undefined
      ? {}
      : {
          auditLogging: {
            createAuditLog: overrides.auditLogging.createAuditLog ?? vi.fn().mockResolvedValue(undefined)
          }
        })
  });
}

describe("api auth routes", () => {
  it("validates request-code and verify-code payloads", async (): Promise<void> => {
    const app = createServer();

    const requestCode = await app.inject({
      method: "POST",
      url: "/v1/auth/request-code",
      payload: { email: "bad", accepted_terms: false }
    });
    const verifyCode = await app.inject({
      method: "POST",
      url: "/v1/auth/verify-code",
      payload: { email: "bad", code: "123" }
    });

    expect(requestCode.statusCode).toBe(400);
    expect(verifyCode.statusCode).toBe(400);
    expect(requestCode.json()).toEqual({ error: "invalid_payload" });
    expect(verifyCode.json()).toEqual({ error: "invalid_payload" });
  });

  it("rejects oversized request-code payloads with 413", async (): Promise<void> => {
    const requestEmailCode = vi.fn();
    const app = createServer({
      webAuth: {
        requestEmailCode
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/request-code",
      headers: {
        "content-type": "application/json"
      },
      payload: JSON.stringify({
        email: "owen@example.com",
        accepted_terms: true,
        padding: "x".repeat(300_000)
      })
    });

    expect(response.statusCode).toBe(413);
    expect(requestEmailCode).not.toHaveBeenCalled();
  });

  it("rate limits request-code and verify-code requests per IP", async (): Promise<void> => {
    const claimRequest = vi.fn().mockResolvedValue({
      allowed: false,
      limit: 10,
      remaining: 0,
      retry_after_ms: 12_000
    });
    const requestEmailCode = vi.fn();
    const verifyEmailCode = vi.fn();
    const app = createServer({
      authRateLimiter: {
        claimRequest
      },
      webAuth: {
        requestEmailCode,
        verifyEmailCode
      }
    });

    const requestCode = await app.inject({
      method: "POST",
      url: "/v1/auth/request-code",
      payload: { email: "owen@example.com", accepted_terms: true }
    });
    const verifyCode = await app.inject({
      method: "POST",
      url: "/v1/auth/verify-code",
      payload: { email: "owen@example.com", code: "123456" }
    });

    for (const response of [requestCode, verifyCode]) {
      expect(response.statusCode).toBe(429);
      expect(response.json()).toEqual({ error: "rate_limited" });
      expect(response.headers["retry-after"]).toBe("12");
    }

    expect(claimRequest).toHaveBeenCalledTimes(2);
    expect(requestEmailCode).not.toHaveBeenCalled();
    expect(verifyEmailCode).not.toHaveBeenCalled();
  });

  it("forwards request-code calls with clickwrap acceptance semantics", async (): Promise<void> => {
    const requestEmailCode = vi.fn().mockResolvedValue({ ok: true, code_sent: true });
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const app = createServer({
      webAuth: {
        requestEmailCode
      },
      auditLogging: {
        createAuditLog
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/request-code",
      payload: { email: "owen@example.com", accepted_terms: true }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(requestEmailCode).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owen@example.com",
        accepted_terms_at: expect.any(String),
        now: expect.any(Date)
      })
    );
    expect(createAuditLog).toHaveBeenCalled();
  });

  it("verifies a code, sets the session cookie, and returns auth method metadata", async (): Promise<void> => {
    const verifyEmailCode = vi.fn().mockResolvedValue({
      ok: true,
      session_token: "session-secret",
      created_user: true,
      session: {
        session_id: "ses_123",
        user_id: "usr_123",
        email: "owen@example.com",
        email_verified_at: "2026-03-16T00:00:00.000Z",
        organization_id: "org_123",
        role: "owner",
        created_at: "2026-03-16T00:00:00.000Z",
        expires_at: "2026-03-16T04:00:00.000Z",
        revoked_at: null,
        has_email_auth: true,
        has_github_oauth: false
      }
    });
    const app = createServer({
      webAuth: {
        verifyEmailCode
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/verify-code",
      payload: { email: "owen@example.com", code: "123456" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      session: {
        session_id: "ses_123",
        user_id: "usr_123",
        email: "owen@example.com",
        email_verified_at: "2026-03-16T00:00:00.000Z",
        organization_id: "org_123",
        organization_plan: "free",
        role: "owner",
        created_at: "2026-03-16T00:00:00.000Z",
        expires_at: "2026-03-16T04:00:00.000Z",
        revoked_at: null,
        auth_methods: {
          email: true,
          github: false
        },
        csrf_token: buildCsrfToken("session-secret")
      }
    });
    expect(String(response.headers["set-cookie"])).toContain(`${SESSION_COOKIE_NAME}=session-secret`);
  });

  it("maps invalid email codes to a 400 response", async (): Promise<void> => {
    const verifyEmailCode = vi.fn().mockResolvedValue({ ok: false, error: "invalid_code" });
    const app = createServer({
      webAuth: {
        verifyEmailCode
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/verify-code",
      payload: { email: "owen@example.com", code: "123456" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_code" });
  });

  it("maps suspended accounts to a 403 response", async (): Promise<void> => {
    const verifyEmailCode = vi.fn().mockResolvedValue({ ok: false, error: "account_suspended" });
    const app = createServer({
      webAuth: {
        verifyEmailCode
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/verify-code",
      payload: { email: "owen@example.com", code: "123456" }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "account_suspended" });
  });

  it("starts GitHub auth, completes the callback, and redirects back to the app", async (): Promise<void> => {
    const beginGithubAuth = vi.fn().mockResolvedValue({
      ok: true,
      authorization_url: "https://github.example.test/login/oauth/authorize?state=oauth-state",
      state: "oauth-state",
      expires_at: "2026-03-16T00:10:00.000Z"
    });
    const completeGithubAuth = vi.fn().mockResolvedValue({
      ok: true,
      session_token: "session-secret",
      created_user: false,
      accepted_terms_at: "2026-03-16T00:00:00.000Z",
      redirect_url: "http://localhost:5291/auth/github/callback",
      session: {
        session_id: "ses_123",
        user_id: "usr_123",
        email: "owen@example.com",
        email_verified_at: "2026-03-16T00:00:00.000Z",
        organization_id: "org_123",
        role: "owner",
        created_at: "2026-03-16T00:00:00.000Z",
        expires_at: "2026-03-16T04:00:00.000Z",
        revoked_at: null,
        has_email_auth: true,
        has_github_oauth: true
      }
    });
    const app = createServer({
      webAuth: {
        beginGithubAuth,
        completeGithubAuth
      }
    });

    const start = await app.inject({
      method: "GET",
      url: "/v1/auth/github/start"
    });

    expect(start.statusCode).toBe(302);
    expect(beginGithubAuth).toHaveBeenCalled();
    expect(String(start.headers["set-cookie"])).toContain("dbundle_github_oauth_state=");
    expect(start.headers.location).toContain("https://github.example.test/login/oauth/authorize");

    const callback = await app.inject({
      method: "GET",
      url: "/v1/auth/github/callback?code=oauth-code&state=oauth-state",
      headers: {
        cookie: "dbundle_github_oauth_state=oauth-state"
      }
    });

    expect(callback.statusCode).toBe(302);
    expect(completeGithubAuth).toHaveBeenCalledWith({
      code: "oauth-code",
      state: "oauth-state",
      stateCookieValue: "oauth-state",
      now: expect.any(Date)
    });
    expect(String(callback.headers["set-cookie"])).toContain(`${SESSION_COOKIE_NAME}=session-secret`);
    expect(callback.headers.location).toBe("http://localhost:5291/auth/github/callback");
  });

  it("requires a browser session for invite acceptance and maps invite errors", async (): Promise<void> => {
    const csrfToken = buildCsrfToken("session-secret");
    const acceptInviteForSession = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "invite_email_mismatch" })
      .mockResolvedValueOnce({
        ok: true,
        membership: {
          user_id: "usr_123",
          organization_id: "org_123",
          role: "owner"
        }
      });
    const app = createServer({
      webAuth: {
        acceptInviteForSession
      }
    });

    const missingSession = await app.inject({
      method: "POST",
      url: "/v1/auth/accept-invite",
      payload: { token: "invite-secret" }
    });
    const mismatch = await app.inject({
      method: "POST",
      url: "/v1/auth/accept-invite",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`,
        "x-csrf-token": csrfToken
      },
      payload: { token: "invite-secret" }
    });
    const success = await app.inject({
      method: "POST",
      url: "/v1/auth/accept-invite",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`,
        "x-csrf-token": csrfToken
      },
      payload: { token: "invite-secret" }
    });

    expect(missingSession.statusCode).toBe(401);
    expect(mismatch.statusCode).toBe(403);
    expect(success.statusCode).toBe(200);
    expect(success.json()).toEqual({
      membership: {
        user_id: "usr_123",
        organization_id: "org_123",
        role: "owner"
      }
    });
  });

  it("returns null for missing sessions and resolves active sessions with csrf metadata", async (): Promise<void> => {
    const resolveSessionByToken = vi
      .fn()
      .mockResolvedValueOnce({
        session_id: "ses_123",
        user_id: "usr_123",
        email: "owen@example.com",
        email_verified_at: "2026-03-16T00:00:00.000Z",
        organization_id: "org_123",
        role: "owner",
        created_at: "2026-03-16T00:00:00.000Z",
        expires_at: "2026-03-16T04:00:00.000Z",
        revoked_at: null,
        has_email_auth: true,
        has_github_oauth: true
      });
    const app = createServer({
      webAuth: {
        resolveSessionByToken
      }
    });

    const missing = await app.inject({
      method: "GET",
      url: "/v1/auth/session"
    });
    const present = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`
      }
    });

    expect(missing.statusCode).toBe(200);
    expect(missing.json()).toEqual({ session: null });
    expect(present.statusCode).toBe(200);
    expect(present.json()).toEqual({
      session: {
        session_id: "ses_123",
        user_id: "usr_123",
        email: "owen@example.com",
        email_verified_at: "2026-03-16T00:00:00.000Z",
        organization_id: "org_123",
        organization_plan: "free",
        role: "owner",
        created_at: "2026-03-16T00:00:00.000Z",
        expires_at: "2026-03-16T04:00:00.000Z",
        revoked_at: null,
        auth_methods: {
          email: true,
          github: true
        },
        csrf_token: buildCsrfToken("session-secret")
      }
    });
  });

  it("logs out active sessions and clears the cookie", async (): Promise<void> => {
    const csrfToken = buildCsrfToken("session-secret");
    const revokeSessionByToken = vi.fn().mockResolvedValue(true);
    const app = createServer({
      webAuth: {
        revokeSessionByToken
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`,
        "x-csrf-token": csrfToken
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(revokeSessionByToken).toHaveBeenCalledWith("session-secret", { now: expect.any(Date) });
    expect(String(response.headers["set-cookie"])).toContain("Max-Age=0");
  });

  it("returns auth_not_configured for browser auth routes when web auth is missing", async (): Promise<void> => {
    const app = createServer({ webAuth: undefined });

    const requestCode = await app.inject({
      method: "POST",
      url: "/v1/auth/request-code",
      payload: { email: "owen@example.com", accepted_terms: true }
    });
    const verifyCode = await app.inject({
      method: "POST",
      url: "/v1/auth/verify-code",
      payload: { email: "owen@example.com", code: "123456" }
    });
    const session = await app.inject({
      method: "GET",
      url: "/v1/auth/session"
    });
    const logout = await app.inject({
      method: "POST",
      url: "/v1/auth/logout"
    });

    for (const response of [requestCode, verifyCode, session, logout]) {
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "auth_not_configured" });
    }
  });
});

describe("account routes backed by browser auth", () => {
  it("exports account data for owner browser sessions", async (): Promise<void> => {
    const accountManagement = {
      exportAccountForOrganization: vi.fn().mockResolvedValue({
        exported_at: "2026-04-06T00:00:00.000Z",
        user: { user_id: "usr_123" },
        organization: { organization_id: "org_123" },
        members: [],
        invites: [],
        member_tokens: [],
        projects: [],
        project_tokens: [],
        capture_policies: [],
        services: [],
        deployments: [],
        processed_events: [],
        incidents: [],
        incident_events: [],
        bundle_generations: [],
        stored_artifacts: [],
        audit_logs: [],
        alert_rules: [],
        alert_deliveries: [],
        weekly_report_channels: [],
        weekly_report_deliveries: [],
        webhooks: [],
        webhook_deliveries: []
      })
    };
    const app = createServer({
      accountManagement,
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          session_id: "ses_123",
          user_id: "usr_123",
          email: "owen@example.com",
          email_verified_at: "2026-03-16T00:00:00.000Z",
          organization_id: "org_123",
          role: "owner",
          created_at: "2026-03-16T00:00:00.000Z",
          expires_at: "2026-03-16T12:00:00.000Z",
          revoked_at: null,
          has_email_auth: true,
          has_github_oauth: false
        })
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/account/export",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        exported_at: "2026-04-06T00:00:00.000Z",
        organization: { organization_id: "org_123" }
      })
    );
    expect(accountManagement.exportAccountForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      user_id: "usr_123",
      exported_at: expect.any(String)
    });
  });

  it("deletes the current account for owner browser sessions and clears the cookie", async (): Promise<void> => {
    const csrfToken = buildCsrfToken("session-secret");
    const accountManagement = {
      deleteAccountForOrganization: vi.fn().mockResolvedValue({
        deleted_at: "2026-04-06T00:00:00.000Z",
        organization_id: "org_123",
        deleted_project_ids: ["proj_123"],
        user_deleted: true,
        deleted_member_token_count: 2
      })
    };
    const app = createServer({
      accountManagement,
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          session_id: "ses_123",
          user_id: "usr_123",
          email: "owen@example.com",
          email_verified_at: "2026-03-16T00:00:00.000Z",
          organization_id: "org_123",
          role: "owner",
          created_at: "2026-03-16T00:00:00.000Z",
          expires_at: "2026-03-16T12:00:00.000Z",
          revoked_at: null,
          has_email_auth: true,
          has_github_oauth: false
        })
      }
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/v1/account",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`,
        "x-csrf-token": csrfToken
      },
      payload: {
        email: "owen@example.com"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      account: {
        deleted_at: "2026-04-06T00:00:00.000Z",
        organization_id: "org_123",
        deleted_project_ids: ["proj_123"],
        user_deleted: true,
        deleted_member_token_count: 2
      }
    });
    expect(String(response.headers["set-cookie"])).toContain("Max-Age=0");
  });
});
