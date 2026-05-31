import { formatEmailDate } from "./email-layout.js";

export interface WeeklyReportPreheaderProject {
  projectName: string;
  bundleCounts: {
    failure: number;
    improvement: number;
  };
  newIncidents: number;
  resolvedIncidents: number;
  regressions: number;
}

export interface AlertPreheaderInput {
  conditionLabel: string;
  environment: string;
  occurredAt: string;
  projectName?: string | null | undefined;
  serviceName: string;
  severity: string;
}

export interface AlertDigestPreheaderEntry {
  environment: string;
  incidentId: string;
  projectName?: string | null | undefined;
  serviceName: string;
  severity: string;
  summary: string | null;
}

export function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function titleCase(value: string): string {
  if (value.length === 0) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatWeeklyReportPreheader(
  projects: WeeklyReportPreheaderProject[],
  formattedWindow: string
): string {
  if (projects.length === 0) {
    return `No project activity was reported for ${formattedWindow}.`;
  }

  const totals = projects.reduce(
    (accumulator, project) => ({
      failureBundles: accumulator.failureBundles + project.bundleCounts.failure,
      improvementBundles: accumulator.improvementBundles + project.bundleCounts.improvement,
      newIncidents: accumulator.newIncidents + project.newIncidents,
      resolvedIncidents: accumulator.resolvedIncidents + project.resolvedIncidents,
      regressions: accumulator.regressions + project.regressions
    }),
    {
      failureBundles: 0,
      improvementBundles: 0,
      newIncidents: 0,
      resolvedIncidents: 0,
      regressions: 0
    }
  );
  const activity = [
    formatCount(totals.newIncidents, "new incident"),
    formatCount(totals.resolvedIncidents, "resolved incident"),
    formatCount(totals.failureBundles, "failure bundle"),
    formatCount(totals.improvementBundles, "improvement bundle"),
    ...(totals.regressions === 0 ? [] : [formatCount(totals.regressions, "regression")])
  ].join(", ");

  if (projects.length === 1) {
    return `${projects[0]!.projectName}: ${activity} for ${formattedWindow}.`;
  }

  return `${formatCount(projects.length, "project")}: ${activity} for ${formattedWindow}.`;
}

export function formatAlertPreheader(input: AlertPreheaderInput): string {
  const projectPrefix = input.projectName === undefined || input.projectName === null ? "" : `${input.projectName}: `;
  return `${projectPrefix}${titleCase(input.severity)} ${input.conditionLabel.toLowerCase()} for ${input.serviceName} in ${input.environment} at ${formatEmailDate(input.occurredAt)}.`;
}

export function formatAlertDigestPreheader(alerts: AlertDigestPreheaderEntry[]): string {
  if (alerts.length === 0) {
    return "No incidents were included in this alert digest.";
  }

  const firstAlert = alerts[0]!;
  const projectPrefix = firstAlert.projectName === undefined || firstAlert.projectName === null ? "" : `${firstAlert.projectName}: `;
  const additionalIncidents = alerts.length > 1 ? ` and ${formatCount(alerts.length - 1, "other incident")}` : "";
  return `${projectPrefix}${formatCount(alerts.length, "incident")} matched alerts. First: ${titleCase(firstAlert.severity)} ${firstAlert.summary ?? firstAlert.incidentId} on ${firstAlert.serviceName} in ${firstAlert.environment}${additionalIncidents}.`;
}
