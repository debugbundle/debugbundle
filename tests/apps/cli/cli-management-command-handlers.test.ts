import { describe, expect, it, vi } from "vitest";

import { parseArgv } from "../../../apps/cli/src/argv-helpers.js";
import {
  handleAlertCommand,
  handleBillingCommand,
  handleCapturePolicyCommand,
  handleGithubCommand,
  handleMemberCommand,
  handleProbeCommand,
  handleProjectCommand,
  handleTokenCommand,
  handleWebhookCommand,
  handleWeeklyReportCommand
} from "../../../apps/cli/src/management-command-handlers.js";

describe("cli management command handlers", () => {
  it("requires --config-json to decode to an object for alert creation", async () => {
    await expect(
      handleAlertCommand(parseArgv(["alerts", "create", "--project-id", "proj_1", "--channel", "email", "--condition", "new_incident", "--config-json", '"oops"']), {})
    ).rejects.toThrow("Missing required option --config-json.");
  });

  it("forwards parsed alert creation inputs including config objects", async () => {
    const createAlertCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: "Alert created: al_1"
    });

    const result = await handleAlertCommand(
      parseArgv([
        "alerts",
        "create",
        "--project-id",
        "proj_1",
        "--service-id",
        "svc_1",
        "--channel",
        "webhook",
        "--condition",
        "severity_threshold",
        "--severity-min",
        "high",
        "--config-json",
        '{"target_url":"https://hooks.example.test/alerts"}',
        "--is-enabled",
        "false",
        "--json"
      ]),
      {
        createAlertCommand
      }
    );

    expect(result).toEqual({
      exitCode: 0,
      output: "Alert created: al_1"
    });
    expect(createAlertCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      projectId: "proj_1",
      serviceId: "svc_1",
      channel: "webhook",
      conditionType: "severity_threshold",
      severityMin: "high",
      json: true,
      config: {
        target_url: "https://hooks.example.test/alerts"
      },
      isEnabled: false
    });
  });

  it("forwards probe activation, listing, and deactivation inputs", async () => {
    const activateProbeCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "activated" });
    const listActiveProbesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "listed" });
    const deactivateProbeCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "deactivated" });

    await handleProbeCommand(
      parseArgv([
        "probes",
        "activate",
        "proj_1",
        "--label-pattern",
        "checkout*",
        "--service",
        "checkout-api",
        "--environment",
        "production",
        "--ttl-seconds",
        "60",
        "--trigger-ttl-seconds",
        "15"
      ]),
      { activateProbeCommand }
    );
    await handleProbeCommand(parseArgv(["probes", "list", "proj_1", "--json"]), { listActiveProbesCommand });
    await handleProbeCommand(parseArgv(["probes", "deactivate", "proj_1", "act_1"]), { deactivateProbeCommand });

    expect(activateProbeCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      projectId: "proj_1",
      labelPattern: "checkout*",
      service: "checkout-api",
      environment: "production",
      ttlSeconds: 60,
      triggerTtlSeconds: 15
    });
    expect(listActiveProbesCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: true, projectId: "proj_1" });
    expect(deactivateProbeCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      projectId: "proj_1",
      activationId: "act_1"
    });
  });

  it("forwards member management inputs and validates required role input", async () => {
    const listMembersCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "members" });
    const listInvitesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "invites" });
    const inviteMemberCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "invite" });
    const cancelInviteCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "cancel" });
    const updateMemberRoleCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "role" });
    const removeMemberCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "remove" });

    await handleMemberCommand(parseArgv(["members", "list"]), { listMembersCommand });
    await handleMemberCommand(parseArgv(["members", "invites", "--json"]), { listInvitesCommand });
    await handleMemberCommand(parseArgv(["members", "invite", "--email", "owner@example.com", "--role", "owner"]), {
      inviteMemberCommand
    });
    await handleMemberCommand(parseArgv(["members", "cancel-invite", "inv_1"]), { cancelInviteCommand });
    await handleMemberCommand(parseArgv(["members", "update-role", "usr_1", "--role", "member"]), {
      updateMemberRoleCommand
    });
    await handleMemberCommand(parseArgv(["members", "remove", "usr_1"]), { removeMemberCommand });

    await expect(handleMemberCommand(parseArgv(["members", "invite", "--email", "owner@example.com"]), {})).rejects.toThrow(
      "Missing required option --role."
    );

    expect(listMembersCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: undefined });
    expect(listInvitesCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: true });
    expect(inviteMemberCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      email: "owner@example.com",
      role: "owner"
    });
    expect(cancelInviteCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: undefined, inviteId: "inv_1" });
    expect(updateMemberRoleCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      userId: "usr_1",
      role: "member"
    });
    expect(removeMemberCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: undefined, userId: "usr_1" });
  });

  it("forwards GitHub management inputs across status, deliveries, rules, and repo actions", async () => {
    const getGitHubStatusCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "status" });
    const listGitHubRepositoriesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "repos" });
    const listProjectGitHubDeliveriesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "deliveries" });
    const retryProjectGitHubDeliveryCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "retry" });
    const listProjectGitHubRulesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "rules" });
    const createProjectGitHubRuleCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "rule-create" });
    const updateProjectGitHubRuleCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "rule-update" });
    const deleteProjectGitHubRuleCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "rule-delete" });
    const setProjectGitHubRepoCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "repo-set" });
    const removeProjectGitHubRepoCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "repo-remove" });

    await handleGithubCommand(parseArgv(["github", "status", "--project-id", "proj_1", "--json"]), { getGitHubStatusCommand });
    await handleGithubCommand(parseArgv(["github", "repos", "--json"]), { listGitHubRepositoriesCommand });
    await handleGithubCommand(parseArgv(["github", "deliveries", "--project-id", "proj_1", "--status", "failed", "--limit", "10"]), {
      listProjectGitHubDeliveriesCommand
    });
    await handleGithubCommand(parseArgv(["github", "deliveries", "retry", "del_1", "--project-id", "proj_1"]), {
      retryProjectGitHubDeliveryCommand
    });
    await handleGithubCommand(parseArgv(["github", "rules", "--project-id", "proj_1"]), { listProjectGitHubRulesCommand });
    await handleGithubCommand(
      parseArgv([
        "github",
        "rules",
        "create",
        "--project-id",
        "proj_1",
        "--name",
        "Critical production failures",
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
        "--incident-status",
        "new_only",
        "--cooldown",
        "120",
        "--enabled",
        "false"
      ]),
      { createProjectGitHubRuleCommand }
    );
    await handleGithubCommand(
      parseArgv([
        "github",
        "rules",
        "update",
        "rule_1",
        "--project-id",
        "proj_1",
        "--name",
        "Updated rule",
        "--event",
        "bundle.created",
        "--enabled",
        "true"
      ]),
      { updateProjectGitHubRuleCommand }
    );
    await handleGithubCommand(parseArgv(["github", "rules", "delete", "rule_1", "--project-id", "proj_1"]), {
      deleteProjectGitHubRuleCommand
    });
    await handleGithubCommand(parseArgv(["github", "repo", "set", "owner/repo", "--project-id", "proj_1"]), {
      setProjectGitHubRepoCommand
    });
    await handleGithubCommand(parseArgv(["github", "repo", "remove", "--project-id", "proj_1"]), {
      removeProjectGitHubRepoCommand
    });

    expect(getGitHubStatusCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: true, projectId: "proj_1" });
    expect(listGitHubRepositoriesCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: true });
    expect(listProjectGitHubDeliveriesCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      projectId: "proj_1",
      status: "failed",
      limit: 10
    });
    expect(retryProjectGitHubDeliveryCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      projectId: "proj_1",
      deliveryId: "del_1"
    });
    expect(listProjectGitHubRulesCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: undefined, projectId: "proj_1" });
    expect(createProjectGitHubRuleCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      projectId: "proj_1",
      name: "Critical production failures",
      eventTypes: ["bundle.created", "bundle.updated"],
      environments: ["production", "staging"],
      services: ["checkout-api"],
      severityMin: "high",
      bundleType: "failure",
      incidentStatus: "new_only",
      cooldownSeconds: 120,
      enabled: false
    });
    expect(updateProjectGitHubRuleCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      projectId: "proj_1",
      ruleId: "rule_1",
      name: "Updated rule",
      eventTypes: ["bundle.created"],
      enabled: true
    });
    expect(deleteProjectGitHubRuleCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: undefined, projectId: "proj_1", ruleId: "rule_1" });
    expect(setProjectGitHubRepoCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: undefined, projectId: "proj_1", repoRef: "owner/repo" });
    expect(removeProjectGitHubRepoCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: undefined, projectId: "proj_1" });
  });

  it("forwards GitHub commands when optional status and rule fields are omitted or expanded", async () => {
    const getGitHubStatusCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "status" });
    const listProjectGitHubDeliveriesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "deliveries" });
    const createProjectGitHubRuleCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "rule-create" });
    const updateProjectGitHubRuleCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "rule-update" });

    await handleGithubCommand(parseArgv(["github", "status"]), { getGitHubStatusCommand });
    await handleGithubCommand(parseArgv(["github", "deliveries", "--project-id", "proj_1", "--json"]), {
      listProjectGitHubDeliveriesCommand
    });
    await handleGithubCommand(
      parseArgv([
        "github",
        "rules",
        "create",
        "--project-id",
        "proj_1",
        "--name",
        "Minimal rule",
        "--event",
        "bundle.created",
        "--severity-min",
        "medium",
        "--bundle-type",
        "improvement"
      ]),
      { createProjectGitHubRuleCommand }
    );
    await handleGithubCommand(
      parseArgv([
        "github",
        "rules",
        "update",
        "rule_2",
        "--project-id",
        "proj_1",
        "--environment",
        "production,staging",
        "--service",
        "checkout-api,worker",
        "--severity-min",
        "critical",
        "--bundle-type",
        "failure",
        "--incident-status",
        "reopened_only",
        "--cooldown",
        "900"
      ]),
      { updateProjectGitHubRuleCommand }
    );

    expect(getGitHubStatusCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: undefined });
    expect(listProjectGitHubDeliveriesCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: true,
      projectId: "proj_1"
    });
    expect(createProjectGitHubRuleCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      projectId: "proj_1",
      name: "Minimal rule",
      eventTypes: ["bundle.created"],
      environments: [],
      services: [],
      severityMin: "medium",
      bundleType: "improvement",
      incidentStatus: "new_or_reopened",
      cooldownSeconds: 300
    });
    expect(updateProjectGitHubRuleCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      projectId: "proj_1",
      ruleId: "rule_2",
      environments: ["production", "staging"],
      services: ["checkout-api", "worker"],
      severityMin: "critical",
      bundleType: "failure",
      incidentStatus: "reopened_only",
      cooldownSeconds: 900
    });
  });

  it("forwards billing, project, token, capture policy, webhook, and weekly report inputs", async () => {
    const getBillingSummaryCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "billing" });
    const increaseBillingCapacityCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "inc" });
    const scheduleBillingCapacityReductionCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "schedule" });
    const cancelBillingCapacityReductionCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "cancel" });
    const listProjectsCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "projects" });
    const createProjectCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "project-create" });
    const updateProjectCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "project-update" });
    const deleteProjectCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "project-delete" });
    const listProjectTokensCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "project-token-list" });
    const createProjectTokenCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "project-token-create" });
    const revokeProjectTokenCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "project-token-revoke" });
    const listMemberTokensCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "member-token-list" });
    const createMemberTokenCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "member-token-create" });
    const revokeMemberTokenCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "member-token-revoke" });
    const getCapturePolicyCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "policy-get" });
    const setCapturePolicyCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "policy-set" });
    const listWebhooksCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-list" });
    const createWebhookCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-create" });
    const updateWebhookCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-update" });
    const deleteWebhookCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-delete" });
    const testWebhookCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-test" });
    const listWebhookDeliveriesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-deliveries" });
    const retryWebhookDeliveryCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "webhook-retry" });
    const listWeeklyReportChannelsCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "weekly-list" });
    const createWeeklyReportChannelCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "weekly-create" });
    const updateWeeklyReportChannelCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "weekly-update" });
    const deleteWeeklyReportChannelCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "weekly-delete" });

    await handleBillingCommand(parseArgv(["billing", "get", "--json"]), { getBillingSummaryCommand });
    await handleBillingCommand(parseArgv(["billing", "capacity", "increase", "--target-additional-capacity-units", "2"]), {
      increaseBillingCapacityCommand
    });
    await handleBillingCommand(parseArgv(["billing", "capacity", "schedule-reduction", "--target-additional-capacity-units", "1"]), {
      scheduleBillingCapacityReductionCommand
    });
    await handleBillingCommand(parseArgv(["billing", "capacity", "cancel-reduction"]), { cancelBillingCapacityReductionCommand });

    await handleProjectCommand(parseArgv(["projects", "list", "--limit", "15", "--json"]), { listProjectsCommand });
    await handleProjectCommand(parseArgv(["projects", "create", "--name", "Checkout App", "--slug", "checkout-app", "--environment-default", "production"]), {
      createProjectCommand
    });
    await handleProjectCommand(parseArgv(["projects", "update", "proj_1", "--name", "Checkout API", "--environment-default", "staging"]), {
      updateProjectCommand
    });
    await handleProjectCommand(parseArgv(["projects", "delete", "proj_1", "--json"]), { deleteProjectCommand });

    await handleTokenCommand(parseArgv(["tokens", "project", "list", "proj_1", "--limit", "20"]), { listProjectTokensCommand });
    await handleTokenCommand(parseArgv(["tokens", "project", "create", "proj_1", "--label", "CI token", "--json"]), { createProjectTokenCommand });
    await handleTokenCommand(parseArgv(["tokens", "project", "revoke", "proj_1", "tok_1"]), { revokeProjectTokenCommand });
    await handleTokenCommand(parseArgv(["tokens", "member", "list", "--limit", "10", "--json"]), { listMemberTokensCommand });
    await handleTokenCommand(parseArgv(["tokens", "member", "create", "--label", "Local MCP"]), { createMemberTokenCommand });
    await handleTokenCommand(parseArgv(["tokens", "member", "revoke", "tok_2", "--json"]), { revokeMemberTokenCommand });

    await handleCapturePolicyCommand(parseArgv(["capture-policy", "get", "--project", "proj_1", "--json"]), { getCapturePolicyCommand });
    await handleCapturePolicyCommand(
      parseArgv([
        "capture-policy",
        "set",
        "--project",
        "proj_1",
        "--preset",
        "balanced",
        "--override",
        "capture_logs=false",
        "--override",
        "capture_probe_events=null"
      ]),
      { setCapturePolicyCommand }
    );

    await handleWebhookCommand(parseArgv(["webhooks", "list", "--project-id", "proj_1", "--limit", "8"]), { listWebhooksCommand });
    await handleWebhookCommand(
      parseArgv([
        "webhooks",
        "create",
        "--project-id",
        "proj_1",
        "--url",
        "https://hooks.example.test/alerts",
        "--event",
        "bundle.created,verification.failed",
        "--environment",
        "production,staging",
        "--service",
        "checkout-api",
        "--severity-min",
        "high",
        "--bundle-type",
        "failure,improvement",
        "--verification",
        "true",
        "--is-enabled",
        "false"
      ]),
      { createWebhookCommand }
    );
    await handleWebhookCommand(
      parseArgv([
        "webhooks",
        "update",
        "wh_1",
        "--url",
        "https://hooks.example.test/updated",
        "--event",
        "bundle.updated",
        "--is-enabled",
        "true"
      ]),
      { updateWebhookCommand }
    );
    await handleWebhookCommand(parseArgv(["webhooks", "delete", "wh_1", "--json"]), { deleteWebhookCommand });
    await handleWebhookCommand(parseArgv(["webhooks", "test", "wh_1"]), { testWebhookCommand });
    await handleWebhookCommand(parseArgv(["webhooks", "deliveries", "wh_1", "--limit", "6"]), { listWebhookDeliveriesCommand });
    await handleWebhookCommand(parseArgv(["webhooks", "retry", "wh_1", "del_1", "--json"]), { retryWebhookDeliveryCommand });

    await handleWeeklyReportCommand(parseArgv(["weekly-report", "list", "--project-id", "proj_1", "--limit", "4", "--json"]), {
      listWeeklyReportChannelsCommand
    });
    await handleWeeklyReportCommand(
      parseArgv([
        "weekly-report",
        "create",
        "--project-id",
        "proj_1",
        "--channel",
        "slack",
        "--day-of-week",
        "monday",
        "--hour-of-day",
        "9",
        "--timezone",
        "UTC",
        "--config-json",
        '{"webhook_url":"https://hooks.example.test/weekly"}',
        "--is-enabled",
        "false"
      ]),
      { createWeeklyReportChannelCommand }
    );
    await handleWeeklyReportCommand(
      parseArgv([
        "weekly-report",
        "update",
        "wr_1",
        "--day-of-week",
        "friday",
        "--hour-of-day",
        "14",
        "--timezone",
        "America/New_York",
        "--config-json",
        '{"to":["alerts@example.com"]}',
        "--is-enabled",
        "true"
      ]),
      { updateWeeklyReportChannelCommand }
    );
    await handleWeeklyReportCommand(parseArgv(["weekly-report", "delete", "wr_1"]), { deleteWeeklyReportChannelCommand });
    await handleWeeklyReportCommand(
      parseArgv([
        "weekly-report",
        "create",
        "--project-id",
        "proj_1",
        "--channel",
        "slack",
        "--day-of-week",
        "wednesday",
        "--hour-of-day",
        "7",
        "--timezone",
        "UTC",
        "--config-json",
        '{"slack_destination_id":"sd_123"}'
      ]),
      { createWeeklyReportChannelCommand }
    );
    await handleWeeklyReportCommand(
      parseArgv([
        "weekly-report",
        "update",
        "wr_2",
        "--config-json",
        '{"slack_destination_id":"sd_456"}'
      ]),
      { updateWeeklyReportChannelCommand }
    );

    expect(getBillingSummaryCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: true });
    expect(increaseBillingCapacityCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: undefined, targetAdditionalCapacityUnits: 2 });
    expect(scheduleBillingCapacityReductionCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: undefined, targetAdditionalCapacityUnits: 1 });
    expect(cancelBillingCapacityReductionCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: undefined });

    expect(listProjectsCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: true, limit: 15 });
    expect(createProjectCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: undefined, name: "Checkout App", slug: "checkout-app", environmentDefault: "production" });
    expect(updateProjectCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: undefined, projectId: "proj_1", name: "Checkout API", environmentDefault: "staging" });
    expect(deleteProjectCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: true, projectId: "proj_1" });

    expect(listProjectTokensCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: undefined, projectId: "proj_1", limit: 20 });
    expect(createProjectTokenCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: true, projectId: "proj_1", label: "CI token" });
    expect(revokeProjectTokenCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: undefined, projectId: "proj_1", tokenId: "tok_1" });
    expect(listMemberTokensCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: true, limit: 10 });
    expect(createMemberTokenCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: undefined, label: "Local MCP" });
    expect(revokeMemberTokenCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: true, tokenId: "tok_2" });

    expect(getCapturePolicyCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: true, projectId: "proj_1" });
    expect(setCapturePolicyCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      projectId: "proj_1",
      update: {
        preset: "balanced",
        capture_logs: "false",
        capture_probe_events: null
      }
    });

    expect(listWebhooksCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: undefined, projectId: "proj_1", limit: 8 });
    expect(createWebhookCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      projectId: "proj_1",
      url: "https://hooks.example.test/alerts",
      events: ["bundle.created", "verification.failed"],
      filters: {
        environment: ["production", "staging"],
        service: ["checkout-api"],
        severity_min: "high",
        bundle_type: ["failure", "improvement"],
        verification: true
      },
      isEnabled: false
    });
    expect(updateWebhookCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      webhookId: "wh_1",
      url: "https://hooks.example.test/updated",
      events: ["bundle.updated"],
      isEnabled: true
    });
    expect(deleteWebhookCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: true, webhookId: "wh_1" });
    expect(testWebhookCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: undefined, webhookId: "wh_1" });
    expect(listWebhookDeliveriesCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: undefined, webhookId: "wh_1", limit: 6 });
    expect(retryWebhookDeliveryCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: true, webhookId: "wh_1", deliveryId: "del_1" });

    expect(listWeeklyReportChannelsCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: true, projectId: "proj_1", limit: 4 });
    expect(createWeeklyReportChannelCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      projectId: "proj_1",
      channel: "slack",
      config: { webhookUrl: "https://hooks.example.test/weekly" },
      schedule: { dayOfWeek: "monday", hourOfDay: 9, timezone: "UTC" },
      isEnabled: false
    });
    expect(updateWeeklyReportChannelCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      channelId: "wr_1",
      schedule: { dayOfWeek: "friday", hourOfDay: 14, timezone: "America/New_York" },
      config: { to: ["alerts@example.com"] },
      isEnabled: true
    });
    expect(deleteWeeklyReportChannelCommand).toHaveBeenCalledWith({ authFilePath: undefined, json: undefined, channelId: "wr_1" });
    expect(createWeeklyReportChannelCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      projectId: "proj_1",
      channel: "slack",
      config: { slackDestinationId: "sd_123" },
      schedule: { dayOfWeek: "wednesday", hourOfDay: 7, timezone: "UTC" }
    });
    expect(updateWeeklyReportChannelCommand).toHaveBeenCalledWith({
      authFilePath: undefined,
      json: undefined,
      channelId: "wr_2",
      config: { slackDestinationId: "sd_456" }
    });
  });

  it("rejects invalid management subcommands and missing required options across handlers", async () => {
    await expect(handleGithubCommand(parseArgv(["github", "deliveries", "unknown", "--project-id", "proj_1"]), {})).rejects.toThrow(
      "Unknown github deliveries command."
    );
    await expect(handleGithubCommand(parseArgv(["github", "unknown"]), {})).rejects.toThrow("Unknown github command.");
    await expect(handleGithubCommand(parseArgv(["github", "repo", "set", "owner/repo"]), {})).rejects.toThrow(
      "Missing required option --project-id."
    );

    await expect(handleBillingCommand(parseArgv(["billing", "capacity", "increase"]), {})).rejects.toThrow(
      "Missing required option --target-additional-capacity-units."
    );
    await expect(handleBillingCommand(parseArgv(["billing", "unknown"]), {})).rejects.toThrow("Unknown billing command.");

    await expect(handleProjectCommand(parseArgv(["projects", "create", "--slug", "proj-1"]), {})).rejects.toThrow(
      "Missing required option --name."
    );
    await expect(handleProjectCommand(parseArgv(["projects", "update", "proj_1"]), {})).rejects.toThrow(
      "At least one project field must be provided."
    );

    await expect(handleTokenCommand(parseArgv(["tokens", "project", "create", "proj_1"]), {})).rejects.toThrow(
      "Missing required option --label."
    );
    await expect(handleTokenCommand(parseArgv(["tokens", "unknown", "list"]), {})).rejects.toThrow("Unknown token command.");

    await expect(handleCapturePolicyCommand(parseArgv(["capture-policy", "get"]), {})).rejects.toThrow(
      "Missing required option --project."
    );
    await expect(
      handleCapturePolicyCommand(parseArgv(["capture-policy", "set", "--project", "proj_1", "--override", "broken"]), {})
    ).rejects.toThrow("Invalid value for --override.");

    await expect(handleProbeCommand(parseArgv(["probes", "activate", "proj_1"]), {})).rejects.toThrow(
      "Missing required option --label-pattern."
    );
    await expect(handleProbeCommand(parseArgv(["probes", "unknown", "proj_1"]), {})).rejects.toThrow("Unknown probe command.");

    await expect(handleWebhookCommand(parseArgv(["webhooks", "create", "--project-id", "proj_1", "--url", "https://example.com"]), {})).rejects.toThrow(
      "Missing required option --event."
    );
    await expect(handleWebhookCommand(parseArgv(["webhooks", "test", "wh_1", "--event", "invalid-event"]), {})).rejects.toThrow(
      "Invalid value for --event."
    );

    await expect(
      handleWeeklyReportCommand(parseArgv(["weekly-report", "create", "--project-id", "proj_1", "--channel", "email"]), {})
    ).rejects.toThrow("Missing required option --day-of-week.");
    await expect(
      handleWeeklyReportCommand(
        parseArgv(["weekly-report", "update", "weekly_1", "--day-of-week", "monday", "--hour-of-day", "9"]),
        {}
      )
    ).rejects.toThrow("Weekly report schedule updates require --day-of-week, --hour-of-day, and --timezone together.");
  });

  it("rejects additional invalid update flows across alerts, webhooks, github rules, members, and weekly reports", async () => {
    await expect(handleAlertCommand(parseArgv(["alerts", "update", "al_1"]), {})).rejects.toThrow(
      "At least one alert field must be provided."
    );
    await expect(handleAlertCommand(parseArgv(["alerts", "unknown"]), {})).rejects.toThrow("Unknown alert command.");

    await expect(handleWebhookCommand(parseArgv(["webhooks", "update", "wh_1"]), {})).rejects.toThrow(
      "At least one webhook field must be provided."
    );
    await expect(handleWebhookCommand(parseArgv(["webhooks", "unknown"]), {})).rejects.toThrow("Unknown webhook command.");

    await expect(handleGithubCommand(parseArgv(["github", "rules", "create", "--project-id", "proj_1"]), {})).rejects.toThrow(
      "Missing required GitHub rule options."
    );
    await expect(handleGithubCommand(parseArgv(["github", "rules", "unknown", "--project-id", "proj_1"]), {})).rejects.toThrow(
      "Unknown github rules command."
    );

    await expect(handleMemberCommand(parseArgv(["members", "invite", "--role", "owner"]), {})).rejects.toThrow(
      "Missing required option --email."
    );
    await expect(handleMemberCommand(parseArgv(["members", "unknown"]), {})).rejects.toThrow("Unknown member command.");

    await expect(
      handleWeeklyReportCommand(
        parseArgv(["weekly-report", "update", "weekly_1", "--config-json", '"not-an-object"']),
        {}
      )
    ).rejects.toThrow("Invalid value for --config-json.");
    await expect(handleWeeklyReportCommand(parseArgv(["weekly-report", "unknown"]), {})).rejects.toThrow(
      "Unknown weekly-report command."
    );
  });
});
