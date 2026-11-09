import { expect, it, vi } from "vitest";
import { createReferralReceiptProcessor } from "../../../apps/worker/src/referral-receipt-processor.js";
import type { StripeBillingProvider } from "../../../packages/billing/src/stripe-subscription.js";
it("keeps retained financial reconciliation available without the optional enrolment signing secret", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] }),
    provider = {} as StripeBillingProvider;
  const processor = createReferralReceiptProcessor({ db: { query }, provider, secret: undefined });
  expect(processor).not.toBeNull();
  expect(await processor!()).toEqual({ processed: false });
  expect(query).toHaveBeenCalled();
});
it("still requires a provider before dispatching financial work", () => {
  expect(
    createReferralReceiptProcessor({ db: { query: vi.fn() }, provider: null, secret: undefined })
  ).toBeNull();
});
