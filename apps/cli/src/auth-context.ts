import {
  createRetrievalApi,
  type HttpClient as RetrievalHttpClient,
  type HttpResponse as RetrievalHttpResponse
} from "../../../packages/retrieval-client/src/index.js";
import {
  createTokenManagementApi,
  type HttpClient as TokenManagementHttpClient,
  type HttpResponse as TokenManagementHttpResponse
} from "../../../packages/token-management/src/index.js";
import {
  createAlertApi,
  type HttpClient as AlertHttpClient,
  type HttpResponse as AlertHttpResponse
} from "../../../packages/alert-client/src/index.js";
import {
  createWebhookApi,
  type HttpClient as WebhookHttpClient,
  type HttpResponse as WebhookHttpResponse
} from "../../../packages/webhook-client/src/index.js";
import {
  createWeeklyReportApi,
  type HttpClient as WeeklyReportHttpClient,
  type HttpResponse as WeeklyReportHttpResponse
} from "../../../packages/weekly-report-client/src/index.js";
import {
  createProjectManagementApi,
  type HttpClient as ProjectManagementHttpClient,
  type HttpResponse as ProjectManagementHttpResponse
} from "../../../packages/project-management-client/src/index.js";
import {
  createBillingApi,
  type HttpClient as BillingHttpClient,
  type HttpResponse as BillingHttpResponse
} from "../../../packages/billing-client/src/index.js";
import {
  createGitHubManagementApi,
  type HttpClient as GitHubManagementHttpClient,
  type HttpResponse as GitHubManagementHttpResponse
} from "../../../packages/github-client/src/index.js";

import { CliAuthStateError, readCliAuthState } from "./auth-state.js";
import type { CliAuthState } from "./auth-state.js";
import type { CliCommandResult } from "./token-commands.js";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

async function parseResponseBody(response: { text(): Promise<string> }): Promise<unknown> {
  const rawBody = await response.text();
  if (rawBody.length === 0) {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
}

export function createCliHttpClient(
  input: { baseUrl: string },
  dependencies?: { fetchImpl?: typeof fetch }
): RetrievalHttpClient &
  TokenManagementHttpClient &
  AlertHttpClient &
  WebhookHttpClient &
  WeeklyReportHttpClient &
  ProjectManagementHttpClient &
  BillingHttpClient &
  GitHubManagementHttpClient {
  const fetchImpl = dependencies?.fetchImpl ?? fetch;
  const baseUrl = normalizeBaseUrl(input.baseUrl);

  return {
    async request(
      request
    ): Promise<
      RetrievalHttpResponse &
        TokenManagementHttpResponse &
        AlertHttpResponse &
        WebhookHttpResponse &
        WeeklyReportHttpResponse &
        ProjectManagementHttpResponse &
        BillingHttpResponse &
        GitHubManagementHttpResponse
    > {
      const headers: Record<string, string> = {
        accept: "application/json",
        authorization: `Bearer ${request.bearerToken}`
      };

      const fetchInput: RequestInit = {
        method: request.method,
        headers
      };

      if ("body" in request && request.body !== undefined) {
        headers["content-type"] = "application/json";
        fetchInput.body = JSON.stringify(request.body);
      }

      const response = await fetchImpl(`${baseUrl}${request.path}`, fetchInput);

      return {
        status: response.status,
        body: await parseResponseBody(response)
      };
    }
  };
}

export function mapCliAuthErrorToResult(error: unknown): CliCommandResult | null {
  if (error instanceof CliAuthStateError) {
    return {
      exitCode: 2,
      output: error.message
    };
  }

  return null;
}

export async function runAuthenticatedCliCommand<TDependencies, TApi>(
  input: { authFilePath?: string },
  options: {
    createApi: (
      input: { authFilePath?: string },
      dependencies?: TDependencies
    ) => Promise<{ authState: CliAuthState; api: TApi }>;
    dependencies: TDependencies | undefined;
    runCommand: (authState: CliAuthState, api: TApi) => Promise<CliCommandResult>;
  }
): Promise<CliCommandResult> {
  try {
    const { authState, api } = await options.createApi(input, options.dependencies);
    return await options.runCommand(authState, api);
  } catch (error) {
    return mapCliAuthErrorToResult(error) ?? {
      exitCode: 1,
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function createAuthenticatedRetrievalApi(
  input: { authFilePath?: string },
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => RetrievalHttpClient;
    createApi?: typeof createRetrievalApi;
    fetchImpl?: typeof fetch;
  }
): Promise<{ authState: CliAuthState; api: ReturnType<typeof createRetrievalApi> }> {
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
  const httpClient = createHttpClient({
    baseUrl: authState.base_url
  });
  const createApi = dependencies?.createApi ?? createRetrievalApi;

  return {
    authState,
    api: createApi(httpClient)
  };
}

export async function createAuthenticatedTokenManagementApi(
  input: { authFilePath?: string },
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => TokenManagementHttpClient;
    createApi?: typeof createTokenManagementApi;
    fetchImpl?: typeof fetch;
  }
): Promise<{ authState: CliAuthState; api: ReturnType<typeof createTokenManagementApi> }> {
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
  const httpClient = createHttpClient({
    baseUrl: authState.base_url
  });
  const createApi = dependencies?.createApi ?? createTokenManagementApi;

  return {
    authState,
    api: createApi(httpClient)
  };
}

export async function createAuthenticatedAlertApi(
  input: { authFilePath?: string },
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => AlertHttpClient;
    createApi?: typeof createAlertApi;
    fetchImpl?: typeof fetch;
  }
): Promise<{ authState: CliAuthState; api: ReturnType<typeof createAlertApi> }> {
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
  const httpClient = createHttpClient({
    baseUrl: authState.base_url
  });
  const createApi = dependencies?.createApi ?? createAlertApi;

  return {
    authState,
    api: createApi(httpClient)
  };
}

export async function createAuthenticatedWebhookApi(
  input: { authFilePath?: string },
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => WebhookHttpClient;
    createApi?: typeof createWebhookApi;
    fetchImpl?: typeof fetch;
  }
): Promise<{ authState: CliAuthState; api: ReturnType<typeof createWebhookApi> }> {
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
  const httpClient = createHttpClient({
    baseUrl: authState.base_url
  });
  const createApi = dependencies?.createApi ?? createWebhookApi;

  return {
    authState,
    api: createApi(httpClient)
  };
}

