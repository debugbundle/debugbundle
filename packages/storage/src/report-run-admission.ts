import { REPORT_TRIAL_ENTITLEMENT_SQL } from "./report-trial-entitlement.js";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getTierCapabilities, isSelfHostMode } from "../../shared-types/src/index.js";
import {
  ReportRunKindSchema,
  ReportRunCommandSchema,
  type ReportRunRecord
} from "../../smart-reports/src/report-run.js";
import { AcceptedReportScopeSchema } from "../../smart-reports/src/report-definition.js";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import {
  REPORT_AI_MONTHLY_BUDGET_NANO_USD,
  ReportAttemptProfileSchema,
  maximumReportRunCost,
  type ReportAttemptProfile
} from "../../smart-reports/src/model-cost.js";
import { ProjectJobInitiatorSchema } from "./project-job-authorization.js";
import { canAccessReportScope, requireReportRecipients } from "./report-authorization.js";
import { resolveBillingUsageWindow } from "./billing-allowance-window.js";
import { reportRunRecord } from "./report-run-record.js";
import { runInTransaction } from "./transaction.js";
import { createWorkerJobStore } from "./worker-job-store.js";
import type { Queryable } from "./types.js";
const InputSchema = ReportRunCommandSchema.extend({
  organization_id: z.uuid(),
  initiator: ProjectJobInitiatorSchema,
  kind: ReportRunKindSchema
}).strict();
export interface ReportRunAdmissionStore {
  admit(raw: z.input<typeof InputSchema>): Promise<ReportRunRecord>;
}
const safeNano = z.coerce.number().int().safe().nonnegative();
function iso(value: unknown): string | null {
  return value === null
    ? null
    : (value instanceof Date ? value : new Date(z.string().parse(value))).toISOString();
}
/** Reservations are shared by scheduled/manual/regenerated runs. The fixed
 * accepted scope, actual actor and allowance window survive later edits. This
 * factory accepts trusted runtime AI configuration, never a request's model or
 * budget. Admission alone cannot call a provider or grant publication rights. */
