import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

import type {
  AnalyticsEventEnvelope,
  AnalyticsSettings
} from "../../../packages/shared-types/src/index.js";
import {
  buildAnalyticsJourneyObjectKey,
  type AnalyticsJourneySampleStore,
  type AnalyticsSettingsStore,
  type ObjectStoreClient,
  type ObjectStoreReader
} from "../../../packages/storage/src/index.js";

const JOURNEY_SAMPLE_SCHEMA_VERSION = "analytics_journey_sample.v1";
const MAX_JOURNEY_EVENTS = 100;
const EDGE_EVENT_COUNT = 50;

export interface AnalyticsJourneySampleCaptureDependencies {
  analyticsSettingsStore: Pick<AnalyticsSettingsStore, "getAnalyticsSettingsByProjectId">;
  analyticsJourneySampleStore: Pick<AnalyticsJourneySampleStore, "recordAnalyticsJourneySample">;
  objectStore: Pick<ObjectStoreReader, "getObject"> & Pick<ObjectStoreClient, "putObject">;
}

export interface AnalyticsJourneySampleArtifact {
  schema_version: typeof JOURNEY_SAMPLE_SCHEMA_VERSION;
  sample_id: string;
  project_id: string;
  service: string;
  environment: string;
  session_id_hash: string;
  visitor_id_hash: string | null;
  first_seen_at: string;
  last_seen_at: string;
  analysis_tags: string[];
  dimensions_summary: Record<string, unknown>;
  events: AnalyticsJourneySampleEvent[];
}

interface AnalyticsJourneySampleEvent {
  event_id: string;
  occurred_at: string;
  kind: AnalyticsEventEnvelope["payload"]["kind"];
  route: AnalyticsEventEnvelope["payload"]["route"] | null;
  previous_route: AnalyticsEventEnvelope["payload"]["previous_route"] | null;
  signal: NonNullable<AnalyticsEventEnvelope["payload"]["signal"]> | null;
  trace_id: string | null;
  deploy_id: string | null;
  dimensions: AnalyticsEventEnvelope["payload"]["dimensions"];
  custom_dimensions: NonNullable<AnalyticsEventEnvelope["payload"]["custom_dimensions"]>;
}

export async function maybeCaptureAnalyticsJourneySample(input: {
  project_id: string;
  event: AnalyticsEventEnvelope;
  dependencies: AnalyticsJourneySampleCaptureDependencies | undefined;
}): Promise<{ captured: boolean; reason?: string }> {
  if (input.dependencies === undefined) {
    return { captured: false, reason: "journey_sample_capture_unavailable" };
  }

  const settings = await input.dependencies.analyticsSettingsStore.getAnalyticsSettingsByProjectId(input.project_id);
  if (settings === null || !settings.enabled) {
    return { captured: false, reason: "analytics_disabled" };
  }
  if (settings.journey_sample_rate <= 0) {
    return { captured: false, reason: "journey_sample_rate_zero" };
  }

  const sampleId = buildAnalyticsJourneySampleId(input.project_id, input.event);
  if (stableUnitFloat(`${input.project_id}:${sampleId}`) >= settings.journey_sample_rate) {
    return { captured: false, reason: "journey_sample_sampled_out" };
  }

  const objectKey = buildAnalyticsJourneyObjectKey(input.project_id, sampleId);
  const eventSample = toJourneySampleEvent(input.event);
  const existing = await readExistingArtifact(input.dependencies.objectStore, objectKey);
  const artifact = mergeJourneySampleArtifact({
    existing,
    project_id: input.project_id,
    sample_id: sampleId,
    event: input.event,
    eventSample
  });

  await input.dependencies.objectStore.putObject({
    key: objectKey,
    body: gzipSync(Buffer.from(JSON.stringify(artifact), "utf8")),
    contentType: "application/json",
    contentEncoding: "gzip"
  });

  await input.dependencies.analyticsJourneySampleStore.recordAnalyticsJourneySample({
    sample_id: sampleId,
    project_id: input.project_id,
    service: input.event.service.name,
    environment: input.event.service.environment,
    session_id_hash: hashAnalyticsIdentifier(input.event.correlation.session_id),
    visitor_id_hash: input.event.correlation.visitor_id_hash,
    analysis_tags: artifact.analysis_tags,
    first_seen_at: artifact.first_seen_at,
    last_seen_at: artifact.last_seen_at,
    dimensions_summary: artifact.dimensions_summary,
    has_artifact: true,
    object_key: objectKey,
    expires_at: addDays(input.event.occurred_at, settings.sample_retention_days),
    created_at: input.event.occurred_at
  });

  return { captured: true };
}

