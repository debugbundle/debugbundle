import { createStripeConfig } from "../../../packages/billing/src/stripe-config.js";
import type { Queryable } from "../../../packages/storage/src/types.js";
import { createReferralReceiptProcessor } from "./referral-receipt-processor.js";
import { createOfferSignupProcessor } from "./offer-signup-processor.js";
/** Compose bounded receipt settlement and signup recovery in the dedicated lane;
 * neither can hold the ingestion or unrelated worker lanes behind provider I/O. */
export function createReferralProcessingLane(input: {
  db: Queryable;
  env: Record<string, string | undefined>;
}): (() => Promise<{ processed: boolean }>) | null {
  const provider = createStripeConfig(input.env, { requireWebhookSecret: false });
  const receipts = createReferralReceiptProcessor({
    db: input.db,
    provider,
    secret: input.env["REFERRAL_SECRET"]
  });
  if (!receipts) return null;
  const signup = createOfferSignupProcessor({
    db: input.db,
    provider,
    secret: input.env["REFERRAL_SECRET"],
    enabled: input.env["REFERRAL_PROGRAMMES_ENABLED"] === "true",
    legacy_enabled: input.env["REFERRAL_ENROLLMENT_ENABLED"] === "true"
  });
  return async () => {
    let receipt = { processed: false },
      failed = false;
    try {
      receipt = await receipts();
    } catch {
      failed = true;
    }
    // A malformed receipt must not starve unrelated durable signup intents.
    const offer = await signup?.();
    if (failed) throw new Error("referral_processing_unavailable");
    return { processed: receipt.processed || offer?.processed === true };
  };
}
