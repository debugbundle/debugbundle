import { z } from "zod";
import {
  ReviewAllowanceSchema,
  reviewPolicy
} from "../../smart-improvements/src/review-contract.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import { createImprovementReviewSettingsStore } from "./improvement-review-settings.js";
import { reviewDate, ReviewActorSchema, type ReviewActor } from "./improvement-review-access.js";
import { isCurrentBillingOwner } from "./billing-owner.js";
import { resolveBillingUsageWindow } from "./billing-allowance-window.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";
export function createImprovementReviewAllowance(
  db: Queryable
): (raw: ReviewActor) => Promise<z.infer<typeof ReviewAllowanceSchema>> {
  return async (raw: ReviewActor): Promise<z.infer<typeof ReviewAllowanceSchema>> => {
    const input = ReviewActorSchema.parse(raw);
    return runInTransaction(db, async (tx) => {
      await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY", []);
      await tx.query("SET LOCAL statement_timeout='5s'", []);
      const settings = await createImprovementReviewSettingsStore(tx).get(input);
      if (
        !settings.scope.length &&
        !(await isCurrentBillingOwner(tx, input.organization_id, input.initiator.user_id))
      )
        throw new SmartReportError("forbidden");
      const row = (
        await tx.query<Record<string, unknown>>(
          "SELECT plan,billing_interval,billing_period_starts_at,billing_period_ends_at,billing_allowance_anchor_at,clock_timestamp() AS checked_at FROM organizations WHERE id=$1 AND suspended_at IS NULL",
          [input.organization_id]
        )
      ).rows[0];
      if (!row) throw new SmartReportError("forbidden");
      const iso = (value: unknown): string | null =>
        value === null ? null : reviewDate(value).toISOString();
      const window = resolveBillingUsageWindow({
        now: reviewDate(row["checked_at"]),
        plan: z.enum(["free", "solo", "team", "business"]).parse(row["plan"]),
        billing_interval: z.enum(["month", "year"]).nullable().parse(row["billing_interval"]),
        billing_period_starts_at: iso(row["billing_period_starts_at"]),
        billing_period_ends_at: iso(row["billing_period_ends_at"]),
        billing_allowance_anchor_at: iso(row["billing_allowance_anchor_at"])
      });
      const usage = (
        await tx.query<{ generations: number }>(
          "SELECT generations FROM improvement_review_usage WHERE organization_id=$1 AND starts_at=$2",
          [input.organization_id, window.starts_at]
        )
      ).rows[0];
      const used = usage?.generations ?? 0,
        limit = reviewPolicy(String(row["plan"])).generations;
      return ReviewAllowanceSchema.parse({
        limit,
        used,
        remaining: Math.max(0, limit - used),
        starts_at: window.starts_at,
        ends_at: window.ends_at
      });
    });
  };
}
