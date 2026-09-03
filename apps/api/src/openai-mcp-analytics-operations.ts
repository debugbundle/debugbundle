import type {
  OpenAiHostedOperations,
  OpenAiMcpPrincipal
} from "../../../packages/mcp-core/src/index.js";
import type {
  AnalyticsMetricsStore,
  AnalyticsUsageSummaryInput
} from "../../../packages/storage/src/index.js";

import type { DefaultApiDependencies } from "./default-dependency-types.js";

type OpenAiAnalyticsToolName =
  | "get_usage_summary"
  | "get_route_metrics"
  | "get_journey_patterns"
  | "get_device_breakdown"
  | "get_referrer_metrics"
  | "get_action_metrics"
  | "list_funnel_metrics"
  | "get_funnel_analysis"
  | "get_incident_impact";

export type OpenAiAnalyticsReadDependencies = Pick<
  AnalyticsMetricsStore,
  | "getUsageSummary"
  | "getRouteMetrics"
  | "getJourneyPatterns"
  | "getDeviceBreakdown"
  | "getReferrerMetrics"
  | "getActionMetrics"
  | "listFunnels"
  | "getFunnelAnalysis"
  | "getIncidentImpact"
>;

type OpenAiAnalyticsOperations = Pick<
  Required<OpenAiHostedOperations>,
  OpenAiAnalyticsToolName
>;

type JourneyPatternsRead = Awaited<ReturnType<AnalyticsMetricsStore["getJourneyPatterns"]>>;
type JourneyPatternsProjection = {
  window: JourneyPatternsRead["window"];
  patterns: Array<Omit<JourneyPatternsRead["patterns"][number], "sample_ids">>;
};
type IncidentImpactRead = Awaited<ReturnType<AnalyticsMetricsStore["getIncidentImpact"]>>;
type IncidentImpactProjection = Omit<
  IncidentImpactRead,
  "journey_patterns" | "analytics_bundle"
> & {
  journey_patterns: Array<Omit<IncidentImpactRead["journey_patterns"][number], "sample_ids">>;
};

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string") {
    throw new Error(`openai_mcp_missing_input:${key}`);
  }
  return value;
}

function optionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" ? value : undefined;
}

function buildAnalyticsInput(
  toolInput: Record<string, unknown>,
  now: () => Date
): AnalyticsUsageSummaryInput {
  const last = optionalString(toolInput, "last") ?? "7d";
  const lookbackHours = { "24h": 24, "7d": 7 * 24, "30d": 30 * 24, "90d": 90 * 24 }[last];
  if (lookbackHours === undefined) {
    throw new Error("openai_mcp_invalid_analytics_window");
  }
  const route = optionalString(toolInput, "route");
  if (route !== undefined && (!route.startsWith("/") || route.includes("?") || route.includes("#"))) {
    throw new Error("openai_mcp_invalid_analytics_route");
  }
  const to = now();
  if (Number.isNaN(to.getTime())) {
    throw new Error("openai_mcp_invalid_analytics_clock");
  }
  const from = new Date(to.getTime() - lookbackHours * 60 * 60 * 1_000);
  const granularity = optionalString(toolInput, "granularity") ?? "day";
  if (granularity !== "hour" && granularity !== "day") {
    throw new Error("openai_mcp_invalid_analytics_granularity");
  }
  const limitValue = toolInput["limit"];
  const limit = typeof limitValue === "number" && Number.isInteger(limitValue) ? limitValue : 10;
  return {
    project_id: requiredString(toolInput, "projectId"),
    from: from.toISOString(),
    to: to.toISOString(),
    granularity,
    limit,
    ...(optionalString(toolInput, "service") === undefined
      ? {}
      : { service: optionalString(toolInput, "service") }),
    ...(optionalString(toolInput, "environment") === undefined
      ? {}
      : { environment: optionalString(toolInput, "environment") }),
    ...(route === undefined ? {} : { route })
  };
}

