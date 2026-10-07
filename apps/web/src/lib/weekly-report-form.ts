import type { WeeklyReportChannelRecord, WeeklyReportDayOfWeek } from "./api.js";
import type { SlackDestinationRecord } from "./slack-api.js";
import { formatSlackDestinationLabel } from "./slack-destinations.js";

export interface EmailWeeklyReportDraft {
  channel_id: string | null;
  is_enabled: boolean;
  recipients: string;
  day_of_week: WeeklyReportDayOfWeek;
  hour_of_day: number;
  timezone: string;
}

export interface SlackWeeklyReportDraft {
  channel_id: string | null;
  slack_destination_id: string;
  webhook_url: string;
  destination_mode: "connected" | "webhook";
  is_enabled: boolean;
  day_of_week: WeeklyReportDayOfWeek;
  hour_of_day: number;
  timezone: string;
}

export const dayOptions: Array<{ value: WeeklyReportDayOfWeek; label: string }> = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" }
];

export const hourOptions = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: `${hour.toString().padStart(2, "0")}:00`
}));
export const maxEmailRecipients = 3;

export function getDefaultTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function buildDefaultEmailDraft(): EmailWeeklyReportDraft {
  return {
    channel_id: null,
    is_enabled: false,
    recipients: "",
    day_of_week: "monday",
    hour_of_day: 9,
    timezone: getDefaultTimezone()
  };
}

export function readEmailRecipients(channel: WeeklyReportChannelRecord): string[] {
  const recipients = channel.config["to"];
  return Array.isArray(recipients) && recipients.every((recipient) => typeof recipient === "string")
    ? recipients
    : [];
}

export function buildEmailDraft(channel: WeeklyReportChannelRecord | null): EmailWeeklyReportDraft {
  if (channel === null) {
    return buildDefaultEmailDraft();
  }

  return {
    channel_id: channel.channel_id,
    is_enabled: channel.is_enabled,
    recipients: readEmailRecipients(channel).join(", "),
    day_of_week: channel.schedule.day_of_week,
    hour_of_day: channel.schedule.hour_of_day,
    timezone: channel.schedule.timezone
  };
}

export function buildSlackDraft(
  channel: WeeklyReportChannelRecord | null,
  fallbackDestinationId: string | null
): SlackWeeklyReportDraft {
  const selectedDestinationId =
    channel !== null && typeof channel.config["slack_destination_id"] === "string"
      ? channel.config["slack_destination_id"]
      : (fallbackDestinationId ?? "");

  if (channel === null) {
    return {
      channel_id: null,
      slack_destination_id: selectedDestinationId,
      webhook_url: "",
      destination_mode: "connected",
      is_enabled: true,
      day_of_week: "monday",
      hour_of_day: 9,
      timezone: getDefaultTimezone()
    };
  }

  return {
    channel_id: channel.channel_id,
    slack_destination_id: selectedDestinationId,
    webhook_url:
      typeof channel.config["webhook_url"] === "string" ? channel.config["webhook_url"] : "",
    destination_mode: typeof channel.config["webhook_url"] === "string" ? "webhook" : "connected",
    is_enabled: channel.is_enabled,
    day_of_week: channel.schedule.day_of_week,
    hour_of_day: channel.schedule.hour_of_day,
    timezone: channel.schedule.timezone
  };
}

export function normalizeRecipients(value: string): string[] {
  return value
    .split(",")
    .map((recipient) => recipient.trim())
    .filter((recipient) => recipient.length > 0);
}

export function emailDraftsEqual(
  left: EmailWeeklyReportDraft,
  right: EmailWeeklyReportDraft
): boolean {
  return (
    left.channel_id === right.channel_id &&
    left.is_enabled === right.is_enabled &&
    left.recipients === right.recipients &&
    left.day_of_week === right.day_of_week &&
    left.hour_of_day === right.hour_of_day &&
    left.timezone === right.timezone
  );
}

export function formatSchedule(
  schedule: EmailWeeklyReportDraft | SlackWeeklyReportDraft | WeeklyReportChannelRecord["schedule"]
): string {
  const day =
    dayOptions.find((option) => option.value === schedule.day_of_week)?.label ??
    schedule.day_of_week;
  return `${day} at ${schedule.hour_of_day.toString().padStart(2, "0")}:00 ${schedule.timezone}`;
}

export function formatSlackWeeklyReportDestination(
  channel: WeeklyReportChannelRecord,
  slackDestinations: SlackDestinationRecord[]
): string {
  const slackDestinationId = channel.config["slack_destination_id"];
  if (typeof slackDestinationId !== "string") {
    return typeof channel.config["webhook_url"] === "string"
      ? "Direct Slack webhook"
      : "Slack (channel unavailable)";
  }

  const destination = slackDestinations.find(
    (entry) => entry.slack_destination_id === slackDestinationId
  );
  if (destination === undefined) {
    return "Slack (channel unavailable)";
  }

  return formatSlackDestinationLabel(destination);
}
