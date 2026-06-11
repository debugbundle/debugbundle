import type { BillingStore } from "./billing-store.js";
import type { AccountAnalyticsStore } from "./account-analytics-store.js";
import type { IncidentLifecycleService, IncidentRetrievalRecord, WebhookEventType } from "./types.js";
import { queueAllowanceLimitReachedNotification, queueAllowanceThresholdNotifications } from "./operational-email-notifications.js";
import type { OperationalEmailDeliveryStore } from "./types.js";

type IncidentResolutionInput = {
  organization_id: string;
  incident_id: string;
  resolved_by_member_id: string;
  resolved_at: string;
};

type IncidentBulkResolutionInput = {
  organization_id: string;
  incident_ids: string[];
  resolved_by_member_id: string;
  resolved_at: string;
};

type IncidentReopenInput = {
  organization_id: string;
  incident_id: string;
};

type IncidentBulkReopenInput = {
  organization_id: string;
  incident_ids: string[];
};

type IncidentResolutionStore = {
  resolveIncidentForOrganization(input: IncidentResolutionInput): Promise<IncidentRetrievalRecord | null>;
  resolveIncidentsForOrganization(input: IncidentBulkResolutionInput): Promise<IncidentRetrievalRecord[]>;
  reopenIncidentForOrganization(input: IncidentReopenInput): Promise<IncidentRetrievalRecord | null>;
  reopenIncidentsForOrganization(input: IncidentBulkReopenInput): Promise<IncidentRetrievalRecord[]>;
};

type IncidentDerivedImprovementStore = {
  resolveIncidentDerivedImprovementsForIncident?(input: IncidentResolutionInput): Promise<number>;
};

type IncidentLifecycleWebhookStore = {
  listMatchingWebhooks(input: {
    project_id: string;
    event_type: WebhookEventType;
    environment?: string;
    service_name?: string;
    severity?: "low" | "medium" | "high" | "critical";
    bundle_type?: "failure" | "improvement";
    is_verification?: boolean;
  }): Promise<Array<{ webhook_id: string; target_url: string; signing_secret: string }>>;
  createDeliveryIntent(input: {
    webhook_id: string;
    project_id: string;
    incident_id: string | null;
    event_type: WebhookEventType;
    occurred_at: string;
    target_url: string;
    signing_secret: string;
    payload: Record<string, unknown>;
  }): Promise<{ delivery_id: string }>;
};

interface CreateIncidentLifecycleServiceInput {
  incidentStore: IncidentResolutionStore;
  improvementStore?: IncidentDerivedImprovementStore;
  webhookDeliveryStore: IncidentLifecycleWebhookStore;
  fallbackTargetUrl: string | null;
  fallbackSigningSecret: string | null;
  accountAnalyticsStore?: Pick<AccountAnalyticsStore, "recordMetricDeltas">;
  billingStore?: Pick<BillingStore, "getBillingSummaryForProject">;
  operationalEmailDeliveryStore?: Pick<OperationalEmailDeliveryStore, "queueProjectOperationalEmailDelivery">;
}

function buildLifecyclePayload(eventType: WebhookEventType, incident: IncidentRetrievalRecord): Record<string, unknown> {
  return {
    event: eventType,
    event_type: eventType,
    incident_id: incident.incident_id,
    project_id: incident.project_id,
    occurred_at: incident.resolved_at,
    service: incident.service_name,
    environment: incident.environment,
    severity: incident.severity,
    bundle_type: "failure",
    verification: false,
    summary: incident.title,
    links: {
      bundle: `/v1/incidents/${incident.incident_id}/bundle`,
      reproduction: `/v1/incidents/${incident.incident_id}/reproduction`
    },
    regression_after_deploy: false,
    deploy_version: null,
    deploy_commit_sha: null,
    deploy_branch: null,
    deploy_deployed_at: null,
    minutes_since_deploy: null
  };
}

