import { createLegacyOfferAdapter } from "../../../packages/storage/src/legacy-offer-adapter.js";
import { createOfferQuoteCodec } from "../../../packages/referrals/src/offer-quote.js";
import { createOfferBenefitStore } from "../../../packages/storage/src/offer-benefit-store.js";
import { readVerifiedStripeOfferCoupon } from "../../../packages/referrals/src/stripe-offer-coupon.js";
import { prepareStripeOfferCoupon } from "../../../packages/referrals/src/stripe-offer-provisioning.js";
import { ProgrammeError } from "../../../packages/referrals/src/programme-policy.js";
import { createOfferProgrammeStore } from "../../../packages/storage/src/offer-programme-store.js";
import { createOfferOperatorStore } from "../../../packages/storage/src/offer-operator-store.js";
import { createOfferSignupStore } from "../../../packages/storage/src/offer-signup-store.js";
import {
  createOfferManagement,
  type OfferManagement
} from "../../../packages/referrals/src/offer-management.js";
import { createOfferLinkCodec } from "../../../packages/referrals/src/offer-link.js";
import { createReferralEligibilityReader, type ReferralConfig } from "./default-referrals.js";
import type { Queryable } from "../../../packages/storage/src/types.js";
import type { StripeConfig } from "./stripe-config.js";

export function createDefaultOffers(input: {
  db: Queryable;
  config: ReferralConfig;
  stripeConfig?: StripeConfig;
  enabled: boolean;
  operatorEmails: string[];
  appBaseUrl: string;
}): OfferManagement {
  return createOfferManagement({
    enabled: input.enabled,
    legacy: createLegacyOfferAdapter({
      db: input.db,
      secret: input.config.secret,
      enabled: input.config.enrollmentEnabled,
      secure: !input.config.publicApiUrl?.startsWith("http://"),
      readEligibility: createReferralEligibilityReader(input.db, input.stripeConfig)
    }),
    appBaseUrl: input.appBaseUrl,
    benefits: createOfferBenefitStore(input.db),
    quoteCodec: createOfferQuoteCodec(input.config.secret),
    async providerBinding(versionId) {
      return (
        (
          await input.db.query<{ coupon_id: string; livemode: boolean }>(
            "SELECT coupon_id,livemode FROM offer_provider_bindings WHERE version_id=$1",
            [versionId]
          )
        ).rows[0] ?? null
      );
    },
    async verifyCoupon(couponId, policy, livemode) {
      const provider = input.stripeConfig;
      if (!provider) throw new ProgrammeError("programme_unavailable");
      const target = [...provider.priceMap].find(
        ([, m]) =>
          m.type === "plan" &&
          m.plan !== "free" &&
          m.purchasable !== false &&
          policy.eligible_plans.includes(m.plan) &&
          policy.eligible_intervals.includes(m.interval ?? "month")
      );
      if (!target) throw new ProgrammeError("programme_unavailable");
      await readVerifiedStripeOfferCoupon(provider, couponId, target[0], policy, livemode);
    },
    async prepareCoupon(version) {
      if (!input.stripeConfig) throw new ProgrammeError("programme_payment_setup_failed");
      return prepareStripeOfferCoupon(input.stripeConfig, version);
    },
    publicBaseUrl: input.config.publicLandingUrl ?? "https://debugbundle.com/",
    apiBaseUrl: input.config.publicApiUrl ?? "https://api.debugbundle.com",
    store: createOfferProgrammeStore(input.db, {
      identityHashSecret: input.config.secret,
      newClaimsEnabled: input.enabled
    }),
    signup: createOfferSignupStore(input.db),
    operators: createOfferOperatorStore(input.db, input.operatorEmails),
    links: createOfferLinkCodec(input.config.secret, {
      secure: !input.config.publicApiUrl?.startsWith("http://")
    }),
    readEligibility: (actor) => {
      if (!input.stripeConfig) throw new ProgrammeError("programme_unavailable");
      return createReferralEligibilityReader(input.db, input.stripeConfig)(actor);
    }
  });
}
