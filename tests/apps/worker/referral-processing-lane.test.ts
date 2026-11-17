import { beforeEach, expect, it, vi } from "vitest";
import { createReferralProcessingLane } from "../../../apps/worker/src/referral-processing-lane.js";
import { createStripeConfig } from "../../../packages/billing/src/stripe-config.js";
import { createReferralReceiptProcessor } from "../../../apps/worker/src/referral-receipt-processor.js";
import { createOfferSignupProcessor } from "../../../apps/worker/src/offer-signup-processor.js";
import type { Queryable } from "../../../packages/storage/src/types.js";
vi.mock("../../../packages/billing/src/stripe-config.js", () => ({ createStripeConfig: vi.fn() }));
vi.mock("../../../apps/worker/src/referral-receipt-processor.js", () => ({
  createReferralReceiptProcessor: vi.fn()
}));
vi.mock("../../../apps/worker/src/offer-signup-processor.js", () => ({
  createOfferSignupProcessor: vi.fn()
}));
beforeEach(() => vi.resetAllMocks());
it("keeps the lane disabled without a configured receipt provider", () => {
  const db = { query: vi.fn() } as Queryable;
  vi.mocked(createStripeConfig).mockReturnValue(null);
  vi.mocked(createReferralReceiptProcessor).mockReturnValue(null);
  expect(createReferralProcessingLane({ db, env: {} })).toBeNull();
});
it("runs durable signup recovery after a failed receipt and preserves the failure signal", async () => {
  const receipts = vi.fn().mockRejectedValue(new Error("private-provider-message")),
    signup = vi.fn().mockResolvedValue({ processed: true });
  vi.mocked(createReferralReceiptProcessor).mockReturnValue(receipts);
  vi.mocked(createOfferSignupProcessor).mockReturnValue(signup);
  const lane = createReferralProcessingLane({
    db: { query: vi.fn() } as Queryable,
    env: { REFERRAL_PROGRAMMES_ENABLED: "false", REFERRAL_ENROLLMENT_ENABLED: "true" }
  })!;
  await expect(lane()).rejects.toThrow("referral_processing_unavailable");
  expect(signup).toHaveBeenCalledOnce();
  expect(vi.mocked(createOfferSignupProcessor).mock.calls[0]![0]).toMatchObject({
    enabled: false,
    legacy_enabled: true
  });
});
it("reports work from either bounded processor and supports a receipt-only configuration", async () => {
  const receipts = vi.fn().mockResolvedValue({ processed: false }),
    signup = vi.fn().mockResolvedValue({ processed: true });
  vi.mocked(createReferralReceiptProcessor).mockReturnValue(receipts);
  vi.mocked(createOfferSignupProcessor).mockReturnValue(signup);
  const input = {
    db: { query: vi.fn() } as Queryable,
    env: { REFERRAL_PROGRAMMES_ENABLED: "true" }
  };
  expect(await createReferralProcessingLane(input)!()).toEqual({ processed: true });
  vi.mocked(createOfferSignupProcessor).mockReturnValue(null);
  receipts.mockResolvedValue({ processed: true });
  expect(await createReferralProcessingLane(input)!()).toEqual({ processed: true });
});
