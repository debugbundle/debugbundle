import { useEffect, useState } from "react";

import {
  getGitHubInstallation,
  getProjectCapturePolicy,
  getProjectGitHubRepo,
  getProjectImprovementSettings,
  listProjectAvailabilityChecks,
  listProjectGitHubRules,
  listProjectAlerts,
  listProjectProbeActivations,
  listProjectWeeklyReportChannels,
  listProjectWebhooks,
  type AlertRecord,
  type GitHubDispatchRuleRecord,
  type GitHubInstallationRecord,
  type ProbeActivationRecord,
  type ProjectCapturePolicyResponse,
  type ProjectGitHubRepoRecord,
  type ProjectImprovementSettingsResponse,
  type ProjectRecord,
  type WebhookRecord,
  type WeeklyReportChannelRecord
} from "../../lib/api.js";
import { Badge } from "../ui/badge.js";
import { Skeleton } from "../ui/skeleton.js";

const PROJECT_SETUP_SUMMARY_LIST_LIMIT = 100;

type SummaryLoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error" };

type GitHubSummaryLoadState =
  | { status: "loading" }
  | { status: "ready"; data: GitHubOverviewSummary }
  | { status: "error" };

interface GitHubOverviewSummary {
  installation: GitHubInstallationRecord | null;
  repo: ProjectGitHubRepoRecord | null;
  rules: GitHubDispatchRuleRecord[];
}

interface ProjectSetupSummaryState {
  alerts: SummaryLoadState<AlertRecord[]>;
  webhooks: SummaryLoadState<WebhookRecord[]>;
  probes: SummaryLoadState<ProbeActivationRecord[]>;
  healthChecks: SummaryLoadState<Awaited<ReturnType<typeof listProjectAvailabilityChecks>>>;
  github: GitHubSummaryLoadState;
  weeklyReports: SummaryLoadState<WeeklyReportChannelRecord[]>;
  capturePolicy: SummaryLoadState<ProjectCapturePolicyResponse>;
  improvementSettings: SummaryLoadState<ProjectImprovementSettingsResponse>;
}

export function ProjectSetupSummaryGrid({ project }: { project: ProjectRecord }): JSX.Element {
  const [summary, setSummary] = useState<ProjectSetupSummaryState>(() => buildLoadingProjectSetupSummary());

  useEffect(() => {
    let isActive = true;

    setSummary(buildLoadingProjectSetupSummary());

    void (async () => {
      const [
        alertsResult,
        webhooksResult,
        probesResult,
        healthChecksResult,
        capturePolicyResult,
        improvementSettingsResult,
        weeklyReportsResult,
        githubResult
      ] = await Promise.allSettled([
        listProjectAlerts(project.project_id, PROJECT_SETUP_SUMMARY_LIST_LIMIT),
        listProjectWebhooks(project.project_id, PROJECT_SETUP_SUMMARY_LIST_LIMIT),
        listProjectProbeActivations(project.project_id),
        listProjectAvailabilityChecks(project.project_id, PROJECT_SETUP_SUMMARY_LIST_LIMIT),
        getProjectCapturePolicy(project.project_id),
        getProjectImprovementSettings(project.project_id),
        listProjectWeeklyReportChannels(project.project_id, PROJECT_SETUP_SUMMARY_LIST_LIMIT),
        loadGitHubOverviewSummary(project.project_id)
      ]);

      if (!isActive) {
        return;
      }

      setSummary({
        alerts: toSummaryLoadState(alertsResult),
        webhooks: toSummaryLoadState(webhooksResult),
        probes: toSummaryLoadState(probesResult),
        healthChecks: toSummaryLoadState(healthChecksResult),
        capturePolicy: toSummaryLoadState(capturePolicyResult),
        improvementSettings: toSummaryLoadState(improvementSettingsResult),
        weeklyReports: toSummaryLoadState(weeklyReportsResult),
        github: toSummaryLoadState(githubResult)
      });
    })();

    return () => {
      isActive = false;
    };
  }, [project.organization_plan, project.project_id]);

  if (isProjectSetupSummaryLoading(summary)) {
    return <ProjectSetupSummarySkeleton />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {renderAlertsSummaryBlock(summary.alerts)}
      {renderWebhooksSummaryBlock(summary.webhooks)}
      {renderHealthChecksSummaryBlock(summary.healthChecks)}
      {renderProbesSummaryBlock(summary.probes, project.organization_plan)}
      {renderGitHubSummaryBlock(summary.github, project.organization_plan)}
      {renderWeeklyReportsSummaryBlock(summary.weeklyReports)}
      {renderCapturePolicySummaryBlock(summary.capturePolicy)}
      {renderImprovementSummaryBlock(summary.improvementSettings)}
    </div>
  );
}

