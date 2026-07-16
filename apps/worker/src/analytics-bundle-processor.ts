import { gzipSync } from "node:zlib";

import {
  buildAnalyticsBundle,
  stableSerializeAnalyticsBundle,
  type AnalyticsBundleBuildInput
} from "../../../packages/analytics-bundle-engine/src/index.js";
import type { RuntimeLogger } from "../../../packages/runtime-logger/src/index.js";
import {
  type AnalyticsBundleConfidence,
  type AnalyticsBundleGranularity,
  type AnalyticsBundleSeverity,
  type AnalyticsMetricsGranularity
} from "../../../packages/shared-types/src/index.js";
import {
  buildAnalyticsBundleObjectKey,
  type AnalyticsBundleGenerationRecord,
  type AnalyticsBundleGenerationStore,
  type AnalyticsJourneySampleStore,
  type AnalyticsMetricsStore,
  type BuildAnalyticsBundleJob,
  type ClaimedRedisJob,
  type ObjectStoreClient,
  type ObjectStoreReader
} from "../../../packages/storage/src/index.js";
import type { WorkerProcessResult } from "./processor.js";
import { readRepresentativeJourneySamples } from "./analytics-bundle-journey-evidence.js";

export interface BuildAnalyticsBundleWorkerQueue {
  claim(
    jobName: "build-analytics-bundle"
  ): Promise<ClaimedRedisJob<BuildAnalyticsBundleJob> | null>;
}

