import { describe, expect, it, vi } from "vitest";

import { runCli } from "../../../apps/cli/src/main.js";

describe("cli main improvements routing", () => {
  it("routes improvements list/get/bundle/resolve/reopen/snooze commands", async () => {
    const listImprovementsCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "improvements-list" });
    const getImprovementCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "improvements-get" });
    const getImprovementBundleCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "improvements-bundle" });
    const resolveImprovementCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "improvements-resolve" });
    const reopenImprovementCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "improvements-reopen" });
    const snoozeImprovementCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "improvements-snooze" });

    await expect(
      runCli(["improvements", "list", "--project-id", "proj_123", "--status", "open", "--limit", "10"], {
        listImprovementsCommand
      })
    ).resolves.toEqual({ exitCode: 0, output: "improvements-list" });
    expect(listImprovementsCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      status: "open",
      limit: 10
    });

    await expect(runCli(["improvements", "get", "imp_123"], { getImprovementCommand })).resolves.toEqual({
      exitCode: 0,
      output: "improvements-get"
    });
    expect(getImprovementCommand).toHaveBeenCalledWith({ improvementId: "imp_123" });

    await expect(
      runCli(["improvements", "bundle", "imp_123", "--project-id", "proj_123"], { getImprovementBundleCommand })
    ).resolves.toEqual({ exitCode: 0, output: "improvements-bundle" });
    expect(getImprovementBundleCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      improvementId: "imp_123"
    });

    await expect(runCli(["improvements", "resolve", "imp_123"], { resolveImprovementCommand })).resolves.toEqual({
      exitCode: 0,
      output: "improvements-resolve"
    });
    expect(resolveImprovementCommand).toHaveBeenCalledWith({ improvementId: "imp_123" });

    await expect(runCli(["improvements", "reopen", "imp_123"], { reopenImprovementCommand })).resolves.toEqual({
      exitCode: 0,
      output: "improvements-reopen"
    });
    expect(reopenImprovementCommand).toHaveBeenCalledWith({ improvementId: "imp_123" });

    await expect(
      runCli(["improvements", "snooze", "imp_123", "--until", "2026-05-25T13:00:00.000Z"], {
        snoozeImprovementCommand
      })
    ).resolves.toEqual({
      exitCode: 0,
      output: "improvements-snooze"
    });
    expect(snoozeImprovementCommand).toHaveBeenCalledWith({
      improvementId: "imp_123",
      snoozedUntil: "2026-05-25T13:00:00.000Z"
    });
  });

  it("routes improvements settings get arguments into the get command", async () => {
    const getImprovementSettingsCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "improvements-settings-get"
    });

    const result = await runCli(
      ["improvements", "settings", "get", "--project", "proj_123", "--auth-file", "/tmp/auth.json", "--json"],
      {
        getImprovementSettingsCommand
      }
    );

    expect(getImprovementSettingsCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(result).toEqual({ exitCode: 0, output: "improvements-settings-get" });
  });

  it("routes improvements settings set arguments into the set command", async () => {
    const setImprovementSettingsCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "improvements-settings-set"
    });

    const result = await runCli(
      [
        "improvements",
        "settings",
        "set",
        "--project",
        "proj_123",
        "--enabled",
        "false",
        "--sensitivity",
        "verbose",
        "--auth-file",
        "/tmp/auth.json",
        "--json"
      ],
      {
        setImprovementSettingsCommand
      }
    );

    expect(setImprovementSettingsCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      update: {
        automated_improvement_bundles_enabled: false,
        improvement_bundle_sensitivity: "verbose"
      },
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(result).toEqual({ exitCode: 0, output: "improvements-settings-set" });
  });

  it("validates required improvements settings options and update content", async () => {
    const missingProject = await runCli(["improvements", "settings", "get"]);
    const missingUpdate = await runCli(["improvements", "settings", "set", "--project", "proj_123"]);
    const invalidSensitivity = await runCli([
      "improvements",
      "settings",
      "set",
      "--project",
      "proj_123",
      "--sensitivity",
      "loud"
    ]);

    expect(missingProject.exitCode).toBe(4);
    expect(missingProject.output).toContain("Missing required option --project.");
    expect(missingUpdate.exitCode).toBe(4);
    expect(missingUpdate.output).toContain("At least one improvement settings field must be provided.");
    expect(invalidSensitivity.exitCode).toBe(4);
    expect(invalidSensitivity.output).toContain("Invalid value for --sensitivity.");
  });

  it("rejects unknown options on improvements settings routes", async () => {
    const result = await runCli(["improvements", "settings", "get", "--project", "proj_123", "--unknown", "value"]);

    expect(result.exitCode).toBe(4);
    expect(result.output).toContain("Unknown option --unknown.");
  });
});
