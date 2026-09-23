import type {
  AlertChannel,
  AlertConditionType,
  AlertSeverityLifecycleScope,
  AlertRecord
} from "./api.js";
import type { SlackDestinationRecord } from "./slack-api.js";
import { formatSlackDestinationLabel } from "./slack-destinations.js";
export type AlertChannelOption = {
  value: AlertChannel;
  label: string;
  disabled?: boolean;
};

export const ALERT_CHANNEL_LABELS: Record<AlertChannel, string> = {
  email: "Email",
  slack: "Slack",
  discord: "Discord",
  webhook: "Alert webhook"
};

export const TEAM_ALERT_CHANNEL_OPTIONS: AlertChannelOption[] = [
  { value: "email", label: ALERT_CHANNEL_LABELS["email"] },
  { value: "slack", label: ALERT_CHANNEL_LABELS["slack"] },
  { value: "webhook", label: ALERT_CHANNEL_LABELS["webhook"] }
];

export const STANDARD_ALERT_CHANNEL_OPTIONS: AlertChannelOption[] = [
  { value: "email", label: ALERT_CHANNEL_LABELS["email"] },
  { value: "slack", label: `${ALERT_CHANNEL_LABELS["slack"]} (Team tier only)`, disabled: true },
  { value: "webhook", label: ALERT_CHANNEL_LABELS["webhook"] }
];

export const ALERT_CONDITION_OPTIONS: Array<{ value: AlertConditionType; label: string }> = [
  { value: "new_incident", label: "New incident" },
  { value: "incident_regressed", label: "Incident regressed" },
  { value: "error_spike", label: "Error spike" },
  { value: "severity_threshold", label: "Severity threshold" },
  { value: "regression_after_deploy", label: "Regression after deploy" }
];

