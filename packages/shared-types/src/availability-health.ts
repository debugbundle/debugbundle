import {
  computeAvailabilityUptimePercentage,
  formatAvailabilityUptime
} from "./availability-metrics.js";
export interface StatusProject {
  project_id: string;
  name: string;
}
export interface StatusCheck {
  check_id: string;
  status: "passing" | "failing" | "paused" | "unknown";
  failure_threshold: number;
  linked_incident_id: string | null;
  linked_incident_status?: "open" | "resolved" | "regressed" | null;
}
export interface StatusRollup {
  day: string;
  state: "unknown" | "operational" | "degraded" | "down" | "paused";
  total_checks: number;
  successful_checks: number;
  failed_checks: number;
  degraded_checks: number;
  downtime_seconds: number;
  incident_ids: string[];
}
export type HealthStatusDayState = StatusRollup["state"];
export type HealthStatusImpact = "none" | "minor" | "elevated" | "outage";

export interface HealthStatusDay {
  day: string;
  state: HealthStatusDayState;
  impact: HealthStatusImpact;
  total_checks: number;
  successful_checks: number;
  failed_checks: number;
  degraded_checks: number;
  downtime_seconds: number;
  incident_ids: string[];
}

export interface HealthStatusCheckSummary<TCheck extends StatusCheck = StatusCheck> {
  check: TCheck;
  days: HealthStatusDay[];
  uptime_percentage: number | null;
}

export interface HealthStatusProjectSummary<
  TProject extends StatusProject = StatusProject,
  TCheck extends StatusCheck = StatusCheck
> {
  project: TProject;
  checks: HealthStatusCheckSummary<TCheck>[];
  days: HealthStatusDay[];
  current_state: HealthStatusDayState;
  uptime_percentage: number | null;
  active_incident_count: number;
}

export interface ProjectHealthStatusInput<
  TProject extends StatusProject = StatusProject,
  TCheck extends StatusCheck = StatusCheck
> {
  project: TProject;
  checks: TCheck[];
  rollupsByCheckId: Map<string, StatusRollup[]>;
}

export function buildHealthStatusDayRange(now = new Date(), days = 30): string[] {
  const safeDays = Math.max(1, Math.min(days, 30));
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return Array.from({ length: safeDays }, (_, index) => {
    const dayMs = end - (safeDays - 1 - index) * 86_400_000;
    return new Date(dayMs).toISOString().slice(0, 10);
  });
}

export function buildHealthStatusProjects<
  TProject extends StatusProject,
  TCheck extends StatusCheck
>(
  input: ProjectHealthStatusInput<TProject, TCheck>[],
  dayRange: string[]
): HealthStatusProjectSummary<TProject, TCheck>[] {
  return input
    .map((projectInput) => {
      const checks = projectInput.checks.map((check) => {
        const rollups = projectInput.rollupsByCheckId.get(check.check_id) ?? [];
        const days = buildCheckDays(dayRange, rollups, check.failure_threshold);

        return {
          check,
          days,
          uptime_percentage: computeUptimePercentage(days)
        };
      });

      return {
        project: projectInput.project,
        checks,
        days: mergeProjectDays(dayRange, checks),
        current_state: deriveProjectCurrentState(checks.map((summary) => summary.check.status)),
        uptime_percentage: computeUptimePercentage(checks.flatMap((summary) => summary.days)),
        active_incident_count: countActiveAvailabilityIncidents(checks)
      };
    })
    .filter((summary) => summary.checks.length > 0)
    .sort(sortStatusProjects);
}

export function formatStatusUptime(value: number | null): string {
  return formatAvailabilityUptime(value);
}

export function formatHealthStatusLabel(state: HealthStatusDayState): string {
  switch (state) {
    case "operational":
      return "Operational";
    case "degraded":
      return "Degraded";
    case "down":
      return "Down";
    case "paused":
      return "Paused";
    case "unknown":
      return "Unknown";
  }
}

export function formatHealthDayStatusLabel(day: Pick<HealthStatusDay, "impact" | "state">): string {
  switch (day.impact) {
    case "outage":
      return "Down";
    case "elevated":
      return "Unstable";
    case "minor":
      return "Brief interruption";
    case "none":
      return formatHealthStatusLabel(day.state);
  }
}

