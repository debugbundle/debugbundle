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
  normalizeResourceRoute,
  applyCaptureRuleEventClass,
  getRequestAnomalyThreshold
} from "../../../packages/shared-types/src/index.js";
import { evaluateRequestAnomalyCandidate } from "./request-anomaly.js";
import { inferSeverity } from "./severity.js";
import { maybeGenerateHostedImprovementBundle } from "./improvement-bundles.js";
import { buildAnalyticsIncidentCorrelationJobFields } from "./analytics-incident-correlation.js";
import {
  type NormalizeWorkerDependencies,
  buildAlertNotificationKey,
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

  const normalized = normalizeEvent(event);
  const computedFingerprint = fingerprint(normalized);
  const captureRule = job.capture_rule ?? null;
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
    immediateClientErrorPathRules
  );
  const eventClass = applyCaptureRuleEventClass({
    event_class: baseEventClass,
    capture_rule: captureRule
  });
  const matchedFields = inferMatchedFields(normalized);
  if (captureRule?.outcome === "demote") {
    matchedFields.push("capture_rule_demote");
  } else if (captureRule?.action === "sample" && captureRule.sample_event_class === "context") {
    matchedFields.push("capture_rule_sample_context");
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

  const resourceRoute = normalized.resource_type === undefined ? null : normalizeResourceRoute(normalized.route_template);

  await dependencies.queue.enqueue("group-incident", {
    project_id: job.project_id,
    event_id: event.event_id,
    event_type: event.event_type,
    event_class: eventClass,
    service_name: event.service.name,
    environment: event.service.environment,
    fingerprint: computedFingerprint,
    alert_notification_key: buildAlertNotificationKey({
      event,
      normalized,
      fingerprint: computedFingerprint
    }),
    fingerprint_version: fingerprintVersion(normalized),
    normalized_message: normalized.normalized_message,
    ...(normalized.incident_title === undefined ? {} : { incident_title: normalized.incident_title }),
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
