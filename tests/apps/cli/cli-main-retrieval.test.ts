import { describe, expect, it, vi } from "vitest";

import { runCli } from "../../../apps/cli/src/main.js";

describe("cli main retrieval routing", () => {
  it("routes incidents filters into the stored-auth incidents command", async () => {
    const listIncidentsCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "incidents"
    });

    const result = await runCli([
      "incidents",
      "--source",
      "local",
      "--project-id",
      "proj_123",
      "--environment",
      "production",
      "--service",
      "checkout-api",
      "--status",
      "open",
      "--severity",
      "high",
      "--cursor",
      "cursor_123",
      "--limit",
      "10",
      "--auth-file",
      "/tmp/auth.json",
      "--json"
    ], {
      listIncidentsCommand
    });

    expect(listIncidentsCommand).toHaveBeenCalledWith({
      source: "local",
      projectId: "proj_123",
      environment: "production",
      service: "checkout-api",
      status: "open",
      severity: "high",
      cursor: "cursor_123",
      limit: 10,
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(result.exitCode).toBe(0);
  });

  it("routes bundle retrieval and services listing through stored-auth wrappers", async () => {
    const getBundleCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "bundle" });
    const listServicesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "services" });

    const bundleResult = await runCli([
      "bundle",
      "inc_123",
      "--auth-file",
      "/tmp/auth.json"
    ], {
      getBundleCommand
    });

    const servicesResult = await runCli([
      "services",
      "--project-id",
      "proj_123",
      "--limit",
      "25",
      "--json"
    ], {
      listServicesCommand
    });

    expect(getBundleCommand).toHaveBeenCalledWith({
      incidentId: "inc_123",
      authFilePath: "/tmp/auth.json"
    });
    expect(listServicesCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      limit: 25,
      json: true
    });
    expect(bundleResult.exitCode).toBe(0);
    expect(servicesResult.exitCode).toBe(0);
  });

  it("routes inspect, reproduce, logs, and whoami commands", async () => {
    const getIncidentCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "incident" });
    const resolveIncidentCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "resolved" });
    const reopenIncidentCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "reopened" });
    const getReproductionCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "reproduction" });
    const getLogsCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "logs" });
    const whoamiCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "whoami" });

    const inspectResult = await runCli([
      "inspect",
      "inc_123",
      "--source",
      "local",
      "--auth-file",
      "/tmp/auth.json",
      "--json"
    ], {
      getIncidentCommand
    });

    const resolveResult = await runCli([
      "resolve",
      "inc_123",
      "--source",
      "local",
      "--auth-file",
      "/tmp/auth.json",
      "--json"
    ], {
      resolveIncidentCommand
    });

    const reopenResult = await runCli([
      "reopen",
      "inc_456",
      "--source",
      "local",
      "--json"
    ], {
      reopenIncidentCommand
    });

    const reproduceResult = await runCli([
      "reproduce",
      "inc_123",
      "--source",
      "local",
      "--auth-file",
      "/tmp/auth.json"
    ], {
      getReproductionCommand
    });

    const logsResult = await runCli([
      "logs",
      "inc_123",
      "--level=error",
      "--cursor=cursor_123",
      "--limit=5",
      "--json"
    ], {
      getLogsCommand
    });

    const whoamiResult = await runCli([
      "whoami",
      "--auth-file",
      "/tmp/auth.json",
      "--json"
    ], {
      whoamiCommand
    });

    expect(getIncidentCommand).toHaveBeenCalledWith({
      incidentId: "inc_123",
      source: "local",
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(resolveIncidentCommand).toHaveBeenCalledWith({
      incidentId: "inc_123",
      source: "local",
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(reopenIncidentCommand).toHaveBeenCalledWith({
      incidentId: "inc_456",
      source: "local",
      json: true
    });
    expect(getReproductionCommand).toHaveBeenCalledWith({
      incidentId: "inc_123",
      source: "local",
      authFilePath: "/tmp/auth.json"
    });
    expect(getLogsCommand).toHaveBeenCalledWith({
      incidentId: "inc_123",
      level: "error",
      cursor: "cursor_123",
      limit: 5,
      json: true
    });
    expect(whoamiCommand).toHaveBeenCalledWith({
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(inspectResult.exitCode).toBe(0);
    expect(resolveResult.exitCode).toBe(0);
    expect(reopenResult.exitCode).toBe(0);
    expect(reproduceResult.exitCode).toBe(0);
    expect(logsResult.exitCode).toBe(0);
    expect(whoamiResult.exitCode).toBe(0);
  });

});
