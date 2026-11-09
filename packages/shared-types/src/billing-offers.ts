import { z } from "zod";

export const BillingOfferSelectionSchema = z
  .object({
    target_plan: z.enum(["solo", "team", "business"]),
    interval: z.enum(["month", "year"])
  })
  .strict();
export type BillingOfferSelection = z.infer<typeof BillingOfferSelectionSchema>;

/** Explicit opt-in contract; annual totals never occupy legacy monthly fields. */
export const BillingOfferQuoteSchema = BillingOfferSelectionSchema.extend({
  confirmation_token: z.string().min(1).max(8192),
  action: z.enum(["upgrade", "renewal"]),
  expires_at: z.string().datetime(),
  effective_at: z.string().datetime(),
  currency: z.literal("usd"),
  amount_due: z.number().int().nonnegative(),
  tax: z.number().int(),
  recurring_total: z.number().int().nonnegative(),
  additional_capacity_units: z.number().int().min(0).max(99),
  resume_required: z.boolean().optional()
}).strict();
export type BillingOfferQuote = z.infer<typeof BillingOfferQuoteSchema>;

export const BillingPendingOfferChangeSchema = BillingOfferSelectionSchema.extend({
  schedule_id: z.string().min(1).max(255),
  effective_at: z.string().datetime(),
  additional_capacity_units: z.number().int().min(0).max(99)
}).strict();
export const BillingOfferChangeStateSchema = z
  .object({ pending_change: BillingPendingOfferChangeSchema.nullable() })
  .strict();
export type BillingOfferChangeState = z.infer<typeof BillingOfferChangeStateSchema>;

export const BillingSubscriptionOfferSchema = z
  .object({
    plan: z.enum(["solo", "team", "business"]),
    interval: z.enum(["month", "year"]),
    currency: z.literal("usd"),
    additional_capacity_units: z.number().int().min(0).max(99),
    base_amount_minor: z.number().int().nonnegative().nullable(),
    capacity_unit_amount_minor: z.number().int().nonnegative().nullable(),
    term_starts_at: z.string().datetime().nullable(),
    term_ends_at: z.string().datetime().nullable()
  })
  .strict();
export const BillingOfferStatusSchema = BillingOfferChangeStateSchema.extend({
  subscription: BillingSubscriptionOfferSchema.nullable()
}).strict();
export type BillingSubscriptionOffer = z.infer<typeof BillingSubscriptionOfferSchema>;
export type BillingOfferStatus = z.infer<typeof BillingOfferStatusSchema>;