export const SEVERITY_OPTIONS: Array<{
  value: "" | "low" | "medium" | "high" | "critical";
  label: string;
}> = [
  { value: "", label: "Any severity" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" }
];

export const ALERT_SEVERITY_LIFECYCLE_SCOPE_OPTIONS: Array<{
  value: AlertSeverityLifecycleScope;
  label: string;
}> = [
  { value: "both", label: "New incidents and regressions" },
  { value: "new_incident", label: "New incidents only" },
  { value: "incident_regressed", label: "Regressions only" }
];

export const ALERT_SEVERITY_ANY_VALUE = "__any_severity__";
export const ALERT_SEVERITY_LIFECYCLE_DEFAULT: AlertSeverityLifecycleScope = "both";
export const ALERT_COOLDOWN_DEFAULT_DAYS = "1";
export const ALERT_COOLDOWN_DISABLED_DAYS = "0";
export const ALERT_COOLDOWN_MAX_DAYS = 7;
export const SECONDS_PER_DAY = 86_400;

export function formatAlertChannel(channel: AlertChannel): string {
  return ALERT_CHANNEL_LABELS[channel] ?? channel;
}

export function formatAlertChannelWithDestination(
  alert: AlertRecord,
  slackDestinations: SlackDestinationRecord[]
): string {
  if (alert.channel === "email") {
    const recipient = alert.config["to"];
    return typeof recipient === "string" && recipient.length > 0 ? `Email - ${recipient}` : "Email";
  }

  if (alert.channel === "webhook") {
    const targetUrl = alert.config["target_url"];
    return typeof targetUrl === "string" && targetUrl.length > 0
      ? `Alert webhook - ${targetUrl}`
      : "Alert webhook";
  }

  if (alert.channel === "discord") {
    const webhookUrl = alert.config["webhook_url"];
    return typeof webhookUrl === "string" && webhookUrl.length > 0
      ? `Discord - ${webhookUrl}`
      : "Discord";
  }

  if (alert.channel !== "slack") {
    return formatAlertChannel(alert.channel);
  }

  const slackDestinationId = alert.config["slack_destination_id"];
  if (typeof slackDestinationId !== "string") {
    return "Slack";
  }

  const destination = slackDestinations.find(
    (entry) => entry.slack_destination_id === slackDestinationId
  );
  if (destination === undefined) {
    return "Slack (channel unavailable)";
  }

  return `Slack - ${formatSlackDestinationLabel(destination)}`;
}

export function canManageAlertRule(
  alert: AlertRecord,
  userId: string | undefined,
  effectiveRole: "owner" | "admin" | "member"
): boolean {
  return (
    effectiveRole === "owner" ||
    effectiveRole === "admin" ||
    (userId !== undefined && alert.created_by_user_id === userId)
  );
}

export function formatAlertCondition(conditionType: AlertConditionType): string {
  return (
    ALERT_CONDITION_OPTIONS.find((option) => option.value === conditionType)?.label ?? conditionType
  );
}

export function formatAlertSeverityLifecycleScope(scope: AlertSeverityLifecycleScope): string {
  return (
    ALERT_SEVERITY_LIFECYCLE_SCOPE_OPTIONS.find((option) => option.value === scope)?.label ?? scope
  );
}

export function formatSeverityLifecycleScopeForAlert(alert: AlertRecord): string {
  if (alert.condition_type !== "severity_threshold") {
    return "-";
  }

  return formatAlertSeverityLifecycleScope(
    alert.severity_lifecycle_scope ?? ALERT_SEVERITY_LIFECYCLE_DEFAULT
  );
}

export function formatSeverity(severity: "low" | "medium" | "high" | "critical"): string {
  return SEVERITY_OPTIONS.find((option) => option.value === severity)?.label ?? severity;
}

export function formatAlertCooldown(cooldownSeconds: number): string {
  if (cooldownSeconds <= 0) {
    return "Off";
  }

  if (cooldownSeconds % SECONDS_PER_DAY === 0) {
    const days = cooldownSeconds / SECONDS_PER_DAY;
    return days === 1 ? "1 day" : `${days} days`;
  }

  if (cooldownSeconds % 3_600 === 0) {
    const hours = cooldownSeconds / 3_600;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }

  if (cooldownSeconds % 60 === 0) {
    const minutes = cooldownSeconds / 60;
    return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  }

  return cooldownSeconds === 1 ? "1 second" : `${cooldownSeconds} seconds`;
}

export function buildAlertConfig(input: {
  channel: AlertChannel;
  emailRecipient: string;
  destinationUrl: string;
  slackDestinationId: string;
}): Record<string, unknown> | null {
  const { channel, emailRecipient, destinationUrl, slackDestinationId } = input;

  if (channel === "email") {
    return validateAlertRecipientEmail(emailRecipient) === undefined
      ? { to: emailRecipient }
      : null;
  }

  if (channel === "slack") {
    return slackDestinationId.length > 0 ? { slack_destination_id: slackDestinationId } : null;
  }

  if (destinationUrl.length === 0) {
    return null;
  }

  if (channel === "webhook") {
    return {
      target_url: destinationUrl
    };
  }

  return {
    webhook_url: destinationUrl
  };
}

export function describeAlertChannel(channel: AlertChannel): string {
  if (channel === "webhook") {
    return "Send only matched alert notifications to a dedicated endpoint. This is separate from the Webhooks tab, which delivers signed lifecycle events.";
  }

  if (channel === "slack") {
    return "Deliver matched alert notifications into a connected Slack channel. Team tier owners can connect channels directly from this dialog.";
  }

  if (channel === "discord") {
    return "Post matched alert notifications into a Discord channel via a webhook URL.";
  }

  return "Send matched alert notifications to a single email recipient. Create additional alert rules if multiple people should receive email.";
}

export function getDefaultCooldownDays(channel: AlertChannel): string {
  return channel === "email" ? ALERT_COOLDOWN_DEFAULT_DAYS : ALERT_COOLDOWN_DISABLED_DAYS;
}

export function describeAlertCooldown(channel: AlertChannel): string {
  const baseDescription =
    "Suppress repeated notifications for similar matches for this many days. Use 0 to disable the cooldown.";
  return channel === "email" ? `${baseDescription} Recommended for email: 1 day.` : baseDescription;
}

export function getDestinationLabel(channel: AlertChannel): string {
  if (channel === "slack") {
    return "Slack channel";
  }

  if (channel === "discord") {
    return "Discord webhook URL";
  }

  return "Webhook endpoint URL";
}

export function getDestinationDescription(channel: AlertChannel): string {
  if (channel === "slack") {
    return "Choose one of the Slack channels already connected for this organization, or connect Slack now.";
  }

  if (channel === "discord") {
    return "Paste the Discord webhook URL that should receive this alert rule.";
  }

  return "Matched alert events will be POSTed to this URL. Use the Webhooks tab for signed lifecycle webhook fanout.";
}

export function validateAlertRecipientEmail(value: string): string | undefined {
  if (value.length === 0) {
    return "Enter the email address that should receive this alert.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "Enter a valid email address for this alert.";
  }

  return undefined;
}

export function validateAlertCooldownDays(value: string): string | undefined {
  if (!/^\d+$/.test(value)) {
    return "Cooldown days must be a whole number between 0 and 7.";
  }

  const parsed = Number.parseInt(value, 10);
  if (parsed < 0 || parsed > ALERT_COOLDOWN_MAX_DAYS) {
    return "Cooldown days must be a whole number between 0 and 7.";
  }

  return undefined;
}
