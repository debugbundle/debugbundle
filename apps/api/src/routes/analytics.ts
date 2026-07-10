import { gunzipSync } from "node:zlib";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import {
  AnalyticsActionMetricsResponseSchema,
  AnalyticsBundleAnalysisKindSchema,
  AnalyticsBundleGenerationsListResponseSchema,
  AnalyticsBundleGenerationStatusSchema,
  AnalyticsBundleV1Schema,
  AnalyticsDeviceBreakdownResponseSchema,
  AnalyticsFunnelAnalysisResponseSchema,
  AnalyticsFunnelsResponseSchema,
  AnalyticsIncidentImpactResponseSchema,
  AnalyticsJourneyPatternsResponseSchema,
  AnalyticsMetricsGranularitySchema,
  AnalyticsOpportunitiesListResponseSchema,
  AnalyticsOpportunityResponseSchema,
  AnalyticsOpportunityStatusSchema,
  AnalyticsReferrerMetricsResponseSchema,
  AnalyticsRouteMetricsResponseSchema,
  AnalyticsUsageSummaryResponseSchema,
  getTierCapabilities
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import {
  claimAnalyticsBundleGenerationQuota,
  releaseAnalyticsQuotaClaimBestEffort,
  toRetryAfterSeconds
} from "../analytics-quota.js";
import { isObjectNotFoundError, requireRateLimitedProjectAccess } from "../api-helpers.js";
import { registerAnalyticsJourneySampleRoutes } from "./analytics-journey-samples.js";

const DEFAULT_LAST_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LAST_MS = 370 * 24 * 60 * 60 * 1000;

const AnalyticsSummaryQuerySchema = z
  .object({
    project_id: z.string().uuid(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    last: z.string().trim().min(2).max(16).optional(),
    granularity: AnalyticsMetricsGranularitySchema.optional().default("day"),
    service: z.string().trim().min(1).max(120).optional(),
    environment: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10)
  })
  .strict();

const AnalyticsFunnelParamsSchema = z.object({
  key: z.string().trim().min(1).max(120)
}).strict();

const AnalyticsIncidentImpactParamsSchema = z.object({
  id: z.string().uuid()
}).strict();

const AnalyticsOpportunitiesQuerySchema = z
  .object({
    project_id: z.string().uuid(),
    status: z.union([AnalyticsOpportunityStatusSchema, z.literal("all")]).optional().default("open"),
    kind: AnalyticsBundleAnalysisKindSchema.optional(),
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20)
  })
  .strict();

const AnalyticsOpportunityParamsSchema = z.object({
  id: z.string().uuid()
}).strict();

const AnalyticsBundleParamsSchema = z.object({
  id: z.string().uuid()
}).strict();

const AnalyticsBundlesListQuerySchema = z
  .object({
    project_id: z.string().uuid(),
    status: z.union([AnalyticsBundleGenerationStatusSchema, z.literal("all")]).optional().default("all"),
    kind: AnalyticsBundleAnalysisKindSchema.optional(),
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20)
  })
  .strict();

const AnalyticsBundleQuerySchema = z
  .object({
    project_id: z.string().uuid()
  })
  .strict();

const AnalyticsBundleCreateBodySchema = z
  .object({
    project_id: z.string().uuid(),
    analysis_kind: AnalyticsBundleAnalysisKindSchema,
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    last: z.string().trim().min(2).max(16).optional(),
    funnel: z.string().trim().min(1).max(120).nullable().optional(),
    route: z
      .string()
      .trim()
      .min(1)
      .max(2048)
      .refine((value) => !value.includes("?") && !value.includes("#"))
      .nullable()
      .optional(),
    incident_id: z.string().uuid().nullable().optional(),
    deploy_id: z.string().trim().min(1).max(120).nullable().optional(),
    filters: z.record(z.string(), z.unknown()).optional().default({})
  })
  .strict();

type AnalyticsQuery = z.infer<typeof AnalyticsSummaryQuerySchema>;
type AuthorizedAnalyticsQuery = AnalyticsQuery & { from: string; to: string; organization_id: string };
type AnalyticsBundleGeneration = NonNullable<
  Awaited<ReturnType<NonNullable<ApiDependencies["analyticsBundles"]>["getAnalyticsBundleGenerationForProject"]>>
>;

