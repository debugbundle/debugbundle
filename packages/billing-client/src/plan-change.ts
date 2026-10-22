import { z } from "zod";

export const BillingPlanChangeQuoteSchema = z
  .object({
    confirmation_token: z.string().min(1).max(8192),
    resume_required: z.boolean().optional(),
    expires_at: z.string().datetime(),
    effective_at: z.string().datetime(),
    target_plan: z.literal("solo"),
    currency: z.string().regex(/^[a-z]{3}$/),
    amount_due: z.literal(0),
    tax: z.number().int(),
    monthly_total: z.number().int().nonnegative(),
    additional_capacity_units: z.number().int().min(0).max(99)
  })
  .strict();
export const BillingPendingPlanChangeSchema = BillingPlanChangeQuoteSchema.omit({
  confirmation_token: true,
  resume_required: true,
  expires_at: true,
  amount_due: true,
  tax: true,
  monthly_total: true,
  currency: true
})
  .extend({ schedule_id: z.string().min(1) })
  .strict();
export const BillingPlanChangeStateSchema = z
  .object({ pending_change: BillingPendingPlanChangeSchema.nullable() })
  .strict();
export const BillingPlanChangePreviewSchema = z
  .object({ quote: BillingPlanChangeQuoteSchema })
  .strict();
export const BillingPlanChangeConfirmSchema = z
  .object({ confirmation_token: z.string().min(1).max(8192) })
  .strict();
export const BillingPlanChangeCancelSchema = z
  .object({ schedule_id: z.string().min(1).max(255) })
  .strict();
export type BillingPlanChangeQuote = z.infer<typeof BillingPlanChangeQuoteSchema>;
export type BillingPlanChangeState = z.infer<typeof BillingPlanChangeStateSchema>;
export type BillingPlanChangeResult = BillingPlanChangeState | BillingPlanChangeError;
export type BillingPlanChangeError =
  | "billing_not_configured"
  | "billing_change_in_progress"
  | "no_active_subscription"
  | "plan_change_not_allowed"
  | "plan_change_confirmation_required"
  | "plan_change_not_found"
  | "billing_service_error";
export interface BillingPlanChangeManagement {
  getPlanChange(input: { organization_id: string }): Promise<BillingPlanChangeResult>;
  previewPlanChange(input: {
    organization_id: string;
  }): Promise<{ quote: BillingPlanChangeQuote } | BillingPlanChangeError>;
  schedulePlanChange(input: {
    organization_id: string;
    confirmation_token: string;
  }): Promise<BillingPlanChangeResult>;
  cancelPlanChange(input: {
    organization_id: string;
    schedule_id: string;
  }): Promise<BillingPlanChangeResult>;
}