function buildLoadingProjectSetupSummary(): ProjectSetupSummaryState {
  return {
    alerts: { status: "loading" },
    webhooks: { status: "loading" },
    probes: { status: "loading" },
    healthChecks: { status: "loading" },
    github: { status: "loading" },
    weeklyReports: { status: "loading" },
    capturePolicy: { status: "loading" },
    improvementSettings: { status: "loading" }
  };
}

async function loadGitHubOverviewSummary(projectId: string): Promise<GitHubOverviewSummary> {
  const installation = await getGitHubInstallation(projectId);

  if (installation === null) {
    return {
      installation: null,
      repo: null,
      rules: []
    };
  }

  const [repo, rules] = await Promise.all([
    getProjectGitHubRepo(projectId),
    listProjectGitHubRules(projectId)
  ]);

  return {
    installation,
    repo,
    rules
  };
}

function toSummaryLoadState<T>(result: PromiseSettledResult<T>): SummaryLoadState<T> {
  return result.status === "fulfilled" ? { status: "ready", data: result.value } : { status: "error" };
}

function isProjectSetupSummaryLoading(summary: ProjectSetupSummaryState): boolean {
  return (
    summary.alerts.status === "loading" ||
    summary.webhooks.status === "loading" ||
    summary.probes.status === "loading" ||
    summary.healthChecks.status === "loading" ||
    summary.weeklyReports.status === "loading" ||
    summary.capturePolicy.status === "loading" ||
    summary.improvementSettings.status === "loading" ||
    summary.github.status === "loading"
  );
}

function ProjectSetupSummarySkeleton(): JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="rounded-lg border border-border/80 bg-background/60 p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-28" />
          <Skeleton className="mt-3 h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

function renderAlertsSummaryBlock(summary: SummaryLoadState<AlertRecord[]>): JSX.Element {
  if (summary.status === "loading") {
    return <SetupSummaryBlock label="Alerts" value="Loading..." badge={{ label: "Loading", variant: "outline" }} description="Loading alert rule status." />;
  }

  if (summary.status === "error") {
    return (
      <SetupSummaryBlock
        label="Alerts"
        value="Unavailable"
        badge={{ label: "Could not load", variant: "outline" }}
        description="Alert rule counts could not be loaded for this project."
      />
    );
  }

  const totalAlerts = summary.data.length;
  const enabledAlerts = summary.data.filter((alert) => alert.is_enabled).length;

  return (
    <SetupSummaryBlock
      label="Alerts"
      value={`${formatBoundedCount(totalAlerts, PROJECT_SETUP_SUMMARY_LIST_LIMIT)} rule${totalAlerts === 1 ? "" : "s"}`}
      badge={{
        label: enabledAlerts > 0 ? `${enabledAlerts} enabled` : "None enabled",
        variant: enabledAlerts > 0 ? "success" : "secondary"
      }}
      description={
        totalAlerts === 0
          ? "No alert rules are configured yet."
          : `${formatAlertChannelSummary(summary.data)} configured for this project.`
      }
    />
  );
}

