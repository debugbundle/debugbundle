import { describe, expect, it, vi } from "vitest";

import { runCli } from "../../../apps/cli/src/main.js";

describe("cli notification and integration routing", () => {
  it("routes github status and repo commands", async () => {
    const getGitHubStatusCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "status" });
    const setProjectGitHubRepoCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "set" });
    const removeProjectGitHubRepoCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "removed" });

    await runCli(
      ["github", "status", "--project-id", "proj_123", "--auth-file", "/tmp/auth.json", "--json"],
      {
        getGitHubStatusCommand
      }
    );

    await runCli(["github", "repo", "set", "debugbundle/app", "--project-id", "proj_123"], {
      setProjectGitHubRepoCommand
    });

    await runCli(["github", "repo", "remove", "--project-id", "proj_123", "--json"], {
      removeProjectGitHubRepoCommand
    });

    expect(getGitHubStatusCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(setProjectGitHubRepoCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      repoRef: "debugbundle/app"
    });
    expect(removeProjectGitHubRepoCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      json: true
    });
  });

  it("routes github rule commands", async () => {
    const listProjectGitHubRulesCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "list" });
    const createProjectGitHubRuleCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "create" });
    const updateProjectGitHubRuleCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "update" });
    const deleteProjectGitHubRuleCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "delete" });

    await runCli(["github", "rules", "--project-id", "proj_123", "--json"], {
      listProjectGitHubRulesCommand
    });

    await runCli(
      [
        "github",
        "rules",
        "create",
        "--project-id",
        "proj_123",
        "--name",
        "High severity incidents",
        "--event",
        "bundle.created,bundle.reopened",
        "--environment",
        "production",
        "--service",
        "checkout-api",
        "--severity-min",
        "high",
        "--bundle-type",
        "failure",
        "--incident-status",
        "new_or_reopened",
        "--cooldown",
        "300"
      ],
      {
        createProjectGitHubRuleCommand
      }
    );

    await runCli(
      ["github", "rules", "update", "rule_123", "--project-id", "proj_123", "--enabled", "false"],
      {
        updateProjectGitHubRuleCommand
      }
    );

    await runCli(
      [
        "github",
        "rules",
        "delete",
        "rule_123",
        "--project-id",
        "proj_123",
        "--auth-file",
        "/tmp/auth.json"
      ],
      {
        deleteProjectGitHubRuleCommand
      }
    );

    expect(listProjectGitHubRulesCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      json: true
    });
    expect(createProjectGitHubRuleCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      name: "High severity incidents",
      eventTypes: ["bundle.created", "bundle.reopened"],
      environments: ["production"],
      services: ["checkout-api"],
      severityMin: "high",
      bundleType: "failure",
      incidentStatus: "new_or_reopened",
      cooldownSeconds: 300
    });
    expect(updateProjectGitHubRuleCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      ruleId: "rule_123",
      enabled: false
    });
    expect(deleteProjectGitHubRuleCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      ruleId: "rule_123",
      authFilePath: "/tmp/auth.json"
    });
  });

  it("routes github delivery commands", async () => {
    const listProjectGitHubDeliveriesCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "list" });
    const retryProjectGitHubDeliveryCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "retry" });

    await runCli(
      [
        "github",
        "deliveries",
        "--project-id",
        "proj_123",
        "--status",
        "failed",
        "--limit",
        "5",
        "--json"
      ],
      {
        listProjectGitHubDeliveriesCommand
      }
    );

    await runCli(
      [
        "github",
        "deliveries",
        "retry",
        "del_123",
        "--project-id",
        "proj_123",
        "--auth-file",
        "/tmp/auth.json"
      ],
      {
        retryProjectGitHubDeliveryCommand
      }
    );

    expect(listProjectGitHubDeliveriesCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      status: "failed",
      limit: 5,
      json: true
    });
    expect(retryProjectGitHubDeliveryCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      deliveryId: "del_123",
      authFilePath: "/tmp/auth.json"
    });
  });

  it("routes slack management commands", async () => {
    const listSlackDestinationsCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "list" });
    const getSlackConnectUrlCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "url" });
    const testSlackDestinationCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "test" });
    const deleteSlackDestinationCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "delete" });

    await runCli(["slack", "list", "--project-id", "proj_123", "--json"], {
      listSlackDestinationsCommand
    });
    await runCli(
      [
        "slack",
        "connect-url",
        "--project-id",
        "proj_123",
        "--return-to",
        "/projects/proj_123/alerts"
      ],
      {
        getSlackConnectUrlCommand
      }
    );
    await runCli(["slack", "test", "sd_123", "--project-id", "proj_123"], {
      testSlackDestinationCommand
    });
    await runCli(
      ["slack", "delete", "sd_123", "--project-id", "proj_123", "--auth-file", "/tmp/auth.json"],
      {
        deleteSlackDestinationCommand
      }
    );

    expect(listSlackDestinationsCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      json: true
    });
    expect(getSlackConnectUrlCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      returnTo: "/projects/proj_123/alerts"
    });
    expect(testSlackDestinationCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      destinationId: "sd_123"
    });
    expect(deleteSlackDestinationCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      destinationId: "sd_123",
      authFilePath: "/tmp/auth.json"
    });
  });

  it("routes webhook commands with parsed filters and auth options", async () => {
    const listWebhooksCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-list" });
    const createWebhookCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "webhook-create" });
    const updateWebhookCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "webhook-update" });
    const deleteWebhookCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "webhook-delete" });
    const listWebhookDeliveriesCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "webhook-deliveries" });

    await runCli(
      [
        "webhook",
        "list",
        "--project-id",
        "proj_123",
        "--limit",
        "20",
        "--auth-file",
        "/tmp/auth.json",
        "--json"
      ],
      {
        listWebhooksCommand
      }
    );

    await runCli(
      [
        "webhook",
        "create",
        "--project-id",
        "proj_123",
        "--url",
        "https://hooks.example.test/debugbundle",
        "--event",
        "bundle.created,bundle.updated",
        "--environment",
        "production,staging",
        "--service",
        "checkout-api",
        "--severity-min",
        "high",
        "--bundle-type",
        "failure,improvement",
        "--verification",
        "false",
        "--is-enabled",
        "true",
        "--json"
      ],
      {
        createWebhookCommand
      }
    );

    await runCli(
      [
        "webhook",
        "update",
        "wh_123",
        "--project-id",
        "proj_123",
        "--event",
        "bundle.updated",
        "--is-enabled",
        "false"
      ],
      {
        updateWebhookCommand
      }
    );

    await runCli(
      ["webhook", "delete", "wh_123", "--project-id", "proj_123", "--auth-file", "/tmp/auth.json"],
      {
        deleteWebhookCommand
      }
    );

    await runCli(
      ["webhook", "deliveries", "wh_123", "--project-id", "proj_123", "--limit", "10", "--json"],
      {
        listWebhookDeliveriesCommand
      }
    );

    expect(listWebhooksCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      limit: 20,
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(createWebhookCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      url: "https://hooks.example.test/debugbundle",
      events: ["bundle.created", "bundle.updated"],
      filters: {
        environment: ["production", "staging"],
        service: ["checkout-api"],
        severity_min: "high",
        bundle_type: ["failure", "improvement"],
        verification: false
      },
      isEnabled: true,
      json: true
    });
    expect(updateWebhookCommand).toHaveBeenCalledWith({
      webhookId: "wh_123",
      projectId: "proj_123",
      events: ["bundle.updated"],
      isEnabled: false
    });
    expect(deleteWebhookCommand).toHaveBeenCalledWith({
      webhookId: "wh_123",
      projectId: "proj_123",
      authFilePath: "/tmp/auth.json"
    });
    expect(listWebhookDeliveriesCommand).toHaveBeenCalledWith({
      webhookId: "wh_123",
      projectId: "proj_123",
      limit: 10,
      json: true
    });
  });

  it("routes alert commands with parsed fields and auth options", async () => {
    const listAlertsCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "alert-list" });
    const createAlertCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "alert-create" });
    const updateAlertCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "alert-update" });
    const deleteAlertCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "alert-delete" });

    await runCli(
      [
        "alert",
        "list",
        "--project-id",
        "proj_123",
        "--limit",
        "20",
        "--auth-file",
        "/tmp/auth.json",
        "--json"
      ],
      {
        listAlertsCommand
      }
    );

    await runCli(
      [
        "alert",
        "create",
        "--project-id",
        "proj_123",
        "--service-id",
        "svc_123",
        "--channel",
        "email",
        "--condition",
        "severity_threshold",
        "--severity-min",
        "high",
        "--severity-lifecycle-scope",
        "both",
        "--config-json",
        '{"to":"oncall@example.com"}',
        "--is-enabled",
        "true",
        "--json"
      ],
      {
        createAlertCommand
      }
    );

    await runCli(
      [
        "alert",
        "update",
        "al_123",
        "--project-id",
        "proj_123",
        "--service-id",
        "null",
        "--severity-min",
        "null",
        "--severity-lifecycle-scope",
        "null",
        "--config-json",
        '{"channel":"eng-alerts"}',
        "--is-enabled",
        "false"
      ],
      {
        updateAlertCommand
      }
    );

    await runCli(
      ["alert", "delete", "al_123", "--project-id", "proj_123", "--auth-file", "/tmp/auth.json"],
      {
        deleteAlertCommand
      }
    );

    expect(listAlertsCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      limit: 20,
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(createAlertCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      serviceId: "svc_123",
      channel: "email",
      conditionType: "severity_threshold",
      severityMin: "high",
      severityLifecycleScope: "both",
      config: {
        to: "oncall@example.com"
      },
      isEnabled: true,
      json: true
    });
    expect(updateAlertCommand).toHaveBeenCalledWith({
      alertId: "al_123",
      projectId: "proj_123",
      serviceId: null,
      severityMin: null,
      severityLifecycleScope: null,
      config: {
        channel: "eng-alerts"
      },
      isEnabled: false
    });
    expect(deleteAlertCommand).toHaveBeenCalledWith({
      alertId: "al_123",
      projectId: "proj_123",
      authFilePath: "/tmp/auth.json"
    });
  });

  it("routes weekly-report CRUD arguments into the stored-auth wrappers", async () => {
    const listWeeklyReportChannelsCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "weekly-list" });
    const createWeeklyReportChannelCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "weekly-create" });
    const updateWeeklyReportChannelCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "weekly-update" });
    const deleteWeeklyReportChannelCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "weekly-delete" });

    await runCli(["weekly-report", "list", "--project-id", "proj_123", "--limit", "5", "--json"], {
      listWeeklyReportChannelsCommand
    });
    await runCli(
      [
        "weekly-report",
        "create",
        "--project-id",
        "proj_123",
        "--channel",
        "slack",
        "--day-of-week",
        "monday",
        "--hour-of-day",
        "9",
        "--timezone",
        "UTC",
        "--config-json",
        '{"webhook_url":"https://hooks.slack.com/services/T/B/x"}',
        "--is-enabled",
        "false"
      ],
      {
        createWeeklyReportChannelCommand
      }
    );
    await runCli(
      [
        "weekly-report",
        "update",
        "wr_123",
        "--day-of-week",
        "tuesday",
        "--hour-of-day",
        "10",
        "--timezone",
        "UTC",
        "--config-json",
        '{"to":["team@example.com"]}',
        "--is-enabled",
        "true"
      ],
      {
        updateWeeklyReportChannelCommand
      }
    );
    await runCli(["weekly-report", "delete", "wr_123", "--json"], {
      deleteWeeklyReportChannelCommand
    });

    expect(listWeeklyReportChannelsCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      limit: 5,
      json: true
    });
    expect(createWeeklyReportChannelCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      channel: "slack",
      config: { webhookUrl: "https://hooks.slack.com/services/T/B/x" },
      schedule: { dayOfWeek: "monday", hourOfDay: 9, timezone: "UTC" },
      isEnabled: false
    });
    expect(updateWeeklyReportChannelCommand).toHaveBeenCalledWith({
      channelId: "wr_123",
      schedule: { dayOfWeek: "tuesday", hourOfDay: 10, timezone: "UTC" },
      config: { to: ["team@example.com"] },
      isEnabled: true
    });
    expect(deleteWeeklyReportChannelCommand).toHaveBeenCalledWith({
      channelId: "wr_123",
      json: true
    });
  });

  it("validates weekly-report input requirements", async () => {
    const missingProject = await runCli(["weekly-report", "list"]);
    const missingCreateFields = await runCli([
      "weekly-report",
      "create",
      "--project-id",
      "proj_123"
    ]);
    const partialSchedule = await runCli([
      "weekly-report",
      "update",
      "wr_123",
      "--day-of-week",
      "monday"
    ]);
    const noChanges = await runCli(["weekly-report", "update", "wr_123"]);
    const unknownAction = await runCli(["weekly-report", "unknown"]);

    expect(missingProject.output).toContain("Missing required option --project-id.");
    expect(missingCreateFields.output).toContain("Missing required option --channel.");
    expect(partialSchedule.output).toContain(
      "Weekly report schedule updates require --day-of-week, --hour-of-day, and --timezone together."
    );
    expect(noChanges.output).toContain("At least one weekly report field must be provided.");
    expect(unknownAction.output).toContain("Unknown weekly-report command.");
  });

  it("routes webhook create filters and retry arguments", async () => {
    const createWebhookCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "webhook-create" });
    const retryWebhookDeliveryCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "webhook-retry" });

    await runCli(
      [
        "webhook",
        "create",
        "--project-id",
        "proj_123",
        "--url",
        "https://hooks.example.test/debugbundle",
        "--event",
        "bundle.created,bundle.updated",
        "--environment",
        "production,staging",
        "--service",
        "checkout-api",
        "--severity-min",
        "high",
        "--bundle-type",
        "failure",
        "--verification",
        "true",
        "--is-enabled",
        "false"
      ],
      { createWebhookCommand }
    );
    await runCli(["webhook", "retry", "wh_123", "del_123", "--project-id", "proj_123", "--json"], {
      retryWebhookDeliveryCommand
    });

    expect(createWebhookCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      url: "https://hooks.example.test/debugbundle",
      events: ["bundle.created", "bundle.updated"],
      filters: {
        environment: ["production", "staging"],
        service: ["checkout-api"],
        severity_min: "high",
        bundle_type: ["failure"],
        verification: true
      },
      isEnabled: false
    });
    expect(retryWebhookDeliveryCommand).toHaveBeenCalledWith({
      webhookId: "wh_123",
      projectId: "proj_123",
      deliveryId: "del_123",
      json: true
    });
  });

  it("validates webhook boolean options and weekly-report config json", async () => {
    const invalidWebhookVerification = await runCli([
      "webhook",
      "create",
      "--project-id",
      "proj_123",
      "--url",
      "https://hooks.example.test/debugbundle",
      "--event",
      "bundle.created",
      "--verification",
      "maybe"
    ]);
    const invalidWeeklyConfig = await runCli([
      "weekly-report",
      "create",
      "--project-id",
      "proj_123",
      "--channel",
      "email",
      "--day-of-week",
      "monday",
      "--hour-of-day",
      "9",
      "--timezone",
      "UTC",
      "--config-json",
      "null"
    ]);

    expect(invalidWebhookVerification.output).toContain("Invalid value for --verification.");
    expect(invalidWeeklyConfig.output).toContain("Missing required option --config-json.");
  });

  it("routes webhook deliveries and test actions and validates weekly-report booleans", async () => {
    const testWebhookCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-test" });
    const listWebhookDeliveriesCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "webhook-deliveries" });

    await runCli(
      [
        "webhook",
        "test",
        "wh_123",
        "--project-id",
        "proj_123",
        "--event",
        "verification.failed",
        "--json"
      ],
      {
        testWebhookCommand
      }
    );
    await runCli(["webhook", "deliveries", "wh_123", "--project-id", "proj_123", "--limit", "3"], {
      listWebhookDeliveriesCommand
    });
    const invalidWeeklyEnabled = await runCli([
      "weekly-report",
      "create",
      "--project-id",
      "proj_123",
      "--channel",
      "email",
      "--day-of-week",
      "monday",
      "--hour-of-day",
      "9",
      "--timezone",
      "UTC",
      "--config-json",
      '{"to":["team@example.com"]}',
      "--is-enabled",
      "maybe"
    ]);

    expect(testWebhookCommand).toHaveBeenCalledWith({
      webhookId: "wh_123",
      projectId: "proj_123",
      eventType: "verification.failed",
      json: true
    });
    expect(listWebhookDeliveriesCommand).toHaveBeenCalledWith({
      webhookId: "wh_123",
      projectId: "proj_123",
      limit: 3
    });
    expect(invalidWeeklyEnabled.output).toContain("Invalid value for --is-enabled.");
  });

  it("rejects unknown options on weekly-report routes", async () => {
    const result = await runCli([
      "weekly-report",
      "list",
      "--project-id",
      "proj_123",
      "--unknown",
      "value"
    ]);

    expect(result.output).toContain("Unknown option --unknown.");
  });
});
