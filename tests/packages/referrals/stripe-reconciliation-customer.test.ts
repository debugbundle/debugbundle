import { expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { readStripeReconciliationCustomer } from "../../../packages/referrals/src/stripe-reconciliation-customer.js";
import { mockedObject } from "../../helpers/vitest.js";
const event = {
  event_id: "evt_one",
  event_type: "charge.dispute.created",
  resource_type: "dispute" as const,
  resource_id: "dp_one",
  provider_customer_id: null,
  livemode: false,
  provider_created_at: "2026-11-01T00:00:00.000Z"
};
it("resolves a dispute through its verified charge without trusting external customer hints", async () => {
  const dispute = vi.fn().mockResolvedValue({ id: "dp_one", charge: "ch_one", livemode: false });
  const charge = vi.fn().mockResolvedValue({ id: "ch_one", customer: "cus_one", livemode: false });
  const client = mockedObject<Stripe>({
    disputes: mockedObject<Stripe["disputes"]>({ retrieve: dispute }),
    charges: mockedObject<Stripe["charges"]>({ retrieve: charge })
  });
  expect(await readStripeReconciliationCustomer(client, event)).toBe("cus_one");
  charge.mockResolvedValue({ id: "ch_one", customer: "cus_one", livemode: true });
  await expect(readStripeReconciliationCustomer(client, event)).rejects.toThrow(
    "referral_resource_unverified"
  );
});
it("checks known customer resources too, and rejects a mismatched or truncated identity", async () => {
  const read = vi.fn().mockResolvedValue({ id: "in_one", customer: "cus_other", livemode: false });
  const client = mockedObject<Stripe>({
    invoices: mockedObject<Stripe["invoices"]>({ retrieve: read })
  });
  const invoice = {
    ...event,
    resource_type: "invoice" as const,
    resource_id: "in_one",
    provider_customer_id: "cus_one"
  };
  await expect(readStripeReconciliationCustomer(client, invoice)).rejects.toThrow(
    "referral_resource_unverified"
  );
  read.mockResolvedValue({ id: "in_other", customer: "cus_one", livemode: false });
  await expect(readStripeReconciliationCustomer(client, invoice)).rejects.toThrow(
    "referral_resource_unverified"
  );
});
