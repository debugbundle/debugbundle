import { z } from "zod";

import {
  CaptureBreadcrumbsSchema,
  CaptureLogsSchema,
  CapturePolicyUpdateSchema,
  CapturePresetSchema,
  CaptureProbeEventsSchema,
  CaptureRequestEventsSchema,
  type CapturePolicyUpdate,
  type ResolvedCapturePolicy
} from "../../../packages/shared-types/src/index.js";
import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState } from "./auth-state.js";
import type { CliAuthState } from "./auth-state.js";
import type { CliCommandResult } from "./token-commands.js";

const ResolvedCapturePolicySchema = z.object({
  preset: CapturePresetSchema,
  capture_logs: CaptureLogsSchema,
  capture_request_events: CaptureRequestEventsSchema,
  capture_breadcrumbs: CaptureBreadcrumbsSchema,
  capture_probe_events: CaptureProbeEventsSchema
});

const CapturePolicyResponseSchema = z.object({
  policy: ResolvedCapturePolicySchema
});

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
  getCapturePolicy(input: { bearerToken: string; projectId: string }): Promise<ResolvedCapturePolicy>;
  updateCapturePolicy(input: { bearerToken: string; projectId: string; update: CapturePolicyUpdate }): Promise<ResolvedCapturePolicy>;
} {
  return {
    async getCapturePolicy(input): Promise<ResolvedCapturePolicy> {
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

      return parsed.data.policy;
    },

    async updateCapturePolicy(input): Promise<ResolvedCapturePolicy> {
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

      return parsed.data.policy;
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

function formatPolicy(policy: ResolvedCapturePolicy): string {
  return [
    `preset: ${policy.preset}`,
    `capture_logs: ${policy.capture_logs}`,
    `capture_request_events: ${policy.capture_request_events}`,
    `capture_breadcrumbs: ${policy.capture_breadcrumbs}`,
    `capture_probe_events: ${policy.capture_probe_events}`
  ].join("\n");
}

export async function getCapturePolicyCommand(
  input: {
    bearerToken: string;
    projectId: string;
    json?: boolean;
  },
  api: {
    getCapturePolicy(input: { bearerToken: string; projectId: string }): Promise<ResolvedCapturePolicy>;
  }
): Promise<CliCommandResult> {
  try {
    const policy = await api.getCapturePolicy({
      bearerToken: input.bearerToken,
      projectId: input.projectId
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ policy }) : formatPolicy(policy)
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
    updateCapturePolicy(input: { bearerToken: string; projectId: string; update: CapturePolicyUpdate }): Promise<ResolvedCapturePolicy>;
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

    const policy = await api.updateCapturePolicy({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      update: parsedUpdate.data
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ policy }) : `Capture policy updated.\n${formatPolicy(policy)}`
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