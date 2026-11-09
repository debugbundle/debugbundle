import { z } from "zod";
import { ReferralCommissionInputSchema } from "./commission-policy.js";
import { ReferralCodeSchema, ReferralAuthSchema } from "./referral-contracts.js";
import { ReferralBenefitInvoiceSchema } from "./customer-benefit.js";

const money = z.number().int().safe().min(0).max(1_000_000_000_000);
export const ReferralCashPaymentSchema = z
  .object({
    payment_id: z.string().min(1).max(255),
    cash_minor: money,
    collected_at: z.string().datetime(),
    provider_available_at: z.string().datetime()
  })
  .strict();
export const ReferralInvoiceFactsSchema = z
  .object({
    invoice_id: z.string().min(1).max(255),
    currency: z.literal("usd"),
    lines: ReferralCommissionInputSchema.shape.lines,
    payments: z.array(ReferralCashPaymentSchema).max(100),
    refunds: ReferralCommissionInputSchema.shape.refunds,
    disputed: z.boolean(),
    reconciliation_hold: z
      .enum(["credit_allocation_unverified", "refund_allocation_unverified"])
      .optional()
  })
  .strict();
/** Internal verified-adapter input. No HTTP/MCP route accepts these facts. */
export const ReferralReceiptSnapshotSchema = z
  .object({
    organization_external_id: z.uuid(),
    owner_identity_hash: z.string().regex(/^[a-f0-9]{64}$/),
    provider_customer_id: z.string().min(1).max(255),
    observed_at: z.string().datetime(),
    invoices: z.array(ReferralInvoiceFactsSchema).max(1000),
    benefit_invoices: z.array(ReferralBenefitInvoiceSchema).max(1000).optional()
  })
  .strict();
export type ReferralReceiptSnapshot = z.infer<typeof ReferralReceiptSnapshotSchema>;
export const ReferralBalanceSchema = z
  .object({
    currency: z.literal("usd"),
    pending_minor: z.number().int().safe(),
    available_minor: z.number().int().safe(),
    claimed_minor: z.number().int().safe(),
    paid_minor: z.number().int().safe()
  })
  .strict();
export type ReferralBalance = z.infer<typeof ReferralBalanceSchema>;
export const ReferralPayoutSchema = z
  .object({
    batch_id: z.uuid(),
    partner_id: z.uuid(),
    currency: z.literal("usd"),
    amount_minor: money.positive(),
    status: z.enum(["claimed", "uncertain", "paid"]),
    external_reference: z.string().min(1).max(200).nullable(),
    claimed_at: z.string().datetime(),
    paid_at: z.string().datetime().nullable()
  })
  .strict();
export type ReferralPayout = z.infer<typeof ReferralPayoutSchema>;
export const ReferralPartnerEarningsSchema = z
  .object({ partner_id: z.uuid(), code: ReferralCodeSchema, balance: ReferralBalanceSchema })
  .strict();
export type ReferralPartnerEarnings = z.infer<typeof ReferralPartnerEarningsSchema>;
export const ReferralEarningsResponseSchema = z
  .object({ balance: ReferralBalanceSchema.nullable(), operator_access: z.boolean() })
  .strict();
export type ReferralEarningsResponse = z.infer<typeof ReferralEarningsResponseSchema>;
export const ReferralPayoutPageSchema = z
  .object({ limit: z.number().int().min(1).max(100).default(25), before: z.uuid().optional() })
  .strict();
export const ReferralOperatorPayoutPageSchema = ReferralPayoutPageSchema.extend({
  partner_id: z.uuid().optional()
});
export const ReferralPayoutClaimSchema = z
  .object({ partner_id: z.uuid(), claim_id: z.uuid() })
  .strict();
export const ReferralPayoutRecordSchema = z
  .object({
    batch_id: z.uuid(),
    external_reference: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9][A-Za-z0-9_.:/ -]*$/)
  })
  .strict();
export const REFERRAL_FINANCE_ERROR_CODES = [
  "payout_already_claimed",
  "payout_claim_conflict",
  "payout_claim_too_large",
  "no_available_commission",
  "payout_not_found",
  "payout_already_paid",
  "payout_reference_conflict"
] as const;
export type ReferralFinanceErrorCode = (typeof REFERRAL_FINANCE_ERROR_CODES)[number];
export const ReferralPayoutReadInputSchema = ReferralAuthSchema.extend({
  limit: z.number().int().min(1).max(100).default(25),
  before: z.uuid().optional()
});
export const ReferralOperatorPayoutReadInputSchema = ReferralPayoutReadInputSchema.extend({
  partnerId: z.uuid().optional()
});
export const ReferralPayoutClaimInputSchema = ReferralAuthSchema.extend({
  partnerId: z.uuid(),
  claimId: z.uuid()
});
export const ReferralPayoutBatchInputSchema = ReferralAuthSchema.extend({ batchId: z.uuid() });
export const ReferralPayoutRecordInputSchema = ReferralPayoutBatchInputSchema.extend({
  externalReference: ReferralPayoutRecordSchema.shape.external_reference,
  confirmedExternalPayment: z.literal(true)
});
