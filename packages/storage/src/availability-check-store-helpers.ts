import { getTierCapabilities, type TierName } from "../../shared-types/src/index.js";
import type { Queryable } from "./migrations.js";
import type {
  AvailabilityCheckExecutionResult,
  AvailabilityCheckMethod,
  AvailabilityCheckResultStatus
} from "./availability-check-executor.js";
import type {
  AvailabilityCheckDailyRollupRecord,
  AvailabilityCheckHealthStatus,
  AvailabilityIncidentStatus,
  AvailabilityCheckRecord
} from "./availability-check-store-types.js";

export function normalizeAvailabilityCheckPlan(plan: unknown): TierName {
  return plan === "solo" || plan === "team" ? plan : "free";
}

export function getPlanCheckLimit(plan: TierName): number {
  return getTierCapabilities(plan).availability_checks_per_project;
}

export function getPlanMonitoredProjectLimit(plan: TierName): number {
  return getTierCapabilities(plan).availability_monitored_projects_per_organization;
}

export function getPlanActiveCheckLimit(plan: TierName): number {
  return getTierCapabilities(plan).availability_active_checks_per_organization;
}

export function getPlanMinIntervalSeconds(plan: TierName): number {
  return getTierCapabilities(plan).availability_check_min_interval_seconds;
}

export function getPlanRecommendedFailureThreshold(plan: TierName): number {
  return getTierCapabilities(plan).availability_check_recommended_failure_threshold;
}

export function getEffectiveAvailabilityCheckIntervalSeconds(
  plan: TierName,
  configuredIntervalSeconds: number
): number {
  return Math.max(configuredIntervalSeconds, getPlanMinIntervalSeconds(plan));
}

const TIER_CAPABILITIES_SQL = {
  free_limit: getTierCapabilities("free").availability_checks_per_project,
  solo_limit: getTierCapabilities("solo").availability_checks_per_project,
  team_limit: getTierCapabilities("team").availability_checks_per_project,
  free_monitored_projects:
    getTierCapabilities("free").availability_monitored_projects_per_organization,
  solo_monitored_projects:
    getTierCapabilities("solo").availability_monitored_projects_per_organization,
  team_monitored_projects:
    getTierCapabilities("team").availability_monitored_projects_per_organization,
  free_active_checks: getTierCapabilities("free").availability_active_checks_per_organization,
  solo_active_checks: getTierCapabilities("solo").availability_active_checks_per_organization,
  team_active_checks: getTierCapabilities("team").availability_active_checks_per_organization,
  free_interval: getTierCapabilities("free").availability_check_min_interval_seconds,
  solo_interval: getTierCapabilities("solo").availability_check_min_interval_seconds,
  team_interval: getTierCapabilities("team").availability_check_min_interval_seconds
} as const;

export function buildPlanEligibilityCaseSql(
  kind: "limit" | "monitored_projects" | "active_checks" | "interval"
): string {
  if (kind === "limit") {
    return `
      CASE COALESCE(o.plan, 'free')
        WHEN 'solo' THEN ${TIER_CAPABILITIES_SQL.solo_limit}
        WHEN 'team' THEN ${TIER_CAPABILITIES_SQL.team_limit}
        ELSE ${TIER_CAPABILITIES_SQL.free_limit}
      END
    `;
  }

  if (kind === "monitored_projects") {
    return `
      CASE COALESCE(o.plan, 'free')
        WHEN 'solo' THEN ${TIER_CAPABILITIES_SQL.solo_monitored_projects}
        WHEN 'team' THEN ${TIER_CAPABILITIES_SQL.team_monitored_projects}
        ELSE ${TIER_CAPABILITIES_SQL.free_monitored_projects}
      END
    `;
  }

  if (kind === "active_checks") {
    return `
      CASE COALESCE(o.plan, 'free')
        WHEN 'solo' THEN ${TIER_CAPABILITIES_SQL.solo_active_checks}
        WHEN 'team' THEN ${TIER_CAPABILITIES_SQL.team_active_checks}
        ELSE ${TIER_CAPABILITIES_SQL.free_active_checks}
      END
    `;
  }

  return `
    CASE COALESCE(o.plan, 'free')
      WHEN 'solo' THEN ${TIER_CAPABILITIES_SQL.solo_interval}
      WHEN 'team' THEN ${TIER_CAPABILITIES_SQL.team_interval}
      ELSE ${TIER_CAPABILITIES_SQL.free_interval}
    END
  `;
}

function computeDisplayStatus(
  enabled: boolean,
  baseStatus: Exclude<AvailabilityCheckHealthStatus, "paused">,
  withinPlanLimit: boolean,
  withinMonitoredProjectLimit: boolean,
  withinOrganizationActiveLimit: boolean
): { status: AvailabilityCheckHealthStatus; paused_reason: string | null } {
  if (!enabled) {
    return { status: "paused", paused_reason: "disabled" };
  }
  if (!withinPlanLimit) {
    return { status: "paused", paused_reason: "plan_check_limit_exceeded" };
  }
  if (!withinMonitoredProjectLimit) {
    return { status: "paused", paused_reason: "plan_monitored_project_limit_exceeded" };
  }
  if (!withinOrganizationActiveLimit) {
    return { status: "paused", paused_reason: "plan_organization_check_limit_exceeded" };
  }
  return { status: baseStatus, paused_reason: null };
}