export function registerAnalyticsRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  registerAnalyticsJourneySampleRoutes(app, dependencies);

  app.get("/v1/analytics/opportunities", async (request, reply) => {
    const parsedQuery = AnalyticsOpportunitiesQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const parsedCursor = parseAnalyticsOpportunitiesCursor(parsedQuery.data.cursor);
    if (parsedQuery.data.cursor !== undefined && parsedCursor === null) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const access = await requireAnalyticsProjectReadAccess(request, reply, dependencies, parsedQuery.data.project_id);
    if (access === null) {
      return;
    }

    if (dependencies.analyticsOpportunities === undefined) {
      return reply.status(404).send({ error: "analytics_opportunities_not_available" });
    }

    const opportunities = await dependencies.analyticsOpportunities.listAnalyticsOpportunitiesForProject({
      organization_id: access.organization_id,
      project_id: parsedQuery.data.project_id,
      ...(parsedQuery.data.status === "all" ? {} : { status: parsedQuery.data.status }),
      ...(parsedQuery.data.kind === undefined ? {} : { kind: parsedQuery.data.kind }),
      ...(parsedCursor === null ? {} : { cursor: parsedCursor }),
      limit: parsedQuery.data.limit
    });

    return reply.status(200).send(AnalyticsOpportunitiesListResponseSchema.parse(opportunities));
  });

  app.get("/v1/analytics/opportunities/:id", async (request, reply) => {
    const parsedParams = AnalyticsOpportunityParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_opportunity_id" });
    }

    const parsedQuery = z.object({ project_id: z.string().uuid() }).strict().safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const access = await requireAnalyticsProjectReadAccess(request, reply, dependencies, parsedQuery.data.project_id);
    if (access === null) {
      return;
    }

    if (dependencies.analyticsOpportunities === undefined) {
      return reply.status(404).send({ error: "analytics_opportunities_not_available" });
    }

    const opportunity = await dependencies.analyticsOpportunities.getAnalyticsOpportunityForProject({
      organization_id: access.organization_id,
      project_id: parsedQuery.data.project_id,
      opportunity_id: parsedParams.data.id
    });
    if (opportunity === null) {
      return reply.status(404).send({ error: "analytics_opportunity_not_found" });
    }

    return reply.status(200).send(AnalyticsOpportunityResponseSchema.parse(opportunity));
  });

  app.post("/v1/analytics/bundles", async (request, reply) => {
    const parsedBody = AnalyticsBundleCreateBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_body" });
    }
    if (
      parsedBody.data.analysis_kind === "incident_impact" &&
      (parsedBody.data.incident_id === null || parsedBody.data.incident_id === undefined)
    ) {
      return reply.status(400).send({ error: "invalid_body" });
    }

    let range = resolveAnalyticsTimeRange(parsedBody.data);
    if (range === null) {
      return reply.status(400).send({ error: "invalid_body" });
    }

    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "retrieval-write",
      projectId: parsedBody.data.project_id
    });
    if (auth === null) {
      return;
    }

    if (!getTierCapabilities(auth.access.organization_plan).analytics_bundle) {
      return reply.status(403).send({ error: "upgrade_required" });
    }

    if (parsedBody.data.analysis_kind === "incident_impact") {
      const incident = await dependencies.incidentRetrieval.getIncidentForOrganization({
        organization_id: auth.access.organization_id,
        incident_id: parsedBody.data.incident_id!,
        user_id: auth.member.member_id
      });
      if (incident === null || incident.project_id !== parsedBody.data.project_id) {
        return reply.status(404).send({ error: "incident_not_found" });
      }
      range = resolveIncidentImpactTimeRange(parsedBody.data, incident);
      if (range === null) {
        return reply.status(400).send({ error: "invalid_body" });
      }
    }

    if (dependencies.analyticsSettingsManagement === undefined) {
      return reply.status(404).send({ error: "analytics_settings_not_available" });
    }

    const settings = await dependencies.analyticsSettingsManagement.getAnalyticsSettingsForProject({
      organization_id: auth.access.organization_id,
      project_id: parsedBody.data.project_id
    });
    if (settings === null || !settings.enabled) {
      return reply.status(403).send({ error: "analytics_disabled" });
    }

    if (dependencies.analyticsBundles === undefined) {
      return reply.status(404).send({ error: "analytics_bundles_not_available" });
    }

    const quota = await claimAnalyticsBundleGenerationQuota({
      dependencies,
      organization_id: auth.access.organization_id,
      organization_plan: auth.access.organization_plan,
      now: new Date()
    });
    if (!quota.allowed) {
      return reply
        .header("Retry-After", toRetryAfterSeconds(quota.retry_after_ms))
        .status(429)
        .send({
          error: "analytics_quota_exceeded",
          retry_after_ms: quota.retry_after_ms
        });
    }

    let generation: AnalyticsBundleGeneration;
    try {
      generation = await dependencies.analyticsBundles.requestAnalyticsBundleGenerationForProject({
        organization_id: auth.access.organization_id,
        project_id: parsedBody.data.project_id,
        requested_by_user_id: auth.member.member_id,
        analysis_kind: parsedBody.data.analysis_kind,
        analysis_spec: buildAnalyticsBundleAnalysisSpec({
          ...parsedBody.data,
          from: range.from,
          to: range.to
        })
      });
    } catch (error) {
      await releaseAnalyticsQuotaClaimBestEffort({
        dependencies,
        release: quota.allowed ? quota.release : undefined
      });
      throw error;
    }

    return sendAnalyticsBundleGenerationResponse(reply, dependencies, generation);
  });

  app.get("/v1/analytics/bundles", async (request, reply) => {
    const parsedQuery = AnalyticsBundlesListQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const parsedCursor = parseAnalyticsBundleGenerationsCursor(parsedQuery.data.cursor);
    if (parsedQuery.data.cursor !== undefined && parsedCursor === null) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const access = await requireAnalyticsProjectReadAccess(request, reply, dependencies, parsedQuery.data.project_id);
    if (access === null) {
      return;
    }

    if (dependencies.analyticsBundles === undefined) {
      return reply.status(404).send({ error: "analytics_bundles_not_available" });
    }

    const generations = await dependencies.analyticsBundles.listAnalyticsBundleGenerationsForProject({
      organization_id: access.organization_id,
      project_id: parsedQuery.data.project_id,
      ...(parsedQuery.data.status === "all" ? {} : { status: parsedQuery.data.status }),
      ...(parsedQuery.data.kind === undefined ? {} : { analysis_kind: parsedQuery.data.kind }),
      ...(parsedCursor === null ? {} : { cursor: parsedCursor }),
      limit: parsedQuery.data.limit
    });

    return reply.status(200).send(AnalyticsBundleGenerationsListResponseSchema.parse({
      bundles: generations.bundles.map(toAnalyticsBundleGenerationListRecord),
      next_cursor: generations.next_cursor
    }));
  });

  app.get("/v1/analytics/bundles/:id", async (request, reply) => {
    const parsedParams = AnalyticsBundleParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_bundle_generation_id" });
    }

    const parsedQuery = AnalyticsBundleQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const access = await requireAnalyticsProjectReadAccess(request, reply, dependencies, parsedQuery.data.project_id);
    if (access === null) {
      return;
    }

    if (dependencies.analyticsBundles === undefined) {
      return reply.status(404).send({ error: "analytics_bundles_not_available" });
    }

    const generation = await dependencies.analyticsBundles.getAnalyticsBundleGenerationForProject({
      organization_id: access.organization_id,
      project_id: parsedQuery.data.project_id,
      generation_id: parsedParams.data.id
    });
    if (generation === null) {
      return reply.status(404).send({ error: "analytics_bundle_not_found" });
    }

    return sendAnalyticsBundleGenerationResponse(reply, dependencies, generation);
  });

  app.get("/v1/analytics/summary", async (request, reply) => {
    const input = await requireAnalyticsMetricsQuery(request, reply, dependencies);
    if (input === null) {
      return;
    }

    const summary = await dependencies.analyticsMetrics!.getUsageSummaryForProject(toMetricsInput(input));

    return reply.status(200).send(AnalyticsUsageSummaryResponseSchema.parse(summary));
  });

  app.get("/v1/analytics/routes", async (request, reply) => {
    const input = await requireAnalyticsMetricsQuery(request, reply, dependencies);
    if (input === null) {
      return;
    }

    const routes = await dependencies.analyticsMetrics!.getRouteMetricsForProject(toMetricsInput(input));

    return reply.status(200).send(AnalyticsRouteMetricsResponseSchema.parse(routes));
  });

  app.get("/v1/analytics/journey-patterns", async (request, reply) => {
    const input = await requireAnalyticsMetricsQuery(request, reply, dependencies);
    if (input === null) {
      return;
    }

    const journeys = await dependencies.analyticsMetrics!.getJourneyPatternsForProject(toMetricsInput(input));

    return reply.status(200).send(AnalyticsJourneyPatternsResponseSchema.parse(journeys));
  });

  app.get("/v1/analytics/devices", async (request, reply) => {
    const input = await requireAnalyticsMetricsQuery(request, reply, dependencies);
    if (input === null) {
      return;
    }

    const devices = await dependencies.analyticsMetrics!.getDeviceBreakdownForProject(toMetricsInput(input));

    return reply.status(200).send(AnalyticsDeviceBreakdownResponseSchema.parse(devices));
  });

  app.get("/v1/analytics/referrers", async (request, reply) => {
    const input = await requireAnalyticsMetricsQuery(request, reply, dependencies);
    if (input === null) {
      return;
    }

    const referrers = await dependencies.analyticsMetrics!.getReferrerMetricsForProject(toMetricsInput(input));

    return reply.status(200).send(AnalyticsReferrerMetricsResponseSchema.parse(referrers));
  });

  app.get("/v1/analytics/actions", async (request, reply) => {
    const input = await requireAnalyticsMetricsQuery(request, reply, dependencies);
    if (input === null) {
      return;
    }

    const actions = await dependencies.analyticsMetrics!.getActionMetricsForProject(toMetricsInput(input));

    return reply.status(200).send(AnalyticsActionMetricsResponseSchema.parse(actions));
  });

  app.get("/v1/analytics/funnels", async (request, reply) => {
    const input = await requireAnalyticsMetricsQuery(request, reply, dependencies);
    if (input === null) {
      return;
    }

    const funnels = await dependencies.analyticsMetrics!.listFunnelsForProject(toMetricsInput(input));

    return reply.status(200).send(AnalyticsFunnelsResponseSchema.parse(funnels));
  });

  app.get("/v1/analytics/funnels/:key", async (request, reply) => {
    const parsedParams = AnalyticsFunnelParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_funnel_key" });
    }

    const input = await requireAnalyticsMetricsQuery(request, reply, dependencies);
    if (input === null) {
      return;
    }

    const funnel = await dependencies.analyticsMetrics!.getFunnelAnalysisForProject({
      ...toMetricsInput(input),
      funnel_key: parsedParams.data.key
    });

    return reply.status(200).send(AnalyticsFunnelAnalysisResponseSchema.parse(funnel));
  });

  app.get("/v1/analytics/incidents/:id/impact", async (request, reply) => {
    const parsedParams = AnalyticsIncidentImpactParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_incident_id" });
    }

    const input = await requireAnalyticsIncidentImpactQuery(request, reply, dependencies, parsedParams.data.id);
    if (input === null) {
      return;
    }

    const impact = await dependencies.analyticsMetrics!.getIncidentImpactForProject(input);
    return reply.status(200).send(AnalyticsIncidentImpactResponseSchema.parse(impact));
  });
}

