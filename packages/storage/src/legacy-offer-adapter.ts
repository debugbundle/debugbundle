import { createReferralBenefitStore } from "./referral-benefit-store.js";
import {
  createReferralManagement,
  type ReferralManagement
} from "../../referrals/src/referral-management.js";
import { createReferralLinkCodec } from "../../referrals/src/referral-link.js";
import {
  REFERRAL_TERMS_VERSION,
  ReferralCodeSchema,
  ReferralError,
  type CustomerReferral
} from "../../referrals/src/referral-contracts.js";
import {
  PublicOfferPreviewSchema,
  LEGACY_REFERRAL_DISCOUNT_BASIS_POINTS,
  type PublicOfferPreview
} from "../../referrals/src/programme-policy.js";
import { createReferralStore } from "./referral-store.js";
import type { OfferActor } from "./offer-store-helpers.js";
import type { Queryable } from "./types.js";
export interface LegacyOfferAdapter {
  enabled: boolean;
  customer(
    actor: OfferActor
  ): Promise<{ attribution: CustomerReferral | null; discount_eligible: boolean }>;
  readHint(header: string | undefined): { code: string; expires_at: number } | null;
  preview(code: string): Promise<PublicOfferPreview | null>;
  issue(code: string): string;
  clear(): string;
  attribute(
    actor: OfferActor,
    code: string,
    explicit: boolean,
    source: "link" | "manual"
  ): Promise<CustomerReferral>;
}
/** Compatibility adapter for creators who accepted only the original agreement.
 * The published legacy DTOs and settlement policy remain unchanged. */
export function createLegacyOfferAdapter(input: {
  db: Queryable;
  secret: string;
  enabled: boolean;
  secure: boolean;
  readEligibility: Parameters<typeof createReferralManagement>[0]["readEligibility"];
}): LegacyOfferAdapter {
  const links = createReferralLinkCodec(input.secret, { secure: input.secure });
  const management: ReferralManagement = createReferralManagement({
    store: createReferralStore(input.db, { identityHashSecret: input.secret }),
    links,
    enrollmentEnabled: input.enabled,
    readEligibility: input.readEligibility
  });
  const preview = async (code: string): Promise<PublicOfferPreview | null> => {
    const parsed = ReferralCodeSchema.safeParse(code);
    if (!input.enabled || !parsed.success) return null;
    const partner = (
      await input.db.query<{ accepted_at: string }>(
        `SELECT p.accepted_at::text FROM referral_partners p JOIN users u ON u.id=p.user_id
   WHERE p.code=$1 AND p.status='active' AND p.terms_version=$2 AND u.email_verified_at IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM offer_creator_memberships m WHERE m.partner_id=p.id)
   AND NOT EXISTS(SELECT 1 FROM offer_codes code WHERE code.code=p.code AND code.blocked)`,
        [parsed.data, REFERRAL_TERMS_VERSION]
      )
    ).rows[0];
    if (!partner) return null;
    return PublicOfferPreviewSchema.parse({
      code: parsed.data,
      available: true,
      version: {
        legacy_terms_version: REFERRAL_TERMS_VERSION,
        name: "Legacy Business referral",
        public_description:
          "10% off an eligible new customer's first Business base invoice. Original Business-only commission terms apply.",
        policy: {
          kind: "referral",
          discount_basis_points: LEGACY_REFERRAL_DISCOUNT_BASIS_POINTS,
          eligible_plans: ["business"],
          eligible_intervals: ["month", "year"],
          commission_basis_points: 5000,
          commission_months: 12,
          claims_start_at: new Date(partner.accepted_at).toISOString(),
          claims_end_at: null,
          redeem_by: null,
          max_claims: null,
          allow_early_purchase_grants: false,
          terms_version: REFERRAL_TERMS_VERSION
        }
      }
    });
  };
  return {
    enabled: input.enabled,
    customer: async (actor) => ({
      attribution: await management.customer(actor),
      discount_eligible:
        (await createReferralBenefitStore(input.db).checkoutContext(actor))?.discount_eligible ===
        true
    }),
    readHint: (header) => links.readHint(header),
    preview,
    issue: (code) => links.issue(code),
    clear: () => links.clear(),
    attribute: async (actor, code, explicit, source) => {
      if (!(await preview(code))) throw new ReferralError("invalid_referral_code");
      return management.attribute({
        ...actor,
        code: ReferralCodeSchema.parse(code),
        source,
        explicit_correction: explicit
      });
    }
  };
}
