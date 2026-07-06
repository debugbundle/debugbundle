import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type AuditLoggingDependency = MockedMethods<NonNullable<ApiServerDependencies["auditLogging"]>>;
type WebAuthDependency = MockedMethods<NonNullable<ApiServerDependencies["webAuth"]>>;
type BillingManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["billingManagement"]>>;

function buildBillingSummary(
  overrides: Partial<Awaited<ReturnType<NonNullable<ApiServerDependencies["billingManagement"]>["getBillingSummaryForOrganization"]>>> = {}
) {
  return {
    plan: "free" as const,
    billing_state: null,
    stripe_customer_id: null,
    active_projects: 0,
    capacity_units: {
      total: 1,
      included: 1,
      additional_purchased: 0,
      pending_reduction: null
    },
    usage_window: {
      starts_at: "2026-06-01T00:00:00.000Z",
      ends_at: "2026-07-01T00:00:00.000Z"
    },
    allowances: {
      monthly_bundle_requests: { used: 0, limit: 100 },
      monthly_raw_ingested_events: { used: 0, limit: 10_000 },
      retained_bundle_cap: { used: 0, limit: 50 },
      monthly_remote_activations: { used: 0, limit: 0 },
      monthly_alert_deliveries: { used: 0, limit: 25 },
      monthly_webhook_deliveries: { used: 0, limit: 100 }
    },
    trial: {
      available: true,
      active: false,
      plan: null,
      started_at: null,
      ends_at: null,
      used_at: null,
      converted_at: null,
      expired_at: null,
      days_remaining: null
    },
    ...overrides
  };
}

function createServer(overrides: {
  auditLogging?: Partial<AuditLoggingDependency>;
  webAuth?: Partial<WebAuthDependency>;
  billingManagement?: Partial<BillingManagementDependency>;
} = {}): ReturnType<typeof createApiServer> {
  const auditLogging = mockedObject<NonNullable<ApiServerDependencies["auditLogging"]>>({
    createAuditLog: overrides.auditLogging?.createAuditLog ?? vi.fn().mockResolvedValue(undefined)
  });

  const billingManagement = mockedObject<NonNullable<ApiServerDependencies["billingManagement"]>>({
    getBillingSummaryForOrganization:
      overrides.billingManagement?.getBillingSummaryForOrganization ??
      vi.fn().mockResolvedValue(buildBillingSummary()),
    createCheckoutLink:
      overrides.billingManagement?.createCheckoutLink ?? vi.fn().mockResolvedValue(null),
    createPortalLink:
      overrides.billingManagement?.createPortalLink ?? vi.fn().mockResolvedValue(null),
    startTrial:
      overrides.billingManagement?.startTrial ?? vi.fn().mockResolvedValue("trial_unavailable")
  });

  return createApiServer({
    ingestionPersistence: {
      persistAndEnqueue: vi.fn()
    },
    ingestionMetadata: {
      resolveProjectByTokenHash: vi.fn()
    },
    memberAuth: mockedObject<ApiServerDependencies["memberAuth"]>({
      resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
    }),
    webAuth: mockedObject<NonNullable<ApiServerDependencies["webAuth"]>>({
      requestEmailCode: vi.fn().mockResolvedValue({ ok: true, code_sent: true }),
      verifyEmailCode: vi.fn().mockResolvedValue({
        ok: true,
        created_user: false,
        session_token: "session-secret",
        session: {
          session_id: "ses_123",
          user_id: "usr_123",
          email: "owner@example.com",
          email_verified_at: "2026-06-04T00:00:00.000Z",
          organization_id: "org_123",
          role: "owner",
          created_at: "2026-06-04T00:00:00.000Z",
          expires_at: "2026-06-04T04:00:00.000Z",
          revoked_at: null,
          has_email_auth: true,
          has_github_oauth: false
        }
      }),
      beginGithubAuth: vi.fn(),
      completeGithubAuth: vi.fn(),
      acceptInviteForSession: vi.fn(),
      resolveSessionByToken: vi.fn().mockResolvedValue(null),
      revokeSessionByToken: vi.fn().mockResolvedValue(true),
      ...overrides.webAuth
    }),
    tokenManagement: mockedObject<ApiServerDependencies["tokenManagement"]>({
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    }),
    projectManagement: {
      listProjectsForOrganization: vi.fn().mockResolvedValue([]),
      createProjectForOrganization: vi.fn().mockResolvedValue(null),
      updateProjectForOrganization: vi.fn().mockResolvedValue(null),
      deleteProjectForOrganization: vi.fn().mockResolvedValue(null)
    },
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
    auditLogging,
    billingManagement
  });
}