function toAnalyticsBundleGenerationListRecord(generation: AnalyticsBundleGeneration): unknown {
  return {
    generation_id: generation.generation_id,
    project_id: generation.project_id,
    opportunity_id: generation.opportunity_id,
    requested_by_user_id: generation.requested_by_user_id,
    analysis_kind: generation.analysis_kind,
    analysis_spec: generation.analysis_spec,
    input_fingerprint: generation.input_fingerprint,
    status: generation.status,
    has_artifact: generation.object_key !== null,
    failure_reason: generation.failure_reason,
    created_at: generation.created_at,
    claimed_at: generation.claimed_at,
    completed_at: generation.completed_at,
    updated_at: generation.updated_at
  };
}

function buildAnalyticsBundleAnalysisSpec(input: z.infer<typeof AnalyticsBundleCreateBodySchema> & {
  from: string;
  to: string;
}): Record<string, unknown> {
  const incidentId = input.incident_id ?? null;
  const deployId = input.deploy_id ?? null;
  return {
    from: input.from,
    to: input.to,
    funnel: input.funnel ?? null,
    route: input.route ?? null,
    incident_id: incidentId,
    deploy_id: deployId,
    related_incident_ids: incidentId === null ? [] : [incidentId],
    related_deploy_ids: deployId === null ? [] : [deployId],
    filters: input.filters
  };
}

