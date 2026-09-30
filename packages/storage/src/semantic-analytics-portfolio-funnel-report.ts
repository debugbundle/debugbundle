import { createHash } from "node:crypto";
import { z } from "zod";
import { evaluateOrderedFunnel } from "../../analytics-engine/src/ordered-funnel.js";
import { predicateCanMatchCatalog } from "../../analytics-engine/src/measurement-plan.js";
import {
  PortfolioSemanticFunnelReportResponseSchema,
  type PortfolioSemanticFunnelReportResponse
} from "../../analytics-engine/src/funnel-report-protocol.js";
import { MAX_FUNNEL_FACTS } from "../../analytics-engine/src/funnel-evidence.js";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import { SemanticAnalyticsKeySchema } from "../../shared-types/src/analytics-semantic-primitives.js";
import { readAuthorizedAnalyticsSpacePlanInTransaction } from "./analytics-space-plan-store.js";
import {
  FUNNEL_FACT_ERASURE_FENCE_SQL,
  isUsableProjectFunnelFact,
  type FunnelFactAuthorityRow
} from "./semantic-analytics-funnel-fact-authority.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

const Input = z
  .object({
    actorUserId: z.string().uuid(),
    spaceId: z.string().uuid(),
    reportKey: SemanticAnalyticsKeySchema,
    from: z.string().datetime({ precision: 3 }),
    to: z.string().datetime({ precision: 3 })
  })
  .strict()
  .refine((value) => {
    const span = Date.parse(value.to) - Date.parse(value.from);
    return span > 0 && span <= 90 * 86_400_000;
  });

export type PortfolioSemanticFunnelReportRead =
  | { kind: "invalid" | "forbidden" | "not_found" | "insufficient_history" }
  | PortfolioSemanticFunnelReportResponse;

