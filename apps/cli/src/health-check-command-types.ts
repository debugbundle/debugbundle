export type HealthCheckHttpRequest = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  bearerToken: string;
  body?: unknown;
};

export type HealthCheckHttpResponse = {
  status: number;
  body: unknown;
};

export type AvailabilityCheckMethod = "GET" | "HEAD";

export type AvailabilityCheckHealthStatus = "unknown" | "passing" | "failing" | "paused";

export type AvailabilityCheckResultStatus =
  | "success"
  | "http_status_mismatch"
  | "timeout"
  | "dns_error"
  | "tls_error"
  | "connection_error"
  | "redirect_blocked"
  | "security_blocked"
  | "internal_error";

export interface AvailabilityCheckLimits {
  max_checks_per_project: number;
  min_interval_seconds: number;
}

export interface AvailabilityCheckRecord {
  check_id: string;
  project_id: string;
  name: string;
  url: string;
  method: AvailabilityCheckMethod;
  expected_status_min: number;
  expected_status_max: number;
  timeout_ms: number;
  interval_seconds: number;
  failure_threshold: number;
  recovery_threshold: number;
  environment: string;
  service_name: string | null;
  enabled: boolean;
  status: AvailabilityCheckHealthStatus;
  paused_reason: string | null;
  organization_plan: "free" | "solo" | "team";
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

export interface AvailabilityCheckTestResult {
  normalized_url: string;
  result: {
    status: AvailabilityCheckResultStatus;
    http_status: number | null;
    duration_ms: number;
    error_kind: string | null;
    error_message: string | null;
    checked_url_host: string;
    checked_url_path: string;
    checked_url_query: Record<string, string>;
    final_url: string;
    redirect_count: number;
  };
}

export type CreateHealthCheckInput = {
  bearerToken: string;
  projectId: string;
  name: string;
  url: string;
  method: AvailabilityCheckMethod;
  expectedStatusMin: number;
  expectedStatusMax: number;
  timeoutMs: number;
  intervalSeconds: number;
  failureThreshold: number;
  recoveryThreshold: number;
  environment?: string;
  serviceName?: string | null;
  enabled: boolean;
  json?: boolean;
};

export type UpdateHealthCheckInput = {
  bearerToken: string;
  projectId: string;
  checkId: string;
  name?: string;
  url?: string;
  method?: AvailabilityCheckMethod;
  expectedStatusMin?: number;
  expectedStatusMax?: number;
  timeoutMs?: number;
  intervalSeconds?: number;
  failureThreshold?: number;
  recoveryThreshold?: number;
  environment?: string;
  serviceName?: string | null;
  enabled?: boolean;
  json?: boolean;
};

export type TestHealthCheckInput = {
  bearerToken: string;
  projectId: string;
  url: string;
  method: AvailabilityCheckMethod;
  expectedStatusMin: number;
  expectedStatusMax: number;
  timeoutMs: number;
  json?: boolean;
};