async function sendAnalyticsBundleGenerationResponse(
  reply: FastifyReply,
  dependencies: ApiDependencies,
  generation: AnalyticsBundleGeneration
): Promise<FastifyReply> {
  if (generation.status === "pending" || generation.status === "running") {
    return reply.status(200).send({
      status: "pending",
      bundle_generation_id: generation.generation_id
    });
  }

  if (generation.status === "failed") {
    return reply.status(200).send({
      status: "failed",
      reason: generation.failure_reason ?? "analytics_bundle_generation_failed"
    });
  }

  if (generation.object_key === null) {
    return reply.status(404).send({ error: "analytics_bundle_artifact_not_found" });
  }

  let bundleArtifact: unknown;
  try {
    const compressed = await dependencies.objectStoreReader.getObject({ key: generation.object_key });
    bundleArtifact = JSON.parse(gunzipSync(compressed).toString("utf8"));
  } catch (error) {
    if (isObjectNotFoundError(error)) {
      return reply.status(404).send({ error: "analytics_bundle_artifact_not_found" });
    }

    return reply.status(500).send({ error: "analytics_bundle_artifact_unavailable" });
  }

  const parsedBundle = AnalyticsBundleV1Schema.safeParse(bundleArtifact);
  if (!parsedBundle.success) {
    return reply.status(500).send({ error: "analytics_bundle_artifact_invalid" });
  }

  return reply.status(200).send(parsedBundle.data);
}

