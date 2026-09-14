import { gunzipSync } from "node:zlib";
import {
  FINGERPRINT_VERSION,
  classifyEvent,
  fingerprint,
  inferMatchedFields,
  normalizeEvent,
  validateEvent
} from "../../../packages/event-normalizer/src/index.js";
import {
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
  const parsed = JSON.parse(gunzipSync(rawBody).toString("utf8")) as unknown;
  const validated = validateEvent(parsed);
  if (!validated.success) {
    return { processed: false, reason: "invalid_event" };
  }

  const normalized = normalizeEvent(validated.data);
  const computedFingerprint = fingerprint(normalized);
  const captureRule = job.capture_rule ?? null;
  const capturePreset = job.capture_preset ?? "minimal";
  const immediateClientErrorStatuses = job.immediate_client_error_statuses ?? [];
  const immediateClientErrorPathRules = job.immediate_client_error_path_rules ?? [];
  const baseEventClass = classifyEvent(
    validated.data.event_type,
    validated.data.event_type === "log_event" ? validated.data.payload?.level : undefined,
    validated.data.event_type === "probe_event" ? validated.data.payload?.activation_id : undefined,
    validated.data.payload as Record<string, unknown>,
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
    validated.data,
    capturePreset,
    immediateClientErrorStatuses,
    immediateClientErrorPathRules
  );

  const processedEvent = await dependencies.processedEventStore.upsertProcessedEvent({
    event_id: validated.data.event_id,
    project_id: job.project_id,
    event_type: validated.data.event_type,
    fingerprint: computedFingerprint,
    normalized_message: normalized.normalized_message
  });

  if (processedEvent?.inserted === false) {
    return { processed: true };
  }

  const improvementInput = {
    project_id: job.project_id,
    event: validated.data,
    normalized,
    event_class: eventClass
  };
  if (dependencies.deferImprovement) {
    // Only eligible context signals need the optional lane; exception ingestion stays lightweight.
    if (
      validated.data.event_type === "request_event" ||
      (validated.data.event_type === "log_event" && validated.data.payload.level === "warning")
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

  await dependencies.queue.enqueue("group-incident", {
    project_id: job.project_id,
    event_id: validated.data.event_id,
    event_type: validated.data.event_type,
    event_class: eventClass,
    service_name: validated.data.service.name,
    environment: validated.data.service.environment,
    fingerprint: computedFingerprint,
    alert_notification_key: buildAlertNotificationKey({
      event: validated.data,
      normalized,
      fingerprint: computedFingerprint
    }),
    fingerprint_version: FINGERPRINT_VERSION,
    normalized_message: normalized.normalized_message,
    matched_fields: matchedFields,
    occurred_at: validated.data.occurred_at,
    severity,
    ...buildAnalyticsIncidentCorrelationJobFields(job.project_id, validated.data.correlation),
    ...(validated.data.event_type === "deploy_metadata"
      ? {
          deploy_metadata: {
            commit_sha: validated.data.payload.commit_sha,
            version: validated.data.payload.version,
            branch: validated.data.payload.branch,
            deployed_at: validated.data.payload.deployed_at
          }
        }
      : {})
  });

  if (
    dependencies.requestAnomalyCounter !== undefined &&
    validated.data.event_type === "request_event" &&
    eventClass === "context_signal" &&
    captureRule?.outcome !== "demote" &&
    !(captureRule?.action === "sample" && captureRule.sample_event_class === "context") &&
    getRequestAnomalyThreshold({ responseStatus: normalized.http_status, capturePreset }) !== null
  ) {
    const anomalyJob = await evaluateRequestAnomalyCandidate({
      event: validated.data,
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
