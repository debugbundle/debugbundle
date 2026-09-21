import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import {
  AnalyticsActionMetricsResponseSchema,
  AnalyticsBundleGenerationsListResponseSchema,
  AnalyticsDeviceBreakdownResponseSchema,
  AnalyticsFunnelAnalysisResponseSchema,
  AnalyticsFunnelsResponseSchema,
  AnalyticsIncidentImpactResponseSchema,
  AnalyticsJourneyPatternsResponseSchema,
  AnalyticsOpportunitiesListResponseSchema,
  AnalyticsOpportunityResponseSchema,
  AnalyticsReferrerMetricsResponseSchema,
  AnalyticsRouteMetricsResponseSchema,
  AnalyticsUsageSummaryResponseSchema,
  getTierCapabilities
} from "../../../../packages/shared-types/src/index.js";
import { buildAnalyticsBundleInputFingerprint } from "../../../../packages/storage/src/index.js";
import { sanitizeTelemetry } from "../../../../packages/redaction/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import {
  claimAnalyticsBundleGenerationQuota,
  releaseAnalyticsQuotaClaimBestEffort,
  toRetryAfterSeconds
} from "../analytics-quota.js";
import { requireRateLimitedProjectAccess } from "../api-helpers.js";
import {
  AnalyticsBundleCreateBodySchema,
  AnalyticsBundleParamsSchema,
  AnalyticsBundleQuerySchema,
  AnalyticsBundlesListQuerySchema,
  AnalyticsFunnelParamsSchema,
  AnalyticsIncidentImpactParamsSchema,
  AnalyticsOpportunitiesQuerySchema,
  AnalyticsOpportunityParamsSchema,
  parseAnalyticsBundleGenerationsCursor,
  parseAnalyticsOpportunitiesCursor,
  resolveAnalyticsTimeRange,
  resolveIncidentImpactTimeRange,
  type AnalyticsBundleGeneration
} from "./analytics-contracts.js";
import { registerAnalyticsJourneySampleRoutes } from "./analytics-journey-samples.js";
import {
  buildAnalyticsBundleAnalysisSpec,
  hasRequiredAnalyticsBundleFocus,
  listOrganizationAnalyticsBundles,
  listOrganizationAnalyticsOpportunities,
  listProjectAnalyticsBundles,
  listProjectAnalyticsOpportunities,
  requireAnalyticsIncidentImpactQuery,
  requireAnalyticsMetricsQuery,
  requireAnalyticsProjectReadAccess,
  resolveLinkedOpportunityBundleRequest,
  sendAnalyticsBundleGenerationResponse,
  toAnalyticsBundleGenerationListRecord,
  toMetricsInput,
  type AnalyticsBundleOpportunityContext
} from "./analytics-route-services.js";

function projectAnalyticsRead<T>(value: unknown, schema: z.ZodType<T>): T | null {
  const projected = sanitizeTelemetry(value, { maxTotalBytes: 512 * 1024 });
  if (!projected.ok) return null;
  const parsed = schema.safeParse(projected.value);
  return parsed.success ? parsed.data : null;
}

