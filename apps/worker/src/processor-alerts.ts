import { createHash } from "node:crypto";
import { resolveAlertNoisePolicy } from "../../../packages/shared-types/src/alert-notification-policy.js";
import type { AlertConditionType } from "../../../packages/storage/src/index.js";
import {
  queueAllowanceLimitReachedNotification,
  queueAllowanceThresholdNotifications
} from "../../../packages/storage/src/index.js";
import { recordProjectMetricDeltas } from "./account-analytics.js";
import {
  AlertDeliveryError,
  type EvaluateAlertsWorkerDependencies,
  type DeliverAlertEmailDigestWorkerDependencies,
  type WorkerProcessResult
} from "./processor-shared.js";

export const ALERT_EMAIL_DIGEST_WINDOW_SECONDS = 10;

const SAFE_DELIVERY_ERRORS = new Set([
  "alert_payload_unsafe", "alert_timeout", "alert_transport_error",
  "alert_email_not_configured", "alert_email_recipients_missing", "alert_email_error",
  "alert_slack_destination_store_missing", "alert_slack_encryption_key_missing",
  "alert_slack_destination_not_found", "alert_slack_webhook_secret_invalid",
  "alert_slack_webhook_url_missing", "alert_discord_webhook_url_missing",
  "alert_target_url_missing", "alert_target_blocked", "alert_redirect_blocked"
]);

function safeDeliveryFailure(error: unknown): AlertDeliveryError {
  return error instanceof AlertDeliveryError && (
    SAFE_DELIVERY_ERRORS.has(error.message) || /^alert_http_error_[1-5][0-9]{2}$/.test(error.message)
  )
    ? error
    : new AlertDeliveryError("alert_delivery_transport_failed");
}

