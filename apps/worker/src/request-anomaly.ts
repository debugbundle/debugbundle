import { createHash } from "node:crypto";

import type { NormalizedEvent } from "../../../packages/event-normalizer/src/index.js";
import type { GroupIncidentJob, IncidentFrequencySnapshot, RequestAnomalyCounter } from "../../../packages/storage/src/index.js";
import { getRequestAnomalyThreshold, type CapturePreset, type EventEnvelope } from "../../../packages/shared-types/src/index.js";

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function buildRequestAnomalyFingerprint(input: {
  project_id: string;
  service_name: string;
  environment: string;
  method: string;
  route_template: string;
  response_status: number;
}): string {
  return createHash("sha256")
    .update(
      stableJson({
        kind: "request_status_anomaly",
        project_id: input.project_id,
        service_name: input.service_name,
        environment: input.environment,
        method: input.method,
        route_template: input.route_template,
        response_status: input.response_status
      })
    )
    .digest("hex");
}

function buildRequestAnomalyKey(input: {
  project_id: string;
  capture_preset: CapturePreset;
  service_name: string;
  environment: string;
  method: string;
  route_template: string;
  response_status: number;
}): string {
  return [
    input.project_id,
    input.capture_preset,
    input.service_name,
    input.environment,
    input.method,
    input.route_template,
    String(input.response_status)
  ].join(":");
}

function passesRequestAnomalyThreshold(input: {
  snapshot: IncidentFrequencySnapshot;
  minimum_occurrences_5m: number;
  minimum_ratio_5m_to_1h: number;
}): boolean {
  return (
    input.snapshot.occurrences_5m >= input.minimum_occurrences_5m &&
    input.snapshot.spike_ratio_5m_to_1h >= input.minimum_ratio_5m_to_1h
  );
}

export async function evaluateRequestAnomalyCandidate(input: {
  event: EventEnvelope;
  normalized: NormalizedEvent;
  project_id: string;
  capture_preset: CapturePreset;
  fingerprint_version: string;
  requestAnomalyCounter: RequestAnomalyCounter;
}): Promise<GroupIncidentJob | null> {
  if (input.event.event_type !== "request_event") {
    return null;
  }

  const responseStatus = input.normalized.http_status;
  const method = input.normalized.http_method;
  const routeTemplate = input.normalized.route_template;
  const threshold = getRequestAnomalyThreshold({
    responseStatus,
    capturePreset: input.capture_preset
  });

  if (threshold === null || responseStatus === null || method === null || routeTemplate === null) {
    return null;
  }

  const snapshot = await input.requestAnomalyCounter.recordObservation({
    anomaly_key: buildRequestAnomalyKey({
      project_id: input.project_id,
      capture_preset: input.capture_preset,
      service_name: input.event.service.name,
      environment: input.event.service.environment,
      method,
      route_template: routeTemplate,
      response_status: responseStatus
    }),
    event_id: input.event.event_id,
    occurred_at: input.event.occurred_at
  });

  if (
    !passesRequestAnomalyThreshold({
      snapshot,
      minimum_occurrences_5m: threshold.minimum_occurrences_5m,
      minimum_ratio_5m_to_1h: threshold.minimum_ratio_5m_to_1h
    })
  ) {
    return null;
  }

  return {
    project_id: input.project_id,
    event_id: input.event.event_id,
    event_type: "request_event",
    event_class: "context_signal",
    incident_trigger: "request_anomaly",
    service_name: input.event.service.name,
    environment: input.event.service.environment,
    fingerprint: buildRequestAnomalyFingerprint({
      project_id: input.project_id,
      service_name: input.event.service.name,
      environment: input.event.service.environment,
      method,
      route_template: routeTemplate,
      response_status: responseStatus
    }),
    fingerprint_version: input.fingerprint_version,
    normalized_message: `Request anomaly: ${method} ${routeTemplate} returned ${responseStatus} repeatedly`,
    matched_fields: ["request_anomaly", "route_template", "http_method", "http_status", "environment"],
    occurred_at: input.event.occurred_at,
    severity: "medium"
  };
}