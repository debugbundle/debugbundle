import {
  buildEmailBrandMarkUrl,
  renderAllowanceLimitReachedEmail,
  renderAllowanceWarning80Email,
  renderRetentionRotationNoticeEmail,
  renderTrialConvertedEmail,
  renderTrialEndingSoonEmail,
  renderTrialExpiredEmail,
  renderTrialStartedEmail,
  renderWebhookAutoDisabledEmail,
  type EmailTransport
} from "../../../packages/email/src/index.js";
import type { RuntimeLogger } from "../../../packages/runtime-logger/src/index.js";
import {
  getAllowanceLimitBehavior,
  getAllowanceMeterLabel,
  type AccountMetricKey
} from "../../../packages/storage/src/index.js";
import type {
  PostgresOperationalEmailDeliveryStore
} from "../../../packages/storage/src/operational-email-delivery-store.js";
import { recordProjectMetricDeltas, type WorkerAccountAnalyticsDependencies } from "./account-analytics.js";

export interface DeliverOperationalEmailWorkerDependencies extends WorkerAccountAnalyticsDependencies {
  logger?: Pick<RuntimeLogger, "warn">;
  appBaseUrl?: string | null;
  emailAssetBaseUrl?: string | null;
  operationalEmailDeliveryStore: Pick<
    PostgresOperationalEmailDeliveryStore,
    | "claimDueOperationalEmailDeliveries"
    | "getOperationalEmailDelivery"
    | "resolveOperationalEmailRecipientContext"
    | "markOperationalEmailDeliveryAttempt"
  >;
  emailTransport: EmailTransport;
}

export interface WorkerProcessResult {
  processed: boolean;
  reason?: string;
}

type AllowanceNotificationPayload = {
  meter: string;
  used: number;
  limit: number;
  usage_window_ends_at?: string | null;
} & Record<string, unknown>;

type RetentionRotationNotificationPayload = {
  rotated_owner_count: number;
  retained_bundle_limit: number;
} & Record<string, unknown>;

type WebhookAutoDisabledNotificationPayload = {
  webhook_id: string;
  target_url: string;
} & Record<string, unknown>;

type TrialStartedNotificationPayload = {
  trial_plan: "solo" | "team";
  trial_ends_at: string;
} & Record<string, unknown>;

type TrialEndingSoonNotificationPayload = {
  trial_plan: "solo" | "team";
  trial_ends_at: string;
  days_remaining: number;
} & Record<string, unknown>;

type TrialExpiredNotificationPayload = {
  trial_plan: "solo" | "team";
  trial_ended_at: string;
} & Record<string, unknown>;

type TrialConvertedNotificationPayload = {
  trial_plan: "solo" | "team";
  paid_plan: "solo" | "team";
} & Record<string, unknown>;

function isAllowanceMeter(value: string): value is Parameters<typeof getAllowanceMeterLabel>[0] {
  return (
    value === "monthly_bundle_requests" ||
    value === "monthly_raw_ingested_events" ||
    value === "retained_bundle_cap" ||
    value === "monthly_remote_activations" ||
    value === "monthly_alert_deliveries" ||
    value === "monthly_webhook_deliveries"
  );
}

