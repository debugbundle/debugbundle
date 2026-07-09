import { gzipSync } from "node:zlib";

import {
  buildAnalyticsBundle,
  stableSerializeAnalyticsBundle,
  type AnalyticsBundleBuildInput
} from "../../../packages/analytics-bundle-engine/src/index.js";
import type { RuntimeLogger } from "../../../packages/runtime-logger/src/index.js";
import type {
  AnalyticsBundleConfidence,
  AnalyticsBundleGranularity,
  AnalyticsBundleSeverity,
  AnalyticsMetricsGranularity
} from "../../../packages/shared-types/src/index.js";
import {
  buildAnalyticsBundleObjectKey,
  type AnalyticsBundleGenerationRecord,
  type AnalyticsBundleGenerationStore,
  type AnalyticsMetricsStore,
  type BuildAnalyticsBundleJob,
  type ClaimedRedisJob,
  type ObjectStoreClient
} from "../../../packages/storage/src/index.js";
import type { WorkerProcessResult } from "./processor.js";

export interface BuildAnalyticsBundleWorkerQueue {
  claim(jobName: "build-analytics-bundle"): Promise<ClaimedRedisJob<BuildAnalyticsBundleJob> | null>;
}

export interface BuildAnalyticsBundleWorkerDependencies {
  queue: BuildAnalyticsBundleWorkerQueue;
  analyticsBundleGenerationStore: AnalyticsBundleGenerationStore;
  analyticsMetricsStore: AnalyticsMetricsStore;
  objectStore: ObjectStoreClient;
  logger?: RuntimeLogger;
}

type NormalizedBundleAnalysisSpec = {
  from: string;
  to: string;
  granularity: AnalyticsMetricsGranularity;
  service?: string | undefined;
  environment?: string | undefined;
  limit: number;
  funnel_key?: string | undefined;
};

const DEFAULT_ANALYSIS_WINDOW_DAYS = 7;
const DEFAULT_METRIC_LIMIT = 25;

export async function processNextBuildAnalyticsBundleJob(
  dependencies: BuildAnalyticsBundleWorkerDependencies
): Promise<WorkerProcessResult> {
  const claimed = await dependencies.queue.claim("build-analytics-bundle");
  if (claimed === null) {
    return { processed: false, reason: "no_jobs" };
  }

  const job = claimed.payload;
  const generation = await dependencies.analyticsBundleGenerationStore.getAnalyticsBundleGenerationForProject({
    project_id: job.project_id,
    generation_id: job.generation_id
  });
  if (generation === null) {
    dependencies.logger?.warn?.(
      { generation_id: job.generation_id, project_id: job.project_id, trigger: job.trigger },
      "worker_analytics_bundle_generation_missing"
    );
    await claimed.ack();
    return { processed: true, reason: "analytics_bundle_generation_missing" };
  }

  if (generation.status === "completed" || generation.status === "failed") {
    await claimed.ack();
    return { processed: true, reason: `analytics_bundle_generation_${generation.status}` };
  }

  const claimedGeneration = await dependencies.analyticsBundleGenerationStore.claimAnalyticsBundleGenerationForProject({
    project_id: job.project_id,
    generation_id: job.generation_id,
    claimed_at: new Date().toISOString()
  });
  if (claimedGeneration === null) {
    await claimed.ack();
    return { processed: true, reason: "analytics_bundle_generation_claim_conflict" };
  }

  try {
    const buildInput = await buildAnalyticsBundleInput({
      generation: claimedGeneration,
      metricsStore: dependencies.analyticsMetricsStore
    });
    const bundle = buildAnalyticsBundle(buildInput);
    const objectKey = buildAnalyticsBundleObjectKey(job.project_id, job.generation_id);

    await dependencies.objectStore.putObject({
      key: objectKey,
      body: gzipSync(Buffer.from(stableSerializeAnalyticsBundle(bundle), "utf8")),
      contentType: "application/json",
      contentEncoding: "gzip"
    });

    const completed = await dependencies.analyticsBundleGenerationStore.markAnalyticsBundleGenerationCompleted({
      project_id: job.project_id,
      generation_id: job.generation_id,
      completed_at: new Date().toISOString()
    });
    if (completed === null) {
      throw new Error("analytics_bundle_generation_missing_after_write");
    }

    await claimed.ack();
    return { processed: true };
  } catch (error) {
    dependencies.logger?.error?.(
      {
        error_message: getAnalyticsBundleWorkerErrorMessage(error),
        generation_id: job.generation_id,
        project_id: job.project_id,
        trigger: job.trigger
      },
      "worker_build_analytics_bundle_failed"
    );

    await dependencies.analyticsBundleGenerationStore.markAnalyticsBundleGenerationFailed({
      project_id: job.project_id,
      generation_id: job.generation_id,
      failed_at: new Date().toISOString(),
      reason: "build_error"
    });
    await claimed.ack();
    return { processed: true, reason: "analytics_bundle_generation_failed" };
  }
}

