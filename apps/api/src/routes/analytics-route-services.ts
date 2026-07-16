import { gunzipSync } from "node:zlib";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import {
  ANALYTICS_BUNDLE_GENERATION_ID_HEADER,
  AnalyticsBundleAnalysisKindSchema,
  AnalyticsBundleGenerationStatusSchema,
  AnalyticsBundleSeveritySchema,
  AnalyticsBundleV1Schema,
  type AnalyticsOpportunityRecord,
  AnalyticsOpportunityBundleStatusSchema,
  AnalyticsOpportunityStatusSchema,
  getTierCapabilities
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import {
  isObjectNotFoundError,
  requireRateLimitedMemberAuth,
  requireRateLimitedProjectAccess
} from "../api-helpers.js";
import {
  parseAnalyticsSummaryQuery,
  resolveAnalyticsTimeRange,
  resolveIncidentImpactTimeRange,
  type AnalyticsBundleCreateBody,
  type AnalyticsBundleGeneration,
  type AnalyticsBundleGenerationListRecord,
  type AnalyticsBundlesDependency,
  type AnalyticsOpportunitiesDependency,
  type AuthorizedAnalyticsQuery
} from "./analytics-contracts.js";

export type AnalyticsBundleOpportunityContext = {
  evidence: Record<string, unknown>;
  related_incident_ids: string[];
  related_deploy_ids: string[];
};

export function toAnalyticsBundleGenerationListRecord(
  generation: AnalyticsBundleGenerationListRecord
): unknown {
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
    updated_at: generation.updated_at,
    ...(generation.project_name === undefined ? {} : { project_name: generation.project_name }),
    ...(generation.project_color_tag === undefined
      ? {}
      : { project_color_tag: generation.project_color_tag })
  };
}

export async function listProjectAnalyticsOpportunities(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  projectId: string,
  filters: {
    status?: z.infer<typeof AnalyticsOpportunityStatusSchema> | undefined;
    kind?: z.infer<typeof AnalyticsBundleAnalysisKindSchema> | undefined;
    service?: string | undefined;
    environment?: string | undefined;
    severity?: z.infer<typeof AnalyticsBundleSeveritySchema> | undefined;
    bundle_status?: z.infer<typeof AnalyticsOpportunityBundleStatusSchema> | undefined;
    from?: string | undefined;
    to?: string | undefined;
    cursor?: { last_detected_at: string; opportunity_id: string } | undefined;
    limit: number;
  }
): Promise<Awaited<
  ReturnType<AnalyticsOpportunitiesDependency["listAnalyticsOpportunitiesForProject"]>
> | null> {
  const access = await requireAnalyticsProjectReadAccess(request, reply, dependencies, projectId);
  if (access === null) return null;
  if (dependencies.analyticsOpportunities === undefined) {
    await reply.status(404).send({ error: "analytics_opportunities_not_available" });
    return null;
  }
  return dependencies.analyticsOpportunities.listAnalyticsOpportunitiesForProject({
    organization_id: access.organization_id,
    project_id: projectId,
    ...filters
  });
}

export async function listOrganizationAnalyticsOpportunities(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  filters: {
    status?: z.infer<typeof AnalyticsOpportunityStatusSchema> | undefined;
    kind?: z.infer<typeof AnalyticsBundleAnalysisKindSchema> | undefined;
    service?: string | undefined;
    environment?: string | undefined;
    severity?: z.infer<typeof AnalyticsBundleSeveritySchema> | undefined;
    bundle_status?: z.infer<typeof AnalyticsOpportunityBundleStatusSchema> | undefined;
    from?: string | undefined;
    to?: string | undefined;
    cursor?: { last_detected_at: string; opportunity_id: string } | undefined;
    limit: number;
  }
): Promise<Awaited<
  ReturnType<AnalyticsOpportunitiesDependency["listAnalyticsOpportunitiesForOrganization"]>
> | null> {
  const organizationId = await requireAnalyticsOrganizationReadAccess(request, reply, dependencies);
  if (organizationId === null) return null;
  if (dependencies.analyticsOpportunities === undefined) {
    await reply.status(404).send({ error: "analytics_opportunities_not_available" });
    return null;
  }
  return dependencies.analyticsOpportunities.listAnalyticsOpportunitiesForOrganization({
    organization_id: organizationId,
    ...filters
  });
}

export async function listProjectAnalyticsBundles(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  projectId: string,
  filters: {
    status?: z.infer<typeof AnalyticsBundleGenerationStatusSchema> | undefined;
    analysis_kind?: z.infer<typeof AnalyticsBundleAnalysisKindSchema> | undefined;
    service?: string | undefined;
    environment?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
    cursor?: { created_at: string; generation_id: string } | undefined;
    limit: number;
  }
): Promise<Awaited<
  ReturnType<AnalyticsBundlesDependency["listAnalyticsBundleGenerationsForProject"]>