export async function createAuthenticatedWeeklyReportApi(
  input: { authFilePath?: string },
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => WeeklyReportHttpClient;
    createApi?: typeof createWeeklyReportApi;
    fetchImpl?: typeof fetch;
  }
): Promise<{ authState: CliAuthState; api: ReturnType<typeof createWeeklyReportApi> }> {
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
  const httpClient = createHttpClient({
    baseUrl: authState.base_url
  });
  const createApi = dependencies?.createApi ?? createWeeklyReportApi;

  return {
    authState,
    api: createApi(httpClient)
  };
}

export async function createAuthenticatedProjectManagementApi(
  input: { authFilePath?: string },
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => ProjectManagementHttpClient;
    createApi?: typeof createProjectManagementApi;
    fetchImpl?: typeof fetch;
  }
): Promise<{ authState: CliAuthState; api: ReturnType<typeof createProjectManagementApi> }> {
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
  const httpClient = createHttpClient({
    baseUrl: authState.base_url
  });
  const createApi = dependencies?.createApi ?? createProjectManagementApi;

  return {
    authState,
    api: createApi(httpClient)
  };
}

export async function createAuthenticatedBillingApi(
  input: { authFilePath?: string },
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => BillingHttpClient;
    createApi?: typeof createBillingApi;
    fetchImpl?: typeof fetch;
  }
): Promise<{ authState: CliAuthState; api: ReturnType<typeof createBillingApi> }> {
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
  const httpClient = createHttpClient({
    baseUrl: authState.base_url
  });
  const createApi = dependencies?.createApi ?? createBillingApi;

  return {
    authState,
    api: createApi(httpClient)
  };
}

export async function createAuthenticatedGitHubManagementApi(
  input: { authFilePath?: string },
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => GitHubManagementHttpClient;
    createApi?: typeof createGitHubManagementApi;
    fetchImpl?: typeof fetch;
  }
): Promise<{ authState: CliAuthState; api: ReturnType<typeof createGitHubManagementApi> }> {
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
  const httpClient = createHttpClient({
    baseUrl: authState.base_url
  });
  const createApi = dependencies?.createApi ?? createGitHubManagementApi;

  return {
    authState,
    api: createApi(httpClient)
  };
}