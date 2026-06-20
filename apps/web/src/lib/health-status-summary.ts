import type { AvailabilityCheckDailyRollupRecord, AvailabilityCheckRecord } from "./api.js";
import { computeAvailabilityUptimePercentage, formatAvailabilityUptime } from "./health-status-metrics.js";

export type HealthStatusTodayState = "not_set" | "down" | "operational" | "paused" | "unknown";

export interface HealthStatusTodaySummary {
  state: HealthStatusTodayState;
  value: string;
  description: string;
}

export function summarizeHealthStatusToday(
  checks: AvailabilityCheckRecord[],
  rollupsByCheckId: Map<string, AvailabilityCheckDailyRollupRecord[]>,
  scope: "workspace" | "project"
): HealthStatusTodaySummary {
  const suffix = scope === "workspace" ? "across all projects" : "in this project";

  if (checks.length === 0) {
    return {
      state: "not_set",
      value: "Not set",
      description: "No health checks configured"
    };
  }

  const failing = countChecks(checks, "failing");
  if (failing > 0) {
    return {
      state: "down",
      value: formatHealthStatusUptime(checks, rollupsByCheckId),
      description: `${formatCount(failing, "check")} failing ${suffix}`
    };
  }

  const passing = countChecks(checks, "passing");
  if (passing > 0) {
    return {
      state: "operational",
      value: formatHealthStatusUptime(checks, rollupsByCheckId),
      description: `${formatCount(passing, "check")} passing ${suffix}`
    };
  }

  const paused = countChecks(checks, "paused");
  if (paused === checks.length) {
    return {
      state: "paused",
      value: "Paused",
      description: `${formatCount(paused, "check")} paused ${suffix}`
    };
  }

  return {
    state: "unknown",
    value: "No data",
    description: `${formatCount(checks.length, "check")} waiting for first result ${suffix}`
  };
}

function countChecks(checks: AvailabilityCheckRecord[], status: AvailabilityCheckRecord["status"]): number {
  return checks.filter((check) => check.status === status).length;
}

function formatCount(count: number, singular: string): string {
  return `${count.toLocaleString()} ${singular}${count === 1 ? "" : "s"}`;
}

function formatHealthStatusUptime(
  checks: AvailabilityCheckRecord[],
  rollupsByCheckId: Map<string, AvailabilityCheckDailyRollupRecord[]>
): string {
  const uptimePercentage = computeAvailabilityUptimePercentage(
    checks.flatMap((check) => rollupsByCheckId.get(check.check_id) ?? [])
  );
  return formatAvailabilityUptime(uptimePercentage);
}
