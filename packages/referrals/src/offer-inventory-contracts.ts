import { z } from "zod";
import { PublicOfferCodeSchema } from "./programme-policy.js";
const page = { limit: z.number().int().min(1).max(100).default(25), before: z.uuid().optional() };
export const OfferCodeInventoryQuerySchema = z
  .object({
    ...page,
    code: PublicOfferCodeSchema.optional(),
    partner_id: z.uuid().optional(),
    version_id: z.uuid().optional()
  })
  .strict();
export const OfferClaimInventoryQuerySchema = z
  .object({
    ...page,
    code: PublicOfferCodeSchema.optional(),
    organization_id: z.uuid().optional(),
    version_id: z.uuid().optional()
  })
  .strict();
export const OfferGrantInventoryQuerySchema = z
  .object({ ...page, claim_id: z.uuid().optional() })
  .strict();
export const OfferCodeInventoryRecordSchema = z
  .object({
    code_id: z.uuid(),
    code: PublicOfferCodeSchema,
    kind: z.enum(["legacy", "creator", "promotion"]),
    partner_id: z.uuid().nullable(),
    version_id: z.uuid().nullable(),
    blocked: z.boolean(),
    preferred: z.boolean(),
    created_at: z.string().datetime()
  })
  .strict();
export const OfferClaimInventoryRecordSchema = z
  .object({
    claim_id: z.uuid(),
    code: PublicOfferCodeSchema,
    referral_code: PublicOfferCodeSchema.nullable(),
    organization_id: z.uuid(),
    version_id: z.uuid(),
    legacy_referral: z.boolean(),
    status: z.enum(["saved", "reserved", "used", "expired", "revoked"]),
    claimed_at: z.string().datetime(),
    redeem_by: z.string().datetime().nullable()
  })
  .strict();
export const OfferGrantInventoryRecordSchema = z
  .object({
    grant_id: z.uuid(),
    claim_id: z.uuid(),
    code: PublicOfferCodeSchema,
    organization_id: z.uuid(),
    operator_user_id: z.uuid(),
    reason: z.string().min(1).max(300),
    created_at: z.string().datetime(),
    expires_at: z.string().datetime(),
    revoked_at: z.string().datetime().nullable(),
    admitted_checkout: z.boolean()
  })
  .strict();
