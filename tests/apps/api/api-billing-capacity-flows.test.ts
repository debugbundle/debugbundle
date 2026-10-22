import { describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAME, buildCsrfToken } from "../../../packages/auth/src/index.js";
import { createBillingServer as createServer } from "../../helpers/api-billing-server.js";

describe("api billing capacity routes", () => {
  it("should increase allowance capacity for owners", async (): Promise<void> => {
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue(null),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi.fn().mockResolvedValue({
        plan: "solo",
        stripe_customer_id: "cus_123",
        active_projects: 2,
        capacity_units: {
          total: 6,
          included: 3,
          additional_purchased: 3,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-03-23T11:56:12.000Z",
          ends_at: "2026-04-23T11:56:12.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 20, limit: 1500 },
          monthly_raw_ingested_events: { used: 200, limit: 12000 },
          retained_bundle_cap: { used: 5, limit: 900 },
          monthly_remote_activations: { used: 1, limit: 150 },
          monthly_alert_deliveries: { used: 3, limit: 450 },
          monthly_webhook_deliveries: { used: 6, limit: 1500 }
        }
      }),
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

    const csrfToken = buildCsrfToken("session-secret");
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/capacity/increase",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_additional_capacity_units: 3
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      billing: expect.objectContaining({
        capacity_units: expect.objectContaining({
          additional_purchased: 3,
          total: 6
        })
      })
    });
    expect(billingManagement.increaseCapacity).toHaveBeenCalledWith({
      organization_id: "org_123",
      target_additional_capacity_units: 3,
      now: expect.any(String)
    });
  });

  it("should let allowlisted internal operators increase capacity without Stripe", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const overrideOrganizationBilling = vi.fn().mockResolvedValue({
      plan: "team",
      stripe_customer_id: null,
      active_projects: 2,
      capacity_units: {
        total: 18,
        included: 15,
        additional_purchased: 3,
        pending_reduction: null
      },
      usage_window: {
        starts_at: "2026-03-23T11:56:12.000Z",
        ends_at: "2026-04-23T11:56:12.000Z"
      },
      allowances: {
        monthly_bundle_requests: { used: 20, limit: 13500 },
        monthly_raw_ingested_events: { used: 200, limit: 189000 },
        retained_bundle_cap: { used: 5, limit: 8100 },
        monthly_remote_activations: { used: 1, limit: 1350 },
        monthly_alert_deliveries: { used: 3, limit: 4050 },
        monthly_webhook_deliveries: { used: 6, limit: 13500 }
      }
    });
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "team",
        stripe_customer_id: null,
        active_projects: 2,
        capacity_units: {
          total: 17,
          included: 15,
          additional_purchased: 2,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-03-23T11:56:12.000Z",
          ends_at: "2026-04-23T11:56:12.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 20, limit: 12750 },
          monthly_raw_ingested_events: { used: 200, limit: 178500 },
          retained_bundle_cap: { used: 5, limit: 7650 },
          monthly_remote_activations: { used: 1, limit: 1275 },
          monthly_alert_deliveries: { used: 3, limit: 3825 },
          monthly_webhook_deliveries: { used: 6, limit: 12750 }
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

    const csrfToken = buildCsrfToken("session-secret");
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/capacity/increase",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_additional_capacity_units: 3
      }
    });

    expect(response.statusCode).toBe(200);
    expect(billingManagement.increaseCapacity).not.toHaveBeenCalled();
    expect(overrideOrganizationBilling).toHaveBeenCalledWith({
      organization_id: "org_123",
      plan: "team",
      additional_capacity_units: 3,
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
          additional_capacity_units: 3,
          reason: "billing_admin_capacity_increase"
        }
      })
    );
  });

  it("should allow owner member tokens to schedule allowance-capacity reductions", async (): Promise<void> => {
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue(null),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi.fn().mockResolvedValue(null),
      scheduleCapacityReduction: vi.fn().mockResolvedValue({
        plan: "solo",
        stripe_customer_id: "cus_123",
        active_projects: 3,
        capacity_units: {
          total: 5,
          included: 3,
          additional_purchased: 2,
          pending_reduction: {
            additional_purchased: 0,
            total: 3,
            effective_at: "2026-04-23T11:56:12.000Z"
          }
        },
        usage_window: {
          starts_at: "2026-03-23T11:56:12.000Z",
          ends_at: "2026-04-23T11:56:12.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 20, limit: 1250 },
          monthly_raw_ingested_events: { used: 200, limit: 10000 },
          retained_bundle_cap: { used: 5, limit: 750 },
          monthly_remote_activations: { used: 1, limit: 125 },
          monthly_alert_deliveries: { used: 3, limit: 375 },
          monthly_webhook_deliveries: { used: 6, limit: 1250 }
        }
      }),
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
      method: "POST",
      url: "/v1/billing/capacity/scheduled-reduction",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        target_additional_capacity_units: 0
      }
    });

    expect(response.statusCode).toBe(200);
    expect(billingManagement.scheduleCapacityReduction).toHaveBeenCalledWith({
      organization_id: "org_123",
      target_additional_capacity_units: 0,
      now: expect.any(String)
    });
  });

  it("should let allowlisted internal operators reduce capacity without Stripe schedules", async (): Promise<void> => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);
    const overrideOrganizationBilling = vi.fn().mockResolvedValue({
      plan: "team",
      stripe_customer_id: null,
      active_projects: 3,
      capacity_units: {
        total: 16,
        included: 15,
        additional_purchased: 1,
        pending_reduction: null
      },
      usage_window: {
        starts_at: "2026-03-23T11:56:12.000Z",
        ends_at: "2026-04-23T11:56:12.000Z"
      },
      allowances: {
        monthly_bundle_requests: { used: 20, limit: 12000 },
        monthly_raw_ingested_events: { used: 200, limit: 168000 },
        retained_bundle_cap: { used: 5, limit: 7200 },
        monthly_remote_activations: { used: 1, limit: 1200 },
        monthly_alert_deliveries: { used: 3, limit: 3600 },
        monthly_webhook_deliveries: { used: 6, limit: 12000 }
      }
    });
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "team",
        stripe_customer_id: null,
        active_projects: 3,
        capacity_units: {
          total: 17,
          included: 15,
          additional_purchased: 2,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-03-23T11:56:12.000Z",
          ends_at: "2026-04-23T11:56:12.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 20, limit: 12750 },
          monthly_raw_ingested_events: { used: 200, limit: 178500 },
          retained_bundle_cap: { used: 5, limit: 7650 },
          monthly_remote_activations: { used: 1, limit: 1275 },
          monthly_alert_deliveries: { used: 3, limit: 3825 },
          monthly_webhook_deliveries: { used: 6, limit: 12750 }
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
          email: "arnold.farrugia@gmail.com",
          organization_id: "org_123",
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
      method: "POST",
      url: "/v1/billing/capacity/scheduled-reduction",
      headers: {
        authorization: "Bearer dbundle_mem_test"
      },
      payload: {
        target_additional_capacity_units: 1
      }
    });

    expect(response.statusCode).toBe(200);
    expect(billingManagement.scheduleCapacityReduction).not.toHaveBeenCalled();
    expect(overrideOrganizationBilling).toHaveBeenCalledWith({
      organization_id: "org_123",
      plan: "team",
      additional_capacity_units: 1,
      now: expect.any(String)
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        actor_user_id: "usr_123",
        actor_type: "member_token",
        action: "billing.admin_override",
        target_type: "organization",
        target_id: "org_123",
        status: "success",
        metadata: {
          plan: "team",
          additional_capacity_units: 1,
          reason: "billing_admin_capacity_reduction"
        }
      })
    );
  });

  it("should return scheduled capacity reductions in billing responses", async (): Promise<void> => {
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "solo",
        stripe_customer_id: "cus_123",
        active_projects: 3,
        capacity_units: {
          total: 5,
          included: 3,
          additional_purchased: 2,
          pending_reduction: {
            additional_purchased: 1,
            total: 4,
            effective_at: "2026-04-23T11:56:12.000Z"
          }
        },
        usage_window: {
          starts_at: "2026-03-23T11:56:12.000Z",
          ends_at: "2026-04-23T11:56:12.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 20, limit: 1250 },
          monthly_raw_ingested_events: { used: 200, limit: 10000 },
          retained_bundle_cap: { used: 5, limit: 750 },
          monthly_remote_activations: { used: 1, limit: 125 },
          monthly_alert_deliveries: { used: 3, limit: 375 },
          monthly_webhook_deliveries: { used: 6, limit: 1250 }
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
      billing: expect.objectContaining({
        capacity_units: expect.objectContaining({
          pending_reduction: {
            additional_purchased: 1,
            total: 4,
            effective_at: "2026-04-23T11:56:12.000Z"
          }
        })
      })
    });
  });

  it("should map allowance-capacity route failure statuses", async (): Promise<void> => {
    const billingManagement = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue(null),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue(null),
      increaseCapacity: vi
        .fn()
        .mockResolvedValueOnce("billing_not_configured")
        .mockResolvedValueOnce("billing_not_found")
        .mockResolvedValueOnce("pending_capacity_reduction_exists"),
      scheduleCapacityReduction: vi.fn().mockResolvedValueOnce("invalid_target_quantity"),
      cancelCapacityReduction: vi
        .fn()
        .mockResolvedValueOnce("capacity_reduction_not_found")
        .mockResolvedValueOnce("billing_not_found")
        .mockResolvedValueOnce("billing_not_configured")
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
    const invalidMemberTokenApp = createServer({
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue(null)
      },
      billingManagement
    });

    const csrfToken = buildCsrfToken("session-secret");

    const invalidIncreasePayload = await app.inject({
      method: "POST",
      url: "/v1/billing/capacity/increase",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_additional_capacity_units: 100
      }
    });
    const increaseNotConfigured = await app.inject({
      method: "POST",
      url: "/v1/billing/capacity/increase",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_additional_capacity_units: 2
      }
    });
    const increaseNotFound = await app.inject({
      method: "POST",
      url: "/v1/billing/capacity/increase",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_additional_capacity_units: 2
      }
    });
    const increaseConflict = await app.inject({
      method: "POST",
      url: "/v1/billing/capacity/increase",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_additional_capacity_units: 2
      }
    });
    const invalidSchedulePayload = await app.inject({
      method: "POST",
      url: "/v1/billing/capacity/scheduled-reduction",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_additional_capacity_units: 100
      }
    });
    const scheduleConflict = await app.inject({
      method: "POST",
      url: "/v1/billing/capacity/scheduled-reduction",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      },
      payload: {
        target_additional_capacity_units: 0
      }
    });
    const cancelNotFound = await app.inject({
      method: "DELETE",
      url: "/v1/billing/capacity/scheduled-reduction",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      }
    });
    const cancelBillingNotFound = await app.inject({
      method: "DELETE",
      url: "/v1/billing/capacity/scheduled-reduction",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      }
    });
    const cancelNotConfigured = await app.inject({
      method: "DELETE",
      url: "/v1/billing/capacity/scheduled-reduction",
      cookies: {
        [SESSION_COOKIE_NAME]: "session-secret"
      },
      headers: {
        "x-csrf-token": csrfToken
      }
    });
    const invalidMemberToken = await invalidMemberTokenApp.inject({
      method: "DELETE",
      url: "/v1/billing/capacity/scheduled-reduction",
      headers: {
        authorization: "Bearer dbundle_mem_invalid"
      }
    });

    expect(invalidIncreasePayload.statusCode).toBe(400);
    expect(invalidIncreasePayload.json()).toEqual({ error: "invalid_payload" });
    expect(increaseNotConfigured.statusCode).toBe(503);
    expect(increaseNotConfigured.json()).toEqual({ error: "billing_not_configured" });
    expect(increaseNotFound.statusCode).toBe(404);
    expect(increaseNotFound.json()).toEqual({ error: "billing_not_found" });
    expect(increaseConflict.statusCode).toBe(409);
    expect(increaseConflict.json()).toEqual({ error: "pending_capacity_reduction_exists" });
    expect(invalidSchedulePayload.statusCode).toBe(400);
    expect(invalidSchedulePayload.json()).toEqual({ error: "invalid_payload" });
    expect(scheduleConflict.statusCode).toBe(409);
    expect(scheduleConflict.json()).toEqual({ error: "invalid_target_quantity" });
    expect(cancelNotFound.statusCode).toBe(409);
    expect(cancelNotFound.json()).toEqual({ error: "capacity_reduction_not_found" });
    expect(cancelBillingNotFound.statusCode).toBe(404);
    expect(cancelBillingNotFound.json()).toEqual({ error: "billing_not_found" });
    expect(cancelNotConfigured.statusCode).toBe(503);
    expect(cancelNotConfigured.json()).toEqual({ error: "billing_not_configured" });
    expect(invalidMemberToken.statusCode).toBe(401);
    expect(invalidMemberToken.json()).toEqual({ error: "invalid_member_token" });
  });
});