async function publishResolvedWebhook(
  input: CreateIncidentLifecycleServiceInput,
  organizationId: string,
  incident: IncidentRetrievalRecord
): Promise<void> {
  const resolvedAt = incident.resolved_at;
  if (resolvedAt == null) {
    return;
  }

  const matching = await input.webhookDeliveryStore.listMatchingWebhooks({
    project_id: incident.project_id,
    event_type: "bundle.resolved",
    environment: incident.environment,
    ...(incident.service_name !== null ? { service_name: incident.service_name } : {}),
    severity: incident.severity,
    bundle_type: "failure",
    is_verification: false
  });

  const fallback =
    input.fallbackTargetUrl !== null && input.fallbackSigningSecret !== null
      ? [
          {
            webhook_id: `fallback-${incident.project_id}`,
            target_url: input.fallbackTargetUrl,
            signing_secret: input.fallbackSigningSecret
          }
        ]
      : [];

  const targets = matching.length > 0 ? matching : fallback;
  if (targets.length === 0) {
    return;
  }

  const payload = buildLifecyclePayload("bundle.resolved", incident);
  let remainingWebhookDeliveries: number | null = null;
  let webhookAllowanceUsed: number | null = null;
  let webhookAllowanceLimit: number | null = null;
  let webhookUsageWindowStartsAt: string | null = null;
  let webhookUsageWindowEndsAt: string | null = null;
  if (input.billingStore !== undefined) {
    const billingSummary = await input.billingStore.getBillingSummaryForProject({
      project_id: incident.project_id,
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
          project_id: incident.project_id,
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
      project_id: incident.project_id,
      incident_id: incident.incident_id,
      event_type: "bundle.resolved",
      occurred_at: resolvedAt,
      target_url: target.target_url,
      signing_secret: target.signing_secret,
      payload
    });
    await input.accountAnalyticsStore?.recordMetricDeltas({
      organization_id: organizationId,
      occurred_at: resolvedAt,
      source: "webhook_delivery_created",
      dedupe_key: `webhook_delivery_created:${delivery.delivery_id}`,
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
          project_id: incident.project_id,
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

export function createIncidentLifecycleService(input: CreateIncidentLifecycleServiceInput): IncidentLifecycleService {
  return {
    async resolveIncidentForOrganization(resolveInput: IncidentResolutionInput): Promise<IncidentRetrievalRecord | null> {
      const incident = await input.incidentStore.resolveIncidentForOrganization(resolveInput);
      if (incident === null) {
        return null;
      }

      const resolvedIncident: IncidentRetrievalRecord = incident;
      const resolvedAt = resolvedIncident["resolved_at"];
      const requestedResolvedAt = resolveInput["resolved_at"];

      if (resolvedAt === requestedResolvedAt) {
        await input.accountAnalyticsStore?.recordMetricDeltas({
          organization_id: resolveInput.organization_id,
          occurred_at: requestedResolvedAt,
          source: "incident_resolved",
          dedupe_key: `incident_resolved:${resolvedIncident.incident_id}:${requestedResolvedAt}`,
          deltas: {
            incidents_resolved: 1
          }
        });
        await publishResolvedWebhook(input, resolveInput.organization_id, resolvedIncident);
      }

      if (resolvedIncident.status === "resolved") {
        try {
          await input.improvementStore?.resolveIncidentDerivedImprovementsForIncident?.(resolveInput);
        } catch {
          // Incident resolution is the authoritative lifecycle action; improvement sync is a derived cleanup.
        }
      }

      return resolvedIncident;
    },

    async resolveIncidentsForOrganization(resolveInput: IncidentBulkResolutionInput): Promise<IncidentRetrievalRecord[]> {
      const incidents = await input.incidentStore.resolveIncidentsForOrganization(resolveInput);

      const newlyResolvedIncidentIds: string[] = [];

      for (const incident of incidents) {
        const resolvedIncident: IncidentRetrievalRecord = incident;
        const resolvedAt = resolvedIncident["resolved_at"];
        const requestedResolvedAt = resolveInput["resolved_at"];

        if (resolvedAt === requestedResolvedAt) {
          newlyResolvedIncidentIds.push(resolvedIncident.incident_id);
          await publishResolvedWebhook(input, resolveInput.organization_id, resolvedIncident);
        }

        if (resolvedIncident.status === "resolved") {
          try {
            await input.improvementStore?.resolveIncidentDerivedImprovementsForIncident?.({
              organization_id: resolveInput.organization_id,
              incident_id: resolvedIncident.incident_id,
              resolved_by_member_id: resolveInput.resolved_by_member_id,
              resolved_at: resolveInput.resolved_at
            });
          } catch {
            // Incident resolution is the authoritative lifecycle action; improvement sync is a derived cleanup.
          }
        }
      }

      if (newlyResolvedIncidentIds.length > 0) {
        await input.accountAnalyticsStore?.recordMetricDeltas({
          organization_id: resolveInput.organization_id,
          occurred_at: resolveInput.resolved_at,
          source: "incident_resolved_bulk",
          dedupe_key: `incident_resolved_bulk:${newlyResolvedIncidentIds.sort().join(",")}:${resolveInput.resolved_at}`,
          deltas: {
            incidents_resolved: newlyResolvedIncidentIds.length
          }
        });
      }

      return incidents;
    },

    async reopenIncidentForOrganization(reopenInput: IncidentReopenInput): Promise<IncidentRetrievalRecord | null> {
      const incident = await input.incidentStore.reopenIncidentForOrganization(reopenInput);
      if (incident !== null) {
        await input.accountAnalyticsStore?.recordMetricDeltas({
          organization_id: reopenInput.organization_id,
          occurred_at: new Date().toISOString(),
          source: "incident_reopened",
          dedupe_key: `incident_reopened:${incident.incident_id}`,
          deltas: {
            incidents_reopened: 1
          }
        });
      }
      return incident;
    },

    async reopenIncidentsForOrganization(reopenInput: IncidentBulkReopenInput): Promise<IncidentRetrievalRecord[]> {
      const incidents = await input.incidentStore.reopenIncidentsForOrganization(reopenInput);
      if (incidents.length > 0) {
        await input.accountAnalyticsStore?.recordMetricDeltas({
          organization_id: reopenInput.organization_id,
          occurred_at: new Date().toISOString(),
          source: "incident_reopened_bulk",
          dedupe_key: `incident_reopened_bulk:${incidents.map((incident) => incident.incident_id).sort().join(",")}`,
          deltas: {
            incidents_reopened: incidents.length
          }
        });
      }
      return incidents;
    }
  };
}
