import {
  AnalyticsSavedFunnelCreateSchema,
  AnalyticsSavedFunnelResponseSchema,
  AnalyticsSavedFunnelsResponseSchema,
  AnalyticsSavedFunnelUpdateSchema,
  type AnalyticsSavedFunnel,
  type AnalyticsSavedFunnelCreate,
  type AnalyticsSavedFunnelUpdate,
  type AnalyticsSavedFunnelsResponse
} from "../../../packages/shared-types/src/index.js";
import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState, type CliAuthState } from "./auth-state.js";
import type { CliCommandResult } from "./token-commands.js";

type SavedFunnelHttpRequest = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  bearerToken: string;
  body?: unknown;
};

type SavedFunnelHttpResponse = { status: number; body: unknown };
type SavedFunnelHttpClient = {
  request(request: SavedFunnelHttpRequest): Promise<SavedFunnelHttpResponse>;
};

export type AnalyticsSavedFunnelApi = {
  list(input: { bearerToken: string; projectId: string }): Promise<AnalyticsSavedFunnelsResponse>;
  create(input: {
    bearerToken: string;
    projectId: string;
    definition: AnalyticsSavedFunnelCreate;
  }): Promise<AnalyticsSavedFunnel>;
  update(input: {
    bearerToken: string;
    projectId: string;
    funnelKey: string;
    update: AnalyticsSavedFunnelUpdate;
  }): Promise<AnalyticsSavedFunnel>;
  archive(input: {
    bearerToken: string;
    projectId: string;
    funnelKey: string;
  }): Promise<AnalyticsSavedFunnel>;
};

export class AnalyticsSavedFunnelApiError extends Error {
  public constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "AnalyticsSavedFunnelApiError";
  }
}

function toApiError(status: number, body: unknown, fallback: string): AnalyticsSavedFunnelApiError {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return new AnalyticsSavedFunnelApiError(status, body.error);
  }
  return new AnalyticsSavedFunnelApiError(status, fallback);
}

export function createAnalyticsSavedFunnelApi(
  httpClient: SavedFunnelHttpClient
): AnalyticsSavedFunnelApi {
  return {
    async list(input: {
      bearerToken: string;
      projectId: string;
    }): Promise<AnalyticsSavedFunnelsResponse> {
      const response = await httpClient.request({
        method: "GET",
        path: buildCollectionPath(input.projectId),
        bearerToken: input.bearerToken
      });
      if (response.status !== 200) {
        throw toApiError(response.status, response.body, "Failed to list saved analytics funnels.");
      }
      const parsed = AnalyticsSavedFunnelsResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new AnalyticsSavedFunnelApiError(
          500,
          "Invalid saved analytics funnel list response."
        );
      }
      return parsed.data;
    },

    async create(input: {
      bearerToken: string;
      projectId: string;
      definition: AnalyticsSavedFunnelCreate;
    }): Promise<AnalyticsSavedFunnel> {
      const response = await httpClient.request({
        method: "POST",
        path: buildCollectionPath(input.projectId),
        bearerToken: input.bearerToken,
        body: input.definition
      });
      return parseMutationResponse(response, 201, "Failed to create saved analytics funnel.");
    },

    async update(input: {
      bearerToken: string;
      projectId: string;
      funnelKey: string;
      update: AnalyticsSavedFunnelUpdate;
    }): Promise<AnalyticsSavedFunnel> {
      const response = await httpClient.request({
        method: "PATCH",
        path: buildItemPath(input.projectId, input.funnelKey),
        bearerToken: input.bearerToken,
        body: input.update
      });
      return parseMutationResponse(response, 200, "Failed to update saved analytics funnel.");
    },

    async archive(input: {
      bearerToken: string;
      projectId: string;
      funnelKey: string;
    }): Promise<AnalyticsSavedFunnel> {
      const response = await httpClient.request({
        method: "DELETE",
        path: buildItemPath(input.projectId, input.funnelKey),
        bearerToken: input.bearerToken
      });
      return parseMutationResponse(response, 200, "Failed to archive saved analytics funnel.");
    }
  };
}

function buildCollectionPath(projectId: string): string {
  return `/v1/projects/${encodeURIComponent(projectId)}/analytics/saved-funnels`;
}

function buildItemPath(projectId: string, funnelKey: string): string {
  return `${buildCollectionPath(projectId)}/${encodeURIComponent(funnelKey)}`;
}

function parseMutationResponse(
  response: SavedFunnelHttpResponse,
  expectedStatus: number,
  fallback: string
): AnalyticsSavedFunnel {
  if (response.status !== expectedStatus)
    throw toApiError(response.status, response.body, fallback);
  const parsed = AnalyticsSavedFunnelResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new AnalyticsSavedFunnelApiError(500, "Invalid saved analytics funnel response.");
  }
  return parsed.data.funnel;
}

function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof AnalyticsSavedFunnelApiError)) return 1;
  if (error.status === 401) return 2;
  if (error.status === 404) return 3;
  if (error.status === 400 || error.status === 403 || error.status === 409) return 4;
  return 1;
}

function formatFunnel(funnel: AnalyticsSavedFunnel): string {
  return [
    `funnel_key: ${funnel.funnel_key}`,
    `display_name: ${funnel.display_name}`,
    `steps: ${funnel.steps.length}`,
    `archived: ${funnel.archived_at !== null}`
  ].join("\n");
}

