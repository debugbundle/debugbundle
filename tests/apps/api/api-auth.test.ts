import { describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../../packages/auth/src/index.js";
import { createApiServer } from "../../../apps/api/src/server.ts";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type AuthRateLimiterDependency = MockedMethods<NonNullable<ApiServerDependencies["authRateLimiter"]>>;
type AuditLoggingDependency = MockedMethods<NonNullable<ApiServerDependencies["auditLogging"]>>;
type WebAuthDependency = MockedMethods<NonNullable<ApiServerDependencies["webAuth"]>>;
type GitHubCliAuthDependency = MockedMethods<NonNullable<ApiServerDependencies["githubCliAuth"]>>;
type AccountManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["accountManagement"]>>;

function createServer(overrides: {
  authRateLimiter?: Partial<AuthRateLimiterDependency>;
  auditLogging?: Partial<AuditLoggingDependency>;
  webAuth?: Partial<WebAuthDependency> | undefined;
  githubCliAuth?: Partial<GitHubCliAuthDependency> | undefined;
  accountManagement?: Partial<AccountManagementDependency>;
  objectStoreWriter?: ApiServerDependencies["objectStoreWriter"];
  objectStoreReader?: ApiServerDependencies["objectStoreReader"];
} = {}): ReturnType<typeof createApiServer> {
  const hasWebAuthOverride = Object.prototype.hasOwnProperty.call(overrides, "webAuth");
  const hasGitHubCliAuthOverride = Object.prototype.hasOwnProperty.call(overrides, "githubCliAuth");
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
  const defaultGitHubCliAuth = mockedObject<NonNullable<ApiServerDependencies["githubCliAuth"]>>({
    beginDeviceAuth: vi.fn().mockResolvedValue({
      ok: true,
      request_id: "11111111-1111-1111-1111-111111111111",
      user_code: "ABCD-EFGH",
      verification_uri: "https://github.com/login/device",
      interval_seconds: 7,
      expires_at: "2026-03-16T00:15:00.000Z"
    }),
    pollDeviceAuth: vi.fn().mockResolvedValue({
      ok: true,
      status: "pending",
      interval_seconds: 7,
      expires_at: "2026-03-16T00:15:00.000Z"
    }),
    claimDeviceAuth: vi.fn().mockResolvedValue({
      ok: true,
      token: {
        token_id: "tok_123",
        user_id: "usr_123",
        organization_id: "org_123",
        label: "GitHub bootstrap",
        created_at: "2026-03-16T00:00:00.000Z",
        last_used_at: null,
        revoked_at: null,
        expires_at: null,
        plaintext: "dbundle_mem_secret_token"
      }
    }),
    exchangeGitHubAccessToken: vi.fn().mockResolvedValue({
      ok: true,
      created_user: false,
      token: {
        token_id: "tok_123",
        user_id: "usr_123",
        organization_id: "org_123",
        label: "GitHub bootstrap",
        created_at: "2026-03-16T00:00:00.000Z",
        last_used_at: null,
        revoked_at: null,
        expires_at: null,
        plaintext: "dbundle_mem_secret_token"
      }
    })
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
    ...(hasGitHubCliAuthOverride
      ? (overrides.githubCliAuth === undefined
          ? {}
          : {
              githubCliAuth: mockedObject<NonNullable<ApiServerDependencies["githubCliAuth"]>>({
                ...defaultGitHubCliAuth,
                ...overrides.githubCliAuth
              })
            })
      : {
          githubCliAuth: defaultGitHubCliAuth
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
        overrides.accountManagement?.deleteAccountForOrganization ?? vi.fn().mockResolvedValue(null),
      getUserAvatar:
        overrides.accountManagement?.getUserAvatar ?? vi.fn().mockResolvedValue(null),
      saveUserAvatar:
        overrides.accountManagement?.saveUserAvatar ?? vi.fn().mockResolvedValue(null)
    }),
    incidentRetrieval: {
      listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
      getIncidentForOrganization: vi.fn().mockResolvedValue(null),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: overrides.objectStoreReader ?? {
      getObject: vi.fn()
    },
    objectStoreWriter: overrides.objectStoreWriter ?? {
      putObject: vi.fn()
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
        avatar_url: null,
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

  it("supports the dev github mock authorize route and oauth failure branches", async (): Promise<void> => {
    const previousEnv = process.env["DEV_GITHUB_MOCK_LOGIN"];
    process.env["DEV_GITHUB_MOCK_LOGIN"] = "true";

    try {
      const mockApp = createServer();
      const invalidQuery = await mockApp.inject({
        method: "GET",
        url: "/v1/auth/github/mock-authorize"
      });
      const redirected = await mockApp.inject({
        method: "GET",
        url: "/v1/auth/github/mock-authorize?redirect_uri=http%3A%2F%2Flocalhost%3A5291%2Fauth%2Fgithub%2Fcallback&state=oauth-state"
      });

      const callbackApp = createServer({
        webAuth: {
          completeGithubAuth: vi
            .fn()
            .mockResolvedValueOnce({
              ok: false,
              error: "github_oauth_unavailable",
              redirect_url: "http://localhost:5291/auth/github/callback?error=oauth_exchange_failed"
            })
            .mockResolvedValueOnce({
              ok: false,
              error: "auth_not_configured"
            })
        }
      });
      const redirectFailure = await callbackApp.inject({
        method: "GET",
        url: "/v1/auth/github/callback?code=oauth-code&state=oauth-state",
        headers: {
          cookie: "dbundle_github_oauth_state=oauth-state"
        }
      });
      const hardFailure = await callbackApp.inject({
        method: "GET",
        url: "/v1/auth/github/callback?code=oauth-code&state=oauth-state",
        headers: {
          cookie: "dbundle_github_oauth_state=oauth-state"
        }
      });

      expect(invalidQuery.statusCode).toBe(400);
      expect(invalidQuery.json()).toEqual({ error: "invalid_query" });
      expect(redirected.statusCode).toBe(302);
      expect(redirected.headers.location).toContain("code=debugbundle-dev-mock-code");
      expect(redirectFailure.statusCode).toBe(302);
      expect(redirectFailure.headers.location).toContain("error=oauth_exchange_failed");
      expect(String(redirectFailure.headers["set-cookie"])).toContain("Max-Age=0");
      expect(hardFailure.statusCode).toBe(503);
      expect(hardFailure.json()).toEqual({ error: "auth_not_configured" });
    } finally {
      if (previousEnv === undefined) {
        delete process.env["DEV_GITHUB_MOCK_LOGIN"];
      } else {
        process.env["DEV_GITHUB_MOCK_LOGIN"] = previousEnv;
      }
    }
  });

  it("maps additional browser github auth failures and records signup audits for created users", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);

    const startApp = createServer({
      webAuth: {
        beginGithubAuth: vi.fn().mockResolvedValue({
          ok: false,
          error: "github_oauth_unavailable"
        })
      }
    });
    const startFailure = await startApp.inject({
      method: "GET",
      url: "/v1/auth/github/start"
    });

    const callbackInvalidQueryApp = createServer();
    const invalidQuery = await callbackInvalidQueryApp.inject({
      method: "GET",
      url: "/v1/auth/github/callback?code=oauth-code"
    });

    const callbackCreatedUserApp = createServer({
      auditLogging: {
        createAuditLog
      },
      webAuth: {
        completeGithubAuth: vi.fn().mockResolvedValue({
          ok: true,
          session_token: "session-created-user",
          created_user: true,
          accepted_terms_at: null,
          redirect_url: "http://localhost:5291/auth/github/callback",
          session: {
            session_id: "ses_new_user",
            user_id: "usr_new_user",
            email: "signup@example.com",
            email_verified_at: "2026-03-16T00:00:00.000Z",
            organization_id: "org_123",
            role: "owner",
            created_at: "2026-03-16T00:00:00.000Z",
            expires_at: "2026-03-16T04:00:00.000Z",
            revoked_at: null,
            has_email_auth: false,
            has_github_oauth: true
          }
        })
      }
    });
    const createdUser = await callbackCreatedUserApp.inject({
      method: "GET",
      url: "/v1/auth/github/callback?code=oauth-code&state=oauth-state",
      headers: {
        cookie: "dbundle_github_oauth_state=oauth-state"
      }
    });

    expect(startFailure.statusCode).toBe(503);
    expect(startFailure.json()).toEqual({ error: "github_oauth_unavailable" });
    expect(invalidQuery.statusCode).toBe(400);
    expect(invalidQuery.json()).toEqual({ error: "invalid_query" });
    expect(createdUser.statusCode).toBe(302);
    expect(String(createdUser.headers["set-cookie"])).toContain(`${SESSION_COOKIE_NAME}=session-created-user`);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.signup",
        metadata: expect.objectContaining({
          created_user: true,
          authentication_method: "github",
          acceptance_source: "clickwrap"
        })
      })
    );
  });

  it("omits the Secure cookie attribute when AUTH_COOKIE_SECURE is disabled", async (): Promise<void> => {
    const previousSecureEnv = process.env["AUTH_COOKIE_SECURE"];
    process.env["AUTH_COOKIE_SECURE"] = "false";

    try {
      const app = createServer();
      const response = await app.inject({
        method: "POST",
        url: "/v1/auth/verify-code",
        payload: { email: "owen@example.com", code: "123456" }
      });

      expect(response.statusCode).toBe(200);
      expect(String(response.headers["set-cookie"]).includes("Secure")).toBe(false);
    } finally {
      if (previousSecureEnv === undefined) {
        delete process.env["AUTH_COOKIE_SECURE"];
      } else {
        process.env["AUTH_COOKIE_SECURE"] = previousSecureEnv;
      }
    }
  });

  it("fails closed when the dev github mock is enabled in production", async (): Promise<void> => {
    const previousNodeEnv = process.env["NODE_ENV"];
    const previousMockEnv = process.env["DEV_GITHUB_MOCK_LOGIN"];
    process.env["NODE_ENV"] = "production";
    process.env["DEV_GITHUB_MOCK_LOGIN"] = "true";

    try {
      expect(() => createServer()).toThrow("dev_github_mock_login_not_allowed_in_production");
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env["NODE_ENV"];
      } else {
        process.env["NODE_ENV"] = previousNodeEnv;
      }

      if (previousMockEnv === undefined) {
        delete process.env["DEV_GITHUB_MOCK_LOGIN"];
      } else {
        process.env["DEV_GITHUB_MOCK_LOGIN"] = previousMockEnv;
      }
    }
  });

  it("supports GitHub device auth bootstrap endpoints", async (): Promise<void> => {
    const beginDeviceAuth = vi.fn().mockResolvedValue({
      ok: true,
      request_id: "11111111-1111-1111-1111-111111111111",
      user_code: "ABCD-EFGH",
      verification_uri: "https://github.com/login/device",
      interval_seconds: 7,
      expires_at: "2026-03-16T00:15:00.000Z"
    });
    const pollDeviceAuth = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: "pending",
        interval_seconds: 7,
        expires_at: "2026-03-16T00:15:00.000Z"
      })
      .mockResolvedValueOnce({
        ok: true,
        status: "approved",
        expires_at: "2026-03-16T00:15:00.000Z"
      });
    const claimDeviceAuth = vi.fn().mockResolvedValue({
      ok: true,
      token: {
        token_id: "tok_123",
        user_id: "usr_123",
        organization_id: "org_123",
        label: "GitHub bootstrap",
        created_at: "2026-03-16T00:00:00.000Z",
        last_used_at: null,
        revoked_at: null,
        expires_at: null,
        plaintext: "dbundle_mem_secret_token"
      }
    });
    const exchangeGitHubAccessToken = vi.fn().mockResolvedValue({
      ok: true,
      created_user: false,
      token: {
        token_id: "tok_456",
        user_id: "usr_123",
        organization_id: "org_123",
        label: "GitHub bootstrap",
        created_at: "2026-03-16T00:00:00.000Z",
        last_used_at: null,
        revoked_at: null,
        expires_at: null,
        plaintext: "dbundle_mem_secret_token"
      }
    });
    const app = createServer({
      githubCliAuth: {
        beginDeviceAuth,
        pollDeviceAuth,
        claimDeviceAuth,
        exchangeGitHubAccessToken
      }
    });

    const start = await app.inject({
      method: "POST",
      url: "/v1/auth/github/device/start",
      payload: { accepted_terms: true }
    });
    const pollPending = await app.inject({
      method: "POST",
      url: "/v1/auth/github/device/poll",
      payload: { request_id: "11111111-1111-1111-1111-111111111111" }
    });
    const pollApproved = await app.inject({
      method: "POST",
      url: "/v1/auth/github/device/poll",
      payload: { request_id: "11111111-1111-1111-1111-111111111111" }
    });
    const claim = await app.inject({
      method: "POST",
      url: "/v1/auth/github/device/claim",
      payload: {
        request_id: "11111111-1111-1111-1111-111111111111",
        label: "GitHub bootstrap"
      }
    });
    const exchange = await app.inject({
      method: "POST",
      url: "/v1/auth/github/token/exchange",
      payload: {
        github_access_token: "gho_123",
        label: "GitHub bootstrap",
        accepted_terms: true
      }
    });

    expect(start.statusCode).toBe(200);
    expect(start.json()).toEqual({
      request_id: "11111111-1111-1111-1111-111111111111",
      user_code: "ABCD-EFGH",
      verification_uri: "https://github.com/login/device",
      interval_seconds: 7,
      expires_at: "2026-03-16T00:15:00.000Z"
    });
    expect(pollPending.statusCode).toBe(200);
    expect(pollPending.json()).toEqual({
      status: "pending",
      interval_seconds: 7,
      expires_at: "2026-03-16T00:15:00.000Z"
    });
    expect(pollApproved.statusCode).toBe(200);
    expect(pollApproved.json()).toEqual({
      status: "approved",
      expires_at: "2026-03-16T00:15:00.000Z"
    });
    expect(claim.statusCode).toBe(200);
    expect(claim.json()).toEqual({
      token: {
        token_id: "tok_123",
        user_id: "usr_123",
        organization_id: "org_123",
        label: "GitHub bootstrap",
        created_at: "2026-03-16T00:00:00.000Z",
        last_used_at: null,
        revoked_at: null,
        expires_at: null,
        plaintext: "dbundle_mem_secret_token"
      }
    });
    expect(exchange.statusCode).toBe(200);
    expect(exchange.json()).toEqual({
      token: {
        token_id: "tok_456",
        user_id: "usr_123",
        organization_id: "org_123",
        label: "GitHub bootstrap",
        created_at: "2026-03-16T00:00:00.000Z",
        last_used_at: null,
        revoked_at: null,
        expires_at: null,
        plaintext: "dbundle_mem_secret_token"
      }
    });
  });

  it("maps GitHub device bootstrap failures to the expected HTTP statuses", async (): Promise<void> => {
    const startApp = createServer({
      githubCliAuth: {
        beginDeviceAuth: vi.fn().mockResolvedValue({
          ok: false,
          error: "device_flow_disabled"
        })
      }
    });
    const start = await startApp.inject({
      method: "POST",
      url: "/v1/auth/github/device/start",
      payload: { accepted_terms: true }
    });

    const pollApp = createServer({
      githubCliAuth: {
        pollDeviceAuth: vi.fn().mockResolvedValueOnce({
          ok: false,
          error: "request_not_found"
        })
      }
    });
    const poll = await pollApp.inject({
      method: "POST",
      url: "/v1/auth/github/device/poll",
      payload: { request_id: "11111111-1111-1111-1111-111111111111" }
    });

    const claimApp = createServer({
      githubCliAuth: {
        claimDeviceAuth: vi
          .fn()
          .mockResolvedValueOnce({ ok: false, error: "pending" })
          .mockResolvedValueOnce({ ok: false, error: "expired" })
      }
    });
    const claimPending = await claimApp.inject({
      method: "POST",
      url: "/v1/auth/github/device/claim",
      payload: {
        request_id: "11111111-1111-1111-1111-111111111111",
        label: "GitHub bootstrap"
      }
    });
    const claimExpired = await claimApp.inject({
      method: "POST",
      url: "/v1/auth/github/device/claim",
      payload: {
        request_id: "11111111-1111-1111-1111-111111111111",
        label: "GitHub bootstrap"
      }
    });

    const exchangeApp = createServer({
      githubCliAuth: {
        exchangeGitHubAccessToken: vi
          .fn()
          .mockResolvedValueOnce({ ok: false, error: "oauth_exchange_failed" })
          .mockResolvedValueOnce({ ok: false, error: "github_email_unavailable" })
      }
    });
    const exchangeUnauthorized = await exchangeApp.inject({
      method: "POST",
      url: "/v1/auth/github/token/exchange",
      payload: {
        github_access_token: "gho_invalid",
        label: "GitHub bootstrap",
        accepted_terms: true
      }
    });
    const exchangeBadRequest = await exchangeApp.inject({
      method: "POST",
      url: "/v1/auth/github/token/exchange",
      payload: {
        github_access_token: "gho_without_email",
        label: "GitHub bootstrap",
        accepted_terms: true
      }
    });

    expect(start.statusCode).toBe(503);
    expect(start.json()).toEqual({ error: "github_device_flow_disabled" });
    expect(poll.statusCode).toBe(404);
    expect(poll.json()).toEqual({ error: "github_device_request_not_found" });
    expect(claimPending.statusCode).toBe(409);
    expect(claimPending.json()).toEqual({ error: "github_device_auth_pending" });
    expect(claimExpired.statusCode).toBe(409);
    expect(claimExpired.json()).toEqual({ error: "github_device_auth_expired" });
    expect(exchangeUnauthorized.statusCode).toBe(401);
    expect(exchangeUnauthorized.json()).toEqual({ error: "invalid_github_token" });
    expect(exchangeBadRequest.statusCode).toBe(400);
    expect(exchangeBadRequest.json()).toEqual({ error: "github_email_unavailable" });
  });

  it("maps additional github device provider, conflict, and internal-error branches", async (): Promise<void> => {
    const startApp = createServer({
      githubCliAuth: {
        beginDeviceAuth: vi
          .fn()
          .mockResolvedValueOnce({ ok: false, error: "provider_error" })
          .mockResolvedValueOnce({ ok: false, error: "provider_not_configured" })
      }
    });
    const startProviderError = await startApp.inject({
      method: "POST",
      url: "/v1/auth/github/device/start",
      payload: { accepted_terms: true }
    });
    const startNotConfigured = await startApp.inject({
      method: "POST",
      url: "/v1/auth/github/device/start",
      payload: { accepted_terms: true }
    });

    const pollApp = createServer({
      githubCliAuth: {
        pollDeviceAuth: vi.fn().mockResolvedValue({
          ok: true,
          status: "unknown_status",
          expires_at: "2026-03-16T00:15:00.000Z"
        })
      }
    });
    const pollInternalError = await pollApp.inject({
      method: "POST",
      url: "/v1/auth/github/device/poll",
      payload: { request_id: "11111111-1111-1111-1111-111111111111" }
    });

    const claimApp = createServer({
      githubCliAuth: {
        claimDeviceAuth: vi
          .fn()
          .mockResolvedValueOnce({ ok: false, error: "request_not_found" })
          .mockResolvedValueOnce({ ok: false, error: "provider_not_configured" })
          .mockResolvedValueOnce({ ok: false, error: "claimed" })
          .mockResolvedValueOnce({ ok: false, error: "rejected" })
      }
    });
    const claimMissing = await claimApp.inject({
      method: "POST",
      url: "/v1/auth/github/device/claim",
      payload: {
        request_id: "11111111-1111-1111-1111-111111111111",
        label: "GitHub bootstrap"
      }
    });
    const claimNotConfigured = await claimApp.inject({
      method: "POST",
      url: "/v1/auth/github/device/claim",
      payload: {
        request_id: "11111111-1111-1111-1111-111111111111",
        label: "GitHub bootstrap"
      }
    });
    const claimClaimed = await claimApp.inject({
      method: "POST",
      url: "/v1/auth/github/device/claim",
      payload: {
        request_id: "11111111-1111-1111-1111-111111111111",
        label: "GitHub bootstrap"
      }
    });
    const claimRejected = await claimApp.inject({
      method: "POST",
      url: "/v1/auth/github/device/claim",
      payload: {
        request_id: "11111111-1111-1111-1111-111111111111",
        label: "GitHub bootstrap"
      }
    });

    const exchangeApp = createServer({
      githubCliAuth: {
        exchangeGitHubAccessToken: vi
          .fn()
          .mockResolvedValueOnce({ ok: false, error: "provider_not_configured" })
          .mockResolvedValueOnce({ ok: false, error: "account_signup_disabled" })
      }
    });
    const exchangeNotConfigured = await exchangeApp.inject({
      method: "POST",
      url: "/v1/auth/github/token/exchange",
      payload: {
        github_access_token: "gho_123",
        label: "GitHub bootstrap",
        accepted_terms: true
      }
    });
    const exchangeSignupDisabled = await exchangeApp.inject({
      method: "POST",
      url: "/v1/auth/github/token/exchange",
      payload: {
        github_access_token: "gho_123",
        label: "GitHub bootstrap",
        accepted_terms: true
      }
    });

    expect(startProviderError.statusCode).toBe(503);
    expect(startProviderError.json()).toEqual({ error: "github_oauth_unavailable" });
    expect(startNotConfigured.statusCode).toBe(503);
    expect(startNotConfigured.json()).toEqual({ error: "auth_not_configured" });
    expect(pollInternalError.statusCode).toBe(500);
    expect(pollInternalError.json()).toEqual({ error: "internal_error" });
    expect(claimMissing.statusCode).toBe(404);
    expect(claimMissing.json()).toEqual({ error: "github_device_request_not_found" });
    expect(claimNotConfigured.statusCode).toBe(503);
    expect(claimNotConfigured.json()).toEqual({ error: "auth_not_configured" });
    expect(claimClaimed.statusCode).toBe(409);
    expect(claimClaimed.json()).toEqual({ error: "github_device_auth_claimed" });
    expect(claimRejected.statusCode).toBe(409);
    expect(claimRejected.json()).toEqual({ error: "github_device_auth_rejected" });
    expect(exchangeNotConfigured.statusCode).toBe(503);
    expect(exchangeNotConfigured.json()).toEqual({ error: "auth_not_configured" });
    expect(exchangeSignupDisabled.statusCode).toBe(403);
    expect(exchangeSignupDisabled.json()).toEqual({ error: "account_signup_disabled" });
  });

  it("returns terminal device poll states without collapsing their reasons", async (): Promise<void> => {
    const app = createServer({
      githubCliAuth: {
        pollDeviceAuth: vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            status: "claimed",
            expires_at: "2026-03-16T00:15:00.000Z"
          })
          .mockResolvedValueOnce({
            ok: true,
            status: "denied",
            reason: "access_denied",
            expires_at: "2026-03-16T00:15:00.000Z"
          })
          .mockResolvedValueOnce({
            ok: true,
            status: "expired",
            reason: "expired_token",
            expires_at: "2026-03-16T00:15:00.000Z"
          })
          .mockResolvedValueOnce({
            ok: true,
            status: "rejected",
            reason: "account_signup_disabled",
            expires_at: "2026-03-16T00:15:00.000Z"
          })
      }
    });

    const claimed = await app.inject({
      method: "POST",
      url: "/v1/auth/github/device/poll",
      payload: { request_id: "11111111-1111-1111-1111-111111111111" }
    });
    const denied = await app.inject({
      method: "POST",
      url: "/v1/auth/github/device/poll",
      payload: { request_id: "11111111-1111-1111-1111-111111111111" }
    });
    const expired = await app.inject({
      method: "POST",
      url: "/v1/auth/github/device/poll",
      payload: { request_id: "11111111-1111-1111-1111-111111111111" }
    });
    const rejected = await app.inject({
      method: "POST",
      url: "/v1/auth/github/device/poll",
      payload: { request_id: "11111111-1111-1111-1111-111111111111" }
    });

    expect(claimed.json()).toEqual({ status: "claimed", expires_at: "2026-03-16T00:15:00.000Z" });
    expect(denied.json()).toEqual({ status: "denied", reason: "access_denied", expires_at: "2026-03-16T00:15:00.000Z" });
    expect(expired.json()).toEqual({ status: "expired", reason: "expired_token", expires_at: "2026-03-16T00:15:00.000Z" });
    expect(rejected.json()).toEqual({ status: "rejected", reason: "account_signup_disabled", expires_at: "2026-03-16T00:15:00.000Z" });
  });

  it("records bootstrap audit metadata when github token exchange creates a new user", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const app = createServer({
      auditLogging: {
        createAuditLog
      },
      githubCliAuth: {
        exchangeGitHubAccessToken: vi.fn().mockResolvedValue({
          ok: true,
          created_user: true,
          token: {
            token_id: "tok_created",
            user_id: "usr_created",
            organization_id: "org_created",
            label: "GitHub bootstrap",
            created_at: "2026-03-16T00:00:00.000Z",
            last_used_at: null,
            revoked_at: null,
            expires_at: null,
            plaintext: "dbundle_mem_secret_token"
          }
        })
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/github/token/exchange",
      payload: {
        github_access_token: "gho_123",
        label: "GitHub bootstrap",
        accepted_terms: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.signup",
        actor_type: "anonymous",
        organization_id: "org_created",
        target_id: "usr_created",
        metadata: expect.objectContaining({
          authentication_method: "github_cli",
          created_user: true
        })
      })
    );
  });

  it("requires a browser session for invite acceptance and maps invite errors", async (): Promise<void> => {
    const csrfToken = buildCsrfToken("session-secret");
    const acceptInviteForSession = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "invite_email_mismatch" })
      .mockResolvedValueOnce({
        ok: true,
        membership: {
          project_id: "proj_123",
          user_id: "usr_123",
          role: "member",
          membership_type: "collaborator"
        }
      });
    const app = createServer({
      webAuth: {
        acceptInviteForSession
      }
    });

    const missingSession = await app.inject({
      method: "POST",
      url: "/v1/auth/project-invite/accept",
      payload: { token: "invite-secret" }
    });
    const mismatch = await app.inject({
      method: "POST",
      url: "/v1/auth/project-invite/accept",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`,
        "x-csrf-token": csrfToken
      },
      payload: { token: "invite-secret" }
    });
    const success = await app.inject({
      method: "POST",
      url: "/v1/auth/project-invite/accept",
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
        project_id: "proj_123",
        user_id: "usr_123",
        role: "member",
        membership_type: "collaborator"
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
        avatar_url: null,
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

  it("returns auth_not_configured for GitHub bootstrap routes when github cli auth is missing", async (): Promise<void> => {
    const app = createServer({ githubCliAuth: undefined });

    const start = await app.inject({
      method: "POST",
      url: "/v1/auth/github/device/start",
      payload: { accepted_terms: true }
    });
    const poll = await app.inject({
      method: "POST",
      url: "/v1/auth/github/device/poll",
      payload: { request_id: "11111111-1111-1111-1111-111111111111" }
    });
    const claim = await app.inject({
      method: "POST",
      url: "/v1/auth/github/device/claim",
      payload: {
        request_id: "11111111-1111-1111-1111-111111111111",
        label: "GitHub bootstrap"
      }
    });
    const exchange = await app.inject({
      method: "POST",
      url: "/v1/auth/github/token/exchange",
      payload: {
        github_access_token: "gho_123",
        label: "GitHub bootstrap",
        accepted_terms: true
      }
    });

    for (const response of [start, poll, claim, exchange]) {
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "auth_not_configured" });
    }
  });
});

describe("account routes backed by browser auth", () => {
  it("exports account data for owner browser sessions", async (): Promise<void> => {
    const accountManagement = {
      exportAccountForOrganization: vi.fn().mockResolvedValue({
        export_version: 1,
        exported_at: "2026-04-06T00:00:00.000Z",
        user: { user_id: "usr_123" },
        organization: { organization_id: "org_123" },
        members: [],
        project_invites: [],
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
        export_version: 1,
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

  it("serves the current cached account avatar for valid browser sessions", async (): Promise<void> => {
    const accountManagement = {
      getUserAvatar: vi.fn().mockResolvedValue({
        user_id: "usr_123",
        source: "github",
        object_key: "avatars/users/usr_123/profile",
        content_type: "image/png",
        updated_at: "2026-04-06T00:00:00.000Z"
      })
    };
    const objectStoreReader = {
      getObject: vi.fn().mockResolvedValue(Buffer.from("png-body"))
    };
    const app = createServer({
      accountManagement,
      objectStoreReader,
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
      url: "/v1/account/avatar",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("image/png");
    expect(response.body).toBe("png-body");
    expect(accountManagement.getUserAvatar).toHaveBeenCalledWith({ user_id: "usr_123" });
    expect(objectStoreReader.getObject).toHaveBeenCalledWith({ key: "avatars/users/usr_123/profile" });
  });

  it("imports and caches a gravatar avatar for valid browser sessions", async (): Promise<void> => {
    const csrfToken = buildCsrfToken("session-secret");
    const accountManagement = {
      saveUserAvatar: vi.fn().mockResolvedValue({
        user_id: "usr_123",
        source: "gravatar",
        object_key: "avatars/users/usr_123/profile",
        content_type: "image/png",
        updated_at: "2026-04-06T00:00:00.000Z"
      })
    };
    const objectStoreWriter = {
      putObject: vi.fn().mockResolvedValue(undefined)
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(Buffer.from("avatar-image"), {
      status: 200,
      headers: {
        "Content-Type": "image/png"
      }
    })));

    const app = createServer({
      accountManagement,
      objectStoreWriter,
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
      method: "POST",
      url: "/v1/account/avatar/import-gravatar",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`,
        "x-csrf-token": csrfToken
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      avatar: {
        source: "gravatar",
        avatar_url: "/v1/account/avatar",
        updated_at: "2026-04-06T00:00:00.000Z"
      }
    });
    expect(objectStoreWriter.putObject).toHaveBeenCalledWith({
      key: "avatars/users/usr_123/profile",
      body: Buffer.from("avatar-image"),
      contentType: "image/png"
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