export async function processNextDeliverOperationalEmailJob(
  dependencies: DeliverOperationalEmailWorkerDependencies
): Promise<WorkerProcessResult> {
  const claimed = await dependencies.operationalEmailDeliveryStore.claimDueOperationalEmailDeliveries(1);
  const next = claimed[0];
  if (next === undefined) {
    return { processed: false, reason: "no_jobs" };
  }

  const delivery = await dependencies.operationalEmailDeliveryStore.getOperationalEmailDelivery({
    delivery_id: next.delivery_id
  });
  if (delivery === null) {
    return { processed: true };
  }

  const recipientContext = await dependencies.operationalEmailDeliveryStore.resolveOperationalEmailRecipientContext({
    organization_id: delivery.organization_id,
    project_id: delivery.project_id
  });
  if (recipientContext === null) {
    await dependencies.operationalEmailDeliveryStore.markOperationalEmailDeliveryAttempt({
      delivery_id: delivery.delivery_id,
      attempt: next.attempt,
      delivered: false,
      error_message: "operational_email_recipient_missing"
    });
    return { processed: true };
  }

  try {
    const billingUrl =
      dependencies.appBaseUrl === null || dependencies.appBaseUrl === undefined
        ? undefined
        : `${dependencies.appBaseUrl}/billing`;
    const webhooksUrl =
      dependencies.appBaseUrl === null ||
      dependencies.appBaseUrl === undefined ||
      delivery.project_id === null
        ? undefined
        : `${dependencies.appBaseUrl}/projects/${delivery.project_id}/webhooks`;
    const brandMarkUrl = buildEmailBrandMarkUrl(
      dependencies.emailAssetBaseUrl ?? dependencies.appBaseUrl
    );

    let rendered: { subject: string; text: string; html: string };
    switch (delivery.kind) {
      case "webhook_auto_disabled": {
        const payload = delivery.payload as WebhookAutoDisabledNotificationPayload;
        if (typeof payload.webhook_id !== "string" || typeof payload.target_url !== "string") {
          throw new Error("operational_email_invalid_webhook_auto_disabled_payload");
        }
        if (recipientContext.project_name === null) {
          throw new Error("operational_email_project_missing");
        }
        rendered = renderWebhookAutoDisabledEmail({
          organizationName: recipientContext.organization_name,
          projectName: recipientContext.project_name,
          webhookId: payload.webhook_id,
          targetUrl: payload.target_url,
          ...(brandMarkUrl === undefined ? {} : { brandMarkUrl }),
          ...(webhooksUrl === undefined ? {} : { webhooksUrl })
        });
        break;
      }
      case "allowance_warning_80":
      case "allowance_limit_reached": {
        const payload = delivery.payload as AllowanceNotificationPayload;
        if (
          typeof payload.meter !== "string" ||
          !isAllowanceMeter(payload.meter) ||
          typeof payload.used !== "number" ||
          typeof payload.limit !== "number"
        ) {
          throw new Error("operational_email_invalid_allowance_payload");
        }
        if (recipientContext.project_name === null) {
          throw new Error("operational_email_project_missing");
        }

        const usageWindowEndsAt =
          typeof payload.usage_window_ends_at === "string" || payload.usage_window_ends_at === null
            ? payload.usage_window_ends_at
            : undefined;
        const allowanceInput = {
          organizationName: recipientContext.organization_name,
          projectName: recipientContext.project_name,
          meterLabel: getAllowanceMeterLabel(payload.meter),
          used: payload.used,
          limit: payload.limit,
          currentBehavior: getAllowanceLimitBehavior(payload.meter),
          ...(brandMarkUrl === undefined ? {} : { brandMarkUrl }),
          ...(usageWindowEndsAt === undefined ? {} : { usageWindowEndsAt }),
          ...(billingUrl === undefined ? {} : { billingUrl })
        };

        rendered =
          delivery.kind === "allowance_warning_80"
            ? renderAllowanceWarning80Email(allowanceInput)
            : renderAllowanceLimitReachedEmail(allowanceInput);
        break;
      }
      case "retention_rotation_notice": {
        const payload = delivery.payload as RetentionRotationNotificationPayload;
        if (
          typeof payload.rotated_owner_count !== "number" ||
          typeof payload.retained_bundle_limit !== "number"
        ) {
          throw new Error("operational_email_invalid_retention_rotation_payload");
        }
        if (recipientContext.project_name === null) {
          throw new Error("operational_email_project_missing");
        }

        rendered = renderRetentionRotationNoticeEmail({
          organizationName: recipientContext.organization_name,
          projectName: recipientContext.project_name,
          rotatedOwnerCount: payload.rotated_owner_count,
          retainedBundleLimit: payload.retained_bundle_limit,
          ...(brandMarkUrl === undefined ? {} : { brandMarkUrl }),
          ...(billingUrl === undefined ? {} : { billingUrl })
        });
        break;
      }
      case "trial_started": {
        const payload = delivery.payload as TrialStartedNotificationPayload;
        if (
          (payload.trial_plan !== "solo" && payload.trial_plan !== "team") ||
          typeof payload.trial_ends_at !== "string" ||
          billingUrl === undefined
        ) {
          throw new Error("operational_email_invalid_trial_started_payload");
        }

        rendered = renderTrialStartedEmail({
          organizationName: recipientContext.organization_name,
          trialPlan: payload.trial_plan,
          trialEndsAt: payload.trial_ends_at,
          billingUrl,
          ...(brandMarkUrl === undefined ? {} : { brandMarkUrl })
        });
        break;
      }
      case "trial_ending_soon": {
        const payload = delivery.payload as TrialEndingSoonNotificationPayload;
        if (
          (payload.trial_plan !== "solo" && payload.trial_plan !== "team") ||
          typeof payload.trial_ends_at !== "string" ||
          typeof payload.days_remaining !== "number" ||
          billingUrl === undefined
        ) {
          throw new Error("operational_email_invalid_trial_ending_soon_payload");
        }

        rendered = renderTrialEndingSoonEmail({
          organizationName: recipientContext.organization_name,
          trialPlan: payload.trial_plan,
          trialEndsAt: payload.trial_ends_at,
          daysRemaining: payload.days_remaining,
          billingUrl,
          ...(brandMarkUrl === undefined ? {} : { brandMarkUrl })
        });
        break;
      }
      case "trial_expired": {
        const payload = delivery.payload as TrialExpiredNotificationPayload;
        if (
          (payload.trial_plan !== "solo" && payload.trial_plan !== "team") ||
          typeof payload.trial_ended_at !== "string" ||
          billingUrl === undefined
        ) {
          throw new Error("operational_email_invalid_trial_expired_payload");
        }

        rendered = renderTrialExpiredEmail({
          organizationName: recipientContext.organization_name,
          trialPlan: payload.trial_plan,
          trialEndedAt: payload.trial_ended_at,
          billingUrl,
          ...(brandMarkUrl === undefined ? {} : { brandMarkUrl })
        });
        break;
      }
      case "trial_converted": {
        const payload = delivery.payload as TrialConvertedNotificationPayload;
        if (
          (payload.trial_plan !== "solo" && payload.trial_plan !== "team") ||
          (payload.paid_plan !== "solo" && payload.paid_plan !== "team") ||
          billingUrl === undefined
        ) {
          throw new Error("operational_email_invalid_trial_converted_payload");
        }

        rendered = renderTrialConvertedEmail({
          organizationName: recipientContext.organization_name,
          trialPlan: payload.trial_plan,
          paidPlan: payload.paid_plan,
          billingUrl,
          ...(brandMarkUrl === undefined ? {} : { brandMarkUrl })
        });
        break;
      }
    }

    await dependencies.emailTransport.send({
      to: [recipientContext.recipient_email],
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html
    });

    await dependencies.operationalEmailDeliveryStore.markOperationalEmailDeliveryAttempt({
      delivery_id: delivery.delivery_id,
      attempt: next.attempt,
      delivered: true,
      error_message: null
    });
    if (delivery.project_id !== null) {
      const deltas: Partial<Record<AccountMetricKey, number>> = {
        operational_emails_sent: 1
      };
      if (delivery.kind === "allowance_warning_80") {
        deltas["allowance_warning_emails_sent"] = 1;
      } else if (delivery.kind === "allowance_limit_reached") {
        deltas["allowance_limit_emails_sent"] = 1;
      }

      await recordProjectMetricDeltas(dependencies, {
        projectId: delivery.project_id,
        occurredAt: delivery.created_at,
        source: "operational_email_result",
        dedupeKey: `operational_email_result:${delivery.delivery_id}:delivered`,
        deltas
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    dependencies.logger?.warn(
      {
        delivery_id: delivery.delivery_id,
        error_message: errorMessage,
        kind: delivery.kind
      },
      "operational_email_delivery_failed"
    );

    await dependencies.operationalEmailDeliveryStore.markOperationalEmailDeliveryAttempt({
      delivery_id: delivery.delivery_id,
      attempt: next.attempt,
      delivered: false,
      error_message: errorMessage
    });
  }

  return { processed: true };
}