> | null> {
  const access = await requireAnalyticsProjectReadAccess(request, reply, dependencies, projectId);
  if (access === null) return null;
  if (dependencies.analyticsBundles === undefined) {
    await reply.status(404).send({ error: "analytics_bundles_not_available" });
    return null;
  }
  return dependencies.analyticsBundles.listAnalyticsBundleGenerationsForProject({
    organization_id: access.organization_id,
    project_id: projectId,
    ...filters
  });
}

export async function listOrganizationAnalyticsBundles(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  filters: {
    status?: z.infer<typeof AnalyticsBundleGenerationStatusSchema> | undefined;
    analysis_kind?: z.infer<typeof AnalyticsBundleAnalysisKindSchema> | undefined;
    service?: string | undefined;
    environment?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
    cursor?: { created_at: string; generation_id: string } | undefined;
    limit: number;
  }
): Promise<Awaited<
  ReturnType<AnalyticsBundlesDependency["listAnalyticsBundleGenerationsForOrganization"]>
> | null> {
  const organizationId = await requireAnalyticsOrganizationReadAccess(request, reply, dependencies);
  if (organizationId === null) return null;
  if (dependencies.analyticsBundles === undefined) {
    await reply.status(404).send({ error: "analytics_bundles_not_available" });
    return null;
  }
  return dependencies.analyticsBundles.listAnalyticsBundleGenerationsForOrganization({
    organization_id: organizationId,
    ...filters
  });
}

export function buildAnalyticsBundleAnalysisSpec(
  input: AnalyticsBundleCreateBody & { from: string; to: string },
  opportunityContext?: AnalyticsBundleOpportunityContext
): Record<string, unknown> {
  const incidentId = input.incident_id ?? null;
  const deployId = input.deploy_id ?? null;
  const relatedIncidentIds = uniqueStrings([
    ...(opportunityContext?.related_incident_ids ?? []),
    ...(incidentId === null ? [] : [incidentId])
  ]);
  const relatedDeployIds = uniqueStrings([
    ...(opportunityContext?.related_deploy_ids ?? []),
    ...(deployId === null ? [] : [deployId])
  ]);
  return {
    opportunity_id: input.opportunity_id ?? null,
    from: input.from,
    to: input.to,
    funnel: input.funnel ?? null,
    route: input.route ?? null,
    incident_id: incidentId,
    deploy_id: deployId,
    related_incident_ids: relatedIncidentIds,
    related_deploy_ids: relatedDeployIds,
    ...(opportunityContext === undefined
      ? {}
      : { opportunity_evidence: opportunityContext.evidence }),
    filters: input.filters
  };
}

export function resolveLinkedOpportunityBundleRequest(
  input: AnalyticsBundleCreateBody,
  opportunity: AnalyticsOpportunityRecord
): AnalyticsBundleCreateBody | null {
  if (opportunity.kind !== input.analysis_kind) return null;

  const evidenceWindow = readRecord(opportunity.evidence["analysis_window"]);
  const evidenceFrom = readIsoDate(evidenceWindow?.["from"]);
  const evidenceTo = readIsoDate(evidenceWindow?.["to"]);
  if (
    evidenceFrom !== undefined &&
    input.from !== undefined &&
    readIsoDate(input.from) !== evidenceFrom
  )
    return null;
  if (evidenceTo !== undefined && input.to !== undefined && readIsoDate(input.to) !== evidenceTo)
    return null;
  if (input.last !== undefined && (evidenceFrom !== undefined || evidenceTo !== undefined))
    return null;

  const funnel = readString(opportunity.evidence["funnel_key"]);
  const route =
    readString(opportunity.evidence["route_key"]) ??
    readString(opportunity.evidence["from_route_key"]);
  const incidentId = opportunity.related_incident_ids[0];
  const deployId = opportunity.related_deploy_ids[0];
  if (
    conflictsWithLinkedValue(input.funnel, funnel) ||
    conflictsWithLinkedValue(input.route, route) ||
    conflictsWithLinkedValue(input.incident_id, incidentId) ||
    conflictsWithLinkedValue(input.deploy_id, deployId)
  )
    return null;

  const filters = { ...input.filters };
  if (!addLinkedFilter(filters, "service", opportunity.service)) return null;
  if (!addLinkedFilter(filters, "environment", opportunity.environment)) return null;

  return {
    ...input,
    ...(evidenceFrom === undefined ? {} : { from: evidenceFrom }),
    ...(evidenceTo === undefined ? {} : { to: evidenceTo }),
    ...(funnel === undefined ? {} : { funnel }),
    ...(route === undefined ? {} : { route }),
    ...(incidentId === undefined ? {} : { incident_id: incidentId }),
    ...(deployId === undefined ? {} : { deploy_id: deployId }),
    filters
  };
}

export function hasRequiredAnalyticsBundleFocus(input: AnalyticsBundleCreateBody): boolean {
  if (input.analysis_kind === "funnel_dropoff") return input.funnel != null;
  if (input.analysis_kind === "route_health") return input.route != null;
  if (input.analysis_kind === "incident_impact") return input.incident_id != null;
  if (input.analysis_kind === "deploy_comparison") return input.deploy_id != null;
  if (input.analysis_kind === "conversion_path") return input.funnel != null || input.route != null;
  return true;
}

