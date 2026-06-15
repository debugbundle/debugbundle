import type { TierName } from "../../shared-types/src/index.js";
import type {
  AvailabilityCheckDefinition,
  AvailabilityCheckExecutionResult,
  AvailabilityCheckMethod,
  AvailabilityCheckResultStatus
} from "./availability-check-executor.js";

export type AvailabilityCheckHealthStatus = "unknown" | "passing" | "failing" | "paused";

export interface AvailabilityCheckRecord extends AvailabilityCheckDefinition {
  check_id: string;
  project_id: string;
  name: string;
  interval_seconds: number;
  failure_threshold: number;
  recovery_threshold: number;
  environment: string;
  service_name: string | null;
  enabled: boolean;
  status: AvailabilityCheckHealthStatus;
  paused_reason: string | null;
  organization_plan: TierName;
  consecutive_failures: number;
  consecutive_successes: number;
  linked_incident_id: string | null;
  last_checked_at: string | null;
  next_check_at: string | null;
  last_result_status: AvailabilityCheckResultStatus | null;
  last_result_http_status: number | null;
  last_result_error_kind: string | null;
  last_result_error_message: string | null;
  last_result_duration_ms: number | null;
  created_at: string;
  updated_at: string;
}

export interface AvailabilityCheckResultRecord {
  result_id: string;
  check_id: string;
  project_id: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  status: AvailabilityCheckResultStatus;
  http_status: number | null;
  error_kind: string | null;
  error_message: string | null;
  redirect_count: number;
  checked_url_host: string;
  final_url: string;
}

export interface AvailabilityCheckDailyRollupRecord {
  check_id: string;
  project_id: string;
  day: string;
  state: "unknown" | "operational" | "degraded" | "down" | "paused";
  total_checks: number;
  successful_checks: number;
  failed_checks: number;
  degraded_checks: number;
  avg_duration_ms: number | null;
  first_checked_at: string | null;
  last_checked_at: string | null;
  downtime_seconds: number;
  incident_ids: string[];
}

export interface ClaimedAvailabilityCheck extends AvailabilityCheckDefinition {
  check_id: string;
  project_id: string;
  organization_id: string;
  owner_user_id: string;
  organization_plan: TierName;
  name: string;
  interval_seconds: number;
  environment: string;
  service_name: string | null;
  due_at: string;
  claimed_at: string;
  linked_incident_id: string | null;
  prior_status: Exclude<AvailabilityCheckHealthStatus, "paused">;
  consecutive_failures: number;
  consecutive_successes: number;
  failure_threshold: number;
  recovery_threshold: number;
}

export interface RecordedAvailabilityCheckExecution {
  check: ClaimedAvailabilityCheck;
  result: AvailabilityCheckExecutionResult & {
    result_id: string;
    started_at: string;
    completed_at: string;
  };
  next_status: Exclude<AvailabilityCheckHealthStatus, "paused">;
  emit_failure_event: boolean;
  resolve_incident_id: string | null;
}

export interface AvailabilityCheckStore {
  listChecksForProjectInOrganization(input: {
    organization_id: string;
    project_id: string;
    limit: number;
  }): Promise<AvailabilityCheckRecord[] | null>;
  getCheckForProjectInOrganization(input: {
    organization_id: string;
    project_id: string;
    check_id: string;
  }): Promise<AvailabilityCheckRecord | null>;
  createCheckForProjectInOrganization(input: {
    organization_id: string;
    project_id: string;
    created_by_user_id: string;
    name: string;
    url: string;
    method: AvailabilityCheckMethod;
    expected_status_min: number;
    expected_status_max: number;
    timeout_ms: number;
    interval_seconds: number;
    failure_threshold: number;
    recovery_threshold: number;
    environment?: string | null;
    service_name?: string | null;
    enabled: boolean;
    now: string;
  }): Promise<AvailabilityCheckRecord | "project_not_found" | "limit_reached" | "interval_too_low">;
  updateCheckForProjectInOrganization(input: {
    organization_id: string;
    project_id: string;
    check_id: string;
    name?: string;
    url?: string;
    method?: AvailabilityCheckMethod;
    expected_status_min?: number;
    expected_status_max?: number;
    timeout_ms?: number;
    interval_seconds?: number;
    failure_threshold?: number;
    recovery_threshold?: number;
    environment?: string | null;
    service_name?: string | null;
    enabled?: boolean;
    now: string;
  }): Promise<AvailabilityCheckRecord | "check_not_found" | "interval_too_low">;
  deleteCheckForProjectInOrganization(input: {
    organization_id: string;
    project_id: string;
    check_id: string;
    deleted_at: string;
  }): Promise<boolean>;
  listResultsForCheckInOrganization(input: {
    organization_id: string;
    project_id: string;
    check_id: string;
    limit: number;
  }): Promise<AvailabilityCheckResultRecord[] | null>;
  listDailyRollupsForCheckInOrganization(input: {
    organization_id: string;
    project_id: string;
    check_id: string;
    limit: number;
  }): Promise<AvailabilityCheckDailyRollupRecord[] | null>;
  claimNextDueCheck(input: {
    now: string;
    claim_timeout_before: string;
  }): Promise<ClaimedAvailabilityCheck | null>;
  recordCheckExecution(input: {
    check_id: string;
    claimed_at: string;
    started_at: string;
    completed_at: string;
    scheduled_for: string;
    result: AvailabilityCheckExecutionResult;
  }): Promise<RecordedAvailabilityCheckExecution | null>;
  linkIncidentToCheck(input: {
    check_id: string;
    incident_id: string;
    linked_at: string;
  }): Promise<void>;
  appendIncidentToDailyRollup(input: {
    check_id: string;
    project_id: string;
    day: string;
    incident_id: string;
  }): Promise<void>;
  purgeExpiredResults(input: { now: string }): Promise<number>;
  purgeExpiredDailyRollups(input: { now: string }): Promise<number>;
}
