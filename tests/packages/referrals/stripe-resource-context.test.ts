import { expect, it, vi } from "vitest";
import type { StripeBillingProvider } from "../../../packages/billing/src/stripe-subscription.js";
import { readStripeReferralResourceContext } from "../../../packages/referrals/src/stripe-resource-context.js";
const organization = "11111111-1111-4111-8111-111111111111";
function fixture() {
  const invoice = {
    id: "in_one",
    customer: "cus_one",
    livemode: false,
    parent: { subscription_details: { subscription: "sub_one" } }
  };
  const invoiceRead = vi.fn().mockResolvedValue(invoice),
    subRead = vi.fn().mockResolvedValue({
      id: "sub_one",
      customer: "cus_one",
      livemode: false,
      metadata: { organization_id: organization }
    }),
    chargeRead = vi.fn().mockResolvedValue({
      id: "ch_one",
      customer: "cus_one",
      livemode: false,
      payment_intent: "pi_one"
    }),
    paymentList = vi.fn().mockResolvedValue({
      has_more: false,
      data: [
        {
          id: "inpay_one",
          invoice: "in_one",
          livemode: false,
          payment: { type: "payment_intent", payment_intent: "pi_one" }
        }
      ]
    });
  const provider = {
    client: {
      invoices: { retrieve: invoiceRead },
      subscriptions: { retrieve: subRead },
      charges: { retrieve: chargeRead },
      invoicePayments: { list: paymentList },
      refunds: {
        retrieve: vi.fn().mockResolvedValue({ id: "re_one", charge: "ch_one", livemode: false })
      }
    }
  } as unknown as StripeBillingProvider;
  const event = {
    event_id: "evt_one",
    event_type: "invoice.finalized",
    resource_type: "invoice" as const,
    resource_id: "in_one",
    provider_customer_id: null,
    livemode: false,
    provider_created_at: "2026-11-01T00:00:00.000Z"
  };
  return { provider, invoiceRead, subRead, chargeRead, paymentList, event };
}
it("resolves early/deleted account context only from a verified subscription and customer", async () => {
  const f = fixture();
  expect(await readStripeReferralResourceContext(f.provider.client, f.event)).toEqual({
    provider_customer_id: "cus_one",
    organization_external_id: organization,
    subscription_related: true
  });
  f.subRead.mockResolvedValue({
    id: "sub_one",
    customer: "cus_foreign",
    livemode: false,
    metadata: { organization_id: organization }
  });
  await expect(readStripeReferralResourceContext(f.provider.client, f.event)).rejects.toThrow(
    "referral_resource_context_unverified"
  );
});
it("follows an actual refund through its charge and complete payment allocations", async () => {
  const f = fixture();
  expect(
    await readStripeReferralResourceContext(f.provider.client, {
      ...f.event,
      event_type: "refund.created",
      resource_type: "refund",
      resource_id: "re_one"
    })
  ).toMatchObject({ organization_external_id: organization, subscription_related: true });
  expect(f.paymentList).toHaveBeenCalledWith(
    { payment: { type: "payment_intent", payment_intent: "pi_one" }, limit: 100 },
    expect.objectContaining({ timeout: expect.any(Number), maxNetworkRetries: 0 })
  );
});
it("classifies a verified non-invoice payment without holding unrelated partner balances", async () => {
  const f = fixture();
  f.paymentList.mockResolvedValue({ has_more: false, data: [] });
  expect(
    await readStripeReferralResourceContext(f.provider.client, {
      ...f.event,
      event_type: "charge.succeeded",
      resource_type: "charge",
      resource_id: "ch_one"
    })
  ).toEqual({
    provider_customer_id: "cus_one",
    organization_external_id: null,
    subscription_related: false
  });
});
it("keeps unsupported charge allocations unclassified and refuses truncated history", async () => {
  const f = fixture();
  f.chargeRead.mockResolvedValue({
    id: "ch_one",
    customer: "cus_one",
    livemode: false,
    payment_intent: null
  });
  expect(
    await readStripeReferralResourceContext(f.provider.client, {
      ...f.event,
      resource_type: "charge",
      resource_id: "ch_one"
    })
  ).toMatchObject({ subscription_related: true, organization_external_id: null });
  f.chargeRead.mockResolvedValue({
    id: "ch_one",
    customer: "cus_one",
    livemode: false,
    payment_intent: "pi_one"
  });
  f.paymentList.mockResolvedValue({ has_more: true, data: [] });
  await expect(
    readStripeReferralResourceContext(f.provider.client, {
      ...f.event,
      resource_type: "charge",
      resource_id: "ch_one"
    })
  ).rejects.toThrow("referral_resource_context_unverified");
});