export async function sendAnalyticsBundleGenerationResponse(
  reply: FastifyReply,
  dependencies: ApiDependencies,
  generation: AnalyticsBundleGeneration
): Promise<FastifyReply> {
  reply.header(ANALYTICS_BUNDLE_GENERATION_ID_HEADER, generation.generation_id);
  if (generation.status === "pending" || generation.status === "running") {
    return reply
      .status(200)
      .send({ status: "pending", bundle_generation_id: generation.generation_id });
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
    const compressed = await dependencies.objectStoreReader.getObject({
      key: generation.object_key
    });
    bundleArtifact = JSON.parse(gunzipSync(compressed).toString("utf8"));
  } catch (error) {
    if (isObjectNotFoundError(error)) {
      return reply.status(404).send({ error: "analytics_bundle_artifact_not_found" });
    }
    return reply.status(500).send({ error: "analytics_bundle_artifact_unavailable" });
  }
  const parsedBundle = AnalyticsBundleV1Schema.safeParse(bundleArtifact);
  return parsedBundle.success
    ? reply.status(200).send(parsedBundle.data)
    : reply.status(500).send({ error: "analytics_bundle_artifact_invalid" });
}

export async function requireAnalyticsMetricsQuery(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies
): Promise<AuthorizedAnalyticsQuery | null> {
  const parsedQuery = parseAnalyticsSummaryQuery(request.query);
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
  if (auth === null) return null;
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

export async function requireAnalyticsIncidentImpactQuery(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  incidentId: string
): Promise<(ReturnType<typeof toMetricsInput> & { incident_id: string }) | null> {
  const parsedQuery = parseAnalyticsSummaryQuery(request.query);
  if (!parsedQuery.success) {
    await reply.status(400).send({ error: "invalid_query" });
    return null;
  }
  const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
    bucket: "retrieval-read",
    projectId: parsedQuery.data.project_id
  });
  if (auth === null) return null;
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
    ...toMetricsInput({
      ...parsedQuery.data,
      organization_id: auth.access.organization_id,
      from: range.from,
      to: range.to
    }),
    incident_id: incidentId
  };
}

export function toMetricsInput(input: AuthorizedAnalyticsQuery): {
  organization_id: string;
  project_id: string;
  from: string;
  to: string;
  granularity: "hour" | "day";
  service?: string | undefined;
  environment?: string | undefined;
  route?: string;
  device_type?: string;
  browser?: string;
  os?: string;
  language?: string;
  country?: string;
  auth_state?: "anonymous" | "authenticated" | "unknown";
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  custom_dimensions?: Record<string, string>;
  limit?: number;
} {
  return {
    organization_id: input.organization_id,
    project_id: input.project_id,
    from: input.from,
    to: input.to,
    granularity: input.granularity,
    service: input.service,
    environment: input.environment,
    ...(input.route === undefined ? {} : { route: input.route }),
    ...(input.device_type === undefined ? {} : { device_type: input.device_type }),
    ...(input.browser === undefined ? {} : { browser: input.browser }),
    ...(input.os === undefined ? {} : { os: input.os }),
    ...(input.language === undefined ? {} : { language: input.language }),
    ...(input.country === undefined ? {} : { country: input.country }),
    ...(input.auth_state === undefined ? {} : { auth_state: input.auth_state }),
    ...(input.referrer === undefined ? {} : { referrer: input.referrer }),
    ...(input.utm_source === undefined ? {} : { utm_source: input.utm_source }),
    ...(input.utm_medium === undefined ? {} : { utm_medium: input.utm_medium }),
    ...(input.utm_campaign === undefined ? {} : { utm_campaign: input.utm_campaign }),
    ...(input.custom_dimensions === undefined
      ? {}
      : { custom_dimensions: input.custom_dimensions }),
    limit: input.limit
  };
}

export async function requireAnalyticsProjectReadAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  projectId: string
): Promise<{ organization_id: string } | null> {
  const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
    bucket: "retrieval-read",
    projectId
  });
  if (auth === null) return null;
  if (!getTierCapabilities(auth.access.organization_plan).analytics_bundle) {
    await reply.status(403).send({ error: "upgrade_required" });
    return null;
  }
  return { organization_id: auth.access.organization_id };
}

async function requireAnalyticsOrganizationReadAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies
): Promise<string | null> {
  const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "retrieval-read");
  return member?.organization_id ?? null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function addLinkedFilter(
  filters: Record<string, unknown>,
  key: "service" | "environment",
  value: string | null
): boolean {
  if (value === null) return true;
  const current = filters[key];
  if (current !== undefined && current !== value) return false;
  filters[key] = value;
  return true;
}

function conflictsWithLinkedValue(
  requested: string | null | undefined,
  linked: string | undefined
): boolean {
  return requested != null && linked !== undefined && requested !== linked;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readIsoDate(value: unknown): string | undefined {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}
