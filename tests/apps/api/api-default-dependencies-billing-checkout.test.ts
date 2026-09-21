import { describe, expect, it, vi } from "vitest";
import {
  createPostgresBillingStoreMock,
  recordPlanDowngradeCleanupAuditMock
} from "../../helpers/api-default-dependency-mocks.js";
import { createApiDependencies } from "../../../apps/api/src/default-dependencies.ts";
import { createBillingManagement } from "../../../apps/api/src/billing-management.ts";

describe("api-default-dependency-mocks billing-checkout", () => {
  it("overrides organization billing through the billing management service", async () => {
    const summary = {
      organization_id: "org_123",
      plan: "solo",
      billing_state: "admin_override",
      stripe_customer_id: null,
      active_projects: 1,
      capacity_units: {
        total: 3,
        included: 3,
        additional_purchased: 0,
        pending_reduction: null
      },
      usage_window: {
        starts_at: "2026-06-01T00:00:00.000Z",
        ends_at: "2026-07-01T00:00:00.000Z"
      },
      allowances: {
        monthly_bundle_requests: { used: 0, limit: 1000 },
        monthly_raw_ingested_events: { used: 0, limit: 10000 },
        retained_bundle_cap: { used: 0, limit: 100 },
        monthly_remote_activations: { used: 0, limit: 10 },
        monthly_alert_deliveries: { used: 0, limit: 100 },
        monthly_webhook_deliveries: { used: 0, limit: 100 }
      },
      trial: {
        available: false,
        active: false,
        plan: null,
        started_at: null,
        ends_at: null,
        used_at: null,
        converted_at: null,
        expired_at: null,
        days_remaining: null
      }
    };
    let previousPlanIndex = 0;
    const previousPlans = ["team", "solo"];
    const db = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("SELECT") && sql.includes("additional_capacity_units")) {
          const plan = previousPlans[previousPlanIndex] ?? "free";
          previousPlanIndex += 1;
          return { rows: [{ plan, additional_capacity_units: 0 }] };
        }

        if (sql.includes("UPDATE organizations")) {
          return { rows: [{ id: "org_123" }] };
        }

        return { rows: [], rowCount: 0 };
      })
    };
    const billingStore = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue(summary)
    };
    const service = createBillingManagement({
      db,
      billingStore: billingStore as never,
      billingSyncStore: {} as never,
      billingLinks: {
        createCheckoutUrl: vi.fn().mockReturnValue(null),
        createPortalUrl: vi.fn().mockReturnValue(null)
      }
    });

    await expect(
      service.overrideOrganizationBilling({
        organization_id: "org_123",
        plan: "solo",
        additional_capacity_units: 999,
        now: "2026-06-04T12:00:00.000Z"
      })
    ).resolves.toBe(summary);
    await expect(
      service.overrideOrganizationBilling({
        organization_id: "org_123",
        plan: "free",
        additional_capacity_units: 5,
        now: "2026-06-04T12:00:01.000Z"
      })
    ).resolves.toBe(summary);

    expect(db.query).toHaveBeenCalledWith("BEGIN", []);
    expect(db.query).toHaveBeenCalledWith("COMMIT", []);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE organizations"), [
      "org_123",
      "solo",
      99,
      "2026-06-04T12:00:00.000Z",
      "admin_override:2026-06-04T12:00:00.000Z"
    ]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE organizations"), [
      "org_123",
      "free",
      0,
      "2026-06-04T12:00:01.000Z",
      "admin_override:2026-06-04T12:00:01.000Z"
    ]);
    expect(recordPlanDowngradeCleanupAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        previous_plan: "team",
        target_plan: "solo",
        trigger_source: "admin_override",
        occurred_at: "2026-06-04T12:00:00.000Z"
      })
    );
    expect(recordPlanDowngradeCleanupAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        previous_plan: "solo",
        target_plan: "free",
        trigger_source: "admin_override",
        occurred_at: "2026-06-04T12:00:01.000Z"
      })
    );
  });

  it("returns billing_not_found when admin billing override cannot update or reload", async () => {
    const db = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        if (sql.includes("UPDATE organizations") && params[0] === "org_123") {
          return { rows: [{ id: "org_123" }] };
        }

        return { rows: [] };
      })
    };
    const billingStore = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue(null)
    };
    const service = createBillingManagement({
      db,
      billingStore: billingStore as never,
      billingSyncStore: {} as never,
      billingLinks: {
        createCheckoutUrl: vi.fn().mockReturnValue(null),
        createPortalUrl: vi.fn().mockReturnValue(null)
      }
    });

    await expect(
      service.overrideOrganizationBilling({
        organization_id: "missing",
        plan: "team",
        additional_capacity_units: 1,
        now: "2026-06-04T12:00:00.000Z"
      })
    ).resolves.toBe("billing_not_found");
    await expect(
      service.overrideOrganizationBilling({
        organization_id: "org_123",
        plan: "team",
        additional_capacity_units: 1,
        now: "2026-06-04T12:00:01.000Z"
      })
    ).resolves.toBe("billing_not_found");
  });

  it("should prefill checkout email for first-time Stripe customers", async (): Promise<void> => {
    const checkoutCreate = vi
      .fn()
      .mockResolvedValue({ url: "https://checkout.stripe.test/session_123" });
    const db = {
      query: vi.fn().mockResolvedValue({ rows: [{ stripe_customer_id: null }] })
    };
    const deps = createApiDependencies({
      objectStore: {
        putObject: vi.fn(),
        getObject: vi.fn(),
        deleteObjectsByPrefix: vi.fn()
      },
      queue: {
        enqueue: vi.fn()
      },
      db,
      stripeConfig: {
        client: {
          checkout: {
            sessions: {
              create: checkoutCreate
            }
          },
          billingPortal: {
            sessions: {
              create: vi.fn()
            }
          }
        },
        webhookSecret: "whsec_test",
        priceMap: new Map([
          ["price_solo", { plan: "solo", type: "plan" }],
          ["price_team", { plan: "team", type: "plan" }],
          ["price_solo_capacity", { plan: "solo", type: "extra_capacity" }],
          ["price_team_capacity", { plan: "team", type: "extra_capacity" }]
        ]),
        soloPriceId: "price_solo",
        teamPriceId: "price_team",
        soloExtraCapacityPriceId: "price_solo_capacity",
        teamExtraCapacityPriceId: "price_team_capacity"
      } as never
    });

    const checkout = await deps.billingManagement.createCheckoutLink({
      organization_id: "org_123",
      billing_email: "owner@example.com",
      current_plan: "free",
      target_plan: "solo"
    });

    expect(checkout).toEqual({ url: "https://checkout.stripe.test/session_123" });
    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        client_reference_id: "org_123",
        customer_email: "owner@example.com",
        line_items: [{ price: "price_solo", quantity: 1 }],
        automatic_tax: { enabled: true },
        billing_address_collection: "auto",
        tax_id_collection: { enabled: true },
        subscription_data: {
          metadata: { organization_id: "org_123" }
        },
        success_url: expect.stringContaining("session_id={CHECKOUT_SESSION_ID}")
      })
    );
    expect(db.query).toHaveBeenCalledWith(
      "SELECT stripe_customer_id FROM organizations WHERE id = $1 LIMIT 1",
      ["org_123"]
    );
  });

  it("should update saved Stripe customer billing details during checkout", async (): Promise<void> => {
    const checkoutCreate = vi
      .fn()
      .mockResolvedValue({ url: "https://checkout.stripe.test/session_456" });
    const db = {
      query: vi.fn().mockResolvedValue({ rows: [{ stripe_customer_id: "cus_existing" }] })
    };
    const deps = createApiDependencies({
      objectStore: {
        putObject: vi.fn(),
        getObject: vi.fn(),
        deleteObjectsByPrefix: vi.fn()
      },
      queue: {
        enqueue: vi.fn()
      },
      db,
      stripeConfig: {
        client: {
          checkout: {
            sessions: {
              create: checkoutCreate
            }
          },
          billingPortal: {
            sessions: {
              create: vi.fn()
            }
          }
        },
        webhookSecret: "whsec_test",
        priceMap: new Map([
          ["price_solo", { plan: "solo", type: "plan" }],
          ["price_team", { plan: "team", type: "plan" }],
          ["price_solo_capacity", { plan: "solo", type: "extra_capacity" }],
          ["price_team_capacity", { plan: "team", type: "extra_capacity" }]
        ]),
        soloPriceId: "price_solo",
        teamPriceId: "price_team",
        soloExtraCapacityPriceId: "price_solo_capacity",
        teamExtraCapacityPriceId: "price_team_capacity"
      } as never
    });

    const checkout = await deps.billingManagement.createCheckoutLink({
      organization_id: "org_123",
      billing_email: "owner@example.com",
      current_plan: "solo",
      target_plan: "team"
    });

    expect(checkout).toEqual({ url: "https://checkout.stripe.test/session_456" });
    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_existing",
        customer_update: { address: "auto", name: "auto" },
        line_items: [{ price: "price_team", quantity: 1 }],
        automatic_tax: { enabled: true },
        billing_address_collection: "auto",
        tax_id_collection: { enabled: true }
      })
    );
    expect(checkoutCreate.mock.calls[0]?.[0]).not.toHaveProperty("customer_email");
  });

  it("should increase allowance capacity immediately through the Stripe subscription", async (): Promise<void> => {
    const subscriptionUpdate = vi.fn().mockResolvedValue({ id: "sub_123" });
    const subscriptionRetrieve = vi.fn().mockResolvedValue({
      id: "sub_123",
      schedule: null,
      items: {
        data: [
          {
            id: "si_plan",
            price: {
              id: "price_solo",
              recurring: {
                interval: "month",
                interval_count: 1
              }
            },
            quantity: 1
          }
        ]
      }
    });
    const billingStore = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
        plan: "solo",
        stripe_customer_id: "cus_123",
        active_projects: 2,
        capacity_units: {
          total: 3,
          included: 3,
          additional_purchased: 0,
          pending_reduction: null
        },
        usage_window: {
          starts_at: "2026-03-23T11:56:12.000Z",
          ends_at: "2026-04-23T11:56:12.000Z"
        },
        allowances: {
          monthly_bundle_requests: { used: 20, limit: 750 },
          monthly_raw_ingested_events: { used: 200, limit: 10500 },
          retained_bundle_cap: { used: 5, limit: 450 },
          monthly_remote_activations: { used: 1, limit: 75 },
          monthly_alert_deliveries: { used: 3, limit: 225 },
          monthly_webhook_deliveries: { used: 6, limit: 750 }
        }
      }),
      getBillingSummaryForProject: vi.fn()
    };
    createPostgresBillingStoreMock.mockReturnValueOnce(billingStore);

    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            plan: "solo",
            stripe_customer_id: "cus_123",
            stripe_subscription_id: "sub_123"
          }
        ]
      })
    };

    const deps = createApiDependencies({
      objectStore: {
        putObject: vi.fn(),
        getObject: vi.fn(),
        deleteObjectsByPrefix: vi.fn()
      },
      queue: {
        enqueue: vi.fn()
      },
      db,
      stripeConfig: {
        client: {
          subscriptions: {
            retrieve: subscriptionRetrieve,
            update: subscriptionUpdate
          },
          subscriptionSchedules: {
            create: vi.fn(),
            retrieve: vi.fn(),
            update: vi.fn(),
            release: vi.fn()
          },
          checkout: {
            sessions: {
              create: vi.fn()
            }
          },
          billingPortal: {
            sessions: {
              create: vi.fn()
            }
          }
        },
        webhookSecret: "whsec_test",
        priceMap: new Map([
          ["price_solo", { plan: "solo", type: "plan" }],
          ["price_team", { plan: "team", type: "plan" }],
          ["price_solo_capacity", { plan: "solo", type: "extra_capacity" }],
          ["price_team_capacity", { plan: "team", type: "extra_capacity" }]
        ]),
        soloPriceId: "price_solo",
        teamPriceId: "price_team",
        soloExtraCapacityPriceId: "price_solo_capacity",
        teamExtraCapacityPriceId: "price_team_capacity"
      } as never
    });

    const nextBilling = await deps.billingManagement.increaseCapacity({
      organization_id: "org_123",
      target_additional_capacity_units: 2,
      now: "2026-03-23T12:00:00.000Z"
    });

    expect(subscriptionUpdate).toHaveBeenCalledWith(
      "sub_123",
      expect.objectContaining({
        proration_behavior: "always_invoice",
        items: [
          { id: "si_plan", quantity: 1 },
          { price: "price_solo_capacity", quantity: 2 }
        ]
      })
    );
    expect(nextBilling).toEqual(
      expect.objectContaining({
        capacity_units: expect.objectContaining({
          additional_purchased: 2,
          total: 5
        })
      })
    );
  });
});
