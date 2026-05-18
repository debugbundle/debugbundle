import {
  ImprovementSettingsResponseSchema,
  ImprovementSettingsUpdateSchema,
  type ImprovementSettingsResponse,
  type ImprovementSettingsUpdate
} from "../../../packages/shared-types/src/index.js";
import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState } from "./auth-state.js";
import type { CliAuthState } from "./auth-state.js";
import type { CliCommandResult } from "./token-commands.js";

type ImprovementSettingsHttpRequest = {
  method: "GET" | "PATCH";
  path: string;
  bearerToken: string;
  body?: unknown;
};

type ImprovementSettingsHttpResponse = {
  status: number;
  body: unknown;
};

export class ImprovementSettingsApiError extends Error {
  public readonly status: number;

  public constructor(status: number, message: string) {
    super(message);
    this.name = "ImprovementSettingsApiError";
    this.status = status;
  }
}

function toApiError(status: number, body: unknown, fallback: string): ImprovementSettingsApiError {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
    return new ImprovementSettingsApiError(status, body.error);
  }

  return new ImprovementSettingsApiError(status, fallback);
}

export function createImprovementSettingsApi(httpClient: {
  request(request: ImprovementSettingsHttpRequest): Promise<ImprovementSettingsHttpResponse>;
}): {
  getImprovementSettings(input: { bearerToken: string; projectId: string }): Promise<ImprovementSettingsResponse>;
  updateImprovementSettings(input: {
    bearerToken: string;
    projectId: string;
    update: ImprovementSettingsUpdate;
  }): Promise<ImprovementSettingsResponse>;
} {
  return {
    async getImprovementSettings(input): Promise<ImprovementSettingsResponse> {
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/improvement-settings`,
        bearerToken: input.bearerToken
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to get improvement settings.");
      }

      const parsed = ImprovementSettingsResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new ImprovementSettingsApiError(500, "Invalid improvement settings response.");
      }

      return parsed.data;
    },

    async updateImprovementSettings(input): Promise<ImprovementSettingsResponse> {
      const response = await httpClient.request({
        method: "PATCH",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/improvement-settings`,
        bearerToken: input.bearerToken,
        body: input.update
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to update improvement settings.");
      }

      const parsed = ImprovementSettingsResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new ImprovementSettingsApiError(500, "Invalid improvement settings response.");
      }

      return parsed.data;
    }
  };
}

function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof ImprovementSettingsApiError)) {
    return 1;
  }

  if (error.status === 401) {
    return 2;
  }
  if (error.status === 404) {
    return 3;
  }
  if (error.status === 400) {
    return 4;
  }

  return 1;
}

function formatSettings(response: ImprovementSettingsResponse): string {
  return [
    `access_mode: ${response.access_mode}`,
    `cloud_automation_available: ${response.cloud_automation_available}`,
    `automated_improvement_bundles_enabled: ${response.settings.automated_improvement_bundles_enabled}`,
    `improvement_bundle_sensitivity: ${response.settings.improvement_bundle_sensitivity}`
  ].join("\n");
}

export async function getImprovementSettingsCommand(
  input: {
    bearerToken: string;
    projectId: string;
    json?: boolean;
  },
  api: {
    getImprovementSettings(input: { bearerToken: string; projectId: string }): Promise<ImprovementSettingsResponse>;
  }
): Promise<CliCommandResult> {
  try {
    const response = await api.getImprovementSettings({
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

export async function setImprovementSettingsCommand(
  input: {
    bearerToken: string;
    projectId: string;
    update: ImprovementSettingsUpdate;
    json?: boolean;
  },
  api: {
    updateImprovementSettings(input: {
      bearerToken: string;
      projectId: string;
      update: ImprovementSettingsUpdate;
    }): Promise<ImprovementSettingsResponse>;
  }
): Promise<CliCommandResult> {
  try {
    const parsedUpdate = ImprovementSettingsUpdateSchema.safeParse(input.update);
    if (!parsedUpdate.success) {
      return {
        exitCode: 4,
        output: "Invalid improvement settings update."
      };
    }

    const response = await api.updateImprovementSettings({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      update: parsedUpdate.data
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(response) : `Improvement settings updated.\n${formatSettings(response)}`
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

async function createAuthenticatedImprovementSettingsApi(
  input: { authFilePath?: string },
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: {
      baseUrl: string;
    }) => { request(request: ImprovementSettingsHttpRequest): Promise<ImprovementSettingsHttpResponse> };
    createApi?: typeof createImprovementSettingsApi;
    fetchImpl?: typeof fetch;
  }
): Promise<{ authState: CliAuthState; api: ReturnType<typeof createImprovementSettingsApi> }> {
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
  const createApi = dependencies?.createApi ?? createImprovementSettingsApi;

  return {
    authState,
    api: createApi(httpClient)
  };
}

export async function getImprovementSettingsWithAuthCommand(
  input: { authFilePath?: string; projectId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedImprovementSettingsApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedImprovementSettingsApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; projectId: string; json?: boolean } = {
        bearerToken: authState.bearer_token,
        projectId: input.projectId
      };
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return getImprovementSettingsCommand(commandInput, api);
    }
  });
}

export async function setImprovementSettingsWithAuthCommand(
  input: {
    authFilePath?: string;
    projectId: string;
    update: ImprovementSettingsUpdate;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedImprovementSettingsApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedImprovementSettingsApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: {
        bearerToken: string;
        projectId: string;
        update: ImprovementSettingsUpdate;
        json?: boolean;
      } = {
        bearerToken: authState.bearer_token,
        projectId: input.projectId,
        update: input.update
      };
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return setImprovementSettingsCommand(commandInput, api);
    }
  });
}
