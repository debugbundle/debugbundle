import { describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../../packages/auth/src/index.js";
import {
  createBillingServer as createServer,
  type BillingManagementDependency
} from "../../helpers/api-billing-server.js";
import { mockedObject } from "../../helpers/vitest.ts";

describe("api billing checkout and portal", () => {
  it("should create a checkout link for owners and reject member sessions", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
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
          monthly_bundle_requests: {
            used: 10,
            limit: 100
          },
          monthly_raw_ingested_events: {
            used: 120,
            limit: 750
          },
          retained_bundle_cap: {
            used: 6,
            limit: 50
          },
          monthly_remote_activations: {
            used: 0,
            limit: 0
          },
          monthly_alert_deliveries: {
            used: 4,
            limit: 25
          },
          monthly_webhook_deliveries: {
            used: 8,
            limit: 100
          }
        }
      }),
      createCheckoutLink: vi.fn().mockResolvedValue({
        url: "https://billing.stripe.com/checkout/solo"
      }),
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi.fn().mockResolvedValue(null),
      scheduleCapacityReduction: vi.fn().mockResolvedValue(null),
      cancelCapacityReduction: vi.fn().mockResolvedValue(null)
    };
    const verifiedOwnerApp = createServer({
      auditLogging: { createAuditLog },
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
    const memberApp = createServer({
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "member@example.com",
          organization_id: "org_123",
          email_verified_at: "2026-03-17T00:00:00.000Z",
          role: "member"
        })
      },
      billingManagement
    });
    const unverifiedApp = createServer({
      webAuth: {
        resolveSessionByToken: vi.fn().mockResolvedValue({
          user_id: "usr_123",
          email: "owner@example.com",
          organization_id: "org_123",
          email_verified_at: null,
          role: "owner"
        })
      },
      billingManagement
    });

    const csrfToken = buildCsrfToken("session-secret");
    const verified = await verifiedOwnerApp.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_plan: "solo"
      }
    });
    const member = await memberApp.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_plan: "solo"
      }
    });
    const unverified = await unverifiedApp.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_plan: "solo"
      }
    });

    expect(verified.statusCode).toBe(200);
    expect(verified.json()).toEqual({
      url: "https://billing.stripe.com/checkout/solo"
    });
    expect(billingManagement.createCheckoutLink).toHaveBeenCalledWith({
      organization_id: "org_123",
      billing_email: "owner@example.com",
      current_plan: "free",
      target_plan: "solo"
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        actor_user_id: "usr_123",
        actor_type: "browser_session",
        action: "billing.checkout",
        target_type: "billing_checkout",
        target_id: "org_123",
        status: "success",
        occurred_at: expect.any(String),
        metadata: {
          current_plan: "free",
          target_plan: "solo"
        }
      })
    );
    expect(member.statusCode).toBe(403);
    expect(member.json()).toEqual({ error: "forbidden" });
    expect(unverified.statusCode).toBe(403);
    expect(unverified.json()).toEqual({ error: "email_verification_required" });
  });

  it("should create a customer-portal link for paid owners", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "team",
        stripe_customer_id: "cus_123",
        active_projects: 4,
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
          monthly_bundle_requests: {
            used: 600,
            limit: 15000
          },
          monthly_raw_ingested_events: {
            used: 3200,
            limit: 150000
          },
          retained_bundle_cap: {
            used: 75,
            limit: 6000
          },
          monthly_remote_activations: {
            used: 30,
            limit: 750
          },
          monthly_alert_deliveries: {
            used: 90,
            limit: 4500
          },
          monthly_webhook_deliveries: {
            used: 180,
            limit: 15000
          }
        }
      }),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue({
        url: "https://billing.stripe.com/p/session_123"
      }),
      increaseCapacity: vi.fn().mockResolvedValue(null),
      scheduleCapacityReduction: vi.fn().mockResolvedValue(null),
      cancelCapacityReduction: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      auditLogging: { createAuditLog },
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

    const csrfToken = buildCsrfToken("session-secret");
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/portal",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      url: "https://billing.stripe.com/p/session_123"
    });
    expect(billingManagement.createPortalLink).toHaveBeenCalledWith({
      organization_id: "org_123",
      current_plan: "team"
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        actor_user_id: "usr_123",
        actor_type: "browser_session",
        action: "billing.portal",
        target_type: "billing_portal",
        target_id: "org_123",
        status: "success",
        occurred_at: expect.any(String),
        metadata: {
          current_plan: "team"
        }
      })
    );
  });

  it("should map checkout and portal failure statuses for owners", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const billingManagement = {
      getBillingSummaryForOrganization: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          plan: "team",
          stripe_customer_id: "cus_123",
          active_projects: 2,
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
            monthly_bundle_requests: { used: 10, limit: 7500 },
            monthly_raw_ingested_events: { used: 100, limit: 150000 },
            retained_bundle_cap: { used: 5, limit: 6000 },
            monthly_remote_activations: { used: 1, limit: 750 },
            monthly_alert_deliveries: { used: 2, limit: 4500 },
            monthly_webhook_deliveries: { used: 4, limit: 15000 }
          }
        })
        .mockResolvedValueOnce({
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
            monthly_raw_ingested_events: { used: 100, limit: 750 },
            retained_bundle_cap: { used: 5, limit: 50 },
            monthly_remote_activations: { used: 0, limit: 0 },
            monthly_alert_deliveries: { used: 1, limit: 25 },
            monthly_webhook_deliveries: { used: 2, limit: 100 }
          }
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
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
            monthly_raw_ingested_events: { used: 100, limit: 750 },
            retained_bundle_cap: { used: 5, limit: 50 },
            monthly_remote_activations: { used: 0, limit: 0 },
            monthly_alert_deliveries: { used: 1, limit: 25 },
            monthly_webhook_deliveries: { used: 2, limit: 100 }
          }
        })
        .mockResolvedValueOnce({
          plan: "team",
          stripe_customer_id: "cus_123",
          active_projects: 2,
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
            monthly_bundle_requests: { used: 10, limit: 7500 },
            monthly_raw_ingested_events: { used: 100, limit: 150000 },
            retained_bundle_cap: { used: 5, limit: 6000 },
            monthly_remote_activations: { used: 1, limit: 750 },
            monthly_alert_deliveries: { used: 2, limit: 4500 },
            monthly_webhook_deliveries: { used: 4, limit: 15000 }
          }
        }),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi.fn().mockResolvedValue(null),
      scheduleCapacityReduction: vi.fn().mockResolvedValue(null),
      cancelCapacityReduction: vi.fn().mockResolvedValue(null)
    };
    const app = createServer({
      auditLogging: { createAuditLog },
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

    const csrfToken = buildCsrfToken("session-secret");

    const invalidPayload = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_plan: "enterprise"
      }
    });
    const missingBilling = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_plan: "solo"
      }
    });
    const invalidPlan = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_plan: "solo"
      }
    });
    const notConfiguredCheckout = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_plan: "solo"
      }
    });
    const missingPortalBilling = await app.inject({
      method: "POST",
      url: "/v1/billing/portal",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      }
    });
    const noSubscriptionPortal = await app.inject({
      method: "POST",
      url: "/v1/billing/portal",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      }
    });
    const notConfiguredPortal = await app.inject({
      method: "POST",
      url: "/v1/billing/portal",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      }
    });

    expect(invalidPayload.statusCode).toBe(400);
    expect(invalidPayload.json()).toEqual({ error: "invalid_payload" });
    expect(missingBilling.statusCode).toBe(404);
    expect(missingBilling.json()).toEqual({ error: "billing_not_found" });
    expect(invalidPlan.statusCode).toBe(409);
    expect(invalidPlan.json()).toEqual({ error: "invalid_plan_change" });
    expect(notConfiguredCheckout.statusCode).toBe(503);
    expect(notConfiguredCheckout.json()).toEqual({ error: "billing_not_configured" });
    expect(missingPortalBilling.statusCode).toBe(404);
    expect(missingPortalBilling.json()).toEqual({ error: "billing_not_found" });
    expect(noSubscriptionPortal.statusCode).toBe(409);
    expect(noSubscriptionPortal.json()).toEqual({ error: "no_active_subscription" });
    expect(notConfiguredPortal.statusCode).toBe(503);
    expect(notConfiguredPortal.json()).toEqual({ error: "billing_not_configured" });
    expect(createAuditLog).toHaveBeenCalledTimes(6);
  });

  it("should confirm a returned Stripe checkout session and return the updated billing summary", async (): Promise<void> => {
    const confirmCheckoutSession = vi.fn().mockResolvedValue({
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
        starts_at: "2026-05-10T22:14:57.000Z",
        ends_at: "2026-06-10T22:14:57.000Z"
      },
      allowances: {
        monthly_bundle_requests: { used: 0, limit: 750 },
        monthly_raw_ingested_events: { used: 0, limit: 10500 },
        retained_bundle_cap: { used: 0, limit: 450 },
        monthly_remote_activations: { used: 0, limit: 75 },
        monthly_alert_deliveries: { used: 0, limit: 225 },
        monthly_webhook_deliveries: { used: 0, limit: 750 }
      }
    });
    const billingManagement = mockedObject<BillingManagementDependency>({
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue(null),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      confirmCheckoutSession,
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi.fn().mockResolvedValue(null),
      scheduleCapacityReduction: vi.fn().mockResolvedValue(null),
      cancelCapacityReduction: vi.fn().mockResolvedValue(null)
    });
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
      method: "POST",
      url: "/v1/billing/checkout/confirm",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": buildCsrfToken("session-secret")
      },
      payload: {
        session_id: "cs_test_123"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(confirmCheckoutSession).toHaveBeenCalledWith({
      organization_id: "org_123",
      session_id: "cs_test_123",
      now: expect.any(String)
    });
    expect(response.json()).toEqual({
      billing: expect.objectContaining({
        plan: "solo",
        stripe_customer_id: "cus_123"
      })
    });
  });
});
