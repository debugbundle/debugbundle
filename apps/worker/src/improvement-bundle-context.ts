import { isObjectMissing } from "../../../packages/storage/src/object-store-errors.js";
import type {
  ImprovementOpportunityStore,
  ObjectStoreReader
} from "../../../packages/storage/src/index.js";
import { buildRawEventObjectKey } from "../../../packages/storage/src/index.js";
import { BundleV1Schema, type EventEnvelope } from "../../../packages/shared-types/src/index.js";
import { parseStoredEvent } from "../../../packages/event-normalizer/src/index.js";
import {
  createHostedImprovementConfidence,
  createHostedImprovementSeverity,
  createHostedRequestFailureSeverity,
  createHostedSlowRequestSeverity,
  type ImprovementRuleThresholds
} from "./improvement-rules.js";

export function parseEventEnvelopeFromRaw(rawBody: Buffer): EventEnvelope | null {
  return parseStoredEvent(rawBody);
}

export async function loadImprovementBundleSdk(input: {
  objectStore: ObjectStoreReader;
  projectId: string;
  sourceEventId: string;
  references: Array<{ event_id: string; occurred_at: string }>;
}): Promise<{ name: string; version: string }> {
  const orderedReferences = [
    ...input.references.filter((reference) => reference.event_id === input.sourceEventId),
    ...input.references.filter((reference) => reference.event_id !== input.sourceEventId).reverse()
  ];

  for (const reference of orderedReferences) {
    const key = buildRawEventObjectKey({
      projectId: input.projectId,
      eventId: reference.event_id,
      occurredAt: new Date(reference.occurred_at)
    });

    try {
      const rawBody = await input.objectStore.getObject({ key });
      const envelope = parseEventEnvelopeFromRaw(rawBody);
      if (envelope === null || envelope.event_type === "probe_event") {
        continue;
      }

      return {
        name: envelope.sdk_name,
        version: envelope.sdk_version
      };
    } catch (error) {
      // Expired raw evidence is optional; temporary outages must retry generation.
      if (!isObjectMissing(error)) throw error;
    }
  }

  return {
    name: "unknown",
    version: "unknown"
  };
}

export async function loadSampleLogItems(input: {
  objectStore: ObjectStoreReader;
  projectId: string;
  references: Array<{ event_id: string; occurred_at: string }>;
}): Promise<
  Array<{ level: string; message: string; timestamp: string; attributes: Record<string, unknown> }>
> {
  const items: Array<{
    level: string;
    message: string;
    timestamp: string;
    attributes: Record<string, unknown>;
  }> = [];

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
    } catch (error) {
      // Expired raw evidence is optional; temporary outages must retry generation.
      if (!isObjectMissing(error)) throw error;
    }
  }

  return items.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

export async function loadRepresentativeRequestContext(input: {
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
          ...(envelope.payload.response_headers === undefined
            ? {}
            : { headers: envelope.payload.response_headers }),
          ...(envelope.payload.response_body === undefined
            ? {}
            : { body: envelope.payload.response_body })
        }
      };
    } catch (error) {
      // Expired raw evidence is optional; temporary outages must retry generation.
      if (!isObjectMissing(error)) throw error;
    }
  }

  return {
    request: null,
    response: null
  };
}

