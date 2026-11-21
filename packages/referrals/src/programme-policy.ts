import { z } from "zod";

const timestamp = z.string().datetime();
export const PaidOfferPlanSchema = z.enum(["solo", "team", "business"]);
export const OfferIntervalSchema = z.enum(["month", "year"]);
export const ProgrammeStateSchema = z.enum(["draft", "scheduled", "active", "paused", "ended"]);
const legacyCode = /^[A-Z2-7]{10}$/;
const reserved = new Set([
  "ADMIN",
  "ADMINISTRATOR",
  "API",
  "AUTH",
  "BILLING",
  "CHECKOUT",
  "CONTACT",
  "HELP",
  "LOGIN",
  "OFFICIAL",
  "PRIVACY",
  "REFERRAL",
  "REFERRALS",
  "ROOT",
  "SECURITY",
  "SIGNUP",
  "STAFF",
  "SUPPORT",
  "SYSTEM",
  "TERMS"
]);
/** Operator promotion codes use the same globally unique registry as creators.
 * A ten-character campaign name is valid; registry ownership prevents collisions. */
export const PromotionCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/)
  .toUpperCase()
  .min(3)
  .max(24)
  .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/)
  .refine((code) => !reserved.has(code) && !code.startsWith("DEBUGBUNDLE"), "reserved_code");
/** Creator aliases retain the reserved legacy generation namespace. */
export const CreatorCodeSchema = PromotionCodeSchema.refine(
  (code) => !legacyCode.test(code),
  "reserved_code"
);
export const PublicOfferCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/)
  .toUpperCase()
  .max(24)
  .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/)
  .min(3);
/** Share of eligible collected cash after discounts/refunds. A rate above the
 * full amount would create a negative retained share, regardless of the discount. */
export const CommissionBasisPointsSchema = z.number().int().min(0).max(10000);
/** Exact decimal input for programme percentage fields, at basis-point precision. */
export const OfferPercentageInputSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}(?:\.\d{1,2})?$/)
  .transform((value) => {
    const [whole, decimal = ""] = value.split(".");
    return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  })
  .pipe(CommissionBasisPointsSchema);
export const OfferPolicySchema = z
  .object({
    kind: z.enum(["referral", "promotion"]),
    discount_basis_points: z.number().int().min(1).max(9999),
    eligible_plans: z
      .array(PaidOfferPlanSchema)
      .min(1)
      .max(3)
      .refine((v) => new Set(v).size === v.length),
    eligible_intervals: z
      .array(OfferIntervalSchema)
      .min(1)
      .max(2)
      .refine((v) => new Set(v).size === v.length),
    commission_basis_points: CommissionBasisPointsSchema,
    commission_months: z.number().int().min(1).max(12),
    claims_start_at: timestamp,
    claims_end_at: timestamp.nullable(),
    redeem_by: timestamp.nullable(),
    max_claims: z.number().int().min(1).max(1_000_000).nullable(),
    allow_early_purchase_grants: z.boolean(),
    terms_version: z.string().trim().min(1).max(100)
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === "promotion" && value.commission_basis_points !== 0)
      ctx.addIssue({
        code: "custom",
        message: "promotion_has_no_commission",
        path: ["commission_basis_points"]
      });
    if (value.claims_end_at && Date.parse(value.claims_end_at) <= Date.parse(value.claims_start_at))
      ctx.addIssue({ code: "custom", message: "invalid_claim_window", path: ["claims_end_at"] });
    if (value.redeem_by && Date.parse(value.redeem_by) < Date.parse(value.claims_start_at))
      ctx.addIssue({ code: "custom", message: "invalid_redemption_window", path: ["redeem_by"] });
  });
export type OfferPolicy = z.infer<typeof OfferPolicySchema>;
export type ProgrammeState = z.infer<typeof ProgrammeStateSchema>;
export const ProgrammeVersionSchema = z
  .object({
    programme_id: z.uuid(),
    version_id: z.uuid(),
    revision: z.number().int().positive(),
    name: z.string().trim().min(1).max(100),
    public_description: z.string().trim().min(1).max(1000),
    state: ProgrammeStateSchema,
    policy: OfferPolicySchema,
    claims_count: z.number().int().nonnegative(),
    created_at: timestamp
  })
  .strict();
