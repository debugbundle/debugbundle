import {
  buildEmailBrandMarkUrl,
  renderWeeklyReportEmail,
  type EmailTransport
} from "../../../packages/email/src/index.js";
import {
  decryptIntegrationSecret,
  type AlertDeliveryStore,
  type GitHubStore,
  type SlackDestinationStore,
  type WebhookDeliveryStore,
  type WeeklyReportChannelRecord,
  type WeeklyReportingStore
} from "../../../packages/storage/src/index.js";
import type { WeeklyReportTransport } from "./processor.js";

const RETENTION_CLEANUP_LEASE_KEY = "leases:cleanup-retention:schedule";

export async function scheduleDueAlertEmailDigests(input: {
  queue: {
    enqueue(jobName: "deliver-alert-email-digest", payload: { digest_id: string }): Promise<void>;
  };
  alertStore: Pick<AlertDeliveryStore, "claimDueAlertEmailDigests">;
  batchSize: number;
}): Promise<number> {
  const dueDigests = await input.alertStore.claimDueAlertEmailDigests(input.batchSize);

  for (const job of dueDigests) {
    await input.queue.enqueue("deliver-alert-email-digest", job);
  }

  return dueDigests.length;
}

export async function scheduleDueWebhookDeliveries(input: {
  queue: {
    enqueue(
      jobName: "deliver-webhook",
      payload: { delivery_id: string; attempt: number }
    ): Promise<void>;
  };
  webhookDeliveryStore: Pick<WebhookDeliveryStore, "claimDueDeliveries">;
  batchSize: number;
}): Promise<number> {
  const dueDeliveries = await input.webhookDeliveryStore.claimDueDeliveries(input.batchSize);

  for (const job of dueDeliveries) {
    await input.queue.enqueue("deliver-webhook", job);
  }

  return dueDeliveries.length;
}

export async function scheduleDueGitHubDispatches(input: {
  queue: {
    enqueue(
      jobName: "deliver-github-dispatch",
      payload: { delivery_id: string; attempt: number }
    ): Promise<void>;
  };
  githubStore: Pick<GitHubStore, "claimDueGitHubDispatchDeliveries">;
  batchSize: number;
}): Promise<number> {
  const dueDeliveries = await input.githubStore.claimDueGitHubDispatchDeliveries(input.batchSize);

  for (const job of dueDeliveries) {
    await input.queue.enqueue("deliver-github-dispatch", job);
  }

  return dueDeliveries.length;
}