async function requireAnalyticsMetricsQuery(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies
): Promise<AuthorizedAnalyticsQuery | null> {
  const parsedQuery = AnalyticsSummaryQuerySchema.safeParse(request.query);
  if (!parsedQuery.success) {
    await reply.status(400).send({ error: "invalid_query" });
    return null;
  }

  const range = resolveAnalyticsTimeRange(parsedQuery.data);
  if (range === null) {
    await reply.status(400).send({ error: "invalid_query" });
    return null;
  }

  const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
    bucket: "retrieval-read",
    projectId: parsedQuery.data.project_id
  });
  if (auth === null) {
    return null;
  }

  if (!getTierCapabilities(auth.access.organization_plan).analytics_bundle) {
    await reply.status(403).send({ error: "upgrade_required" });
    return null;
  }

  if (dependencies.analyticsMetrics === undefined) {
    await reply.status(404).send({ error: "analytics_metrics_not_available" });
    return null;
  }

  return {
    ...parsedQuery.data,
    from: range.from,
    to: range.to,
    organization_id: auth.access.organization_id
  };
}

async function requireAnalyticsIncidentImpactQuery(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  incidentId: string
): Promise<(ReturnType<typeof toMetricsInput> & { incident_id: string }) | null> {
  const parsedQuery = AnalyticsSummaryQuerySchema.safeParse(request.query);
  if (!parsedQuery.success) {
    await reply.status(400).send({ error: "invalid_query" });
    return null;
  }

  const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
    bucket: "retrieval-read",
    projectId: parsedQuery.data.project_id
  });
  if (auth === null) {
    return null;
  }

  if (!getTierCapabilities(auth.access.organization_plan).analytics_bundle) {
    await reply.status(403).send({ error: "upgrade_required" });
    return null;
  }

  if (dependencies.analyticsMetrics === undefined) {
    await reply.status(404).send({ error: "analytics_metrics_not_available" });
    return null;
  }

  const incident = await dependencies.incidentRetrieval.getIncidentForOrganization({
    organization_id: auth.access.organization_id,
    incident_id: incidentId,
    user_id: auth.member.member_id
  });
  if (incident === null || incident.project_id !== parsedQuery.data.project_id) {
    await reply.status(404).send({ error: "incident_not_found" });
    return null;
  }

  const range = resolveIncidentImpactTimeRange(parsedQuery.data, incident);
  if (range === null) {
    await reply.status(400).send({ error: "invalid_query" });
    return null;
  }

  return {
    organization_id: auth.access.organization_id,
    project_id: parsedQuery.data.project_id,
    incident_id: incidentId,
    from: range.from,
    to: range.to,
    granularity: parsedQuery.data.granularity,
    service: parsedQuery.data.service,
    environment: parsedQuery.data.environment,
    limit: parsedQuery.data.limit
  };
}

function toMetricsInput(input: AuthorizedAnalyticsQuery): {
  organization_id: string;
  project_id: string;
  from: string;
  to: string;
  granularity: "hour" | "day";
  service?: string | undefined;
  environment?: string | undefined;
  limit?: number | undefined;
} {
  return {
    organization_id: input.organization_id,
    project_id: input.project_id,
    from: input.from,
    to: input.to,
    granularity: input.granularity,
    service: input.service,
    environment: input.environment,
    limit: input.limit
  };
}

