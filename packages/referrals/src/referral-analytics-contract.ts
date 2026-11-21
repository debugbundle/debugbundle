import { z } from "zod";

export const ReferralAnalyticsQuerySchema = z
  .object({ days: z.enum(["7", "30", "90"]).default("30") })
  .strict();
export type ReferralAnalyticsDays = z.output<typeof ReferralAnalyticsQuerySchema>["days"];

const counts = z.object({
  visits: z.number().int().nonnegative().nullable().optional(),
  referred_accounts: z.number().int().nonnegative(),
  first_paid_referrals: z.number().int().nonnegative(),
  net_commission_minor: z.number().int()
});
export const ReferralAnalyticsSchema = z
  .object({
    as_of: z.iso.datetime(),
    visit_tracking_started_at: z.iso.datetime().optional(),
    currency: z.literal("usd"),
    totals: counts.strict(),
    daily: z
      .array(counts.extend({ date: z.iso.date() }).strict())
      .min(7)
      .max(90)
  })
  .strict();
export type ReferralAnalytics = z.infer<typeof ReferralAnalyticsSchema>;
