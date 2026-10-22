import { describe, expect, it, vi } from "vitest";
import {
  createMinimalServer,
  buildStripeEvent,
  getSentBillingEmail
} from "../../helpers/stripe-webhook.js";
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
    (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        throw new Error("Invalid signature");
      }
    );

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
    (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
      event
    );
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
    (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
      event
    );

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
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
        event
      );
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
      expect(billingSyncStore.linkStripeCustomer).toHaveBeenCalledWith(
        "org_abc",
        "cus_123",
        "sub_456"
      );
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
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
        event
      );
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
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
        event
      );

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
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
        event
      );

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
      const { app, stripeConfig, billingSyncStore, billingEmails, billingSummaryReader } =
        createMinimalServer();
      const event = buildStripeEvent("customer.subscription.updated", {
        id: "sub_456",
        status: "active",
        customer: "cus_123",
        items: {
          data: [{ price: { id: "price_solo" }, quantity: 1 }]
        },
        latest_invoice: null,
        metadata: { organization_id: "org_xyz" }
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
        event
      );

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
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
        event
      );

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
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
        event
      );

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
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
        event
      );
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
      expect(billingSyncStore.resolveOrganizationByStripeCustomerId).toHaveBeenCalledWith(
        "cus_123"
      );
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
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
        event
      );
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
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
        event
      );

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
      expect(billingSyncStore.revokeEntitlements).toHaveBeenCalledWith(
        "org_abc",
        event.id,
        "sub_456"
      );
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
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
        event
      );
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
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
        event
      );

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
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
        event
      );

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
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
        event
      );

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
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
        event
      );
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
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
        event
      );
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
