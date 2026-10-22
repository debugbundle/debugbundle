import { describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../../packages/auth/src/index.js";
import { createBillingServer as createServer } from "../../helpers/api-billing-server.js";

describe("api billing authentication and summaries", () => {
  it("should reject billing requests without a valid session and when billing dependencies are unavailable", async (): Promise<void> => {
    const unauthenticatedApp = createServer();
    const missingDepsApp = createServer({
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "owner@example.com",
          organization_id: "org_123",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          role: "owner"
        })
      },
      billingManagement: undefined
    });

    const unauthenticated = await unauthenticatedApp.inject({
      method: "GET",
      url: "/v1/billing"
    });
    const missingDeps = await missingDepsApp.inject({
      method: "GET",
      url: "/v1/billing",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      }
    });

    expect([unauthenticated.statusCode, unauthenticated.headers["cache-control"]]).toEqual([
      401,
      "no-store"
    ]);
    expect(unauthenticated.json()).toEqual({ error: "invalid_session" });
    expect(missingDeps.statusCode).toBe(404);
    expect(missingDeps.json()).toEqual({ error: "billing_not_available" });
  });

  it("should keep auth and CSRF checks enabled for billing routes in self-host mode", async (): Promise<void> => {
    vi.stubEnv("SELFHOST_MODE", "true");

    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "free",
        stripe_customer_id: null,
        active_projects: 1,
        capacity_units: {
          total: 1,
          included: 1,
          additional_purchased: 0,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-03-01T00:00:00.000Z",
          ends_at: "2026-04-01T00:00:00.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 10, limit: 100 },
          monthly_raw_ingested_events: { used: 120, limit: 750 },
          retained_bundle_cap: { used: 6, limit: 50 },
          monthly_remote_activations: { used: 0, limit: 0 },
          monthly_alert_deliveries: { used: 4, limit: 25 },
          monthly_webhook_deliveries: { used: 8, limit: 100 }
        }
      }),
      createCheckoutLink: vi
        .fn()
        .mockResolvedValue({ url: "https://billing.stripe.com/checkout/solo" }),
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi.fn().mockResolvedValue(null),
      scheduleCapacityReduction: vi.fn().mockResolvedValue(null),
      cancelCapacityReduction: vi.fn().mockResolvedValue(null)
    };

    const unauthenticatedApp = createServer({ billingManagement });
    const missingCsrfApp = createServer({
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "owner@example.com",
          organization_id: "org_123",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          role: "owner"
        })
      },
      billingManagement
    });

    try {
      const unauthenticated = await unauthenticatedApp.inject({
        method: "POST",
        url: "/v1/billing/checkout",
        payload: {
          target_plan: "solo"
        }
      });
      const missingCsrf = await missingCsrfApp.inject({
        method: "POST",
        url: "/v1/billing/checkout",
        cookies: {
          [SESSION_COOKIE_NAME]: "session-secret"
        },
        payload: {
          target_plan: "solo"
        }
      });

      expect(unauthenticated.statusCode).toBe(401);
      expect(unauthenticated.json()).toEqual({ error: "invalid_session" });
      expect(missingCsrf.statusCode).toBe(403);
      expect(missingCsrf.json()).toEqual({ error: "invalid_csrf_token" });
      expect(billingManagement.createCheckoutLink).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("should return billing summary for owner sessions", async (): Promise<void> => {
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "solo",
        stripe_customer_id: "cus_123",
        active_projects: 1,
        capacity_units: {
          total: 3,
          included: 3,
          additional_purchased: 0,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-03-01T00:00:00.000Z",
          ends_at: "2026-04-01T00:00:00.000Z"
        },
        allowances: {
          monthly_bundle_requests: {
            used: 180,
            limit: 750
          },
          monthly_raw_ingested_events: {
            used: 800,
            limit: 10500
          },
          retained_bundle_cap: {
            used: 40,
            limit: 450
          },
          monthly_remote_activations: {
            used: 3,
            limit: 75
          },
          monthly_alert_deliveries: {
            used: 10,
            limit: 225
          },
          monthly_webhook_deliveries: {
            used: 20,
            limit: 750
          }
        }
      }),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi.fn().mockResolvedValue(null),
      scheduleCapacityReduction: vi.fn().mockResolvedValue(null),
      cancelCapacityReduction: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "owner@example.com",
          organization_id: "org_123",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          role: "owner"
        })
      },
      billingManagement
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/billing",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      billing: {
        plan: "solo",
        stripe_customer_id: "cus_123",
        active_projects: 1,
        capacity_units: {
          total: 3,
          included: 3,
          additional_purchased: 0,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-03-01T00:00:00.000Z",
          ends_at: "2026-04-01T00:00:00.000Z"
        },
        allowances: {
          monthly_bundle_requests: {
            used: 180,
            limit: 750
          },
          monthly_raw_ingested_events: {
            used: 800,
            limit: 10500
          },
          retained_bundle_cap: {
            used: 40,
            limit: 450
          },
          monthly_remote_activations: {
            used: 3,
            limit: 75
          },
          monthly_alert_deliveries: {
            used: 10,
            limit: 225
          },
          monthly_webhook_deliveries: {
            used: 20,
            limit: 750
          }
        }
      }
    });
    expect(billingManagement.getBillingSummaryForOrganization).toHaveBeenCalledWith({
      organization_id: "org_123",
      now: expect.any(String)
    });
  });

  it("should auto-default allowlisted billing operators to the team plan", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const overrideOrganizationBilling = vi.fn().mockResolvedValue({
      plan: "team",
      stripe_customer_id: null,
      active_projects: 1,
      capacity_units: {
        total: 15,
        included: 15,
        additional_purchased: 0,
        pending_reduction: null
      },
      usage_window: {
        starts_at: "2026-03-01T00:00:00.000Z",
        ends_at: "2026-04-01T00:00:00.000Z"
      },
      allowances: {
        monthly_bundle_requests: { used: 0, limit: 11250 },
        monthly_raw_ingested_events: { used: 0, limit: 157500 },
        retained_bundle_cap: { used: 0, limit: 6750 },
        monthly_remote_activations: { used: 0, limit: 1125 },
        monthly_alert_deliveries: { used: 0, limit: 3375 },
        monthly_webhook_deliveries: { used: 0, limit: 11250 }
      }
    });
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "free",
        stripe_customer_id: null,
        active_projects: 1,
        capacity_units: {
          total: 1,
          included: 1,
          additional_purchased: 0,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-03-01T00:00:00.000Z",
          ends_at: "2026-04-01T00:00:00.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 0, limit: 750 },
          monthly_raw_ingested_events: { used: 0, limit: 750 },
          retained_bundle_cap: { used: 0, limit: 50 },
          monthly_remote_activations: { used: 0, limit: 0 },
          monthly_alert_deliveries: { used: 0, limit: 75 },
          monthly_webhook_deliveries: { used: 0, limit: 750 }
        }
      }),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi.fn().mockResolvedValue(null),
      scheduleCapacityReduction: vi.fn().mockResolvedValue(null),
      cancelCapacityReduction: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "arnold.farrugia@gmail.com",
          organization_id: "org_123",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          role: "owner"
        })
      },
      billingManagement,
      billingAdmin: {
        isOperatorAllowed: vi.fn().mockReturnValue(true),
        overrideOrganizationBilling
      },
      auditLogging: {
        createAuditLog
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/billing",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      billing: expect.objectContaining({
        plan: "team",
        stripe_customer_id: null
      })
    });
    expect(overrideOrganizationBilling).toHaveBeenCalledWith({
      organization_id: "org_123",
      plan: "team",
      additional_capacity_units: 0,
      now: expect.any(String)
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        actor_user_id: "usr_123",
        actor_type: "browser_session",
        action: "billing.admin_override",
        target_type: "organization",
        target_id: "org_123",
        status: "success",
        metadata: {
          plan: "team",
          additional_capacity_units: 0,
          reason: "billing_admin_auto_default_team"
        }
      })
    );
  });

  it("should rate limit billing mutations for owner browser sessions", async (): Promise<void> => {
    const claimRequest = vi.fn().mockResolvedValue({
      allowed: false,
      limit: 30,
      remaining: 0,
      retry_after_ms: 12_000
    });
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue(null),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi.fn().mockResolvedValue(null),
      scheduleCapacityReduction: vi.fn().mockResolvedValue(null),
      cancelCapacityReduction: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      authRateLimiter: { claimRequest },
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "owner@example.com",
          organization_id: "org_123",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          role: "owner"
        })
      },
      billingManagement
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=session-secret`,
        "x-csrf-token": buildCsrfToken("session-secret")
      },
      payload: {
        target_plan: "solo"
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ error: "rate_limited" });
    expect(response.headers["retry-after"]).toBe("12");
    expect(claimRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "management-write",
        subject: "member:usr_123",
        limit: 30
      })
    );
    expect(billingManagement.getBillingSummaryForOrganization).not.toHaveBeenCalled();
  });

  it("should return billing summary for owner member tokens", async (): Promise<void> => {
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "team",
        stripe_customer_id: "cus_123",
        active_projects: 3,
        capacity_units: {
          total: 18,
          included: 15,
          additional_purchased: 3,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-03-01T00:00:00.000Z",
          ends_at: "2026-04-01T00:00:00.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 10, limit: 9000 },
          monthly_raw_ingested_events: { used: 250, limit: 90000 },
          retained_bundle_cap: { used: 12, limit: 5400 },
          monthly_remote_activations: { used: 4, limit: 900 },
          monthly_alert_deliveries: { used: 15, limit: 2700 },
          monthly_webhook_deliveries: { used: 30, limit: 9000 }
        }
      }),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi.fn().mockResolvedValue(null),
      scheduleCapacityReduction: vi.fn().mockResolvedValue(null),
      cancelCapacityReduction: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: "usr_123",
          organization_id: "org_123",
          role: "owner"
        })
      },
      billingManagement
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/billing",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      billing: expect.objectContaining({
        plan: "team",
        capacity_units: expect.objectContaining({
          additional_purchased: 3,
          total: 18
        })
      })
    });
  });
});