export async function scheduleWeeklyReports(input: {
  queue: {
    enqueue(
      jobName: "generate-weekly-report",
      payload: {
        delivery_id: string;
        weekly_report_channel_id: string;
        project_id: string;
        delivery_ids?: string[];
        weekly_report_channel_ids?: string[];
        project_ids?: string[];
        window_start: string;
        window_end: string;
      }
    ): Promise<void>;
  };
  weeklyReportingStore: Pick<WeeklyReportingStore, "listProjectsWithWeeklyActivity">;
  weeklyReportChannelStore: {
    listEnabledWeeklyReportChannels(input: { limit: number }): Promise<WeeklyReportChannelRecord[]>;
  };
  weeklyReportDeliveryStore: {
    claimWeeklyReportDelivery(input: {
      weekly_report_channel_id: string;
      project_id: string;
      window_start: string;
      window_end: string;
      channel: "email" | "slack";
    }): Promise<{ delivery_id: string; created: boolean }>;
  };
  batchSize: number;
  now?: Date;
}): Promise<number> {
  const channels = await input.weeklyReportChannelStore.listEnabledWeeklyReportChannels({
    limit: input.batchSize
  });
  const now = input.now ?? new Date();
  let scheduledCount = 0;
  const pendingEmailGroups = new Map<
    string,
    Array<{
      delivery_id: string;
      weekly_report_channel_id: string;
      project_id: string;
      window_start: string;
      window_end: string;
    }>
  >();

  for (const channel of channels) {
    const weeklyWindow = getWeeklyWindowForChannel(channel, now);
    if (weeklyWindow === null) {
      continue;
    }

    const projectIds = await input.weeklyReportingStore.listProjectsWithWeeklyActivity({
      window_start: weeklyWindow.window_start,
      window_end: weeklyWindow.window_end,
      limit: input.batchSize
    });
    if (!projectIds.includes(channel.project_id)) {
      continue;
    }

    const delivery = await input.weeklyReportDeliveryStore.claimWeeklyReportDelivery({
      weekly_report_channel_id: channel.channel_id,
      project_id: channel.project_id,
      window_start: weeklyWindow.window_start,
      window_end: weeklyWindow.window_end,
      channel: channel.channel
    });
    if (!delivery.created) {
      continue;
    }

    const payload = {
      delivery_id: delivery.delivery_id,
      weekly_report_channel_id: channel.channel_id,
      project_id: channel.project_id,
      window_start: weeklyWindow.window_start,
      window_end: weeklyWindow.window_end
    };

    if (channel.channel === "email") {
      const groupKey = getWeeklyEmailGroupKey(channel, weeklyWindow);
      const group = pendingEmailGroups.get(groupKey) ?? [];
      group.push(payload);
      pendingEmailGroups.set(groupKey, group);
      continue;
    }

    await input.queue.enqueue("generate-weekly-report", payload);
    scheduledCount += 1;
  }

  for (const group of pendingEmailGroups.values()) {
    const [first] = group;
    if (first === undefined) {
      continue;
    }

    if (group.length === 1) {
      await input.queue.enqueue("generate-weekly-report", first);
      scheduledCount += 1;
      continue;
    }

    await input.queue.enqueue("generate-weekly-report", {
      ...first,
      delivery_ids: group.map((entry) => entry.delivery_id),
      weekly_report_channel_ids: group.map((entry) => entry.weekly_report_channel_id),
      project_ids: group.map((entry) => entry.project_id)
    });
    scheduledCount += 1;
  }

  return scheduledCount;
}

export async function scheduleRetentionCleanup(input: {
  queue: {
    enqueue(jobName: "cleanup-retention", payload: { scheduled_at: string }): Promise<void>;
    acquireLease?(key: string, ttlSeconds: number): Promise<boolean>;
  };
  intervalMs: number;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const ttlSeconds = Math.max(60, Math.ceil(input.intervalMs / 1000));

  if (input.queue.acquireLease !== undefined) {
    const acquired = await input.queue.acquireLease(RETENTION_CLEANUP_LEASE_KEY, ttlSeconds);
    if (!acquired) {
      return false;
    }
  }

  await input.queue.enqueue("cleanup-retention", {
    scheduled_at: now.toISOString()
  });
  return true;
}

function getTimeZoneParts(
  now: Date,
  timeZone: string
): { year: number; month: number; day: number; hour: number; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    weekday: "long",
    hour12: false
  }).formatToParts(now);

  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number.parseInt(read("year"), 10),
    month: Number.parseInt(read("month"), 10),
    day: Number.parseInt(read("day"), 10),
    hour: Number.parseInt(read("hour"), 10),
    weekday: read("weekday").toLowerCase()
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "0";
  const zonedAsUtc = Date.UTC(
    Number.parseInt(read("year"), 10),
    Number.parseInt(read("month"), 10) - 1,
    Number.parseInt(read("day"), 10),
    Number.parseInt(read("hour"), 10),
    Number.parseInt(read("minute"), 10),
    Number.parseInt(read("second"), 10)
  );

  return zonedAsUtc - date.getTime();
}

function zonedLocalMidnightToUtc(year: number, month: number, day: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offset = getTimeZoneOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - offset);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function getWeeklyEmailGroupKey(
  channel: Pick<WeeklyReportChannelRecord, "channel_id" | "config">,
  weeklyWindow: { window_start: string; window_end: string }
): string {
  const recipients = channel.config["to"];
  const recipientKey = isStringArray(recipients)
    ? recipients
        .map((recipient) => recipient.trim().toLowerCase())
        .filter((recipient) => recipient.length > 0)
        .sort()
        .join(",")
    : `channel:${channel.channel_id}`;

  return `${weeklyWindow.window_start}:${weeklyWindow.window_end}:${recipientKey}`;
}

