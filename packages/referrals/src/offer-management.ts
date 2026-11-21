import type { LegacyOfferAdapter } from "../../storage/src/legacy-offer-adapter.js";
import { randomUUID } from "node:crypto";
import { getBillingCatalogPrice } from "../../shared-types/src/billing-catalog.js";
import { retryOfferSignupIntent } from "./offer-signup.js";
import type { createOfferQuoteCodec } from "./offer-quote.js";
import { OfferQuoteRequestSchema } from "./offer-quote-contracts.js";
import { z } from "zod";
import type { OfferPolicy } from "./programme-policy.js";
import { ProgrammeStateChangeSchema, assertProgrammeStateChange } from "./programme-lifecycle.js";
import type { createOfferBenefitStore } from "../../storage/src/offer-benefit-store.js";
import type { OfferProgrammeStore } from "../../storage/src/offer-programme-store.js";
import type { createOfferOperatorStore } from "../../storage/src/offer-operator-store.js";
import type { createOfferSignupStore } from "../../storage/src/offer-signup-store.js";
import type { OfferActor } from "../../storage/src/offer-store-helpers.js";
import type { ApplyOfferInput } from "../../storage/src/offer-claim-store.js";
import { preferOffer, type OfferPriceSelection } from "./offer-choice.js";
import type { VerifiedOfferQuote } from "./offer-quote.js";
import type { OfferCheckoutContext } from "../../storage/src/offer-benefit-store.js";
import { readPresentedOffer, bestPublicOffer, applyPresentedOffer } from "./offer-selection.js";
import {
  ProgrammeError,
  PublicOfferCodeSchema,
  LEGACY_REFERRAL_DISCOUNT_BASIS_POINTS,
  previewOfferPrice,
  publicOfferDefinition
} from "./programme-policy.js";
import { createOfferLinkCodec } from "./offer-link.js";
import {
  createReferralVisits,
  type ReferralVisit,
  type ReferralVisits
} from "./referral-visit-receipts.js";