function sendProjectedAnalyticsRead<T>(reply: FastifyReply, value: unknown, schema: z.ZodType<T>): FastifyReply {
  const projected = projectAnalyticsRead(value, schema);
  return projected === null
    ? reply.status(503).send({ error: "privacy_projection_unavailable" })
    : reply.header("x-debugbundle-privacy-policy", "telemetry-privacy-v1").status(200).send(projected);
}

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

    const filters = {
      ...(parsedQuery.data.status === "all" ? {} : { status: parsedQuery.data.status }),
      ...(parsedQuery.data.kind === undefined ? {} : { kind: parsedQuery.data.kind }),
      ...(parsedQuery.data.service === undefined ? {} : { service: parsedQuery.data.service }),
      ...(parsedQuery.data.environment === undefined
        ? {}
        : { environment: parsedQuery.data.environment }),
      ...(parsedQuery.data.severity === undefined ? {} : { severity: parsedQuery.data.severity }),
      ...(parsedQuery.data.bundle_status === undefined
        ? {}
        : { bundle_status: parsedQuery.data.bundle_status }),
      ...(parsedQuery.data.from === undefined ? {} : { from: parsedQuery.data.from }),
      ...(parsedQuery.data.to === undefined ? {} : { to: parsedQuery.data.to }),
      ...(parsedCursor === null ? {} : { cursor: parsedCursor }),
      limit: parsedQuery.data.limit
    };
    const opportunities =
      parsedQuery.data.project_id === undefined
        ? await listOrganizationAnalyticsOpportunities(request, reply, dependencies, filters)
        : await listProjectAnalyticsOpportunities(
            request,
            reply,
            dependencies,
            parsedQuery.data.project_id,
            filters
          );
    if (opportunities === null) {
      return;
    }

    return sendProjectedAnalyticsRead(reply, opportunities, AnalyticsOpportunitiesListResponseSchema);
  });

  app.get("/v1/analytics/opportunities/:id", async (request, reply) => {
    const parsedParams = AnalyticsOpportunityParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_opportunity_id" });
    }

    const parsedQuery = z
      .object({ project_id: z.string().uuid() })
      .strict()
      .safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const access = await requireAnalyticsProjectReadAccess(
      request,
      reply,
      dependencies,
      parsedQuery.data.project_id
    );
    if (access === null) {
      return;
    }

    if (dependencies.analyticsOpportunities === undefined) {
      return reply.status(404).send({ error: "analytics_opportunities_not_available" });
    }

    const opportunity = await dependencies.analyticsOpportunities.getAnalyticsOpportunityForProject(
      {
        organization_id: access.organization_id,
        project_id: parsedQuery.data.project_id,
        opportunity_id: parsedParams.data.id
      }
    );
    if (opportunity === null) {
      return reply.status(404).send({ error: "analytics_opportunity_not_found" });
    }

    return sendProjectedAnalyticsRead(reply, opportunity, AnalyticsOpportunityResponseSchema);
  });

  app.post("/v1/analytics/bundles", async (request, reply) => {
    const parsedBody = AnalyticsBundleCreateBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
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

    let bundleRequest = parsedBody.data;
    let opportunityContext: AnalyticsBundleOpportunityContext | undefined;
    if (parsedBody.data.opportunity_id !== null && parsedBody.data.opportunity_id !== undefined) {
      if (dependencies.analyticsOpportunities === undefined) {
        return reply.status(404).send({ error: "analytics_opportunities_not_available" });
      }
      const linked = await dependencies.analyticsOpportunities.getAnalyticsOpportunityForProject({
        organization_id: auth.access.organization_id,
        project_id: parsedBody.data.project_id,
        opportunity_id: parsedBody.data.opportunity_id
      });
      if (linked === null) {
        return reply.status(404).send({ error: "analytics_opportunity_not_found" });
      }
      const resolved = resolveLinkedOpportunityBundleRequest(parsedBody.data, linked.opportunity);
      if (resolved === null) {
        return reply.status(400).send({ error: "invalid_body" });
      }
      bundleRequest = resolved;
      opportunityContext = {
        evidence: linked.opportunity.evidence,
        related_incident_ids: linked.opportunity.related_incident_ids,
        related_deploy_ids: linked.opportunity.related_deploy_ids
      };
    }

    if (!hasRequiredAnalyticsBundleFocus(bundleRequest)) {
      return reply.status(400).send({ error: "invalid_body" });
    }

    let range = resolveAnalyticsTimeRange(bundleRequest);
    if (range === null) {
      return reply.status(400).send({ error: "invalid_body" });
    }

    if (bundleRequest.analysis_kind === "incident_impact") {
      const incident = await dependencies.incidentRetrieval.getIncidentForOrganization({
        organization_id: auth.access.organization_id,
        incident_id: bundleRequest.incident_id!,
        user_id: auth.member.member_id
      });
      if (incident === null || incident.project_id !== bundleRequest.project_id) {
        return reply.status(404).send({ error: "incident_not_found" });
      }
      range = resolveIncidentImpactTimeRange(bundleRequest, incident);
      if (range === null) {
        return reply.status(400).send({ error: "invalid_body" });
      }
    }

    if (dependencies.analyticsSettingsManagement === undefined) {
      return reply.status(404).send({ error: "analytics_settings_not_available" });
    }

    const settings = await dependencies.analyticsSettingsManagement.getAnalyticsSettingsForProject({
      organization_id: auth.access.organization_id,
      project_id: bundleRequest.project_id
    });
    if (settings === null || !settings.enabled) {
      return reply.status(403).send({ error: "analytics_disabled" });
    }

    if (dependencies.analyticsBundles === undefined) {
      return reply.status(404).send({ error: "analytics_bundles_not_available" });
    }

    const analysisSpec = buildAnalyticsBundleAnalysisSpec(
      {
        ...bundleRequest,
        from: range.from,
        to: range.to
      },
      opportunityContext
    );
    const quota = await claimAnalyticsBundleGenerationQuota({
      dependencies,
      organization_id: auth.access.organization_id,
      organization_plan: auth.access.organization_plan,
      now: new Date(),
      claim_key: `${bundleRequest.project_id}:${buildAnalyticsBundleInputFingerprint({
        opportunity_id: bundleRequest.opportunity_id ?? null,
        analysis_kind: bundleRequest.analysis_kind,
        analysis_spec: analysisSpec
      })}`
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
        project_id: bundleRequest.project_id,
        opportunity_id: bundleRequest.opportunity_id ?? null,
        requested_by_user_id: auth.member.member_id,
        analysis_kind: bundleRequest.analysis_kind,
        analysis_spec: analysisSpec
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

    const filters = {
      ...(parsedQuery.data.status === "all" ? {} : { status: parsedQuery.data.status }),
      ...(parsedQuery.data.kind === undefined ? {} : { analysis_kind: parsedQuery.data.kind }),
      ...(parsedQuery.data.service === undefined ? {} : { service: parsedQuery.data.service }),
      ...(parsedQuery.data.environment === undefined
        ? {}
        : { environment: parsedQuery.data.environment }),
      ...(parsedQuery.data.from === undefined ? {} : { from: parsedQuery.data.from }),
      ...(parsedQuery.data.to === undefined ? {} : { to: parsedQuery.data.to }),
      ...(parsedCursor === null ? {} : { cursor: parsedCursor }),
      limit: parsedQuery.data.limit
    };
    const generations =
      parsedQuery.data.project_id === undefined
        ? await listOrganizationAnalyticsBundles(request, reply, dependencies, filters)
        : await listProjectAnalyticsBundles(
            request,
            reply,
            dependencies,
            parsedQuery.data.project_id,
            filters
          );
    if (generations === null) {
      return;
    }

    const projected = sanitizeTelemetry({
      bundles: generations.bundles.map(toAnalyticsBundleGenerationListRecord),
      next_cursor: generations.next_cursor
    });
    if (!projected.ok) return reply.status(503).send({ error: "privacy_projection_unavailable" });
    const response = AnalyticsBundleGenerationsListResponseSchema.safeParse(projected.value);
    return response.success
      ? reply.header("x-debugbundle-privacy-policy", "telemetry-privacy-v1").status(200).send(response.data)
      : reply.status(503).send({ error: "privacy_projection_unavailable" });
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

    const access = await requireAnalyticsProjectReadAccess(
      request,
      reply,
      dependencies,
      parsedQuery.data.project_id
    );
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

    const summary = await dependencies.analyticsMetrics!.getUsageSummaryForProject(
      toMetricsInput(input)
    );

    return sendProjectedAnalyticsRead(reply, summary, AnalyticsUsageSummaryResponseSchema);
  });

  app.get("/v1/analytics/routes", async (request, reply) => {
    const input = await requireAnalyticsMetricsQuery(request, reply, dependencies);
    if (input === null) {
      return;
    }

    const routes = await dependencies.analyticsMetrics!.getRouteMetricsForProject(
      toMetricsInput(input)
    );

    return sendProjectedAnalyticsRead(reply, routes, AnalyticsRouteMetricsResponseSchema);
  });

  app.get("/v1/analytics/journey-patterns", async (request, reply) => {
    const input = await requireAnalyticsMetricsQuery(request, reply, dependencies);
    if (input === null) {
      return;
    }

    const journeys = await dependencies.analyticsMetrics!.getJourneyPatternsForProject(
      toMetricsInput(input)
    );

    return sendProjectedAnalyticsRead(reply, journeys, AnalyticsJourneyPatternsResponseSchema);
  });

  app.get("/v1/analytics/devices", async (request, reply) => {
    const input = await requireAnalyticsMetricsQuery(request, reply, dependencies);
    if (input === null) {
      return;
    }

    const devices = await dependencies.analyticsMetrics!.getDeviceBreakdownForProject(
      toMetricsInput(input)
    );

    return sendProjectedAnalyticsRead(reply, devices, AnalyticsDeviceBreakdownResponseSchema);
  });

  app.get("/v1/analytics/referrers", async (request, reply) => {
    const input = await requireAnalyticsMetricsQuery(request, reply, dependencies);
    if (input === null) {
      return;
    }

    const referrers = await dependencies.analyticsMetrics!.getReferrerMetricsForProject(
      toMetricsInput(input)
    );

    return sendProjectedAnalyticsRead(reply, referrers, AnalyticsReferrerMetricsResponseSchema);
  });

  app.get("/v1/analytics/actions", async (request, reply) => {
    const input = await requireAnalyticsMetricsQuery(request, reply, dependencies);
    if (input === null) {
      return;
    }

    const actions = await dependencies.analyticsMetrics!.getActionMetricsForProject(
      toMetricsInput(input)
    );

    return sendProjectedAnalyticsRead(reply, actions, AnalyticsActionMetricsResponseSchema);
  });

  app.get("/v1/analytics/funnels", async (request, reply) => {
    const input = await requireAnalyticsMetricsQuery(request, reply, dependencies);
    if (input === null) {
      return;
    }

    const funnels = await dependencies.analyticsMetrics!.listFunnelsForProject(
      toMetricsInput(input)
    );

    return sendProjectedAnalyticsRead(reply, funnels, AnalyticsFunnelsResponseSchema);
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

    return sendProjectedAnalyticsRead(reply, funnel, AnalyticsFunnelAnalysisResponseSchema);
  });

  app.get("/v1/analytics/incidents/:id/impact", async (request, reply) => {
    const parsedParams = AnalyticsIncidentImpactParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_incident_id" });
    }

    const input = await requireAnalyticsIncidentImpactQuery(
      request,
      reply,
      dependencies,
      parsedParams.data.id
    );
    if (input === null) {
      return;
    }

    const impact = await dependencies.analyticsMetrics!.getIncidentImpactForProject(input);
    return sendProjectedAnalyticsRead(reply, impact, AnalyticsIncidentImpactResponseSchema);
  });
}
