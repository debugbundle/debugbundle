import { describe, expect, it, vi } from "vitest";
import {
  createPostgresBillingStoreMock,
  createPostgresBillingSyncStoreMock
} from "../../helpers/api-default-dependency-mocks.js";
import { createApiDependencies } from "../../../apps/api/src/default-dependencies.ts";

describe("api-default-dependency-mocks billing-confirmation", () => {
  it("should map checkout confirmation failure branches before syncing entitlements", async (): Promise<void> => {
    const billingSyncStore = {
      isEventProcessed: vi.fn(),
      markEventProcessed: vi.fn(),
      updateEntitlements: vi.fn(),
      resolveOrganizationByStripeCustomerId: vi.fn(),
      linkStripeCustomer: vi.fn(),
      revokeEntitlements: vi.fn(),
      updateBillingState: vi.fn()
    };
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
          starts_at: "2026-01-01T00:00:00.000Z",
          ends_at: "2026-02-01T00:00:00.000Z"
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
      getBillingSummaryForProject: vi.fn(),
      incrementOrgUsageCounter: vi.fn()
    };
    const makeDeps = (overrides: {
      retrieveSession?: ReturnType<typeof vi.fn>;
      retrieveSubscription?: ReturnType<typeof vi.fn>;
    }) => {
      createPostgresBillingSyncStoreMock.mockReturnValueOnce(billingSyncStore);
      createPostgresBillingStoreMock.mockReturnValueOnce(billingStore);

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
          query: vi.fn().mockResolvedValue({ rows: [{ stripe_customer_id: "cus_123" }] })
        },
        stripeConfig: {
          client: {
            subscriptions: {
              retrieve: overrides.retrieveSubscription ?? vi.fn(),
              update: vi.fn()
            },
            subscriptionSchedules: {
              create: vi.fn(),
              retrieve: vi.fn(),
              update: vi.fn(),
              release: vi.fn()
            },
            checkout: {
              sessions: {
                create: vi.fn(),
                retrieve: overrides.retrieveSession ?? vi.fn()
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
    };

    const sessionMissingDeps = makeDeps({
      retrieveSession: vi.fn().mockRejectedValue(new Error("missing_session"))
    });
    const wrongOrgDeps = makeDeps({
      retrieveSession: vi.fn().mockResolvedValue({
        id: "cs_wrong_org",
        status: "complete",
        client_reference_id: "org_other",
        customer: "cus_123",
        subscription: "sub_123"
      })
    });
    const incompleteDeps = makeDeps({
      retrieveSession: vi.fn().mockResolvedValue({
        id: "cs_open",
        status: "open",
        client_reference_id: "org_123",
        customer: "cus_123",
        subscription: "sub_123"
      })
    });
    const missingCustomerDeps = makeDeps({
      retrieveSession: vi.fn().mockResolvedValue({
        id: "cs_missing_customer",
        status: "complete",
        client_reference_id: "org_123",
        customer: null,
        subscription: {
          id: "sub_123",
          status: "active",
          items: { data: [] },
          latest_invoice: null
        }
      })
    });
    const subscriptionFailureDeps = makeDeps({
      retrieveSession: vi.fn().mockResolvedValue({
        id: "cs_sub_failure",
        status: "complete",
        client_reference_id: "org_123",
        customer: "cus_123",
        subscription: "sub_123"
      }),
      retrieveSubscription: vi.fn().mockRejectedValue(new Error("stripe_down"))
    });

    await expect(
      sessionMissingDeps.billingManagement.confirmCheckoutSession({
        organization_id: "org_123",
        session_id: "cs_missing",
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("checkout_session_not_found");
    await expect(
      wrongOrgDeps.billingManagement.confirmCheckoutSession({
        organization_id: "org_123",
        session_id: "cs_wrong_org",
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("checkout_session_not_found");
    await expect(
      incompleteDeps.billingManagement.confirmCheckoutSession({
        organization_id: "org_123",
        session_id: "cs_open",
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("checkout_not_complete");
    await expect(
      missingCustomerDeps.billingManagement.confirmCheckoutSession({
        organization_id: "org_123",
        session_id: "cs_missing_customer",
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("checkout_not_complete");
    await expect(
      subscriptionFailureDeps.billingManagement.confirmCheckoutSession({
        organization_id: "org_123",
        session_id: "cs_sub_failure",
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toBe("billing_service_error");

    expect(billingSyncStore.linkStripeCustomer).not.toHaveBeenCalled();
    expect(billingSyncStore.updateEntitlements).not.toHaveBeenCalled();
  });

  it("should confirm checkout sessions using invoice line periods when Stripe omits current subscription periods", async (): Promise<void> => {
    const startsAt = new Date("2026-03-23T00:00:00.000Z");
    const endsAt = new Date("2026-04-23T00:00:00.000Z");
    const subscription = {
      id: "sub_123",
      status: "active",
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
      },
      latest_invoice: {
        lines: {
          data: [
            {
              period: {
                start: Math.floor(startsAt.getTime() / 1000),
                end: Math.floor(endsAt.getTime() / 1000)
              }
            }
          ]
        }
      }
    };
    const subscriptionRetrieve = vi.fn().mockResolvedValue(subscription);
    const billingSyncStore = {
      isEventProcessed: vi.fn(),
      markEventProcessed: vi.fn(),
      updateEntitlements: vi.fn(),
      resolveOrganizationByStripeCustomerId: vi.fn(),
      linkStripeCustomer: vi.fn(),
      revokeEntitlements: vi.fn(),
      updateBillingState: vi.fn()
    };
    createPostgresBillingSyncStoreMock.mockReturnValueOnce(billingSyncStore);
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
          starts_at: "2026-01-01T00:00:00.000Z",
          ends_at: "2026-02-01T00:00:00.000Z"
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
      getBillingSummaryForProject: vi.fn(),
      incrementOrgUsageCounter: vi.fn()
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
            update: vi.fn()
          },
          subscriptionSchedules: {
            create: vi.fn(),
            retrieve: vi.fn(),
            update: vi.fn(),
            release: vi.fn()
          },
          checkout: {
            sessions: {
              create: vi.fn(),
              retrieve: vi.fn().mockResolvedValue({
                id: "cs_123",
                status: "complete",
                client_reference_id: "org_123",
                customer: "cus_123",
                subscription
              })
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

    await expect(
      deps.billingManagement.confirmCheckoutSession({
        organization_id: "org_123",
        session_id: "cs_123",
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toEqual(expect.objectContaining({ plan: "solo" }));

    expect(billingSyncStore.updateEntitlements).toHaveBeenCalledWith(
      expect.objectContaining({
        billing_period_starts_at: startsAt.toISOString(),
        billing_period_ends_at: endsAt.toISOString()
      })
    );
  });

  it("should clear invalid Stripe billing periods when checkout confirmation resolves a reversed invoice window", async (): Promise<void> => {
    const subscription = {
      id: "sub_123",
      status: "active",
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
      },
      latest_invoice: {
        lines: {
          data: [
            {
              period: {
                start: 1_772_668_800,
                end: 1_772_582_400
              }
            }
          ]
        }
      }
    };
    const subscriptionRetrieve = vi.fn().mockResolvedValue(subscription);
    const billingSyncStore = {
      isEventProcessed: vi.fn(),
      markEventProcessed: vi.fn(),
      updateEntitlements: vi.fn(),
      resolveOrganizationByStripeCustomerId: vi.fn(),
      linkStripeCustomer: vi.fn(),
      revokeEntitlements: vi.fn(),
      updateBillingState: vi.fn()
    };
    createPostgresBillingSyncStoreMock.mockReturnValueOnce(billingSyncStore);
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
          starts_at: "2026-01-01T00:00:00.000Z",
          ends_at: "2026-02-01T00:00:00.000Z"
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
      getBillingSummaryForProject: vi.fn(),
      incrementOrgUsageCounter: vi.fn()
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
            update: vi.fn()
          },
          subscriptionSchedules: {
            create: vi.fn(),
            retrieve: vi.fn(),
            update: vi.fn(),
            release: vi.fn()
          },
          checkout: {
            sessions: {
              create: vi.fn(),
              retrieve: vi.fn().mockResolvedValue({
                id: "cs_124",
                status: "complete",
                client_reference_id: "org_123",
                customer: "cus_123",
                subscription
              })
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

    await expect(
      deps.billingManagement.confirmCheckoutSession({
        organization_id: "org_123",
        session_id: "cs_124",
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toEqual(expect.objectContaining({ plan: "solo" }));

    expect(billingSyncStore.updateEntitlements).toHaveBeenCalledWith(
      expect.objectContaining({
        billing_period_starts_at: null,
        billing_period_ends_at: null
      })
    );
  });
});