export interface OfferManagement {
  enabled: boolean;
  referralVisits?: ReferralVisits;
  store: OfferProgrammeStore;
  operators: ReturnType<typeof createOfferOperatorStore>;
  benefits: ReturnType<typeof createOfferBenefitStore>;
  appOrigin: string;
  publicOrigin: string;
  publicLandingUrl: string;
  quote(
    actor: OfferActor,
    selection: z.input<typeof OfferQuoteRequestSchema>
  ): Promise<import("./offer-quote-contracts.js").OfferPurchaseQuote>;
  verifyQuote: ReturnType<typeof createOfferQuoteCodec>["verify"];
  verifyProvider(versionId: string): Promise<void>;
  changeState(
    request: z.infer<typeof ProgrammeStateChangeSchema> & { actor_user_id: string }
  ): Promise<import("./programme-policy.js").ProgrammeVersion>;
  bindProvider(request: {
    actor_user_id: string;
    version_id: string;
    coupon_id: string;
    livemode: boolean;
  }): Promise<void>;
  shareLink(code: string): string;
  apiVisitLink(code: string): string;
  signupHint(header: string | undefined): { code: string; expires_at: string } | undefined;
  preview(
    code: string,
    selection?: OfferPriceSelection
  ): Promise<import("./programme-policy.js").PublicOfferPreview | null>;
  prepareCheckout(actor: OfferActor, quote: VerifiedOfferQuote): Promise<OfferCheckoutContext>;
  pending(
    header: string | undefined
  ): Promise<import("./programme-policy.js").PublicOfferPreview | null>;
  context(
    header: string | undefined,
    selection?: OfferPriceSelection
  ): Promise<import("./programme-policy.js").PublicOfferPreview | null>;
  visit(code: string, header: string | undefined): Promise<string | null>;
  mayReplacePending(previousCode: string, nextCode: string): Promise<boolean>;
  clearCookie(): string;
  clearCookies(): string[];
  legacy: LegacyOfferAdapter | undefined;
  apply(
    actor: OfferActor,
    code: string,
    explicit: boolean,
    source: ApplyOfferInput["source"]
  ): Promise<import("./programme-policy.js").OfferClaim>;
  retrySignup(actor: OfferActor): ReturnType<ReturnType<typeof createOfferSignupStore>["read"]>;
  captureSignup(actor: OfferActor, createdUser: boolean): Promise<boolean>;
}
export function createOfferManagement(input: {
  legacy?: LegacyOfferAdapter;
  store: OfferProgrammeStore;
  signup: ReturnType<typeof createOfferSignupStore>;
  operators: ReturnType<typeof createOfferOperatorStore>;
  links: ReturnType<typeof createOfferLinkCodec>;
  enabled: boolean;
  appBaseUrl: string;
  benefits: ReturnType<typeof createOfferBenefitStore>;
  quoteCodec: ReturnType<typeof createOfferQuoteCodec>;
  providerBinding(versionId: string): Promise<{ coupon_id: string; livemode: boolean } | null>;
  verifyCoupon(couponId: string, policy: OfferPolicy, livemode: boolean): Promise<void>;
  prepareCoupon?(
    version: import("./programme-policy.js").ProgrammeVersion
  ): Promise<{ coupon_id: string; livemode: boolean }>;
  publicBaseUrl: string;
  apiBaseUrl: string;
  visitTracking?: { secret: string; record(visit: ReferralVisit): Promise<boolean> };
  readEligibility(
    actor: OfferActor
  ): Promise<{ provider_customer_id_checked: string | null; provider_previously_paid: boolean }>;
}): OfferManagement {
  const publicOrigin = new URL(input.publicBaseUrl).origin;
  const hints = (header: string | undefined): { code: string; expires_at: number }[] =>
    [input.links.read(header), input.legacy?.readHint(header)]
      .filter((hint): hint is { code: string; expires_at: number } => hint != null)
      .sort((a, b) => a.expires_at - b.expires_at);
  const rawPreview = async (
    code: string
  ): Promise<import("./programme-policy.js").PublicOfferPreview | null> => {
    return readPresentedOffer({ ...input, legacy: input.legacy }, code);
  };
  const referralVisits =
    input.visitTracking &&
    createReferralVisits({
      ...input.visitTracking,
      async available(code) {
        const offer = await rawPreview(code);
        return offer?.available === true && offer.version.policy.kind === "referral";
      }
    });
  const best = async (
    origin: import("./programme-policy.js").PublicOfferPreview | null,
    selection?: OfferPriceSelection
  ): Promise<import("./programme-policy.js").PublicOfferPreview | null> => {
    return bestPublicOffer({ ...input, legacy: input.legacy }, origin, selection);
  };
  const apply = async (
    actor: OfferActor,
    code: string,
    explicit: boolean,
    source: ApplyOfferInput["source"]
  ): Promise<import("./programme-policy.js").OfferClaim> => {
    if (!input.enabled) throw new ProgrammeError("programme_unavailable");
    const result = await applyPresentedOffer(
      { ...input, legacy: input.legacy },
      { actor, code, explicit, source }
    );
    if (!("claim" in result)) throw new ProgrammeError("programme_unavailable");
    return result.claim;
  };
  const preview = async (
    code: string,
    selection?: OfferPriceSelection
  ): Promise<import("./programme-policy.js").PublicOfferPreview | null> => {
    const original = await rawPreview(code);
    if (!original) return null;
    const selected = await best(original, selection);
    // Keep the presented referral code as the attribution carrier through cookie-free signup.
    return selected ? { ...selected, code: original.code } : { ...original, available: false };
  };
  const pendingHint = async (
    header: string | undefined
  ): Promise<import("./programme-policy.js").PublicOfferPreview | null> => {
    let first: import("./programme-policy.js").PublicOfferPreview | null = null;
    for (const hint of hints(header)) {
      const offer = await rawPreview(hint.code);
      first ??= offer;
      if (offer?.available) return offer;
    }
    return first;
  };
  const retrySignup = async (
    actor: OfferActor
  ): ReturnType<ReturnType<typeof createOfferSignupStore>["read"]> => {
    if (!input.enabled) {
      const intent = await input.signup.read(actor);
      if (!intent || !(await input.legacy?.preview(intent.code))) return intent;
    }
    return retryOfferSignupIntent(
      {
        signup: input.signup,
        enabled: true,
        apply: (current, code) =>
          applyPresentedOffer(
            { ...input, legacy: input.legacy },
            { actor: current, code, explicit: false, source: "link", allowLegacy: true }
          )
      },
      actor
    );
  };
  return {
    enabled: input.enabled,
    legacy: input.legacy,
    store: input.store,
    operators: input.operators,
    benefits: input.benefits,
    appOrigin: new URL(input.appBaseUrl).origin,
    async quote(actor: OfferActor, raw: z.input<typeof OfferQuoteRequestSchema>) {
      const { include_public_offers, ...selection } = OfferQuoteRequestSchema.parse(raw);
      const context = await input.benefits.context(actor);
      const exact = { target_plan: selection.target_plan, interval: selection.interval };
      if (!context) {
        if (!input.enabled || !include_public_offers) throw new ProgrammeError("offer_ineligible");
        if (!(await input.benefits.newPurchaseAllowed(actor)))
          throw new ProgrammeError("offer_ineligible");
        const promotion = await input.store.publicPromotion({ selection: exact });
        if (!promotion?.available) throw new ProgrammeError("offer_ineligible");
        const legacy = await input.legacy?.customer(actor);
        if (!legacy?.attribution && (await input.signup.read(actor))?.status === "pending")
          throw new ProgrammeError("programme_unavailable");
        if (legacy?.discount_eligible && selection.target_plan === "business") {
          const base = getBillingCatalogPrice(
            selection.target_plan,
            selection.interval,
            "plan"
          ).amount_minor;
          if (
            previewOfferPrice(base, {
              ...promotion.version.policy,
              discount_basis_points: LEGACY_REFERRAL_DISCOUNT_BASIS_POINTS
            }).payable_minor <= previewOfferPrice(base, promotion.version.policy).payable_minor
          )
            throw new ProgrammeError("offer_ineligible");
        }
        const facts = await input.readEligibility(actor);
        if (facts.provider_previously_paid) throw new ProgrammeError("offer_ineligible");
        return input.quoteCodec.issue({
          ...actor,
          claim_id: randomUUID(),
          version_id: promotion.version.version_id,
          policy: promotion.version.policy,
          selection,
          code: promotion.code,
          new_claim: {
            attribution_id: legacy?.attribution?.referral_id ?? null,
            partner_code: legacy?.attribution?.partner_code ?? null
          }
        });
      }
      if (!context.discount_eligible) throw new ProgrammeError("offer_ineligible");
      const claim = await input.store.claims.read(actor);
      const savedVersion =
        claim?.version ?? publicOfferDefinition(await input.store.getVersion(context.version_id));
      let chosen: import("./programme-policy.js").PublicOfferPreview | null = {
        code: claim?.code ?? "SAVED",
        available: true,
        version: savedVersion
      };
      if (input.enabled && !claim?.checkout_reserved) {
        const preserveEarlyPurchase =
          (await input.benefits.earlyPurchaseAllowed(actor)) &&
          !(await input.benefits.standardPurchaseAllowed(actor));
        const referral = claim?.referral_code ? await rawPreview(claim.referral_code) : null;
        // Legacy discount redemption keeps its original billing path. Its creator
        // attribution already survives a versioned promotion without relabelling terms.
        if (
          referral &&
          "version_id" in referral.version &&
          (!preserveEarlyPurchase || referral.version.policy.allow_early_purchase_grants)
        )
          chosen = preferOffer(chosen, referral, exact);
        const promotion = await input.store.publicPromotion({
          selection: exact,
          require_early_purchase: preserveEarlyPurchase
        });
        chosen = preferOffer(
          chosen,
          promotion ? { ...promotion, version: publicOfferDefinition(promotion.version) } : null,
          exact
        );
      }
      if (!chosen || !("version_id" in chosen.version))
        throw new ProgrammeError("offer_ineligible");
      const changed = chosen.version.version_id !== context.version_id;
      return input.quoteCodec.issue({
        ...actor,
        claim_id: context.claim_id,
        version_id: chosen.version.version_id,
        selection,
        policy: chosen.version.policy,
        ...(changed ? { source_version_id: context.version_id, code: chosen.code } : {})
      });
    },
    async prepareCheckout(actor, quote) {
      let context = await input.benefits.context(actor);
      if (!context && quote.new_claim && quote.code) {
        if (!input.enabled || Date.parse(quote.expires_at) <= Date.now())
          throw new ProgrammeError("offer_context_changed");
        const selected = await rawPreview(quote.code);
        if (
          !selected?.available ||
          !("version_id" in selected.version) ||
          selected.version.version_id !== quote.version_id ||
          selected.version.policy.kind !== "promotion"
        )
          throw new ProgrammeError("offer_context_changed");
        const facts = await input.readEligibility(actor);
        await input.store.claims.apply({
          ...actor,
          ...facts,
          code: quote.code,
          source: "manual",
          explicit_correction: true,
          new_claim: { claim_id: quote.claim_id, ...quote.new_claim }
        });
        context = await input.benefits.context(actor);
      }
      if (!context || context.claim_id !== quote.claim_id)
        throw new ProgrammeError("offer_context_changed");
      if (quote.new_claim) {
        const current = await input.store.claims.read(actor);
        if (
          context.attribution_id !== quote.new_claim.attribution_id ||
          current?.referral_code !== quote.new_claim.partner_code
        )
          throw new ProgrammeError("offer_context_changed");
      }
      if (context.version_id !== quote.version_id) {
        if (
          !context.discount_eligible ||
          !input.enabled ||
          !quote.code ||
          quote.source_version_id !== context.version_id ||
          Date.parse(quote.expires_at) <= Date.now()
        )
          throw new ProgrammeError("offer_context_changed");
        const selected = await rawPreview(quote.code);
        if (
          !selected?.available ||
          !("version_id" in selected.version) ||
          selected.version.version_id !== quote.version_id
        )
          throw new ProgrammeError("offer_context_changed");
        if (
          !selected.version.policy.allow_early_purchase_grants &&
          (await input.benefits.earlyPurchaseAllowed(actor)) &&
          !(await input.benefits.standardPurchaseAllowed(actor))
        )
          throw new ProgrammeError("offer_context_changed");
        const facts = await input.readEligibility(actor);
        await input.store.claims.apply({
          ...actor,
          ...facts,
          code: quote.code,
          source: "manual",
          explicit_correction: true,
          preserve_referral: true,
          expected_version_id: context.version_id
        });
        context = await input.benefits.context(actor);
      }
      if (!context || context.version_id !== quote.version_id)
        throw new ProgrammeError("offer_context_changed");
      return context;
    },
    verifyQuote: input.quoteCodec.verify,
    async changeState(raw) {
      const request = ProgrammeStateChangeSchema.extend({ actor_user_id: z.uuid() }).parse(raw);
      const version = await input.store.getVersion(request.version_id);
      assertProgrammeStateChange(version, request);
      if (request.state === "active" || request.state === "scheduled") {
        if (!input.enabled) throw new ProgrammeError("programme_unavailable");
        let binding = await input.providerBinding(request.version_id);
        try {
          if (binding)
            await input.verifyCoupon(binding.coupon_id, version.policy, binding.livemode);
          else {
            if (version.state !== "draft" || !input.prepareCoupon)
              throw new Error("payment_setup_unavailable");
            binding = await input.prepareCoupon(version);
            await input.store.bindProvider({
              actor_user_id: request.actor_user_id,
              version_id: request.version_id,
              ...binding
            });
          }
        } catch (error) {
          if (error instanceof ProgrammeError) throw error;
          throw new ProgrammeError("programme_payment_setup_failed");
        }
      }
      // Storage repeats lifecycle validation under its lock after provider work.
      return input.store.setState(request);
    },
    async verifyProvider(versionId: string) {
      const version = await input.store.getVersion(versionId),
        binding = await input.providerBinding(versionId);
      if (!binding) throw new ProgrammeError("programme_unavailable");
      await input.verifyCoupon(binding.coupon_id, version.policy, binding.livemode);
    },
    async bindProvider(request: {
      actor_user_id: string;
      version_id: string;
      coupon_id: string;
      livemode: boolean;
    }) {
      const version = await input.store.getVersion(request.version_id);
      await input.verifyCoupon(request.coupon_id, version.policy, request.livemode);
      return input.store.bindProvider(request);
    },
    ...(referralVisits ? { referralVisits } : {}),
    publicOrigin,
    publicLandingUrl: input.publicBaseUrl,
    shareLink(code: string) {
      return new URL(`/r/${PublicOfferCodeSchema.parse(code)}`, input.publicBaseUrl).toString();
    },
    apiVisitLink(code: string) {
      return new URL(
        `/v2/offers/visit/${PublicOfferCodeSchema.parse(code)}`,
        input.apiBaseUrl
      ).toString();
    },
    signupHint(header: string | undefined): { code: string; expires_at: string } | undefined {
      const hint = input.enabled
        ? hints(header)[0]
        : input.legacy?.enabled
          ? input.legacy.readHint(header)
          : undefined;
      return hint
        ? { code: hint.code, expires_at: new Date(hint.expires_at).toISOString() }
        : undefined;
    },
    preview,
    async context(header, selection) {
      const selected = await pendingHint(header);
      if (selected) return preview(selected.code, selection);
      return best(null, selection);
    },
    async pending(header: string | undefined) {
      const selected = await pendingHint(header);
      return selected ? preview(selected.code) : null;
    },
    async mayReplacePending(previousCode, nextCode) {
      const previous = await rawPreview(previousCode),
        next = await rawPreview(nextCode);
      return (
        previous?.available === true &&
        next?.available === true &&
        previous.version.policy.kind === "promotion" &&
        next.version.policy.kind === "referral"
      );
    },
    async visit(code: string, header: string | undefined): Promise<string | null> {
      const incoming = await rawPreview(code);
      for (const previous of hints(header)) {
        const previousOffer = await rawPreview(previous.code);
        if (
          previousOffer?.available &&
          (previousOffer.code === code ||
            previousOffer.version.policy.kind === "referral" ||
            incoming?.version.policy.kind !== "referral")
        )
          return null;
      }
      const offer = await preview(code);
      if (!offer?.available) return null;
      return incoming && "legacy_terms_version" in incoming.version
        ? input.legacy!.issue(incoming.code)
        : input.links.issue(offer.code);
    },
    clearCookie: () => input.links.clear(),
    clearCookies: () => [input.links.clear(), ...(input.legacy ? [input.legacy.clear()] : [])],
    apply,
    retrySignup,
    async captureSignup(actor: OfferActor, createdUser: boolean): Promise<boolean> {
      if (!createdUser || (!input.enabled && !input.legacy?.enabled)) return false;
      const intent = await input.signup.read(actor);
      if (!intent) return false;
      // The intent is already bound in the new-account transaction. Downstream
      // provider failure leaves it pending and never fails authentication.
      await retrySignup(actor).catch(() => undefined);
      return true;
    }
  };
}
