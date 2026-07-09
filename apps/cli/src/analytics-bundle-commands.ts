import { z } from "zod";

import {
  AnalyticsBundleAnalysisKindSchema,
  AnalyticsBundleGenerationsListResponseSchema,
  AnalyticsBundleGenerationStatusSchema,
  AnalyticsBundleV1Schema,
  type AnalyticsBundleAnalysisKind,
  type AnalyticsBundleGenerationsListResponse,
  type AnalyticsBundleGenerationStatus,
  type AnalyticsBundleV1
} from "../../../packages/shared-types/src/index.js";
import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState } from "./auth-state.js";
import type { CliAuthState } from "./auth-state.js";
import { AnalyticsMetricsApiError } from "./analytics-metrics-commands.js";
import type { CliCommandResult } from "./token-commands.js";

type AnalyticsBundleHttpRequest = {
  method: "GET" | "POST";
  path: string;
  bearerToken: string;
  body?: unknown;
};

type AnalyticsBundleHttpResponse = {
  status: number;
  body: unknown;
};

export interface AnalyticsBundleGetCommandInput {
  bearerToken: string;
  projectId: string;
  bundleGenerationId: string;
  json?: boolean | undefined;
}

export interface AnalyticsBundleListCommandInput {
  bearerToken: string;
  projectId: string;
  status?: AnalyticsBundleGenerationStatus | "all" | undefined;
  kind?: AnalyticsBundleAnalysisKind | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
  json?: boolean | undefined;
}

export interface AnalyticsBundleCreateCommandInput {
  bearerToken: string;
  projectId: string;
  analysisKind: AnalyticsBundleAnalysisKind;
  from?: string | undefined;
  to?: string | undefined;
  last?: string | undefined;
  funnel?: string | undefined;
  route?: string | undefined;
  incidentId?: string | undefined;
  deployId?: string | undefined;
  filters?: Record<string, unknown> | undefined;
  json?: boolean | undefined;
}

const AnalyticsBundlePendingResponseSchema = z
  .object({
    status: z.literal("pending"),
    bundle_generation_id: z.string().uuid()
  })
  .strict();

const AnalyticsBundleFailedResponseSchema = z
  .object({
    status: z.literal("failed"),
    reason: z.string().min(1)
  })
  .strict();

const AnalyticsBundleResponseSchema = z.union([
  AnalyticsBundleV1Schema,
  AnalyticsBundlePendingResponseSchema,
  AnalyticsBundleFailedResponseSchema
]);

export type AnalyticsBundleResponse =
  | AnalyticsBundleV1
  | z.infer<typeof AnalyticsBundlePendingResponseSchema>
  | z.infer<typeof AnalyticsBundleFailedResponseSchema>;

function toApiError(status: number, body: unknown, fallback: string): AnalyticsMetricsApiError {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
    return new AnalyticsMetricsApiError(status, body.error);
  }

  return new AnalyticsMetricsApiError(status, fallback);
}

