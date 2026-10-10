import { sanitizeTelemetry } from "../../redaction/src/index.js";
import {
  PublicStatusPageSchema,
  type PublicStatusPage,
  type PublicStatusProject
} from "../../shared-types/src/public-status.js";
import {
  buildCheckDays,
  buildHealthStatusDayRange,
  deriveProjectCurrentState,
  mergeProjectDays,
  type HealthStatusDay,
  type StatusRollup
} from "../../shared-types/src/availability-health.js";
import { computeAvailabilityUptimePercentage } from "../../shared-types/src/availability-metrics.js";

export type PublicStatusSource = {
  project_id: string;
  name: string;
  checks: Array<{
    check_id: string;
    name: string;
    status: "unknown" | "passing" | "failing" | "paused";
    interval_seconds: number;
    failure_threshold: number;
    rollups: Array<StatusRollup & { last_checked_at: string | null }>;
  }>;
};
export function sanitizePublicStatusText(value: string): string {
  const result = sanitizeTelemetry(value);
  return result.ok && typeof result.value === "string" ? result.value.slice(0, 120) : "[REDACTED]";
}
function publicDay(day: HealthStatusDay): PublicStatusProject["days"][number] {
  return {
    day: day.day,
    state: day.state,
    impact: day.impact,
    total_checks: day.total_checks,
    successful_checks: day.successful_checks,
    failed_checks: day.failed_checks,
    degraded_checks: day.degraded_checks,
    downtime_seconds: day.downtime_seconds
  };
}
// This projection is also used by owner previews. Raw records never reach anonymous clients.
export function projectPublicStatus(
  title: string,
  source: PublicStatusSource[],
  now: Date
): PublicStatusPage {
  const dayRange = buildHealthStatusDayRange(now);
  const projects = source
    .filter((p) => p.checks.length > 0)
    .map((p, index) => {
      const internal = p.checks.map((check) => {
        const retained = check.rollups.filter((day) => dayRange.includes(day.day));
        const latest =
          retained
            .map((r) => r.last_checked_at)
            .filter((t): t is string => t !== null)
            .sort()
            .at(-1) ?? null;
        const stale =
          latest === null || now.getTime() - Date.parse(latest) > check.interval_seconds * 3000;
        const status: PublicStatusSource["checks"][number]["status"] =
          check.status === "paused" ? "paused" : stale ? "unknown" : check.status;
        const days = buildCheckDays(dayRange, retained, check.failure_threshold);
        return {
          check: { ...check, status, linked_incident_id: null },
          days,
          uptime_percentage: computeAvailabilityUptimePercentage(days),
          latest
        };
      });
      const statuses = internal.map((c) => c.check.status);
      const current_state = statuses.includes("failing")
        ? "down"
        : statuses.includes("unknown")
          ? "unknown"
          : statuses.includes("paused")
            ? "paused"
            : deriveProjectCurrentState(statuses);
      return {
        key: `project-${index}`,
        name: sanitizePublicStatusText(p.name),
        current_state,
        days: mergeProjectDays(dayRange, internal).map(publicDay),
        uptime_percentage: computeAvailabilityUptimePercentage(internal.flatMap((c) => c.days)),
        last_verified_at:
          internal
            .map((c) => c.latest)
            .filter((t): t is string => t !== null)
            .sort()
            .at(-1) ?? null,
        checks: internal.map((c, i) => ({
          key: `check-${index}-${i}`,
          name: sanitizePublicStatusText(c.check.name),
          current_state: deriveProjectCurrentState([c.check.status]),
          uptime_percentage: c.uptime_percentage,
          last_verified_at: c.latest,
          days: c.days.map(publicDay)
        }))
      };
    });
  return PublicStatusPageSchema.parse({ title: sanitizePublicStatusText(title), projects });
}