export type ProgrammeVersion = z.infer<typeof ProgrammeVersionSchema>;
export const OfferDefinitionSchema = ProgrammeVersionSchema.omit({
  state: true,
  claims_count: true
});
export const publicOfferDefinition = (
  version: ProgrammeVersion
): z.infer<typeof OfferDefinitionSchema> => OfferDefinitionSchema.strip().parse(version);
export const ProgrammeDraftSchema = ProgrammeVersionSchema.pick({
  name: true,
  public_description: true,
  policy: true
})
  .extend({ promotion_code: PromotionCodeSchema.optional() })
  .refine((draft) => draft.promotion_code === undefined || draft.policy.kind === "promotion", {
    message: "promotion_code_requires_promotion",
    path: ["promotion_code"]
  });
export const CreatorProgrammeSchema = z
  .object({
    partner_id: z.uuid(),
    code: PublicOfferCodeSchema,
    legacy_code: z.string().regex(legacyCode),
    accepting_new_referrals: z.boolean(),
    version: ProgrammeVersionSchema,
    accepted_at: timestamp
  })
  .strict();
export type CreatorProgramme = z.infer<typeof CreatorProgrammeSchema>;
export const OfferClaimSchema = z
  .object({
    claim_id: z.uuid(),
    code: PublicOfferCodeSchema,
    referral_code: PublicOfferCodeSchema.nullable(),
    version: OfferDefinitionSchema,
    claimed_at: timestamp,
    redeem_by: timestamp.nullable(),
    checkout_reserved: z.boolean(),
    eligible_invoice_id: z.string().min(1).max(255).nullable(),
    status: z.enum(["saved", "reserved", "used", "expired", "revoked"])
  })
  .strict();
export type OfferClaim = z.infer<typeof OfferClaimSchema>;
/** Explicit legacy definition: no invented programme/version identifiers and no
 * silent enrolment of an existing creator into a new commercial agreement. */
export const LEGACY_REFERRAL_DISCOUNT_BASIS_POINTS = 1000;
export const LegacyOfferDefinitionSchema = z
  .object({
    legacy_terms_version: z.literal("business-referrals-2026-11"),
    name: z.literal("Legacy Business referral"),
    public_description: z.string().max(1000),
    policy: OfferPolicySchema.safeExtend({
      kind: z.literal("referral"),
      discount_basis_points: z.literal(LEGACY_REFERRAL_DISCOUNT_BASIS_POINTS),
      eligible_plans: z.tuple([z.literal("business")]),
      eligible_intervals: z.tuple([z.literal("month"), z.literal("year")]),
      commission_basis_points: z.literal(5000),
      commission_months: z.literal(12),
      claims_end_at: z.null(),
      redeem_by: z.null(),
      max_claims: z.null(),
      allow_early_purchase_grants: z.literal(false),
      terms_version: z.literal("business-referrals-2026-11")
    })
  })
  .strict();
export const PublicOfferPreviewSchema = z
  .object({
    code: PublicOfferCodeSchema,
    version: z.union([OfferDefinitionSchema, LegacyOfferDefinitionSchema]),
    available: z.boolean()
  })
  .strict();
