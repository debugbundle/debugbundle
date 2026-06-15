import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import type {
  HealthCheckHttpRequest,
  HealthCheckHttpResponse
} from "../../../apps/cli/src/health-check-command-types.js";
import {
  HealthCheckApiError,
  createHealthCheckApi,
  createHealthCheckCommand,
  createHealthCheckWithAuthCommand,
  deleteHealthCheckCommand,
  deleteHealthCheckWithAuthCommand,
  getHealthCheckCommand,
  getHealthCheckWithAuthCommand,
  listHealthCheckDailyRollupsWithAuthCommand,
  listHealthCheckDailyRollupsCommand,
  listHealthCheckResultsWithAuthCommand,
  listHealthCheckResultsCommand,
  listHealthChecksWithAuthCommand,
  listHealthChecksCommand,
  testHealthCheckCommand,
  testHealthCheckWithAuthCommand,
  updateHealthCheckWithAuthCommand,
  updateHealthCheckCommand
} from "../../../apps/cli/src/health-check-commands.js";

const checkFixture = {
  check_id: "chk_1",
  project_id: "proj_1",
  name: "Primary app",
  url: "https://app.example.com/health",
  method: "GET" as const,
  expected_status_min: 200,
  expected_status_max: 399,
  timeout_ms: 5000,
  interval_seconds: 60,
  failure_threshold: 3,
  recovery_threshold: 2,
  environment: "production",
  service_name: "web",
  enabled: true,
  status: "passing" as const,
  paused_reason: null,
  organization_plan: "solo" as const,
  consecutive_failures: 0,
  consecutive_successes: 12,
  linked_incident_id: null,
  last_checked_at: "2026-06-15T10:00:00.000Z",
  next_check_at: "2026-06-15T10:01:00.000Z",
  last_result_status: "success" as const,
  last_result_http_status: 200,
  last_result_error_kind: null,
  last_result_error_message: null,
  last_result_duration_ms: 180,
  created_at: "2026-06-15T09:00:00.000Z",
  updated_at: "2026-06-15T10:00:00.000Z"
};

const resultFixture = {
  result_id: "res_1",
  check_id: "chk_1",
  project_id: "proj_1",
  started_at: "2026-06-15T10:00:00.000Z",
  completed_at: "2026-06-15T10:00:00.180Z",
  duration_ms: 180,
  status: "success" as const,
  http_status: 200,
  error_kind: null,
  error_message: null,
  redirect_count: 0,
  checked_url_host: "app.example.com",
  final_url: "https://app.example.com/health"
};

const dailyRollupFixture = {
  rollup_id: "roll_1",
  check_id: "chk_1",
  project_id: "proj_1",
  day: "2026-06-15",
  state: "passing" as const,
  total_checks: 1440,
  successful_checks: 1438,
  failed_checks: 2,
  degraded_checks: 0,
  avg_duration_ms: 185,
  p95_duration_ms: 260,
  downtime_seconds: 60,
  incident_ids: [],
  created_at: "2026-06-15T00:00:00.000Z",
  updated_at: "2026-06-15T23:59:59.000Z"
};

