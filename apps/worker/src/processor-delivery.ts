import type {
  AccountMetricKey,
  WeeklyReportChannelRecord,
  WeeklyProjectReportSummary
} from "../../../packages/storage/src/index.js";
import { recordProjectMetricDeltas } from "./account-analytics.js";
import {
  LifecycleWebhookDeliveryError,
  GitHubDispatchDeliveryError,
  type DeliverGitHubDispatchWorkerDependencies,
  type CleanupRetentionWorkerDependencies,
  type DeliverWebhookWorkerDependencies,
  type GenerateWeeklyReportWorkerDependencies,
  type WorkerProcessResult
} from "./processor-shared.js";

export async function processNextDeliverWebhookJob(
  dependencies: DeliverWebhookWorkerDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("deliver-webhook");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  const delivery = await dependencies.webhookDeliveryStore.getDeliveryIntent(job.delivery_id);
  if (delivery === null) {
    return { processed: false, reason: "delivery_missing" };
  }

  try {
    await dependencies.lifecycleWebhookTransport.deliver({
      delivery_id: delivery.delivery_id,
      project_id: delivery.project_id,
      incident_id: delivery.incident_id,
      event_type: delivery.event_type,
      occurred_at: delivery.occurred_at,
      target_url: delivery.target_url,
      signing_secret: delivery.signing_secret,
      payload: delivery.payload
    });

    await dependencies.webhookDeliveryStore.markDeliveryAttempt({
      delivery_id: delivery.delivery_id,
      attempt: job.attempt,
      delivered: true,
      error_message: null,
      response_code: 200
    });
    await recordProjectMetricDeltas(dependencies, {
      projectId: delivery.project_id,
      occurredAt: delivery.occurred_at,
      source: "webhook_delivery_result",
      dedupeKey: `webhook_delivery_result:${delivery.delivery_id}:delivered`,
      deltas: {
        webhook_deliveries_delivered: 1
      }
    });
    return { processed: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const responseCode = error instanceof LifecycleWebhookDeliveryError ? error.responseCode : null;
    dependencies.logger?.warn(
      {
        attempt: job.attempt,
        delivery_id: delivery.delivery_id,
        error_message: errorMessage,
        incident_id: delivery.incident_id,
        project_id: delivery.project_id,
        response_code: responseCode
      },
      "worker_webhook_delivery_failed"
    );
    const markResult = await dependencies.webhookDeliveryStore.markDeliveryAttempt({
      delivery_id: delivery.delivery_id,
      attempt: job.attempt,
      delivered: false,
      error_message: errorMessage,
      response_code: responseCode
    });
    if (markResult.status === "failed") {
      const deltas: Partial<Record<AccountMetricKey, number>> = {
        webhook_deliveries_failed: 1
      };
      if (markResult.webhook_disabled === true) {
        deltas["webhooks_auto_disabled"] = 1;
      }
      await recordProjectMetricDeltas(dependencies, {
        projectId: delivery.project_id,
        occurredAt: delivery.occurred_at,
        source: "webhook_delivery_result",
        dedupeKey: `webhook_delivery_result:${delivery.delivery_id}:failed`,
        deltas
      });
    }

    if (
      markResult.webhook_disabled === true &&
      markResult.webhook_id !== undefined &&
      dependencies.onWebhookDisabled !== undefined
    ) {
      try {
        await dependencies.onWebhookDisabled({
          webhook_id: markResult.webhook_id,
          target_url: delivery.target_url
        });
      } catch {
        // Notification failure must not block delivery processing.
      }
    }

    return { processed: true };
  }
}

export async function processNextGenerateWeeklyReportJob(
  dependencies: GenerateWeeklyReportWorkerDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("generate-weekly-report");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  const deliveryIds = job.delivery_ids ?? [job.delivery_id];
  const channelIds = job.weekly_report_channel_ids ?? [job.weekly_report_channel_id];
  const projectIds = job.project_ids ?? [job.project_id];
  const deliveries: Array<{
    delivery_id: string;
    channel: WeeklyReportChannelRecord;
    report: WeeklyProjectReportSummary;
  }> = [];

  for (let index = 0; index < deliveryIds.length; index += 1) {
    const deliveryId = deliveryIds[index] ?? job.delivery_id;
    const channelId = channelIds[index] ?? job.weekly_report_channel_id;
    const projectId = projectIds[index] ?? job.project_id;

    const report = await dependencies.weeklyReportingStore.getWeeklyProjectReport({
      project_id: projectId,
      window_start: job.window_start,
      window_end: job.window_end
    });

    if (report === null) {
      if (deliveryIds.length === 1) {
        return { processed: false, reason: "no_activity" };
      }

      await dependencies.weeklyReportDeliveryStore.markWeeklyReportDeliveryResult({
        delivery_id: deliveryId,
        delivered: false,
        error_message: "weekly_report_no_activity"
      });
      await recordProjectMetricDeltas(dependencies, {
        projectId,
        occurredAt: job.window_end,
        source: "weekly_report_result",
        dedupeKey: `weekly_report_result:${deliveryId}:failed`,
        deltas: {
          weekly_reports_failed: 1
        }
      });
      continue;
    }

    const channel = await dependencies.weeklyReportChannelStore.getWeeklyReportChannelById({
      channel_id: channelId
    });
    if (channel === null || channel.is_enabled === false) {
      await dependencies.weeklyReportDeliveryStore.markWeeklyReportDeliveryResult({
        delivery_id: deliveryId,
        delivered: false,
        error_message: "weekly_report_channel_not_found"
      });
      await recordProjectMetricDeltas(dependencies, {
        projectId,
        occurredAt: job.window_end,
        source: "weekly_report_result",
        dedupeKey: `weekly_report_result:${deliveryId}:failed`,
        deltas: {
          weekly_reports_failed: 1
        }
      });
      continue;
    }

    deliveries.push({
      delivery_id: deliveryId,
      channel,
      report
    });
  }

  const primaryDelivery = deliveries[0];
  if (primaryDelivery === undefined) {
    return { processed: true };
  }

  try {
    await dependencies.weeklyReportTransport.deliver({
      delivery_id: primaryDelivery.delivery_id,
      channel: primaryDelivery.channel,
      report: primaryDelivery.report,
      deliveries
    });

    for (const delivery of deliveries) {
      await dependencies.weeklyReportDeliveryStore.markWeeklyReportDeliveryResult({
        delivery_id: delivery.delivery_id,
        delivered: true,
        error_message: null
      });
      await recordProjectMetricDeltas(dependencies, {
        projectId: delivery.report.project_id,
        occurredAt: job.window_end,
        source: "weekly_report_result",
        dedupeKey: `weekly_report_result:${delivery.delivery_id}:delivered`,
        deltas: {
          weekly_reports_sent: 1
        }
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dependencies.logger?.warn(
      {
        channel_id: primaryDelivery.channel.channel_id,
        delivery_id: primaryDelivery.delivery_id,
        error_message: message,
        project_id: job.project_id
      },
      "worker_weekly_report_delivery_failed"
    );
    for (const delivery of deliveries) {
      await dependencies.weeklyReportDeliveryStore.markWeeklyReportDeliveryResult({
        delivery_id: delivery.delivery_id,
        delivered: false,
        error_message: message
      });
      await recordProjectMetricDeltas(dependencies, {
        projectId: delivery.report.project_id,
        occurredAt: job.window_end,
        source: "weekly_report_result",
        dedupeKey: `weekly_report_result:${delivery.delivery_id}:failed`,
        deltas: {
          weekly_reports_failed: 1
        }
      });
    }
  }

  return { processed: true };
}

export async function processNextCleanupRetentionJob(
  dependencies: CleanupRetentionWorkerDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("cleanup-retention");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  await dependencies.retentionCleanupRunner.runCleanup(job);
  return { processed: true };
}

export async function processNextDeliverGitHubDispatchJob(
  dependencies: DeliverGitHubDispatchWorkerDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("deliver-github-dispatch");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  const delivery = await dependencies.githubStore.getGitHubDispatchDeliveryIntent(job.delivery_id);
  if (delivery === null) {
    return { processed: false, reason: "delivery_missing" };
  }

  try {
    await dependencies.githubDispatchTransport.deliver({
      delivery_id: delivery.delivery_id,
      installation_id: delivery.installation_id,
      repo_owner: delivery.repo_owner,
      repo_name: delivery.repo_name,
      dispatch_payload: delivery.dispatch_payload
    });
    await dependencies.githubStore.markGitHubDispatchDeliveryAttempt({
      delivery_id: delivery.delivery_id,
      attempt: job.attempt,
      delivered: true,
      error_message: null,
      github_status_code: 204
    });
    await recordProjectMetricDeltas(dependencies, {
      projectId: delivery.project_id,
      occurredAt: (delivery.dispatch_payload["occurred_at"] as string) ?? new Date().toISOString(),
      source: "github_dispatch_result",
      dedupeKey: `github_dispatch_result:${delivery.delivery_id}:delivered`,
      deltas: {
        github_dispatches_delivered: 1
      }
    });
  } catch (error) {
    const dispatchError = error instanceof GitHubDispatchDeliveryError ? error : null;
    dependencies.logger?.warn(
      {
        attempt: job.attempt,
        delivery_id: delivery.delivery_id,
        error_message: error instanceof Error ? error.message : String(error),
        github_status_code: dispatchError?.statusCode ?? null,
        incident_id: delivery.incident_id,
        project_id: delivery.project_id,
        retry_after_seconds: dispatchError?.retryAfterSeconds ?? null
      },
      "worker_github_dispatch_failed"
    );
    await dependencies.githubStore.markGitHubDispatchDeliveryAttempt({
      delivery_id: delivery.delivery_id,
      attempt: job.attempt,
      delivered: false,
      error_message: error instanceof Error ? error.message : String(error),
      github_status_code: dispatchError?.statusCode ?? null,
      ...(dispatchError?.retryAfterSeconds !== null &&
      dispatchError?.retryAfterSeconds !== undefined
        ? { retry_after_seconds: dispatchError.retryAfterSeconds }
        : {})
    });
    await recordProjectMetricDeltas(dependencies, {
      projectId: delivery.project_id,
      occurredAt: (delivery.dispatch_payload["occurred_at"] as string) ?? new Date().toISOString(),
      source: "github_dispatch_result",
      dedupeKey: `github_dispatch_result:${delivery.delivery_id}:failed`,
      deltas: {
        github_dispatches_failed: 1
      }
    });
  }

  return { processed: true };
}