function renderWebhooksSummaryBlock(summary: SummaryLoadState<WebhookRecord[]>): JSX.Element {
  if (summary.status === "loading") {
    return <SetupSummaryBlock label="Webhooks" value="Loading..." badge={{ label: "Loading", variant: "outline" }} description="Loading webhook status." />;
  }

  if (summary.status === "error") {
    return (
      <SetupSummaryBlock
        label="Webhooks"
        value="Unavailable"
        badge={{ label: "Could not load", variant: "outline" }}
        description="Webhook endpoint counts could not be loaded for this project."
      />
    );
  }

  const totalWebhooks = summary.data.length;
  const enabledWebhooks = summary.data.filter((webhook) => webhook.is_enabled).length;
  const distinctEventCount = countDistinctWebhookEvents(summary.data);

  return (
    <SetupSummaryBlock
      label="Webhooks"
      value={`${formatBoundedCount(totalWebhooks, PROJECT_SETUP_SUMMARY_LIST_LIMIT)} endpoint${totalWebhooks === 1 ? "" : "s"}`}
      badge={{
        label: enabledWebhooks > 0 ? `${enabledWebhooks} enabled` : "None enabled",
        variant: enabledWebhooks > 0 ? "success" : "secondary"
      }}
      description={
        totalWebhooks === 0
          ? "No project webhooks are configured yet."
          : `${distinctEventCount} event type${distinctEventCount === 1 ? "" : "s"} subscribed across endpoints.`
      }
    />
  );
}

function renderProbesSummaryBlock(
  summary: SummaryLoadState<ProbeActivationRecord[]>,
  organizationPlan: ProjectRecord["organization_plan"]
): JSX.Element {
  if (summary.status === "loading") {
    return <SetupSummaryBlock label="Probes" value="Loading..." badge={{ label: "Loading", variant: "outline" }} description="Loading remote probe status." />;
  }

  if (summary.status === "error") {
    return (
      <SetupSummaryBlock
        label="Probes"
        value="Unavailable"
        badge={{ label: "Could not load", variant: "outline" }}
        description="Remote probe activations could not be loaded for this project."
      />
    );
  }

  const totalActivations = summary.data.length;
  const globalActivations = summary.data.filter(
    (activation) => activation.service === "*" && activation.environment === "*"
  ).length;
  const remoteProbesEnabled = organizationPlan !== "free";

  if (!remoteProbesEnabled) {
    return (
      <SetupSummaryBlock
        label="Probes"
        value={totalActivations > 0 ? "Paused" : "Solo+ only"}
        badge={{
          label: totalActivations > 0 ? "Upgrade required" : "Unavailable",
          variant: totalActivations > 0 ? "warning" : "outline"
        }}
        description={
          totalActivations > 0
            ? "Saved remote probe activations are preserved and will resume after the project returns to Solo or Team."
            : "Always-on probe buffers still work in the SDK, but remote probe activation requires Solo or Team."
        }
      />
    );
  }

  return (
    <SetupSummaryBlock
      label="Probes"
      value={totalActivations === 0 ? "Not configured" : `${formatBoundedCount(totalActivations, PROJECT_SETUP_SUMMARY_LIST_LIMIT)} active`}
      badge={{
        label:
          totalActivations === 0
            ? "Off"
            : globalActivations > 0
              ? `${globalActivations} global`
              : "Scoped",
        variant: totalActivations === 0 ? "secondary" : "success"
      }}
      description={
        totalActivations === 0
          ? "No remote probe activations are configured yet."
          : "Matching SDK probe labels can ship independently before the next error."
      }
    />
  );
}

