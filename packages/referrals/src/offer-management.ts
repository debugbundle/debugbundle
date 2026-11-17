import type { LegacyOfferAdapter } from "../../storage/src/legacy-offer-adapter.js";
import { retryOfferSignupIntent } from "./offer-signup.js";
import type { createOfferQuoteCodec, OfferQuoteSelectionSchema } from "./offer-quote.js";
import { z } from "zod";
import type { OfferPolicy } from "./programme-policy.js";
import { ProgrammeStateChangeSchema, assertProgrammeStateChange } from "./programme-lifecycle.js";
import type { createOfferBenefitStore } from "../../storage/src/offer-benefit-store.js";
import type { OfferProgrammeStore } from "../../storage/src/offer-programme-store.js";
import type { createOfferOperatorStore } from "../../storage/src/offer-operator-store.js";
import type { createOfferSignupStore } from "../../storage/src/offer-signup-store.js";
import type { OfferActor } from "../../storage/src/offer-store-helpers.js";
import type { ApplyOfferInput } from "../../storage/src/offer-claim-store.js";
import {
  ProgrammeError,
  PublicOfferCodeSchema,
  publicOfferDefinition
} from "./programme-policy.js";
import { createOfferLinkCodec } from "./offer-link.js";

export interface OfferManagement {
  enabled: boolean;
  store: OfferProgrammeStore;
  operators: ReturnType<typeof createOfferOperatorStore>;
  benefits: ReturnType<typeof createOfferBenefitStore>;
  appOrigin: string;
  publicOrigin: string;
  publicLandingUrl: string;
  quote(
    actor: OfferActor,
    selection: z.input<typeof OfferQuoteSelectionSchema>
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
  preview(code: string): Promise<import("./programme-policy.js").PublicOfferPreview | null>;
  pending(
    header: string | undefined
  ): Promise<import("./programme-policy.js").PublicOfferPreview | null>;
  visit(code: string, header: string | undefined): Promise<string | null>;
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
  readEligibility(
    actor: OfferActor
  ): Promise<{ provider_customer_id_checked: string | null; provider_previously_paid: boolean }>;
}): OfferManagement {
  const publicOrigin = new URL(input.publicBaseUrl).origin;
  const hints = (header: string | undefined): { code: string; expires_at: number }[] =>
    [input.links.read(header), input.legacy?.readHint(header)]
      .filter((hint): hint is { code: string; expires_at: number } => hint != null)
      .sort((a, b) => a.expires_at - b.expires_at);
  const apply = async (
    actor: OfferActor,
    code: string,
    explicit: boolean,
    source: ApplyOfferInput["source"]
  ): Promise<import("./programme-policy.js").OfferClaim> => {
    if (!input.enabled) throw new ProgrammeError("programme_unavailable");
    const facts = await input.readEligibility(actor);
    return input.store.claims.apply({
      ...actor,
      ...facts,
      code,
      explicit_correction: explicit,
      source
    });
  };
  const preview = async (
    code: string
  ): Promise<import("./programme-policy.js").PublicOfferPreview | null> => {
    const normalized = PublicOfferCodeSchema.parse(code),
      current = input.enabled ? await input.store.preview(normalized) : null;
    return current
      ? { ...current, version: publicOfferDefinition(current.version) }
      : ((await input.legacy?.preview(normalized)) ?? null);
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
        apply: async (current, code) => {
          const offer = await preview(code);
          if (offer && "legacy_terms_version" in offer.version && input.legacy)
            return input.legacy.attribute(current, code, false, "link");
          return apply(current, code, false, "link");
        }
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
    async quote(actor: OfferActor, selection: z.input<typeof OfferQuoteSelectionSchema>) {
      const context = await input.benefits.context(actor);
      if (!context?.discount_eligible) throw new ProgrammeError("offer_ineligible");
      return input.quoteCodec.issue({
        ...actor,
        claim_id: context.claim_id,
        version_id: context.version_id,
        selection,
        policy: context.policy
      });
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
    async pending(header: string | undefined) {
      let first: import("./programme-policy.js").PublicOfferPreview | null = null;
      for (const hint of hints(header)) {
        const offer = await preview(hint.code);
        first ??= offer;
        if (offer?.available) return offer;
      }
      return first;
    },
    async visit(code: string, header: string | undefined): Promise<string | null> {
      for (const previous of hints(header))
        if ((await preview(previous.code))?.available) return null;
      const offer = await preview(code);
      if (!offer?.available) return null;
      return "legacy_terms_version" in offer.version
        ? input.legacy!.issue(offer.code)
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