describe("api auth trial signup routes", () => {
  it("starts the requested no-card trial for a newly created email signup", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const trialSummary = buildBillingSummary({
      plan: "team",
      billing_state: "trialing",
      trial: {
        available: false,
        active: true,
        plan: "team",
        started_at: "2026-06-04T00:00:00.000Z",
        ends_at: "2026-07-04T00:00:00.000Z",
        used_at: "2026-06-04T00:00:00.000Z",
        converted_at: null,
        expired_at: null,
        days_remaining: 30
      }
    });
    const startTrial = vi.fn().mockResolvedValue(trialSummary);
    const app = createServer({
      auditLogging: { createAuditLog },
      webAuth: {
        verifyEmailCode: vi.fn().mockResolvedValue({
          ok: true,
          created_user: true,
          session_token: "session-secret",
          session: {
            session_id: "ses_123",
            user_id: "usr_123",
            email: "owner@example.com",
            email_verified_at: "2026-06-04T00:00:00.000Z",
            organization_id: "org_123",
            role: "owner",
            created_at: "2026-06-04T00:00:00.000Z",
            expires_at: "2026-06-04T04:00:00.000Z",
            revoked_at: null,
            has_email_auth: true,
            has_github_oauth: false
          }
        })
      },
      billingManagement: {
        startTrial,
        getBillingSummaryForOrganization: vi.fn().mockResolvedValue(trialSummary)
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/verify-code",
      payload: {
        email: "owner@example.com",
        code: "123456",
        requested_trial_plan: "team"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().session.organization_plan).toBe("team");
    expect(startTrial).toHaveBeenCalledWith({
      organization_id: "org_123",
      target_plan: "team",
      now: expect.any(String)
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "billing.trial.start",
        organization_id: "org_123",
        status: "success"
      })
    );
  });

  it("does not start a trial when an existing account logs in with a trial intent", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const startTrial = vi.fn();
    const app = createServer({
      auditLogging: { createAuditLog },
      billingManagement: {
        startTrial,
        getBillingSummaryForOrganization: vi.fn().mockResolvedValue(buildBillingSummary())
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/verify-code",
      payload: {
        email: "owner@example.com",
        code: "123456",
        requested_trial_plan: "solo"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().session.organization_plan).toBe("free");
    expect(startTrial).not.toHaveBeenCalled();
    expect(
      createAuditLog.mock.calls.some(
        ([entry]) => entry.action === "billing.trial.start"
      )
    ).toBe(false);
  });

  it("preserves GitHub signup trial intent through a signed callback cookie", async (): Promise<void> => {
    const previousSecret = process.env["GITHUB_OAUTH_STATE_SECRET"];
    process.env["GITHUB_OAUTH_STATE_SECRET"] = "test-github-oauth-state-secret";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T00:00:00.000Z"));

    try {
      const trialSummary = buildBillingSummary({
        plan: "team",
        billing_state: "trialing",
        trial: {
          available: false,
          active: true,
          plan: "team",
          started_at: "2026-06-04T00:00:00.000Z",
          ends_at: "2026-07-04T00:00:00.000Z",
          used_at: "2026-06-04T00:00:00.000Z",
          converted_at: null,
          expired_at: null,
          days_remaining: 30
        }
      });
      const startTrial = vi.fn().mockResolvedValue(trialSummary);
      const completeGithubAuth = vi.fn().mockResolvedValue({
        ok: true,
        created_user: true,
        session_token: "session-secret",
        accepted_terms_at: "2026-06-04T00:00:00.000Z",
        redirect_url: "http://localhost:5291/auth/github/callback",
        session: {
          session_id: "ses_123",
          user_id: "usr_123",
          email: "owner@example.com",
          email_verified_at: "2026-06-04T00:00:00.000Z",
          organization_id: "org_123",
          role: "owner",
          created_at: "2026-06-04T00:00:00.000Z",
          expires_at: "2026-06-04T04:00:00.000Z",
          revoked_at: null,
          has_email_auth: false,
          has_github_oauth: true
        }
      });
      const app = createServer({
        webAuth: {
          beginGithubAuth: vi.fn().mockResolvedValue({
            ok: true,
            authorization_url: "https://github.example.test/login/oauth/authorize?state=oauth-state",
            state: "oauth-state",
            expires_at: "2026-07-01T00:10:00.000Z"
          }),
          completeGithubAuth
        },
        billingManagement: {
          startTrial,
          getBillingSummaryForOrganization: vi.fn().mockResolvedValue(trialSummary)
        }
      });

      const start = await app.inject({
        method: "GET",
        url: "/v1/auth/github/start?trial=team"
      });
      const setCookie = Array.isArray(start.headers["set-cookie"])
        ? start.headers["set-cookie"].join("; ")
        : String(start.headers["set-cookie"]);
      const stateCookie = /dbundle_github_oauth_state=([^;]+)/.exec(setCookie)?.[0];
      const trialCookie = /dbundle_github_signup_trial=([^;]+)/.exec(setCookie)?.[0];

      expect(start.statusCode).toBe(302);
      expect(trialCookie).toBeDefined();

      const callback = await app.inject({
        method: "GET",
        url: "/v1/auth/github/callback?code=oauth-code&state=oauth-state",
        headers: {
          cookie: `${stateCookie}; ${trialCookie}`
        }
      });

      expect(callback.statusCode).toBe(302);
      expect(startTrial).toHaveBeenCalledWith({
        organization_id: "org_123",
        target_plan: "team",
        now: expect.any(String)
      });
      expect(String(callback.headers["set-cookie"])).toContain("dbundle_github_signup_trial=;");
    } finally {
      if (previousSecret === undefined) {
        delete process.env["GITHUB_OAUTH_STATE_SECRET"];
      } else {
        process.env["GITHUB_OAUTH_STATE_SECRET"] = previousSecret;
      }
      vi.useRealTimers();
    }
  });
});
