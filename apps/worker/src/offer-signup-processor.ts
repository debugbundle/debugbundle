import { createLegacyOfferAdapter } from "../../../packages/storage/src/legacy-offer-adapter.js";
import { z } from "zod";
import type { Queryable } from "../../../packages/storage/src/types.js";
import type { StripeBillingProvider } from "../../../packages/billing/src/stripe-subscription.js";
import { createOfferProgrammeStore } from "../../../packages/storage/src/offer-programme-store.js";
import { createOfferSignupStore } from "../../../packages/storage/src/offer-signup-store.js";
import { createReferralEligibilityReader } from "../../../packages/storage/src/referral-customer-eligibility.js";
import { retryOfferSignupIntent } from "../../../packages/referrals/src/offer-signup.js";
import { applyPresentedOffer } from "../../../packages/referrals/src/offer-selection.js";

/** Recovery shares the financial lane but never calls a payment mutation. One
 * due verified Owner per pass; storage backoff/attempt bounds survive restarts. */
export function createOfferSignupProcessor(input: {
  db: Queryable;
  provider: StripeBillingProvider | null;
  secret: string | undefined;
  enabled: boolean;
  legacy_enabled?: boolean;
}): (() => Promise<{ processed: boolean }>) | null {
  const secret = z.string().min(32).max(4096).safeParse(input.secret);
  if ((!input.enabled && !input.legacy_enabled) || !input.provider || !secret.success) return null;
  const store = createOfferProgrammeStore(input.db, { identityHashSecret: secret.data }),
    signup = createOfferSignupStore(input.db),
    eligibility = createReferralEligibilityReader(input.db, input.provider);
  const legacy = createLegacyOfferAdapter({
    db: input.db,
    secret: secret.data,
    enabled: input.legacy_enabled === true,
    secure: true,
    readEligibility: eligibility
  });
  return async () => {
    const actor = await signup.nextDueActor({
      new_programmes_enabled: input.enabled,
      legacy_enabled: input.legacy_enabled === true
    });
    if (!actor) return { processed: false };
    await retryOfferSignupIntent(
      {
        signup,
        enabled: true,
        apply: (current, code) =>
          applyPresentedOffer(
            { store, legacy, enabled: input.enabled, readEligibility: eligibility },
            { actor: current, code, explicit: false, source: "link", allowLegacy: true }
          )
      },
      actor
    );
    return { processed: true };
  };
}
