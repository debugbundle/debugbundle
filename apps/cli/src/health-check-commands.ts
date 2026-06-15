import { createCliHttpClient, runAuthenticatedCliCommand } from "./auth-context.js";
import { readCliAuthState } from "./auth-state.js";
import type { CliAuthState } from "./auth-state.js";
import type {
  AvailabilityCheckDailyRollupRecord,
  AvailabilityCheckLimits,
  AvailabilityCheckMethod,
  AvailabilityCheckRecord,
  AvailabilityCheckResultRecord,
  AvailabilityCheckTestResult,
  CreateHealthCheckInput,
  HealthCheckHttpRequest,
  HealthCheckHttpResponse,
  TestHealthCheckInput,
  UpdateHealthCheckInput
} from "./health-check-command-types.js";
import type { CliCommandResult } from "./token-commands.js";

export class HealthCheckApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  public constructor(status: number, code: string) {
    super(`health_check_api_error: ${status}:${code}`);
    this.name = "HealthCheckApiError";
    this.status = status;
    this.code = code;
  }
}

function toApiError(status: number, body: unknown): HealthCheckApiError {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
    return new HealthCheckApiError(status, body.error);
  }

  return new HealthCheckApiError(status, "unknown_error");
}

function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof HealthCheckApiError)) {
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
  if (error.status === 403 || error.status === 409) {
    return 5;
  }
  if (error.status === 429) {
    return 6;
  }

  return 1;
}

function buildCreateRequestBody(input: CreateHealthCheckInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: input.name,
    url: input.url,
    method: input.method,
    expected_status_min: input.expectedStatusMin,
    expected_status_max: input.expectedStatusMax,
    timeout_ms: input.timeoutMs,
    interval_seconds: input.intervalSeconds,
    failure_threshold: input.failureThreshold,
    recovery_threshold: input.recoveryThreshold,
    enabled: input.enabled
  };

  if (input.environment !== undefined) {
    body["environment"] = input.environment;
  }
  if (input.serviceName !== undefined) {
    body["service_name"] = input.serviceName;
  }

  return body;
}

function buildUpdateRequestBody(input: UpdateHealthCheckInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (input.name !== undefined) {
    body["name"] = input.name;
  }
  if (input.url !== undefined) {
    body["url"] = input.url;
  }
  if (input.method !== undefined) {
    body["method"] = input.method;
  }
  if (input.expectedStatusMin !== undefined) {
    body["expected_status_min"] = input.expectedStatusMin;
  }
  if (input.expectedStatusMax !== undefined) {
    body["expected_status_max"] = input.expectedStatusMax;
  }
  if (input.timeoutMs !== undefined) {
    body["timeout_ms"] = input.timeoutMs;
  }
  if (input.intervalSeconds !== undefined) {
    body["interval_seconds"] = input.intervalSeconds;
  }
  if (input.failureThreshold !== undefined) {
    body["failure_threshold"] = input.failureThreshold;
  }
  if (input.recoveryThreshold !== undefined) {
    body["recovery_threshold"] = input.recoveryThreshold;
  }
  if (input.environment !== undefined) {
    body["environment"] = input.environment;
  }
  if (input.serviceName !== undefined) {
    body["service_name"] = input.serviceName;
  }
  if (input.enabled !== undefined) {
    body["enabled"] = input.enabled;
  }

  return body;
}