export function buildAnalyticsJourneySampleId(projectId: string, event: AnalyticsEventEnvelope): string {
  const day = getUtcDay(event.occurred_at);
  const hex = createHash("sha256")
    .update(`${projectId}\0${event.correlation.session_id}\0${day}`, "utf8")
    .digest("hex")
    .slice(0, 32)
    .split("");

  hex[12] = "5";
  const variant = Number.parseInt(hex[16]!, 16);
  hex[16] = ((variant & 0x3) | 0x8).toString(16);

  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20, 32).join("")}`;
}

function mergeJourneySampleArtifact(input: {
  existing: AnalyticsJourneySampleArtifact | null;
  project_id: string;
  sample_id: string;
  event: AnalyticsEventEnvelope;
  eventSample: AnalyticsJourneySampleEvent;
}): AnalyticsJourneySampleArtifact {
  const eventsById = new Map<string, AnalyticsJourneySampleEvent>();
  for (const event of input.existing?.events ?? []) {
    eventsById.set(event.event_id, event);
  }
  eventsById.set(input.eventSample.event_id, input.eventSample);

  const events = trimJourneyEvents([...eventsById.values()].sort(compareJourneyEvents));
  const firstSeenAt = events[0]?.occurred_at ?? input.event.occurred_at;
  const lastSeenAt = events.at(-1)?.occurred_at ?? input.event.occurred_at;
  const analysisTags = mergeTags(input.existing?.analysis_tags ?? [], buildAnalysisTags(input.event));

  return {
    schema_version: JOURNEY_SAMPLE_SCHEMA_VERSION,
    sample_id: input.sample_id,
    project_id: input.project_id,
    service: input.event.service.name,
    environment: input.event.service.environment,
    session_id_hash: hashAnalyticsIdentifier(input.event.correlation.session_id),
    visitor_id_hash: input.event.correlation.visitor_id_hash ?? input.existing?.visitor_id_hash ?? null,
    first_seen_at: firstSeenAt,
    last_seen_at: lastSeenAt,
    analysis_tags: analysisTags,
    dimensions_summary: {
      ...(input.existing?.dimensions_summary ?? {}),
      ...buildDimensionsSummary(input.event)
    },
    events
  };
}

async function readExistingArtifact(
  objectStore: Pick<ObjectStoreReader, "getObject">,
  objectKey: string
): Promise<AnalyticsJourneySampleArtifact | null> {
  try {
    const compressed = await objectStore.getObject({ key: objectKey });
    const parsed = JSON.parse(gunzipSync(compressed).toString("utf8")) as unknown;
    if (isJourneySampleArtifact(parsed)) {
      return parsed;
    }
    throw new Error("analytics_journey_sample_artifact_invalid");
  } catch (error) {
    if (isObjectNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

function isJourneySampleArtifact(value: unknown): value is AnalyticsJourneySampleArtifact {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<AnalyticsJourneySampleArtifact>;
  return candidate.schema_version === JOURNEY_SAMPLE_SCHEMA_VERSION &&
    typeof candidate.sample_id === "string" &&
    typeof candidate.project_id === "string" &&
    Array.isArray(candidate.events);
}

function toJourneySampleEvent(event: AnalyticsEventEnvelope): AnalyticsJourneySampleEvent {
  return {
    event_id: event.event_id,
    occurred_at: event.occurred_at,
    kind: event.payload.kind,
    route: event.payload.route ?? null,
    previous_route: event.payload.previous_route ?? null,
    signal: event.payload.signal ?? null,
    trace_id: event.correlation.trace_id,
    deploy_id: event.correlation.deploy_id,
    dimensions: event.payload.dimensions,
    custom_dimensions: event.payload.custom_dimensions ?? {}
  };
}

function buildAnalysisTags(event: AnalyticsEventEnvelope): string[] {
  const tags = [event.payload.kind, `auth:${event.payload.dimensions.auth_state}`];
  const routeKey = event.payload.route?.normalized_path ?? event.payload.route?.path ?? null;
  const previousRouteKey = event.payload.previous_route?.normalized_path ?? event.payload.previous_route?.path ?? null;
  if (routeKey !== null) {
    tags.push(`route:${routeKey}`);
  }
  if (event.payload.kind === "route_change" && previousRouteKey !== null && routeKey !== null) {
    tags.push(`transition:${previousRouteKey}->${routeKey}`);
  }
  if (event.payload.signal?.action_key != null) {
    tags.push(`action:${event.payload.signal.action_key}`);
  }
  if (event.payload.signal?.funnel_key != null) {
    tags.push(`funnel:${event.payload.signal.funnel_key}`);
  }
  if (event.payload.signal?.conversion_key != null) {
    tags.push(`conversion:${event.payload.signal.conversion_key}`);
  }
  if (event.payload.signal?.marker_key != null) {
    tags.push(`marker:${event.payload.signal.marker_key}`);
  }

  return tags.map((tag) => tag.slice(0, 120));
}

function mergeTags(existing: string[], next: string[]): string[] {
  return [...new Set([...existing, ...next])].sort((left, right) => left.localeCompare(right)).slice(0, 50);
}

function buildDimensionsSummary(event: AnalyticsEventEnvelope): Record<string, unknown> {
  return {
    auth_state: event.payload.dimensions.auth_state,
    device_type: event.payload.dimensions.device_type,
    browser_family: event.payload.dimensions.browser_family,
    os_family: event.payload.dimensions.os_family,
    language: event.payload.dimensions.language,
    locale: event.payload.dimensions.locale,
    viewport_bucket: event.payload.dimensions.viewport_bucket,
    referrer_domain: event.payload.dimensions.referrer_domain,
    utm_source: event.payload.dimensions.utm_source,
    utm_medium: event.payload.dimensions.utm_medium,
    utm_campaign: event.payload.dimensions.utm_campaign,
    country_code: event.payload.dimensions.country_code,
    region_code: event.payload.dimensions.region_code,
    custom_dimensions: event.payload.custom_dimensions ?? {}
  };
}

function trimJourneyEvents(events: AnalyticsJourneySampleEvent[]): AnalyticsJourneySampleEvent[] {
  if (events.length <= MAX_JOURNEY_EVENTS) {
    return events;
  }

  return [
    ...events.slice(0, EDGE_EVENT_COUNT),
    ...events.slice(events.length - EDGE_EVENT_COUNT)
  ];
}

function compareJourneyEvents(left: AnalyticsJourneySampleEvent, right: AnalyticsJourneySampleEvent): number {
  const timestampCompare = left.occurred_at.localeCompare(right.occurred_at);
  return timestampCompare === 0 ? left.event_id.localeCompare(right.event_id) : timestampCompare;
}

function hashAnalyticsIdentifier(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function stableUnitFloat(seed: string): number {
  const hex = createHash("sha256").update(seed, "utf8").digest("hex").slice(0, 13);
  return Number.parseInt(hex, 16) / 0x10_0000_0000_0000;
}

function getUtcDay(occurredAt: string): string {
  return occurredAt.slice(0, 10);
}

function addDays(isoTimestamp: string, days: AnalyticsSettings["sample_retention_days"]): string {
  const date = new Date(isoTimestamp);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function isObjectNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("s3_object_not_found");
}
