import { z } from "zod";
import { CommissionBasisPointsSchema, PublicOfferCodeSchema } from "./programme-policy.js";
const count = z.number().int().min(1).max(1_000_000);
const money = z.number().int().safe().min(0).max(1_000_000_000_000);
export const CreatorEmailSectionSchema = z
  .object({
    programme_id: z.uuid(),
    name: z.string().min(1).max(200),
    new_referrals: count,
    pending_commission_minor: money
  })
  .strict();
export const CreatorEmailPayloadSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("joined"),
        name: z.string().min(1).max(200),
        terms_version: z.string().min(1).max(100),
        code: PublicOfferCodeSchema,
        commission_basis_points: CommissionBasisPointsSchema,
        discount_basis_points: CommissionBasisPointsSchema,
        commission_months: z.number().int().min(1).max(12)
      })
      .strict(),
    z
      .object({
        kind: z.enum(["first_purchase", "daily_digest"]),
        window_start: z.string().datetime(),
        window_end: z.string().datetime(),
        sections: z.array(CreatorEmailSectionSchema).min(1).max(25),
        total_referrals: count,
        total_commission_minor: money,
        other_programmes: z.number().int().min(0).max(100_000)
      })
      .strict()
  ])
  .superRefine((value, ctx) => {
    if (value.kind === "joined") return;
    const invalid = (): void =>
      ctx.addIssue({ code: "custom", message: "invalid_creator_email_summary" });
    const duration = Date.parse(value.window_end) - Date.parse(value.window_start);
    const count = value.sections.reduce((n, s) => n + s.new_referrals, 0);
    const money = value.sections.reduce((n, s) => n + s.pending_commission_minor, 0);
    if (duration < 0 || (value.kind === "daily_digest" && duration !== 86400000)) invalid();
    if (new Set(value.sections.map((s) => s.programme_id)).size !== value.sections.length)
      invalid();
    if (
      count + value.other_programmes > value.total_referrals ||
      money > value.total_commission_minor
    )
      invalid();
    if (
      !value.other_programmes &&
      (count !== value.total_referrals || money !== value.total_commission_minor)
    )
      invalid();
    if (
      value.kind === "first_purchase" &&
      (value.sections.length !== 1 || value.total_referrals !== 1 || value.other_programmes !== 0)
    )
      invalid();
  });
export type CreatorEmailPayload = z.infer<typeof CreatorEmailPayloadSchema>;
