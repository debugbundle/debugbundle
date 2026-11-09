import { expect, it } from "vitest";
import type Stripe from "stripe";
import { referralEventFromStripe } from "../../../packages/referrals/src/stripe-referral-events.js";
import { mockedObject } from "../../helpers/vitest.js";
function event(type: Stripe.Event.Type, object: Record<string, unknown>) {
  return mockedObject<Stripe.Event>({
    id: "evt_one",
    type,
    created: 1793491200,
    livemode: false,
    data: { object }
  });
}
it("projects only signed financial resource identity without payloads or customer emails", () => {
  const result = referralEventFromStripe(
    event("invoice.paid", {
      id: "in_one",
      customer: "cus_one",
      customer_email: "private@example.test",
      metadata: { secret: "private" },
      description: "private"
    })
  );
  expect(result).toEqual({
    event_id: "evt_one",
    event_type: "invoice.paid",
    resource_type: "invoice",
    resource_id: "in_one",
    provider_customer_id: "cus_one",
    livemode: false,
    provider_created_at: "2026-11-01T00:00:00.000Z"
  });
  expect(JSON.stringify(result)).not.toContain("private");
});
it.each([
  ["charge.dispute.created", "dispute"],
  ["charge.refund.updated", "refund"],
  ["charge.refunded", "charge"],
  ["refund.updated", "refund"],
  ["credit_note.voided", "credit_note"],
  ["invoice_payment.paid", "invoice_payment"],
  ["checkout.session.completed", "checkout_session"]
] as const)("retains the resolvable resource for %s", (type, resource) => {
  expect(referralEventFromStripe(event(type, { id: "obj_one" }))).toMatchObject({
    resource_type: resource,
    provider_customer_id: null
  });
});
it("ignores unrelated catalogue changes and refuses malformed signed financial facts", () => {
  expect(referralEventFromStripe(event("price.updated", { id: "price_one" }))).toBeNull();
  expect(() => referralEventFromStripe(event("invoice.paid", { customer: "cus_one" }))).toThrow(
    "referral_event_unverified"
  );
  expect(() =>
    referralEventFromStripe(event("invoice.paid", { id: "in_one", livemode: true }))
  ).toThrow("referral_event_unverified");
});
