import { describe, expect, it, vi } from "vitest";

import { runCli } from "../../../apps/cli/src/main.js";

describe("cli main capture-policy routing", () => {
  it("routes capture-policy get arguments into the get command", async () => {
    const getCapturePolicyCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "capture-policy-get"
    });

    const result = await runCli([
      "capture-policy",
      "get",
      "--project",
      "proj_123",
      "--auth-file",
      "/tmp/auth.json",
      "--json"
    ], {
      getCapturePolicyCommand
    });

    expect(getCapturePolicyCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(result).toEqual({ exitCode: 0, output: "capture-policy-get" });
  });

  it("routes capture-policy set arguments including repeated overrides into the set command", async () => {
    const setCapturePolicyCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "capture-policy-set"
    });

    const result = await runCli([
      "capture-policy",
      "set",
      "--project",
      "proj_123",
      "--preset",
      "investigative",
      "--override",
      "capture_logs=info",
      "--override",
      "capture_request_events=all",
      "--override",
      "capture_breadcrumbs=null",
      "--auth-file",
      "/tmp/auth.json",
      "--json"
    ], {
      setCapturePolicyCommand
    });

    expect(setCapturePolicyCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      update: {
        preset: "investigative",
        capture_logs: "info",
        capture_request_events: "all",
        capture_breadcrumbs: null
      },
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(result).toEqual({ exitCode: 0, output: "capture-policy-set" });
  });

  it("validates required capture-policy options and update content", async () => {
    const missingProject = await runCli(["capture-policy", "get"]);
    const missingUpdate = await runCli(["capture-policy", "set", "--project", "proj_123"]);
    const invalidOverride = await runCli([
      "capture-policy",
      "set",
      "--project",
      "proj_123",
      "--override",
      "not-valid"
    ]);

    expect(missingProject.exitCode).toBe(4);
    expect(missingProject.output).toContain("Missing required option --project.");
    expect(missingUpdate.exitCode).toBe(4);
    expect(missingUpdate.output).toContain("At least one capture policy field must be provided.");
    expect(invalidOverride.exitCode).toBe(4);
    expect(invalidOverride.output).toContain("Invalid value for --override.");
  });

  it("rejects unknown options on capture-policy routes", async () => {
    const result = await runCli(["capture-policy", "get", "--project", "proj_123", "--unknown", "value"]);

    expect(result.exitCode).toBe(4);
    expect(result.output).toContain("Unknown option --unknown.");
  });
});