/** Internal portfolio comparison: every current source appears, with no combined people count. */
export async function readPortfolioSemanticFunnelReport(
  db: Queryable,
  input: z.infer<typeof Input>
): Promise<PortfolioSemanticFunnelReportRead> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { kind: "invalid" };
  const { actorUserId, spaceId, reportKey, from, to } = parsed.data;
  return runInTransaction(db, async (tx) => {
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ", []);
    const current = await readAuthorizedAnalyticsSpacePlanInTransaction(tx, actorUserId, spaceId);
    if (current === null) return { kind: "forbidden" };
    if (current.sources.mode !== "portfolio") return { kind: "not_found" };
    const state = current.plan.reports.find(
      (item) => item.definition.key === reportKey && item.definition.kind === "ordered_funnel"
    );
    if (state === undefined || state.definition.kind !== "ordered_funnel")
      return { kind: "not_found" };
    const saved = (
      await tx.query<{ content_hash: string; available_from: Date }>(
        `SELECT content_hash,available_from FROM analytics_space_report_revisions
         WHERE space_id=$1::uuid AND report_key=$2 AND revision=$3`,
        [spaceId, reportKey, state.definition.revision]
      )
    ).rows[0];
    if (
      saved === undefined ||
      saved.content_hash !==
        createHash("sha256").update(stableJson(state.definition)).digest("hex") ||
      saved.available_from.toISOString() !== state.available_from
    )
      return { kind: "not_found" };
    const clock = (await tx.query<{ watermark: Date }>("SELECT now() AS watermark", [])).rows[0];
    if (clock === undefined || !Number.isFinite(clock.watermark.getTime()))
      throw new Error("semantic_portfolio_report_clock_unavailable");
    const watermark = clock.watermark.toISOString();
    if (to > watermark) return { kind: "invalid" };
    const settings = (
      await tx.query<{ project_id: string; retention_days: number }>(
        `SELECT project.id AS project_id,
           COALESCE(settings.hourly_retention_days,7)::int AS retention_days
         FROM projects project
         LEFT JOIN project_analytics_settings settings ON settings.project_id=project.id
         WHERE project.id=ANY($1::uuid[]) ORDER BY project.id`,
        [current.sources.projectIds]
      )
    ).rows;
    if (
      settings.length !== current.sources.projectIds.length ||
      settings.some((row, index) => row.project_id !== current.sources.projectIds[index])
    )
      return { kind: "forbidden" };
    if (
      Date.parse(from) < Date.parse(state.available_from) ||
      settings.some(
        (row) =>
          Date.parse(from) <
          clock.watermark.getTime() - Math.min(row.retention_days, 90) * 86_400_000
      )
    )
      return { kind: "insufficient_history" };
    const lastRelevantAt = new Date(
      Date.parse(to) + state.definition.conversion_window_seconds * 1000
    ).toISOString();
    const lossThrough = new Date(
      Math.min(Date.parse(watermark), Date.parse(lastRelevantAt) - 1)
    ).toISOString();
    const sources: PortfolioSemanticFunnelReportResponse["sources"] = [];
    for (const source of current.sources.catalogs) {
      const missingSteps = state.definition.steps
        .filter((step) => !predicateCanMatchCatalog(step.predicate, source.entries))
        .map((step) => step.key);
      if (missingSteps.length > 0) {
        sources.push({
          kind: "catalog_gap",
          project_id: source.project_id,
          missing_steps: missingSteps
        });
        continue;
      }
      const projectId = source.project_id;
      const rows = (
        await tx.query<FunnelFactAuthorityRow & Record<string, unknown>>(
          `SELECT fact.fact,receipt.event_id IS NOT NULL AS receipt_present,
             receipt.identity_scope,receipt.identity_context_id,receipt.identity_writer_id,
             receipt.identity_producer_epoch,subject.subject_ref AS indexed_subject_ref,
             fact.fact->>'subject' AS fact_subject,
             ${FUNNEL_FACT_ERASURE_FENCE_SQL} AS erasure_fenced,
             receipt.identity_verification,receipt.namespace_revision,
             revocation.producer_epoch IS NOT NULL AS revoked,
             writer.kind AS writer_kind,writer.revoked_at AS writer_revoked_at,
             writer.expires_at AS writer_expires_at,writer.issuer_user_id,
             project.owner_user_id,organization.plan AS organization_plan,
             organization.suspended_at AS organization_suspended_at,
             member.user_id IS NOT NULL AS member_present,
             member.suspended_at AS member_suspended_at,collaborator.role AS project_role,
             namespace.namespace_revision AS current_namespace_revision,
             namespace.revoked_at AS namespace_revoked_at,
             settings.enabled AS analytics_enabled,settings.privacy_mode
           FROM semantic_analytics_portfolio_funnel_facts fact
           JOIN projects project ON project.id=fact.project_id
           JOIN organizations organization ON organization.id=project.organization_id
           LEFT JOIN semantic_analytics_receipts receipt
             ON receipt.project_id=fact.project_id AND receipt.event_id=fact.event_id
           LEFT JOIN analytics_project_identity_epoch_revocations revocation
             ON revocation.project_id=fact.project_id
               AND revocation.writer_id=receipt.identity_writer_id
               AND revocation.producer_epoch=receipt.identity_producer_epoch
           LEFT JOIN semantic_analytics_receipt_subjects subject
             ON subject.project_id=fact.project_id AND subject.event_id=fact.event_id
               AND subject.namespace_revision=receipt.namespace_revision
               AND subject.subject_kind=CASE WHEN fact.fact->>'subject'='session'
                 THEN 'anonymous' ELSE fact.fact->>'subject' END
           LEFT JOIN analytics_writers writer
             ON writer.id=receipt.identity_writer_id AND writer.project_id=fact.project_id
           LEFT JOIN organization_members member
             ON member.organization_id=project.organization_id
               AND member.user_id=writer.issuer_user_id
           LEFT JOIN project_members collaborator
             ON collaborator.project_id=fact.project_id
               AND collaborator.user_id=writer.issuer_user_id
           LEFT JOIN analytics_project_identity_namespaces namespace
             ON namespace.project_id=fact.project_id
           LEFT JOIN project_analytics_settings settings ON settings.project_id=fact.project_id
           WHERE fact.space_id=$1::uuid AND fact.project_id=$2::uuid
             AND fact.report_key=$3 AND fact.report_revision=$4
             AND fact.occurred_at>=$5::timestamptz AND fact.occurred_at<$6::timestamptz
             AND fact.occurred_at<$7::timestamptz
           ORDER BY fact.occurred_at,fact.event_id LIMIT $8`,
          [
            spaceId,
            projectId,
            reportKey,
            state.definition.revision,
            from,
            watermark,
            lastRelevantAt,
            MAX_FUNNEL_FACTS + 1
          ]
        )
      ).rows;
      const usable = (row: FunnelFactAuthorityRow): boolean =>
        isUsableProjectFunnelFact(row, projectId, watermark);
      const excluded = rows.filter((row) => !usable(row)).length;
      const facts =
        rows.length > MAX_FUNNEL_FACTS
          ? rows.map((row) => row.fact)
          : rows.filter(usable).map((row) => row.fact);
      const pending = (
        await tx.query<{ count: string; failed_count: string }>(
          `SELECT count(*)::text AS count,
             count(*) FILTER (WHERE job.status IN ('failed','skipped') OR job.id IS NULL)::text AS failed_count
           FROM semantic_analytics_receipts receipt
           LEFT JOIN worker_jobs job ON job.id=receipt.worker_job_id
           WHERE receipt.project_id=$1::uuid
             AND receipt.occurred_at>=$2::timestamptz
             AND receipt.occurred_at<$3::timestamptz
             AND receipt.occurred_at<$4::timestamptz
             AND receipt.accepted_at<=$3::timestamptz
             AND receipt.raw_retention_outcome IS DISTINCT FROM 'lost'
             AND receipt.raw_retention_outcome IS DISTINCT FROM 'job_completed'
             AND receipt.raw_retention_outcome IS DISTINCT FROM 'erased'
             AND job.status IS DISTINCT FROM 'completed'`,
          [projectId, from, watermark, lastRelevantAt]
        )
      ).rows[0];
      const lost = (
        await tx.query<{ count: string }>(
          `SELECT COALESCE(sum(lost_count),0)::text AS count
           FROM semantic_analytics_loss_days
           WHERE project_id=$1::uuid
             AND occurred_on>=($2::timestamptz AT TIME ZONE 'UTC')::date
             AND occurred_on<=($3::timestamptz AT TIME ZONE 'UTC')::date`,
          [projectId, from, lossThrough]
        )
      ).rows[0];
      const erasures = (
        await tx.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM analytics_project_subject_erasures
           WHERE project_id=$1::uuid AND cutoff_at>=$2::timestamptz`,
          [projectId, from]
        )
      ).rows[0];
      if (pending === undefined || lost === undefined || erasures === undefined)
        throw new Error("semantic_portfolio_report_quality_unavailable");
      const report = evaluateOrderedFunnel(
        {
          subject: state.definition.subject,
          scope: state.definition.scope,
          scope_revision: current.plan.space_revision,
          definition_key: reportKey,
          definition_revision: state.definition.revision,
          step_keys: state.definition.steps.map((step) => step.key),
          conversion_window_seconds: state.definition.conversion_window_seconds,
          from,
          to,
          observation_cutoff: watermark,
          watermark,
          available_from: state.available_from,
          definition_effective_from: state.available_from,
          sample_rate: 1,
          incomplete: true
        },
        facts
      );
      sources.push({
        kind: "report",
        project_id: projectId,
        report,
        evidence: {
          pending_events: pending.count,
          failed_events: pending.failed_count,
          lost_events: lost.count,
          excluded_events: String(excluded),
          erasure_tasks: erasures.count,
          source_coverage: "unverified"
        }
      });
    }
    return PortfolioSemanticFunnelReportResponseSchema.parse({
      kind: "report",
      space_id: spaceId,
      report_key: reportKey,
      from,
      to,
      sources
    });
  });
}
