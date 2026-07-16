import { AnalyticsMetricsApiError } from "../../cli/src/analytics-metrics-commands.js";
import {
  AnalyticsBundleAnalysisKindSchema,
  AnalyticsBundleSeveritySchema,
  AnalyticsOpportunityBundleStatusSchema,
  type AnalyticsBundleAnalysisKind,
  type AnalyticsBundleSeverity,
  type AnalyticsOpportunityBundleStatus
} from "../../../packages/shared-types/src/index.js";

export const ANALYTICS_METRICS_MCP_TOOL_NAMES = [
  "get_usage_summary",
  "get_route_metrics",
  "get_journey_patterns",
  "list_analytics_journey_samples",
  "get_analytics_journey_sample",
  "get_device_breakdown",
  "get_referrer_metrics",
  "get_action_metrics",
  "list_funnel_metrics",
  "get_funnel_analysis",
  "get_incident_impact",
  "list_analytics_opportunities",
  "get_analytics_opportunity",
  "list_analytics_bundles",
  "generate_analytics_bundle",
  "get_analytics_bundle"
] as const;

function mapMcpError(error: unknown): never {
  if (error instanceof AnalyticsMetricsApiError) {
    throw new Error(`mcp_tool_error:${error.message}`);
  }

  throw new Error("mcp_tool_error:unknown_error");
}

function readOptionalString(input: Record<string, unknown>, key: string): string | undefined {
  return typeof input[key] === "string" ? input[key] : undefined;
}

function readOptionalNumber(input: Record<string, unknown>, key: string): number | undefined {
  return typeof input[key] === "number" ? input[key] : undefined;
}

function readGranularity(input: Record<string, unknown>): "hour" | "day" | undefined {
  const value = input["granularity"];
  return value === "hour" || value === "day" ? value : undefined;
}

export function createAnalyticsMetricsMcpTools(api: {
  getUsageSummary(input: AnalyticsMetricsToolInput): Promise<unknown>;
  getRouteMetrics(input: AnalyticsMetricsToolInput): Promise<unknown>;
  getJourneyPatterns(input: AnalyticsMetricsToolInput): Promise<unknown>;
  listJourneySamples(input: AnalyticsJourneySamplesToolInput): Promise<unknown>;
  getJourneySample(input: AnalyticsJourneySampleToolInput): Promise<unknown>;
  getDeviceBreakdown(input: AnalyticsMetricsToolInput): Promise<unknown>;
  getReferrerMetrics(input: AnalyticsMetricsToolInput): Promise<unknown>;
  getActionMetrics(input: AnalyticsMetricsToolInput): Promise<unknown>;
  listFunnels(input: AnalyticsMetricsToolInput): Promise<unknown>;
  getFunnelAnalysis(input: AnalyticsMetricsToolInput & { funnelKey: string }): Promise<unknown>;
  getIncidentImpact(input: AnalyticsMetricsToolInput & { incidentId: string }): Promise<unknown>;
  listOpportunities(input: AnalyticsOpportunitiesToolInput): Promise<unknown>;
  getOpportunity(input: AnalyticsOpportunityToolInput): Promise<unknown>;
  listBundles(input: AnalyticsBundleListToolInput): Promise<unknown>;
  createBundle(input: AnalyticsBundleCreateToolInput): Promise<unknown>;
  getBundle(input: AnalyticsBundleToolInput): Promise<unknown>;
}): Record<
  (typeof ANALYTICS_METRICS_MCP_TOOL_NAMES)[number],
  (input: Record<string, unknown>) => Promise<unknown>