export function formatStatusDayLabel(
  day: Omit<HealthStatusDay, "incident_ids" | "successful_checks" | "degraded_checks">,
  scope: "check" | "project" = "check"
): string {
  const formattedDay = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${day.day}T00:00:00.000Z`));

  if (day.total_checks === 0) {
    return `${formattedDay}: ${formatHealthStatusLabel(day.state).toLowerCase()}, no checks recorded`;
  }

  const downtimeLabel = scope === "project" ? "total check downtime" : "downtime";
  return `${formattedDay}: ${formatHealthDayStatusLabel(day).toLowerCase()}, ${day.failed_checks} failed of ${day.total_checks} checks, ${formatDowntime(day.downtime_seconds)} ${downtimeLabel}`;
}

export function formatDowntime(seconds: number): string {
  if (seconds <= 0) {
    return "no recorded";
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [
    hours > 0 ? `${hours}h` : null,
    minutes > 0 ? `${minutes}m` : null,
    remainingSeconds > 0 ? `${remainingSeconds}s` : null
  ]
    .filter((part) => part !== null)
    .join(" ");
}

export function buildCheckDays(
  dayRange: string[],
  rollups: StatusRollup[],
  failureThreshold: number
): HealthStatusDay[] {
  const rollupsByDay = new Map(rollups.map((rollup) => [rollup.day, rollup]));

  return dayRange.map((day) => {
    const rollup = rollupsByDay.get(day);
    if (rollup === undefined) {
      return emptyStatusDay(day);
    }

    return {
      day,
      state: rollup.state,
      impact: deriveHealthStatusImpact(rollup, failureThreshold),
      total_checks: rollup.total_checks,
      successful_checks: rollup.successful_checks,
      failed_checks: rollup.failed_checks,
      degraded_checks: rollup.degraded_checks,
      downtime_seconds: rollup.downtime_seconds,
      incident_ids: rollup.incident_ids
    };
  });
}

export function mergeProjectDays(
  dayRange: string[],
  checks: HealthStatusCheckSummary[]
): HealthStatusDay[] {
  return dayRange.map((day, index) => {
    const checkDays = checks.map((summary) => summary.days[index] ?? emptyStatusDay(day));
    const incidentIds = new Set<string>();

    for (const checkDay of checkDays) {
      for (const incidentId of checkDay.incident_ids) {
        incidentIds.add(incidentId);
      }
    }

    return {
      day,
      state: deriveAggregateDayState(checkDays.map((checkDay) => checkDay.state)),
      impact: deriveAggregateImpact(checkDays.map((checkDay) => checkDay.impact)),
      total_checks: sum(checkDays, (checkDay) => checkDay.total_checks),
      successful_checks: sum(checkDays, (checkDay) => checkDay.successful_checks),
      failed_checks: sum(checkDays, (checkDay) => checkDay.failed_checks),
      degraded_checks: sum(checkDays, (checkDay) => checkDay.degraded_checks),
      downtime_seconds: sum(checkDays, (checkDay) => checkDay.downtime_seconds),
      incident_ids: Array.from(incidentIds)
    };
  });
}

export function deriveProjectCurrentState(statuses: StatusCheck["status"][]): HealthStatusDayState {
  if (statuses.includes("failing")) {
    return "down";
  }
  if (statuses.includes("passing")) {
    return "operational";
  }
  if (statuses.includes("paused")) {
    return "paused";
  }
  return "unknown";
}

export function deriveHealthStatusImpact(
  day: Pick<
    HealthStatusDay,
    "state" | "failed_checks" | "degraded_checks" | "incident_ids" | "downtime_seconds"
  >,
  failureThreshold: number
): HealthStatusImpact {
  // Older continuation days can lack an incident reference despite substantial downtime.
  if (
    day.state === "down" ||
    day.incident_ids.length > 0 ||
    (day.failed_checks > 0 && day.downtime_seconds >= 3600)
  ) {
    return "outage";
  }

  if (day.failed_checks > 0 || day.degraded_checks > 0 || day.state === "degraded") {
    return day.failed_checks >= failureThreshold ? "elevated" : "minor";
  }

  return "none";
}

function deriveAggregateDayState(states: HealthStatusDayState[]): HealthStatusDayState {
  if (states.includes("down")) {
    return "down";
  }
  if (states.includes("degraded")) {
    return "degraded";
  }
  if (states.includes("operational")) {
    return "operational";
  }
  if (states.includes("paused")) {
    return "paused";
  }
  return "unknown";
}

function deriveAggregateImpact(impacts: HealthStatusImpact[]): HealthStatusImpact {
  return impacts.reduce<HealthStatusImpact>(
    (highest, impact) => (impactRank(impact) > impactRank(highest) ? impact : highest),
    "none"
  );
}

function countActiveAvailabilityIncidents(checks: HealthStatusCheckSummary[]): number {
  const incidentIds = new Set<string>();
  for (const summary of checks) {
    const linkedIncidentId = summary.check.linked_incident_id;
    const linkedIncidentStatus = summary.check.linked_incident_status;
    const hasActiveLinkedIncident =
      linkedIncidentId !== null &&
      (linkedIncidentStatus === "open" ||
        linkedIncidentStatus === "regressed" ||
        (linkedIncidentStatus == null && summary.check.status === "failing"));
    if (hasActiveLinkedIncident) {
      incidentIds.add(linkedIncidentId);
    }
  }
  return incidentIds.size;
}

function computeUptimePercentage(days: HealthStatusDay[]): number | null {
  return computeAvailabilityUptimePercentage(days);
}

function emptyStatusDay(day: string): HealthStatusDay {
  return {
    day,
    state: "unknown",
    impact: "none",
    total_checks: 0,
    successful_checks: 0,
    failed_checks: 0,
    degraded_checks: 0,
    downtime_seconds: 0,
    incident_ids: []
  };
}

function sortStatusProjects(
  left: HealthStatusProjectSummary,
  right: HealthStatusProjectSummary
): number {
  const stateDelta = stateRank(right.current_state) - stateRank(left.current_state);
  if (stateDelta !== 0) {
    return stateDelta;
  }

  return left.project.name.localeCompare(right.project.name);
}

function impactRank(impact: HealthStatusImpact): number {
  switch (impact) {
    case "outage":
      return 3;
    case "elevated":
      return 2;
    case "minor":
      return 1;
    case "none":
      return 0;
  }
}

function stateRank(state: HealthStatusDayState): number {
  switch (state) {
    case "down":
      return 4;
    case "degraded":
      return 3;
    case "unknown":
      return 2;
    case "paused":
      return 1;
    case "operational":
      return 0;
  }
}

function sum<TItem>(items: TItem[], read: (item: TItem) => number): number {
  return items.reduce((total, item) => total + read(item), 0);
}
