import { describe, expect, it, vi } from "vitest";

import { HealthCheckApiError } from "../../../apps/cli/src/health-check-commands.js";
import { HEALTH_CHECK_MCP_TOOL_NAMES, createHealthCheckMcpTools } from "../../../apps/mcp/src/health-check-tools.js";

describe("mcp health check tools", () => {
  it("declares health-check tool parity", () => {
    expect(HEALTH_CHECK_MCP_TOOL_NAMES).toEqual([
      "list_health_checks",
      "get_health_check",
      "create_health_check",
      "update_health_check",
      "delete_health_check",
      "test_health_check",
      "list_health_check_results",
      "list_health_check_daily_rollups"
    ]);
  });

  it("returns payloads for all health-check operations", async () => {
    const tools = createHealthCheckMcpTools({
      listHealthChecks: vi.fn().mockResolvedValue({ checks: [], limits: { max_checks_per_project: 3, min_interval_seconds: 60 } }),
      getHealthCheck: vi.fn().mockResolvedValue({ check: { check_id: "chk_1" } }),
      createHealthCheck: vi.fn().mockResolvedValue({ check: { check_id: "chk_1" } }),
      updateHealthCheck: vi.fn().mockResolvedValue({ check: { check_id: "chk_1", enabled: false } }),
      deleteHealthCheck: vi.fn().mockResolvedValue({ deleted: true }),
      testHealthCheck: vi.fn().mockResolvedValue({
        normalized_url: "https://app.example.com/health",
        result: { status: "success", http_status: 200 }
      }),
      listHealthCheckResults: vi.fn().mockResolvedValue({ results: [] }),
      listHealthCheckDailyRollups: vi.fn().mockResolvedValue({ rollups: [] })
    });

    await expect(
      tools.list_health_checks({ bearerToken: "dbundle_mem_x", projectId: "proj_1", limit: 10 })
    ).resolves.toEqual({ checks: [], limits: { max_checks_per_project: 3, min_interval_seconds: 60 } });
    await expect(
      tools.get_health_check({ bearerToken: "dbundle_mem_x", projectId: "proj_1", checkId: "chk_1" })
    ).resolves.toEqual({ check: { check_id: "chk_1" } });
    await expect(
      tools.create_health_check({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        name: "Primary app",
        url: "https://app.example.com/health",
        intervalSeconds: 60
      })
    ).resolves.toEqual({ check: { check_id: "chk_1" } });
    await expect(
      tools.update_health_check({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        checkId: "chk_1",
        enabled: false
      })
    ).resolves.toEqual({ check: { check_id: "chk_1", enabled: false } });
    await expect(
      tools.delete_health_check({ bearerToken: "dbundle_mem_x", projectId: "proj_1", checkId: "chk_1" })
    ).resolves.toEqual({ deleted: true });
    await expect(
      tools.test_health_check({ bearerToken: "dbundle_mem_x", projectId: "proj_1", url: "https://app.example.com/health" })
    ).resolves.toEqual({
      normalized_url: "https://app.example.com/health",
      result: { status: "success", http_status: 200 }
    });
    await expect(
      tools.list_health_check_results({ bearerToken: "dbundle_mem_x", projectId: "proj_1", checkId: "chk_1" })
    ).resolves.toEqual({ results: [] });
    await expect(
      tools.list_health_check_daily_rollups({ bearerToken: "dbundle_mem_x", projectId: "proj_1", checkId: "chk_1", limit: 30 })
    ).resolves.toEqual({ rollups: [] });
  });

  it("maps health-check api and unknown errors to mcp tool errors", async () => {
    const tools = createHealthCheckMcpTools({
      listHealthChecks: vi.fn().mockRejectedValue(new HealthCheckApiError(401, "invalid_member_token")),
      getHealthCheck: vi.fn().mockRejectedValue(new HealthCheckApiError(404, "check_not_found")),
      createHealthCheck: vi.fn().mockRejectedValue(new HealthCheckApiError(409, "availability_check_limit_reached")),
      updateHealthCheck: vi.fn().mockRejectedValue(new Error("network")),
      deleteHealthCheck: vi.fn().mockResolvedValue({ deleted: true }),
      testHealthCheck: vi.fn().mockResolvedValue({
        normalized_url: "https://app.example.com/health",
        result: { status: "success" }
      }),
      listHealthCheckResults: vi.fn().mockResolvedValue({ results: [] }),
      listHealthCheckDailyRollups: vi.fn().mockResolvedValue({ rollups: [] })
    });

    await expect(
      tools.list_health_checks({ bearerToken: "bad", projectId: "proj_1" })
    ).rejects.toThrow("mcp_tool_error:invalid_member_token");
    await expect(
      tools.get_health_check({ bearerToken: "dbundle_mem_x", projectId: "proj_1", checkId: "missing" })
    ).rejects.toThrow("mcp_tool_error:check_not_found");
    await expect(
      tools.create_health_check({
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        name: "Primary app",
        url: "https://app.example.com/health",
        intervalSeconds: 60
      })
    ).rejects.toThrow("mcp_tool_error:availability_check_limit_reached");
    await expect(
      tools.update_health_check({ bearerToken: "dbundle_mem_x", projectId: "proj_1", checkId: "chk_1", enabled: false })
    ).rejects.toThrow("mcp_tool_error:unknown_error");
  });
});
