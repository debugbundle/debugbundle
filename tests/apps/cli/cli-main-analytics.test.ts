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

  it("routes detailed analytics metric commands", async () => {
    const getAnalyticsRoutesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "routes" });
    const getAnalyticsJourneysCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "journeys" });
    const getAnalyticsDevicesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "devices" });
    const getAnalyticsReferrersCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "referrers" });
    const getAnalyticsActionsCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "actions" });
    const listAnalyticsFunnelsCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "funnels" });
    const getAnalyticsFunnelCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "funnel" });
    const listAnalyticsOpportunitiesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "opportunities" });
    const getAnalyticsOpportunityCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "opportunity" });
    const listAnalyticsBundlesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "bundle-list" });
    const createAnalyticsBundleCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "bundle-create" });
    const getAnalyticsBundleCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "bundle" });
    const listAnalyticsJourneySamplesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "sample-list" });
    const getAnalyticsJourneySampleCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "sample" });

    await expect(runCli(["analytics", "routes", "--project", "proj_123"], { getAnalyticsRoutesCommand })).resolves.toEqual({
      exitCode: 0,
      output: "routes"
    });
    await expect(runCli(["analytics", "journeys", "--project", "proj_123"], { getAnalyticsJourneysCommand })).resolves.toEqual({
      exitCode: 0,
      output: "journeys"
    });
    await expect(runCli(["analytics", "devices", "--project", "proj_123"], { getAnalyticsDevicesCommand })).resolves.toEqual({
      exitCode: 0,
      output: "devices"
    });
    await expect(runCli(["analytics", "referrers", "--project", "proj_123"], { getAnalyticsReferrersCommand })).resolves.toEqual({
      exitCode: 0,
      output: "referrers"
    });
    await expect(runCli(["analytics", "actions", "--project", "proj_123"], { getAnalyticsActionsCommand })).resolves.toEqual({
      exitCode: 0,
      output: "actions"
    });
    await expect(runCli(["analytics", "funnels", "--project", "proj_123"], { listAnalyticsFunnelsCommand })).resolves.toEqual({
      exitCode: 0,
      output: "funnels"
    });
    await expect(runCli(["analytics", "funnel", "checkout", "--project", "proj_123"], { getAnalyticsFunnelCommand })).resolves.toEqual({
      exitCode: 0,
      output: "funnel"
    });
    await expect(
      runCli(
        ["analytics", "opportunities", "--project", "proj_123", "--status", "all", "--kind", "funnel_dropoff", "--cursor", "cursor-1", "--limit", "5"],
        { listAnalyticsOpportunitiesCommand }
      )
    ).resolves.toEqual({
      exitCode: 0,
      output: "opportunities"
    });
    await expect(
      runCli(
        ["analytics", "opportunity", "get", "opp_123", "--project", "proj_123"],
        { getAnalyticsOpportunityCommand }
      )
    ).resolves.toEqual({
      exitCode: 0,
      output: "opportunity"
    });
    await expect(
      runCli(
        [
          "analytics",
          "bundle",
          "list",
          "--project",
          "proj_123",
          "--status",
          "completed",
          "--kind",
          "usage_summary",
          "--cursor",
          "cursor-1",
          "--limit",
          "5",
          "--json"
        ],
        { listAnalyticsBundlesCommand }
      )
    ).resolves.toEqual({
      exitCode: 0,
      output: "bundle-list"
    });
    await expect(
      runCli(
        [
          "analytics",
          "bundle",
          "create",
          "--project",
          "proj_123",
          "--kind",
          "funnel_dropoff",
          "--funnel",
          "checkout",
          "--last",
          "7d",
          "--filters-json",
          '{"auth_state":"logged_in"}',
          "--json"
        ],
        { createAnalyticsBundleCommand }
      )
    ).resolves.toEqual({
      exitCode: 0,
      output: "bundle-create"
    });
    await expect(
      runCli(
        ["analytics", "bundle", "get", "gen_123", "--project", "proj_123", "--json"],
        { getAnalyticsBundleCommand }
      )
    ).resolves.toEqual({
      exitCode: 0,
      output: "bundle"
    });
    await expect(
      runCli(
        [
          "analytics",
          "journey-samples",
          "list",
          "--project",
          "proj_123",
          "--service",
          "web",
          "--environment",
          "production",
          "--tag",
          "checkout",
          "--cursor",
          "cursor-1",
          "--limit",
          "5",
          "--json"
        ],
        { listAnalyticsJourneySamplesCommand }
      )
    ).resolves.toEqual({
      exitCode: 0,
      output: "sample-list"
    });
    await expect(
      runCli(
        ["analytics", "journey-samples", "get", "sample_123", "--project", "proj_123", "--json"],
        { getAnalyticsJourneySampleCommand }
      )
    ).resolves.toEqual({
      exitCode: 0,
      output: "sample"
    });

    expect(getAnalyticsRoutesCommand).toHaveBeenCalledWith({ projectId: "proj_123" });
    expect(getAnalyticsJourneysCommand).toHaveBeenCalledWith({ projectId: "proj_123" });
    expect(getAnalyticsDevicesCommand).toHaveBeenCalledWith({ projectId: "proj_123" });
    expect(getAnalyticsReferrersCommand).toHaveBeenCalledWith({ projectId: "proj_123" });
    expect(getAnalyticsActionsCommand).toHaveBeenCalledWith({ projectId: "proj_123" });
    expect(listAnalyticsFunnelsCommand).toHaveBeenCalledWith({ projectId: "proj_123" });
    expect(getAnalyticsFunnelCommand).toHaveBeenCalledWith({ projectId: "proj_123", funnelKey: "checkout" });
    expect(listAnalyticsOpportunitiesCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      status: "all",
      kind: "funnel_dropoff",
      cursor: "cursor-1",
      limit: 5
    });
    expect(getAnalyticsOpportunityCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      opportunityId: "opp_123"
    });
    expect(listAnalyticsBundlesCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      status: "completed",
      kind: "usage_summary",
      cursor: "cursor-1",
      limit: 5,
      json: true
    });
    expect(createAnalyticsBundleCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      analysisKind: "funnel_dropoff",
      from: undefined,
      to: undefined,
      last: "7d",
      funnel: "checkout",
      route: undefined,
      incidentId: undefined,
      deployId: undefined,
      filters: { auth_state: "logged_in" },
      json: true
    });
    expect(getAnalyticsBundleCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      bundleGenerationId: "gen_123",
      json: true
    });
    expect(listAnalyticsJourneySamplesCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      service: "web",
      environment: "production",
      tag: "checkout",
      cursor: "cursor-1",
      limit: 5,
      json: true
    });
    expect(getAnalyticsJourneySampleCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      sampleId: "sample_123",
      json: true
    });
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