async function runSavedFunnelCommand<T>(
  operation: () => Promise<T>,
  format: (value: T) => string,
  json?: boolean
): Promise<CliCommandResult> {
  try {
    const value = await operation();
    return { exitCode: 0, output: json ? JSON.stringify(value) : format(value) };
  } catch (error) {
    return {
      exitCode: mapErrorToExitCode(error),
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export function listAnalyticsSavedFunnelsCommand(
  input: { bearerToken: string; projectId: string; json?: boolean },
  api: Pick<AnalyticsSavedFunnelApi, "list">
): Promise<CliCommandResult> {
  return runSavedFunnelCommand(
    () => api.list(input),
    (response) =>
      response.funnels.length === 0
        ? "No saved analytics funnels."
        : response.funnels.map(formatFunnel).join("\n\n"),
    input.json
  );
}

export function createAnalyticsSavedFunnelCommand(
  input: {
    bearerToken: string;
    projectId: string;
    definition: AnalyticsSavedFunnelCreate;
    json?: boolean;
  },
  api: Pick<AnalyticsSavedFunnelApi, "create">
): Promise<CliCommandResult> {
  const definition = AnalyticsSavedFunnelCreateSchema.safeParse(input.definition);
  if (!definition.success)
    return Promise.resolve({ exitCode: 4, output: "Invalid saved funnel definition." });
  return runSavedFunnelCommand(
    () => api.create({ ...input, definition: definition.data }),
    (funnel) => `Saved analytics funnel created.\n${formatFunnel(funnel)}`,
    input.json
  );
}

export function updateAnalyticsSavedFunnelCommand(
  input: {
    bearerToken: string;
    projectId: string;
    funnelKey: string;
    update: AnalyticsSavedFunnelUpdate;
    json?: boolean;
  },
  api: Pick<AnalyticsSavedFunnelApi, "update">
): Promise<CliCommandResult> {
  const update = AnalyticsSavedFunnelUpdateSchema.safeParse(input.update);
  if (!update.success)
    return Promise.resolve({ exitCode: 4, output: "Invalid saved funnel update." });
  return runSavedFunnelCommand(
    () => api.update({ ...input, update: update.data }),
    (funnel) => `Saved analytics funnel updated.\n${formatFunnel(funnel)}`,
    input.json
  );
}

export function archiveAnalyticsSavedFunnelCommand(
  input: { bearerToken: string; projectId: string; funnelKey: string; json?: boolean },
  api: Pick<AnalyticsSavedFunnelApi, "archive">
): Promise<CliCommandResult> {
  return runSavedFunnelCommand(
    () => api.archive(input),
    (funnel) => `Saved analytics funnel archived.\n${formatFunnel(funnel)}`,
    input.json
  );
}

type AuthDependencies = {
  readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
  createHttpClient?: (input: { baseUrl: string }) => SavedFunnelHttpClient;
  createApi?: typeof createAnalyticsSavedFunnelApi;
  fetchImpl?: typeof fetch;
};

async function createAuthenticatedApi(
  input: { authFilePath?: string },
  dependencies?: AuthDependencies
): Promise<{ authState: CliAuthState; api: AnalyticsSavedFunnelApi }> {
  const authInput = input.authFilePath === undefined ? {} : { authFilePath: input.authFilePath };
  const authState = await (dependencies?.readAuthState ?? readCliAuthState)(authInput);
  const httpClient =
    dependencies?.createHttpClient?.({ baseUrl: authState.base_url }) ??
    createCliHttpClient(
      { baseUrl: authState.base_url },
      dependencies?.fetchImpl === undefined ? {} : { fetchImpl: dependencies.fetchImpl }
    );
  return {
    authState,
    api: (dependencies?.createApi ?? createAnalyticsSavedFunnelApi)(httpClient)
  };
}

type WithAuthInput = { authFilePath?: string; projectId: string; json?: boolean };

function runWithAuth<T extends WithAuthInput>(
  input: T,
  runCommand: (
    input: T & { bearerToken: string },
    api: AnalyticsSavedFunnelApi
  ) => Promise<CliCommandResult>,
  dependencies?: AuthDependencies
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedApi,
    dependencies,
    runCommand: (authState, api) =>
      runCommand({ ...input, bearerToken: authState.bearer_token }, api)
  });
}

export function listAnalyticsSavedFunnelsWithAuthCommand(
  input: WithAuthInput,
  dependencies?: AuthDependencies
): Promise<CliCommandResult> {
  return runWithAuth(input, listAnalyticsSavedFunnelsCommand, dependencies);
}

export function createAnalyticsSavedFunnelWithAuthCommand(
  input: WithAuthInput & { definition: AnalyticsSavedFunnelCreate },
  dependencies?: AuthDependencies
): Promise<CliCommandResult> {
  return runWithAuth(input, createAnalyticsSavedFunnelCommand, dependencies);
}

export function updateAnalyticsSavedFunnelWithAuthCommand(
  input: WithAuthInput & { funnelKey: string; update: AnalyticsSavedFunnelUpdate },
  dependencies?: AuthDependencies
): Promise<CliCommandResult> {
  return runWithAuth(input, updateAnalyticsSavedFunnelCommand, dependencies);
}

export function archiveAnalyticsSavedFunnelWithAuthCommand(
  input: WithAuthInput & { funnelKey: string },
  dependencies?: AuthDependencies
): Promise<CliCommandResult> {
  return runWithAuth(input, archiveAnalyticsSavedFunnelCommand, dependencies);
}