> {
  return {
    async get_usage_summary(input) {
      try {
        return await api.getUsageSummary(readMetricsInput(input));
      } catch (error) {
        mapMcpError(error);
      }
    },

    async get_route_metrics(input) {
      try {
        return await api.getRouteMetrics(readMetricsInput(input));
      } catch (error) {
        mapMcpError(error);
      }
    },

    async get_journey_patterns(input) {
      try {
        return await api.getJourneyPatterns(readMetricsInput(input));
      } catch (error) {
        mapMcpError(error);
      }
    },

    async list_analytics_journey_samples(input) {
      try {
        return await api.listJourneySamples(readJourneySamplesInput(input));
      } catch (error) {
        mapMcpError(error);
      }
    },

    async get_analytics_journey_sample(input) {
      try {
        return await api.getJourneySample({
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          sampleId: String(input["sampleId"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async get_device_breakdown(input) {
      try {
        return await api.getDeviceBreakdown(readMetricsInput(input));
      } catch (error) {
        mapMcpError(error);
      }
    },

    async get_referrer_metrics(input) {
      try {
        return await api.getReferrerMetrics(readMetricsInput(input));
      } catch (error) {
        mapMcpError(error);
      }
    },

    async get_action_metrics(input) {
      try {
        return await api.getActionMetrics(readMetricsInput(input));
      } catch (error) {
        mapMcpError(error);
      }
    },

    async list_funnel_metrics(input) {
      try {
        return await api.listFunnels(readMetricsInput(input));
      } catch (error) {
        mapMcpError(error);
      }
    },

    async get_funnel_analysis(input) {
      try {
        return await api.getFunnelAnalysis({
          ...readMetricsInput(input),
          funnelKey: String(input["funnelKey"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async get_incident_impact(input) {
      try {
        return await api.getIncidentImpact({
          ...readMetricsInput(input),
          incidentId: String(input["incidentId"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async list_analytics_opportunities(input) {
      try {
        return await api.listOpportunities(readOpportunitiesInput(input));
      } catch (error) {
        mapMcpError(error);
      }
    },

    async get_analytics_opportunity(input) {
      try {
        return await api.getOpportunity({
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          opportunityId: String(input["opportunityId"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    },

    async list_analytics_bundles(input) {
      try {
        return await api.listBundles(readBundleListInput(input));
      } catch (error) {
        mapMcpError(error);
      }
    },

    async generate_analytics_bundle(input) {
      try {
        return await api.createBundle(readBundleCreateInput(input));
      } catch (error) {
        mapMcpError(error);
      }
    },

    async get_analytics_bundle(input) {
      try {
        return await api.getBundle({
          bearerToken: String(input["bearerToken"]),
          projectId: String(input["projectId"]),
          bundleGenerationId: String(input["bundleGenerationId"])
        });
      } catch (error) {
        mapMcpError(error);
      }
    }
  };
}

type AnalyticsMetricsToolInput = {
  bearerToken: string;
  projectId: string;
  from?: string | undefined;
  to?: string | undefined;
  last?: string | undefined;
  granularity?: "hour" | "day" | undefined;
  service?: string | undefined;
  environment?: string | undefined;
  route?: string | undefined;
  deviceType?: string | undefined;
  browser?: string | undefined;
  os?: string | undefined;
  language?: string | undefined;
  country?: string | undefined;
  authState?: "anonymous" | "authenticated" | "unknown" | undefined;
  referrer?: string | undefined;
  utmSource?: string | undefined;
  utmMedium?: string | undefined;
  utmCampaign?: string | undefined;
  customDimensions?: Record<string, string> | undefined;
  limit?: number | undefined;
};

type AnalyticsOpportunitiesToolInput = {
  bearerToken: string;
  projectId?: string | undefined;
  status?: "open" | "resolved" | "snoozed" | "all" | undefined;
  kind?: AnalyticsBundleAnalysisKind | undefined;
  service?: string | undefined;
  environment?: string | undefined;
  severity?: AnalyticsBundleSeverity | undefined;
  bundleStatus?: AnalyticsOpportunityBundleStatus | undefined;
  from?: string | undefined;
  to?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
};

type AnalyticsJourneySamplesToolInput = {
  bearerToken: string;
  projectId: string;
  service?: string | undefined;
  environment?: string | undefined;
  tag?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
};

type AnalyticsJourneySampleToolInput = {
  bearerToken: string;
  projectId: string;
  sampleId: string;
};

type AnalyticsOpportunityToolInput = {
  bearerToken: string;
  projectId: string;
  opportunityId: string;
};

type AnalyticsBundleToolInput = {
  bearerToken: string;
  projectId: string;
  bundleGenerationId: string;
};

type AnalyticsBundleListToolInput = {
  bearerToken: string;
  projectId?: string | undefined;
  status?: "all" | "pending" | "running" | "completed" | "failed" | undefined;
  kind?: AnalyticsBundleAnalysisKind | undefined;
  service?: string | undefined;
  environment?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
};

type AnalyticsBundleCreateToolInput = {
  bearerToken: string;
  projectId: string;
  opportunityId?: string | undefined;
  analysisKind: AnalyticsBundleAnalysisKind;
  from?: string | undefined;
  to?: string | undefined;
  last?: string | undefined;
  funnel?: string | undefined;
  route?: string | undefined;
  incidentId?: string | undefined;
  deployId?: string | undefined;
  filters?: Record<string, unknown> | undefined;
};

function readMetricsInput(input: Record<string, unknown>): AnalyticsMetricsToolInput {
  return {
    bearerToken: String(input["bearerToken"]),
    projectId: String(input["projectId"]),
    from: readOptionalString(input, "from"),
    to: readOptionalString(input, "to"),
    last: readOptionalString(input, "last"),
    granularity: readGranularity(input),
    service: readOptionalString(input, "service"),
    environment: readOptionalString(input, "environment"),
    ...optionalStringField(input, "route"),
    ...optionalStringField(input, "deviceType"),
    ...optionalStringField(input, "browser"),
    ...optionalStringField(input, "os"),
    ...optionalStringField(input, "language"),
    ...optionalStringField(input, "country"),
    ...(readAnalyticsAuthState(input["authState"]) === undefined
      ? {}
      : { authState: readAnalyticsAuthState(input["authState"]) }),
    ...optionalStringField(input, "referrer"),
    ...optionalStringField(input, "utmSource"),
    ...optionalStringField(input, "utmMedium"),
    ...optionalStringField(input, "utmCampaign"),
    ...(readStringRecord(input["customDimensions"]) === undefined
      ? {}
      : { customDimensions: readStringRecord(input["customDimensions"]) }),
    limit: readOptionalNumber(input, "limit")
  };
}

function optionalStringField(input: Record<string, unknown>, key: string): Record<string, string> {
  const value = readOptionalString(input, key);
  return value === undefined ? {} : { [key]: value };
}

function readAnalyticsAuthState(
  value: unknown
): "anonymous" | "authenticated" | "unknown" | undefined {
  return value === "anonymous" || value === "authenticated" || value === "unknown"
    ? value
    : undefined;
}

function readStringRecord(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 8 &&
    entries.every(
      ([key, entry]) =>
        /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key) &&
        typeof entry === "string" &&
        entry.length <= 128
    )
    ? (Object.fromEntries(entries) as Record<string, string>)
    : undefined;
}

function readOpportunitiesInput(input: Record<string, unknown>): AnalyticsOpportunitiesToolInput {
  const status = input["status"];
  const kind = AnalyticsBundleAnalysisKindSchema.safeParse(input["kind"]);
  const severity = AnalyticsBundleSeveritySchema.safeParse(input["severity"]);
  const bundleStatus = AnalyticsOpportunityBundleStatusSchema.safeParse(input["bundleStatus"]);
  return {
    bearerToken: String(input["bearerToken"]),
    projectId: readOptionalString(input, "projectId"),
    status:
      status === "open" || status === "resolved" || status === "snoozed" || status === "all"
        ? status
        : undefined,
    kind: kind.success ? kind.data : undefined,
    service: readOptionalString(input, "service"),
    environment: readOptionalString(input, "environment"),
    severity: severity.success ? severity.data : undefined,
    bundleStatus: bundleStatus.success ? bundleStatus.data : undefined,
    from: readOptionalString(input, "from"),
    to: readOptionalString(input, "to"),
    cursor: readOptionalString(input, "cursor"),
    limit: readOptionalNumber(input, "limit")
  };
}

function readJourneySamplesInput(input: Record<string, unknown>): AnalyticsJourneySamplesToolInput {
  return {
    bearerToken: String(input["bearerToken"]),
    projectId: String(input["projectId"]),
    service: readOptionalString(input, "service"),
    environment: readOptionalString(input, "environment"),
    tag: readOptionalString(input, "tag"),
    cursor: readOptionalString(input, "cursor"),
    limit: readOptionalNumber(input, "limit")
  };
}

function readBundleListInput(input: Record<string, unknown>): AnalyticsBundleListToolInput {
  const status = input["status"];
  const kind = AnalyticsBundleAnalysisKindSchema.safeParse(input["kind"]);
  return {
    bearerToken: String(input["bearerToken"]),
    projectId: readOptionalString(input, "projectId"),
    status:
      status === "all" ||
      status === "pending" ||
      status === "running" ||
      status === "completed" ||
      status === "failed"
        ? status
        : undefined,
    kind: kind.success ? kind.data : undefined,
    service: readOptionalString(input, "service"),
    environment: readOptionalString(input, "environment"),
    from: readOptionalString(input, "from"),
    to: readOptionalString(input, "to"),
    cursor: readOptionalString(input, "cursor"),
    limit: readOptionalNumber(input, "limit")
  };
}

function readBundleCreateInput(input: Record<string, unknown>): AnalyticsBundleCreateToolInput {
  const analysisKind = AnalyticsBundleAnalysisKindSchema.safeParse(input["analysisKind"]);
  if (!analysisKind.success) {
    throw new AnalyticsMetricsApiError(400, "Invalid analytics bundle analysis kind.");
  }

  return {
    bearerToken: String(input["bearerToken"]),
    projectId: String(input["projectId"]),
    opportunityId: readOptionalString(input, "opportunityId"),
    analysisKind: analysisKind.data,
    from: readOptionalString(input, "from"),
    to: readOptionalString(input, "to"),
    last: readOptionalString(input, "last"),
    funnel: readOptionalString(input, "funnel"),
    route: readOptionalString(input, "route"),
    incidentId: readOptionalString(input, "incidentId"),
    deployId: readOptionalString(input, "deployId"),
    filters: readOptionalRecord(input, "filters")
  };
}

function readOptionalRecord(
  input: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  const value = input[key];
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return undefined;
}