export function createReportRunAdmissionStore(
  db: Queryable,
  options: {
    profile: ReportAttemptProfile | null;
    monthly_budget_nano_usd?: number;
    record_scheduled_quota_skips?: boolean;
  }
): ReportRunAdmissionStore {
  const profile =
      options.profile === null ? null : ReportAttemptProfileSchema.parse(options.profile),
    allocation = profile === null ? 0 : maximumReportRunCost(profile).run_nano_usd;
  const budget = safeNano
    .max(1_000_000_000_000)
    .parse(options.monthly_budget_nano_usd ?? REPORT_AI_MONTHLY_BUDGET_NANO_USD);
  if (!isSelfHostMode() && budget > REPORT_AI_MONTHLY_BUDGET_NANO_USD)
    throw new Error("report_hosted_budget_exceeded");
  return {
    async admit(raw) {
      const input = InputSchema.parse(raw);
      if (
        input.expected_organization_id !== undefined &&
        input.expected_organization_id !== input.organization_id
      )
        throw new SmartReportError("organization_context_changed");
      if ((input.kind === "regeneration") !== (input.regenerate_from_run_id !== undefined))
        throw new SmartReportError("report_request_conflict");
      const digest = createHash("sha256")
        .update(
          JSON.stringify({
            user_id: input.initiator.user_id,
            definition_id: input.definition_id,
            expected_version: input.expected_version,
            period: input.period,
            kind: input.kind,
            regenerate_from_run_id: input.regenerate_from_run_id ?? null,
            send_email: input.send_email
          })
        )
        .digest("hex");
      return runInTransaction(db, async (tx) => {
        await tx.query("SET LOCAL lock_timeout='5s'", []);
        await tx.query("SET LOCAL statement_timeout='30s'", []);
        const locked = await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
          input.organization_id
        ]);
        if (locked.rows.length !== 1) throw new SmartReportError("forbidden");
        const organization = (
          await tx.query<Record<string, unknown>>(
            `SELECT plan,suspended_at,billing_interval,billing_period_starts_at,billing_period_ends_at,billing_allowance_anchor_at,clock_timestamp() AS now FROM organizations WHERE id=$1 AND ${REPORT_TRIAL_ENTITLEMENT_SQL}`,
            [input.organization_id]
          )
        ).rows[0]!;
        if (!organization) throw new SmartReportError("upgrade_required");
        if (organization["suspended_at"] !== null) throw new SmartReportError("forbidden");
        const plan = z.enum(["free", "solo", "team", "business"]).parse(organization["plan"]),
          caps = getTierCapabilities(plan);
        if (!caps.smart_reports) throw new SmartReportError("upgrade_required");
        const previous = (
          await tx.query<Record<string, unknown>>(
            "SELECT * FROM report_runs WHERE organization_id=$1 AND request_id=$2",
            [input.organization_id, input.request_id]
          )
        ).rows[0];
        if (previous) {
          if (previous["request_digest"] !== digest)
            throw new SmartReportError("report_request_conflict");
          if (
            !(await canAccessReportScope(tx, {
              organization_id: input.organization_id,
              scope: previous["accepted_scope"],
              initiator: input.initiator,
              manage: true
            }))
          )
            throw new SmartReportError("forbidden");
          return reportRunRecord(previous);
        }
        const definition = (
          await tx.query<Record<string, unknown>>(
            "SELECT * FROM report_definitions WHERE organization_id=$1 AND id=$2 FOR UPDATE",
            [input.organization_id, input.definition_id]
          )
        ).rows[0];
        if (!definition) throw new SmartReportError("report_not_found");
        if (definition["version"] !== input.expected_version)
          throw new SmartReportError("report_version_conflict");
        if (
          definition["paused_at"] !== null ||
          definition["requires_owner_review"] === true ||
          (input.kind === "scheduled" && definition["enabled"] !== true)
        )
          throw new SmartReportError("forbidden");
        const scope = AcceptedReportScopeSchema.parse(definition["accepted_scope"]);
        const initiator =
          input.kind === "scheduled"
            ? ProjectJobInitiatorSchema.parse(definition["initiating_authority"])
            : input.initiator;
        if (
          !(await canAccessReportScope(tx, {
            organization_id: input.organization_id,
            scope,
            initiator,
            manage: true
          }))
        )
          throw new SmartReportError("forbidden");
        await requireReportRecipients(tx, {
          organization_id: input.organization_id,
          scope,
          user_ids: z.array(z.uuid()).parse(definition["recipient_user_ids"])
        });
        if (input.kind === "scheduled") {
          const scheduled = (
            await tx.query<Record<string, unknown>>(
              `SELECT * FROM report_runs WHERE definition_id=$1 AND generation_kind='scheduled' AND period_kind=$2 AND period_starts_at=$3 AND period_ends_at=$4`,
              [input.definition_id, input.period.kind, input.period.starts_at, input.period.ends_at]
            )
          ).rows[0];
          if (scheduled) return reportRunRecord(scheduled);
        }
        const now = new Date(iso(organization["now"])!);
        if (Date.parse(input.period.ends_at) > now.getTime())
          throw new SmartReportError("report_period_unavailable");
        if (input.regenerate_from_run_id !== undefined) {
          const parent = (
            await tx.query<Record<string, unknown>>(
              "SELECT * FROM report_runs WHERE organization_id=$1 AND definition_id=$2 AND id=$3",
              [input.organization_id, input.definition_id, input.regenerate_from_run_id]
            )
          ).rows[0];
          if (
            !parent ||
            !(await canAccessReportScope(tx, {
              organization_id: input.organization_id,
              scope: parent["accepted_scope"],
              initiator,
              manage: true
            }))
          )
            throw new SmartReportError("forbidden");
          const parentPeriod = reportRunRecord(parent).period;
          if (JSON.stringify(parentPeriod) !== JSON.stringify(input.period))
            throw new SmartReportError("report_request_conflict");
        }
        const window = resolveBillingUsageWindow({
          now,
          plan,
          billing_interval: z
            .enum(["month", "year"])
            .nullable()
            .parse(organization["billing_interval"]),
          billing_period_starts_at: iso(organization["billing_period_starts_at"]),
          billing_period_ends_at: iso(organization["billing_period_ends_at"]),
          billing_allowance_anchor_at: iso(organization["billing_allowance_anchor_at"])
        });
        await tx.query(
          `INSERT INTO report_allowance_windows(organization_id,starts_at,ends_at,budget_limit_nano_usd) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [input.organization_id, window.starts_at, window.ends_at, budget]
        );
        const usage = (
          await tx.query<Record<string, unknown>>(
            "SELECT generations,held_nano_usd,spent_nano_usd FROM report_allowance_windows WHERE organization_id=$1 AND starts_at=$2 FOR UPDATE",
            [input.organization_id, window.starts_at]
          )
        ).rows[0]!;
        const generationQuota =
          safeNano.parse(usage["generations"]) >= caps.monthly_smart_report_generations;
        const aiQuota =
          allocation > 0 &&
          safeNano.parse(usage["held_nano_usd"]) +
            safeNano.parse(usage["spent_nano_usd"]) +
            allocation >
            budget;
        const quotaError = generationQuota
          ? "report_quota_exhausted"
          : aiQuota
            ? "report_ai_budget_exhausted"
            : null;
        const skipped =
          quotaError !== null &&
          input.kind === "scheduled" &&
          options.record_scheduled_quota_skips === true;
        if (quotaError !== null && !skipped) throw new SmartReportError(quotaError);
        if (!skipped)
          await tx.query(
            "UPDATE report_allowance_windows SET generations=generations+1,held_nano_usd=held_nano_usd+$3,budget_limit_nano_usd=GREATEST($4,held_nano_usd+spent_nano_usd+$3) WHERE organization_id=$1 AND starts_at=$2",
            [input.organization_id, window.starts_at, allocation, budget]
          );
        const run = (
          await tx.query<Record<string, unknown>>(
            `INSERT INTO report_runs(id,organization_id,definition_id,definition_version,request_id,request_digest,requested_by_user_id,initiating_authority,
 name,accepted_scope,recipient_user_ids,privacy_mode,source_collection_consent,send_email,period_kind,period_starts_at,period_ends_at,period_duration_days,generation_kind,regenerate_from_run_id,
 window_starts_at,ai_status,ai_profile,ai_reserved_nano_usd,generation_counted,status,skip_reason,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,$11::uuid[],$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb,$24,$25,$26,$27,clock_timestamp()+interval '90 days') RETURNING *`,
            [
              randomUUID(),
              input.organization_id,
              input.definition_id,
              input.expected_version,
              input.request_id,
              digest,
              initiator.user_id,
              JSON.stringify(initiator),
              definition["name"],
              JSON.stringify(scope),
              definition["recipient_user_ids"],
              definition["privacy_mode"],
              definition["source_collection_consent"],
              input.kind === "scheduled" || input.send_email,
              input.period.kind,
              input.period.starts_at,
              input.period.ends_at,
              input.period.duration_days,
              input.kind,
              input.regenerate_from_run_id ?? null,
              window.starts_at,
              skipped || profile === null ? "unavailable" : "pending",
              skipped || profile === null ? null : JSON.stringify(profile),
              skipped ? 0 : allocation,
              !skipped,
              skipped ? "skipped_quota" : "queued",
              skipped ? (generationQuota ? "generation_quota" : "ai_budget") : null
            ]
          )
        ).rows[0]!;
        if (skipped) return reportRunRecord(run);
        const jobId = await createWorkerJobStore(tx).enqueue("generate-smart-report", {
          run_id: run["id"],
          organization_id: input.organization_id
        });
        await tx.query("UPDATE report_runs SET processing_job_id=$2 WHERE id=$1", [
          run["id"],
          jobId
        ]);
        return reportRunRecord(run);
      });
    }
  };
}
