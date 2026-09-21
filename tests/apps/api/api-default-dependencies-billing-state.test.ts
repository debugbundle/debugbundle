import { describe, expect, it, vi } from "vitest";
import {
  poolQueryMock,
  createPostgresBillingStoreMock,
  emailTransportSendMock
} from "../../helpers/api-default-dependency-mocks.js";
import { createApiDependencies } from "../../../apps/api/src/default-dependencies.ts";
import { createApiDependenciesFromEnv } from "../../../apps/api/src/default-dependencies-env.js";

describe("api-default-dependency-mocks billing-state", () => {
  it("should expose billing email helpers when ses settings are present", async (): Promise<void> => {
    poolQueryMock
      .mockResolvedValueOnce({
        rows: [{ organization_name: "Acme", recipient_email: "owner@example.com" }]
      })
      .mockResolvedValueOnce({ rows: [] });

    const deps = createApiDependenciesFromEnv({
      SES_REGION: "eu-west-1",
      SES_FROM_EMAIL: "noreply@debugbundle.test",
      AWS_ACCESS_KEY_ID: "aws-key",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
      APP_BASE_URL: "https://app.debugbundle.test/"
    });

    await expect(
      deps.billingEmails?.getBillingContactForOrganization({
        organization_id: "org_123"
      })
    ).resolves.toEqual({
      organizationName: "Acme",
      recipientEmail: "owner@example.com"
    });
    await expect(
      deps.billingEmails?.getBillingContactForOrganization({
        organization_id: "org_missing"
      })
    ).resolves.toBeNull();
    await deps.billingEmails?.send({
      to: ["finance@example.com"],
      subject: "Billing update",
      text: "billing-text",
      html: "<p>billing-text</p>"
    });

    expect(deps.billingEmails?.managementUrl).toBe("https://app.debugbundle.test/billing");
    expect(poolQueryMock).toHaveBeenCalledWith(expect.stringContaining("FROM organizations o"), [
      "org_123"
    ]);
    expect(emailTransportSendMock).toHaveBeenCalledWith({
      to: ["finance@example.com"],
      subject: "Billing update",
      text: "billing-text",
      html: "<p>billing-text</p>"
    });
  });

  it("should fall back to static billing links when stripe is unavailable", async (): Promise<void> => {
    vi.stubEnv("STRIPE_SOLO_CHECKOUT_URL", "https://billing.example.test/solo");
    vi.stubEnv("STRIPE_CUSTOMER_PORTAL_URL", "https://billing.example.test/portal");

    try {
      const deps = createApiDependencies({
        objectStore: {
          putObject: vi.fn(),
          getObject: vi.fn(),
          deleteObjectsByPrefix: vi.fn()
        },
        queue: {
          enqueue: vi.fn()
        },
        db: {
          query: vi.fn()
        }
      });

      await expect(
        deps.billingManagement.createCheckoutLink({
          organization_id: "org_123",
          billing_email: "owner@example.com",
          current_plan: "free",
          target_plan: "solo"
        })
      ).resolves.toEqual({ url: "https://billing.example.test/solo" });
      await expect(
        deps.billingManagement.createPortalLink({
          organization_id: "org_123",
          current_plan: "solo"
        })
      ).resolves.toEqual({ url: "https://billing.example.test/portal" });

      vi.stubEnv("STRIPE_SOLO_CHECKOUT_URL", "   ");
      vi.stubEnv("STRIPE_CUSTOMER_PORTAL_URL", "");

      const missingLinksDeps = createApiDependencies({
        objectStore: {
          putObject: vi.fn(),
          getObject: vi.fn(),
          deleteObjectsByPrefix: vi.fn()
        },
        queue: {
          enqueue: vi.fn()
        },
        db: {
          query: vi.fn()
        }
      });

      await expect(
        missingLinksDeps.billingManagement.createCheckoutLink({
          organization_id: "org_123",
          billing_email: "owner@example.com",
          current_plan: "free",
          target_plan: "solo"
        })
      ).resolves.toBeNull();
      await expect(
        missingLinksDeps.billingManagement.createPortalLink({
          organization_id: "org_123",
          current_plan: "solo"
        })
      ).resolves.toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("should use existing stripe customers and fall back to stored summaries on stripe failures", async (): Promise<void> => {
    const summary = {
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
    };
    const checkoutCreate = vi.fn().mockResolvedValue({ url: null });
    const portalCreate = vi.fn().mockRejectedValue(new Error("stripe unavailable"));
    const subscriptionRetrieve = vi.fn().mockRejectedValue(new Error("stripe unavailable"));
    const billingStore = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue(summary),
      getBillingSummaryForProject: vi.fn(),
      incrementOrgUsageCounter: vi.fn()
    };
    createPostgresBillingStoreMock.mockReturnValueOnce(billingStore);

    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ stripe_customer_id: "cus_123" }] })
        .mockResolvedValueOnce({ rows: [{ stripe_customer_id: "cus_123" }] })
        .mockResolvedValueOnce({
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
              create: checkoutCreate
            }
          },
          billingPortal: {
            sessions: {
              create: portalCreate
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
      deps.billingManagement.createCheckoutLink({
        organization_id: "org_123",
        billing_email: "owner@example.com",
        current_plan: "free",
        target_plan: "solo"
      })
    ).resolves.toBeNull();
    await expect(
      deps.billingManagement.createPortalLink({
        organization_id: "org_123",
        current_plan: "solo"
      })
    ).resolves.toBeNull();
    await expect(
      deps.billingManagement.getBillingSummaryForOrganization({
        organization_id: "org_123",
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toEqual(summary);

    expect(subscriptionRetrieve).toHaveBeenCalledWith(
      "sub_123",
      {
        expand: ["schedule", "items.data.price"]
      },
      {
        timeout: 2500,
        maxNetworkRetries: 0
      }
    );

    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_123",
        line_items: [{ price: "price_solo", quantity: 1 }]
      })
    );
    expect(portalCreate).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "http://localhost:3000/billing"
    });
  });

  it("should skip live projection when organization billing state omits stripe_subscription_id", async (): Promise<void> => {
    const summary = {
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
    };
    const subscriptionRetrieve = vi.fn();
    const billingStore = {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue(summary),
      getBillingSummaryForProject: vi.fn(),
      incrementOrgUsageCounter: vi.fn()
    };
    createPostgresBillingStoreMock.mockReturnValueOnce(billingStore);

    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            plan: "solo",
            stripe_customer_id: "cus_123"
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

    await expect(
      deps.billingManagement.getBillingSummaryForOrganization({
        organization_id: "org_123",
        now: "2026-03-23T12:00:00.000Z"
      })
    ).resolves.toEqual(summary);
    expect(subscriptionRetrieve).not.toHaveBeenCalled();
  });
});
