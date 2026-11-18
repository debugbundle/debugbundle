import type { LegacyOfferAdapter } from "../../storage/src/legacy-offer-adapter.js";
import type { OfferProgrammeStore } from "../../storage/src/offer-programme-store.js";
import type { ApplyOfferInput } from "../../storage/src/offer-claim-store.js";
import type { OfferActor } from "../../storage/src/offer-store-helpers.js";
import type { CustomerReferral } from "./referral-contracts.js";
import { preferOffer, type OfferPriceSelection } from "./offer-choice.js";
import {
  ProgrammeError,
  PublicOfferCodeSchema,
  publicOfferDefinition,
  type OfferClaim,
  type PublicOfferPreview
} from "./programme-policy.js";

interface OfferSelectionDependencies {
  store: OfferProgrammeStore;
  legacy: LegacyOfferAdapter | undefined;
  enabled: boolean;
}
export async function readPresentedOffer(
  input: OfferSelectionDependencies,
  code: string
): Promise<PublicOfferPreview | null> {
  const normalized = PublicOfferCodeSchema.parse(code);
  const current = input.enabled ? await input.store.preview(normalized) : null;
  return current
    ? { ...current, version: publicOfferDefinition(current.version) }
    : ((await input.legacy?.preview(normalized)) ?? null);
}
export async function bestPublicOffer(
  input: OfferSelectionDependencies,
  origin: PublicOfferPreview | null,
  selection?: OfferPriceSelection
): Promise<PublicOfferPreview | null> {
  if (!input.enabled || (origin && !origin.available)) return origin;
  const promotion = await input.store.publicPromotion(
    selection ? { selection } : origin ? { scope: origin.version.policy } : {}
  );
  const candidate = promotion?.available
    ? { ...promotion, version: publicOfferDefinition(promotion.version) }
    : null;
  return preferOffer(origin, candidate, selection);
}
/** Browser and durable worker recovery apply the same comparison. Only an
 * explicitly presented code or retained signup intent can enter this write path. */
export async function applyPresentedOffer(
  input: OfferSelectionDependencies & {
    readEligibility(
      actor: OfferActor
    ): Promise<Pick<ApplyOfferInput, "provider_customer_id_checked" | "provider_previously_paid">>;
  },
  request: {
    actor: OfferActor;
    code: string;
    explicit: boolean;
    source: ApplyOfferInput["source"];
    allowLegacy?: boolean;
  }
): Promise<{ claim: OfferClaim } | { legacy_attribution: CustomerReferral }> {
  const code = PublicOfferCodeSchema.parse(request.code);
  const original = await readPresentedOffer(input, code);
  if (!original?.available) {
    const saved = await input.store.claims.read(request.actor);
    if (
      saved &&
      (saved.code === code || saved.referral_code === code) &&
      saved.status !== "revoked"
    )
      return { claim: saved };
    throw new ProgrammeError("invalid_offer_code");
  }
  const chosen = (await bestPublicOffer(input, original)) ?? original;
  if ("legacy_terms_version" in chosen.version && request.allowLegacy && input.legacy)
    return {
      legacy_attribution: await input.legacy.attribute(
        request.actor,
        original.code,
        request.explicit,
        request.source
      )
    };
  if (!input.enabled || "legacy_terms_version" in chosen.version)
    throw new ProgrammeError("programme_unavailable");
  const facts = await input.readEligibility(request.actor);
  const referral =
    original.version.policy.kind === "referral" && chosen.code !== original.code
      ? original.code
      : undefined;
  return {
    claim: await input.store.claims.apply({
      ...request.actor,
      ...facts,
      code: chosen.code,
      ...(referral ? { referral_code: referral } : {}),
      explicit_correction: request.explicit,
      source: request.source
    })
  };
}