function renderHealthChecksSummaryBlock(
  summary: SummaryLoadState<Awaited<ReturnType<typeof listProjectAvailabilityChecks>>>
): JSX.Element {
  if (summary.status === "loading") {
    return <SetupSummaryBlock label="Health checks" value="Loading..." badge={{ label: "Loading", variant: "outline" }} description="Loading health-check status." />;
  }

  if (summary.status === "error") {
    return (
      <SetupSummaryBlock
        label="Health checks"
        value="Unavailable"
        badge={{ label: "Could not load", variant: "outline" }}
        description="Health-check counts could not be loaded for this project."
      />
    );
  }

  const totalChecks = summary.data.checks.length;
  const enabledChecks = summary.data.checks.filter((check) => check.enabled).length;
  const pausedChecks = summary.data.checks.filter((check) => check.status === "paused").length;

  return (
    <SetupSummaryBlock
      label="Health checks"
      value={
        totalChecks === 0
          ? "Not configured"
          : `${formatBoundedCount(totalChecks, PROJECT_SETUP_SUMMARY_LIST_LIMIT)} check${totalChecks === 1 ? "" : "s"}`
      }
      badge={{
        label:
          pausedChecks > 0
            ? `${pausedChecks} paused`
            : enabledChecks > 0
              ? `${enabledChecks} enabled`
              : "Off",
        variant: pausedChecks > 0 ? "warning" : enabledChecks > 0 ? "success" : "secondary"
      }}
      description={
        totalChecks === 0
          ? "No hosted health checks are configured yet."
          : `Plan minimum interval ${summary.data.limits.min_interval_seconds}s with 30-day retained history.`
      }
    />
  );
}

function renderGitHubSummaryBlock(
  summary: GitHubSummaryLoadState,
  organizationPlan: ProjectRecord["organization_plan"]
): JSX.Element {
  if (summary.status === "loading") {
    return <SetupSummaryBlock label="GitHub automation" value="Loading..." badge={{ label: "Loading", variant: "outline" }} description="Loading GitHub automation status." />;
  }

  if (summary.status === "error") {
    return (
      <SetupSummaryBlock
        label="GitHub automation"
        value="Unavailable"
        badge={{ label: "Could not load", variant: "outline" }}
        description="GitHub automation settings could not be loaded for this project."
      />
    );
  }

  const { installation, repo, rules } = summary.data;
  const automationEnabled = organizationPlan !== "free";

  if (installation === null) {
    return (
      <SetupSummaryBlock
        label="GitHub automation"
        value={automationEnabled ? "Not configured" : "Solo+ only"}
        badge={{
          label: automationEnabled ? "Setup required" : "Unavailable",
          variant: automationEnabled ? "secondary" : "outline"
        }}
        description={
          automationEnabled
            ? "No GitHub App installation is connected to this workspace yet."
            : "Repository dispatch automation is not available on the Free plan."
        }
      />
    );
  }

  if (!automationEnabled) {
    return (
      <SetupSummaryBlock
        label="GitHub automation"
        value="Paused"
        badge={{ label: "Upgrade required", variant: "warning" }}
        description={
          repo === null
            ? "The GitHub App installation is preserved and will resume after the project returns to Solo or Team."
            : `${repo.repo_owner}/${repo.repo_name} and its dispatch rules are preserved and will resume after the project returns to Solo or Team.`
        }
      />
    );
  }

  if (installation.status === "suspended" || installation.status === "removed") {
    return (
      <SetupSummaryBlock
        label="GitHub automation"
        value="Connection lost"
        badge={{ label: "Reconnect required", variant: "warning" }}
        description="The GitHub App installation is no longer active, so dispatch automation is paused."
      />
    );
  }

  if (repo === null) {
    return (
      <SetupSummaryBlock
        label="GitHub automation"
        value="Not configured"
        badge={{ label: "No repository", variant: "secondary" }}
        description="GitHub App access is available, but no repository is assigned to this project yet."
      />
    );
  }

  const enabledRules = rules.filter((rule) => rule.enabled).length;

  return (
    <SetupSummaryBlock
      label="GitHub automation"
      value="Connected"
      badge={{
        label: enabledRules > 0 ? `${enabledRules} enabled` : "No rules",
        variant: enabledRules > 0 ? "success" : "secondary"
      }}
      description={
        rules.length === 0
          ? `${repo.repo_owner}/${repo.repo_name} is connected, but no dispatch rules are configured yet.`
          : `${formatBoundedCount(rules.length, PROJECT_SETUP_SUMMARY_LIST_LIMIT)} dispatch rule${rules.length === 1 ? "" : "s"} configured for ${repo.repo_owner}/${repo.repo_name}.`
      }
    />
  );
}

