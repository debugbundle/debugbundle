import { describe, expect, it, vi } from "vitest";
import { createPostgresBillingStoreMock } from "../../helpers/api-default-dependency-mocks.js";
import { createApiDependencies } from "../../../apps/api/src/default-dependencies.ts";

describe("api-default-dependency-mocks billing-slots", () => {
  it("should map slot-management edge cases through stripe-backed dependencies", async (): Promise<void> => {
    const summary = {
      plan: "solo",
      stripe_customer_id: "cus_123",
      active_projects: 2,
      capacity_units: {
        total: 5,
        included: 3,
        additional_purchased: 2,
        pending_reduction: null
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
    };
    const buildStripeConfig = (input: {
      subscriptionRetrieve: ReturnType<typeof vi.fn>;
      subscriptionUpdate?: ReturnType<typeof vi.fn> | undefined;
      scheduleCreate?: ReturnType<typeof vi.fn> | undefined;
      scheduleUpdate?: ReturnType<typeof vi.fn> | undefined;
      scheduleRelease?: ReturnType<typeof vi.fn> | undefined;
    }) =>
      ({
        client: {
          subscriptions: {
            retrieve: input.subscriptionRetrieve,
            update: input.subscriptionUpdate ?? vi.fn()
          },
          subscriptionSchedules: {
            create: input.scheduleCreate ?? vi.fn(),
            retrieve: vi.fn(),
            update: input.scheduleUpdate ?? vi.fn(),
            release: input.scheduleRelease ?? vi.fn()
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
      }) as never;
    const buildDeps = (input: {
      dbRows: Array<Record<string, unknown>>;
      subscriptionRetrieve: ReturnType<typeof vi.fn>;
      subscriptionUpdate?: ReturnType<typeof vi.fn>;
      scheduleCreate?: ReturnType<typeof vi.fn>;
      scheduleUpdate?: ReturnType<typeof vi.fn>;
      scheduleRelease?: ReturnType<typeof vi.fn>;
      includeStripeConfig?: boolean;
    }) => {
      createPostgresBillingStoreMock.mockReturnValueOnce({
        getBillingSummaryForOrganization: vi.fn().mockResolvedValue(summary),
        getBillingSummaryForProject: vi.fn(),
        incrementOrgUsageCounter: vi.fn()
      });

      return createApiDependencies({
        objectStore: {
          putObject: vi.fn(),
          getObject: vi.fn(),
          deleteObjectsByPrefix: vi.fn()
        },
        queue: {
          enqueue: vi.fn()
        },
        db: {
          query: vi.fn().mockResolvedValue({ rows: input.dbRows })
        },
        ...(input.includeStripeConfig === false
          ? {}
          : {
              stripeConfig: buildStripeConfig({
                subscriptionRetrieve: input.subscriptionRetrieve,
                subscriptionUpdate: input.subscriptionUpdate,
                scheduleCreate: input.scheduleCreate,
                scheduleUpdate: input.scheduleUpdate,
                scheduleRelease: input.scheduleRelease
              })
            })
      });
    };
    const recurringPrice = {
      recurring: {
        interval: "month",
        interval_count: 1
      }
    };
    const subscriptionWithExtraSlots = {
      id: "sub_123",
      schedule: null,
      items: {
        data: [
          {
            id: "si_plan",
            price: {
              id: "price_solo",
              ...recurringPrice
            },
            quantity: 1
          },
          {
            id: "si_slots",
            price: {
              id: "price_solo_capacity",
              ...recurringPrice
            },
            quantity: 2
          }
        ]
      }
    };

    const noStripeDeps = buildDeps({
      dbRows: [
        {
          plan: "solo",
          stripe_customer_id: "cus_123",
          stripe_subscription_id: "sub_123"
        }
      ],
      subscriptionRetrieve: vi.fn(),
      includeStripeConfig: false
    });
    const invalidQuantityDeps = buildDeps({
      dbRows: [
        {
          plan: "solo",
          stripe_customer_id: "cus_123",
          stripe_subscription_id: "sub_123"
        }
      ],
      subscriptionRetrieve: vi.fn().mockResolvedValue(subscriptionWithExtraSlots)
    });
    const noSubscriptionDeps = buildDeps({
      dbRows: [
        {
          plan: "free",
          stripe_customer_id: null,
          stripe_subscription_id: null
        }
      ],
      subscriptionRetrieve: vi.fn()
    });
    const updateErrorDeps = buildDeps({
      dbRows: [
        {
          plan: "solo",
          stripe_customer_id: "cus_123",
          stripe_subscription_id: "sub_123"
        }
      ],
      subscriptionRetrieve: vi.fn().mockResolvedValue({
        ...subscriptionWithExtraSlots,
        items: {
          data: [
            {
              id: "si_plan",
              price: {
                id: "price_solo",
                ...recurringPrice
              },
              quantity: 1
            }
          ]
        }
      }),
      subscriptionUpdate: vi.fn().mockRejectedValue(new Error("update failed"))
    });

    await expect(
      noStripeDeps.billingManagement.increaseCapacity({
        organization_id: "org_123",
        target_additional_capacity_units: 3,
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("billing_not_configured");
    await expect(
      invalidQuantityDeps.billingManagement.increaseCapacity({
        organization_id: "org_123",
        target_additional_capacity_units: 2,
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("invalid_target_quantity");
    await expect(
      invalidQuantityDeps.billingManagement.scheduleCapacityReduction({
        organization_id: "org_123",
        target_additional_capacity_units: 2,
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("invalid_target_quantity");
    await expect(
      invalidQuantityDeps.billingManagement.cancelCapacityReduction({
        organization_id: "org_123",
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("capacity_reduction_not_found");
    await expect(
      noSubscriptionDeps.billingManagement.scheduleCapacityReduction({
        organization_id: "org_123",
        target_additional_capacity_units: 0,
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("no_active_subscription");
    await expect(
      updateErrorDeps.billingManagement.increaseCapacity({
        organization_id: "org_123",
        target_additional_capacity_units: 1,
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("billing_not_configured");
  });
});