export function mapAvailabilityCheckRow(row: Record<string, unknown>): AvailabilityCheckRecord {
  const organizationPlan = normalizeAvailabilityCheckPlan(row["organization_plan"]);
  const display = computeDisplayStatus(
    Boolean(row["enabled"]),
    (row["base_status"] as Exclude<AvailabilityCheckHealthStatus, "paused">) ?? "unknown",
    Boolean(row["within_plan_limit"]),
    Boolean(row["within_monitored_project_limit"]),
    Boolean(row["within_organization_active_limit"])
  );
  const linkedIncidentStatus =
    row["linked_incident_status"] === "open" ||
    row["linked_incident_status"] === "resolved" ||
    row["linked_incident_status"] === "regressed"
      ? (row["linked_incident_status"] as AvailabilityIncidentStatus)
      : null;

  return {
    check_id: String(row["check_id"]),
    project_id: String(row["project_id"]),
    name: String(row["name"]),
    url: String(row["url"]),
    method: row["method"] as AvailabilityCheckMethod,
    expected_status_min: Number(row["expected_status_min"]),
    expected_status_max: Number(row["expected_status_max"]),
    timeout_ms: Number(row["timeout_ms"]),
    interval_seconds: getEffectiveAvailabilityCheckIntervalSeconds(
      organizationPlan,
      Number(row["interval_seconds"])
    ),
    failure_threshold: Number(row["failure_threshold"]),
    recovery_threshold: Number(row["recovery_threshold"]),
    environment: String(row["environment"]),
    service_name: typeof row["service_name"] === "string" ? row["service_name"] : null,
    enabled: Boolean(row["enabled"]),
    status: display.status,
    paused_reason: display.paused_reason,
    organization_plan: organizationPlan,
    consecutive_failures: Number(row["consecutive_failures"]),
    consecutive_successes: Number(row["consecutive_successes"]),
    linked_incident_id:
      typeof row["linked_incident_id"] === "string" ? row["linked_incident_id"] : null,
    linked_incident_status: linkedIncidentStatus,
    last_checked_at: typeof row["last_checked_at"] === "string" ? row["last_checked_at"] : null,
    next_check_at: typeof row["next_check_at"] === "string" ? row["next_check_at"] : null,
    last_result_status:
      typeof row["last_result_status"] === "string"
        ? (row["last_result_status"] as AvailabilityCheckResultStatus)
        : null,
    last_result_http_status:
      typeof row["last_result_http_status"] === "number" ? row["last_result_http_status"] : null,
    last_result_error_kind:
      typeof row["last_result_error_kind"] === "string" ? row["last_result_error_kind"] : null,
    last_result_error_message:
      typeof row["last_result_error_message"] === "string"
        ? row["last_result_error_message"]
        : null,
    last_result_duration_ms:
      typeof row["last_result_duration_ms"] === "number" ? row["last_result_duration_ms"] : null,
    created_at: String(row["created_at"]),
    updated_at: String(row["updated_at"])
  };
}

export function deriveAvailabilityCheckDailyState(
  result: AvailabilityCheckExecutionResult
): AvailabilityCheckDailyRollupRecord["state"] {
  if (result.status === "success") {
    return "operational";
  }

  return "degraded";
}

export function computeAvailabilityCheckNextScheduledAt(input: {
  completed_at: string;
  previous_scheduled_for: string;
  interval_seconds: number;
}): string {
  let nextAt = new Date(input.previous_scheduled_for).getTime();
  const completedAt = new Date(input.completed_at).getTime();
  const intervalMs = input.interval_seconds * 1000;

  do {
    nextAt += intervalMs;
  } while (nextAt <= completedAt);

  return new Date(nextAt).toISOString();
}

export function availabilityCheckDayBucket(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

export async function projectExistsForAvailabilityChecks(
  db: Queryable,
  input: {
    organization_id: string;
    project_id: string;
    lock_project?: boolean;
  }
): Promise<{ environment_default: string; organization_plan: TierName } | null> {
  const result = await db.query<Record<string, unknown>>(
    `
      SELECT
        p.environment_default,
        COALESCE(o.plan, 'free') AS organization_plan
      FROM projects p
      JOIN organizations o ON o.id = p.organization_id
      WHERE p.id = $1::uuid
        AND p.organization_id = $2::uuid
      LIMIT 1
      ${input.lock_project === true ? "FOR UPDATE OF p, o" : ""}
    `,
    [input.project_id, input.organization_id]
  );

  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }

  const environmentDefault = row["environment_default"];

  return {
    environment_default: typeof environmentDefault === "string" ? environmentDefault : "production",
    organization_plan: normalizeAvailabilityCheckPlan(row["organization_plan"])
  };
}

export async function hasAvailabilityActivationCapacity(
  db: Queryable,
  input: {
    organization_id: string;
    project_id: string;
    plan: TierName;
  }
): Promise<boolean> {
  const result = await db.query<Record<string, unknown>>(
    `
      SELECT
        COUNT(*) FILTER (WHERE c.enabled = true)::text AS active_check_count,
        COUNT(DISTINCT c.project_id) FILTER (WHERE c.enabled = true)::text
          AS monitored_project_count,
        COALESCE(BOOL_OR(c.enabled = true AND c.project_id = $2::uuid), false)
          AS project_is_monitored
      FROM availability_checks c
      JOIN projects p ON p.id = c.project_id
      WHERE p.organization_id = $1::uuid
        AND c.deleted_at IS NULL
    `,
    [input.organization_id, input.project_id]
  );

  const row = result.rows[0] ?? {};
  const activeCheckCount = Number(row["active_check_count"] ?? "0");
  const monitoredProjectCount = Number(row["monitored_project_count"] ?? "0");
  const projectIsMonitored = Boolean(row["project_is_monitored"]);

  return (
    activeCheckCount < getPlanActiveCheckLimit(input.plan) &&
    (projectIsMonitored || monitoredProjectCount < getPlanMonitoredProjectLimit(input.plan))
  );
}