export async function processNextEvaluateAlertsJob(
  dependencies: EvaluateAlertsWorkerDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("evaluate-alerts");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  const matchingAlertInput: {
    project_id: string;
    condition_type: AlertConditionType;
    service_name: string;
    environment: string;
    severity: "low" | "medium" | "high" | "critical";
    lifecycle_event?: "new_incident" | "incident_regressed";
  } = {
    project_id: job.project_id,
    condition_type: job.condition_type,
    service_name: job.service_name,
    environment: job.environment,
    severity: job.severity
  };
  if (job.lifecycle_event !== undefined) {
    matchingAlertInput.lifecycle_event = job.lifecycle_event;
  }

  const alerts = await dependencies.alertStore.listMatchingAlerts(matchingAlertInput);

  let remainingAlertDeliveries: number | null = null;
  let alertAllowanceUsed: number | null = null;
  let alertAllowanceLimit: number | null = null;
  let alertUsageWindowStartsAt: string | null = null;
  let alertUsageWindowEndsAt: string | null = null;
  const notificationKey = job.notification_key ?? job.dedupe_key;
  if (dependencies.billingStore !== undefined) {
    const billingSummary = await dependencies.billingStore.getBillingSummaryForProject({
      project_id: job.project_id,
      now: new Date().toISOString()
    });
    const allowance = billingSummary?.allowances.monthly_alert_deliveries;
    if (billingSummary !== null && allowance !== undefined) {
      remainingAlertDeliveries = Math.max(0, allowance.limit - allowance.used);
      alertAllowanceUsed = allowance.used;
      alertAllowanceLimit = allowance.limit;
      alertUsageWindowStartsAt = billingSummary.usage_window.starts_at;
      alertUsageWindowEndsAt = billingSummary.usage_window.ends_at;
    }
  }

  let providerFailure: AlertDeliveryError | null = null;
  for (const alert of alerts) {
    // A critical transition must not disappear behind a lower-severity burst send.
    const coalescingKey = job.coalescing_key === undefined
      ? undefined
      : createHash("sha256").update(`${job.coalescing_key}:${job.severity}`).digest("hex");
    const noisePolicy = resolveAlertNoisePolicy({ channel: alert.channel, config: alert.config,
      projectId: job.project_id, incidentId: job.incident_id, environment: job.environment,
      severity: job.severity, notificationKey, cooldownSeconds: alert.cooldown_seconds,
      ...(coalescingKey === undefined ? {} : { coalescingKey }),
      ...(job.coalescing_window_seconds === undefined ? {} : { coalescingWindowSeconds: job.coalescing_window_seconds }) });
    const payload: Record<string, unknown> = {
      alert_id: alert.alert_id,
      condition_type: job.condition_type,
      incident_id: job.incident_id,
      project_id: job.project_id,
      occurred_at: job.occurred_at,
      summary: job.summary ?? null,
      service_name: job.service_name,
      environment: job.environment,
      severity: job.severity,
      regression_after_deploy:
        job.regression_deploy !== undefined && job.regression_deploy !== null,
      deploy_version: job.regression_deploy?.version ?? null,
      deploy_commit_sha: job.regression_deploy?.commit_sha ?? null,
      deploy_branch: job.regression_deploy?.branch ?? null,
      deploy_deployed_at: job.regression_deploy?.deployed_at ?? null,
      minutes_since_deploy: job.regression_deploy?.minutes_since_deploy ?? null
    };

    if (alert.channel === "email") {
      const toField = alert.config["to"];
      const recipient = typeof toField === "string" ? toField.trim().toLowerCase() : "";
      if (recipient.length === 0) {
        continue;
      }

      const queued = await dependencies.alertStore.queueAlertEmailDigestItem({
        alert_id: alert.alert_id,
        project_id: job.project_id,
        incident_id: job.incident_id,
        condition_type: job.condition_type,
        dedupe_key: job.dedupe_key,
        notification_key: noisePolicy.notification_key,
        cooldown_seconds: noisePolicy.cooldown_seconds,
        recipient,
        payload,
        aggregation_window_seconds: noisePolicy.aggregation_window_seconds,
        allow_new_digest: remainingAlertDeliveries === null || remainingAlertDeliveries > 0
      });

      if (queued.created && queued.created_digest && remainingAlertDeliveries !== null) {
        const previousUsed = alertAllowanceUsed ?? 0;
        remainingAlertDeliveries -= 1;
        alertAllowanceUsed = previousUsed + 1;
        if (
          dependencies.operationalEmailDeliveryStore !== undefined &&
          alertAllowanceLimit !== null
        ) {
          await queueAllowanceThresholdNotifications({
            store: dependencies.operationalEmailDeliveryStore,
            project_id: job.project_id,
            meter: "monthly_alert_deliveries",
            previous_used: previousUsed,
            next_used: alertAllowanceUsed,
            limit: alertAllowanceLimit,
            usage_window_starts_at: alertUsageWindowStartsAt,
            usage_window_ends_at: alertUsageWindowEndsAt
          });
        }
      } else if (
        queued.created === false &&
        queued.digest_id === null &&
        dependencies.operationalEmailDeliveryStore !== undefined &&
        alertAllowanceLimit !== null &&
        remainingAlertDeliveries !== null &&
        remainingAlertDeliveries <= 0
      ) {
        await queueAllowanceLimitReachedNotification({
          store: dependencies.operationalEmailDeliveryStore,
          project_id: job.project_id,
          meter: "monthly_alert_deliveries",
          used: alertAllowanceUsed ?? alertAllowanceLimit,
          limit: alertAllowanceLimit,
          usage_window_starts_at: alertUsageWindowStartsAt,
          usage_window_ends_at: alertUsageWindowEndsAt
        });
      }
      continue;
    }

    const intent = await dependencies.alertStore.createAlertDeliveryIntent({
      evaluation_job_id: dependencies.queue.getActiveJobId?.() ?? null,
      alert_id: alert.alert_id,
      project_id: job.project_id,
      incident_id: job.incident_id,
      condition_type: job.condition_type,
      dedupe_key: job.dedupe_key,
      notification_key: noisePolicy.notification_key,
      allow_new_delivery: remainingAlertDeliveries === null || remainingAlertDeliveries > 0,
      cooldown_seconds: noisePolicy.cooldown_seconds,
      channel: alert.channel,
      ...(coalescingKey === undefined ? {} : { coalescing_key: coalescingKey, coalescing_window_seconds: job.coalescing_window_seconds ?? 10 }),
      payload
    });

    if (intent.delivery_id === null) {
      if (
        remainingAlertDeliveries !== null && remainingAlertDeliveries <= 0 &&
        dependencies.operationalEmailDeliveryStore !== undefined &&
        alertAllowanceLimit !== null
      ) {
        await queueAllowanceLimitReachedNotification({
          store: dependencies.operationalEmailDeliveryStore,
          project_id: job.project_id,
          meter: "monthly_alert_deliveries",
          used: alertAllowanceUsed ?? alertAllowanceLimit,
          limit: alertAllowanceLimit,
          usage_window_starts_at: alertUsageWindowStartsAt,
          usage_window_ends_at: alertUsageWindowEndsAt
        });
      }
      continue;
    }

    if (intent.created) await recordProjectMetricDeltas(dependencies, {
      projectId: job.project_id,
      occurredAt: job.occurred_at,
      source: "alert_delivery_created",
      dedupeKey: `alert_delivery_created:${intent.delivery_id}`,
      deltas: {
        alert_deliveries_created: 1
      }
    });

    if (intent.created && remainingAlertDeliveries !== null) {
      const previousUsed = alertAllowanceUsed ?? 0;
      remainingAlertDeliveries -= 1;
      alertAllowanceUsed = previousUsed + 1;
      if (
        dependencies.operationalEmailDeliveryStore !== undefined &&
        alertAllowanceLimit !== null
      ) {
        await queueAllowanceThresholdNotifications({
          store: dependencies.operationalEmailDeliveryStore,
          project_id: job.project_id,
          meter: "monthly_alert_deliveries",
          previous_used: previousUsed,
          next_used: alertAllowanceUsed,
          limit: alertAllowanceLimit,
          usage_window_starts_at: alertUsageWindowStartsAt,
          usage_window_ends_at: alertUsageWindowEndsAt
        });
      }
    }

    const delivery = {
        delivery_id: intent.delivery_id,
        alert_id: alert.alert_id,
        project_id: job.project_id,
        incident_id: job.incident_id,
        channel: alert.channel,
        config: alert.config,
        signing_secret: alert.signing_secret ?? null,
        webhook_payload_version: alert.webhook_payload_version ?? 0,
        payload
      };
    try {
      await dependencies.alertTransport.deliver(delivery);
    } catch (error) {
      const failure = safeDeliveryFailure(error);
      await dependencies.alertStore.markAlertDeliveryResult({
        delivery_id: intent.delivery_id,
        delivered: false,
        error_message: failure.message
      });
      await recordProjectMetricDeltas(dependencies, {
        projectId: job.project_id,
        occurredAt: job.occurred_at,
        source: "alert_delivery_result",
        dedupeKey: `alert_delivery_result:${intent.delivery_id}:failed`,
        deltas: {
          alert_deliveries_failed: 1
        }
      });
      providerFailure ??= failure;
      continue;
    }

    await dependencies.alertStore.markAlertDeliveryResult({
      delivery_id: intent.delivery_id,
      delivered: true,
      error_message: null
    });
    await recordProjectMetricDeltas(dependencies, {
      projectId: job.project_id,
      occurredAt: job.occurred_at,
      source: "alert_delivery_result",
      dedupeKey: `alert_delivery_result:${intent.delivery_id}:delivered`,
      deltas: {
        alert_deliveries_delivered: 1
      }
    });
  }

  // Keep the durable evaluation job retryable after all destinations were attempted.
  if (providerFailure !== null) throw providerFailure;

  return { processed: true };
}

