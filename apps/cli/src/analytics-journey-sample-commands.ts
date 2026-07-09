import {
  AnalyticsJourneySampleResponseSchema,
  AnalyticsJourneySamplesListResponseSchema,
  type AnalyticsJourneySampleResponse,
  type AnalyticsJourneySamplesListResponse
} from "../../../packages/shared-types/src/index.js";
import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState } from "./auth-state.js";
import type { CliAuthState } from "./auth-state.js";
import { AnalyticsMetricsApiError } from "./analytics-metrics-commands.js";
import type { CliCommandResult } from "./token-commands.js";

type AnalyticsJourneySampleHttpRequest = {
  method: "GET";
  path: string;
  bearerToken: string;
};

type AnalyticsJourneySampleHttpResponse = {
  status: number;
  body: unknown;
};

export interface AnalyticsJourneySamplesListCommandInput {
  bearerToken: string;
  projectId: string;
  service?: string | undefined;
  environment?: string | undefined;
  tag?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
  json?: boolean | undefined;
}

export interface AnalyticsJourneySampleGetCommandInput {
  bearerToken: string;
  projectId: string;
  sampleId: string;
  json?: boolean | undefined;
}

function toApiError(status: number, body: unknown, fallback: string): AnalyticsMetricsApiError {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
    return new AnalyticsMetricsApiError(status, body.error);
  }

  return new AnalyticsMetricsApiError(status, fallback);
}

export function createAnalyticsJourneySampleApi(httpClient: {
  request(request: AnalyticsJourneySampleHttpRequest): Promise<AnalyticsJourneySampleHttpResponse>;
}): {
  listJourneySamples(input: Omit<AnalyticsJourneySamplesListCommandInput, "json">): Promise<AnalyticsJourneySamplesListResponse>;
  getJourneySample(input: Omit<AnalyticsJourneySampleGetCommandInput, "json">): Promise<AnalyticsJourneySampleResponse>;
} {
  return {
    async listJourneySamples(input): Promise<AnalyticsJourneySamplesListResponse> {
      const params = new URLSearchParams({ project_id: input.projectId });
      appendOptionalParam(params, "service", input.service);
      appendOptionalParam(params, "environment", input.environment);
      appendOptionalParam(params, "tag", input.tag);
      appendOptionalParam(params, "cursor", input.cursor);
      if (input.limit !== undefined) {
        params.set("limit", String(input.limit));
      }

      const response = await httpClient.request({
        method: "GET",
        path: `/v1/analytics/journey-samples?${params.toString()}`,
        bearerToken: input.bearerToken
      });
      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to list analytics journey samples.");
      }

      const parsed = AnalyticsJourneySamplesListResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new AnalyticsMetricsApiError(500, "Invalid analytics journey samples response.");
      }

      return parsed.data;
    },

    async getJourneySample(input): Promise<AnalyticsJourneySampleResponse> {
      const params = new URLSearchParams({ project_id: input.projectId });
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/analytics/journey-samples/${encodeURIComponent(input.sampleId)}?${params.toString()}`,
        bearerToken: input.bearerToken
      });
      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to get analytics journey sample.");
      }

      const parsed = AnalyticsJourneySampleResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new AnalyticsMetricsApiError(500, "Invalid analytics journey sample response.");
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
  if (error.status === 400 || error.status === 403 || error.status === 429) {
    return 4;
  }

  return 1;
}

function formatJourneySamplesList(response: AnalyticsJourneySamplesListResponse): string {
  if (response.samples.length === 0) {
    return "No analytics journey samples found.";
  }

  return response.samples
    .map((sample) => [
      sample.sample_id,
      sample.service ?? "",
      sample.environment ?? "",
      sample.last_seen_at,
      sample.analysis_tags.join(",") || "no tags",
      sample.has_artifact ? "artifact" : "no artifact"
    ].join("  "))
    .join("\n");
}

function formatJourneySample(response: AnalyticsJourneySampleResponse): string {
  return [
    `Journey sample: ${response.sample.sample_id}`,
    `Project: ${response.sample.project_id}`,
    `Service: ${response.sample.service ?? ""}`,
    `Environment: ${response.sample.environment ?? ""}`,
    `Window: ${response.sample.first_seen_at} to ${response.sample.last_seen_at}`,
    `Tags: ${response.sample.analysis_tags.join(", ") || ""}`,
    `Expires: ${response.sample.expires_at}`,
    `Journey keys: ${Object.keys(response.journey).join(", ")}`
  ].join("\n");
}

export async function listAnalyticsJourneySamplesCommand(
  input: AnalyticsJourneySamplesListCommandInput,
  api: {
    listJourneySamples(input: Omit<AnalyticsJourneySamplesListCommandInput, "json">): Promise<AnalyticsJourneySamplesListResponse>;
  }
): Promise<CliCommandResult> {
  try {
    const response = await api.listJourneySamples({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      service: input.service,
      environment: input.environment,
      tag: input.tag,
      cursor: input.cursor,
      limit: input.limit
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(response) : formatJourneySamplesList(response)
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function getAnalyticsJourneySampleCommand(
  input: AnalyticsJourneySampleGetCommandInput,
  api: {
    getJourneySample(input: Omit<AnalyticsJourneySampleGetCommandInput, "json">): Promise<AnalyticsJourneySampleResponse>;
  }
): Promise<CliCommandResult> {
  try {
    const response = await api.getJourneySample({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      sampleId: input.sampleId
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(response) : formatJourneySample(response)
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

async function createAuthenticatedAnalyticsJourneySampleApi(
  input: { authFilePath?: string },
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: {
      baseUrl: string;
    }) => { request(request: AnalyticsJourneySampleHttpRequest): Promise<AnalyticsJourneySampleHttpResponse> };
    createApi?: typeof createAnalyticsJourneySampleApi;
    fetchImpl?: typeof fetch;
  }
): Promise<{ authState: CliAuthState; api: ReturnType<typeof createAnalyticsJourneySampleApi> }> {
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
  const createApi = dependencies?.createApi ?? createAnalyticsJourneySampleApi;

  return {
    authState,
    api: createApi(httpClient)
  };
}

type AnalyticsJourneySamplesListWithAuthInput =
  Omit<AnalyticsJourneySamplesListCommandInput, "bearerToken"> & { authFilePath?: string };
type AnalyticsJourneySampleGetWithAuthInput =
  Omit<AnalyticsJourneySampleGetCommandInput, "bearerToken"> & { authFilePath?: string };

export async function listAnalyticsJourneySamplesWithAuthCommand(
  input: AnalyticsJourneySamplesListWithAuthInput,
  dependencies?: Parameters<typeof createAuthenticatedAnalyticsJourneySampleApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedAnalyticsJourneySampleApi,
    dependencies,
    runCommand: (authState, api) =>
      listAnalyticsJourneySamplesCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          service: input.service,
          environment: input.environment,
          tag: input.tag,
          cursor: input.cursor,
          limit: input.limit,
          json: input.json
        },
        api
      )
  });
}

export async function getAnalyticsJourneySampleWithAuthCommand(
  input: AnalyticsJourneySampleGetWithAuthInput,
  dependencies?: Parameters<typeof createAuthenticatedAnalyticsJourneySampleApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedAnalyticsJourneySampleApi,
    dependencies,
    runCommand: (authState, api) =>
      getAnalyticsJourneySampleCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          sampleId: input.sampleId,
          json: input.json
        },
        api
      )
  });
}
