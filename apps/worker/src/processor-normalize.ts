import {
  FINGERPRINT_VERSION,
  fingerprintVersion,
  classifyEvent,
  fingerprint,
  inferMatchedFields,
  normalizeEvent,
  parseStoredEvent
} from "../../../packages/event-normalizer/src/index.js";
import {
  describeBrowserResource,
  normalizeResourceRoute,
  applyCaptureRuleEventClass,
  getRequestAnomalyThreshold
} from "../../../packages/shared-types/src/index.js";
import type { CaptureRuleThresholdJobConfig } from "../../../packages/storage/src/index.js";
import { evaluateRequestAnomalyCandidate } from "./request-anomaly.js";
import { inferSeverity } from "./severity.js";
import { maybeGenerateHostedImprovementBundle } from "./improvement-bundles.js";
import { buildAnalyticsIncidentCorrelationJobFields } from "./analytics-incident-correlation.js";
import {
  type NormalizeWorkerDependencies,
  buildAlertNotificationContext,
  type WorkerProcessResult
} from "./processor-shared.js";

export async function processNextNormalizeEventsJob(
  dependencies: NormalizeWorkerDependencies
): Promise<WorkerProcessResult> {
  const job = await dependencies.queue.dequeue("normalize-events");
  if (job === null) {
    return { processed: false, reason: "no_jobs" };
  }

  const rawBody = await dependencies.objectStore.getObject({ key: job.object_key });
  const event = parseStoredEvent(rawBody);
  if (event === null) {
    return { processed: false, reason: "invalid_event" };
  }

  if (event.event_type === "diagnostic_context") {
    const receipt = await dependencies.processedEventStore.upsertProcessedEvent({
      event_id: event.event_id,
      project_id: job.project_id,
      event_type: event.event_type,
      fingerprint: "diagnostic_context",
      normalized_message: "diagnostic_context"
    });
    if (receipt?.inserted !== false)
      await dependencies.recordEvidenceContext?.(
        job.project_id,
        event,
        job.received_at ?? event.occurred_at,
        "context_signal"
      );
    return { processed: true };
  }

  const normalized = normalizeEvent(event);
  const captureRule = job.capture_rule ?? null;
  let effectiveNormalized = normalized;
  let captureRuleThreshold: CaptureRuleThresholdJobConfig | undefined;
  let computedFingerprint = fingerprint(effectiveNormalized);

  if (
    captureRule?.outcome === "threshold" &&
    captureRule.threshold_count != null &&
    captureRule.threshold_window_seconds != null &&
    captureRule.threshold_group_by != null
  ) {
    const receivedAt = job.received_at ?? event.occurred_at;
    const ruleUpdatedAt = captureRule.rule_updated_at ?? receivedAt;
    if (captureRule.threshold_group_by === "resource") {
      const browserEvent =
        event.event_type === "frontend_exception" ? event.payload.browser_event : undefined;
      const resource = describeBrowserResource(browserEvent);
      if (
        event.event_type === "frontend_exception" &&
        browserEvent?.kind === "resource_error" &&
        resource?.host != null &&
        resource.path.length > 0
      ) {
        // Legacy SDKs with a redacted tag_name lose resource_type; keep thresholded resource
        // failures in one deterministic v3 group scoped to that exact resource path.
        if (browserEvent.opaque === true && effectiveNormalized.resource_type === undefined) {
          effectiveNormalized = {
            ...effectiveNormalized,
            resource_host: resource.host,
            resource_path: resource.path,
            resource_type: "unknown"
          };
          computedFingerprint = fingerprint(effectiveNormalized);
        }
        captureRuleThreshold = {
          rule_id: captureRule.rule_id,
          threshold_count: captureRule.threshold_count,
          threshold_window_seconds: captureRule.threshold_window_seconds,
          threshold_group_by: "resource",
          bucket_key: JSON.stringify(["resource", resource.host, resource.path]),
          rule_updated_at: ruleUpdatedAt,
          received_at: receivedAt
        };
      }
    } else {
      captureRuleThreshold = {
        rule_id: captureRule.rule_id,
        threshold_count: captureRule.threshold_count,
        threshold_window_seconds: captureRule.threshold_window_seconds,
        threshold_group_by: "fingerprint",
        bucket_key: JSON.stringify(["fingerprint", computedFingerprint]),
        rule_updated_at: ruleUpdatedAt,
        received_at: receivedAt
      };
    }
  }

  const capturePreset = job.capture_preset ?? "minimal";
  const immediateClientErrorStatuses = job.immediate_client_error_statuses ?? [];
  const immediateClientErrorPathRules = job.immediate_client_error_path_rules ?? [];
  const baseEventClass = classifyEvent(
    event.event_type,
    event.event_type === "log_event" ? event.payload?.level : undefined,
    event.event_type === "probe_event" ? event.payload?.activation_id : undefined,
    event.payload as Record<string, unknown>,
    capturePreset,
    immediateClientErrorStatuses,
    immediateClientErrorPathRules,
    event.service.runtime
  );
  const eventClass = applyCaptureRuleEventClass({
    event_class: baseEventClass,
    capture_rule: captureRule
  });
  const matchedFields = inferMatchedFields(effectiveNormalized);
  if (captureRule?.outcome === "demote") {
    matchedFields.push("capture_rule_demote");
  } else if (captureRule?.action === "sample" && captureRule.sample_event_class === "context") {
    matchedFields.push("capture_rule_sample_context");
  } else if (captureRuleThreshold !== undefined) {
    matchedFields.push("capture_rule_threshold");
  }
  const severity = inferSeverity(
    event,
    capturePreset,
    immediateClientErrorStatuses,
    immediateClientErrorPathRules
  );

  const processedEvent = await dependencies.processedEventStore.upsertProcessedEvent({
    event_id: event.event_id,
    project_id: job.project_id,
    event_type: event.event_type,
    fingerprint: computedFingerprint,
    normalized_message: normalized.normalized_message
  });

  if (processedEvent?.inserted === false) {
    return { processed: true };
  }

  await dependencies.recordBrowserRecoveryContext?.(job.project_id, event);
  await dependencies.recordEvidenceContext?.(
    job.project_id,
    event,
    job.received_at ?? event.occurred_at,
    eventClass
  );

  const improvementInput = {
    project_id: job.project_id,
    event,
    normalized,
    event_class: eventClass
  };
  if (dependencies.deferImprovement) {
    // Only eligible context signals need the optional lane; exception ingestion stays lightweight.
    if (
      event.event_type === "request_event" ||
      (event.event_type === "log_event" && event.payload.level === "warning")
    ) {
      await dependencies.deferImprovement({ ...improvementInput, object_key: job.object_key });
    }
  } else {
    await maybeGenerateHostedImprovementBundle({
      ...improvementInput,
      dependencies: {
        objectStore: dependencies.objectStore,
        ...(dependencies.improvementBundleWorker ?? {})
      }
    });
  }

  const resourceRoute =
    effectiveNormalized.resource_type === undefined
      ? null
      : normalizeResourceRoute(effectiveNormalized.route_template);
  const alertNotification = buildAlertNotificationContext({
    projectId: job.project_id,
    event,
    normalized: effectiveNormalized,
    fingerprint: computedFingerprint
  });

  await dependencies.queue.enqueue("group-incident", {
    project_id: job.project_id,
    event_id: event.event_id,
    event_type: event.event_type,
    event_class: eventClass,
    ...(captureRuleThreshold === undefined ? {} : { capture_rule_threshold: captureRuleThreshold }),
    service_name: event.service.name,
    environment: event.service.environment,
    fingerprint: computedFingerprint,
    alert_notification_key: alertNotification.notification_key,
    ...(alertNotification.coalescing_window_seconds === undefined
      ? {}
      : { alert_coalescing_window_seconds: alertNotification.coalescing_window_seconds }),
    ...(alertNotification.coalescing_key === undefined
      ? {}
      : { alert_coalescing_key: alertNotification.coalescing_key }),
    fingerprint_version: fingerprintVersion(effectiveNormalized),
    normalized_message: effectiveNormalized.normalized_message,
    ...(effectiveNormalized.incident_title === undefined
      ? {}
      : { incident_title: effectiveNormalized.incident_title }),
    ...(resourceRoute === null ? {} : { resource_route: resourceRoute }),
    matched_fields: matchedFields,
    occurred_at: event.occurred_at,
    severity,
    ...buildAnalyticsIncidentCorrelationJobFields(job.project_id, event.correlation),
    ...(event.event_type === "deploy_metadata"
      ? {
          deploy_metadata: {
            commit_sha: event.payload.commit_sha,
            version: event.payload.version,
            branch: event.payload.branch,
            deployed_at: event.payload.deployed_at
          }
        }
      : {})
  });

  if (
    dependencies.requestAnomalyCounter !== undefined &&
    event.event_type === "request_event" &&
    eventClass === "context_signal" &&
    captureRule?.outcome !== "demote" &&
    !(captureRule?.action === "sample" && captureRule.sample_event_class === "context") &&
    getRequestAnomalyThreshold({ responseStatus: normalized.http_status, capturePreset }) !== null
  ) {
    const anomalyJob = await evaluateRequestAnomalyCandidate({
      event,
      normalized,
      project_id: job.project_id,
      capture_preset: capturePreset,
      fingerprint_version: FINGERPRINT_VERSION,
      requestAnomalyCounter: dependencies.requestAnomalyCounter
    });

    if (anomalyJob !== null) {
      await dependencies.queue.enqueue("group-incident", anomalyJob);
    }
  }

  return { processed: true };
}
