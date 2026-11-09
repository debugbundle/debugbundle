import { describe, expect, it } from "vitest";
import { createMinimalServer, buildStripeEvent } from "../../helpers/stripe-webhook.js";

describe("current billing periods across webhook order", () => {
  it("persists the annual paid term and original monthly allowance anchor for Business", async () => {
    const { app, stripeConfig, billingSyncStore } = createMinimalServer();
    stripeConfig.priceMap.set("price_business_year", {
      plan: "business",
      type: "plan",
      interval: "year",
      currency: "usd"
    });
    const start = Date.parse("2026-01-31T00:00:00Z") / 1000;
    const end = Date.parse("2027-01-31T00:00:00Z") / 1000;
    const subscription = {
      id: "sub_test",
      customer: "cus_test",
      status: "active",
      metadata: { organization_id: "org_test" },
      billing_cycle_anchor: start,
      items: {
        data: [
          {
            id: "base",
            price: {
              id: "price_business_year",
              currency: "usd",
              recurring: { interval: "year", interval_count: 1 }
            },
            quantity: 1,
            current_period_start: start,
            current_period_end: end
          }
        ]
      }
    };
    const event = buildStripeEvent("customer.subscription.updated", subscription);
    stripeConfig.client.webhooks.constructEvent.mockReturnValue(event as never);
    stripeConfig.client.subscriptions.retrieve.mockResolvedValue(subscription as never);
    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/stripe-webhook",
        payload: Buffer.from(JSON.stringify(event)),
        headers: { "content-type": "application/json", "stripe-signature": "test" }
      });
      expect(response.statusCode).toBe(200);
      expect(billingSyncStore.updateEntitlements).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: "business",
          billing_interval: "year",
          billing_allowance_anchor_at: "2026-01-31T00:00:00.000Z",
          billing_period_starts_at: "2026-01-31T00:00:00.000Z",
          billing_period_ends_at: "2027-01-31T00:00:00.000Z"
        })
      );
    } finally {
      await app.close();
    }
  });
  it.each(["invoice-last", "checkout-last"])(
    "preserves the real month with a zero-length initial invoice (%s)",
    async (order) => {
      const { app, stripeConfig, billingSyncStore } = createMinimalServer();
      const start = 1792601190;
      const end = 1795279590;
      const invoice = {
        customer: "cus_test",
        billing_reason: "subscription_create",
        period_start: start,
        period_end: start,
        parent: { subscription_details: { subscription: "sub_test" } }
      };
      const subscription = {
        id: "sub_test",
        customer: "cus_test",
        status: "active",
        metadata: { organization_id: "org_test" },
        items: {
          data: [
            {
              price: { id: "price_solo" },
              quantity: 1,
              current_period_start: start,
              current_period_end: end
            }
          ]
        },
        latest_invoice: invoice
      };
      stripeConfig.client.subscriptions.retrieve.mockResolvedValue(subscription as never);
      billingSyncStore.resolveOrganizationByStripeCustomerId.mockResolvedValue("org_test");
      const events = [
        buildStripeEvent("checkout.session.completed", {
          client_reference_id: "org_test",
          customer: "cus_test",
          subscription: "sub_test"
        }),
        buildStripeEvent("invoice.paid", invoice)
      ];
      if (order === "checkout-last") events.reverse();
      try {
        for (const [i, event] of events.entries()) {
          event.id = `evt_test_${i}`;
          stripeConfig.client.webhooks.constructEvent.mockReturnValue(event as never);
          expect(
            (
              await app.inject({
                method: "POST",
                url: "/v1/billing/stripe-webhook",
                payload: Buffer.from(JSON.stringify(event)),
                headers: { "content-type": "application/json", "stripe-signature": "test" }
              })
            ).statusCode
          ).toBe(200);
        }
        expect(billingSyncStore.updateEntitlements).toHaveBeenCalledTimes(2);
        for (const [snapshot] of billingSyncStore.updateEntitlements.mock.calls)
          expect(snapshot).toEqual(
            expect.objectContaining({
              plan: "solo",
              billing_period_starts_at: new Date(start * 1000).toISOString(),
              billing_period_ends_at: new Date(end * 1000).toISOString()
            })
          );
      } finally {
        await app.close();
      }
    }
  );
});
