import {
  AnalyticsSettingsResponseSchema,
  AnalyticsSettingsUpdateSchema,
  type AnalyticsSettingsResponse,
  type AnalyticsSettingsUpdate
} from "../../../packages/shared-types/src/index.js";
import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState } from "./auth-state.js";
import type { CliAuthState } from "./auth-state.js";
import type { CliCommandResult } from "./token-commands.js";

type AnalyticsSettingsHttpRequest = {
  method: "GET" | "PATCH";
  path: string;
  bearerToken: string;
  body?: unknown;
};

type AnalyticsSettingsHttpResponse = {
  status: number;
  body: unknown;
};

export class AnalyticsSettingsApiError extends Error {
  public readonly status: number;

  public constructor(status: number, message: string) {
    super(message);
    this.name = "AnalyticsSettingsApiError";
    this.status = status;
  }
}

function toApiError(status: number, body: unknown, fallback: string): AnalyticsSettingsApiError {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
    return new AnalyticsSettingsApiError(status, body.error);
  }

  return new AnalyticsSettingsApiError(status, fallback);
}

export function createAnalyticsSettingsApi(httpClient: {
  request(request: AnalyticsSettingsHttpRequest): Promise<AnalyticsSettingsHttpResponse>;
}): {
  getAnalyticsSettings(input: { bearerToken: string; projectId: string }): Promise<AnalyticsSettingsResponse>;
  updateAnalyticsSettings(input: {
    bearerToken: string;
    projectId: string;
    update: AnalyticsSettingsUpdate;
  }): Promise<AnalyticsSettingsResponse>;
} {
  return {
    async getAnalyticsSettings(input): Promise<AnalyticsSettingsResponse> {
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/analytics-settings`,
        bearerToken: input.bearerToken
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to get analytics settings.");
      }

      const parsed = AnalyticsSettingsResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new AnalyticsSettingsApiError(500, "Invalid analytics settings response.");
      }

      return parsed.data;
    },

    async updateAnalyticsSettings(input): Promise<AnalyticsSettingsResponse> {
      const response = await httpClient.request({
        method: "PATCH",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/analytics-settings`,
        bearerToken: input.bearerToken,
        body: input.update
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to update analytics settings.");
      }

      const parsed = AnalyticsSettingsResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new AnalyticsSettingsApiError(500, "Invalid analytics settings response.");
      }

      return parsed.data;
    }
  };
}

function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof AnalyticsSettingsApiError)) {
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

function formatSettings(response: AnalyticsSettingsResponse): string {
  return [
    `access_mode: ${response.access_mode}`,
    `analytics_available: ${response.analytics_available}`,
    `enabled: ${response.settings.enabled}`,
    `privacy_mode: ${response.settings.privacy_mode}`,
    `consent_required: ${response.settings.consent_required}`,
    `capture_page_views: ${response.settings.capture_page_views}`,
    `capture_route_changes: ${response.settings.capture_route_changes}`,
    `capture_actions: ${response.settings.capture_actions}`,
    `capture_friction_signals: ${response.settings.capture_friction_signals}`,
    `journey_sample_rate: ${response.settings.journey_sample_rate}`,
    `raw_retention_days: ${response.settings.raw_retention_days}`,
    `sample_retention_days: ${response.settings.sample_retention_days}`,
    `aggregate_retention_months: ${response.settings.aggregate_retention_months}`,
    `max_saved_funnels: ${response.settings.max_saved_funnels}`,
    `max_custom_dimensions: ${response.settings.max_custom_dimensions}`,
    `approved_custom_dimensions: ${response.settings.approved_custom_dimensions.join(",")}`
  ].join("\n");
}

export async function getAnalyticsSettingsCommand(
  input: {
    bearerToken: string;
    projectId: string;
    json?: boolean;
  },
  api: {
    getAnalyticsSettings(input: { bearerToken: string; projectId: string }): Promise<AnalyticsSettingsResponse>;
  }
): Promise<CliCommandResult> {
  try {
    const response = await api.getAnalyticsSettings({
      bearerToken: input.bearerToken,
      projectId: input.projectId
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(response) : formatSettings(response)
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function setAnalyticsSettingsCommand(
  input: {
    bearerToken: string;
    projectId: string;
    update: AnalyticsSettingsUpdate;
    json?: boolean;
  },
  api: {
    updateAnalyticsSettings(input: {
      bearerToken: string;
      projectId: string;
      update: AnalyticsSettingsUpdate;
    }): Promise<AnalyticsSettingsResponse>;
  }
): Promise<CliCommandResult> {
  try {
    const parsedUpdate = AnalyticsSettingsUpdateSchema.safeParse(input.update);
    if (!parsedUpdate.success) {
      return {
        exitCode: 4,
        output: "Invalid analytics settings update."
      };
    }

    const response = await api.updateAnalyticsSettings({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      update: parsedUpdate.data
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(response) : `Analytics settings updated.\n${formatSettings(response)}`
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

async function createAuthenticatedAnalyticsSettingsApi(
  input: { authFilePath?: string },
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: {
      baseUrl: string;
    }) => { request(request: AnalyticsSettingsHttpRequest): Promise<AnalyticsSettingsHttpResponse> };
    createApi?: typeof createAnalyticsSettingsApi;
    fetchImpl?: typeof fetch;
  }
): Promise<{ authState: CliAuthState; api: ReturnType<typeof createAnalyticsSettingsApi> }> {
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
  const createApi = dependencies?.createApi ?? createAnalyticsSettingsApi;

  return {
    authState,
    api: createApi(httpClient)
  };
}

export async function getAnalyticsSettingsWithAuthCommand(
  input: { authFilePath?: string; projectId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedAnalyticsSettingsApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedAnalyticsSettingsApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; projectId: string; json?: boolean } = {
        bearerToken: authState.bearer_token,
        projectId: input.projectId
      };
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return getAnalyticsSettingsCommand(commandInput, api);
    }
  });
}

export async function setAnalyticsSettingsWithAuthCommand(
  input: {
    authFilePath?: string;
    projectId: string;
    update: AnalyticsSettingsUpdate;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedAnalyticsSettingsApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedAnalyticsSettingsApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: {
        bearerToken: string;
        projectId: string;
        update: AnalyticsSettingsUpdate;
        json?: boolean;
      } = {
        bearerToken: authState.bearer_token,
        projectId: input.projectId,
        update: input.update
      };
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return setAnalyticsSettingsCommand(commandInput, api);
    }
  });
}
