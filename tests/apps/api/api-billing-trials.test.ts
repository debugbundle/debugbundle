import { describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../../packages/auth/src/index.js";
import { createApiServer } from "../../../apps/api/src/server.ts";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type WebAuthDependency = MockedMethods<NonNullable<ApiServerDependencies["webAuth"]>>;
type BillingManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["billingManagement"]>>;

function buildBillingSummary(
  overrides: Partial<Awaited<ReturnType<NonNullable<ApiServerDependencies["billingManagement"]>["getBillingSummaryForOrganization"]>>> = {}
) {
  return {
    plan: "free" as const,
    billing_state: null,
    stripe_customer_id: null,
    active_projects: 1,
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

function createOwnerSession() {
  return {
    user_id: "usr_123",
    email: "owner@example.com",
    organization_id: "org_123",
    email_verified_at: "2026-06-04T00:00:00.000Z",
    role: "owner" as const
  };
}

function createServer(overrides: {
  webAuth?: Partial<WebAuthDependency>;
  billingManagement?: Partial<BillingManagementDependency>;
} = {}): ReturnType<typeof createApiServer> {
  const billingManagement = mockedObject<NonNullable<ApiServerDependencies["billingManagement"]>>({
    getBillingSummaryForOrganization:
      overrides.billingManagement?.getBillingSummaryForOrganization ??
      vi.fn().mockResolvedValue(buildBillingSummary()),
    createCheckoutLink:
      overrides.billingManagement?.createCheckoutLink ??
      vi.fn().mockResolvedValue({ url: "https://billing.example.test/checkout" }),
    createPortalLink:
      overrides.billingManagement?.createPortalLink ?? vi.fn().mockResolvedValue(null),
    startTrial:
      overrides.billingManagement?.startTrial ??
      vi.fn().mockResolvedValue(buildBillingSummary()),
    increaseCapacity:
      overrides.billingManagement?.increaseCapacity ?? vi.fn().mockResolvedValue(buildBillingSummary()),
    scheduleCapacityReduction:
      overrides.billingManagement?.scheduleCapacityReduction ?? vi.fn().mockResolvedValue(buildBillingSummary()),
    cancelCapacityReduction:
      overrides.billingManagement?.cancelCapacityReduction ?? vi.fn().mockResolvedValue(buildBillingSummary())
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
      requestEmailCode: vi.fn(),
      verifyEmailCode: vi.fn(),
      beginGithubAuth: vi.fn(),
      completeGithubAuth: vi.fn(),
      acceptInviteForSession: vi.fn(),
      revokeSessionByToken: vi.fn(),
      resolveSessionByToken: vi.fn().mockResolvedValue(createOwnerSession()),
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
    incidentRetrieval: {
      listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
      getIncidentForOrganization: vi.fn().mockResolvedValue(null),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([]),
      listServicesForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: {
      getObject: vi.fn()
    },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
      retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
    },
    billingManagement
  });
}

function buildBillingHeaders() {
  return {
    "x-csrf-token": buildCsrfToken("session-secret")
  };
}

function buildBillingCookies() {
  return {
    [SESSION_COOKIE_NAME]: "session-secret"
  };
}

describe("api billing trial routes", () => {
  it("starts a no-card trial for an owner session", async (): Promise<void> => {
    const trialSummary = buildBillingSummary({
      plan: "solo",
      billing_state: "trialing",
      trial: {
        available: false,
        active: true,
        plan: "solo",
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
      billingManagement: {
        startTrial
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/trial/start",
      headers: buildBillingHeaders(),
      cookies: buildBillingCookies(),
      payload: {
        target_plan: "solo"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().billing.plan).toBe("solo");
    expect(startTrial).toHaveBeenCalledWith({
      organization_id: "org_123",
      target_plan: "solo",
      now: expect.any(String)
    });
  });

  it("returns trial_unavailable when the organization can no longer start a trial", async (): Promise<void> => {
    const app = createServer({
      billingManagement: {
        startTrial: vi.fn().mockResolvedValue("trial_unavailable")
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/trial/start",
      headers: buildBillingHeaders(),
      cookies: buildBillingCookies(),
      payload: {
        target_plan: "team"
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "trial_unavailable" });
  });

  it("allows valid trial conversions and rejects invalid downgraded trial checkout targets", async (): Promise<void> => {
    const createCheckoutLink = vi.fn().mockResolvedValue({
      url: "https://billing.example.test/checkout"
    });
    const app = createServer({
      billingManagement: {
        getBillingSummaryForOrganization: vi
          .fn()
          .mockResolvedValueOnce(
            buildBillingSummary({
              plan: "solo",
              billing_state: "trialing",
              trial: {
                available: false,
                active: true,
                plan: "solo",
                started_at: "2026-06-04T00:00:00.000Z",
                ends_at: "2026-07-04T00:00:00.000Z",
                used_at: "2026-06-04T00:00:00.000Z",
                converted_at: null,
                expired_at: null,
                days_remaining: 30
              }
            })
          )
          .mockResolvedValueOnce(
            buildBillingSummary({
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
            })
          ),
        createCheckoutLink
      }
    });

    const allowed = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers: buildBillingHeaders(),
      cookies: buildBillingCookies(),
      payload: {
        target_plan: "solo"
      }
    });
    const rejected = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers: buildBillingHeaders(),
      cookies: buildBillingCookies(),
      payload: {
        target_plan: "solo"
      }
    });

    expect(allowed.statusCode).toBe(200);
    expect(createCheckoutLink).toHaveBeenCalledTimes(1);
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json()).toEqual({ error: "invalid_plan_change" });
  });

  it("rejects capacity mutations during an active no-card trial", async (): Promise<void> => {
    const activeTrialSummary = buildBillingSummary({
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
    const increaseCapacity = vi.fn();
    const scheduleCapacityReduction = vi.fn();
    const cancelCapacityReduction = vi.fn();
    const app = createServer({
      billingManagement: {
        getBillingSummaryForOrganization: vi.fn().mockResolvedValue(activeTrialSummary),
        increaseCapacity,
        scheduleCapacityReduction,
        cancelCapacityReduction
      }
    });

    const responses = await Promise.all([
      app.inject({
        method: "POST",
        url: "/v1/billing/capacity/increase",
        headers: buildBillingHeaders(),
        cookies: buildBillingCookies(),
        payload: {
          target_additional_capacity_units: 1
        }
      }),
      app.inject({
        method: "POST",
        url: "/v1/billing/capacity/scheduled-reduction",
        headers: buildBillingHeaders(),
        cookies: buildBillingCookies(),
        payload: {
          target_additional_capacity_units: 0
        }
      }),
      app.inject({
        method: "DELETE",
        url: "/v1/billing/capacity/scheduled-reduction",
        headers: buildBillingHeaders(),
        cookies: buildBillingCookies()
      })
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([409, 409, 409]);
    const responseBodies = responses.map((response) => response.json<{ error: string }>());

    expect(responseBodies).toEqual([
      { error: "trial_conversion_required" },
      { error: "trial_conversion_required" },
      { error: "trial_conversion_required" }
    ]);
    expect(increaseCapacity).not.toHaveBeenCalled();
    expect(scheduleCapacityReduction).not.toHaveBeenCalled();
    expect(cancelCapacityReduction).not.toHaveBeenCalled();
  });
});
