import { expect, it, vi } from "vitest";
import { createMinimalServer, buildStripeEvent } from "../../helpers/stripe-webhook.js";

it("retries the financial handoff even when entitlement processing already completed", async () => {
  const captureReferralEvent = vi.fn().mockResolvedValue(undefined);
  const { app, stripeConfig, billingSyncStore } = createMinimalServer({ captureReferralEvent });
  const event = buildStripeEvent("charge.refunded", { id: "ch_one", customer: "cus_test" });
  stripeConfig.client.webhooks.constructEvent.mockReturnValue(event as never);
  billingSyncStore.isEventProcessed.mockResolvedValue(true);
  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/stripe-webhook",
      payload: Buffer.from("{}"),
      headers: { "content-type": "application/json", "stripe-signature": "test" }
    });
    expect(response.statusCode).toBe(200);
    expect(captureReferralEvent).toHaveBeenCalledWith(event);
  } finally {
    await app.close();
  }
});
it("preserves ordinary billing reconciliation when financial enqueue fails and requests safe redelivery", async () => {
  const captureReferralEvent = vi.fn().mockRejectedValue(new Error("storage_unavailable"));
  const { app, stripeConfig, billingSyncStore } = createMinimalServer({ captureReferralEvent });
  const event = buildStripeEvent("checkout.session.completed", {
    id: "cs_one",
    client_reference_id: "org_test",
    customer: "cus_test",
    subscription: "sub_test"
  });
  stripeConfig.client.subscriptions.retrieve.mockResolvedValue({
    id: "sub_test",
    customer: "cus_test",
    status: "active",
    metadata: { organization_id: "org_test" },
    items: {
      data: [
        {
          id: "si_base",
          price: { id: "price_solo" },
          quantity: 1,
          current_period_start: 1793491200,
          current_period_end: 1796083200
        }
      ]
    }
  } as never);
  stripeConfig.client.webhooks.constructEvent.mockReturnValue(event as never);
  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/stripe-webhook",
      payload: Buffer.from("{}"),
      headers: { "content-type": "application/json", "stripe-signature": "test" }
    });
    expect(billingSyncStore.linkStripeCustomer).toHaveBeenCalled();
    expect(billingSyncStore.updateEntitlements).toHaveBeenCalled();
    expect(billingSyncStore.markEventProcessed).toHaveBeenCalled();
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "financial_handoff_unavailable" });
    expect(JSON.stringify(response.json())).not.toContain("storage_unavailable");
  } finally {
    await app.close();
  }
});
it("never captures a financial handoff from an invalid webhook signature", async () => {
  const captureReferralEvent = vi.fn();
  const { app, stripeConfig } = createMinimalServer({ captureReferralEvent });
  stripeConfig.client.webhooks.constructEvent.mockImplementation(() => {
    throw new Error("invalid");
  });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/stripe-webhook",
      payload: Buffer.from("{}"),
      headers: { "content-type": "application/json", "stripe-signature": "test" }
    });
    expect(response.statusCode).toBe(400);
    expect(captureReferralEvent).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
