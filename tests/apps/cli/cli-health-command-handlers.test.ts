import { describe, expect, it, vi } from "vitest";

import { parseArgv } from "../../../apps/cli/src/argv-helpers.js";
import { handleHealthCommand } from "../../../apps/cli/src/management-health-command-handlers.js";

describe("cli health command handlers", () => {
  it("forwards health check lifecycle and results inputs", async () => {
    const listHealthChecksCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "list" });
    const getHealthCheckCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "get" });
    const createHealthCheckCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "create" });
    const updateHealthCheckCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "update" });
    const deleteHealthCheckCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "delete" });
    const testHealthCheckCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "test" });
    const listHealthCheckResultsCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "results" });
    const listHealthCheckDailyRollupsCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "daily-rollups" });

    await handleHealthCommand(parseArgv(["health", "checks", "list", "--project-id", "proj_1", "--limit", "10", "--json"]), {
      listHealthChecksCommand
    });
    await handleHealthCommand(parseArgv(["health", "checks", "get", "chk_1", "--project-id", "proj_1"]), {
      getHealthCheckCommand
    });
    await handleHealthCommand(
      parseArgv([
        "health",
        "checks",
        "create",
        "--project-id",
        "proj_1",
        "--name",
        "Primary app",
        "--url",
        "https://app.example.com/health",
        "--interval-seconds",
        "60",
        "--service",
        "web",
        "--enabled",
        "false"
      ]),
      { createHealthCheckCommand }
    );
    await handleHealthCommand(
      parseArgv([
        "health",
        "checks",
        "update",
        "chk_1",
        "--project-id",
        "proj_1",
        "--interval-seconds",
        "120",
        "--service",
        "null"
      ]),
      { updateHealthCheckCommand }
    );
    await handleHealthCommand(parseArgv(["health", "checks", "delete", "chk_1", "--project-id", "proj_1"]), {
      deleteHealthCheckCommand
    });
    await handleHealthCommand(
      parseArgv([
        "health",
        "checks",
        "test",
        "--project-id",
        "proj_1",
        "--url",
        "https://app.example.com/health",
        "--method",
        "HEAD"
      ]),
      { testHealthCheckCommand }
    );
    await handleHealthCommand(parseArgv(["health", "checks", "results", "chk_1", "--project-id", "proj_1", "--limit", "5"]), {
      listHealthCheckResultsCommand
    });
    await handleHealthCommand(parseArgv(["health", "checks", "daily-rollups", "chk_1", "--project-id", "proj_1", "--limit", "3"]), {
      listHealthCheckDailyRollupsCommand
    });

    expect(listHealthChecksCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: true,
      projectId: "proj_1",
      limit: 10
    });
    expect(getHealthCheckCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      projectId: "proj_1",
      checkId: "chk_1"
    });
    expect(createHealthCheckCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
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
      serviceName: "web",
      enabled: false
    });
    expect(updateHealthCheckCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      projectId: "proj_1",
      checkId: "chk_1",
      intervalSeconds: 120,
      serviceName: null
    });
    expect(deleteHealthCheckCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      projectId: "proj_1",
      checkId: "chk_1"
    });
    expect(testHealthCheckCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      projectId: "proj_1",
      url: "https://app.example.com/health",
      method: "HEAD",
      expectedStatusMin: 200,
      expectedStatusMax: 399,
      timeoutMs: 5000
    });
    expect(listHealthCheckResultsCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      projectId: "proj_1",
      checkId: "chk_1",
      limit: 5
    });
    expect(listHealthCheckDailyRollupsCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      projectId: "proj_1",
      checkId: "chk_1",
      limit: 3
    });
  });

  it("rejects incomplete or invalid health-check command inputs", async () => {
    await expect(
      handleHealthCommand(parseArgv(["health", "checks", "create", "--project-id", "proj_1"]), {})
    ).rejects.toThrow("Missing required option --interval-seconds.");

    await expect(
      handleHealthCommand(parseArgv(["health", "checks", "test", "--project-id", "proj_1", "--url", "https://app.example.com/health", "--method", "POST"]), {})
    ).rejects.toThrow("Invalid value for --method.");

    await expect(
      handleHealthCommand(parseArgv(["health", "checks", "update", "chk_1", "--project-id", "proj_1"]), {})
    ).rejects.toThrow("At least one health-check field must be provided.");

    await expect(handleHealthCommand(parseArgv(["health", "unknown"]), {})).rejects.toThrow("Unknown health command.");
  });
});