function getWeeklyWindowForChannel(
  channel: Pick<WeeklyReportChannelRecord, "schedule" | "channel_id">,
  now: Date
): { window_start: string; window_end: string } | null {
  const local = getTimeZoneParts(now, channel.schedule.timezone);
  if (local.weekday !== channel.schedule.day_of_week || local.hour < channel.schedule.hour_of_day) {
    return null;
  }

  const windowEnd = zonedLocalMidnightToUtc(
    local.year,
    local.month,
    local.day,
    channel.schedule.timezone
  );
  const previousDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
  previousDate.setUTCDate(previousDate.getUTCDate() - 7);
  const windowStart = zonedLocalMidnightToUtc(
    previousDate.getUTCFullYear(),
    previousDate.getUTCMonth() + 1,
    previousDate.getUTCDate(),
    channel.schedule.timezone
  );

  return {
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString()
  };
}

export function createWeeklyReportTransport(input: {
  emailTransport: EmailTransport | null;
  slackDestinationStore?: Pick<SlackDestinationStore, "getSlackDestinationSecretForDelivery">;
  integrationSecretEncryptionKey?: string;
  appBaseUrl?: string | null;
  emailAssetBaseUrl?: string | null;
}): WeeklyReportTransport {
  return {
    async deliver(event): Promise<void> {
      const deliveries = event.deliveries ?? [
        {
          delivery_id: event.delivery_id,
          channel: event.channel,
          report: event.report
        }
      ];
      const rendered = renderWeeklyReportEmail({
        brandMarkUrl: buildEmailBrandMarkUrl(input.emailAssetBaseUrl ?? input.appBaseUrl),
        windowStart: event.report.window_start,
        windowEnd: event.report.window_end,
        projects: deliveries.map((delivery) => ({
          projectId: delivery.report.project_id,
          projectName: delivery.report.project_name,
          bundleCounts: delivery.report.bundle_counts,
          newIncidents: delivery.report.new_incidents,
          resolvedIncidents: delivery.report.resolved_incidents,
          openedIncidentsResolved: delivery.report.opened_incidents_resolved,
          regressions: delivery.report.regressions,
          topSpikingIncidents: delivery.report.top_spiking_incidents
        }))
      });

      if (event.channel.channel === "email") {
        if (input.emailTransport === null) {
          throw new Error("weekly_report_email_not_configured");
        }

        const recipients = event.channel.config["to"];
        if (!isStringArray(recipients)) {
          throw new Error("weekly_report_email_config_invalid");
        }

        await input.emailTransport.send({
          to: recipients,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html
        });

        return;
      }

      let webhookUrl = event.channel.config["webhook_url"];
      const slackDestinationId = event.channel.config["slack_destination_id"];
      if (typeof slackDestinationId === "string" && slackDestinationId.length > 0) {
        if (input.slackDestinationStore === undefined) {
          throw new Error("weekly_report_slack_destination_store_missing");
        }
        if (
          input.integrationSecretEncryptionKey === undefined ||
          input.integrationSecretEncryptionKey.trim().length === 0
        ) {
          throw new Error("weekly_report_slack_encryption_key_missing");
        }

        const destination = await input.slackDestinationStore.getSlackDestinationSecretForDelivery({
          slack_destination_id: slackDestinationId
        });
        if (destination === null) {
          throw new Error("weekly_report_slack_destination_not_found");
        }

        try {
          webhookUrl = decryptIntegrationSecret(
            destination.webhook_url_ciphertext,
            input.integrationSecretEncryptionKey
          );
        } catch {
          throw new Error("weekly_report_slack_webhook_secret_invalid");
        }
      }

      if (typeof webhookUrl !== "string" || webhookUrl.length === 0) {
        throw new Error("weekly_report_slack_config_invalid");
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            text: rendered.text
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`weekly_report_slack_http_error_${response.status}`);
        }
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
