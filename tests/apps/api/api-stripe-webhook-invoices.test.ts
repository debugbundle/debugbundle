import { describe, expect, it, vi } from "vitest";
import {
  createMinimalServer,
  buildStripeEvent,
  getSentBillingEmail
} from "../../helpers/stripe-webhook.js";

describe("Stripe invoice webhooks", () => {
  it("does not put a subscription into dunning for a failed standalone invoice", async () => {
    const { app, stripeConfig, billingSyncStore, billingEmails } = createMinimalServer();
    const event = buildStripeEvent("invoice.payment_failed", { customer: "cus_123", parent: null });
    (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
      event
    );
    billingSyncStore.resolveOrganizationByStripeCustomerId.mockResolvedValue("org_abc");
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/stripe-webhook",
      payload: Buffer.from(JSON.stringify(event)),
      headers: { "content-type": "application/json", "stripe-signature": "valid_sig" }
    });
    expect(response.statusCode).toBe(200);
    expect(billingSyncStore.updateBillingState).not.toHaveBeenCalled();
    expect(billingSyncStore.updateEntitlements).not.toHaveBeenCalled();
    expect(billingEmails.send).not.toHaveBeenCalled();
    await app.close();
  });
  describe("invoice.paid", () => {
    it("uses the retrieved subscription period when an invoice envelope differs", async () => {
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
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
        event
      );
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
          billing_period_ends_at: "2026-04-01T00:00:00.000Z"
        })
      );
      expect(billingEmails.send).toHaveBeenCalled();
      // A renewal can also be the first event to apply a capacity reduction.
      // Its transition confirmation precedes the separate renewal receipt.
      expect(billingEmails.send.mock.calls.some(([sent]) => sent.subject.includes("renewed"))).toBe(
        true
      );
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
      expect(billingSyncStore.resolveOrganizationByStripeCustomerId).not.toHaveBeenCalled();
      expect(billingSyncStore.markEventProcessed).toHaveBeenCalledWith(
        event.id,
        "invoice.paid",
        null
      );
    });
  });

  describe("invoice.payment_failed", () => {
    it("should set billing state to past_due without changing entitlements", async () => {
      const { app, stripeConfig, billingSyncStore, billingEmails } = createMinimalServer();
      const event = buildStripeEvent("invoice.payment_failed", {
        customer: "cus_123",
        parent: { subscription_details: { subscription: "sub_456" } },
        attempt_count: 1,
        period_end: 1714521600
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
        event
      );
      billingSyncStore.resolveOrganizationByStripeCustomerId.mockResolvedValue("org_abc");
      stripeConfig.client.subscriptions.retrieve.mockResolvedValue({
        id: "sub_456",
        customer: "cus_123",
        status: "past_due",
        items: {
          data: [
            { price: { id: "price_team" }, quantity: 1 },
            { price: { id: "price_team_capacity" }, quantity: 2 }
          ]
        },
        metadata: {}
      } as never);

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
          billing_state: "past_due",
          plan: "team",
          additional_capacity_units: 2
        })
      );
      expect(billingSyncStore.updateBillingState).not.toHaveBeenCalled();
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
        parent: { subscription_details: { subscription: "sub_456" } },
        attempt_count: 1,
        period_end: 1714521600
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
        event
      );
      billingSyncStore.resolveOrganizationByStripeCustomerId.mockResolvedValue("org_abc");
      stripeConfig.client.subscriptions.retrieve.mockResolvedValue({
        id: "sub_456",
        customer: "cus_123",
        status: "past_due",
        items: {
          data: [
            { price: { id: "price_team" }, quantity: 1 },
            { price: { id: "price_team_capacity" }, quantity: 2 }
          ]
        },
        metadata: {}
      } as never);

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
      expect(getSentBillingEmail(billingEmails, 0)?.text).toContain(
        "http://localhost:3000/billing"
      );
      expect(getSentBillingEmail(billingEmails, 1)?.text).toContain(
        "http://localhost:3000/billing"
      );
    });

    it("should send reminder and downgrade warning on repeated failures", async () => {
      const { app, stripeConfig, billingSyncStore, billingEmails } = createMinimalServer();
      const nextPaymentAttempt = Math.floor(
        new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).getTime() / 1000
      );
      const event = buildStripeEvent("invoice.payment_failed", {
        customer: "cus_123",
        parent: { subscription_details: { subscription: "sub_456" } },
        attempt_count: 3,
        next_payment_attempt: nextPaymentAttempt,
        period_end: 1714521600
      });
      (stripeConfig.client.webhooks.constructEvent as ReturnType<typeof vi.fn>).mockReturnValue(
        event
      );
      billingSyncStore.resolveOrganizationByStripeCustomerId.mockResolvedValue("org_abc");
      stripeConfig.client.subscriptions.retrieve.mockResolvedValue({
        id: "sub_456",
        customer: "cus_123",
        status: "past_due",
        items: {
          data: [
            { price: { id: "price_team" }, quantity: 1 },
            { price: { id: "price_team_capacity" }, quantity: 2 }
          ]
        },
        metadata: {}
      } as never);

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
      expect(billingSyncStore.updateBillingState).not.toHaveBeenCalled();
    });
  });
});
