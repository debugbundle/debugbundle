import { z } from "zod";
import {
  ReviewSettingsCommandSchema,
  ReviewSettingsSchema,
  reviewPolicy,
  type ReviewSettings
} from "../../smart-improvements/src/review.js";
import { AcceptedReportScopeSchema } from "../../smart-reports/src/report-definition.js";
import { nextReportSchedule } from "../../smart-reports/src/report-schedule.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import { captureReportScope, canAccessReportScope } from "./report-authorization.js";
import { isCurrentBillingOwner } from "./billing-owner.js";
import { runInTransaction } from "./transaction.js";
import {
  lockReviewOrganization,
  reviewDate,
  ReviewActorSchema,
  type ReviewActor,
  type ReviewRow
} from "./improvement-review-access.js";
import type { Queryable } from "./types.js";
const empty: ReviewSettings = {
  version: 0,
  enabled: false,
  scope: [],
  privacy_mode: "restricted",
  source_consent: false,
  next_due_at: null,
  requires_review: false
};
const iso = (value: unknown): string | null =>
  value === null ? null : reviewDate(value).toISOString();
function record(row?: ReviewRow): ReviewSettings {
  return row
    ? ReviewSettingsSchema.parse({
        version: row["version"],
        enabled: row["enabled"],
        scope: row["accepted_scope"],
        privacy_mode: row["privacy_mode"],
        source_consent: row["source_consent"],
        next_due_at: iso(row["next_due_at"]),
        requires_review: row["requires_review"]
      })
    : structuredClone(empty);
}
export interface ImprovementReviewSettingsStore {
  get(raw: ReviewActor): Promise<ReviewSettings>;
  replace(
    raw: ReviewActor & { command: z.input<typeof ReviewSettingsCommandSchema> }
  ): Promise<ReviewSettings>;
}
export function createImprovementReviewSettingsStore(
  db: Queryable
): ImprovementReviewSettingsStore {
  return {
    async get(raw: ReviewActor): Promise<ReviewSettings> {
      const input = ReviewActorSchema.parse(raw);
      const row = (
        await db.query<ReviewRow>(
          "SELECT * FROM improvement_review_settings WHERE organization_id=$1",
          [input.organization_id]
        )
      ).rows[0];
      if (
        (!row || !Array.isArray(row["accepted_scope"]) || !row["accepted_scope"].length) &&
        !(await isCurrentBillingOwner(db, input.organization_id, input.initiator.user_id))
      )
        throw new SmartReportError("forbidden");
      if (
        row &&
        Array.isArray(row["accepted_scope"]) &&
        row["accepted_scope"].length &&
        !(await canAccessReportScope(db, {
          organization_id: input.organization_id,
          scope: row["accepted_scope"],
          initiator: input.initiator,
          manage: false
        }))
      )
        throw new SmartReportError("forbidden");
      return record(row);
    },
    async replace(
      raw: ReviewActor & { command: z.input<typeof ReviewSettingsCommandSchema> }
    ): Promise<ReviewSettings> {
      const input = ReviewActorSchema.parse({
        organization_id: raw.organization_id,
        initiator: raw.initiator
      });
      const command = ReviewSettingsCommandSchema.parse(raw.command);
      if (
        command.expected_organization_id !== undefined &&
        command.expected_organization_id !== input.organization_id
      )
        throw new SmartReportError("organization_context_changed");
      return runInTransaction(db, async (tx) => {
        const org = await lockReviewOrganization(tx, input.organization_id),
          policy = reviewPolicy(String(org["plan"]));
        if (!(await isCurrentBillingOwner(tx, input.organization_id, input.initiator.user_id)))
          throw new SmartReportError("forbidden");
        const prior = (
          await tx.query<ReviewRow>(
            "SELECT * FROM improvement_review_settings WHERE organization_id=$1 FOR UPDATE",
            [input.organization_id]
          )
        ).rows[0];
        if ((prior?.["version"] ?? 0) !== command.expected_version)
          throw new SmartReportError("report_version_conflict");
        if (
          command.enabled &&
          (!policy.available ||
            org["trial_active"] !== true ||
            command.project_ids.length > policy.projects)
        )
          throw new SmartReportError("upgrade_required");
        const previousScope =
          prior && Array.isArray(prior["accepted_scope"]) && prior["accepted_scope"].length
            ? AcceptedReportScopeSchema.parse(prior["accepted_scope"])
            : [];
        if (
          previousScope.length &&
          !(await canAccessReportScope(tx, { ...input, scope: previousScope, manage: true }))
        )
          throw new SmartReportError("forbidden");
        const same =
          [...command.project_ids].sort().join() ===
          previousScope
            .map((view) => view.project_id)
            .sort()
            .join();
        const scope = !command.project_ids.length
          ? []
          : same
            ? previousScope
            : await captureReportScope(tx, { ...input, project_ids: command.project_ids });
        if (scope.length && !(await canAccessReportScope(tx, { ...input, scope, manage: true })))
          throw new SmartReportError("forbidden");
        if (command.enabled) {
          const eligible = await tx.query(
            "SELECT p.id FROM projects p JOIN projects canonical ON canonical.id=debugbundle_canonical_project(p.id) WHERE p.id=ANY($1::uuid[]) AND canonical.automated_improvement_bundles_enabled",
            [command.project_ids]
          );
          if (eligible.rows.length !== command.project_ids.length)
            throw new SmartReportError("forbidden");
        }
        // Irreversible privacy narrowing/removal deletes derived content, with the
        // delete guard retaining paid/uncertain holds and immutable attempt receipts.
        const removed = previousScope
          .filter(
            (old) =>
              !scope.some(
                (view) =>
                  view.project_id === old.project_id &&
                  old.origin_project_ids.every((id) => view.origin_project_ids.includes(id))
              )
          )
          .map((view) => view.project_id);
        await tx.query(
          `DELETE FROM improvement_reviews WHERE organization_id=$1 AND ($2::boolean OR project_id=ANY($3::uuid[]) OR ($4::boolean AND privacy_mode='full'))`,
          [
            input.organization_id,
            !command.source_consent,
            removed,
            command.privacy_mode === "restricted"
          ]
        );
        const due = command.enabled
          ? nextReportSchedule({
              cadence: "weekly",
              schedule: { time: "09:00", timezone: "UTC" },
              after: iso(org["checked_at"])!
            }).due_at
          : null;
        const row = (
          await tx.query<ReviewRow>(
            `INSERT INTO improvement_review_settings(organization_id,enabled,accepted_scope,initiating_authority,privacy_mode,source_consent,next_due_at)
          VALUES($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7) ON CONFLICT(organization_id) DO UPDATE SET version=improvement_review_settings.version+1,
          enabled=EXCLUDED.enabled,accepted_scope=EXCLUDED.accepted_scope,initiating_authority=EXCLUDED.initiating_authority,
          privacy_mode=EXCLUDED.privacy_mode,source_consent=EXCLUDED.source_consent,next_due_at=EXCLUDED.next_due_at,requires_review=false,updated_at=clock_timestamp() RETURNING *`,
            [
              input.organization_id,
              command.enabled,
              JSON.stringify(scope),
              JSON.stringify(input.initiator),
              command.privacy_mode,
              command.source_consent,
              due
            ]
          )
        ).rows[0]!;
        return record(row);
      });
    }
  };
}