describe("cli health check commands", () => {
  it("renders list and get outputs in human and json modes", async () => {
    const listApi = {
      listHealthChecks: vi.fn().mockResolvedValue({
        checks: [checkFixture],
        limits: { max_checks_per_project: 5, min_interval_seconds: 60 }
      })
    };
    const getApi = {
      getHealthCheck: vi.fn().mockResolvedValue({
        check: checkFixture,
        limits: { max_checks_per_project: 5, min_interval_seconds: 60 }
      })
    };

    const listHuman = await listHealthChecksCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1" },
      listApi
    );
    expect(listHuman.exitCode).toBe(0);
    expect(listHuman.output).toContain("chk_1 Primary app [passing]");

    const listJson = await listHealthChecksCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", json: true },
      listApi
    );
    expect(JSON.parse(listJson.output)).toEqual({
      checks: [checkFixture],
      limits: { max_checks_per_project: 5, min_interval_seconds: 60 }
    });

    const getHuman = await getHealthCheckCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", checkId: "chk_1" },
      getApi
    );
    expect(getHuman.exitCode).toBe(0);
    expect(getHuman.output).toContain("limits=5 min_interval=60s");
  });

  it("renders create, update, delete, test, and results outputs", async () => {
    const createResult = await createHealthCheckCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        name: "Primary app",
        url: "https://app.example.com/health",
        method: "GET",
        expectedStatusMin: 200,
        expectedStatusMax: 399,
        timeoutMs: 5000,
        intervalSeconds: 60,
        failureThreshold: 3,
        recoveryThreshold: 2,
        enabled: true
      },
      { createHealthCheck: vi.fn().mockResolvedValue({ check: checkFixture }) }
    );
    expect(createResult.output).toBe("Health check created: chk_1 (Primary app)");

    const updateResult = await updateHealthCheckCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        checkId: "chk_1",
        enabled: false
      },
      { updateHealthCheck: vi.fn().mockResolvedValue({ check: { ...checkFixture, enabled: false } }) }
    );
    expect(updateResult.output).toBe("Health check updated: chk_1 (Primary app)");

    const deleteResult = await deleteHealthCheckCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", checkId: "chk_1" },
      { deleteHealthCheck: vi.fn().mockResolvedValue({ deleted: true }) }
    );
    expect(deleteResult.output).toBe("Health check deleted.");

    const testResult = await testHealthCheckCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        url: "https://app.example.com/health",
        method: "GET",
        expectedStatusMin: 200,
        expectedStatusMax: 399,
        timeoutMs: 5000
      },
      {
        testHealthCheck: vi.fn().mockResolvedValue({
          normalized_url: "https://app.example.com/health",
          result: {
            status: "success",
            http_status: 200,
            duration_ms: 180,
            error_kind: null,
            error_message: null,
            checked_url_host: "app.example.com",
            checked_url_path: "/health",
            checked_url_query: {},
            final_url: "https://app.example.com/health",
            redirect_count: 0
          }
        })
      }
    );
    expect(testResult.output).toContain("Test result: success");

    const resultsResult = await listHealthCheckResultsCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", checkId: "chk_1" },
      { listHealthCheckResults: vi.fn().mockResolvedValue({ results: [resultFixture] }) }
    );
    expect(resultsResult.output).toContain("2026-06-15T10:00:00.000Z success");

    const dailyRollupsResult = await listHealthCheckDailyRollupsCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", checkId: "chk_1" },
      { listHealthCheckDailyRollups: vi.fn().mockResolvedValue({ rollups: [dailyRollupFixture] }) }
    );
    expect(dailyRollupsResult.output).toContain("2026-06-15 passing");
  });

  it("maps health-check api errors to deterministic exit codes", async () => {
    const authResult = await listHealthChecksCommand(
      { bearerToken: "bad", projectId: "proj_1" },
      { listHealthChecks: vi.fn().mockRejectedValue(new HealthCheckApiError(401, "invalid_member_token")) }
    );
    expect(authResult.exitCode).toBe(2);

    const notFoundResult = await getHealthCheckCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", checkId: "missing" },
      { getHealthCheck: vi.fn().mockRejectedValue(new HealthCheckApiError(404, "check_not_found")) }
    );
    expect(notFoundResult.exitCode).toBe(3);

    const invalidResult = await testHealthCheckCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        url: "http://localhost/health",
        method: "GET",
        expectedStatusMin: 200,
        expectedStatusMax: 399,
        timeoutMs: 5000
      },
      { testHealthCheck: vi.fn().mockRejectedValue(new HealthCheckApiError(400, "invalid_check_target")) }
    );
    expect(invalidResult.exitCode).toBe(4);

    const conflictResult = await createHealthCheckCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        name: "Primary app",
        url: "https://app.example.com/health",
        method: "GET",
        expectedStatusMin: 200,
        expectedStatusMax: 399,
        timeoutMs: 5000,
        intervalSeconds: 60,
        failureThreshold: 3,
        recoveryThreshold: 2,
        enabled: true
      },
      { createHealthCheck: vi.fn().mockRejectedValue(new HealthCheckApiError(409, "availability_check_limit_reached")) }
    );
    expect(conflictResult.exitCode).toBe(5);

    const rateLimitedResult = await listHealthCheckDailyRollupsCommand(
      { bearerToken: "dbundle_mem_x", projectId: "proj_1", checkId: "chk_1" },
      { listHealthCheckDailyRollups: vi.fn().mockRejectedValue(new HealthCheckApiError(429, "rate_limited")) }
    );
    expect(rateLimitedResult.exitCode).toBe(6);
  });

  it("serializes health-check api requests and maps non-standard error bodies", async () => {
    const httpClient = {
      request: vi.fn(
        async (request: HealthCheckHttpRequest): Promise<HealthCheckHttpResponse> => {
        if (request.method === "GET" && request.path.includes("/availability-checks?")) {
          return { status: 200, body: { checks: [checkFixture], limits: { max_checks_per_project: 5, min_interval_seconds: 60 } } };
        }
        if (request.method === "GET" && request.path.endsWith("/availability-checks/chk_1")) {
          return { status: 200, body: { check: checkFixture, limits: { max_checks_per_project: 5, min_interval_seconds: 60 } } };
        }
        if (request.method === "POST" && request.path.endsWith("/availability-checks")) {
          return { status: 201, body: { check: checkFixture } };
        }
        if (request.method === "PATCH") {
          return { status: 200, body: { check: { ...checkFixture, name: "Renamed app" } } };
        }
        if (request.method === "DELETE") {
          return { status: 200, body: { deleted: true } };
        }
        if (request.method === "POST" && request.path.endsWith("/availability-checks/test")) {
          return {
            status: 200,
            body: {
              normalized_url: "https://app.example.com/health",
              result: {
                status: "success",
                http_status: 200,
                duration_ms: 180,
                error_kind: null,
                error_message: null,
                checked_url_host: "app.example.com",
                checked_url_path: "/health",
                checked_url_query: {},
                final_url: "https://app.example.com/health",
                redirect_count: 0
              }
            }
          };
        }
        if (request.method === "GET" && request.path.endsWith("/results?limit=7")) {
          return { status: 200, body: { results: [resultFixture] } };
        }
        if (request.method === "GET" && request.path.endsWith("/daily-rollups?limit=9")) {
          return { status: 200, body: { rollups: [dailyRollupFixture] } };
        }
        return { status: 418, body: "teapot" };
        }
      )
    };
    const api = createHealthCheckApi(httpClient);

    await expect(
      api.listHealthChecks({ bearerToken: "dbundle_mem_x", projectId: "proj 1", limit: 3 })
    ).resolves.toEqual({ checks: [checkFixture], limits: { max_checks_per_project: 5, min_interval_seconds: 60 } });
    await expect(
      api.getHealthCheck({ bearerToken: "dbundle_mem_x", projectId: "proj_1", checkId: "chk_1" })
    ).resolves.toEqual({ check: checkFixture, limits: { max_checks_per_project: 5, min_interval_seconds: 60 } });
    await expect(
      api.createHealthCheck({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        name: "Primary app",
        url: "https://app.example.com/health",
        method: "GET",
        expectedStatusMin: 200,
        expectedStatusMax: 399,
        timeoutMs: 5000,
        intervalSeconds: 60,
        failureThreshold: 3,
        recoveryThreshold: 2,
        environment: "production",
        serviceName: "web",
        enabled: true
      })
    ).resolves.toEqual({ check: checkFixture });
    await expect(
      api.updateHealthCheck({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        checkId: "chk_1",
        name: "Renamed app",
        url: "https://app.example.com/ready",
        method: "HEAD",
        expectedStatusMin: 204,
        expectedStatusMax: 204,
        timeoutMs: 4000,
        intervalSeconds: 120,
        failureThreshold: 2,
        recoveryThreshold: 1,
        environment: "staging",
        serviceName: null,
        enabled: false
      })
    ).resolves.toEqual({ check: { ...checkFixture, name: "Renamed app" } });
    await expect(
      api.deleteHealthCheck({ bearerToken: "dbundle_mem_x", projectId: "proj_1", checkId: "chk_1" })
    ).resolves.toEqual({ deleted: true });
    await expect(
      api.testHealthCheck({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        url: "https://app.example.com/health",
        method: "GET",
        expectedStatusMin: 200,
        expectedStatusMax: 399,
        timeoutMs: 5000
      })
    ).resolves.toEqual(expect.objectContaining({ normalized_url: "https://app.example.com/health" }));
    await expect(
      api.listHealthCheckResults({ bearerToken: "dbundle_mem_x", projectId: "proj_1", checkId: "chk_1", limit: 7 })
    ).resolves.toEqual({ results: [resultFixture] });
    await expect(
      api.listHealthCheckDailyRollups({ bearerToken: "dbundle_mem_x", projectId: "proj_1", checkId: "chk_1", limit: 9 })
    ).resolves.toEqual({ rollups: [dailyRollupFixture] });

    expect(httpClient.request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: "GET",
        path: "/v1/projects/proj%201/availability-checks?limit=3",
        bearerToken: "dbundle_mem_x"
      })
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        method: "POST",
        path: "/v1/projects/proj_1/availability-checks",
        body: expect.objectContaining({
          environment: "production",
          service_name: "web",
          expected_status_min: 200,
          interval_seconds: 60
        })
      })
    );
    expect(httpClient.request).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        method: "PATCH",
        path: "/v1/projects/proj_1/availability-checks/chk_1",
        body: expect.objectContaining({
          method: "HEAD",
          service_name: null,
          enabled: false
        })
      })
    );

    await expect(
      api.getHealthCheck({ bearerToken: "dbundle_mem_x", projectId: "proj_1", checkId: "missing" })
    ).rejects.toEqual(
      expect.objectContaining({
        status: 418,
        code: "unknown_error"
      })
    );
  });

  it("loads stored auth state for create with auth", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const createHealthCheck = vi.fn().mockResolvedValue({ check: checkFixture });
    const createApi = vi.fn().mockReturnValue({
      listHealthChecks: vi.fn(),
      getHealthCheck: vi.fn(),
      createHealthCheck,
      updateHealthCheck: vi.fn(),
      deleteHealthCheck: vi.fn(),
      testHealthCheck: vi.fn(),
      listHealthCheckResults: vi.fn(),
      listHealthCheckDailyRollups: vi.fn()
    });

    const result = await createHealthCheckWithAuthCommand(
      {
        projectId: "proj_1",
        name: "Primary app",
        url: "https://app.example.com/health",
        method: "GET",
        expectedStatusMin: 200,
        expectedStatusMax: 399,
        timeoutMs: 5000,
        intervalSeconds: 60,
        failureThreshold: 3,
        recoveryThreshold: 2,
        enabled: true,
        json: true
      },
      { readAuthState, createHttpClient, createApi }
    );

    expect(result.exitCode).toBe(0);
    expect(createHealthCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        bearerToken: "dbundle_mem_saved",
        projectId: "proj_1"
      })
    );
  });

  it("maps auth failures from the auth wrapper", async () => {
    const result = await createHealthCheckWithAuthCommand(
      {
        projectId: "proj_1",
        name: "Primary app",
        url: "https://app.example.com/health",
        method: "GET",
        expectedStatusMin: 200,
        expectedStatusMax: 399,
        timeoutMs: 5000,
        intervalSeconds: 60,
        failureThreshold: 3,
        recoveryThreshold: 2,
        enabled: true
      },
      { readAuthState: vi.fn().mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in.")) }
    );
    expect(result.exitCode).toBe(2);
    expect(result.output).toBe("Not logged in.");
  });

  it("loads stored auth state for every health-check command wrapper", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const api = {
      listHealthChecks: vi.fn().mockResolvedValue({
        checks: [checkFixture],
        limits: { max_checks_per_project: 5, min_interval_seconds: 60 }
      }),
      getHealthCheck: vi.fn().mockResolvedValue({
        check: checkFixture,
        limits: { max_checks_per_project: 5, min_interval_seconds: 60 }
      }),
      createHealthCheck: vi.fn().mockResolvedValue({ check: checkFixture }),
      updateHealthCheck: vi.fn().mockResolvedValue({ check: checkFixture }),
      deleteHealthCheck: vi.fn().mockResolvedValue({ deleted: true }),
      testHealthCheck: vi.fn().mockResolvedValue({
        normalized_url: "https://app.example.com/health",
        result: {
          status: "success",
          http_status: 200,
          duration_ms: 180,
          error_kind: null,
          error_message: null,
          checked_url_host: "app.example.com",
          checked_url_path: "/health",
          checked_url_query: {},
          final_url: "https://app.example.com/health",
          redirect_count: 0
        }
      }),
      listHealthCheckResults: vi.fn().mockResolvedValue({ results: [resultFixture] }),
      listHealthCheckDailyRollups: vi.fn().mockResolvedValue({ rollups: [dailyRollupFixture] })
    };
    const createApi = vi.fn().mockReturnValue(api);
    const dependencies = { readAuthState, createHttpClient, createApi };

    await expect(
      listHealthChecksWithAuthCommand({ projectId: "proj_1", limit: 2, json: true }, dependencies)
    ).resolves.toEqual(expect.objectContaining({ exitCode: 0 }));
    await expect(
      getHealthCheckWithAuthCommand({ projectId: "proj_1", checkId: "chk_1", json: true }, dependencies)
    ).resolves.toEqual(expect.objectContaining({ exitCode: 0 }));
    await expect(
      updateHealthCheckWithAuthCommand({ projectId: "proj_1", checkId: "chk_1", enabled: false, json: true }, dependencies)
    ).resolves.toEqual(expect.objectContaining({ exitCode: 0 }));
    await expect(
      deleteHealthCheckWithAuthCommand({ projectId: "proj_1", checkId: "chk_1", json: true }, dependencies)
    ).resolves.toEqual(expect.objectContaining({ exitCode: 0 }));
    await expect(
      testHealthCheckWithAuthCommand(
        {
          projectId: "proj_1",
          url: "https://app.example.com/health",
          method: "GET",
          expectedStatusMin: 200,
          expectedStatusMax: 399,
          timeoutMs: 5000,
          json: true
        },
        dependencies
      )
    ).resolves.toEqual(expect.objectContaining({ exitCode: 0 }));
    await expect(
      listHealthCheckResultsWithAuthCommand({ projectId: "proj_1", checkId: "chk_1", limit: 2, json: true }, dependencies)
    ).resolves.toEqual(expect.objectContaining({ exitCode: 0 }));
    await expect(
      listHealthCheckDailyRollupsWithAuthCommand({ projectId: "proj_1", checkId: "chk_1", limit: 2, json: true }, dependencies)
    ).resolves.toEqual(expect.objectContaining({ exitCode: 0 }));

    expect(api.listHealthChecks).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1",
      limit: 2
    });
    expect(api.getHealthCheck).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1",
      checkId: "chk_1"
    });
    expect(api.updateHealthCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        bearerToken: "dbundle_mem_saved",
        projectId: "proj_1",
        checkId: "chk_1",
        enabled: false
      })
    );
    expect(api.deleteHealthCheck).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1",
      checkId: "chk_1"
    });
    expect(api.testHealthCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        bearerToken: "dbundle_mem_saved",
        url: "https://app.example.com/health"
      })
    );
    expect(api.listHealthCheckResults).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1",
      checkId: "chk_1",
      limit: 2
    });
    expect(api.listHealthCheckDailyRollups).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1",
      checkId: "chk_1",
      limit: 2
    });
  });
});
