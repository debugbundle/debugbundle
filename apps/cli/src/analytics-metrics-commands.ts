import {
  AnalyticsUsageSummaryResponseSchema,
  type AnalyticsMetricsGranularity,
  type AnalyticsUsageSummaryResponse
} from "../../../packages/shared-types/src/index.js";
import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState } from "./auth-state.js";
import type { CliAuthState } from "./auth-state.js";
import type { CliCommandResult } from "./token-commands.js";

type AnalyticsMetricsHttpRequest = {
  method: "GET";
  path: string;
  bearerToken: string;
};

type AnalyticsMetricsHttpResponse = {
  status: number;
  body: unknown;
};

export class AnalyticsMetricsApiError extends Error {
  public readonly status: number;

  public constructor(status: number, message: string) {
    super(message);
    this.name = "AnalyticsMetricsApiError";
    this.status = status;
  }
}

export interface AnalyticsSummaryCommandInput {
  bearerToken: string;
  projectId: string;
  from?: string | undefined;
  to?: string | undefined;
  last?: string | undefined;
  granularity?: AnalyticsMetricsGranularity | undefined;
  service?: string | undefined;
  environment?: string | undefined;
  limit?: number | undefined;
  json?: boolean | undefined;
}

function toApiError(status: number, body: unknown, fallback: string): AnalyticsMetricsApiError {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
    return new AnalyticsMetricsApiError(status, body.error);
  }

  return new AnalyticsMetricsApiError(status, fallback);
}

export function createAnalyticsMetricsApi(httpClient: {
  request(request: AnalyticsMetricsHttpRequest): Promise<AnalyticsMetricsHttpResponse>;
}): {
  getUsageSummary(input: Omit<AnalyticsSummaryCommandInput, "json">): Promise<AnalyticsUsageSummaryResponse>;
} {
  return {
    async getUsageSummary(input): Promise<AnalyticsUsageSummaryResponse> {
      const params = new URLSearchParams({ project_id: input.projectId });
      appendOptionalParam(params, "from", input.from);
      appendOptionalParam(params, "to", input.to);
      appendOptionalParam(params, "last", input.last);
      appendOptionalParam(params, "granularity", input.granularity);
      appendOptionalParam(params, "service", input.service);
      appendOptionalParam(params, "environment", input.environment);
      if (input.limit !== undefined) {
        params.set("limit", String(input.limit));
      }

      const response = await httpClient.request({
        method: "GET",
        path: `/v1/analytics/summary?${params.toString()}`,
        bearerToken: input.bearerToken
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to get analytics summary.");
      }

      const parsed = AnalyticsUsageSummaryResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new AnalyticsMetricsApiError(500, "Invalid analytics summary response.");
      }

      return parsed.data;
    }
  };
}

function appendOptionalParam(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined) {
    params.set(key, value);
  }
}

function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof AnalyticsMetricsApiError)) {
    return 1;
  }

  if (error.status === 401) {
    return 2;
  }
  if (error.status === 404) {
    return 3;
  }
  if (error.status === 400 || error.status === 403) {
    return 4;
  }

  return 1;
}

function formatTopSegments(label: string, segments: AnalyticsUsageSummaryResponse["breakdowns"]["device_types"]): string {
  if (segments.length === 0) {
    return `${label}: none`;
  }

  return `${label}: ${segments
    .slice(0, 5)
    .map((segment) => `${segment.value} (${segment.sessions} sessions, ${segment.pageviews} pageviews)`)
    .join("; ")}`;
}

function formatSummary(response: AnalyticsUsageSummaryResponse): string {
  return [
    `project_id: ${response.summary.project_id}`,
    `from: ${response.summary.from}`,
    `to: ${response.summary.to}`,
    `granularity: ${response.summary.granularity}`,
    `service: ${response.summary.service ?? ""}`,
    `environment: ${response.summary.environment ?? ""}`,
    `sessions: ${response.summary.sessions}`,
    `pageviews: ${response.summary.pageviews}`,
    `active_visitors: ${response.summary.active_visitors}`,
    `new_visitors: ${response.summary.new_visitors}`,
    `returning_visitors: ${response.summary.returning_visitors}`,
    `exits: ${response.summary.exits}`,
    `conversions: ${response.summary.conversions}`,
    formatTopSegments("top_device_types", response.breakdowns.device_types),
    formatTopSegments("top_browsers", response.breakdowns.browsers),
    formatTopSegments("top_referrers", response.breakdowns.referrers)
  ].join("\n");
}

export async function getAnalyticsSummaryCommand(
  input: AnalyticsSummaryCommandInput,
  api: {
    getUsageSummary(input: Omit<AnalyticsSummaryCommandInput, "json">): Promise<AnalyticsUsageSummaryResponse>;
  }
): Promise<CliCommandResult> {
  try {
    const response = await api.getUsageSummary({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      from: input.from,
      to: input.to,
      last: input.last,
      granularity: input.granularity,
      service: input.service,
      environment: input.environment,
      limit: input.limit
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(response) : formatSummary(response)
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

async function createAuthenticatedAnalyticsMetricsApi(
  input: { authFilePath?: string },
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: {
      baseUrl: string;
    }) => { request(request: AnalyticsMetricsHttpRequest): Promise<AnalyticsMetricsHttpResponse> };
    createApi?: typeof createAnalyticsMetricsApi;
    fetchImpl?: typeof fetch;
  }
): Promise<{ authState: CliAuthState; api: ReturnType<typeof createAnalyticsMetricsApi> }> {
  const readAuthState = dependencies?.readAuthState ?? readCliAuthState;
  const authStateInput: { authFilePath?: string } = {};
  if (input.authFilePath !== undefined) {
    authStateInput.authFilePath = input.authFilePath;
  }

  const authState = await readAuthState(authStateInput);
  const createHttpClient = dependencies?.createHttpClient ?? ((clientInput: { baseUrl: string }) => {
    const httpClientDependencies: { fetchImpl?: typeof fetch } = {};
    if (dependencies?.fetchImpl !== undefined) {
      httpClientDependencies.fetchImpl = dependencies.fetchImpl;
    }

    return createCliHttpClient(clientInput, httpClientDependencies);
  });
  const httpClient = createHttpClient({ baseUrl: authState.base_url });
  const createApi = dependencies?.createApi ?? createAnalyticsMetricsApi;

  return {
    authState,
    api: createApi(httpClient)
  };
}

export async function getAnalyticsSummaryWithAuthCommand(
  input: Omit<AnalyticsSummaryCommandInput, "bearerToken"> & { authFilePath?: string },
  dependencies?: Parameters<typeof createAuthenticatedAnalyticsMetricsApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedAnalyticsMetricsApi,
    dependencies,
    runCommand: (authState, api) => {
      return getAnalyticsSummaryCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          from: input.from,
          to: input.to,
          last: input.last,
          granularity: input.granularity,
          service: input.service,
          environment: input.environment,
          limit: input.limit,
          json: input.json
        },
        api
      );
    }
  });
}
