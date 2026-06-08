import {
  CapturePolicyResponseSchema,
  CapturePolicyUpdateSchema,
  RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES,
  type CapturePolicyResponse,
  type CapturePolicyUpdate,
} from "../../../packages/shared-types/src/index.js";
import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState } from "./auth-state.js";
import type { CliAuthState } from "./auth-state.js";
import type { CliCommandResult } from "./token-commands.js";

type CapturePolicyHttpRequest = {
  method: "GET" | "PATCH";
  path: string;
  bearerToken: string;
  body?: unknown;
};

type CapturePolicyHttpResponse = {
  status: number;
  body: unknown;
};

export class CapturePolicyApiError extends Error {
  public readonly status: number;

  public constructor(status: number, message: string) {
    super(message);
    this.name = "CapturePolicyApiError";
    this.status = status;
  }
}

function toApiError(status: number, body: unknown, fallback: string): CapturePolicyApiError {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
    return new CapturePolicyApiError(status, body.error);
  }

  return new CapturePolicyApiError(status, fallback);
}

export function createCapturePolicyApi(httpClient: {
  request(request: CapturePolicyHttpRequest): Promise<CapturePolicyHttpResponse>;
}): {
  getCapturePolicy(input: { bearerToken: string; projectId: string }): Promise<CapturePolicyResponse>;
  updateCapturePolicy(input: { bearerToken: string; projectId: string; update: CapturePolicyUpdate }): Promise<CapturePolicyResponse>;
} {
  return {
    async getCapturePolicy(input): Promise<CapturePolicyResponse> {
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/capture-policy`,
        bearerToken: input.bearerToken
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to get capture policy.");
      }

      const parsed = CapturePolicyResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new CapturePolicyApiError(500, "Invalid capture policy response.");
      }

      return parsed.data;
    },

    async updateCapturePolicy(input): Promise<CapturePolicyResponse> {
      const response = await httpClient.request({
        method: "PATCH",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/capture-policy`,
        bearerToken: input.bearerToken,
        body: input.update
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to update capture policy.");
      }

      const parsed = CapturePolicyResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new CapturePolicyApiError(500, "Invalid capture policy response.");
      }

      return parsed.data;
    }
  };
}

function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof CapturePolicyApiError)) {
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

function statusesEqual(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function formatStatusList(statuses: readonly number[]): string {
  return statuses.length === 0 ? "none" : statuses.join(", ");
}

function formatClientErrorPathRules(response: CapturePolicyResponse): string {
  const rawOverride = response.overrides.immediate_client_error_path_rules ?? null;
  const rules = rawOverride ?? response.policy.immediate_client_error_path_rules ?? [];

  if (rules.length === 0) {
    return rawOverride === null ? "preset default (none)" : "none (explicit)";
  }

  const formatted = rules.map((rule) => {
    const methods = rule.methods.length === 0 ? "" : `@${rule.methods.join(",")}`;
    return `${rule.status_code}=${rule.path_pattern}${methods}`;
  });

  return `${rawOverride === null ? "preset default" : "custom"} (${formatted.join("; ")})`;
}

function formatClientErrorIncidents(response: CapturePolicyResponse): string {
  const rawOverride = response.overrides.immediate_client_error_statuses;

  if (rawOverride === null) {
    return `preset default (${formatStatusList(response.policy.immediate_client_error_statuses)})`;
  }

  if (rawOverride.length === 0) {
    return "none (explicit)";
  }

  if (statusesEqual(rawOverride, RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES)) {
    return `recommended (${formatStatusList(rawOverride)})`;
  }

  return `custom (${formatStatusList(rawOverride)})`;
}

function formatPolicy(response: CapturePolicyResponse): string {
  const policy = response.policy;

  return [
    `preset: ${policy.preset}`,
    `capture_logs: ${policy.capture_logs}`,
    `capture_request_events: ${policy.capture_request_events}`,
    `capture_breadcrumbs: ${policy.capture_breadcrumbs}`,
    `capture_probe_events: ${policy.capture_probe_events}`,
    `client_error_incidents: ${formatClientErrorIncidents(response)}`,
    `client_error_path_rules: ${formatClientErrorPathRules(response)}`
  ].join("\n");
}

export async function getCapturePolicyCommand(
  input: {
    bearerToken: string;
    projectId: string;
    json?: boolean;
  },
  api: {
    getCapturePolicy(input: { bearerToken: string; projectId: string }): Promise<CapturePolicyResponse>;
  }
): Promise<CliCommandResult> {
  try {
    const response = await api.getCapturePolicy({
      bearerToken: input.bearerToken,
      projectId: input.projectId
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(response) : formatPolicy(response)
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function setCapturePolicyCommand(
  input: {
    bearerToken: string;
    projectId: string;
    update: CapturePolicyUpdate;
    json?: boolean;
  },
  api: {
    updateCapturePolicy(input: { bearerToken: string; projectId: string; update: CapturePolicyUpdate }): Promise<CapturePolicyResponse>;
  }
): Promise<CliCommandResult> {
  try {
    const parsedUpdate = CapturePolicyUpdateSchema.safeParse(input.update);
    if (!parsedUpdate.success) {
      return {
        exitCode: 4,
        output: "Invalid capture policy update."
      };
    }

    const response = await api.updateCapturePolicy({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      update: parsedUpdate.data
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(response) : `Capture policy updated.\n${formatPolicy(response)}`
    };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

async function createAuthenticatedCapturePolicyApi(
  input: { authFilePath?: string },
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => { request(request: CapturePolicyHttpRequest): Promise<CapturePolicyHttpResponse> };
    createApi?: typeof createCapturePolicyApi;
    fetchImpl?: typeof fetch;
  }
): Promise<{ authState: CliAuthState; api: ReturnType<typeof createCapturePolicyApi> }> {
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
  const createApi = dependencies?.createApi ?? createCapturePolicyApi;

  return {
    authState,
    api: createApi(httpClient)
  };
}

export async function getCapturePolicyWithAuthCommand(
  input: { authFilePath?: string; projectId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedCapturePolicyApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedCapturePolicyApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; projectId: string; json?: boolean } = {
        bearerToken: authState.bearer_token,
        projectId: input.projectId
      };
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return getCapturePolicyCommand(commandInput, {
        getCapturePolicy: (requestInput) => api.getCapturePolicy(requestInput)
      });
    }
  });
}

export async function setCapturePolicyWithAuthCommand(
  input: { authFilePath?: string; projectId: string; update: CapturePolicyUpdate; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedCapturePolicyApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedCapturePolicyApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; projectId: string; update: CapturePolicyUpdate; json?: boolean } = {
        bearerToken: authState.bearer_token,
        projectId: input.projectId,
        update: input.update
      };
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return setCapturePolicyCommand(commandInput, {
        updateCapturePolicy: (requestInput) => api.updateCapturePolicy(requestInput)
      });
    }
  });
}