export async function processNextDeliverAlertEmailDigestJob(
  dependencies: DeliverAlertEmailDigestWorkerDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("deliver-alert-email-digest");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  const digest = await dependencies.alertStore.getAlertEmailDigest(job.digest_id);
  if (digest === null || (digest.digest.status !== "pending" && digest.digest.status !== "failed")) {
    return { processed: true };
  }

  if (digest.items.length === 0) {
    await dependencies.alertStore.markAlertEmailDigestResult({
      digest_id: digest.digest.digest_id,
      delivered: false,
      error_message: "alert_email_digest_empty"
    });
    return { processed: true };
  }

  try {
    await dependencies.alertEmailDigestTransport.deliver({
      digest_id: digest.digest.digest_id,
      project_id: digest.digest.project_id,
      recipient: digest.digest.recipient,
      total_incident_count: digest.total_incident_count ?? digest.items.length,
      items: digest.items.map((item) => ({
        incident_id: item.incident_id,
        condition_type: item.condition_type,
        ...(item.condition_types === undefined ? {} : { condition_types: item.condition_types }),
        payload: item.payload
      }))
    });
  } catch (error) {
    const failure = safeDeliveryFailure(error);
    await dependencies.alertStore.markAlertEmailDigestResult({
      digest_id: digest.digest.digest_id,
      delivered: false,
      error_message: failure.message
    });
    throw failure;
  }

  await dependencies.alertStore.markAlertEmailDigestResult({
    digest_id: digest.digest.digest_id,
    delivered: true,
    error_message: null
  });
  await recordProjectMetricDeltas(dependencies, {
    projectId: digest.digest.project_id,
    occurredAt: digest.digest.created_at,
    source: "alert_email_digest_result",
    dedupeKey: `alert_email_digest_result:${digest.digest.digest_id}:delivered`,
    deltas: {
      alert_email_digests_sent: 1
    }
  });

  return { processed: true };
}