export type PublicOfferPreview = z.infer<typeof PublicOfferPreviewSchema>;
export const ProgrammeErrorCodeSchema = z.enum([
  "programme_unavailable",
  "programme_payment_setup_failed",
  "programme_not_found",
  "programme_changed",
  "programme_not_draft",
  "programme_claim_limit",
  "programme_discount_invalid",
  "programme_terms_mismatch",
  "creator_code_unavailable",
  "creator_code_already_claimed",
  "creator_code_changed",
  "creator_membership_required",
  "invalid_offer_code",
  "offer_ineligible",
  "offer_change_requires_confirmation",
  "offer_frozen",
  "offer_expired",
  "offer_context_changed",
  "operator_authorization_required",
  "early_purchase_grant_invalid"
]);
export class ProgrammeError extends Error {
  constructor(readonly code: z.infer<typeof ProgrammeErrorCodeSchema>) {
    super(code);
    this.name = "ProgrammeError";
  }
}
export function programmeAcceptsClaims(
  raw: OfferPolicy,
  state: ProgrammeState,
  count: number,
  now: number
): boolean {
  const policy = OfferPolicySchema.parse(raw);
  return (
    Number.isFinite(now) &&
    Number.isSafeInteger(count) &&
    count >= 0 &&
    (state === "active" || state === "scheduled") &&
    now >= Date.parse(policy.claims_start_at) &&
    (policy.claims_end_at === null || now < Date.parse(policy.claims_end_at)) &&
    (policy.max_claims === null || count < policy.max_claims)
  );
}
/** A promised referral survives trial and cookie expiry. Campaign deadlines are
 * explicitly extended per claim to preserve a full available trial plus grace. */
export function offerClaimDeadline(
  raw: OfferPolicy,
  now: number,
  trialEndsAt: string | null
): string | null {
  const policy = OfferPolicySchema.parse(raw);
  if (!Number.isFinite(now)) throw new Error("invalid_offer_time");
  if (policy.redeem_by === null) return null;
  const trialEnd =
    trialEndsAt === null ? now + 30 * 86400_000 : Date.parse(timestamp.parse(trialEndsAt));
  return new Date(
    Math.max(Date.parse(policy.redeem_by), Math.max(now, trialEnd) + 7 * 86400_000)
  ).toISOString();
}
export function basisPointAmount(baseMinor: number, basisPoints: number): number {
  z.number().int().min(0).max(1_000_000_000_000).parse(baseMinor);
  z.number().int().min(0).max(10000).parse(basisPoints);
  return Number((BigInt(baseMinor) * BigInt(basisPoints) + 5000n) / 10000n);
}
/** Display projection, using the same integer half-up rule as verified finance.
 * Only the supplied base is discounted; taxes/capacity are quoted separately. */
export function previewOfferPrice(
  baseMinor: number,
  raw: OfferPolicy
): {
  base_minor: number;
  discount_minor: number;
  payable_minor: number;
  estimated_commission_minor: number;
} {
  z.number().int().min(0).max(1_000_000_000_000).parse(baseMinor);
  const policy = OfferPolicySchema.parse(raw);
  const round = (amount: bigint, bps: number): number =>
    Number((amount * BigInt(bps) + 5000n) / 10000n);
  const discount = round(BigInt(baseMinor), policy.discount_basis_points),
    payable = baseMinor - discount;
  return {
    base_minor: baseMinor,
    discount_minor: discount,
    payable_minor: payable,
    estimated_commission_minor: round(BigInt(payable), policy.commission_basis_points)
  };
}

/** Shared catalogue examples for public and signed-in programme summaries.
 * Annual service inside a shorter commission window needs actual service dates;
 * leave its amount unquoted rather than implying earnings on the full year. */
export interface ProgrammeEarningsExample {
  plan: OfferPolicy["eligible_plans"][number];
  interval: "month" | "year";
  baseMinor: number;
  payableMinor: number;
  commissionMinor: number | null;
}
export function programmeEarningsExamples(
  policy: OfferPolicy,
  basePrice: (plan: OfferPolicy["eligible_plans"][number], interval: "month" | "year") => number
): ProgrammeEarningsExample[] {
  return policy.eligible_plans.flatMap((plan) =>
    policy.eligible_intervals.map((interval) => {
      const price = previewOfferPrice(basePrice(plan, interval), policy);
      return {
        plan,
        interval,
        baseMinor: price.base_minor,
        payableMinor: price.payable_minor,
        commissionMinor:
          interval === "year" && policy.commission_months < 12
            ? null
            : price.estimated_commission_minor
      };
    })
  );
}