function renderWeeklyReportsSummaryBlock(summary: SummaryLoadState<WeeklyReportChannelRecord[]>): JSX.Element {
  if (summary.status === "loading") {
    return <SetupSummaryBlock label="Weekly reports" value="Loading..." badge={{ label: "Loading", variant: "outline" }} description="Loading weekly report status." />;
  }

  if (summary.status === "error") {
    return (
      <SetupSummaryBlock
        label="Weekly reports"
        value="Unavailable"
        badge={{ label: "Could not load", variant: "outline" }}
        description="Weekly report channel status could not be loaded."
      />
    );
  }

  const emailChannel = summary.data.find((channel) => channel.channel === "email") ?? null;
  const recipientCount = emailChannel === null ? 0 : readWeeklyReportRecipients(emailChannel).length;

  if (emailChannel === null) {
    return (
      <SetupSummaryBlock
        label="Weekly reports"
        value="Not configured"
        badge={{ label: "Off", variant: "secondary" }}
        description="No weekly report schedule has been saved yet."
      />
    );
  }

  return (
    <SetupSummaryBlock
      label="Weekly reports"
      value={emailChannel.is_enabled ? "Enabled" : "Off"}
      badge={{
        label: recipientCount > 0 ? `${recipientCount} recipient${recipientCount === 1 ? "" : "s"}` : "No recipients",
        variant: emailChannel.is_enabled ? "success" : "secondary"
      }}
      description={
        emailChannel.is_enabled
          ? formatWeeklyReportSchedule(emailChannel)
          : `Scheduled for ${formatWeeklyReportSchedule(emailChannel)}, but currently disabled.`
      }
    />
  );
}

function renderCapturePolicySummaryBlock(summary: SummaryLoadState<ProjectCapturePolicyResponse>): JSX.Element {
  if (summary.status === "loading") {
    return <SetupSummaryBlock label="Capture policy" value="Loading..." badge={{ label: "Loading", variant: "outline" }} description="Loading capture policy." />;
  }

  if (summary.status === "error") {
    return (
      <SetupSummaryBlock
        label="Capture policy"
        value="Unavailable"
        badge={{ label: "Could not load", variant: "outline" }}
        description="Capture policy details could not be loaded."
      />
    );
  }

  const clientErrorStatuses = summary.data.policy.immediate_client_error_statuses;

  return (
    <SetupSummaryBlock
      label="Capture policy"
      value={`${formatCapturePreset(summary.data.policy.preset)} preset`}
      badge={{
        label: clientErrorStatuses.length > 0 ? `${clientErrorStatuses.length} client 4xx` : "Preset defaults",
        variant: clientErrorStatuses.length > 0 ? "warning" : "outline"
      }}
      description={formatCapturePolicySummary(summary.data)}
    />
  );
}

function renderImprovementSummaryBlock(summary: SummaryLoadState<ProjectImprovementSettingsResponse>): JSX.Element {
  if (summary.status === "loading") {
    return <SetupSummaryBlock label="Improvement bundles" value="Loading..." badge={{ label: "Loading", variant: "outline" }} description="Loading improvement settings." />;
  }

  if (summary.status === "error") {
    return (
      <SetupSummaryBlock
        label="Improvement bundles"
        value="Unavailable"
        badge={{ label: "Could not load", variant: "outline" }}
        description="Improvement bundle settings could not be loaded."
      />
    );
  }

  if (!summary.data.cloud_automation_available) {
    return (
      <SetupSummaryBlock
        label="Improvement bundles"
        value="Local only"
        badge={{ label: "Hosted off", variant: "outline" }}
        description="Hosted automated improvement bundles are not available on this plan."
      />
    );
  }

  return (
    <SetupSummaryBlock
      label="Improvement bundles"
      value={summary.data.settings.automated_improvement_bundles_enabled ? "Enabled" : "Off"}
      badge={{
        label: `${formatImprovementSensitivity(summary.data.settings.improvement_bundle_sensitivity)} sensitivity`,
        variant: summary.data.settings.automated_improvement_bundles_enabled ? "success" : "secondary"
      }}
      description="Hosted improvement detection uses the shared retained bundle allowance."
    />
  );
}

