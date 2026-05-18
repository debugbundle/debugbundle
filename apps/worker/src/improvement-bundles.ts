import { gunzipSync, gzipSync } from "node:zlib";

import type {
  BillingStore,
  ImprovementOpportunityStore,
  ObjectStoreClient,
  ObjectStoreReader,
  OperationalEmailDeliveryStore,
  RetainedBundleOwnerReference,
  WebhookDeliveryStore
} from "../../../packages/storage/src/index.js";
import {
  buildBundleObjectKey,
  buildImprovementBundleObjectKey,
  buildRawEventObjectKey,
  buildReproductionObjectKey,
  queueAllowanceLimitReachedNotification,
  queueAllowanceThresholdNotifications,
  queueRetentionRotationNotice
} from "../../../packages/storage/src/index.js";
import { BundleV1Schema, getTierCapabilities, type EventClass, type EventEnvelope } from "../../../packages/shared-types/src/index.js";
import type { NormalizedEvent } from "../../../packages/event-normalizer/src/index.js";
import { validateEvent } from "../../../packages/event-normalizer/src/index.js";

type ImprovementWebhookStore = Pick<WebhookDeliveryStore, "listMatchingWebhooks" | "createDeliveryIntent">;

async function deletePrunedBundleArtifacts(input: {
  objectStore: Pick<Partial<ObjectStoreClient>, "deleteObject">;
  owner: RetainedBundleOwnerReference;
}): Promise<void> {
  if (input.owner.owner_type === "incident") {
    await input.objectStore.deleteObject?.({
      key: buildBundleObjectKey(input.owner.project_id, input.owner.incident_id)
    });

    await input.objectStore.deleteObject?.({
      key: buildReproductionObjectKey(input.owner.project_id, input.owner.incident_id)
    });

    return;
  }

  await input.objectStore.deleteObject?.({
    key: buildImprovementBundleObjectKey(input.owner.project_id, input.owner.improvement_opportunity_id)
  });
}

export interface ImprovementBundleWorkerDependencies {
  improvementOpportunityStore?: ImprovementOpportunityStore;
  billingStore?: Pick<BillingStore, "getBillingSummaryForProject">;
  webhookDeliveryStore?: ImprovementWebhookStore;
  operationalEmailDeliveryStore?: Pick<OperationalEmailDeliveryStore, "queueProjectOperationalEmailDelivery">;
  fallbackTargetUrl?: string | null;
  fallbackSigningSecret?: string | null;
  objectStore: ObjectStoreReader & Partial<ObjectStoreClient>;
  apiBaseUrl?: string | null;
  appBaseUrl?: string | null;
  docsBaseUrl?: string | null;
}

function isWarningLogEvent(event: EventEnvelope): event is Extract<EventEnvelope, { event_type: "log_event" }> {
  return event.event_type === "log_event" && event.payload.level === "warning";
}

function isRequestEvent(event: EventEnvelope): event is Extract<EventEnvelope, { event_type: "request_event" }> {
  return event.event_type === "request_event";
}

interface ImprovementRuleThresholds {
  occurrence_threshold: number;
  slow_request_duration_threshold_ms: number;
}

type RecordedImprovementCandidate = {
  opportunity_id: string;
  occurrence_count: number;
  bundle_generation_number: number;
  should_generate_bundle: boolean;
};

function getImprovementRuleThresholds(value: "high_confidence" | "balanced" | "verbose"): ImprovementRuleThresholds {
  switch (value) {
    case "high_confidence":
      return {
        occurrence_threshold: 10,
        slow_request_duration_threshold_ms: 2_500
      };
    case "verbose":
      return {
        occurrence_threshold: 3,
        slow_request_duration_threshold_ms: 1_000
      };
    default:
      return {
        occurrence_threshold: 5,
        slow_request_duration_threshold_ms: 1_500
      };
  }
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.replace(/\/+$/, "");
}

function createHostedImprovementConfidence(occurrenceCount: number, threshold: number): number {
  const progress = Math.min(1, occurrenceCount / Math.max(threshold * 2, 1));
  return Math.round((0.55 + progress * 0.35) * 100) / 100;
}

function createHostedImprovementSeverity(occurrenceCount: number): "medium" | "high" {
  return occurrenceCount >= 10 ? "high" : "medium";
}

