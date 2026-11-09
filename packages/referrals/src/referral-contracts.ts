import { z } from "zod";
import type { ReferralFinanceErrorCode } from "./referral-ledger-contracts.js";

export const REFERRAL_TERMS_VERSION = "business-referrals-2026-11";
// HTTP(S) origins may be public domains or local/self-hosted addresses.
export const ReferralHttpUrlSchema = z.url({ protocol: /^https?$/ });
export const ReferralCodeSchema = z
  .string()
  .trim()
  .max(32)
  .toUpperCase()
  .regex(/^[A-Z2-7]{10}$/);
export const ReferralPartnerSchema = z
  .object({
    partner_id: z.uuid(),
    code: ReferralCodeSchema,
    status: z.enum(["active", "paused"]),
    terms_version: z.string().min(1).max(100),
    commission_basis_points: z.literal(5000),
    accepted_at: z.string().datetime()
  })
  .strict();
export type ReferralPartner = z.infer<typeof ReferralPartnerSchema>;
export const CustomerReferralSchema = z
  .object({
    referral_id: z.uuid(),
    partner_code: ReferralCodeSchema,
    source: z.enum(["link", "manual"]),
    checkout_reserved: z.boolean()
  })
  .strict();
export type CustomerReferral = z.infer<typeof CustomerReferralSchema>;
export const ReferralClientSchema = z
  .object({
    client_id: z.uuid(),
    created_at: z.string().datetime(),
    status: z.enum([
      "awaiting_purchase",
      "commission_period_active",
      "commission_period_ended",
      "ineligible"
    ])
  })
  .strict();
export type ReferralClient = z.infer<typeof ReferralClientSchema>;
export class ReferralError extends Error {
  constructor(
    readonly code:
      | ReferralFinanceErrorCode
      | "forbidden"
      | "email_verification_required"
      | "terms_mismatch"
      | "program_unavailable"
      | "invalid_referral_code"
      | "referral_self_claim"
      | "ineligible_customer"
      | "billing_state_changed"
      | "attribution_change_requires_confirmation"
      | "attribution_frozen"
  ) {
    super(code);
    this.name = "ReferralError";
  }
}

export const ReferralPartnerResponseSchema = z
  .object({
    partner: ReferralPartnerSchema.nullable(),
    share_url: ReferralHttpUrlSchema.nullable(),
    enrollment_enabled: z.boolean(),
    terms_version: z.string().min(1).max(100)
  })
  .strict();
export type ReferralPartnerResponse = z.infer<typeof ReferralPartnerResponseSchema>;
export const ReferralJoinResponseSchema = ReferralPartnerResponseSchema.extend({
  partner: ReferralPartnerSchema,
  share_url: ReferralHttpUrlSchema
});
export const ReferralAuthSchema = z.object({ bearerToken: z.string().min(1) }).strict();
export const ReferralJoinInputSchema = ReferralAuthSchema.extend({
  termsVersion: z.string().min(1).max(100)
});
export const ReferralClientsInputSchema = ReferralAuthSchema.extend({
  limit: z.number().int().min(1).max(100).optional(),
  before: z.uuid().optional()
});
export const ReferralApplyInputSchema = ReferralAuthSchema.extend({
  code: ReferralCodeSchema,
  explicitCorrection: z.boolean().optional(),
  expectedOrganizationId: z.uuid().optional()
});
export const ReferralClientsResponseSchema = z
  .object({ clients: z.array(ReferralClientSchema).max(100) })
  .strict();
export const ReferralCustomerResponseSchema = z
  .object({
    attribution: CustomerReferralSchema.nullable(),
    pending_code: ReferralCodeSchema.nullable()
  })
  .strict();
export type ReferralCustomerResponse = z.infer<typeof ReferralCustomerResponseSchema>;
export const ReferralAttributionResponseSchema = z
  .object({ attribution: CustomerReferralSchema })
  .strict();
