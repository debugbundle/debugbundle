import {
  isInvalidSessionError,
  type AvailabilityCheckLimits,
  type AvailabilityCheckDailyRollupRecord,
  type AvailabilityCheckRecord,
  type AvailabilityCheckResultRecord
} from "../lib/api.js";

export interface AvailabilityCheckFormState {
  name: string;
  url: string;
  method: "GET" | "HEAD";
  expected_status_min: string;
  expected_status_max: string;
  timeout_ms: string;
  interval_seconds: string;
  failure_threshold: string;
  recovery_threshold: string;
  environment: string;
  service_name: string;
  enabled: boolean;
}

const DEFAULT_NEW_CHECK_INTERVAL_SECONDS = 60;

export function getDefaultAvailabilityCheckIntervalSeconds(
  limits: AvailabilityCheckLimits | null
): number {
  return Math.max(limits?.min_interval_seconds ?? 300, DEFAULT_NEW_CHECK_INTERVAL_SECONDS);
}

export function buildCheckDraft(formState: AvailabilityCheckFormState):
  | {
      name: string;
      url: string;
      method: "GET" | "HEAD";
      expected_status_min: number;
      expected_status_max: number;
      timeout_ms: number;
      interval_seconds: number;
      failure_threshold: number;
      recovery_threshold: number;
      environment?: string;
      service_name?: string | null;
      enabled: boolean;
    }
  | null {
  if (formState.name.trim() === "" || formState.url.trim() === "") {
    return null;
  }

  const expectedStatusMin = Number.parseInt(formState.expected_status_min, 10);
  const expectedStatusMax = Number.parseInt(formState.expected_status_max, 10);
  const timeoutMs = Number.parseInt(formState.timeout_ms, 10);
  const intervalSeconds = Number.parseInt(formState.interval_seconds, 10);
  const failureThreshold = Number.parseInt(formState.failure_threshold, 10);
  const recoveryThreshold = Number.parseInt(formState.recovery_threshold, 10);

  if (
    [expectedStatusMin, expectedStatusMax, timeoutMs, intervalSeconds, failureThreshold, recoveryThreshold].some(
      (value) => !Number.isFinite(value)
    ) ||
    expectedStatusMin > expectedStatusMax
  ) {
    return null;
  }

  return {
    name: formState.name.trim(),
    url: formState.url.trim(),
    method: formState.method,
    expected_status_min: expectedStatusMin,
    expected_status_max: expectedStatusMax,
    timeout_ms: timeoutMs,
    interval_seconds: intervalSeconds,
    failure_threshold: failureThreshold,
    recovery_threshold: recoveryThreshold,
    enabled: formState.enabled,
    ...(formState.environment.trim() === "" ? {} : { environment: formState.environment.trim() }),
    ...(formState.service_name.trim() === "" ? { service_name: null } : { service_name: formState.service_name.trim() })
  };
}

export function availabilityStatusVariant(
  status: AvailabilityCheckRecord["status"]
): "outline" | "success" | "warning" | "destructive" {
  if (status === "passing") {
    return "success";
  }
  if (status === "paused") {
    return "warning";
  }
  if (status === "failing") {
    return "destructive";
  }
  return "outline";
}

export function availabilityResultVariant(
  status: AvailabilityCheckResultRecord["status"]
): "success" | "warning" | "destructive" {
  if (status === "success") {
    return "success";
  }
  if (status === "http_status_mismatch") {
    return "warning";
  }
  return "destructive";
}

export function dailyStateVariant(
  state: AvailabilityCheckDailyRollupRecord["state"]
): "outline" | "success" | "warning" | "destructive" {
  if (state === "operational") {
    return "success";
  }
  if (state === "degraded" || state === "paused") {
    return "warning";
  }
  if (state === "down") {
    return "destructive";
  }
  return "outline";
}

export function formatAvailabilityStatus(status: AvailabilityCheckRecord["status"]): string {
  return status === "unknown" ? "Unknown" : status === "passing" ? "Passing" : status === "failing" ? "Failing" : "Paused";
}

export function formatPausedReason(reason: string): string {
  if (reason === "disabled") {
    return "Disabled";
  }
  if (reason === "plan_check_limit_exceeded") {
    return "Over plan check limit";
  }
  if (reason === "plan_interval_too_low") {
    return "Interval below plan minimum";
  }
  return reason;
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatDay(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export function formatDowntime(seconds: number): string {
  if (seconds <= 0) {
    return "No recorded downtime";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

export function getAvailabilityErrorMessage(error: unknown): string {
  if (isInvalidSessionError(error)) {
    return "Your session expired. Refresh the page and sign in again.";
  }

  if (error instanceof Error) {
    switch (error.message) {
      case "availability_check_limit_reached":
        return "This project already uses the maximum number of health checks allowed by the current plan.";
      case "availability_check_interval_too_low":
        return "The polling interval is lower than the minimum allowed by the current plan.";
      case "invalid_check_target":
        return "The check URL must be a safe public HTTP or HTTPS endpoint reachable from outside your network.";
      case "forbidden":
        return "Only project owners and admins can manage health checks.";
      default:
        return "Could not complete the health-check request.";
    }
  }

  return "Could not complete the health-check request.";
}
