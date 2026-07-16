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

export function getPlanMinIntervalSeconds(plan: TierName): number {
  return getTierCapabilities(plan).availability_check_min_interval_seconds;
}

const TIER_CAPABILITIES_SQL = {
  free_limit: getTierCapabilities("free").availability_checks_per_project,
  solo_limit: getTierCapabilities("solo").availability_checks_per_project,
  team_limit: getTierCapabilities("team").availability_checks_per_project,
  free_interval: getTierCapabilities("free").availability_check_min_interval_seconds,
  solo_interval: getTierCapabilities("solo").availability_check_min_interval_seconds,
  team_interval: getTierCapabilities("team").availability_check_min_interval_seconds
} as const;

export function buildPlanEligibilityCaseSql(kind: "limit" | "interval"): string {
  if (kind === "limit") {
    return `
      CASE COALESCE(o.plan, 'free')
        WHEN 'solo' THEN ${TIER_CAPABILITIES_SQL.solo_limit}
        WHEN 'team' THEN ${TIER_CAPABILITIES_SQL.team_limit}
        ELSE ${TIER_CAPABILITIES_SQL.free_limit}
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
  meetsPlanInterval: boolean
): { status: AvailabilityCheckHealthStatus; paused_reason: string | null } {
  if (!enabled) {
    return { status: "paused", paused_reason: "disabled" };
  }
  if (!withinPlanLimit) {
    return { status: "paused", paused_reason: "plan_check_limit_exceeded" };
  }
  if (!meetsPlanInterval) {
    return { status: "paused", paused_reason: "plan_interval_too_low" };
  }
  return { status: baseStatus, paused_reason: null };
}

export function mapAvailabilityCheckRow(row: Record<string, unknown>): AvailabilityCheckRecord {
  const display = computeDisplayStatus(
    Boolean(row["enabled"]),
    (row["base_status"] as Exclude<AvailabilityCheckHealthStatus, "paused">) ?? "unknown",
    Boolean(row["within_plan_limit"]),
    Boolean(row["meets_plan_interval"])
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
    interval_seconds: Number(row["interval_seconds"]),
    failure_threshold: Number(row["failure_threshold"]),
    recovery_threshold: Number(row["recovery_threshold"]),
    environment: String(row["environment"]),
    service_name: typeof row["service_name"] === "string" ? row["service_name"] : null,
    enabled: Boolean(row["enabled"]),
    status: display.status,
    paused_reason: display.paused_reason,
    organization_plan: normalizeAvailabilityCheckPlan(row["organization_plan"]),
    consecutive_failures: Number(row["consecutive_failures"]),
    consecutive_successes: Number(row["consecutive_successes"]),
    linked_incident_id: typeof row["linked_incident_id"] === "string" ? row["linked_incident_id"] : null,
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
      typeof row["last_result_error_message"] === "string" ? row["last_result_error_message"] : null,
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
      ${input.lock_project === true ? "FOR UPDATE OF p" : ""}
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