async function buildAnalyticsBundleInput(input: {
  generation: AnalyticsBundleGenerationRecord;
  metricsStore: AnalyticsMetricsStore;
}): Promise<AnalyticsBundleBuildInput> {
  const spec = normalizeBundleAnalysisSpec(input.generation);
  const metricsInput = {
    project_id: input.generation.project_id,
    from: spec.from,
    to: spec.to,
    granularity: spec.granularity,
    service: spec.service,
    environment: spec.environment,
    limit: spec.limit
  };
  const [usage, routes, journeys, devices, referrers, funnel] = await Promise.all([
    input.metricsStore.getUsageSummary(metricsInput),
    input.metricsStore.getRouteMetrics(metricsInput),
    input.metricsStore.getJourneyPatterns(metricsInput),
    input.metricsStore.getDeviceBreakdown(metricsInput),
    input.metricsStore.getReferrerMetrics(metricsInput),
    spec.funnel_key === undefined
      ? Promise.resolve(null)
      : input.metricsStore.getFunnelAnalysis({ ...metricsInput, funnel_key: spec.funnel_key })
  ]);
  const affectedSessions = inferAffectedSessions({
    analysisKind: input.generation.analysis_kind,
    sessionsAnalyzed: usage.summary.sessions,
    funnel,
    routes: routes.routes,
    journeys: journeys.patterns
  });

  return {
    analysis_kind: input.generation.analysis_kind,
    input_fingerprint: input.generation.input_fingerprint,
    project: {
      project_id: input.generation.project_id,
      service: usage.summary.service,
      environment: usage.summary.environment
    },
    analysis_window: {
      from: spec.from,
      to: spec.to,
      granularity: spec.granularity as AnalyticsBundleGranularity
    },
    summary: {
      title: buildBundleTitle(input.generation.analysis_kind, spec.funnel_key),
      description: buildBundleDescription(input.generation.analysis_kind, usage.summary.sessions, affectedSessions),
      confidence: inferConfidence(usage.summary.sessions),
      severity: inferSeverity(usage.summary.sessions, affectedSessions)
    },
    metrics: {
      sessions_analyzed: usage.summary.sessions,
      affected_sessions: affectedSessions,
      current: {
        usage: usage.summary,
        routes: routes.routes,
        funnel: funnel?.funnel ?? null
      }
    },
    segments: [
      ...toSegments("device_type", devices.device_types),
      ...toSegments("browser", devices.browsers),
      ...toSegments("os", devices.os),
      ...toSegments("language", devices.languages),
      ...toSegments("referrer", referrers.referrers),
      ...toSegments("utm_source", referrers.utm_sources),
      ...toSegments("utm_medium", referrers.utm_mediums),
      ...toSegments("utm_campaign", referrers.utm_campaigns)
    ],
    journey_patterns: journeys.patterns,
    representative_journeys: readRecordArray(input.generation.analysis_spec["representative_journeys"]),
    linked_incidents: readLinkedRecords(input.generation.analysis_spec, "related_incident_ids", "incident_id"),
    linked_deploys: readLinkedRecords(input.generation.analysis_spec, "related_deploy_ids", "deploy_id"),
    recommendations: buildRecommendations(input.generation.analysis_kind)
  };
}

