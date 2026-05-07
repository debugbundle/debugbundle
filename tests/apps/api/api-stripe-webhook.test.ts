import { describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

import { createApiServer } from "../../../apps/api/src/server.js";
import type { StripeWebhookDependencies } from "../../../apps/api/src/routes/stripe-webhook.js";
import type { StripeConfig } from "../../../apps/api/src/stripe-config.js";
import type { BillingSyncStore } from "../../../packages/storage/src/index.js";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type BillingEmailService = NonNullable<StripeWebhookDependencies["billingEmails"]>;
type BillingEmailMessage = Parameters<BillingEmailService["send"]>[0];
type StripeConfigWithMocks = StripeConfig & {
  client: {
    webhooks: MockedMethods<StripeConfig["client"]["webhooks"]>;
    subscriptions: MockedMethods<StripeConfig["client"]["subscriptions"]>;
  };
};
type BillingSyncStoreWithMocks = BillingSyncStore & MockedMethods<BillingSyncStore>;
type BillingEmailServiceWithMocks = BillingEmailService & MockedMethods<BillingEmailService>;
type BillingSummaryReaderWithMocks = MockedMethods<NonNullable<StripeWebhookDependencies["billingSummaryReader"]>>;

/**
 * Build a minimal Fastify app with only the stripe webhook route registered
 * and all other dependencies stubbed.
 */
function createMinimalServer(
  overrides: Partial<StripeWebhookDependencies> = {}
): {
  app: FastifyInstance;
  stripeConfig: StripeConfigWithMocks;
  billingSyncStore: BillingSyncStoreWithMocks;
  billingEmails: BillingEmailServiceWithMocks;
  billingSummaryReader: BillingSummaryReaderWithMocks;
  auditLogging: NonNullable<StripeWebhookDependencies["auditLogging"]>;
} {
  const stripeConfig = overrides.stripeConfig === undefined
    ? createMockStripeConfig()
    : overrides.stripeConfig as StripeConfigWithMocks;
  const billingSyncStore = overrides.billingSyncStore === undefined
    ? createMockBillingSyncStore()
    : overrides.billingSyncStore as BillingSyncStoreWithMocks;
  const billingEmails = overrides.billingEmails === undefined
    ? createMockBillingEmailService()
    : overrides.billingEmails as BillingEmailServiceWithMocks;
  const billingSummaryReader = overrides.billingSummaryReader === undefined
    ? createMockBillingSummaryReader()
    : overrides.billingSummaryReader as BillingSummaryReaderWithMocks;
  const auditLogging: NonNullable<StripeWebhookDependencies["auditLogging"]> = overrides.auditLogging === undefined
    ? { createAuditLog: vi.fn().mockResolvedValue(undefined) }
    : overrides.auditLogging;

  const app = createApiServer(
    {
      ingestionPersistence: { persistAndEnqueue: vi.fn() },
      ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
      memberAuth: { resolveMemberByTokenHash: vi.fn().mockResolvedValue(null) },
      webAuth: {
        requestEmailCode: vi.fn(),
        verifyEmailCode: vi.fn(),
        beginGithubAuth: vi.fn(),
        completeGithubAuth: vi.fn(),
        acceptInviteForSession: vi.fn(),
        revokeSessionByToken: vi.fn(),
        resolveSessionByToken: vi.fn().mockResolvedValue(null)
      },
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
      objectStoreReader: { getObject: vi.fn() },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      },
      auditLogging
    },
    {
      stripeWebhook: { stripeConfig, billingSyncStore, billingEmails, billingSummaryReader, auditLogging }
    }
  );

  return { app, stripeConfig, billingSyncStore, billingEmails, billingSummaryReader, auditLogging };
}

