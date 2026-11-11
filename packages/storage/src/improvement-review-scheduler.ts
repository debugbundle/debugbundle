import { randomUUID } from "node:crypto";
import { AcceptedReportScopeSchema } from "../../smart-reports/src/report-definition.js";
import { lastCompletedReportPeriod } from "../../smart-reports/src/report-period.js";
import { nextReportSchedule } from "../../smart-reports/src/report-schedule.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import { reviewPolicy } from "../../smart-improvements/src/review.js";
import { createWorkerJobStore } from "./worker-job-store.js";
import { readReportIdentities } from "./report-identity-store.js";
import { runInTransaction } from "./transaction.js";
import {
  lockReviewOrganization,
  requireReviewWork,
  reviewDate,
  type ReviewRow
} from "./improvement-review-access.js";
import type { Queryable } from "./types.js";
/** One organisation and at most ten projects per pass. The unique project/week
 * receipt and future schedule advance commit together; outage recovery selects
 * the latest completed week once rather than replaying every missed period. */
export interface ImprovementReviewScheduler {
  scheduleNext(): Promise<{ processed: boolean }>;
}
export function createImprovementReviewScheduler(db: Queryable): ImprovementReviewScheduler {
  return {
    async scheduleNext(): Promise<{ processed: boolean }> {
      return runInTransaction(db, async (tx) => {
        const candidate = (
          await tx.query<{ organization_id: string }>(
            `SELECT s.organization_id FROM improvement_review_settings s
          JOIN organizations o ON o.id=s.organization_id WHERE s.enabled AND NOT s.requires_review AND o.suspended_at IS NULL AND s.next_due_at<=clock_timestamp()
          ORDER BY s.next_due_at,s.organization_id LIMIT 1 FOR UPDATE OF o SKIP LOCKED`,
            []
          )
        ).rows[0];
        if (!candidate) return { processed: false };
        const org = await lockReviewOrganization(tx, candidate.organization_id);
        const settings = (
          await tx.query<ReviewRow>(
            "SELECT * FROM improvement_review_settings WHERE organization_id=$1 FOR UPDATE",
            [candidate.organization_id]
          )
        ).rows[0]!;
        const scope = AcceptedReportScopeSchema.parse(settings["accepted_scope"]),
          policy = reviewPolicy(String(org["plan"]));
        const now = reviewDate(org["checked_at"]).toISOString(),
          period = lastCompletedReportPeriod("weekly", now);
        if (!policy.available || scope.length > policy.projects || org["trial_active"] !== true) {
          await tx.query(
            "UPDATE improvement_review_settings SET enabled=false,requires_review=true,next_due_at=NULL,version=version+1 WHERE organization_id=$1",
            [candidate.organization_id]
          );
          return { processed: true };
        }
        const identitiesByProject = new Map<string, string[]>();
        try {
          for (const project of scope) {
            await requireReviewWork(tx, {
              organization_id: candidate.organization_id,
              accepted_scope: [project],
              initiating_authority: settings["initiating_authority"],
              privacy_mode: settings["privacy_mode"],
              privacy_invalidated: false,
              expires_at: new Date(Date.parse(now) + 86400000).toISOString(),
              privacy_snapshot: null
            });
            identitiesByProject.set(project.project_id, await readReportIdentities(tx, [project]));
          }
        } catch (error) {
          if (
            !(error instanceof SmartReportError) &&
            !(error instanceof Error && error.message === "report_identity_limit_exceeded")
          )
            throw error;
          await tx.query(
            "UPDATE improvement_review_settings SET enabled=false,requires_review=true,next_due_at=NULL,version=version+1 WHERE organization_id=$1",
            [candidate.organization_id]
          );
          return { processed: true };
        }
        for (const project of scope) {
          const id = randomUUID(),
            identities = identitiesByProject.get(project.project_id)!;
          const created = await tx.query(
            `INSERT INTO improvement_reviews(id,organization_id,project_id,settings_version,accepted_scope,initiating_authority,privacy_mode,identities,period_starts_at,period_ends_at,cutoff_at,expires_at)
            VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8::jsonb,$9,$10,$11,
              LEAST($11::timestamptz+interval '90 days',$11::timestamptz+make_interval(months=>COALESCE((SELECT min(s.aggregate_retention_months) FROM projects p
                JOIN project_analytics_settings s ON s.project_id=debugbundle_canonical_project(p.id)
                WHERE p.id=ANY($12::uuid[]) AND s.enabled),3))))
            ON CONFLICT(organization_id,project_id,period_starts_at) DO NOTHING RETURNING id`,
            [
              id,
              candidate.organization_id,
              project.project_id,
              settings["version"],
              JSON.stringify([project]),
              JSON.stringify(settings["initiating_authority"]),
              settings["privacy_mode"],
              JSON.stringify(identities),
              period.starts_at,
              period.ends_at,
              now,
              project.origin_project_ids
            ]
          );
          if (created.rows.length) {
            const job = await createWorkerJobStore(tx).enqueue("generate-improvement-review", {
              review_id: id,
              organization_id: candidate.organization_id,
              project_id: project.project_id,
              initiating_authority: settings["initiating_authority"]
            });
            await tx.query("UPDATE improvement_reviews SET processing_job_id=$2 WHERE id=$1", [
              id,
              job
            ]);
            await tx.query(
              "UPDATE worker_jobs SET expires_at=LEAST(expires_at,$2::timestamptz+interval '24 hours') WHERE id=$1",
              [job, now]
            );
          }
        }
        const next = nextReportSchedule({
          cadence: "weekly",
          schedule: { time: "09:00", timezone: "UTC" },
          after: now
        });
        await tx.query(
          "UPDATE improvement_review_settings SET next_due_at=$2 WHERE organization_id=$1",
          [candidate.organization_id, next.due_at]
        );
        return { processed: true };
      });
    }
  };
}
