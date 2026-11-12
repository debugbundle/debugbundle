import { describe, expect, it, vi } from "vitest";

import { main, runCli } from "../../../apps/cli/src/main.js";

describe("cli main management routing", () => {
  it("routes Business through the existing no-card trial command", async () => {
    const startBillingTrialCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "trial" });
    const result = await runCli(["billing", "trial", "start", "--plan", "business", "--json"], {
      startBillingTrialCommand
    });
    expect(result.exitCode).toBe(0);
    expect(startBillingTrialCommand).toHaveBeenCalledExactlyOnceWith({
      targetPlan: "business",
      json: true
    });
  });
  it("routes nested token project and member commands", async () => {
    const createProjectTokenCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "created" });
    const revokeMemberTokenCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "revoked" });

    const projectResult = await runCli(
      [
        "token",
        "project",
        "create",
        "proj_123",
        "--label",
        "ci",
        "--auth-file",
        "/tmp/auth.json",
        "--json"
      ],
      {
        createProjectTokenCommand
      }
    );

    const memberResult = await runCli(["token", "member", "revoke", "mtok_123"], {
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

    const result = await runCli(
      ["project", "delete", "proj_123", "--auth-file", "/tmp/auth.json", "--json"],
      {
        deleteProjectCommand
      }
    );

    expect(deleteProjectCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(result.exitCode).toBe(0);
  });

  it("routes billing commands", async () => {
    const getBillingSummaryCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "billing-get" });
    const increaseBillingCapacityCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "billing-increase" });
    const scheduleBillingCapacityReductionCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "billing-reduce" });
    const cancelBillingCapacityReductionCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "billing-cancel" });

    await runCli(["billing", "get", "--auth-file", "/tmp/auth.json", "--json"], {
      getBillingSummaryCommand
    });

    await runCli(["billing", "capacity", "increase", "--target-additional-capacity-units", "4"], {
      increaseBillingCapacityCommand
    });

    await runCli(
      [
        "billing",
        "capacity",
        "schedule-reduction",
        "--target-additional-capacity-units",
        "1",
        "--auth-file",
        "/tmp/auth.json"
      ],
      {
        scheduleBillingCapacityReductionCommand
      }
    );

    await runCli(["billing", "capacity", "cancel-reduction", "--json"], {
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
    const listProjectTokensCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "project-list" });
    const revokeProjectTokenCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "project-revoke" });
    const listMemberTokensCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "member-list" });
    const createMemberTokenCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "member-create" });

    await runCli(["token", "project", "list", "proj_123", "--limit", "20", "--json"], {
      listProjectTokensCommand
    });

    await runCli(
      ["token", "project", "revoke", "proj_123", "ptok_123", "--auth-file", "/tmp/auth.json"],
      {
        revokeProjectTokenCommand
      }
    );

    await runCli(["token", "member", "list", "--limit", "15", "--auth-file", "/tmp/auth.json"], {
      listMemberTokensCommand
    });

    await runCli(["token", "member", "create", "--label", "cli", "--json"], {
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

  it("routes minimal command inputs without optional fields", async () => {
    const analyzeCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "analyze-min" });
    const doctorCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "doctor-min" });
    const setupCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "setup-min" });
    const connectCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "connect-min" });
    const validateCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "validate-min" });
    const profileValidateCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "profile-min" });
    const verifyCloudCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "verify-cloud-min" });
    const smokeCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "smoke-min" });
    const loginCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "login-min" });
    const listIncidentsCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "incidents-min" });
    const getLogsCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "logs-min" });
    const listServicesCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "services-min" });
    const whoamiCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "whoami-min" });
    const listProjectTokensCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "project-list-min" });
    const listMemberTokensCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "member-list-min" });
    const listAlertsCommand = vi.fn().mockResolvedValue({ exitCode: 0, output: "alert-list-min" });
    const createAlertCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "alert-create-min" });
    const updateAlertCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "alert-update-min" });
    const deleteAlertCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "alert-delete-min" });
    const listWebhooksCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "webhook-list-min" });
    const createWebhookCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "webhook-create-min" });
    const updateWebhookCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "webhook-update-min" });
    const deleteWebhookCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "webhook-delete-min" });
    const testWebhookCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "webhook-test-min" });
    const listWebhookDeliveriesCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, output: "webhook-deliveries-min" });

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
    await runCli(
      [
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
      ],
      { createAlertCommand }
    );
    await runCli(
      ["alert", "update", "al_123", "--project-id", "proj_123", "--is-enabled", "false"],
      { updateAlertCommand }
    );
    await runCli(["alert", "delete", "al_123", "--project-id", "proj_123"], { deleteAlertCommand });
    await runCli(["webhook", "list", "--project-id", "proj_123"], { listWebhooksCommand });
    await runCli(
      [
        "webhook",
        "create",
        "--project-id",
        "proj_123",
        "--url",
        "https://hooks.example.test/debugbundle",
        "--event",
        "bundle.created"
      ],
      { createWebhookCommand }
    );
    await runCli(
      ["webhook", "update", "wh_123", "--project-id", "proj_123", "--is-enabled", "false"],
      { updateWebhookCommand }
    );
    await runCli(["webhook", "delete", "wh_123", "--project-id", "proj_123"], {
      deleteWebhookCommand
    });
    await runCli(["webhook", "test", "wh_123", "--project-id", "proj_123"], { testWebhookCommand });
    await runCli(["webhook", "deliveries", "wh_123", "--project-id", "proj_123"], {
      listWebhookDeliveriesCommand
    });

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
    expect(updateAlertCommand).toHaveBeenCalledWith({
      alertId: "al_123",
      projectId: "proj_123",
      isEnabled: false
    });
    expect(deleteAlertCommand).toHaveBeenCalledWith({ alertId: "al_123", projectId: "proj_123" });
    expect(listWebhooksCommand).toHaveBeenCalledWith({ projectId: "proj_123" });
    expect(createWebhookCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      url: "https://hooks.example.test/debugbundle",
      events: ["bundle.created"]
    });
    expect(updateWebhookCommand).toHaveBeenCalledWith({
      webhookId: "wh_123",
      projectId: "proj_123",
      isEnabled: false
    });
    expect(deleteWebhookCommand).toHaveBeenCalledWith({
      webhookId: "wh_123",
      projectId: "proj_123"
    });
    expect(testWebhookCommand).toHaveBeenCalledWith({ webhookId: "wh_123", projectId: "proj_123" });
    expect(listWebhookDeliveriesCommand).toHaveBeenCalledWith({
      webhookId: "wh_123",
      projectId: "proj_123"
    });
  });

  it("returns validation errors for unknown commands and invalid option values", async () => {
    const unknownResult = await runCli(["unknown"]);
    const invalidLimitResult = await runCli(["incidents", "--limit", "abc"]);
    const invalidMaxAgeResult = await runCli([
      "verify",
      "cloud",
      "--project-id",
      "proj_123",
      "--max-age-minutes",
      "abc"
    ]);
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
    const webhookCreateMissingUrl = await runCli([
      "webhook",
      "create",
      "--project-id",
      "proj_123",
      "--event",
      "bundle.created"
    ]);
    const webhookCreateMissingEvent = await runCli([
      "webhook",
      "create",
      "--project-id",
      "proj_123",
      "--url",
      "https://hooks.example.test/debugbundle"
    ]);
    const webhookUpdateWithoutChanges = await runCli([
      "webhook",
      "update",
      "wh_123",
      "--project-id",
      "proj_123"
    ]);
    const inspectExtraPositional = await runCli(["inspect", "inc_123", "extra"]);
    const logsExtraPositional = await runCli(["logs", "inc_123", "extra"]);

    expect(analyzeUnknownOption.output).toContain("Unknown option --unknown.");
    expect(verifyCloudMissingProject.output).toContain("Missing required option --project-id.");
    expect(smokeMissingProject.output).toContain("Missing required option --project-id.");
    expect(loginMissingToken.output).toContain(
      "Provide either an access token or one of --github, --github-cli, or --github-device."
    );
    expect(tokenProjectMissingLabel.output).toContain("Missing required option --label.");
    expect(tokenMemberMissingLabel.output).toContain("Missing required option --label.");
    expect(webhookListMissingProject.output).toContain("Missing required option --project-id.");
    expect(webhookCreateMissingUrl.output).toContain("Missing required option --url.");
    expect(webhookCreateMissingEvent.output).toContain("Missing required option --event.");
    expect(webhookUpdateWithoutChanges.output).toContain(
      "At least one webhook field must be provided."
    );
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
});