export function createHealthCheckApi(httpClient: {
  request(request: HealthCheckHttpRequest): Promise<HealthCheckHttpResponse>;
}): {
  listHealthChecks(input: {
    bearerToken: string;
    projectId: string;
    limit?: number;
  }): Promise<{ checks: AvailabilityCheckRecord[]; limits: AvailabilityCheckLimits }>;
  getHealthCheck(input: {
    bearerToken: string;
    projectId: string;
    checkId: string;
  }): Promise<{ check: AvailabilityCheckRecord; limits: AvailabilityCheckLimits }>;
  createHealthCheck(input: CreateHealthCheckInput): Promise<{ check: AvailabilityCheckRecord }>;
  updateHealthCheck(input: UpdateHealthCheckInput): Promise<{ check: AvailabilityCheckRecord }>;
  deleteHealthCheck(input: {
    bearerToken: string;
    projectId: string;
    checkId: string;
  }): Promise<{ deleted: boolean }>;
  testHealthCheck(input: TestHealthCheckInput): Promise<AvailabilityCheckTestResult>;
  listHealthCheckResults(input: {
    bearerToken: string;
    projectId: string;
    checkId: string;
    limit?: number;
  }): Promise<{ results: AvailabilityCheckResultRecord[] }>;
  listHealthCheckDailyRollups(input: {
    bearerToken: string;
    projectId: string;
    checkId: string;
    limit?: number;
  }): Promise<{ rollups: AvailabilityCheckDailyRollupRecord[] }>;
} {
  return {
    async listHealthChecks(input) {
      const limit = input.limit ?? 100;
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/availability-checks?limit=${encodeURIComponent(String(limit))}`,
        bearerToken: input.bearerToken
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body);
      }

      return response.body as { checks: AvailabilityCheckRecord[]; limits: AvailabilityCheckLimits };
    },

    async getHealthCheck(input) {
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/availability-checks/${encodeURIComponent(input.checkId)}`,
        bearerToken: input.bearerToken
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body);
      }

      return response.body as { check: AvailabilityCheckRecord; limits: AvailabilityCheckLimits };
    },

    async createHealthCheck(input) {
      const response = await httpClient.request({
        method: "POST",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/availability-checks`,
        bearerToken: input.bearerToken,
        body: buildCreateRequestBody(input)
      });

      if (response.status !== 201) {
        throw toApiError(response.status, response.body);
      }

      return response.body as { check: AvailabilityCheckRecord };
    },

    async updateHealthCheck(input) {
      const response = await httpClient.request({
        method: "PATCH",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/availability-checks/${encodeURIComponent(input.checkId)}`,
        bearerToken: input.bearerToken,
        body: buildUpdateRequestBody(input)
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body);
      }

      return response.body as { check: AvailabilityCheckRecord };
    },

    async deleteHealthCheck(input) {
      const response = await httpClient.request({
        method: "DELETE",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/availability-checks/${encodeURIComponent(input.checkId)}`,
        bearerToken: input.bearerToken
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body);
      }

      return response.body as { deleted: boolean };
    },

    async testHealthCheck(input) {
      const response = await httpClient.request({
        method: "POST",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/availability-checks/test`,
        bearerToken: input.bearerToken,
        body: {
          url: input.url,
          method: input.method,
          expected_status_min: input.expectedStatusMin,
          expected_status_max: input.expectedStatusMax,
          timeout_ms: input.timeoutMs
        }
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body);
      }

      return response.body as AvailabilityCheckTestResult;
    },

    async listHealthCheckResults(input) {
      const limit = input.limit ?? 20;
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/availability-checks/${encodeURIComponent(input.checkId)}/results?limit=${encodeURIComponent(String(limit))}`,
        bearerToken: input.bearerToken
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body);
      }

      return response.body as { results: AvailabilityCheckResultRecord[] };
    },

    async listHealthCheckDailyRollups(input) {
      const limit = input.limit ?? 30;
      const response = await httpClient.request({
        method: "GET",
        path: `/v1/projects/${encodeURIComponent(input.projectId)}/availability-checks/${encodeURIComponent(input.checkId)}/daily-rollups?limit=${encodeURIComponent(String(limit))}`,
        bearerToken: input.bearerToken
      });

      if (response.status !== 200) {
        throw toApiError(response.status, response.body);
      }

      return response.body as { rollups: AvailabilityCheckDailyRollupRecord[] };
    }
  };
}

function formatServiceAndEnvironment(check: { service_name: string | null; environment: string }): string {
  return `${check.service_name ?? "availability"}/${check.environment}`;
}

function formatNullable(value: string | number | null): string {
  return value === null ? "-" : String(value);
}

function formatCheckSummary(check: AvailabilityCheckRecord): string {
  const lastResult =
    check.last_result_status === null
      ? "no checks yet"
      : `${check.last_result_status}${check.last_result_http_status === null ? "" : ` ${check.last_result_http_status}`}`;

  return [
    `${check.check_id} ${check.name} [${check.status}]`,
    `${check.method} ${check.url}`,
    `interval=${check.interval_seconds}s timeout=${check.timeout_ms}ms expected=${check.expected_status_min}-${check.expected_status_max}`,
    `service=${formatServiceAndEnvironment(check)} enabled=${check.enabled ? "true" : "false"} last=${lastResult}`
  ].join("\n");
}

function formatCheckResultSummary(result: AvailabilityCheckResultRecord): string {
  return [
    `${result.started_at} ${result.status}`,
    `http=${formatNullable(result.http_status)} duration=${result.duration_ms}ms redirects=${result.redirect_count}`,
    `host=${result.checked_url_host} final=${result.final_url}`
  ].join(" ");
}

function formatCheckDailyRollupSummary(rollup: AvailabilityCheckDailyRollupRecord): string {
  return [
    `${rollup.day} ${rollup.state}`,
    `checks=${rollup.total_checks}`,
    `success=${rollup.successful_checks}`,
    `failed=${rollup.failed_checks}`,
    `degraded=${rollup.degraded_checks}`,
    `avg=${formatNullable(rollup.avg_duration_ms)}ms`,
    `downtime=${rollup.downtime_seconds}s`
  ].join(" ");
}

function formatTestResult(result: AvailabilityCheckTestResult): string {
  return [
    `Test result: ${result.result.status}`,
    `http=${formatNullable(result.result.http_status)}`,
    `duration=${result.result.duration_ms}ms`,
    `host=${result.result.checked_url_host}`,
    `final=${result.result.final_url}`
  ].join(" ");
}

export async function listHealthChecksCommand(
  input: {
    bearerToken: string;
    projectId: string;
    limit?: number;
    json?: boolean;
  },
  api: {
    listHealthChecks(input: {
      bearerToken: string;
      projectId: string;
      limit?: number;
    }): Promise<{ checks: AvailabilityCheckRecord[]; limits: AvailabilityCheckLimits }>;
  }
): Promise<CliCommandResult> {
  try {
    const result = await api.listHealthChecks({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      ...(input.limit === undefined ? {} : { limit: input.limit })
    });

    if (input.json) {
      return { exitCode: 0, output: JSON.stringify(result) };
    }

    if (result.checks.length === 0) {
      return {
        exitCode: 0,
        output: `No health checks.\nPlan limits: ${result.limits.max_checks_per_project} checks, minimum interval ${result.limits.min_interval_seconds}s.`
      };
    }

    return {
      exitCode: 0,
      output: result.checks.map(formatCheckSummary).join("\n\n")
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function getHealthCheckCommand(
  input: {
    bearerToken: string;
    projectId: string;
    checkId: string;
    json?: boolean;
  },
  api: {
    getHealthCheck(input: {
      bearerToken: string;
      projectId: string;
      checkId: string;
    }): Promise<{ check: AvailabilityCheckRecord; limits: AvailabilityCheckLimits }>;
  }
): Promise<CliCommandResult> {
  try {
    const result = await api.getHealthCheck({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      checkId: input.checkId
    });

    if (input.json) {
      return { exitCode: 0, output: JSON.stringify(result) };
    }

    return {
      exitCode: 0,
      output: `${formatCheckSummary(result.check)}\nlimits=${result.limits.max_checks_per_project} min_interval=${result.limits.min_interval_seconds}s`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function createHealthCheckCommand(
  input: CreateHealthCheckInput,
  api: {
    createHealthCheck(input: CreateHealthCheckInput): Promise<{ check: AvailabilityCheckRecord }>;
  }
): Promise<CliCommandResult> {
  try {
    const result = await api.createHealthCheck(input);

    if (input.json) {
      return { exitCode: 0, output: JSON.stringify(result) };
    }

    return {
      exitCode: 0,
      output: `Health check created: ${result.check.check_id} (${result.check.name})`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateHealthCheckCommand(
  input: UpdateHealthCheckInput,
  api: {
    updateHealthCheck(input: UpdateHealthCheckInput): Promise<{ check: AvailabilityCheckRecord }>;
  }
): Promise<CliCommandResult> {
  try {
    const result = await api.updateHealthCheck(input);

    if (input.json) {
      return { exitCode: 0, output: JSON.stringify(result) };
    }

    return {
      exitCode: 0,
      output: `Health check updated: ${result.check.check_id} (${result.check.name})`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteHealthCheckCommand(
  input: {
    bearerToken: string;
    projectId: string;
    checkId: string;
    json?: boolean;
  },
  api: {
    deleteHealthCheck(input: {
      bearerToken: string;
      projectId: string;
      checkId: string;
    }): Promise<{ deleted: boolean }>;
  }
): Promise<CliCommandResult> {
  try {
    const result = await api.deleteHealthCheck({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      checkId: input.checkId
    });

    if (input.json) {
      return { exitCode: 0, output: JSON.stringify(result) };
    }

    return {
      exitCode: 0,
      output: result.deleted ? "Health check deleted." : "Health check was already deleted."
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function testHealthCheckCommand(
  input: TestHealthCheckInput,
  api: {
    testHealthCheck(input: TestHealthCheckInput): Promise<AvailabilityCheckTestResult>;
  }
): Promise<CliCommandResult> {
  try {
    const result = await api.testHealthCheck(input);

    if (input.json) {
      return { exitCode: 0, output: JSON.stringify(result) };
    }

    return {
      exitCode: 0,
      output: formatTestResult(result)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function listHealthCheckResultsCommand(
  input: {
    bearerToken: string;
    projectId: string;
    checkId: string;
    limit?: number;
    json?: boolean;
  },
  api: {
    listHealthCheckResults(input: {
      bearerToken: string;
      projectId: string;
      checkId: string;
      limit?: number;
    }): Promise<{ results: AvailabilityCheckResultRecord[] }>;
  }
): Promise<CliCommandResult> {
  try {
    const result = await api.listHealthCheckResults({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      checkId: input.checkId,
      ...(input.limit === undefined ? {} : { limit: input.limit })
    });

    if (input.json) {
      return { exitCode: 0, output: JSON.stringify(result) };
    }

    if (result.results.length === 0) {
      return { exitCode: 0, output: "No health check results." };
    }

    return {
      exitCode: 0,
      output: result.results.map(formatCheckResultSummary).join("\n")
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function listHealthCheckDailyRollupsCommand(
  input: {
    bearerToken: string;
    projectId: string;
    checkId: string;
    limit?: number;
    json?: boolean;
  },
  api: {
    listHealthCheckDailyRollups(input: {
      bearerToken: string;
      projectId: string;
      checkId: string;
      limit?: number;
    }): Promise<{ rollups: AvailabilityCheckDailyRollupRecord[] }>;
  }
): Promise<CliCommandResult> {
  try {
    const result = await api.listHealthCheckDailyRollups({
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      checkId: input.checkId,
      ...(input.limit === undefined ? {} : { limit: input.limit })
    });

    if (input.json) {
      return { exitCode: 0, output: JSON.stringify(result) };
    }

    if (result.rollups.length === 0) {
      return { exitCode: 0, output: "No health check daily rollups." };
    }

    return {
      exitCode: 0,
      output: result.rollups.map(formatCheckDailyRollupSummary).join("\n")
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

async function createAuthenticatedHealthCheckApi(
  input: { authFilePath?: string },
  dependencies?: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => {
      request(request: HealthCheckHttpRequest): Promise<HealthCheckHttpResponse>;
    };
    createApi?: typeof createHealthCheckApi;
  }
): Promise<{ authState: CliAuthState; api: ReturnType<typeof createHealthCheckApi> }> {
  const readAuth = dependencies?.readAuthState ?? readCliAuthState;
  const authStateInput: { authFilePath?: string } = {};
  if (input.authFilePath !== undefined) {
    authStateInput.authFilePath = input.authFilePath;
  }

  const authState = await readAuth(authStateInput);
  const createHttpClient =
    dependencies?.createHttpClient ?? ((clientInput: { baseUrl: string }) => createCliHttpClient(clientInput));
  const httpClient = createHttpClient({ baseUrl: authState.base_url });
  const createApi = dependencies?.createApi ?? createHealthCheckApi;

  return { authState, api: createApi(httpClient) };
}

export async function listHealthChecksWithAuthCommand(
  input: {
    authFilePath?: string;
    projectId: string;
    limit?: number;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedHealthCheckApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedHealthCheckApi,
    dependencies,
    runCommand: (authState, api) =>
      listHealthChecksCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          ...(input.limit === undefined ? {} : { limit: input.limit }),
          ...(input.json === undefined ? {} : { json: input.json })
        },
        { listHealthChecks: (requestInput) => api.listHealthChecks(requestInput) }
      )
  });
}

export async function getHealthCheckWithAuthCommand(
  input: {
    authFilePath?: string;
    projectId: string;
    checkId: string;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedHealthCheckApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedHealthCheckApi,
    dependencies,
    runCommand: (authState, api) =>
      getHealthCheckCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          checkId: input.checkId,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        { getHealthCheck: (requestInput) => api.getHealthCheck(requestInput) }
      )
  });
}

export async function createHealthCheckWithAuthCommand(
  input: {
    authFilePath?: string;
    projectId: string;
    name: string;
    url: string;
    method: AvailabilityCheckMethod;
    expectedStatusMin: number;
    expectedStatusMax: number;
    timeoutMs: number;
    intervalSeconds: number;
    failureThreshold: number;
    recoveryThreshold: number;
    environment?: string;
    serviceName?: string | null;
    enabled: boolean;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedHealthCheckApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedHealthCheckApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: CreateHealthCheckInput = {
        ...input,
        bearerToken: authState.bearer_token
      };
      return createHealthCheckCommand(commandInput, {
        createHealthCheck: (requestInput) => api.createHealthCheck(requestInput)
      });
    }
  });
}

export async function updateHealthCheckWithAuthCommand(
  input: {
    authFilePath?: string;
    projectId: string;
    checkId: string;
    name?: string;
    url?: string;
    method?: AvailabilityCheckMethod;
    expectedStatusMin?: number;
    expectedStatusMax?: number;
    timeoutMs?: number;
    intervalSeconds?: number;
    failureThreshold?: number;
    recoveryThreshold?: number;
    environment?: string;
    serviceName?: string | null;
    enabled?: boolean;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedHealthCheckApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedHealthCheckApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: UpdateHealthCheckInput = {
        ...input,
        bearerToken: authState.bearer_token
      };
      return updateHealthCheckCommand(commandInput, {
        updateHealthCheck: (requestInput) => api.updateHealthCheck(requestInput)
      });
    }
  });
}

export async function deleteHealthCheckWithAuthCommand(
  input: {
    authFilePath?: string;
    projectId: string;
    checkId: string;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedHealthCheckApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedHealthCheckApi,
    dependencies,
    runCommand: (authState, api) =>
      deleteHealthCheckCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          checkId: input.checkId,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        { deleteHealthCheck: (requestInput) => api.deleteHealthCheck(requestInput) }
      )
  });
}

export async function testHealthCheckWithAuthCommand(
  input: {
    authFilePath?: string;
    projectId: string;
    url: string;
    method: AvailabilityCheckMethod;
    expectedStatusMin: number;
    expectedStatusMax: number;
    timeoutMs: number;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedHealthCheckApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedHealthCheckApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: TestHealthCheckInput = {
        ...input,
        bearerToken: authState.bearer_token
      };
      return testHealthCheckCommand(commandInput, {
        testHealthCheck: (requestInput) => api.testHealthCheck(requestInput)
      });
    }
  });
}

export async function listHealthCheckResultsWithAuthCommand(
  input: {
    authFilePath?: string;
    projectId: string;
    checkId: string;
    limit?: number;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedHealthCheckApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedHealthCheckApi,
    dependencies,
    runCommand: (authState, api) =>
      listHealthCheckResultsCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          checkId: input.checkId,
          ...(input.limit === undefined ? {} : { limit: input.limit }),
          ...(input.json === undefined ? {} : { json: input.json })
        },
        { listHealthCheckResults: (requestInput) => api.listHealthCheckResults(requestInput) }
      )
  });
}

export async function listHealthCheckDailyRollupsWithAuthCommand(
  input: {
    authFilePath?: string;
    projectId: string;
    checkId: string;
    limit?: number;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedHealthCheckApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedHealthCheckApi,
    dependencies,
    runCommand: (authState, api) =>
      listHealthCheckDailyRollupsCommand(
        {
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          checkId: input.checkId,
          ...(input.limit === undefined ? {} : { limit: input.limit }),
          ...(input.json === undefined ? {} : { json: input.json })
        },
        { listHealthCheckDailyRollups: (requestInput) => api.listHealthCheckDailyRollups(requestInput) }
      )
  });
}