function stripJourneySamples(value: JourneyPatternsRead): JourneyPatternsProjection {
  return {
    window: value.window,
    patterns: value.patterns.map((pattern) => ({
      from_route_key: pattern.from_route_key,
      to_route_key: pattern.to_route_key,
      transition_count: pattern.transition_count,
      unique_sessions: pattern.unique_sessions,
      transition_share: pattern.transition_share
    }))
  };
}

function stripIncidentImpactPrivateState(
  value: IncidentImpactRead
): IncidentImpactProjection {
  return {
    incident_id: value.incident_id,
    window: value.window,
    affected_sessions: value.affected_sessions,
    affected_routes: value.affected_routes,
    affected_funnels: value.affected_funnels,
    top_device_types: value.top_device_types,
    top_browsers: value.top_browsers,
    journey_patterns: value.journey_patterns.map((pattern) => ({
      from_route_key: pattern.from_route_key,
      to_route_key: pattern.to_route_key,
      affected_sessions: pattern.affected_sessions
    })),
    conversion_delta: value.conversion_delta
  };
}

export function createOpenAiAnalyticsOperations(input: {
  analyticsMetrics: OpenAiAnalyticsReadDependencies;
  incidentRetrieval: Pick<
    DefaultApiDependencies["incidentRetrieval"],
    "getIncidentForOrganization"
  >;
  requireProjectAccess(principal: OpenAiMcpPrincipal, projectId: string): Promise<void>;
  now?: () => Date;
}): OpenAiAnalyticsOperations {
  const now = input.now ?? (() => new Date());

  async function authorizedInput(
    principal: OpenAiMcpPrincipal,
    toolInput: Record<string, unknown>
  ): Promise<AnalyticsUsageSummaryInput> {
    const metricsInput = buildAnalyticsInput(toolInput, now);
    await input.requireProjectAccess(principal, metricsInput.project_id);
    return metricsInput;
  }

  return {
    async get_usage_summary({ principal, input: toolInput }) {
      return await input.analyticsMetrics.getUsageSummary(
        await authorizedInput(principal, toolInput)
      );
    },
    async get_route_metrics({ principal, input: toolInput }) {
      return await input.analyticsMetrics.getRouteMetrics(
        await authorizedInput(principal, toolInput)
      );
    },
    async get_journey_patterns({ principal, input: toolInput }) {
      const result = await input.analyticsMetrics.getJourneyPatterns(
        await authorizedInput(principal, toolInput),
        { includeSampleIds: false }
      );
      return stripJourneySamples(result);
    },
    async get_device_breakdown({ principal, input: toolInput }) {
      return await input.analyticsMetrics.getDeviceBreakdown(
        await authorizedInput(principal, toolInput)
      );
    },
    async get_referrer_metrics({ principal, input: toolInput }) {
      return await input.analyticsMetrics.getReferrerMetrics(
        await authorizedInput(principal, toolInput)
      );
    },
    async get_action_metrics({ principal, input: toolInput }) {
      return await input.analyticsMetrics.getActionMetrics(
        await authorizedInput(principal, toolInput)
      );
    },
    async list_funnel_metrics({ principal, input: toolInput }) {
      return await input.analyticsMetrics.listFunnels(
        await authorizedInput(principal, toolInput)
      );
    },
    async get_funnel_analysis({ principal, input: toolInput }) {
      const metricsInput = await authorizedInput(principal, toolInput);
      return await input.analyticsMetrics.getFunnelAnalysis({
        ...metricsInput,
        funnel_key: requiredString(toolInput, "funnelKey")
      });
    },
    async get_incident_impact({ principal, input: toolInput }) {
      const metricsInput = await authorizedInput(principal, toolInput);
      const incidentId = requiredString(toolInput, "incidentId");
      const incident = await input.incidentRetrieval.getIncidentForOrganization({
        organization_id: principal.organizationId,
        user_id: principal.userId,
        incident_id: incidentId
      });
      if (incident === null || incident.project_id !== metricsInput.project_id) {
        throw new Error("openai_mcp_incident_not_found");
      }
      const result = await input.analyticsMetrics.getIncidentImpact(
        { ...metricsInput, incident_id: incidentId },
        { includeSampleIds: false, includeBundleState: false }
      );
      return stripIncidentImpactPrivateState(result);
    }
  };
}