function createMockStripeConfig(): StripeConfigWithMocks {
  const priceMap = new Map([
    ["price_solo", { plan: "solo" as const, type: "plan" as const }],
    ["price_team", { plan: "team" as const, type: "plan" as const }],
    ["price_solo_capacity", { plan: "solo" as const, type: "extra_capacity" as const }],
    ["price_team_capacity", { plan: "team" as const, type: "extra_capacity" as const }]
  ]);

  return mockedObject<StripeConfigWithMocks>({
    client: {
      webhooks: {
        constructEvent: vi.fn()
      },
      subscriptions: {
        retrieve: vi.fn()
      },
      checkout: {
        sessions: { create: vi.fn() }
      },
      billingPortal: {
        sessions: { create: vi.fn() }
      }
    },
    webhookSecret: "whsec_test_secret",
    priceMap,
    soloPriceId: "price_solo",
    teamPriceId: "price_team",
    soloExtraCapacityPriceId: "price_solo_capacity",
    teamExtraCapacityPriceId: "price_team_capacity"
  });
}

function createMockBillingSyncStore(): BillingSyncStoreWithMocks {
  return mockedObject<BillingSyncStoreWithMocks>({
    isEventProcessed: vi.fn().mockResolvedValue(false),
    markEventProcessed: vi.fn().mockResolvedValue(undefined),
    updateEntitlements: vi.fn().mockResolvedValue(undefined),
    resolveOrganizationByStripeCustomerId: vi.fn().mockResolvedValue(null),
    linkStripeCustomer: vi.fn().mockResolvedValue(undefined),
    revokeEntitlements: vi.fn().mockResolvedValue(undefined),
    updateBillingState: vi.fn().mockResolvedValue(undefined)
  });
}

function createMockBillingEmailService(): BillingEmailServiceWithMocks {
  return mockedObject<BillingEmailServiceWithMocks>({
    managementUrl: "https://app.debugbundle.test/billing",
    getBillingContactForOrganization: vi.fn().mockResolvedValue({
      organizationName: "Acme Corp",
      recipientEmail: "owner@example.com"
    }),
    send: vi.fn().mockResolvedValue(undefined)
  });
}

function createMockBillingSummaryReader(): BillingSummaryReaderWithMocks {
  return mockedObject<NonNullable<StripeWebhookDependencies["billingSummaryReader"]>>({
    getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
      plan: "team",
      active_projects: 3,
      capacity_units: {
        total: 5,
        additional_purchased: 2
      }
    })
  });
}

function getSentBillingEmail(
  billingEmails: BillingEmailServiceWithMocks,
  index = 0
): BillingEmailMessage {
  return billingEmails.send.mock.calls[index]?.[0] as BillingEmailMessage;
}

function buildStripeEvent(type: string, data: Record<string, unknown>): { id: string; type: string; data: { object: Record<string, unknown> } } {
  return {
    id: `evt_${Date.now()}`,
    type,
    data: { object: data }
  };
}