function resolveAnalyticsTimeRange(input: {
  from?: string | undefined;
  to?: string | undefined;
  last?: string | undefined;
}): { from: string; to: string } | null {
  if (input.last !== undefined && input.from !== undefined) {
    return null;
  }

  const to = input.to ?? new Date().toISOString();
  const toMs = Date.parse(to);
  if (Number.isNaN(toMs)) {
    return null;
  }

  let from = input.from;
  if (from === undefined) {
    const lastMs = input.last === undefined ? DEFAULT_LAST_MS : parseLastDurationMs(input.last);
    if (lastMs === null) {
      return null;
    }
    from = new Date(toMs - lastMs).toISOString();
  }

  const fromMs = Date.parse(from);
  if (Number.isNaN(fromMs) || fromMs > toMs) {
    return null;
  }

  return {
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString()
  };
}

function resolveIncidentImpactTimeRange(
  input: {
    from?: string | undefined;
    to?: string | undefined;
    last?: string | undefined;
  },
  incident: { first_seen_at: string; last_seen_at: string }
): { from: string; to: string } | null {
  if (input.from !== undefined || input.last !== undefined || input.to !== undefined) {
    return resolveAnalyticsTimeRange(input);
  }

  const firstSeenAt = Date.parse(incident.first_seen_at);
  const lastSeenAt = Date.parse(incident.last_seen_at);
  if (Number.isNaN(firstSeenAt) || Number.isNaN(lastSeenAt) || firstSeenAt > lastSeenAt) {
    return null;
  }

  // Keep the implicit read bounded while including complete affected rollup buckets.
  const boundedFirstSeenAt = Math.max(firstSeenAt, lastSeenAt - DEFAULT_LAST_MS);
  return {
    from: new Date(boundedFirstSeenAt - 24 * 60 * 60 * 1000).toISOString(),
    to: new Date(lastSeenAt + 24 * 60 * 60 * 1000).toISOString()
  };
}

function parseLastDurationMs(value: string): number | null {
  const match = /^([1-9][0-9]{0,4})([hdw])$/.exec(value.trim());
  if (match === null) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier =
    unit === "h"
      ? 60 * 60 * 1000
      : unit === "d"
        ? 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;
  const durationMs = amount * multiplier;

  return durationMs <= MAX_LAST_MS ? durationMs : null;
}

async function requireAnalyticsProjectReadAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  projectId: string
): Promise<{ organization_id: string } | null> {
  const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
    bucket: "retrieval-read",
    projectId
  });
  if (auth === null) {
    return null;
  }

  if (!getTierCapabilities(auth.access.organization_plan).analytics_bundle) {
    await reply.status(403).send({ error: "upgrade_required" });
    return null;
  }

  return {
    organization_id: auth.access.organization_id
  };
}

function parseAnalyticsOpportunitiesCursor(
  rawCursor: string | undefined
): { last_detected_at: string; opportunity_id: string } | null {
  if (rawCursor === undefined) {
    return null;
  }

  const separatorIndex = rawCursor.lastIndexOf("|");
  if (separatorIndex <= 0 || separatorIndex >= rawCursor.length - 1) {
    return null;
  }

  const lastDetectedAt = rawCursor.slice(0, separatorIndex);
  const opportunityId = rawCursor.slice(separatorIndex + 1);
  const parsedTimestamp = Date.parse(lastDetectedAt);
  if (Number.isNaN(parsedTimestamp)) {
    return null;
  }

  const parsed = z.object({
    last_detected_at: z.string().datetime(),
    opportunity_id: z.string().uuid()
  }).safeParse({
    last_detected_at: new Date(parsedTimestamp).toISOString(),
    opportunity_id: opportunityId
  });

  return parsed.success ? parsed.data : null;
}

function parseAnalyticsBundleGenerationsCursor(
  rawCursor: string | undefined
): { created_at: string; generation_id: string } | null {
  if (rawCursor === undefined) {
    return null;
  }

  const separatorIndex = rawCursor.lastIndexOf("|");
  if (separatorIndex <= 0 || separatorIndex >= rawCursor.length - 1) {
    return null;
  }

  const createdAt = rawCursor.slice(0, separatorIndex);
  const generationId = rawCursor.slice(separatorIndex + 1);
  const parsedTimestamp = Date.parse(createdAt);
  if (Number.isNaN(parsedTimestamp)) {
    return null;
  }

  const parsed = z.object({
    created_at: z.string().datetime(),
    generation_id: z.string().uuid()
  }).safeParse({
    created_at: new Date(parsedTimestamp).toISOString(),
    generation_id: generationId
  });

  return parsed.success ? parsed.data : null;
}
