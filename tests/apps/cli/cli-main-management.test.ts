import { describe, expect, it, vi } from "vitest";

import { main, runCli } from "../../../apps/cli/src/main.js";

describe("cli main management routing", () => {
  it("routes nested token project and member commands", async () => {
    const createProjectTokenCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "created" });
    const revokeMemberTokenCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "revoked" });

    const projectResult = await runCli([
      "token",
      "project",
      "create",
      "proj_123",
      "--label",
      "ci",
      "--auth-file",
      "/tmp/auth.json",
      "--json"
    ], {
      createProjectTokenCommand
    });

    const memberResult = await runCli([
      "token",
      "member",
      "revoke",
      "mtok_123"
    ], {
      revokeMemberTokenCommand
    });

    expect(createProjectTokenCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      label: "ci",
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(revokeMemberTokenCommand).toHaveBeenCalledWith({
      tokenId: "mtok_123"
    });
    expect(projectResult.exitCode).toBe(0);
    expect(memberResult.exitCode).toBe(0);
  });

  it("routes project delete commands", async () => {
    const deleteProjectCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "deleted" });

    const result = await runCli([
      "project",
      "delete",
      "proj_123",
      "--auth-file",
      "/tmp/auth.json",
      "--json"
    ], {
      deleteProjectCommand
    });

    expect(deleteProjectCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(result.exitCode).toBe(0);
  });

  it("routes github status and repo commands", async () => {
    const getGitHubStatusCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "status" });
    const setProjectGitHubRepoCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "set" });
    const removeProjectGitHubRepoCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "removed" });

    await runCli([
      "github",
      "status",
      "--project-id",
      "proj_123",
      "--auth-file",
      "/tmp/auth.json",
      "--json"
    ], {
      getGitHubStatusCommand
    });

    await runCli([
      "github",
      "repo",
      "set",
      "debugbundle/app",
      "--project-id",
      "proj_123"
    ], {
      setProjectGitHubRepoCommand
    });

    await runCli([
      "github",
      "repo",
      "remove",
      "--project-id",
      "proj_123",
      "--json"
    ], {
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
    const listProjectGitHubRulesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "list" });
    const createProjectGitHubRuleCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "create" });
    const updateProjectGitHubRuleCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "update" });
    const deleteProjectGitHubRuleCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "delete" });

    await runCli([
      "github",
      "rules",
      "--project-id",
      "proj_123",
      "--json"
    ], {
      listProjectGitHubRulesCommand
    });

    await runCli([
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
    ], {
      createProjectGitHubRuleCommand
    });

    await runCli([
      "github",
      "rules",
      "update",
      "rule_123",
      "--project-id",
      "proj_123",
      "--enabled",
      "false"
    ], {
      updateProjectGitHubRuleCommand
    });

    await runCli([
      "github",
      "rules",
      "delete",
      "rule_123",
      "--project-id",
      "proj_123",
      "--auth-file",
      "/tmp/auth.json"
    ], {
      deleteProjectGitHubRuleCommand
    });

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
    const listProjectGitHubDeliveriesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "list" });
    const retryProjectGitHubDeliveryCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "retry" });

    await runCli([
      "github",
      "deliveries",
      "--project-id",
      "proj_123",
      "--status",
      "failed",
      "--limit",
      "5",
      "--json"
    ], {
      listProjectGitHubDeliveriesCommand
    });

    await runCli([
      "github",
      "deliveries",
      "retry",
      "del_123",
      "--project-id",
      "proj_123",
      "--auth-file",
      "/tmp/auth.json"
    ], {
      retryProjectGitHubDeliveryCommand
    });

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

  it("routes billing commands", async () => {
    const getBillingSummaryCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "billing-get" });
    const increaseBillingCapacityCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "billing-increase" });
    const scheduleBillingCapacityReductionCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "billing-reduce" });
    const cancelBillingCapacityReductionCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "billing-cancel" });

    await runCli([
      "billing",
      "get",
      "--auth-file",
      "/tmp/auth.json",
      "--json"
    ], {
      getBillingSummaryCommand
    });

    await runCli([
      "billing",
      "capacity",
      "increase",
      "--target-additional-capacity-units",
      "4"
    ], {
      increaseBillingCapacityCommand
    });

    await runCli([
      "billing",
      "capacity",
      "schedule-reduction",
      "--target-additional-capacity-units",
      "1",
      "--auth-file",
      "/tmp/auth.json"
    ], {
      scheduleBillingCapacityReductionCommand
    });

    await runCli([
      "billing",
      "capacity",
      "cancel-reduction",
      "--json"
    ], {
      cancelBillingCapacityReductionCommand
    });

    expect(getBillingSummaryCommand).toHaveBeenCalledWith({
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(increaseBillingCapacityCommand).toHaveBeenCalledWith({
      targetAdditionalCapacityUnits: 4
    });
    expect(scheduleBillingCapacityReductionCommand).toHaveBeenCalledWith({
      targetAdditionalCapacityUnits: 1,
      authFilePath: "/tmp/auth.json"
    });
    expect(cancelBillingCapacityReductionCommand).toHaveBeenCalledWith({
      json: true
    });
  });

  it("routes the remaining token command combinations", async () => {
    const listProjectTokensCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "project-list" });
    const revokeProjectTokenCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "project-revoke" });
    const listMemberTokensCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "member-list" });
    const createMemberTokenCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "member-create" });

    await runCli([
      "token",
      "project",
      "list",
      "proj_123",
      "--limit",
      "20",
      "--json"
    ], {
      listProjectTokensCommand
    });

    await runCli([
      "token",
      "project",
      "revoke",
      "proj_123",
      "ptok_123",
      "--auth-file",
      "/tmp/auth.json"
    ], {
      revokeProjectTokenCommand
    });

    await runCli([
      "token",
      "member",
      "list",
      "--limit",
      "15",
      "--auth-file",
      "/tmp/auth.json"
    ], {
      listMemberTokensCommand
    });

    await runCli([
      "token",
      "member",
      "create",
      "--label",
      "cli",
      "--json"
    ], {
      createMemberTokenCommand
    });

    expect(listProjectTokensCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      limit: 20,
      json: true
    });
    expect(revokeProjectTokenCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      tokenId: "ptok_123",
      authFilePath: "/tmp/auth.json"
    });
    expect(listMemberTokensCommand).toHaveBeenCalledWith({
      limit: 15,
      authFilePath: "/tmp/auth.json"
    });
    expect(createMemberTokenCommand).toHaveBeenCalledWith({
      label: "cli",
      json: true
    });
  });

  it("routes webhook commands with parsed filters and auth options", async () => {
    const listWebhooksCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-list" });
    const createWebhookCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-create" });
    const updateWebhookCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-update" });
    const deleteWebhookCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-delete" });
    const listWebhookDeliveriesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-deliveries" });

    await runCli([
      "webhook",
      "list",
      "--project-id",
      "proj_123",
      "--limit",
      "20",
      "--auth-file",
      "/tmp/auth.json",
      "--json"
    ], {
      listWebhooksCommand
    });

    await runCli([
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
    ], {
      createWebhookCommand
    });

    await runCli([
      "webhook",
      "update",
      "wh_123",
      "--event",
      "bundle.updated",
      "--is-enabled",
      "false"
    ], {
      updateWebhookCommand
    });

    await runCli([
      "webhook",
      "delete",
      "wh_123",
      "--auth-file",
      "/tmp/auth.json"
    ], {
      deleteWebhookCommand
    });

    await runCli([
      "webhook",
      "deliveries",
      "wh_123",
      "--limit",
      "10",
      "--json"
    ], {
      listWebhookDeliveriesCommand
    });

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
      events: ["bundle.updated"],
      isEnabled: false
    });
    expect(deleteWebhookCommand).toHaveBeenCalledWith({
      webhookId: "wh_123",
      authFilePath: "/tmp/auth.json"
    });
    expect(listWebhookDeliveriesCommand).toHaveBeenCalledWith({
      webhookId: "wh_123",
      limit: 10,
      json: true
    });
  });

  it("routes alert commands with parsed fields and auth options", async () => {
    const listAlertsCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "alert-list" });
    const createAlertCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "alert-create" });
    const updateAlertCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "alert-update" });
    const deleteAlertCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "alert-delete" });

    await runCli([
      "alert",
      "list",
      "--project-id",
      "proj_123",
      "--limit",
      "20",
      "--auth-file",
      "/tmp/auth.json",
      "--json"
    ], {
      listAlertsCommand
    });

    await runCli([
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
      "--config-json",
      '{"to":"oncall@example.com"}',
      "--is-enabled",
      "true",
      "--json"
    ], {
      createAlertCommand
    });

    await runCli([
      "alert",
      "update",
      "al_123",
      "--service-id",
      "null",
      "--severity-min",
      "null",
      "--config-json",
      '{"channel":"eng-alerts"}',
      "--is-enabled",
      "false"
    ], {
      updateAlertCommand
    });

    await runCli([
      "alert",
      "delete",
      "al_123",
      "--auth-file",
      "/tmp/auth.json"
    ], {
      deleteAlertCommand
    });

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
      config: {
        to: "oncall@example.com"
      },
      isEnabled: true,
      json: true
    });
    expect(updateAlertCommand).toHaveBeenCalledWith({
      alertId: "al_123",
      serviceId: null,
      severityMin: null,
      config: {
        channel: "eng-alerts"
      },
      isEnabled: false
    });
    expect(deleteAlertCommand).toHaveBeenCalledWith({
      alertId: "al_123",
      authFilePath: "/tmp/auth.json"
    });
  });

  it("routes minimal command inputs without optional fields", async () => {
    const analyzeCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "analyze-min" });
    const doctorCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "doctor-min" });
    const setupCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "setup-min" });
    const connectCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "connect-min" });
    const validateCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "validate-min" });
    const profileValidateCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "profile-min" });
    const verifyCloudCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "verify-cloud-min" });
    const smokeCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "smoke-min" });
    const loginCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "login-min" });
    const listIncidentsCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "incidents-min" });
    const getLogsCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "logs-min" });
    const listServicesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "services-min" });
    const whoamiCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "whoami-min" });
    const listProjectTokensCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "project-list-min" });
    const listMemberTokensCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "member-list-min" });
    const listAlertsCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "alert-list-min" });
    const createAlertCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "alert-create-min" });
    const updateAlertCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "alert-update-min" });
    const deleteAlertCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "alert-delete-min" });
    const listWebhooksCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-list-min" });
    const createWebhookCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-create-min" });
    const updateWebhookCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-update-min" });
    const deleteWebhookCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-delete-min" });
    const testWebhookCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-test-min" });
    const listWebhookDeliveriesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-deliveries-min" });

    await runCli(["--help"]);
    await runCli(["analyze"], { analyzeCommand });
    await runCli(["doctor"], { doctorCommand });
    await runCli(["setup"], { setupCommand });
    await runCli(["connect"], { connectCommand });
    await runCli(["validate"], { validateCommand });
    await runCli(["profile", "validate"], { profileValidateCommand });
    await runCli(["verify", "cloud", "--project-id", "proj_123"], { verifyCloudCommand });
    await runCli(["smoke", "--project-id", "proj_123"], { smokeCommand });
    await runCli(["login", "--github"], { loginCommand });
    await runCli(["incidents"], { listIncidentsCommand });
    await runCli(["logs", "inc_123"], { getLogsCommand });
    await runCli(["services", "--project-id", "proj_123"], { listServicesCommand });
    await runCli(["whoami"], { whoamiCommand });
    await runCli(["token", "project", "list", "proj_123"], { listProjectTokensCommand });
    await runCli(["token", "member", "list"], { listMemberTokensCommand });
    await runCli(["alert", "list", "--project-id", "proj_123"], { listAlertsCommand });
    await runCli([
      "alert",
      "create",
      "--project-id",
      "proj_123",
      "--channel",
      "email",
      "--condition",
      "new_incident",
      "--config-json",
      '{"to":"owner@example.com"}'
    ], { createAlertCommand });
    await runCli(["alert", "update", "al_123", "--is-enabled", "false"], { updateAlertCommand });
    await runCli(["alert", "delete", "al_123"], { deleteAlertCommand });
    await runCli(["webhook", "list", "--project-id", "proj_123"], { listWebhooksCommand });
    await runCli([
      "webhook",
      "create",
      "--project-id",
      "proj_123",
      "--url",
      "https://hooks.example.test/debugbundle",
      "--event",
      "bundle.created"
    ], { createWebhookCommand });
    await runCli(["webhook", "update", "wh_123", "--is-enabled", "false"], { updateWebhookCommand });
    await runCli(["webhook", "delete", "wh_123"], { deleteWebhookCommand });
    await runCli(["webhook", "test", "wh_123"], { testWebhookCommand });
    await runCli(["webhook", "deliveries", "wh_123"], { listWebhookDeliveriesCommand });

    expect(analyzeCommand).toHaveBeenCalledWith({});
    expect(doctorCommand).toHaveBeenCalledWith({});
    expect(setupCommand).toHaveBeenCalledWith({});
    expect(connectCommand).toHaveBeenCalledWith({});
    expect(validateCommand).toHaveBeenCalledWith({});
    expect(profileValidateCommand).toHaveBeenCalledWith({});
    expect(verifyCloudCommand).toHaveBeenCalledWith({ projectId: "proj_123" });
    expect(smokeCommand).toHaveBeenCalledWith({ projectId: "proj_123" });
    expect(loginCommand).toHaveBeenCalledWith({ github: true });
    expect(listIncidentsCommand).toHaveBeenCalledWith({});
    expect(getLogsCommand).toHaveBeenCalledWith({ incidentId: "inc_123" });
    expect(listServicesCommand).toHaveBeenCalledWith({ projectId: "proj_123" });
    expect(whoamiCommand).toHaveBeenCalledWith({});
    expect(listProjectTokensCommand).toHaveBeenCalledWith({ projectId: "proj_123" });
    expect(listMemberTokensCommand).toHaveBeenCalledWith({});
    expect(listAlertsCommand).toHaveBeenCalledWith({ projectId: "proj_123" });
    expect(createAlertCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      channel: "email",
      conditionType: "new_incident",
      config: {
        to: "owner@example.com"
      }
    });
    expect(updateAlertCommand).toHaveBeenCalledWith({ alertId: "al_123", isEnabled: false });
    expect(deleteAlertCommand).toHaveBeenCalledWith({ alertId: "al_123" });
    expect(listWebhooksCommand).toHaveBeenCalledWith({ projectId: "proj_123" });
    expect(createWebhookCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      url: "https://hooks.example.test/debugbundle",
      events: ["bundle.created"]
    });
    expect(updateWebhookCommand).toHaveBeenCalledWith({ webhookId: "wh_123", isEnabled: false });
    expect(deleteWebhookCommand).toHaveBeenCalledWith({ webhookId: "wh_123" });
    expect(testWebhookCommand).toHaveBeenCalledWith({ webhookId: "wh_123" });
    expect(listWebhookDeliveriesCommand).toHaveBeenCalledWith({ webhookId: "wh_123" });
  });

  it("returns validation errors for unknown commands and invalid option values", async () => {
    const unknownResult = await runCli(["unknown"]);
    const invalidLimitResult = await runCli(["incidents", "--limit", "abc"]);
    const invalidMaxAgeResult = await runCli(["verify", "cloud", "--project-id", "proj_123", "--max-age-minutes", "abc"]);
    const missingProjectIdResult = await runCli(["services", "--json"]);
    const unknownProfileResult = await runCli(["profile", "unknown"]);
    const unknownVerifyResult = await runCli(["verify", "unknown"]);
    const unknownTokenResult = await runCli(["token", "member", "unknown"]);
    const unknownAlertResult = await runCli(["alert", "unknown"]);
    const unknownWebhookResult = await runCli(["webhook", "unknown"]);
    const invalidAlertConfigResult = await runCli([
      "alert",
      "create",
      "--project-id",
      "proj_123",
      "--channel",
      "email",
      "--condition",
      "new_incident",
      "--config-json",
      "not-json"
    ]);
    const missingValueResult = await runCli(["analyze", "--type="]);
    const genericFailureResult = await runCli(["doctor"], {
      doctorCommand: vi.fn().mockRejectedValue(new Error("doctor_failed"))
    });

    expect(unknownResult.exitCode).toBe(4);
    expect(unknownResult.output).toContain("Unknown command");
    expect(invalidLimitResult.exitCode).toBe(4);
    expect(invalidLimitResult.output).toContain("Invalid value for --limit");
    expect(invalidMaxAgeResult.output).toContain("Invalid value for --max-age-minutes");
    expect(missingProjectIdResult.output).toContain("Missing required option --project-id");
    expect(unknownProfileResult.output).toContain("Unknown profile command");
    expect(unknownVerifyResult.output).toContain("Unknown verify command");
    expect(unknownTokenResult.output).toContain("Unknown token command");
    expect(unknownAlertResult.output).toContain("Unknown alert command");
    expect(unknownWebhookResult.output).toContain("Unknown webhook command");
    expect(invalidAlertConfigResult.output).toContain("Invalid value for --config-json");
    expect(missingValueResult.output).toContain("Missing value for --type");
    expect(genericFailureResult).toEqual({
      exitCode: 1,
      output: "doctor_failed"
    });
  });

  it("returns string failures from command handlers", async () => {
    const result = await runCli(["doctor"], {
      doctorCommand: vi.fn().mockRejectedValue("doctor_failed_string")
    });

    expect(result).toEqual({
      exitCode: 1,
      output: "doctor_failed_string"
    });
  });

  it("validates missing required options and extra positional arguments across commands", async () => {
    const analyzeUnknownOption = await runCli(["analyze", "--unknown", "value"]);
    const verifyCloudMissingProject = await runCli(["verify", "cloud"]);
    const smokeMissingProject = await runCli(["smoke"]);
    const loginMissingToken = await runCli(["login"]);
    const tokenProjectMissingLabel = await runCli(["token", "project", "create", "proj_123"]);
    const tokenMemberMissingLabel = await runCli(["token", "member", "create"]);
    const webhookListMissingProject = await runCli(["webhook", "list"]);
    const webhookCreateMissingUrl = await runCli(["webhook", "create", "--project-id", "proj_123", "--event", "bundle.created"]);
    const webhookCreateMissingEvent = await runCli(["webhook", "create", "--project-id", "proj_123", "--url", "https://hooks.example.test/debugbundle"]);
    const webhookUpdateWithoutChanges = await runCli(["webhook", "update", "wh_123"]);
    const inspectExtraPositional = await runCli(["inspect", "inc_123", "extra"]);
    const logsExtraPositional = await runCli(["logs", "inc_123", "extra"]);

    expect(analyzeUnknownOption.output).toContain("Unknown option --unknown.");
    expect(verifyCloudMissingProject.output).toContain("Missing required option --project-id.");
    expect(smokeMissingProject.output).toContain("Missing required option --project-id.");
    expect(loginMissingToken.output).toContain("Provide either a member token or one of --github, --github-cli, or --github-device.");
    expect(tokenProjectMissingLabel.output).toContain("Missing required option --label.");
    expect(tokenMemberMissingLabel.output).toContain("Missing required option --label.");
    expect(webhookListMissingProject.output).toContain("Missing required option --project-id.");
    expect(webhookCreateMissingUrl.output).toContain("Missing required option --url.");
    expect(webhookCreateMissingEvent.output).toContain("Missing required option --event.");
    expect(webhookUpdateWithoutChanges.output).toContain("At least one webhook field must be provided.");
    expect(inspectExtraPositional.output).toContain("Too many positional arguments.");
    expect(logsExtraPositional.output).toContain("Too many positional arguments.");
  });

  it("writes successful output to stdout and failures to stderr in main", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const setExitCode = vi.fn();

    await main({
      argv: ["whoami", "--json"],
      stdout,
      stderr,
      setExitCode,
      whoamiCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        output: '{"authenticated":true}'
      })
    });

    expect(stdout).toHaveBeenCalledWith('{"authenticated":true}\n');
    expect(stderr).not.toHaveBeenCalled();
    expect(setExitCode).toHaveBeenCalledWith(0);
  });

  it("writes failures to stderr and skips empty output in main", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const setExitCode = vi.fn();

    await main({
      argv: ["doctor"],
      stdout,
      stderr,
      setExitCode,
      doctorCommand: vi.fn().mockResolvedValue({
        exitCode: 1,
        output: "doctor failed"
      })
    });

    await main({
      argv: ["whoami"],
      stdout,
      stderr,
      setExitCode,
      whoamiCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        output: ""
      })
    });

    expect(stderr).toHaveBeenCalledWith("doctor failed\n");
    expect(stdout).not.toHaveBeenCalledWith("\n");
    expect(setExitCode).toHaveBeenNthCalledWith(1, 1);
    expect(setExitCode).toHaveBeenNthCalledWith(2, 0);
  });

  it("uses process.exitCode when no exit-code handler is provided", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const previousExitCode = process.exitCode;

    process.exitCode = undefined;

    try {
      await main({
        argv: ["whoami"],
        stdout,
        stderr,
        whoamiCommand: vi.fn().mockResolvedValue({
          exitCode: 1,
          output: "auth failed"
        })
      });

      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
    }

    expect(stderr).toHaveBeenCalledWith("auth failed\n");
    expect(stdout).not.toHaveBeenCalled();
  });

  it("uses process stdout and stderr defaults when stream handlers are omitted", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const previousExitCode = process.exitCode;

    process.exitCode = undefined;

    try {
      await main({
        argv: ["whoami"],
        setExitCode: vi.fn(),
        whoamiCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          output: "signed in"
        })
      });

      await main({
        argv: ["doctor"],
        setExitCode: vi.fn(),
        doctorCommand: vi.fn().mockResolvedValue({
          exitCode: 1,
          output: "doctor failed"
        })
      });

      expect(stdoutWrite).toHaveBeenCalledWith("signed in\n");
      expect(stderrWrite).toHaveBeenCalledWith("doctor failed\n");
    } finally {
      process.exitCode = previousExitCode;
      stdoutWrite.mockRestore();
      stderrWrite.mockRestore();
    }
  });

  it("routes weekly-report CRUD arguments into the stored-auth wrappers", async () => {
    const listWeeklyReportChannelsCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "weekly-list" });
    const createWeeklyReportChannelCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "weekly-create" });
    const updateWeeklyReportChannelCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "weekly-update" });
    const deleteWeeklyReportChannelCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "weekly-delete" });

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

    expect(listWeeklyReportChannelsCommand).toHaveBeenCalledWith({ projectId: "proj_123", limit: 5, json: true });
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
    expect(deleteWeeklyReportChannelCommand).toHaveBeenCalledWith({ channelId: "wr_123", json: true });
  });

  it("validates weekly-report input requirements", async () => {
    const missingProject = await runCli(["weekly-report", "list"]);
    const missingCreateFields = await runCli(["weekly-report", "create", "--project-id", "proj_123"]);
    const partialSchedule = await runCli(["weekly-report", "update", "wr_123", "--day-of-week", "monday"]);
    const noChanges = await runCli(["weekly-report", "update", "wr_123"]);
    const unknownAction = await runCli(["weekly-report", "unknown"]);

    expect(missingProject.output).toContain("Missing required option --project-id.");
    expect(missingCreateFields.output).toContain("Missing required option --channel.");
    expect(partialSchedule.output).toContain("Weekly report schedule updates require --day-of-week, --hour-of-day, and --timezone together.");
    expect(noChanges.output).toContain("At least one weekly report field must be provided.");
    expect(unknownAction.output).toContain("Unknown weekly-report command.");
  });

  it("routes webhook create filters and retry arguments", async () => {
    const createWebhookCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-create" });
    const retryWebhookDeliveryCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-retry" });

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
    await runCli(["webhook", "retry", "wh_123", "del_123", "--json"], {
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
    expect(retryWebhookDeliveryCommand).toHaveBeenCalledWith({ webhookId: "wh_123", deliveryId: "del_123", json: true });
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
    const listWebhookDeliveriesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-deliveries" });

    await runCli(["webhook", "test", "wh_123", "--event", "verification.failed", "--json"], {
      testWebhookCommand
    });
    await runCli(["webhook", "deliveries", "wh_123", "--limit", "3"], {
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

    expect(testWebhookCommand).toHaveBeenCalledWith({ webhookId: "wh_123", eventType: "verification.failed", json: true });
    expect(listWebhookDeliveriesCommand).toHaveBeenCalledWith({ webhookId: "wh_123", limit: 3 });
    expect(invalidWeeklyEnabled.output).toContain("Invalid value for --is-enabled.");
  });

  it("rejects unknown options on weekly-report routes", async () => {
    const result = await runCli(["weekly-report", "list", "--project-id", "proj_123", "--unknown", "value"]);

    expect(result.output).toContain("Unknown option --unknown.");
  });
});