export async function buildHostedImprovementBundle(input: {
  context: NonNullable<
    Awaited<
      ReturnType<NonNullable<ImprovementOpportunityStore["getImprovementBundleBuildContext"]>>
    >
  >;
  references: Array<{
    event_id: string;
    event_type: EventEnvelope["event_type"];
    occurred_at: string;
  }>;
  thresholds: ImprovementRuleThresholds;
  objectStore: ObjectStoreReader;
  reserved: {
    generation_number: number;
    created_at: string;
    updated_at: string;
    source_event_id: string;
  };
  apiBaseUrl: string | null;
  appBaseUrl: string | null;
  docsBaseUrl: string | null;
}): Promise<ReturnType<typeof BundleV1Schema.parse>> {
  const bundleSdk = await loadImprovementBundleSdk({
    objectStore: input.objectStore,
    projectId: input.context.project_id,
    sourceEventId: input.reserved.source_event_id,
    references: input.references
  });
  const baseBundle = {
    bundle_version: 1 as const,
    bundle_id: `improvement_bundle_${input.context.opportunity_id}`,
    bundle_type: "improvement" as const,
    captured_at: new Date(input.reserved.updated_at).toISOString(),
    sdk: bundleSdk,
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
        input.appBaseUrl === null
          ? null
          : `${input.appBaseUrl}/projects/${input.context.project_id}/improvements/${input.context.opportunity_id}`,
      docs: input.docsBaseUrl === null ? null : `${input.docsBaseUrl}/bundles`
    },
    redaction: {
      redacted: true,
      fields: [],
      notes: null
    },
    metadata: {
      created_at: new Date(input.reserved.created_at).toISOString(),
      updated_at: new Date(input.reserved.updated_at).toISOString(),
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
    const confidence = createHostedImprovementConfidence(
      input.context.occurrence_count,
      input.thresholds.occurrence_threshold
    );
    const normalizedMessage =
      typeof input.context.evidence["normalized_message"] === "string"
        ? input.context.evidence["normalized_message"]
        : input.context.title;

    return BundleV1Schema.parse({
      ...baseBundle,
      signal: {
        signal_id: input.context.opportunity_id,
        signal_type: "warning",
        severity,
        fingerprint: input.context.fingerprint,
        first_seen_at: new Date(input.context.first_detected_at).toISOString(),
        last_seen_at: new Date(input.context.last_detected_at).toISOString(),
        occurrence_count: input.context.occurrence_count,
        source_event_types: ["log_event"]
      },
      summary: {
        title: input.context.title,
        description: `Repeated warning log pattern detected ${input.context.occurrence_count} times for ${input.context.service_name} in ${input.context.environment}.`,
        likely_cause: `The same warning keeps repeating: ${normalizedMessage}.`,
        confidence,
        recommended_action:
          "Inspect the repeated warning path, remove the noisy condition, and verify the warning no longer recurs under normal traffic.",
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

  if (
    input.context.kind === "recurring_incident" ||
    input.context.kind === "post_deploy_regression"
  ) {
    throw new Error("incident_derived_improvement_bundle_not_supported");
  }

  const representativeRequest = await loadRepresentativeRequestContext({
    objectStore: input.objectStore,
    projectId: input.context.project_id,
    references: input.references
      .filter((reference) => reference.event_type === "request_event")
      .map((reference) => ({ event_id: reference.event_id, occurred_at: reference.occurred_at }))
  });
  const routeTemplate =
    typeof input.context.evidence["route_template"] === "string"
      ? input.context.evidence["route_template"]
      : "/";
  const httpMethod =
    typeof input.context.evidence["http_method"] === "string"
      ? input.context.evidence["http_method"]
      : "GET";
  const responseStatus =
    typeof input.context.evidence["response_status"] === "number"
      ? input.context.evidence["response_status"]
      : 0;
  const durationMs =
    typeof input.context.evidence["duration_ms"] === "number"
      ? input.context.evidence["duration_ms"]
      : null;

  if (input.context.kind === "request_failure_pattern") {
    const severity = createHostedRequestFailureSeverity(
      responseStatus,
      input.context.occurrence_count
    );
    const confidence = createHostedImprovementConfidence(
      input.context.occurrence_count,
      input.thresholds.occurrence_threshold
    );

    return BundleV1Schema.parse({
      ...baseBundle,
      signal: {
        signal_id: input.context.opportunity_id,
        signal_type: "request_failure",
        severity,
        fingerprint: input.context.fingerprint,
        first_seen_at: new Date(input.context.first_detected_at).toISOString(),
        last_seen_at: new Date(input.context.last_detected_at).toISOString(),
        occurrence_count: input.context.occurrence_count,
        source_event_types: ["request_event"]
      },
      summary: {
        title: input.context.title,
        description: `Repeated request failures detected ${input.context.occurrence_count} times for ${httpMethod} ${routeTemplate} in ${input.context.environment}.`,
        likely_cause: `The same request path is returning ${responseStatus} repeatedly.`,
        confidence,
        recommended_action:
          "Inspect the failing route, validate upstream dependencies and input handling, and confirm the status pattern no longer repeats under normal traffic.",
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
  const confidence = createHostedImprovementConfidence(
    input.context.occurrence_count,
    input.thresholds.occurrence_threshold
  );

  return BundleV1Schema.parse({
    ...baseBundle,
    signal: {
      signal_id: input.context.opportunity_id,
      signal_type: "warning",
      severity,
      fingerprint: input.context.fingerprint,
      first_seen_at: new Date(input.context.first_detected_at).toISOString(),
      last_seen_at: new Date(input.context.last_detected_at).toISOString(),
      occurrence_count: input.context.occurrence_count,
      source_event_types: ["request_event"]
    },
    summary: {
      title: input.context.title,
      description: `Repeated slow requests detected ${input.context.occurrence_count} times for ${httpMethod} ${routeTemplate} in ${input.context.environment}.`,
      likely_cause: `The route is repeatedly exceeding the ${input.thresholds.slow_request_duration_threshold_ms}ms slow-request threshold.`,
      confidence,
      recommended_action:
        "Inspect the request path, profile the slow dependency or query, and verify the route stays below the expected latency threshold under normal traffic.",
      severity,
      error_type: "request_event",
      error_message:
        durationMs === null
          ? `${httpMethod} ${routeTemplate} is slow`
          : `${httpMethod} ${routeTemplate} took ${durationMs}ms`,
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