export interface BuildAnalyticsBundleWorkerDependencies {
  queue: BuildAnalyticsBundleWorkerQueue;
  analyticsBundleGenerationStore: AnalyticsBundleGenerationStore;
  analyticsMetricsStore: AnalyticsMetricsStore;
  analyticsJourneySampleStore: Pick<
    AnalyticsJourneySampleStore,
    "getAnalyticsJourneySampleForProject"
  >;
  objectStore: ObjectStoreClient & ObjectStoreReader;
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
  route?: string | undefined;
  incident_id?: string | undefined;
  deploy_id?: string | undefined;
  opportunity_evidence?: Record<string, unknown> | undefined;
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
  const generation =
    await dependencies.analyticsBundleGenerationStore.getAnalyticsBundleGenerationForProject({
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

  const claimedGeneration =
    await dependencies.analyticsBundleGenerationStore.claimAnalyticsBundleGenerationForProject({
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
      metricsStore: dependencies.analyticsMetricsStore,
      analyticsJourneySampleStore: dependencies.analyticsJourneySampleStore,
      objectStore: dependencies.objectStore,
      logger: dependencies.logger
    });
    const bundle = buildAnalyticsBundle(buildInput);
    const objectKey = buildAnalyticsBundleObjectKey(job.project_id, job.generation_id);

    await dependencies.objectStore.putObject({
      key: objectKey,
      body: gzipSync(Buffer.from(stableSerializeAnalyticsBundle(bundle), "utf8")),
      contentType: "application/json",
      contentEncoding: "gzip"
    });

    const completed =
      await dependencies.analyticsBundleGenerationStore.markAnalyticsBundleGenerationCompleted({
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
  analyticsJourneySampleStore: Pick<
    AnalyticsJourneySampleStore,
    "getAnalyticsJourneySampleForProject"
  >;
  objectStore: ObjectStoreReader;
  logger?: RuntimeLogger | undefined;
}): Promise<AnalyticsBundleBuildInput> {
  const spec = normalizeBundleAnalysisSpec(input.generation);
  if (input.generation.analysis_kind === "incident_impact" && spec.incident_id !== undefined) {
    return await buildIncidentImpactAnalyticsBundleInput({
      generation: input.generation,
      metricsStore: input.metricsStore,
      analyticsJourneySampleStore: input.analyticsJourneySampleStore,
      objectStore: input.objectStore,
      logger: input.logger,
      spec: { ...spec, incident_id: spec.incident_id }
    });
  }
  const metricsInput = {
    project_id: input.generation.project_id,
    from: spec.from,
    to: spec.to,
    granularity: spec.granularity,
    service: spec.service,
    environment: spec.environment,
    limit: spec.limit
  };
  const routeMetricsInput = { ...metricsInput, route: spec.route };
  const [usage, routes, journeys, devices, referrers, actions, funnel] = await Promise.all([
    input.metricsStore.getUsageSummary(metricsInput),
    input.metricsStore.getRouteMetrics(routeMetricsInput),
    input.metricsStore.getJourneyPatterns(routeMetricsInput),
    input.metricsStore.getDeviceBreakdown(metricsInput),
    input.metricsStore.getReferrerMetrics(metricsInput),
    input.metricsStore.getActionMetrics(metricsInput),
    spec.funnel_key === undefined
      ? Promise.resolve(null)
      : input.metricsStore.getFunnelAnalysis({ ...metricsInput, funnel_key: spec.funnel_key })
  ]);
  const affectedSessions = inferAffectedSessions({
    analysisKind: input.generation.analysis_kind,
    sessionsAnalyzed: usage.summary.sessions,
    funnel,
    routes: routes.routes,
    journeys: journeys.patterns,
    actions: actions.actions,
    opportunityEvidence: spec.opportunity_evidence
  });
  const representativeJourneys = [
    ...readRecordArray(input.generation.analysis_spec["representative_journeys"]),
    ...(await readRepresentativeJourneySamples({
      project_id: input.generation.project_id,
      analysis_kind: input.generation.analysis_kind,
      journeys: journeys.patterns,
      analyticsJourneySampleStore: input.analyticsJourneySampleStore,
      objectStore: input.objectStore,
      logger: input.logger
    }))
  ];

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
      title: buildBundleTitle(
        input.generation.analysis_kind,
        spec.funnel_key,
        spec.route,
        spec.deploy_id
      ),
      description: buildBundleDescription(
        input.generation.analysis_kind,
        usage.summary.sessions,
        affectedSessions
      ),
      confidence: inferConfidence(usage.summary.sessions),
      severity: inferSeverity(usage.summary.sessions, affectedSessions)
    },
    metrics: {
      sessions_analyzed: usage.summary.sessions,
      affected_sessions: affectedSessions,
      baseline: buildOpportunityBaseline(spec.opportunity_evidence),
      current: {
        usage: usage.summary,
        routes: routes.routes,
        actions: actions.actions,
        funnel: funnel?.funnel ?? null,
        source_opportunity: spec.opportunity_evidence ?? null
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
    representative_journeys: representativeJourneys,
    linked_incidents: readLinkedRecords(input.generation.analysis_spec, {
      arrayKey: "related_incident_ids",
      scalarKey: "incident_id",
      outputKey: "incident_id"
    }),
    linked_deploys: readLinkedRecords(input.generation.analysis_spec, {
      arrayKey: "related_deploy_ids",
      scalarKey: "deploy_id",
      outputKey: "deploy_id"
    }),
    recommendations: buildRecommendations(input.generation.analysis_kind)
  };
}

async function buildIncidentImpactAnalyticsBundleInput(input: {
  generation: AnalyticsBundleGenerationRecord;
  metricsStore: AnalyticsMetricsStore;
  analyticsJourneySampleStore: Pick<
    AnalyticsJourneySampleStore,
    "getAnalyticsJourneySampleForProject"
  >;
  objectStore: ObjectStoreReader;
  logger?: RuntimeLogger | undefined;
  spec: NormalizedBundleAnalysisSpec & { incident_id: string };
}): Promise<AnalyticsBundleBuildInput> {
  const metricsInput = {
    project_id: input.generation.project_id,
    from: input.spec.from,
    to: input.spec.to,
    granularity: input.spec.granularity,
    service: input.spec.service,
    environment: input.spec.environment,
    limit: input.spec.limit
  };
  const [usage, impact] = await Promise.all([
    input.metricsStore.getUsageSummary(metricsInput),
    input.metricsStore.getIncidentImpact({
      ...metricsInput,
      incident_id: input.spec.incident_id
    })
  ]);
  const affectedSessions = impact.affected_sessions;

  return {
    analysis_kind: input.generation.analysis_kind,
    input_fingerprint: input.generation.input_fingerprint,
    project: {
      project_id: input.generation.project_id,
      service: impact.window.service,
      environment: impact.window.environment
    },
    analysis_window: {
      from: input.spec.from,
      to: input.spec.to,
      granularity: input.spec.granularity as AnalyticsBundleGranularity
    },
    summary: {
      title: buildBundleTitle(input.generation.analysis_kind, undefined, undefined, undefined),
      description: buildBundleDescription(
        input.generation.analysis_kind,
        usage.summary.sessions,
        affectedSessions
      ),
      confidence: inferConfidence(affectedSessions),
      severity: inferSeverity(usage.summary.sessions, affectedSessions)
    },
    metrics: {
      sessions_analyzed: usage.summary.sessions,
      affected_sessions: affectedSessions,
      baseline: buildOpportunityBaseline(input.spec.opportunity_evidence),
      current: {
        usage: usage.summary,
        incident_impact: {
          affected_sessions: impact.affected_sessions,
          affected_routes: impact.affected_routes,
          affected_funnels: impact.affected_funnels,
          conversion_delta: impact.conversion_delta
        },
        source_opportunity: input.spec.opportunity_evidence ?? null
      }
    },
    segments: [
      ...toImpactSegments("device_type", impact.top_device_types),
      ...toImpactSegments("browser", impact.top_browsers)
    ],
    journey_patterns: impact.journey_patterns,
    representative_journeys: await readRepresentativeJourneySamples({
      project_id: input.generation.project_id,
      analysis_kind: input.generation.analysis_kind,
      journeys: impact.journey_patterns,
      analyticsJourneySampleStore: input.analyticsJourneySampleStore,
      objectStore: input.objectStore,
      logger: input.logger
    }),
    linked_incidents: readLinkedRecords(input.generation.analysis_spec, {
      arrayKey: "related_incident_ids",
      scalarKey: "incident_id",
      outputKey: "incident_id"
    }),
    linked_deploys: readLinkedRecords(input.generation.analysis_spec, {
      arrayKey: "related_deploy_ids",
      scalarKey: "deploy_id",
      outputKey: "deploy_id"
    }),
    recommendations: buildRecommendations(input.generation.analysis_kind)
  };
}

function buildOpportunityBaseline(
  evidence: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (evidence === undefined) {
    return {};
  }

  const baseline: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(evidence)) {
    if (key === "baseline_window") {
      baseline["window"] = value;
    } else if (key.startsWith("baseline_") && key.length > "baseline_".length) {
      baseline[key.slice("baseline_".length)] = value;
    }
  }
  return baseline;
}

function normalizeBundleAnalysisSpec(
  generation: AnalyticsBundleGenerationRecord
): NormalizedBundleAnalysisSpec {
  const spec = generation.analysis_spec;
  const filters = isRecord(spec["filters"]) ? spec["filters"] : {};
  const fallbackTo = readIsoString(spec["to"]) ?? generation.created_at;
  const to = readIsoString(spec["to"]) ?? fallbackTo;
  const fallbackFrom = new Date(
    Date.parse(to) - DEFAULT_ANALYSIS_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const requestedFrom = readIsoString(spec["from"]) ?? fallbackFrom;
  const from = Date.parse(requestedFrom) <= Date.parse(to) ? requestedFrom : fallbackFrom;

  return {
    from,
    to,
    granularity: spec["granularity"] === "hour" ? "hour" : "day",
    service: readNonEmptyString(spec["service"]) ?? readNonEmptyString(filters["service"]),
    environment:
      readNonEmptyString(spec["environment"]) ?? readNonEmptyString(filters["environment"]),
    limit: readPositiveInteger(spec["limit"]) ?? DEFAULT_METRIC_LIMIT,
    funnel_key: readNonEmptyString(spec["funnel_key"]) ?? readNonEmptyString(spec["funnel"]),
    route: readNonEmptyString(spec["route"]),
    incident_id: readUuid(spec["incident_id"]),
    deploy_id: readNonEmptyString(spec["deploy_id"]),
    opportunity_evidence: isRecord(spec["opportunity_evidence"])
      ? spec["opportunity_evidence"]
      : undefined
  };
}

function inferAffectedSessions(input: {
  analysisKind: AnalyticsBundleGenerationRecord["analysis_kind"];
  sessionsAnalyzed: number;
  funnel: Awaited<ReturnType<AnalyticsMetricsStore["getFunnelAnalysis"]>> | null;
  routes: Awaited<ReturnType<AnalyticsMetricsStore["getRouteMetrics"]>>["routes"];
  journeys: Awaited<ReturnType<AnalyticsMetricsStore["getJourneyPatterns"]>>["patterns"];
  actions: Awaited<ReturnType<AnalyticsMetricsStore["getActionMetrics"]>>["actions"];
  opportunityEvidence?: Record<string, unknown> | undefined;
}): number | null {
  if (input.analysisKind === "funnel_dropoff" && input.funnel !== null) {
    return input.funnel.funnel.dropoffs;
  }

  if (input.analysisKind === "route_health") {
    const opportunityExits = readOptionalNonNegativeInteger(
      input.opportunityEvidence?.["current_exits"]
    );
    const affected = opportunityExits ?? input.routes.reduce((sum, route) => sum + route.exits, 0);
    return Math.min(input.sessionsAnalyzed, affected);
  }

  if (input.analysisKind === "journey_friction" || input.analysisKind === "conversion_path") {
    const affected = input.journeys.reduce((sum, journey) => sum + journey.unique_sessions, 0);
    return Math.min(input.sessionsAnalyzed, affected);
  }

  if (input.analysisKind === "feature_usage") {
    const affected = input.actions.reduce((sum, action) => sum + action.unique_sessions, 0);
    return Math.min(input.sessionsAnalyzed, affected);
  }

  if (input.analysisKind === "deploy_comparison") {
    const baseline = readOptionalNonNegativeInteger(
      input.opportunityEvidence?.["baseline_conversions"]
    );
    const current = readOptionalNonNegativeInteger(
      input.opportunityEvidence?.["current_conversions"]
    );
    if (baseline !== undefined && current !== undefined) {
      return Math.min(input.sessionsAnalyzed, Math.max(0, baseline - current));
    }
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
  funnelKey: string | undefined,
  route: string | undefined,
  deployId: string | undefined
): string {
  if (analysisKind === "funnel_dropoff" && funnelKey !== undefined) {
    return `Funnel dropoff analysis for ${funnelKey}`;
  }

  if (analysisKind === "route_health" && route !== undefined) {
    return `Route health analysis for ${route}`;
  }

  if (analysisKind === "deploy_comparison" && deployId !== undefined) {
    return `Deploy comparison for ${deployId}`;
  }

  return `${analysisKind.replaceAll("_", " ")} analysis`;
}

function buildBundleDescription(
  analysisKind: AnalyticsBundleGenerationRecord["analysis_kind"],
  sessionsAnalyzed: number,
  affectedSessions: number | null
): string {
  const affected =
    affectedSessions === null ? "aggregate usage" : `${affectedSessions} affected sessions`;
  return `${analysisKind.replaceAll("_", " ")} evidence across ${sessionsAnalyzed} sessions with ${affected}.`;
}

function buildRecommendations(
  analysisKind: AnalyticsBundleGenerationRecord["analysis_kind"]
): Array<Record<string, unknown>> | undefined {
  if (analysisKind === "usage_summary") {
    return [
      {
        priority: 1,
        action: "review_top_segments_and_routes",
        rationale:
          "Compare high-volume routes, devices, referrers, and journey transitions before choosing optimizations."
      }
    ];
  }

  const recommendations: Record<
    AnalyticsBundleGenerationRecord["analysis_kind"],
    { action: string; rationale: string }
  > = {
    usage_summary: {
      action: "review_top_segments_and_routes",
      rationale:
        "Compare high-volume routes, devices, referrers, and journey transitions before choosing optimizations."
    },
    route_health: {
      action: "inspect_route_exit_and_bounce_segments",
      rationale:
        "Compare the affected route across device, referrer, and navigation segments before changing its flow."
    },
    funnel_dropoff: {
      action: "reduce_the_highest_funnel_dropoff",
      rationale:
        "Inspect the first material step loss and its representative journeys before changing later steps."
    },
    journey_friction: {
      action: "simplify_repeated_navigation_paths",
      rationale:
        "Review the highest-reach loops and friction markers, then remove ambiguous or ineffective actions."
    },
    feature_usage: {
      action: "compare_feature_adoption_segments",
      rationale:
        "Separate discoverability, activation, and repeat-use signals before changing feature placement."
    },
    incident_impact: {
      action: "prioritize_the_largest_incident_affected_journeys",
      rationale:
        "Use correlated routes, segments, and representative journeys to verify the customer impact of the incident fix."
    },
    deploy_comparison: {
      action: "inspect_the_post_deploy_conversion_regression",
      rationale:
        "Compare changed routes and actions against the baseline deploy and consider rollback when the regression is confirmed."
    },
    conversion_path: {
      action: "optimize_the_highest_loss_conversion_path",
      rationale:
        "Start with the earliest high-reach path loss and validate the change against the same conversion definition."
    }
  };
  return [{ priority: 1, ...recommendations[analysisKind] }];
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

function toImpactSegments(
  dimension: string,
  values: Array<{ value: string; affected_sessions: number }>
): Array<Record<string, unknown>> {
  return values.map((value) => ({
    dimension,
    value: value.value,
    affected_sessions: value.affected_sessions
  }));
}

function readLinkedRecords(
  spec: Record<string, unknown>,
  keys: {
    arrayKey: string;
    scalarKey: string;
    outputKey: string;
  }
): Array<Record<string, unknown>> {
  const arrayValue = spec[keys.arrayKey];
  const scalarValue = spec[keys.scalarKey];
  const arrayItems: unknown[] = Array.isArray(arrayValue) ? arrayValue : [];
  const values = [...arrayItems, scalarValue];

  return [
    ...new Set(values.map(readNullableString).filter((item): item is string => item !== null))
  ].map((item) => ({ [keys.outputKey]: item }));
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

function readUuid(value: unknown): string | undefined {
  const parsed = readNonEmptyString(value);
  return parsed !== undefined &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)
    ? parsed
    : undefined;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? Math.min(value, 100)
    : undefined;
}

function readOptionalNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function getAnalyticsBundleWorkerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
