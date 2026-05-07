import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState } from "./auth-state.js";
import type { CliAuthState } from "./auth-state.js";
import type { CliCommandResult } from "./token-commands.js";

type ProbeHttpRequest = {
  method: "GET" | "POST";
  path: string;
  bearerToken: string;
  body?: unknown;
};

type ProbeHttpResponse = {
  status: number;
  body: unknown;
};

export class ProbeApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  public constructor(status: number, code: string) {
    super(`probe_api_error: ${status}:${code}`);
    this.name = "ProbeApiError";
    this.status = status;
    this.code = code;
  }
}

function toApiError(status: number, body: unknown): ProbeApiError {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
    return new ProbeApiError(status, body.error);
  }

  return new ProbeApiError(status, "unknown_error");
}

interface ActivationLike {
  activation_id: string;
  label_pattern: string;
  service: string;
  environment: string;
  expires_at: string;
}

export function createProbeApi(httpClient: {
  request(request: ProbeHttpRequest): Promise<ProbeHttpResponse>;
}): {
  activateProbe(input: {
    bearerToken: string;
    projectId: string;
    labelPattern: string;
    service?: string;
    environment?: string;
    ttlSeconds?: number;
    triggerTtlSeconds?: number;
  }): Promise<{ activation: ActivationLike; trigger_token: string }>;
  listActiveProbes(input: {
    bearerToken: string;
    projectId: string;
  }): Promise<{ activations: ActivationLike[] }>;
  deactivateProbe(input: {
    bearerToken: string;
    projectId: string;
    activationId: string;
  }): Promise<{ deactivated: boolean }>;
} {
  return {
    async activateProbe(input) {
      const body: Record<string, unknown> = {
        label_pattern: input.labelPattern
      };
      if (input.service !== undefined) {
        body["service"] = input.service;
      }
      if (input.environment !== undefined) {
        body["environment"] = input.environment;
      }
      if (input.ttlSeconds !== undefined) {
        body["ttl_seconds"] = input.ttlSeconds;
      }
      if (input.triggerTtlSeconds !== undefined) {
        body["trigger_ttl_seconds"] = input.triggerTtlSeconds;
      }

      const response = await httpClient.request({
        method: "POST",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/probes/activate`,
        bearerToken: input.bearerToken,
        body
      });

      if (response.status !== 201) {
        throw toApiError(response.status, response.body);
      }

      return response.body as { activation: ActivationLike; trigger_token: string };
    },

    async listActiveProbes(input) {
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/probes`,
        bearerToken: input.bearerToken
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body);
      }

      return response.body as { activations: ActivationLike[] };
    },

    async deactivateProbe(input) {
      const response = await httpClient.request({
        method: "POST",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/probes/deactivate`,
        bearerToken: input.bearerToken,
        body: { activation_id: input.activationId }
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body);
      }

      return response.body as { deactivated: boolean };
    }
  };
}

function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof ProbeApiError)) {
    return 1;
  }

  if (error.status === 401) {
    return 2;
  }
  if (error.status === 403) {
    return 5;
  }
  if (error.status === 404) {
    return 3;
  }
  if (error.status === 400) {
    return 4;
  }
  if (error.status === 409) {
    return 5;
  }
  if (error.status === 429) {
    return 6;
  }

  return 1;
}

export async function activateProbeCommand(
  input: {
    bearerToken: string;
    projectId: string;
    labelPattern: string;
    service?: string;
    environment?: string;
    ttlSeconds?: number;
    triggerTtlSeconds?: number;
    json?: boolean;
  },
  api: {
    activateProbe(input: {
      bearerToken: string;
      projectId: string;
      labelPattern: string;
      service?: string;
      environment?: string;
      ttlSeconds?: number;
      triggerTtlSeconds?: number;
    }): Promise<{ activation: ActivationLike; trigger_token: string }>;
  }
): Promise<CliCommandResult> {
  try {
    const requestInput: {
      bearerToken: string;
      projectId: string;
      labelPattern: string;
      service?: string;
      environment?: string;
      ttlSeconds?: number;
      triggerTtlSeconds?: number;
    } = {
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      labelPattern: input.labelPattern
    };
    if (input.service !== undefined) {
      requestInput.service = input.service;
    }
    if (input.environment !== undefined) {
      requestInput.environment = input.environment;
    }
    if (input.ttlSeconds !== undefined) {
      requestInput.ttlSeconds = input.ttlSeconds;
    }
    if (input.triggerTtlSeconds !== undefined) {
      requestInput.triggerTtlSeconds = input.triggerTtlSeconds;
    }

    const result = await api.activateProbe(requestInput);

    if (input.json) {
      return { exitCode: 0, output: JSON.stringify(result) };
    }

    return {
      exitCode: 0,
      output: `Probe activated: ${result.activation.activation_id} (${result.activation.label_pattern})\nTrigger token: ${result.trigger_token}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function listActiveProbesCommand(
  input: {
    bearerToken: string;
    projectId: string;
    json?: boolean;
  },
  api: {
    listActiveProbes(input: {
      bearerToken: string;
      projectId: string;
    }): Promise<{ activations: ActivationLike[] }>;
  }
): Promise<CliCommandResult> {
  try {
    const result = await api.listActiveProbes({
      bearerToken: input.bearerToken,
      projectId: input.projectId
    });

    if (input.json) {
      return { exitCode: 0, output: JSON.stringify(result) };
    }

    if (result.activations.length === 0) {
      return { exitCode: 0, output: "No active probes." };
    }

    return {
      exitCode: 0,
      output: result.activations
        .map((a) => `${a.activation_id} ${a.label_pattern} (${a.service}/${a.environment}) expires ${a.expires_at}`)
        .join("\n")
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function deactivateProbeCommand(
  input: {
    bearerToken: string;
    projectId: string;
    activationId: string;
    json?: boolean;
  },
  api: {
    deactivateProbe(input: {
      bearerToken: string;
      projectId: string;
      activationId: string;
    }): Promise<{ deactivated: boolean }>;
  }
): Promise<CliCommandResult> {
  try {
    const result = await api.deactivateProbe({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      activationId: input.activationId
    });

    if (input.json) {
      return { exitCode: 0, output: JSON.stringify(result) };
    }

    return {
      exitCode: 0,
      output: result.deactivated ? "Probe deactivated." : "Probe was already inactive."
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

async function createAuthenticatedProbeApi(
  input: { authFilePath?: string },
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => { request(request: ProbeHttpRequest): Promise<ProbeHttpResponse> };
    createApi?: typeof createProbeApi;
  }
): Promise<{ authState: CliAuthState; api: ReturnType<typeof createProbeApi> }> {
  const readAuth = dependencies?.readAuthState ?? readCliAuthState;
  const authStateInput: { authFilePath?: string } = {};
  if (input.authFilePath !== undefined) {
    authStateInput.authFilePath = input.authFilePath;
  }

  const authState = await readAuth(authStateInput);
  const createHttpClient = dependencies?.createHttpClient ?? ((clientInput: { baseUrl: string }) => createCliHttpClient(clientInput));
  const httpClient = createHttpClient({ baseUrl: authState.base_url });
  const createApi = dependencies?.createApi ?? createProbeApi;

  return { authState, api: createApi(httpClient) };
}

export async function activateProbeWithAuthCommand(
  input: {
    authFilePath?: string;
    projectId: string;
    labelPattern: string;
    service?: string;
    environment?: string;
    ttlSeconds?: number;
    triggerTtlSeconds?: number;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedProbeApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedProbeApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: typeof input & { bearerToken: string } = {
        ...input,
        bearerToken: authState.bearer_token
      };
      return activateProbeCommand(commandInput, { activateProbe: (ri) => api.activateProbe(ri) });
    }
  });
}

export async function listActiveProbesWithAuthCommand(
  input: {
    authFilePath?: string;
    projectId: string;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedProbeApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedProbeApi,
    dependencies,
    runCommand: (authState, api) =>
      listActiveProbesCommand(
        { bearerToken: authState.bearer_token, projectId: input.projectId, ...(input.json === undefined ? {} : { json: input.json }) },
        { listActiveProbes: (ri) => api.listActiveProbes(ri) }
      )
  });
}

export async function deactivateProbeWithAuthCommand(
  input: {
    authFilePath?: string;
    projectId: string;
    activationId: string;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedProbeApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedProbeApi,
    dependencies,
    runCommand: (authState, api) =>
      deactivateProbeCommand(
        { bearerToken: authState.bearer_token, projectId: input.projectId, activationId: input.activationId, ...(input.json === undefined ? {} : { json: input.json }) },
        { deactivateProbe: (ri) => api.deactivateProbe(ri) }
      )
  });
}