describe("stripe webhook route", () => {
  it("should reject requests without stripe-signature header", async () => {
    const { app } = createMinimalServer();

    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/stripe-webhook",
      payload: Buffer.from("{}"),
      headers: { "content-type": "application/json" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "missing_stripe_signature" });
  });

  it("should reject requests with invalid signature", async () => {
    const { app, stripeConfig } = createMinimalServer();
    (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/stripe-webhook",
      payload: Buffer.from("{}"),
      headers: {
        "content-type": "application/json",
        "stripe-signature": "bad_signature"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_signature" });
  });

  it("should skip duplicate events (idempotency)", async () => {
    const { app, stripeConfig, billingSyncStore } = createMinimalServer();
    const event = buildStripeEvent("invoice.paid", {});
    (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);
    billingSyncStore.isEventProcessed.mockResolvedValue(true);

    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/stripe-webhook",
      payload: Buffer.from(JSON.stringify(event)),
      headers: {
        "content-type": "application/json",
        "stripe-signature": "valid_sig"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true, duplicate: true });
    expect(billingSyncStore.updateEntitlements).not.toHaveBeenCalled();
  });

  it("should acknowledge unhandled event types", async () => {
    const { app, stripeConfig, billingSyncStore, auditLogging } = createMinimalServer();
    const event = buildStripeEvent("some.unknown.event", {});
    (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);

    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/stripe-webhook",
      payload: Buffer.from(JSON.stringify(event)),
      headers: {
        "content-type": "application/json",
        "stripe-signature": "valid_sig"
      }
    });

    expect(response.statusCode).toBe(200);
          expect(auditLogging.createAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({
              organization_id: null,
              actor_user_id: null,
              actor_type: "system",
              action: "billing.webhook.process",
              target_type: "stripe_event",
              target_id: event.id,
              status: "success",
              occurred_at: expect.any(String),
              metadata: {
                duplicate: false,
                event_type: "some.unknown.event"
              }
            })
          );
    expect(response.json()).toEqual({ received: true });
    expect(billingSyncStore.markEventProcessed).toHaveBeenCalledWith(
      event.id,
      "some.unknown.event",
      null
    );
  });

  describe("checkout.session.completed", () => {
    it("should link customer, recompute entitlements, and mark event processed", async () => {
      const { app, stripeConfig, billingSyncStore, billingEmails } = createMinimalServer();
      const event = buildStripeEvent("checkout.session.completed", {
        client_reference_id: "org_abc",
        customer: "cus_123",
        subscription: "sub_456"
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);
      (stripeConfig.client.subscriptions.retrieve as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "sub_456",
        status: "active",
        customer: "cus_123",
        items: {
          data: [
            { price: { id: "price_team" }, quantity: 1 },
            { price: { id: "price_team_capacity" }, quantity: 2 }
          ]
        },
        latest_invoice: null,
        metadata: {}
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(billingSyncStore.linkStripeCustomer).toHaveBeenCalledWith("org_abc", "cus_123", "sub_456");
      expect(billingSyncStore.updateEntitlements).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_id: "org_abc",
          plan: "team",
          additional_capacity_units: 2,
          billing_state: "active",
          stripe_customer_id: "cus_123",
          stripe_subscription_id: "sub_456"
        })
      );
      expect(billingSyncStore.markEventProcessed).toHaveBeenCalledWith(
        event.id,
        "checkout.session.completed",
        "org_abc"
      );
      expect(billingEmails.send).toHaveBeenCalledTimes(1);
      const sent = getSentBillingEmail(billingEmails);
      expect(sent?.to).toEqual(["owner@example.com"]);
      expect(sent?.subject).toContain("activated");
    });

    it("should retry billing email delivery before succeeding", async () => {
      const { app, stripeConfig, billingSyncStore, billingEmails } = createMinimalServer();
      const event = buildStripeEvent("checkout.session.completed", {
        client_reference_id: "org_abc",
        customer: "cus_123",
        subscription: "sub_456"
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);
      (stripeConfig.client.subscriptions.retrieve as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "sub_456",
        status: "active",
        customer: "cus_123",
        items: {
          data: [
            { price: { id: "price_team" }, quantity: 1 },
            { price: { id: "price_team_capacity" }, quantity: 2 }
          ]
        },
        latest_invoice: null,
        metadata: {}
      });
      billingEmails.send
        .mockRejectedValueOnce(new Error("ses_timeout"))
        .mockRejectedValueOnce(new Error("ses_throttled"))
        .mockResolvedValueOnce(undefined);

      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(billingEmails.send).toHaveBeenCalledTimes(3);
      expect(billingSyncStore.markEventProcessed).toHaveBeenCalledWith(
        event.id,
        "checkout.session.completed",
        "org_abc"
      );
    });

    it("should skip when no organization_id can be resolved", async () => {
      const { app, stripeConfig, billingSyncStore } = createMinimalServer();
      const event = buildStripeEvent("checkout.session.completed", {
        client_reference_id: null,
        customer: "cus_123",
        subscription: "sub_456",
        metadata: {}
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);

      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(billingSyncStore.linkStripeCustomer).not.toHaveBeenCalled();
      expect(billingSyncStore.updateEntitlements).not.toHaveBeenCalled();
      expect(billingSyncStore.markEventProcessed).toHaveBeenCalledWith(
        event.id,
        "checkout.session.completed",
        null
      );
    });

    it("should mark the event processed when checkout is missing customer or subscription identifiers", async () => {
      const { app, stripeConfig, billingSyncStore } = createMinimalServer();
      const event = buildStripeEvent("checkout.session.completed", {
        client_reference_id: "org_abc",
        customer: null,
        subscription: null
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);

      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(billingSyncStore.linkStripeCustomer).not.toHaveBeenCalled();
      expect(billingSyncStore.markEventProcessed).toHaveBeenCalledWith(
        event.id,
        "checkout.session.completed",
        "org_abc"
      );
    });
  });

  describe("customer.subscription.updated", () => {
    it("should recompute entitlements from subscription metadata", async () => {
      const { app, stripeConfig, billingSyncStore, billingEmails, billingSummaryReader } = createMinimalServer();
      const event = buildStripeEvent("customer.subscription.updated", {
        id: "sub_456",
        status: "active",
        customer: "cus_123",
        items: {
          data: [
            { price: { id: "price_solo" }, quantity: 1 }
          ]
        },
        latest_invoice: null,
        metadata: { organization_id: "org_xyz" }
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);

      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(billingSyncStore.updateEntitlements).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_id: "org_xyz",
          plan: "solo",
          additional_capacity_units: 0,
          billing_state: "active"
        })
      );
      expect(billingSummaryReader.getBillingSummaryForOrganization).toHaveBeenCalled();
      expect(billingEmails.send).toHaveBeenCalled();
      const sent = getSentBillingEmail(billingEmails);
      expect(sent?.subject).toContain("plan changed to solo");
    });

    it("should fall back to latest invoice period fields when line periods are unavailable", async () => {
      const { app, stripeConfig, billingSyncStore } = createMinimalServer();
      const event = buildStripeEvent("customer.subscription.updated", {
        id: "sub_456",
        status: "active",
        customer: { id: "cus_123" },
        items: {
          data: [{ price: { id: "price_team" }, quantity: 1 }]
        },
        latest_invoice: {
          period_start: 1743465600,
          period_end: 1746057600,
          lines: { data: [{}] }
        },
        metadata: { organization_id: "org_abc" }
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);

      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(billingSyncStore.updateEntitlements).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_id: "org_abc",
          stripe_customer_id: "cus_123",
          billing_period_starts_at: "2025-04-01T00:00:00.000Z",
          billing_period_ends_at: "2025-05-01T00:00:00.000Z"
        })
      );
    });

    it("should clear invalid billing periods when the computed start is not before the end", async () => {
      const { app, stripeConfig, billingSyncStore } = createMinimalServer();
      const event = buildStripeEvent("customer.subscription.updated", {
        id: "sub_456",
        status: "active",
        customer: "cus_123",
        items: {
          data: [{ price: { id: "price_team" }, quantity: 1 }]
        },
        latest_invoice: {
          period_start: 1746057600,
          period_end: 1746057600,
          lines: { data: [{}] }
        },
        metadata: { organization_id: "org_abc" }
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);

      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(billingSyncStore.updateEntitlements).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_id: "org_abc",
          billing_period_starts_at: null,
          billing_period_ends_at: null
        })
      );
    });

    it("should resolve organization from customer ID fallback", async () => {
      const { app, stripeConfig, billingSyncStore } = createMinimalServer();
      const event = buildStripeEvent("customer.subscription.updated", {
        id: "sub_456",
        status: "active",
        customer: "cus_123",
        items: {
          data: [{ price: { id: "price_team" }, quantity: 1 }]
        },
        latest_invoice: null,
        metadata: {}
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);
      billingSyncStore.resolveOrganizationByStripeCustomerId.mockResolvedValue("org_resolved");

      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(billingSyncStore.resolveOrganizationByStripeCustomerId).toHaveBeenCalledWith("cus_123");
      expect(billingSyncStore.updateEntitlements).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_id: "org_resolved",
          plan: "team"
        })
      );
    });

    it("should skip when no organization can be resolved", async () => {
      const { app, stripeConfig, billingSyncStore } = createMinimalServer();
      const event = buildStripeEvent("customer.subscription.updated", {
        id: "sub_456",
        status: "active",
        customer: "cus_123",
        items: {
          data: [{ price: { id: "price_team" }, quantity: 1 }]
        },
        latest_invoice: null,
        metadata: {}
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);
      billingSyncStore.resolveOrganizationByStripeCustomerId.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(billingSyncStore.updateEntitlements).not.toHaveBeenCalled();
      expect(billingSyncStore.markEventProcessed).toHaveBeenCalledWith(
        event.id,
        "customer.subscription.updated",
        null
      );
    });
  });

  describe("customer.subscription.deleted", () => {
    it("should revoke entitlements when subscription is canceled", async () => {
      const { app, stripeConfig, billingSyncStore, billingEmails } = createMinimalServer();
      const event = buildStripeEvent("customer.subscription.deleted", {
        id: "sub_456",
        status: "canceled",
        customer: "cus_123",
        items: { data: [] },
        metadata: { organization_id: "org_abc" }
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);

      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(billingSyncStore.revokeEntitlements).toHaveBeenCalledWith("org_abc", event.id);
      expect(billingSyncStore.markEventProcessed).toHaveBeenCalledWith(
        event.id,
        "customer.subscription.deleted",
        "org_abc"
      );
      expect(billingEmails.send).toHaveBeenCalled();
      const sent = getSentBillingEmail(billingEmails);
      expect(sent?.subject).toContain("reduced");
    });

    it("should skip deletion when the organization cannot be resolved", async () => {
      const { app, stripeConfig, billingSyncStore } = createMinimalServer();
      const event = buildStripeEvent("customer.subscription.deleted", {
        id: "sub_456",
        status: "canceled",
        customer: "cus_123",
        items: { data: [] },
        metadata: {}
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);
      billingSyncStore.resolveOrganizationByStripeCustomerId.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(billingSyncStore.revokeEntitlements).not.toHaveBeenCalled();
      expect(billingSyncStore.markEventProcessed).toHaveBeenCalledWith(
        event.id,
        "customer.subscription.deleted",
        null
      );
    });
  });

  describe("invoice.paid", () => {
    it("should recompute entitlements with billing period from invoice", async () => {
      const { app, stripeConfig, billingSyncStore, billingEmails } = createMinimalServer();
      const invoicePeriodEnd = Math.floor(new Date("2026-05-01T00:00:00.000Z").getTime() / 1000);
      const event = buildStripeEvent("invoice.paid", {
        customer: "cus_123",
        parent: {
          type: "subscription_details",
          subscription_details: {
            subscription: "sub_456"
          }
        },
        period_end: invoicePeriodEnd
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);
      billingSyncStore.resolveOrganizationByStripeCustomerId.mockResolvedValue("org_abc");
      (stripeConfig.client.subscriptions.retrieve as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "sub_456",
        status: "active",
        customer: "cus_123",
        items: {
          data: [
            { price: { id: "price_team" }, quantity: 1 },
            { price: { id: "price_team_capacity" }, quantity: 1 }
          ]
        },
        latest_invoice: {
          period_start: 1743465600,
          period_end: 1743465600,
          lines: {
            data: [
              {
                period: {
                  start: 1743465600,
                  end: 1775001600
                }
              }
            ]
          }
        },
        metadata: {}
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(billingSyncStore.updateEntitlements).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_id: "org_abc",
          plan: "team",
          additional_capacity_units: 1,
          billing_state: "active",
          billing_period_starts_at: "2025-04-01T00:00:00.000Z",
          billing_period_ends_at: "2026-05-01T00:00:00.000Z"
        })
      );
      expect(billingEmails.send).toHaveBeenCalled();
      const sent = getSentBillingEmail(billingEmails);
      expect(sent?.subject).toContain("renewed");
    });

    it("should skip when customer cannot be resolved", async () => {
      const { app, stripeConfig, billingSyncStore } = createMinimalServer();
      const event = buildStripeEvent("invoice.paid", {
        customer: "cus_unknown",
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: "sub_456" }
        },
        period_end: 1714521600
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);
      billingSyncStore.resolveOrganizationByStripeCustomerId.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(billingSyncStore.updateEntitlements).not.toHaveBeenCalled();
    });

    it("should skip when the invoice does not include a customer id", async () => {
      const { app, stripeConfig, billingSyncStore } = createMinimalServer();
      const event = buildStripeEvent("invoice.paid", {
        customer: null,
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: "sub_456" }
        },
        period_end: 1714521600
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);

      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(billingSyncStore.resolveOrganizationByStripeCustomerId).not.toHaveBeenCalled();
      expect(billingSyncStore.markEventProcessed).toHaveBeenCalledWith(event.id, "invoice.paid", null);
    });
  });

  describe("invoice.payment_failed", () => {
    it("should set billing state to past_due without changing entitlements", async () => {
      const { app, stripeConfig, billingSyncStore, billingEmails } = createMinimalServer();
      const event = buildStripeEvent("invoice.payment_failed", {
        customer: "cus_123",
        attempt_count: 1,
        period_end: 1714521600
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);
      billingSyncStore.resolveOrganizationByStripeCustomerId.mockResolvedValue("org_abc");

      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(billingSyncStore.updateBillingState).toHaveBeenCalledWith("org_abc", "past_due", event.id);
      expect(billingSyncStore.updateEntitlements).not.toHaveBeenCalled();
      expect(billingSyncStore.revokeEntitlements).not.toHaveBeenCalled();
      expect(billingEmails.send).toHaveBeenCalled();
      const sent = getSentBillingEmail(billingEmails);
      expect(sent?.subject).toContain("payment failed");
    });

    it("should fall back to the local billing url when no management url is configured", async () => {
      const { app, stripeConfig, billingSyncStore, billingEmails } = createMinimalServer();
      delete billingEmails.managementUrl;
      const event = buildStripeEvent("invoice.payment_failed", {
        customer: "cus_123",
        attempt_count: 1,
        period_end: 1714521600
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);
      billingSyncStore.resolveOrganizationByStripeCustomerId.mockResolvedValue("org_abc");

      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(billingEmails.send).toHaveBeenCalledTimes(2);
      expect(getSentBillingEmail(billingEmails, 0)?.text).toContain("http://localhost:3000/billing");
      expect(getSentBillingEmail(billingEmails, 1)?.text).toContain("http://localhost:3000/billing");
    });

    it("should send reminder and downgrade warning on repeated failures", async () => {
      const { app, stripeConfig, billingSyncStore, billingEmails } = createMinimalServer();
      const nextPaymentAttempt = Math.floor(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).getTime() / 1000);
      const event = buildStripeEvent("invoice.payment_failed", {
        customer: "cus_123",
        attempt_count: 3,
        next_payment_attempt: nextPaymentAttempt,
        period_end: 1714521600
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);
      billingSyncStore.resolveOrganizationByStripeCustomerId.mockResolvedValue("org_abc");

      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(billingEmails.send).toHaveBeenCalledTimes(2);
      const firstSent = getSentBillingEmail(billingEmails, 0);
      const secondSent = getSentBillingEmail(billingEmails, 1);
      expect(firstSent?.subject).toContain("unresolved");
      expect(secondSent?.subject).toContain("downgrade pending");
    });

    it("should skip when customer cannot be resolved", async () => {
      const { app, stripeConfig, billingSyncStore } = createMinimalServer();
      const event = buildStripeEvent("invoice.payment_failed", {
        customer: "cus_unknown",
        period_end: 1714521600
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);
      billingSyncStore.resolveOrganizationByStripeCustomerId.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(billingSyncStore.updateBillingState).not.toHaveBeenCalled();
    });
  });

  describe("entitlement handling by billing state", () => {
    it("should keep paid entitlements active when subscription status is past_due", async () => {
      const { app, stripeConfig, billingSyncStore } = createMinimalServer();
      const event = buildStripeEvent("customer.subscription.updated", {
        id: "sub_456",
        status: "past_due",
        customer: "cus_123",
        items: {
          data: [{ price: { id: "price_team" }, quantity: 1 }]
        },
        latest_invoice: null,
        metadata: { organization_id: "org_abc" }
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);

      await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(billingSyncStore.updateEntitlements).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: "team",
          additional_capacity_units: 0,
          billing_state: "past_due"
        })
      );
    });

    it("should clear billing period timestamps when the billing state is no longer eligible", async () => {
      const { app, stripeConfig, billingSyncStore } = createMinimalServer();
      const event = buildStripeEvent("customer.subscription.updated", {
        id: "sub_456",
        status: "unpaid",
        customer: "cus_123",
        current_period_start: 1743465600,
        current_period_end: 1746057600,
        items: {
          data: [{ price: { id: "price_team" }, quantity: 1 }]
        },
        latest_invoice: null,
        metadata: { organization_id: "org_abc" }
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);

      await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(billingSyncStore.updateEntitlements).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: "free",
          billing_state: "unpaid",
          billing_period_starts_at: null,
          billing_period_ends_at: null
        })
      );
    });

    it("should keep the base plan but suspend extra slots when subscription status is incomplete", async () => {
      const { app, stripeConfig, billingSyncStore } = createMinimalServer();
      const event = buildStripeEvent("customer.subscription.updated", {
        id: "sub_456",
        status: "incomplete",
        customer: "cus_123",
        items: {
          data: [
            { price: { id: "price_team" }, quantity: 1 },
            { price: { id: "price_team_capacity" }, quantity: 2 }
          ]
        },
        latest_invoice: null,
        metadata: { organization_id: "org_abc" }
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);

      await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(billingSyncStore.updateEntitlements).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: "team",
          additional_capacity_units: 0,
          billing_state: "incomplete"
        })
      );
    });
  });

  describe("error handling", () => {
    it("should return 500 when event processing throws", async () => {
      const { app, stripeConfig, billingSyncStore } = createMinimalServer();
      const event = buildStripeEvent("checkout.session.completed", {
        client_reference_id: "org_abc",
        customer: "cus_123",
        subscription: "sub_456"
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);
      billingSyncStore.linkStripeCustomer.mockRejectedValue(new Error("db_connection_lost"));

      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: "processing_failed" });
    });

    it("should return 500 when billing email delivery exhausts retries", async () => {
      const { app, stripeConfig, billingSyncStore, billingEmails } = createMinimalServer();
      const event = buildStripeEvent("checkout.session.completed", {
        client_reference_id: "org_abc",
        customer: "cus_123",
        subscription: "sub_456"
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(event);
      (stripeConfig.client.subscriptions.retrieve as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "sub_456",
        status: "active",
        customer: "cus_123",
        items: {
          data: [
            { price: { id: "price_team" }, quantity: 1 },
            { price: { id: "price_team_capacity" }, quantity: 2 }
          ]
        },
        latest_invoice: null,
        metadata: {}
      });
      billingEmails.send.mockRejectedValue(new Error("ses_unavailable"));

      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "valid_sig"
        }
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: "processing_failed" });
      expect(billingEmails.send).toHaveBeenCalledTimes(3);
      expect(billingSyncStore.markEventProcessed).not.toHaveBeenCalledWith(
        event.id,
        "checkout.session.completed",
        "org_abc"
      );
    });
  });
});
