import type { TierName } from "../../shared-types/src/index.js";
import type { AccountAnalyticsStore, AccountMetricKey } from "./account-analytics-store.js";
import type { RecordedImprovementOpportunityOccurrence } from "./improvement-opportunity-recording.js";
import type {
  ImprovementOpportunityKind,
  ImprovementOpportunityStatus,
  ImprovementOpportunityRecord
} from "./improvement-opportunity-types.js";
import type { Queryable, ImprovementRetrievalRecord } from "./types.js";

export function normalizePlan(plan: string | null | undefined): TierName {
  if (plan === "solo" || plan === "team" || plan === "business") {
    return plan;
  }

  return "free";
}

export function toRecordedImprovementResult(recorded: RecordedImprovementOpportunityOccurrence): {
  opportunity_id: string;
  occurrence_count: number;
  bundle_generation_number: number;
  should_generate_bundle: boolean;
} {
  return {
    opportunity_id: recorded.opportunity_id,
    occurrence_count: recorded.occurrence_count,
    bundle_generation_number: recorded.bundle_generation_number,
    should_generate_bundle: recorded.should_generate_bundle
  };
}

export function getImprovementOpenedMetricKey(
  kind: ImprovementOpportunityKind
): Extract<
  AccountMetricKey,
  | "warning_log_improvements_opened"
  | "slow_request_improvements_opened"
  | "request_failure_improvements_opened"
  | "recurring_incident_improvements_opened"
  | "post_deploy_regression_improvements_opened"
> {
  switch (kind) {
    case "warning_hotspot":
      return "warning_log_improvements_opened";
    case "slow_request":
      return "slow_request_improvements_opened";
    case "request_failure_pattern":
      return "request_failure_improvements_opened";
    case "recurring_incident":
      return "recurring_incident_improvements_opened";
    case "post_deploy_regression":
      return "post_deploy_regression_improvements_opened";
  }
}

export async function resolveOrganizationIdForProject(
  db: Queryable,
  projectId: string
): Promise<string | null> {
  const result = await db.query<{ organization_id: string } & Record<string, unknown>>(
    `
      SELECT organization_id::text AS organization_id
      FROM projects
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [projectId]
  );

  return result.rows[0]?.organization_id ?? null;
}

export async function recordImprovementMetricDeltas(
  accountAnalyticsStore: AccountAnalyticsStore | undefined,
  tx: Queryable,
  input: {
    organization_id: string;
    occurred_at: string;
    source: string;
    dedupe_key: string;
    deltas: Partial<Record<AccountMetricKey, number>>;
  }
): Promise<void> {
  if (accountAnalyticsStore === undefined) {
    return;
  }

  await accountAnalyticsStore.withDb(tx).recordMetricDeltas(input);
}

export async function getImprovementLifecycleState(
  db: Queryable,
  input: {
    organization_id: string;
    improvement_id: string;
    user_id?: string;
  }
): Promise<{
  project_id: string;
  status: ImprovementOpportunityStatus;
  resolved_at: string | null;
  snoozed_until: string | null;
} | null> {
  const result = await db.query<
    {
      project_id: string;
      status: ImprovementOpportunityStatus;
      resolved_at: string | null;
      snoozed_until: string | null;
    } & Record<string, unknown>
  >(
    `
      SELECT
        io.project_id::text AS project_id,
        io.status,
        io.resolved_at::text AS resolved_at,
        io.snoozed_until::text AS snoozed_until
      FROM improvement_opportunities io
      JOIN projects p ON p.id = debugbundle_canonical_project(io.project_id)
      WHERE io.id = $2::uuid
        AND (
          (
            $3::uuid IS NULL
            AND p.organization_id = $1::uuid
          )
          OR (
            $3::uuid IS NOT NULL
            AND (
              p.owner_user_id = $3::uuid
              OR EXISTS (
                SELECT 1
                FROM project_members pm
                WHERE pm.project_id = p.id
                  AND pm.user_id = $3::uuid
              )
            )
          )
        )
      LIMIT 1
    `,
    [input.organization_id, input.improvement_id, input.user_id ?? null]
  );

  return result.rows[0] ?? null;
}

export type ImprovementOpportunityRow = ImprovementOpportunityRecord & Record<string, unknown>;
export type ImprovementRetrievalRow = ImprovementRetrievalRecord & Record<string, unknown>;

export function buildEffectiveImprovementStatusSql(): string {
  return `
    CASE
      WHEN io.status = 'snoozed'
        AND io.snoozed_until IS NOT NULL
        AND io.snoozed_until <= now()
        THEN 'open'
      ELSE io.status
    END
  `;
}

export function buildEffectiveImprovementSnoozedUntilSql(): string {
  return `
    CASE
      WHEN io.status = 'snoozed'
        AND io.snoozed_until IS NOT NULL
        AND io.snoozed_until <= now()
        THEN NULL
      ELSE io.snoozed_until::text
    END
  `;
}

export function buildImprovementSelectClause(projectParameter?: number): string {
  return `
    io.id::text AS improvement_id,
    io.project_id::text AS project_id,
    CASE WHEN p.id<>io.project_id THEN p.id END AS canonical_project_id,
    sd.id AS service_definition_id,sd.name AS canonical_service_name,
    ${projectParameter === undefined ? "NULL::text" : `(SELECT a.name FROM service_project_aliases a WHERE a.project_id=$${projectParameter} AND a.service_definition_id=sd.id AND a.is_current)`} AS project_view_service_name,
    p.name AS project_name,
    p.color_tag AS project_color_tag,
    p.slug AS project_slug,
    io.service_id::text AS service_id,
    io.service_name,
    s.runtime AS service_runtime,
    s.framework AS service_framework,
    io.environment,
    io.kind,
    ${buildEffectiveImprovementStatusSql()} AS status,
    io.severity,
    io.confidence::float8 AS confidence,
    io.fingerprint,
    io.title,
    io.summary,
    io.occurrence_count,
    io.evidence,
    io.related_incident_ids::text[] AS related_incident_ids,
    io.first_detected_at::text AS first_detected_at,
    io.last_detected_at::text AS last_detected_at,
    io.resolved_at::text AS resolved_at,
    ${buildEffectiveImprovementSnoozedUntilSql()} AS snoozed_until,
    io.bundle_generation_number,
    io.bundle_created_at::text AS bundle_created_at,
    io.bundle_updated_at::text AS bundle_updated_at,
    io.bundle_failure_reason
  `;
}
