import type {
  BillingStore,
  OperationalEmailDeliveryStore
} from "../../../packages/storage/src/index.js";
import {
  queueAllowanceLimitReachedNotification,
  queueAllowanceThresholdNotifications
} from "../../../packages/storage/src/index.js";
import {
  recordProjectMetricDeltas,
  type WorkerAccountAnalyticsDependencies
} from "./account-analytics.js";
import { type ImprovementWebhookStore } from "./improvement-bundle-shared.js";

export async function publishImprovementBundleCreated(
  input: WorkerAccountAnalyticsDependencies & {
    webhookDeliveryStore?: ImprovementWebhookStore;
    billingStore?: Pick<BillingStore, "getBillingSummaryForProject">;
    operationalEmailDeliveryStore?: Pick<
      OperationalEmailDeliveryStore,
      "queueProjectOperationalEmailDelivery"
    >;
    fallbackTargetUrl?: string | null;
    fallbackSigningSecret?: string | null;
    project_id: string;
    opportunity_id: string;
    occurred_at: string;
    service_name: string;
    environment: string;
    severity: "low" | "medium" | "high" | "critical";
    title: string;
    bundle_link: string | null;
    project_link: string | null;
  }
): Promise<void> {
  if (input.webhookDeliveryStore === undefined) {
    return;
  }

  const matching = await input.webhookDeliveryStore.listMatchingWebhooks({
    project_id: input.project_id,
    event_type: "improvement_bundle.created",
    environment: input.environment,
    service_name: input.service_name,
    severity: input.severity,
    bundle_type: "improvement",
    is_verification: false
  });

  const fallback =
    input.fallbackTargetUrl !== null &&
    input.fallbackTargetUrl !== undefined &&
    input.fallbackSigningSecret !== null &&
    input.fallbackSigningSecret !== undefined
      ? [
          {
            webhook_id: `fallback-${input.project_id}`,
            target_url: input.fallbackTargetUrl,
            signing_secret: input.fallbackSigningSecret
          }
        ]
      : [];

  const targets = matching.length > 0 ? matching : fallback;
  let remainingWebhookDeliveries: number | null = null;
  let webhookAllowanceUsed: number | null = null;
  let webhookAllowanceLimit: number | null = null;
  let webhookUsageWindowStartsAt: string | null = null;
  let webhookUsageWindowEndsAt: string | null = null;
  if (input.billingStore !== undefined) {
    const billingSummary = await input.billingStore.getBillingSummaryForProject({
      project_id: input.project_id,
      now: new Date().toISOString()
    });
    const allowance = billingSummary?.allowances.monthly_webhook_deliveries;
    if (billingSummary !== null && allowance !== undefined) {
      remainingWebhookDeliveries = Math.max(0, allowance.limit - allowance.used);
      webhookAllowanceUsed = allowance.used;
      webhookAllowanceLimit = allowance.limit;
      webhookUsageWindowStartsAt = billingSummary.usage_window.starts_at;
      webhookUsageWindowEndsAt = billingSummary.usage_window.ends_at;
    }
  }

  for (const target of targets) {
    if (remainingWebhookDeliveries !== null && remainingWebhookDeliveries <= 0) {
      if (input.operationalEmailDeliveryStore !== undefined && webhookAllowanceLimit !== null) {
        await queueAllowanceLimitReachedNotification({
          store: input.operationalEmailDeliveryStore,
          project_id: input.project_id,
          meter: "monthly_webhook_deliveries",
          used: webhookAllowanceUsed ?? webhookAllowanceLimit,
          limit: webhookAllowanceLimit,
          usage_window_starts_at: webhookUsageWindowStartsAt,
          usage_window_ends_at: webhookUsageWindowEndsAt
        });
      }
      break;
    }

    const delivery = await input.webhookDeliveryStore.createDeliveryIntent({
      webhook_id: target.webhook_id,
      project_id: input.project_id,
      incident_id: null,
      event_type: "improvement_bundle.created",
      occurred_at: input.occurred_at,
      target_url: target.target_url,
      signing_secret: target.signing_secret,
      payload: {
        event: "improvement_bundle.created",
        event_type: "improvement_bundle.created",
        incident_id: null,
        improvement_id: input.opportunity_id,
        project_id: input.project_id,
        occurred_at: input.occurred_at,
        service: input.service_name,
        environment: input.environment,
        severity: input.severity,
        bundle_type: "improvement",
        verification: false,
        summary: input.title,
        links: {
          bundle: input.bundle_link,
          project: input.project_link
        },
        regression_after_deploy: false,
        deploy_version: null,
        deploy_commit_sha: null,
        deploy_branch: null,
        deploy_deployed_at: null,
        minutes_since_deploy: null
      }
    });
    await recordProjectMetricDeltas(input, {
      projectId: input.project_id,
      occurredAt: input.occurred_at,
      source: "webhook_delivery_created",
      dedupeKey: `webhook_delivery_created:${delivery.delivery_id}`,
      deltas: {
        webhook_deliveries_created: 1
      }
    });

    if (remainingWebhookDeliveries !== null) {
      const previousUsed = webhookAllowanceUsed ?? 0;
      remainingWebhookDeliveries -= 1;
      webhookAllowanceUsed = previousUsed + 1;
      if (input.operationalEmailDeliveryStore !== undefined && webhookAllowanceLimit !== null) {
        await queueAllowanceThresholdNotifications({
          store: input.operationalEmailDeliveryStore,
          project_id: input.project_id,
          meter: "monthly_webhook_deliveries",
          previous_used: previousUsed,
          next_used: webhookAllowanceUsed,
          limit: webhookAllowanceLimit,
          usage_window_starts_at: webhookUsageWindowStartsAt,
          usage_window_ends_at: webhookUsageWindowEndsAt
        });
      }
    }
  }
}
