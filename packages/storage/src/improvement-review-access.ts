import { z } from "zod";
import { AcceptedReportScopeSchema } from "../../smart-reports/src/report-definition.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import { reviewPolicy } from "../../smart-improvements/src/review.js";
import { canAccessReportScope } from "./report-authorization.js";
import { reviewPrivacyNarrowed, reviewPrivacySnapshot } from "./improvement-review-facts.js";
import { isCurrentBillingOwner } from "./billing-owner.js";
import {
  ProjectJobInitiatorSchema,
  type ProjectJobInitiator
} from "./project-job-authorization.js";
import { REPORT_TRIAL_ENTITLEMENT_SQL } from "./report-trial-entitlement.js";
import type { Queryable } from "./types.js";
export type ReviewRow = Record<string, unknown>;
export function reviewDate(value: unknown): Date {
  return value instanceof Date ? new Date(value.getTime()) : new Date(z.string().parse(value));
}
export const ReviewActorSchema = z
  .object({ organization_id: z.uuid(), initiator: ProjectJobInitiatorSchema })
  .strict();
export type ReviewActor = z.infer<typeof ReviewActorSchema>;
export async function lockReviewOrganization(tx: Queryable, id: string): Promise<ReviewRow> {
  await tx.query("SET LOCAL lock_timeout='5s'", []);
  await tx.query("SET LOCAL statement_timeout='30s'", []);
  await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [id]);
  const row = (
    await tx.query<ReviewRow>(
      `SELECT *,clock_timestamp() AS checked_at,${REPORT_TRIAL_ENTITLEMENT_SQL} AS trial_active FROM organizations WHERE id=$1`,
      [id]
    )
  ).rows[0];
  if (!row || row["suspended_at"] !== null) throw new SmartReportError("forbidden");
  return row;
}
export async function requireReviewRead(
  db: Queryable,
  row: ReviewRow,
  actor: ProjectJobInitiator
): Promise<void> {
  if (
    row["privacy_invalidated"] === true ||
    reviewDate(row["expires_at"]).getTime() <= Date.now() ||
    !(await canAccessReportScope(db, {
      organization_id: String(row["organization_id"]),
      scope: row["accepted_scope"],
      initiator: actor,
      manage: false
    }))
  )
    throw new SmartReportError("report_not_found");
  if (row["privacy_snapshot"] !== null && row["privacy_snapshot"] !== undefined) {
    const scope = AcceptedReportScopeSchema.parse(row["accepted_scope"]);
    if (
      reviewPrivacyNarrowed(
        row["privacy_snapshot"],
        await reviewPrivacySnapshot(
          db,
          scope.flatMap((view) => view.origin_project_ids)
        )
      )
    )
      throw new SmartReportError("report_not_found");
  }
}
export async function requireReviewWork(db: Queryable, row: ReviewRow): Promise<ReviewRow> {
  const current = (
    await db.query<ReviewRow>(
      `SELECT o.*,clock_timestamp() AS checked_at,s.enabled AS review_enabled,s.source_consent,s.requires_review,s.accepted_scope AS current_scope,s.privacy_mode AS current_privacy,
    ${REPORT_TRIAL_ENTITLEMENT_SQL} AS trial_active FROM organizations o JOIN improvement_review_settings s ON s.organization_id=o.id WHERE o.id=$1`,
      [row["organization_id"]]
    )
  ).rows[0];
  const scope = AcceptedReportScopeSchema.parse(row["accepted_scope"]);
  const actor = ProjectJobInitiatorSchema.parse(row["initiating_authority"]);
  if (
    !current ||
    current["suspended_at"] !== null ||
    current["trial_active"] !== true ||
    current["review_enabled"] !== true ||
    current["source_consent"] !== true ||
    current["requires_review"] === true ||
    !reviewPolicy(String(current["plan"])).available ||
    (row["privacy_mode"] === "full" && current["current_privacy"] !== "full") ||
    !scope.every((view) =>
      AcceptedReportScopeSchema.parse(current["current_scope"]).some(
        (item) =>
          item.project_id === view.project_id &&
          view.origin_project_ids.every((id) => item.origin_project_ids.includes(id))
      )
    ) ||
    !(await isCurrentBillingOwner(db, String(row["organization_id"]), actor.user_id)) ||
    !(await canAccessReportScope(db, {
      organization_id: String(row["organization_id"]),
      scope,
      initiator: actor,
      manage: true
    }))
  )
    throw new SmartReportError("forbidden");
  await requireReviewRead(db, row, actor);
  const enabled = await db.query(
    "SELECT p.id FROM projects p JOIN projects canonical ON canonical.id=debugbundle_canonical_project(p.id) WHERE p.id=ANY($1::uuid[]) AND canonical.automated_improvement_bundles_enabled",
    [scope.map((view) => view.project_id)]
  );
  if (enabled.rows.length !== scope.length) throw new SmartReportError("forbidden");
  return current;
}