export function createAnalyticsBundleApi(httpClient: {
  request(request: AnalyticsBundleHttpRequest): Promise<AnalyticsBundleHttpResponse>;
}): {
  listBundles(input: Omit<AnalyticsBundleListCommandInput, "json">): Promise<AnalyticsBundleGenerationsListResponse>;
  createBundle(input: Omit<AnalyticsBundleCreateCommandInput, "json">): Promise<AnalyticsBundleResponse>;
  getBundle(input: Omit<AnalyticsBundleGetCommandInput, "json">): Promise<AnalyticsBundleResponse>;
} {
  return {
    async listBundles(input): Promise<AnalyticsBundleGenerationsListResponse> {
      const params = new URLSearchParams({ project_id: input.projectId });
      if (input.status !== undefined) {
        params.set("status", input.status);
      }
      if (input.kind !== undefined) {
        params.set("kind", input.kind);
      }
      if (input.cursor !== undefined) {
        params.set("cursor", input.cursor);
      }
      if (input.limit !== undefined) {
        params.set("limit", String(input.limit));
      }

      const response = await httpClient.request({
        method: "GET",
        path: `/v1/analytics/bundles?${params.toString()}`,
        bearerToken: input.bearerToken
      });
      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to list analytics bundles.");
      }

      const parsed = AnalyticsBundleGenerationsListResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new AnalyticsMetricsApiError(500, "Invalid analytics bundle list response.");
      }

      return parsed.data;
    },

    async createBundle(input): Promise<AnalyticsBundleResponse> {
      const response = await httpClient.request({
        method: "POST",
        path: "/v1/analytics/bundles",
        bearerToken: input.bearerToken,
        body: buildCreateBundleBody(input)
      });
      if (response.status !== 200 && response.status !== 202) {
        throw toApiError(response.status, response.body, "Failed to create analytics bundle.");
      }
      return parseAnalyticsBundleResponse(response.body);
    },

    async getBundle(input): Promise<AnalyticsBundleResponse> {
      const params = new URLSearchParams({ project_id: input.projectId });
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/analytics/bundles/${encodeURIComponent(input.bundleGenerationId)}?${params.toString()}`,
        bearerToken: input.bearerToken
      });
      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to get analytics bundle.");
      }
      return parseAnalyticsBundleResponse(response.body);
    }
  };
}

function buildCreateBundleBody(input: Omit<AnalyticsBundleCreateCommandInput, "json">): Record<string, unknown> {
  return {
    project_id: input.projectId,
    analysis_kind: input.analysisKind,
    ...(input.from === undefined ? {} : { from: input.from }),
    ...(input.to === undefined ? {} : { to: input.to }),
    ...(input.last === undefined ? {} : { last: input.last }),
    ...(input.funnel === undefined ? {} : { funnel: input.funnel }),
    ...(input.route === undefined ? {} : { route: input.route }),
    ...(input.incidentId === undefined ? {} : { incident_id: input.incidentId }),
    ...(input.deployId === undefined ? {} : { deploy_id: input.deployId }),
    ...(input.filters === undefined ? {} : { filters: input.filters })
  };
}

function parseAnalyticsBundleResponse(body: unknown): AnalyticsBundleResponse {
  const parsed = AnalyticsBundleResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new AnalyticsMetricsApiError(500, "Invalid analytics bundle response.");
  }
  return parsed.data;
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
  if (error.status === 400 || error.status === 403 || error.status === 429) {
    return 4;
  }

  return 1;
}

function formatAnalyticsBundle(response: AnalyticsBundleResponse): string {
  if ("status" in response) {
    if (response.status === "pending") {
      return `AnalyticsBundle pending: ${response.bundle_generation_id}`;
    }

    return `AnalyticsBundle failed: ${response.reason}`;
  }

  return [
    `AnalyticsBundle: ${response.analysis_kind}`,
    `Title: ${response.summary.title}`,
    `Project: ${response.project.project_id}`,
    `Window: ${response.analysis_window.from} to ${response.analysis_window.to}`,
    `Sessions analyzed: ${response.metrics.sessions_analyzed}`,
    `Affected sessions: ${response.metrics.affected_sessions ?? ""}`,
    `Recommendations: ${response.recommendations.length}`,
    `Journey patterns: ${response.journey_patterns.length}`,
    `Representative journeys: ${response.representative_journeys.length}`
  ].join("\n");
}

function formatAnalyticsBundleList(response: AnalyticsBundleGenerationsListResponse): string {
  if (response.bundles.length === 0) {
    return "No AnalyticsBundles found.";
  }

  return response.bundles
    .map((bundle) => [
      bundle.generation_id,
      bundle.analysis_kind,
      bundle.status,
      bundle.created_at,
      bundle.has_artifact ? "artifact" : "no artifact"
    ].join("  "))
    .join("\n");
}

export async function listAnalyticsBundlesCommand(
  input: AnalyticsBundleListCommandInput,
  api: { listBundles(input: Omit<AnalyticsBundleListCommandInput, "json">): Promise<AnalyticsBundleGenerationsListResponse> }
): Promise<CliCommandResult> {
  if (input.status !== undefined && input.status !== "all" && !AnalyticsBundleGenerationStatusSchema.safeParse(input.status).success) {
    return { exitCode: 4, output: "Invalid value for --status." };
  }
  if (input.kind !== undefined && !AnalyticsBundleAnalysisKindSchema.safeParse(input.kind).success) {
    return { exitCode: 4, output: "Invalid value for --kind." };
  }

  try {
    const response = await api.listBundles({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      status: input.status,
      kind: input.kind,
      cursor: input.cursor,
      limit: input.limit
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(response) : formatAnalyticsBundleList(response)
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function createAnalyticsBundleCommand(
  input: AnalyticsBundleCreateCommandInput,
  api: { createBundle(input: Omit<AnalyticsBundleCreateCommandInput, "json">): Promise<AnalyticsBundleResponse> }
): Promise<CliCommandResult> {
  if (!AnalyticsBundleAnalysisKindSchema.safeParse(input.analysisKind).success) {
    return { exitCode: 4, output: "Invalid value for --kind." };
  }

  try {
    const response = await api.createBundle({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      analysisKind: input.analysisKind,
      from: input.from,
      to: input.to,
      last: input.last,
      funnel: input.funnel,
      route: input.route,
      incidentId: input.incidentId,
      deployId: input.deployId,
      filters: input.filters
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(response) : formatAnalyticsBundle(response)
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function getAnalyticsBundleCommand(
  input: AnalyticsBundleGetCommandInput,
  api: { getBundle(input: Omit<AnalyticsBundleGetCommandInput, "json">): Promise<AnalyticsBundleResponse> }
): Promise<CliCommandResult> {
  try {
    const response = await api.getBundle({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      bundleGenerationId: input.bundleGenerationId
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(response) : formatAnalyticsBundle(response)
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

async function createAuthenticatedAnalyticsBundleApi(
  input: { authFilePath?: string },
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: {
      baseUrl: string;
    }) => { request(request: AnalyticsBundleHttpRequest): Promise<AnalyticsBundleHttpResponse> };
    createApi?: typeof createAnalyticsBundleApi;
    fetchImpl?: typeof fetch;
  }
): Promise<{ authState: CliAuthState; api: ReturnType<typeof createAnalyticsBundleApi> }> {
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
  const createApi = dependencies?.createApi ?? createAnalyticsBundleApi;

  return {
    authState,
    api: createApi(httpClient)
  };
}

type AnalyticsBundleListWithAuthInput = Omit<AnalyticsBundleListCommandInput, "bearerToken"> & { authFilePath?: string };
type AnalyticsBundleCreateWithAuthInput = Omit<AnalyticsBundleCreateCommandInput, "bearerToken"> & { authFilePath?: string };
type AnalyticsBundleGetWithAuthInput = Omit<AnalyticsBundleGetCommandInput, "bearerToken"> & { authFilePath?: string };

export async function listAnalyticsBundlesWithAuthCommand(
  input: AnalyticsBundleListWithAuthInput,
  dependencies?: Parameters<typeof createAuthenticatedAnalyticsBundleApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedAnalyticsBundleApi,
    dependencies,
    runCommand: (authState, api) =>
      listAnalyticsBundlesCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          status: input.status,
          kind: input.kind,
          cursor: input.cursor,
          limit: input.limit,
          json: input.json
        },
        api
      )
  });
}

export async function createAnalyticsBundleWithAuthCommand(
  input: AnalyticsBundleCreateWithAuthInput,
  dependencies?: Parameters<typeof createAuthenticatedAnalyticsBundleApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedAnalyticsBundleApi,
    dependencies,
    runCommand: (authState, api) =>
      createAnalyticsBundleCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          analysisKind: input.analysisKind,
          from: input.from,
          to: input.to,
          last: input.last,
          funnel: input.funnel,
          route: input.route,
          incidentId: input.incidentId,
          deployId: input.deployId,
          filters: input.filters,
          json: input.json
        },
        api
      )
  });
}

export async function getAnalyticsBundleWithAuthCommand(
  input: AnalyticsBundleGetWithAuthInput,
  dependencies?: Parameters<typeof createAuthenticatedAnalyticsBundleApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedAnalyticsBundleApi,
    dependencies,
    runCommand: (authState, api) =>
      getAnalyticsBundleCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          bundleGenerationId: input.bundleGenerationId,
          json: input.json
        },
        api
      )
  });
}