function SetupSummaryBlock({
  label,
  value,
  badge,
  description
}: {
  label: string;
  value: string;
  badge: {
    label: string;
    variant: "secondary" | "outline" | "warning" | "success";
  };
  description: string;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border/80 bg-background/60 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <p className="text-base font-semibold text-foreground">{value}</p>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function formatBoundedCount(value: number, limit: number): string {
  return value >= limit ? `${limit}+` : value.toLocaleString();
}

function formatAlertChannelSummary(alerts: AlertRecord[]): string {
  const channelCounts = new Map<string, number>();

  for (const alert of alerts) {
    channelCounts.set(alert.channel, (channelCounts.get(alert.channel) ?? 0) + 1);
  }

  return Array.from(channelCounts.entries())
    .map(([channel, count]) => `${count} ${channel}`)
    .join(", ");
}

function countDistinctWebhookEvents(webhooks: WebhookRecord[]): number {
  const eventTypes = new Set<string>();

  for (const webhook of webhooks) {
    for (const eventType of webhook.events) {
      eventTypes.add(eventType);
    }
  }

  return eventTypes.size;
}

function readWeeklyReportRecipients(channel: WeeklyReportChannelRecord): string[] {
  const recipients = channel.config["to"];
  return Array.isArray(recipients) && recipients.every((recipient) => typeof recipient === "string") ? recipients : [];
}

function formatWeeklyReportSchedule(channel: WeeklyReportChannelRecord): string {
  return `${formatDayOfWeek(channel.schedule.day_of_week)} at ${channel.schedule.hour_of_day
    .toString()
    .padStart(2, "0")}:00 ${channel.schedule.timezone}`;
}

function formatDayOfWeek(value: WeeklyReportChannelRecord["schedule"]["day_of_week"]): string {
  switch (value) {
    case "monday":
      return "Monday";
    case "tuesday":
      return "Tuesday";
    case "wednesday":
      return "Wednesday";
    case "thursday":
      return "Thursday";
    case "friday":
      return "Friday";
    case "saturday":
      return "Saturday";
    case "sunday":
      return "Sunday";
  }
}

function formatCapturePreset(value: ProjectCapturePolicyResponse["policy"]["preset"]): string {
  switch (value) {
    case "minimal":
      return "Minimal";
    case "balanced":
      return "Balanced";
    case "investigative":
      return "Investigative";
  }
}

function formatCapturePolicySummary(summary: ProjectCapturePolicyResponse): string {
  return [
    formatCaptureLogs(summary.policy.capture_logs),
    formatCaptureRequests(summary.policy.capture_request_events),
    formatCaptureBreadcrumbs(summary.policy.capture_breadcrumbs)
  ].join(", ");
}

function formatCaptureLogs(value: ProjectCapturePolicyResponse["policy"]["capture_logs"]): string {
  switch (value) {
    case "off":
      return "no log capture";
    case "error":
      return "error logs";
    case "warning":
      return "warning logs";
    case "info":
      return "info logs";
  }
}

function formatCaptureRequests(value: ProjectCapturePolicyResponse["policy"]["capture_request_events"]): string {
  switch (value) {
    case "off":
      return "no request events";
    case "failures_only":
      return "failed requests";
    case "filtered":
      return "filtered requests";
    case "all":
      return "all requests";
  }
}

function formatCaptureBreadcrumbs(value: ProjectCapturePolicyResponse["policy"]["capture_breadcrumbs"]): string {
  switch (value) {
    case "local_only":
      return "local-only breadcrumbs";
    case "exception_only":
      return "exception breadcrumb trails";
    case "standalone":
      return "standalone breadcrumbs";
  }
}

function formatImprovementSensitivity(
  value: ProjectImprovementSettingsResponse["settings"]["improvement_bundle_sensitivity"]
): string {
  switch (value) {
    case "high_confidence":
      return "High confidence";
    case "balanced":
      return "Balanced";
    case "verbose":
      return "Verbose";
  }
}
