import { describe, expect, it, vi } from "vitest";

import { runCli } from "../../../apps/cli/src/main.js";

describe("cli main analytics routing", () => {
  it("routes analytics summary arguments into the summary command", async () => {
    const getAnalyticsSummaryCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "analytics-summary"
    });

    const result = await runCli(
      [
        "analytics",
        "summary",
        "--project-id",
        "proj_123",
        "--from",
        "2026-03-01T00:00:00.000Z",
        "--to",
        "2026-03-08T00:00:00.000Z",
        "--granularity",
        "day",
        "--service",
        "web",
        "--environment",
        "production",
        "--limit",
        "5",
        "--auth-file",
        "/tmp/auth.json",
        "--json"
      ],
      { getAnalyticsSummaryCommand }
    );

    expect(getAnalyticsSummaryCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-03-08T00:00:00.000Z",
      granularity: "day",
      service: "web",
      environment: "production",
      limit: 5,
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(result).toEqual({ exitCode: 0, output: "analytics-summary" });
  });

  it("routes analytics settings get arguments into the get command", async () => {
    const getAnalyticsSettingsCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "analytics-settings-get"
    });

    const result = await runCli(
      ["analytics", "settings", "get", "--project", "proj_123", "--auth-file", "/tmp/auth.json", "--json"],
      { getAnalyticsSettingsCommand }
    );

    expect(getAnalyticsSettingsCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(result).toEqual({ exitCode: 0, output: "analytics-settings-get" });
  });

  it("routes analytics settings set arguments into the set command", async () => {
    const setAnalyticsSettingsCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "analytics-settings-set"
    });

    const result = await runCli(
      [
        "analytics",
        "settings",
        "set",
        "--project",
        "proj_123",
        "--enabled",
        "true",
        "--privacy-mode",
        "standard",
        "--journey-sample-rate",
        "0.25",
        "--max-custom-dimensions",
        "2",
        "--approved-custom-dimensions-json",
        '["auth_state","plan"]',
        "--auth-file",
        "/tmp/auth.json",
        "--json"
      ],
      { setAnalyticsSettingsCommand }
    );

    expect(setAnalyticsSettingsCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      update: {
        enabled: true,
        privacy_mode: "standard",
        journey_sample_rate: 0.25,
        max_custom_dimensions: 2,
        approved_custom_dimensions: ["auth_state", "plan"]
      },
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(result).toEqual({ exitCode: 0, output: "analytics-settings-set" });
  });

  it("validates required analytics settings options and update values", async () => {
    const missingProject = await runCli(["analytics", "settings", "get"]);
    const missingUpdate = await runCli(["analytics", "settings", "set", "--project", "proj_123"]);
    const invalidPrivacy = await runCli([
      "analytics",
      "settings",
      "set",
      "--project",
      "proj_123",
      "--privacy-mode",
      "wide-open"
    ]);
    const invalidSample = await runCli([
      "analytics",
      "settings",
      "set",
      "--project",
      "proj_123",
      "--journey-sample-rate",
      "2"
    ]);

    expect(missingProject.exitCode).toBe(4);
    expect(missingProject.output).toContain("Missing required option --project.");
    expect(missingUpdate.exitCode).toBe(4);
    expect(missingUpdate.output).toContain("At least one analytics settings field must be provided.");
    expect(invalidPrivacy.exitCode).toBe(4);
    expect(invalidPrivacy.output).toContain("Invalid value for --privacy-mode.");
    expect(invalidSample.exitCode).toBe(4);
    expect(invalidSample.output).toContain("Invalid value for --journey-sample-rate.");
  });

  it("rejects unknown analytics settings options", async () => {
    const result = await runCli(["analytics", "settings", "get", "--project", "proj_123", "--unknown", "value"]);

    expect(result.exitCode).toBe(4);
    expect(result.output).toContain("Unknown option --unknown.");
  });
});