function createHostedRequestFailureSeverity(responseStatus: number, occurrenceCount: number): "medium" | "high" {
  return responseStatus >= 500 || occurrenceCount >= 10 ? "high" : "medium";
}

function createHostedSlowRequestSeverity(durationMs: number, thresholdMs: number, occurrenceCount: number): "medium" | "high" {
  return durationMs >= thresholdMs * 2 || occurrenceCount >= 10 ? "high" : "medium";
}

function parseEventEnvelopeFromRaw(rawBody: Buffer): EventEnvelope | null {
  try {
    const parsed = JSON.parse(gunzipSync(rawBody).toString("utf8")) as unknown;
    const validated = validateEvent(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

async function loadSampleLogItems(input: {
  objectStore: ObjectStoreReader;
  projectId: string;
  references: Array<{ event_id: string; occurred_at: string }>;
}): Promise<Array<{ level: string; message: string; timestamp: string; attributes: Record<string, unknown> }>> {
  const items: Array<{ level: string; message: string; timestamp: string; attributes: Record<string, unknown> }> = [];

  for (const reference of input.references) {
    const key = buildRawEventObjectKey({
      projectId: input.projectId,
      eventId: reference.event_id,
      occurredAt: new Date(reference.occurred_at)
    });

    try {
      const rawBody = await input.objectStore.getObject({ key });
      const envelope = parseEventEnvelopeFromRaw(rawBody);
      if (envelope === null || envelope.event_type !== "log_event") {
        continue;
      }

      items.push({
        level: envelope.payload.level,
        message: envelope.payload.message,
        timestamp: envelope.occurred_at,
        attributes: envelope.payload.attributes
      });
    } catch {
      // Raw-event lookup failures should not block deterministic improvement generation.
    }
  }

  return items.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

async function loadRepresentativeRequestContext(input: {
  objectStore: ObjectStoreReader;
  projectId: string;
  references: Array<{ event_id: string; occurred_at: string }>;
}): Promise<{
  request: {
    version: 1;
    method: string;
    path: string;
    route_template: string | null;
    query: Record<string, unknown>;
    headers: Record<string, unknown>;
    body: unknown;
    request_id: string | null;
  } | null;
  response: {
    version: 1;
    status_code: number;
    duration_ms: number | null;
    headers?: Record<string, unknown>;
    body?: unknown;
  } | null;
}> {
  for (const reference of [...input.references].reverse()) {
    const key = buildRawEventObjectKey({
      projectId: input.projectId,
      eventId: reference.event_id,
      occurredAt: new Date(reference.occurred_at)
    });

    try {
      const rawBody = await input.objectStore.getObject({ key });
      const envelope = parseEventEnvelopeFromRaw(rawBody);
      if (envelope === null || envelope.event_type !== "request_event") {
        continue;
      }

      return {
        request: {
          version: 1,
          method: envelope.payload.method,
          path: envelope.payload.path,
          route_template: envelope.payload.route_template ?? null,
          query: envelope.payload.query,
          headers: envelope.payload.headers,
          body: envelope.payload.body ?? null,
          request_id: null
        },
        response: {
          version: 1,
          status_code: envelope.payload.response_status,
          duration_ms: envelope.payload.duration_ms,
          ...(envelope.payload.response_headers === undefined ? {} : { headers: envelope.payload.response_headers }),
          ...(envelope.payload.response_body === undefined ? {} : { body: envelope.payload.response_body })
        }
      };
    } catch {
      // Raw-event lookup failures should not block deterministic improvement generation.
    }
  }

  return {
    request: null,
    response: null
  };
}

async function publishImprovementBundleCreated(input: {
  webhookDeliveryStore?: ImprovementWebhookStore;
  billingStore?: Pick<BillingStore, "getBillingSummaryForProject">;
  operationalEmailDeliveryStore?: Pick<OperationalEmailDeliveryStore, "queueProjectOperationalEmailDelivery">;
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
}): Promise<void> {
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
    input.fallbackTargetUrl !== null && input.fallbackTargetUrl !== undefined && input.fallbackSigningSecret !== null && input.fallbackSigningSecret !== undefined
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

    await input.webhookDeliveryStore.createDeliveryIntent({
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

async function buildHostedImprovementBundle(input: {
  context: NonNullable<Awaited<ReturnType<NonNullable<ImprovementOpportunityStore["getImprovementBundleBuildContext"]>>>>;
  references: Array<{ event_id: string; event_type: EventEnvelope["event_type"]; occurred_at: string }>;
  thresholds: ImprovementRuleThresholds;
  objectStore: ObjectStoreReader;
  reserved: {
    generation_number: number;
    created_at: string;
    updated_at: string;
  };
  apiBaseUrl: string | null;
  appBaseUrl: string | null;
  docsBaseUrl: string | null;
}): Promise<ReturnType<typeof BundleV1Schema.parse>> {
  const baseBundle = {
    bundle_version: 1 as const,
    bundle_id: `improvement_bundle_${input.context.opportunity_id}`,
    bundle_type: "improvement" as const,
    captured_at: input.reserved.updated_at,
    sdk: {
      name: "debugbundle-worker",
      version: "0.1.0"
    },
    project: {
      id: input.context.project_id,
      slug: input.context.project_slug,
      environment: input.context.environment
    },
    service: {
      id: input.context.service_id ?? `improvement_service_${input.context.opportunity_id}`,
      name: input.context.service_name,
      runtime: input.context.service_runtime,
      framework: input.context.service_framework,
      version: null,
      region: null
    },
    reproduction: {
      possible: false,
      confidence: 0,
      reason: "reproduction_not_generated",
      artifacts: null,
      feasibility_reference: null
    },
    verification: {
      verification_type: null,
      synthetic: false,
      local_verified: false,
      production_verified: false
    },
    links: {
      self:
        input.apiBaseUrl === null
          ? null
          : `${input.apiBaseUrl}/v1/projects/${input.context.project_id}/improvements/${input.context.opportunity_id}/bundle`,
      reproduction: null,
      incident: null,
      project:
        input.appBaseUrl === null ? null : `${input.appBaseUrl}/projects/${input.context.project_id}/improvements/${input.context.opportunity_id}`,
      docs: input.docsBaseUrl === null ? null : `${input.docsBaseUrl}/bundles`
    },
    redaction: {
      redacted: true,
      fields: [],
      notes: null
    },
    metadata: {
      created_at: input.reserved.created_at,
      updated_at: input.reserved.updated_at,
      generator_version: "worker-improvement-bundle-v1",
      generation_number: input.reserved.generation_number
    }
  };

  if (input.context.kind === "warning_hotspot") {
    const logItems = await loadSampleLogItems({
      objectStore: input.objectStore,
      projectId: input.context.project_id,
      references: input.references
    });
    const severity = createHostedImprovementSeverity(input.context.occurrence_count);
    const confidence = createHostedImprovementConfidence(input.context.occurrence_count, input.thresholds.occurrence_threshold);
    const normalizedMessage =
      typeof input.context.evidence["normalized_message"] === "string" ? input.context.evidence["normalized_message"] : input.context.title;

    return BundleV1Schema.parse({
      ...baseBundle,
      signal: {
        signal_id: input.context.opportunity_id,
        signal_type: "warning",
        severity,
        fingerprint: input.context.fingerprint,
        first_seen_at: input.context.first_detected_at,
        last_seen_at: input.context.last_detected_at,
        occurrence_count: input.context.occurrence_count,
        source_event_types: ["log_event"]
      },
      summary: {
        title: input.context.title,
        description: `Repeated warning log pattern detected ${input.context.occurrence_count} times for ${input.context.service_name} in ${input.context.environment}.`,
        likely_cause: `The same warning keeps repeating: ${normalizedMessage}.`,
        confidence,
        recommended_action: "Inspect the repeated warning path, remove the noisy condition, and verify the warning no longer recurs under normal traffic.",
        severity,
        error_type: "log_event",
        error_message: normalizedMessage,
        first_application_frame: null,
        primary_signal: "warning",
        signals: {
          new_deploy: false,
          regression_suspected: false,
          customer_visible: false
        }
      },
      impact: {
        affected_users_estimate: null,
        affected_requests_estimate: null,
        business_criticality: severity,
        customer_visible: false,
        regression_suspected: false
      },
      context: {
        error: null,
        request: null,
        response: null,
        logs: {
          version: 1,
          items: logItems
        },
        frontend: null,
        environment: null,
        deploy: null,
        runtime: null,
        git: null,
        dependencies: null,
        probe_data: {
          version: 1,
          items: []
        },
        device: null
      }
    });
  }

  if (input.context.kind === "recurring_incident" || input.context.kind === "post_deploy_regression") {
    const severity = input.context.severity;
    const confidence = input.context.confidence;
    const incidentTitle = typeof input.context.evidence["incident_title"] === "string" ? input.context.evidence["incident_title"] : input.context.title;
    const regressionDeploy =
      typeof input.context.evidence["regression_deploy"] === "object" && input.context.evidence["regression_deploy"] !== null
        ? (input.context.evidence["regression_deploy"] as Record<string, unknown>)
        : null;
    const deploy =
      regressionDeploy === null
        ? null
        : {
            version: 1 as const,
            commit_sha: typeof regressionDeploy["commit_sha"] === "string" ? regressionDeploy["commit_sha"] : null,
            deploy_version: typeof regressionDeploy["version"] === "string" ? regressionDeploy["version"] : null,
            branch: typeof regressionDeploy["branch"] === "string" ? regressionDeploy["branch"] : null,
            deployed_at: typeof regressionDeploy["deployed_at"] === "string" ? regressionDeploy["deployed_at"] : null,
            regression_window: true
          };
    const regressionSuspected = input.context.kind === "post_deploy_regression";

    return BundleV1Schema.parse({
      ...baseBundle,
      signal: {
        signal_id: input.context.opportunity_id,
        signal_type: regressionSuspected ? "performance_issue" : "warning",
        severity,
        fingerprint: input.context.fingerprint,
        first_seen_at: input.context.first_detected_at,
        last_seen_at: input.context.last_detected_at,
        occurrence_count: input.context.occurrence_count,
        source_event_types: input.references.map((reference) => reference.event_type)
      },
      summary: {
        title: input.context.title,
        description: input.context.summary,
        likely_cause: regressionSuspected
          ? "The incident reappeared inside the deploy regression window."
          : "The same incident has crossed the recurring-incident threshold.",
        confidence,
        recommended_action: regressionSuspected
          ? "Compare the deploy diff against the incident fingerprint, verify the changed code path, and ship a targeted fix or rollback."
          : "Review the incident bundle history, remove the recurring trigger, and add a guardrail that prevents the same fingerprint from reopening.",
        severity,
        error_type: "incident",
        error_message: incidentTitle,
        first_application_frame: null,
        primary_signal: regressionSuspected ? "post_deploy_regression" : "recurring_incident",
        signals: {
          new_deploy: regressionSuspected,
          regression_suspected: regressionSuspected,
          customer_visible: severity === "high" || severity === "critical"
        }
      },
      impact: {
        affected_users_estimate: null,
        affected_requests_estimate: input.context.occurrence_count,
        business_criticality: severity,
        customer_visible: severity === "high" || severity === "critical",
        regression_suspected: regressionSuspected
      },
      context: {
        error: null,
        request: null,
        response: null,
        logs: null,
        frontend: null,
        environment: null,
        deploy,
        runtime: null,
        git: null,
        dependencies: null,
        probe_data: {
          version: 1,
          items: []
        },
        device: null
      }
    });
  }

  const representativeRequest = await loadRepresentativeRequestContext({
    objectStore: input.objectStore,
    projectId: input.context.project_id,
    references: input.references
      .filter((reference) => reference.event_type === "request_event")
      .map((reference) => ({ event_id: reference.event_id, occurred_at: reference.occurred_at }))
  });
  const routeTemplate = typeof input.context.evidence["route_template"] === "string" ? input.context.evidence["route_template"] : "/";
  const httpMethod = typeof input.context.evidence["http_method"] === "string" ? input.context.evidence["http_method"] : "GET";
  const responseStatus =
    typeof input.context.evidence["response_status"] === "number" ? input.context.evidence["response_status"] : 0;
  const durationMs = typeof input.context.evidence["duration_ms"] === "number" ? input.context.evidence["duration_ms"] : null;

  if (input.context.kind === "request_failure_pattern") {
    const severity = createHostedRequestFailureSeverity(responseStatus, input.context.occurrence_count);
    const confidence = createHostedImprovementConfidence(input.context.occurrence_count, input.thresholds.occurrence_threshold);

    return BundleV1Schema.parse({
      ...baseBundle,
      signal: {
        signal_id: input.context.opportunity_id,
        signal_type: "request_failure",
        severity,
        fingerprint: input.context.fingerprint,
        first_seen_at: input.context.first_detected_at,
        last_seen_at: input.context.last_detected_at,
        occurrence_count: input.context.occurrence_count,
        source_event_types: ["request_event"]
      },
      summary: {
        title: input.context.title,
        description: `Repeated request failures detected ${input.context.occurrence_count} times for ${httpMethod} ${routeTemplate} in ${input.context.environment}.`,
        likely_cause: `The same request path is returning ${responseStatus} repeatedly.`,
        confidence,
        recommended_action: "Inspect the failing route, validate upstream dependencies and input handling, and confirm the status pattern no longer repeats under normal traffic.",
        severity,
        error_type: "request_event",
        error_message: `${httpMethod} ${routeTemplate} returned ${responseStatus}`,
        first_application_frame: null,
        primary_signal: "request_failure",
        signals: {
          new_deploy: false,
          regression_suspected: false,
          customer_visible: responseStatus >= 500 || responseStatus === 429
        }
      },
      impact: {
        affected_users_estimate: null,
        affected_requests_estimate: input.context.occurrence_count,
        business_criticality: severity,
        customer_visible: responseStatus >= 500 || responseStatus === 429,
        regression_suspected: false
      },
      context: {
        error: null,
        request: representativeRequest.request,
        response: representativeRequest.response,
        logs: null,
        frontend: null,
        environment: null,
        deploy: null,
        runtime: null,
        git: null,
        dependencies: null,
        probe_data: {
          version: 1,
          items: []
        },
        device: null
      }
    });
  }

  const severity = createHostedSlowRequestSeverity(
    durationMs ?? input.thresholds.slow_request_duration_threshold_ms,
    input.thresholds.slow_request_duration_threshold_ms,
    input.context.occurrence_count
  );
  const confidence = createHostedImprovementConfidence(input.context.occurrence_count, input.thresholds.occurrence_threshold);

  return BundleV1Schema.parse({
    ...baseBundle,
    signal: {
      signal_id: input.context.opportunity_id,
      signal_type: "warning",
      severity,
      fingerprint: input.context.fingerprint,
      first_seen_at: input.context.first_detected_at,
      last_seen_at: input.context.last_detected_at,
      occurrence_count: input.context.occurrence_count,
      source_event_types: ["request_event"]
    },
    summary: {
      title: input.context.title,
      description: `Repeated slow requests detected ${input.context.occurrence_count} times for ${httpMethod} ${routeTemplate} in ${input.context.environment}.`,
      likely_cause: `The route is repeatedly exceeding the ${input.thresholds.slow_request_duration_threshold_ms}ms slow-request threshold.`,
      confidence,
      recommended_action: "Inspect the request path, profile the slow dependency or query, and verify the route stays below the expected latency threshold under normal traffic.",
      severity,
      error_type: "request_event",
      error_message: durationMs === null ? `${httpMethod} ${routeTemplate} is slow` : `${httpMethod} ${routeTemplate} took ${durationMs}ms`,
      first_application_frame: null,
      primary_signal: "warning",
      signals: {
        new_deploy: false,
        regression_suspected: false,
        customer_visible: false
      }
    },
    impact: {
      affected_users_estimate: null,
      affected_requests_estimate: input.context.occurrence_count,
      business_criticality: severity,
      customer_visible: false,
      regression_suspected: false
    },
    context: {
      error: null,
      request: representativeRequest.request,
      response: representativeRequest.response,
      logs: null,
      frontend: null,
      environment: null,
      deploy: null,
      runtime: null,
      git: null,
      dependencies: null,
      probe_data: {
        version: 1,
        items: []
      },
      device: null
    }
  });
}

export async function maybeGenerateHostedImprovementBundle(input: {
  project_id: string;
  event: EventEnvelope;
  normalized: NormalizedEvent;
  event_class: EventClass;
  dependencies: ImprovementBundleWorkerDependencies;
}): Promise<void> {
  if (input.dependencies.improvementOpportunityStore === undefined) {
    return;
  }

  const settings = await input.dependencies.improvementOpportunityStore.getImprovementExecutionSettings(input.project_id);
  if (settings === null) {
    return;
  }

  if (!getTierCapabilities(settings.plan).cloud_improvement_bundles || !settings.automated_improvement_bundles_enabled) {
    return;
  }

  const thresholds = getImprovementRuleThresholds(settings.improvement_bundle_sensitivity);
  let recorded: {
    opportunity_id: string;
    occurrence_count: number;
    bundle_generation_number: number;
    should_generate_bundle: boolean;
  } | null = null;

  if (isWarningLogEvent(input.event)) {
    recorded = await input.dependencies.improvementOpportunityStore.recordWarningHotspot({
      project_id: input.project_id,
      service_name: input.event.service.name,
      environment: input.event.service.environment,
      normalized_message: input.normalized.normalized_message,
      source_event_id: input.event.event_id,
      occurred_at: input.event.occurred_at,
      severity: "medium",
      confidence: createHostedImprovementConfidence(thresholds.occurrence_threshold, thresholds.occurrence_threshold),
      threshold: thresholds.occurrence_threshold
    });
  } else if (isRequestEvent(input.event)) {
    if (
      input.event.payload.duration_ms >= thresholds.slow_request_duration_threshold_ms &&
      input.normalized.route_template !== null &&
      input.normalized.http_method !== null &&
      input.normalized.http_status !== null
    ) {
      recorded = await input.dependencies.improvementOpportunityStore.recordRequestPattern({
        project_id: input.project_id,
        kind: "slow_request",
        service_name: input.event.service.name,
        environment: input.event.service.environment,
        route_template: input.normalized.route_template,
        http_method: input.normalized.http_method,
        response_status: input.normalized.http_status,
        duration_ms: input.event.payload.duration_ms,
        source_event_id: input.event.event_id,
        occurred_at: input.event.occurred_at,
        severity: createHostedSlowRequestSeverity(
          input.event.payload.duration_ms,
          thresholds.slow_request_duration_threshold_ms,
          thresholds.occurrence_threshold
        ),
        confidence: createHostedImprovementConfidence(thresholds.occurrence_threshold, thresholds.occurrence_threshold),
        threshold: thresholds.occurrence_threshold,
        slow_request_duration_threshold_ms: thresholds.slow_request_duration_threshold_ms
      });
    } else if (
      input.event_class === "context_signal" &&
      input.normalized.route_template !== null &&
      input.normalized.http_method !== null &&
      input.normalized.http_status !== null &&
      input.normalized.http_status >= 400
    ) {
      recorded = await input.dependencies.improvementOpportunityStore.recordRequestPattern({
        project_id: input.project_id,
        kind: "request_failure_pattern",
        service_name: input.event.service.name,
        environment: input.event.service.environment,
        route_template: input.normalized.route_template,
        http_method: input.normalized.http_method,
        response_status: input.normalized.http_status,
        duration_ms: input.event.payload.duration_ms,
        source_event_id: input.event.event_id,
        occurred_at: input.event.occurred_at,
        severity: createHostedRequestFailureSeverity(input.normalized.http_status, thresholds.occurrence_threshold),
        confidence: createHostedImprovementConfidence(thresholds.occurrence_threshold, thresholds.occurrence_threshold),
        threshold: thresholds.occurrence_threshold
      });
    }
  }

  if (recorded === null || !recorded.should_generate_bundle) {
    return;
  }

  await generateRecordedHostedImprovementBundle({
    project_id: input.project_id,
    event_id: input.event.event_id,
    occurred_at: input.event.occurred_at,
    recorded,
    thresholds,
    dependencies: input.dependencies
  });
}

export async function maybeGenerateHostedIncidentImprovementBundle(input: {
  project_id: string;
  incident_id: string;
  event_id: string;
  event_type: EventEnvelope["event_type"];
  service_name: string;
  environment: string;
  incident_title: string;
  incident_severity: "low" | "medium" | "high" | "critical";
  incident_occurrence_count: number;
  occurred_at: string;
  regressed_now: boolean;
  regression_deploy?: {
    deployment_id: string;
    commit_sha: string | null;
    version: string | null;
    branch: string | null;
    deployed_at: string;
    minutes_since_deploy: number;
  } | null;
  dependencies: ImprovementBundleWorkerDependencies;
}): Promise<void> {
  const store = input.dependencies.improvementOpportunityStore;
  if (store?.recordIncidentPattern === undefined) {
    return;
  }

  const settings = await store.getImprovementExecutionSettings(input.project_id);
  if (settings === null) {
    return;
  }

  if (!getTierCapabilities(settings.plan).cloud_improvement_bundles || !settings.automated_improvement_bundles_enabled) {
    return;
  }

  const thresholds = getImprovementRuleThresholds(settings.improvement_bundle_sensitivity);
  const regressionDeploy = input.regression_deploy ?? null;
  const isPostDeployRegression = input.regressed_now && regressionDeploy !== null;
  const kind = isPostDeployRegression ? "post_deploy_regression" : "recurring_incident";
  const threshold = isPostDeployRegression ? 1 : thresholds.occurrence_threshold;
  const recorded = await store.recordIncidentPattern({
    project_id: input.project_id,
    kind,
    service_name: input.service_name,
    environment: input.environment,
    incident_id: input.incident_id,
    incident_title: input.incident_title,
    incident_occurrence_count: input.incident_occurrence_count,
    incident_severity: input.incident_severity,
    source_event_id: input.event_id,
    source_event_type: input.event_type,
    occurred_at: input.occurred_at,
    confidence: isPostDeployRegression
      ? 0.85
      : createHostedImprovementConfidence(input.incident_occurrence_count, thresholds.occurrence_threshold),
    threshold,
    regression_deploy: regressionDeploy
  });

  if (recorded === null || !recorded.should_generate_bundle) {
    return;
  }

  await generateRecordedHostedImprovementBundle({
    project_id: input.project_id,
    event_id: input.event_id,
    occurred_at: input.occurred_at,
    recorded,
    thresholds,
    dependencies: input.dependencies
  });
}

async function generateRecordedHostedImprovementBundle(input: {
  project_id: string;
  event_id: string;
  occurred_at: string;
  recorded: RecordedImprovementCandidate;
  thresholds: ImprovementRuleThresholds;
  dependencies: ImprovementBundleWorkerDependencies;
}): Promise<void> {
  if (input.dependencies.improvementOpportunityStore === undefined) {
    return;
  }

  const alreadyRecorded = await input.dependencies.improvementOpportunityStore.hasImprovementBundleGenerationForSourceEvent({
    opportunity_id: input.recorded.opportunity_id,
    event_id: input.event_id
  });

  let bundleRequestBillingSummary: Awaited<
    ReturnType<NonNullable<ImprovementBundleWorkerDependencies["billingStore"]>["getBillingSummaryForProject"]>
  > | null = null;
  if (!alreadyRecorded && input.dependencies.billingStore !== undefined) {
    bundleRequestBillingSummary = await input.dependencies.billingStore.getBillingSummaryForProject({
      project_id: input.project_id,
      now: new Date().toISOString()
    });
    const allowance = bundleRequestBillingSummary?.allowances.monthly_bundle_requests;
    if (bundleRequestBillingSummary !== null && allowance !== undefined && allowance.used >= allowance.limit) {
      if (input.dependencies.operationalEmailDeliveryStore !== undefined) {
        await queueAllowanceLimitReachedNotification({
          store: input.dependencies.operationalEmailDeliveryStore,
          project_id: input.project_id,
          meter: "monthly_bundle_requests",
          used: allowance.used,
          limit: allowance.limit,
          usage_window_starts_at: bundleRequestBillingSummary.usage_window.starts_at,
          usage_window_ends_at: bundleRequestBillingSummary.usage_window.ends_at
        });
      }
      await input.dependencies.improvementOpportunityStore.markImprovementBundleGenerationFailure({
        opportunity_id: input.recorded.opportunity_id,
        reason: "monthly_quota_exceeded"
      });
      return;
    }
  }

  const reserved = await input.dependencies.improvementOpportunityStore.reserveImprovementBundleGeneration({
    opportunity_id: input.recorded.opportunity_id,
    event_id: input.event_id,
    occurred_at: input.occurred_at,
    trigger: "occurrence_threshold"
  });
  const context = await input.dependencies.improvementOpportunityStore.getImprovementBundleBuildContext({
    project_id: input.project_id,
    opportunity_id: input.recorded.opportunity_id
  });
  if (context === null) {
    return;
  }

  const references = await input.dependencies.improvementOpportunityStore.listImprovementEventReferences({
    opportunity_id: input.recorded.opportunity_id,
    limit: 5
  });
  const apiBaseUrl = normalizeBaseUrl(input.dependencies.apiBaseUrl);
  const appBaseUrl = normalizeBaseUrl(input.dependencies.appBaseUrl);
  const docsBaseUrl = normalizeBaseUrl(input.dependencies.docsBaseUrl);
  const bundle = await buildHostedImprovementBundle({
    context,
    references,
    thresholds: input.thresholds,
    objectStore: input.dependencies.objectStore,
    reserved,
    apiBaseUrl,
    appBaseUrl,
    docsBaseUrl
  });
  const severity = bundle.signal.severity;
  const bundleLink = bundle.links.self;
  const projectLink = bundle.links.project;

  const key = buildImprovementBundleObjectKey(context.project_id, context.opportunity_id);
  await input.dependencies.objectStore.putObject?.({
    key,
    body: gzipSync(Buffer.from(JSON.stringify(bundle), "utf8")),
    contentType: "application/json",
    contentEncoding: "gzip"
  });

  if (
    !alreadyRecorded &&
    bundleRequestBillingSummary !== null &&
    input.dependencies.operationalEmailDeliveryStore !== undefined
  ) {
    const allowance = bundleRequestBillingSummary.allowances.monthly_bundle_requests;
      await queueAllowanceThresholdNotifications({
        store: input.dependencies.operationalEmailDeliveryStore,
        project_id: context.project_id,
        meter: "monthly_bundle_requests",
        previous_used: allowance.used,
        next_used: allowance.used + 1,
        limit: allowance.limit,
        usage_window_starts_at: bundleRequestBillingSummary.usage_window.starts_at,
        usage_window_ends_at: bundleRequestBillingSummary.usage_window.ends_at
      });
  }

  if (input.dependencies.billingStore !== undefined && input.dependencies.objectStore.deleteObject !== undefined) {
    const billingSummary = await input.dependencies.billingStore.getBillingSummaryForProject({
      project_id: context.project_id,
      now: new Date().toISOString()
    });
    const retainedAllowance = billingSummary?.allowances.retained_bundle_cap;

    if (retainedAllowance !== undefined) {
      if (input.dependencies.operationalEmailDeliveryStore !== undefined) {
        await queueAllowanceThresholdNotifications({
          store: input.dependencies.operationalEmailDeliveryStore,
          project_id: context.project_id,
          meter: "retained_bundle_cap",
          previous_used: Math.max(0, retainedAllowance.used - 1),
          next_used: retainedAllowance.used,
          limit: retainedAllowance.limit
        });
      }

      const prunedOwners = await input.dependencies.improvementOpportunityStore.pruneRetainedBundleOwnersForProject({
        project_id: context.project_id,
        retained_bundle_limit: retainedAllowance.limit
      });

      for (const prunedOwner of prunedOwners) {
        await deletePrunedBundleArtifacts({
          objectStore: input.dependencies.objectStore,
          owner: prunedOwner
        });
      }

      if (input.dependencies.operationalEmailDeliveryStore !== undefined && prunedOwners.length > 0) {
        await queueRetentionRotationNotice({
          store: input.dependencies.operationalEmailDeliveryStore,
          project_id: context.project_id,
          rotated_owner_count: prunedOwners.length,
          retained_bundle_limit: retainedAllowance.limit,
          dedupe_date: new Date().toISOString().slice(0, 10)
        });
      }
    }
  }

  await publishImprovementBundleCreated({
    project_id: context.project_id,
    opportunity_id: context.opportunity_id,
    occurred_at: input.occurred_at,
    service_name: context.service_name,
    environment: context.environment,
    severity,
    title: context.title,
    bundle_link: bundleLink,
    project_link: projectLink,
    ...(input.dependencies.webhookDeliveryStore === undefined ? {} : { webhookDeliveryStore: input.dependencies.webhookDeliveryStore }),
    ...(input.dependencies.billingStore === undefined ? {} : { billingStore: input.dependencies.billingStore }),
    ...(input.dependencies.operationalEmailDeliveryStore === undefined
      ? {}
      : { operationalEmailDeliveryStore: input.dependencies.operationalEmailDeliveryStore }),
    ...(input.dependencies.fallbackTargetUrl === undefined ? {} : { fallbackTargetUrl: input.dependencies.fallbackTargetUrl }),
    ...(input.dependencies.fallbackSigningSecret === undefined ? {} : { fallbackSigningSecret: input.dependencies.fallbackSigningSecret })
  });
}