function normalizeBundleAnalysisSpec(generation: AnalyticsBundleGenerationRecord): NormalizedBundleAnalysisSpec {
  const spec = generation.analysis_spec;
  const fallbackTo = readIsoString(spec["to"]) ?? generation.created_at;
  const to = readIsoString(spec["to"]) ?? fallbackTo;
  const fallbackFrom = new Date(Date.parse(to) - DEFAULT_ANALYSIS_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const requestedFrom = readIsoString(spec["from"]) ?? fallbackFrom;
  const from = Date.parse(requestedFrom) <= Date.parse(to) ? requestedFrom : fallbackFrom;

  return {
    from,
    to,
    granularity: spec["granularity"] === "hour" ? "hour" : "day",
    service: readNonEmptyString(spec["service"]),
    environment: readNonEmptyString(spec["environment"]),
    limit: readPositiveInteger(spec["limit"]) ?? DEFAULT_METRIC_LIMIT,
    funnel_key: readNonEmptyString(spec["funnel_key"]) ?? readNonEmptyString(spec["funnel"])
  };
}

function inferAffectedSessions(input: {
  analysisKind: AnalyticsBundleGenerationRecord["analysis_kind"];
  sessionsAnalyzed: number;
  funnel: Awaited<ReturnType<AnalyticsMetricsStore["getFunnelAnalysis"]>> | null;
  routes: Awaited<ReturnType<AnalyticsMetricsStore["getRouteMetrics"]>>["routes"];
  journeys: Awaited<ReturnType<AnalyticsMetricsStore["getJourneyPatterns"]>>["patterns"];
}): number | null {
  if (input.analysisKind === "funnel_dropoff" && input.funnel !== null) {
    return input.funnel.funnel.dropoffs;
  }

  if (input.analysisKind === "route_health" || input.analysisKind === "incident_impact") {
    const affected = input.routes.reduce((sum, route) => sum + route.linked_incident_sessions, 0);
    return Math.min(input.sessionsAnalyzed, affected);
  }

  if (input.analysisKind === "journey_friction" || input.analysisKind === "conversion_path") {
    const affected = input.journeys.reduce((sum, journey) => sum + journey.unique_sessions, 0);
    return Math.min(input.sessionsAnalyzed, affected);
  }

  return null;
}

function inferConfidence(sessionsAnalyzed: number): AnalyticsBundleConfidence {
  if (sessionsAnalyzed >= 100) {
    return "high";
  }
  if (sessionsAnalyzed >= 25) {
    return "medium";
  }
  return "low";
}

function inferSeverity(
  sessionsAnalyzed: number,
  affectedSessions: number | null
): AnalyticsBundleSeverity {
  if (affectedSessions === null || affectedSessions === 0 || sessionsAnalyzed === 0) {
    return "low";
  }
  return affectedSessions / sessionsAnalyzed >= 0.25 ? "high" : "medium";
}

function buildBundleTitle(
  analysisKind: AnalyticsBundleGenerationRecord["analysis_kind"],
  funnelKey: string | undefined
): string {
  if (analysisKind === "funnel_dropoff" && funnelKey !== undefined) {
    return `Funnel dropoff analysis for ${funnelKey}`;
  }

  return `${analysisKind.replaceAll("_", " ")} analysis`;
}

function buildBundleDescription(
  analysisKind: AnalyticsBundleGenerationRecord["analysis_kind"],
  sessionsAnalyzed: number,
  affectedSessions: number | null
): string {
  const affected = affectedSessions === null ? "aggregate usage" : `${affectedSessions} affected sessions`;
  return `AnalyticsBundle ${analysisKind.replaceAll("_", " ")} evidence across ${sessionsAnalyzed} sessions with ${affected}.`;
}

function buildRecommendations(
  analysisKind: AnalyticsBundleGenerationRecord["analysis_kind"]
): Array<Record<string, unknown>> | undefined {
  if (analysisKind === "usage_summary") {
    return [
      {
        priority: 1,
        action: "review_top_segments_and_routes",
        rationale: "Compare high-volume routes, devices, referrers, and journey transitions before choosing optimizations."
      }
    ];
  }

  return undefined;
}

function toSegments(
  dimension: string,
  values: Array<{ value: string; sessions: number; pageviews: number }>
): Array<Record<string, unknown>> {
  return values.map((value) => ({
    dimension,
    value: value.value,
    sessions: value.sessions,
    pageviews: value.pageviews
  }));
}

function readLinkedRecords(
  spec: Record<string, unknown>,
  sourceKey: string,
  outputKey: string
): Array<Record<string, unknown>> {
  const value = spec[sourceKey];
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => ({ [outputKey]: item }));
}

function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function readIsoString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? Math.min(value, 100) : undefined;
}

function getAnalyticsBundleWorkerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
