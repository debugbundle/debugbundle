import {
  createAlertWithAuthCommand as defaultCreateAlertCommand,
  deleteAlertWithAuthCommand as defaultDeleteAlertCommand,
  listAlertsWithAuthCommand as defaultListAlertsCommand,
  updateAlertWithAuthCommand as defaultUpdateAlertCommand
} from "./alert-commands.js";
import {
  getCapturePolicyWithAuthCommand as defaultGetCapturePolicyCommand,
  setCapturePolicyWithAuthCommand as defaultSetCapturePolicyCommand
} from "./capture-policy-commands.js";
import { deleteProjectWithAuthCommand as defaultDeleteProjectCommand, listProjectsWithAuthCommand as defaultListProjectsCommand, createProjectWithAuthCommand as defaultCreateProjectCommand, updateProjectWithAuthCommand as defaultUpdateProjectCommand } from "./project-commands.js";
import {
  createProjectTokenWithAuthCommand as defaultCreateProjectTokenCommand,
  listProjectTokensWithAuthCommand as defaultListProjectTokensCommand,
  revokeProjectTokenWithAuthCommand as defaultRevokeProjectTokenCommand,
  createMemberTokenWithAuthCommand as defaultCreateMemberTokenCommand,
  listMemberTokensWithAuthCommand as defaultListMemberTokensCommand,
  revokeMemberTokenWithAuthCommand as defaultRevokeMemberTokenCommand,
  type CliCommandResult
} from "./token-commands.js";
import {
  createWebhookWithAuthCommand as defaultCreateWebhookCommand,
  deleteWebhookWithAuthCommand as defaultDeleteWebhookCommand,
  listWebhookDeliveriesWithAuthCommand as defaultListWebhookDeliveriesCommand,
  listWebhooksWithAuthCommand as defaultListWebhooksCommand,
  retryWebhookDeliveryWithAuthCommand as defaultRetryWebhookDeliveryCommand,
  testWebhookWithAuthCommand as defaultTestWebhookCommand,
  updateWebhookWithAuthCommand as defaultUpdateWebhookCommand
} from "./webhook-commands.js";
import {
  createWeeklyReportChannelWithAuthCommand as defaultCreateWeeklyReportChannelCommand,
  deleteWeeklyReportChannelWithAuthCommand as defaultDeleteWeeklyReportChannelCommand,
  listWeeklyReportChannelsWithAuthCommand as defaultListWeeklyReportChannelsCommand,
  updateWeeklyReportChannelWithAuthCommand as defaultUpdateWeeklyReportChannelCommand
} from "./weekly-report-commands.js";
import {
  cancelBillingCapacityReductionWithAuthCommand as defaultCancelBillingCapacityReductionCommand,
  getBillingSummaryWithAuthCommand as defaultGetBillingSummaryCommand,
  increaseBillingCapacityWithAuthCommand as defaultIncreaseBillingCapacityCommand,
  scheduleBillingCapacityReductionWithAuthCommand as defaultScheduleBillingCapacityReductionCommand
} from "./billing-commands.js";
import {
  listMembersWithAuthCommand as defaultListMembersCommand,
  listInvitesWithAuthCommand as defaultListInvitesCommand,
  inviteMemberWithAuthCommand as defaultInviteMemberCommand,
  cancelInviteWithAuthCommand as defaultCancelInviteCommand,
  updateMemberRoleWithAuthCommand as defaultUpdateMemberRoleCommand,
  removeMemberWithAuthCommand as defaultRemoveMemberCommand
} from "./member-commands.js";
import {
  activateProbeWithAuthCommand as defaultActivateProbeCommand,
  listActiveProbesWithAuthCommand as defaultListActiveProbesCommand,
  deactivateProbeWithAuthCommand as defaultDeactivateProbeCommand
} from "./probe-commands.js";
import {
  createProjectGitHubRuleWithAuthCommand as defaultCreateProjectGitHubRuleCommand,
  getGitHubStatusWithAuthCommand as defaultGetGitHubStatusCommand,
  listProjectGitHubDeliveriesWithAuthCommand as defaultListProjectGitHubDeliveriesCommand,
  listProjectGitHubRulesWithAuthCommand as defaultListProjectGitHubRulesCommand,
  listGitHubRepositoriesWithAuthCommand as defaultListGitHubRepositoriesCommand,
  deleteProjectGitHubRuleWithAuthCommand as defaultDeleteProjectGitHubRuleCommand,
  removeProjectGitHubRepoWithAuthCommand as defaultRemoveProjectGitHubRepoCommand,
  retryProjectGitHubDeliveryWithAuthCommand as defaultRetryProjectGitHubDeliveryCommand,
  setProjectGitHubRepoWithAuthCommand as defaultSetProjectGitHubRepoCommand,
  updateProjectGitHubRuleWithAuthCommand as defaultUpdateProjectGitHubRuleCommand
} from "./github-commands.js";
import {
  appendCommonAuthOptions,
  CliInputError,
  ensureNoExtraPositionals,
  expectNoUnknownOptions,
  readBooleanStringOption,
  readCsvOption,
  readIntegerOption,
  readJsonOption,
  readLimitOption,
  readStringListOption,
  readStringOption,
  readWeeklyReportDayOfWeekOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";
import type { CapturePolicyUpdate } from "../../../packages/shared-types/src/index.js";

export type ManagementCommandDependencies = {
  getBillingSummaryCommand?: typeof defaultGetBillingSummaryCommand;
  increaseBillingCapacityCommand?: typeof defaultIncreaseBillingCapacityCommand;
  scheduleBillingCapacityReductionCommand?: typeof defaultScheduleBillingCapacityReductionCommand;
  cancelBillingCapacityReductionCommand?: typeof defaultCancelBillingCapacityReductionCommand;
  deleteProjectCommand?: typeof defaultDeleteProjectCommand;
  listProjectsCommand?: typeof defaultListProjectsCommand;
  createProjectCommand?: typeof defaultCreateProjectCommand;
  updateProjectCommand?: typeof defaultUpdateProjectCommand;
  listProjectTokensCommand?: typeof defaultListProjectTokensCommand;
  createProjectTokenCommand?: typeof defaultCreateProjectTokenCommand;
  revokeProjectTokenCommand?: typeof defaultRevokeProjectTokenCommand;
  listMemberTokensCommand?: typeof defaultListMemberTokensCommand;
  createMemberTokenCommand?: typeof defaultCreateMemberTokenCommand;
  revokeMemberTokenCommand?: typeof defaultRevokeMemberTokenCommand;
  listAlertsCommand?: typeof defaultListAlertsCommand;
  createAlertCommand?: typeof defaultCreateAlertCommand;
  updateAlertCommand?: typeof defaultUpdateAlertCommand;
  deleteAlertCommand?: typeof defaultDeleteAlertCommand;
  listWebhooksCommand?: typeof defaultListWebhooksCommand;
  createWebhookCommand?: typeof defaultCreateWebhookCommand;
  updateWebhookCommand?: typeof defaultUpdateWebhookCommand;
  deleteWebhookCommand?: typeof defaultDeleteWebhookCommand;
  testWebhookCommand?: typeof defaultTestWebhookCommand;
  listWebhookDeliveriesCommand?: typeof defaultListWebhookDeliveriesCommand;
  retryWebhookDeliveryCommand?: typeof defaultRetryWebhookDeliveryCommand;
  listWeeklyReportChannelsCommand?: typeof defaultListWeeklyReportChannelsCommand;
  createWeeklyReportChannelCommand?: typeof defaultCreateWeeklyReportChannelCommand;
  updateWeeklyReportChannelCommand?: typeof defaultUpdateWeeklyReportChannelCommand;
  deleteWeeklyReportChannelCommand?: typeof defaultDeleteWeeklyReportChannelCommand;
  getCapturePolicyCommand?: typeof defaultGetCapturePolicyCommand;
  setCapturePolicyCommand?: typeof defaultSetCapturePolicyCommand;
  activateProbeCommand?: typeof defaultActivateProbeCommand;
  listActiveProbesCommand?: typeof defaultListActiveProbesCommand;
  deactivateProbeCommand?: typeof defaultDeactivateProbeCommand;
  listMembersCommand?: typeof defaultListMembersCommand;
  listInvitesCommand?: typeof defaultListInvitesCommand;
  inviteMemberCommand?: typeof defaultInviteMemberCommand;
  cancelInviteCommand?: typeof defaultCancelInviteCommand;
  updateMemberRoleCommand?: typeof defaultUpdateMemberRoleCommand;
  removeMemberCommand?: typeof defaultRemoveMemberCommand;
  getGitHubStatusCommand?: typeof defaultGetGitHubStatusCommand;
  listGitHubRepositoriesCommand?: typeof defaultListGitHubRepositoriesCommand;
  listProjectGitHubRulesCommand?: typeof defaultListProjectGitHubRulesCommand;
  createProjectGitHubRuleCommand?: typeof defaultCreateProjectGitHubRuleCommand;
  updateProjectGitHubRuleCommand?: typeof defaultUpdateProjectGitHubRuleCommand;
  deleteProjectGitHubRuleCommand?: typeof defaultDeleteProjectGitHubRuleCommand;
  listProjectGitHubDeliveriesCommand?: typeof defaultListProjectGitHubDeliveriesCommand;
  retryProjectGitHubDeliveryCommand?: typeof defaultRetryProjectGitHubDeliveryCommand;
  setProjectGitHubRepoCommand?: typeof defaultSetProjectGitHubRepoCommand;
  removeProjectGitHubRepoCommand?: typeof defaultRemoveProjectGitHubRepoCommand;
};

export async function handleGithubCommand(parsedArgv: ParsedArgv, dependencies: ManagementCommandDependencies): Promise<CliCommandResult> {
  const action = requirePositional(parsedArgv, 1, "action");

  if (action === "status") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id"]);
    ensureNoExtraPositionals(parsedArgv, 2);

    const input = appendCommonAuthOptions(parsedArgv, {} as {
      authFilePath?: string;
      json?: boolean;
      projectId?: string;
    });
    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId !== undefined) {
      input.projectId = projectId;
    }

    return await (dependencies.getGitHubStatusCommand ?? defaultGetGitHubStatusCommand)(input);
  }

  if (action === "repos") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 2);

    return await (dependencies.listGitHubRepositoriesCommand ?? defaultListGitHubRepositoriesCommand)(
      appendCommonAuthOptions(parsedArgv, {})
    );
  }

  if (action !== "repo") {
    if (action === "deliveries") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id", "status", "limit"]);

      const projectId = readStringOption(parsedArgv, "project-id");
      if (projectId === undefined) {
        throw new CliInputError("Missing required option --project-id.");
      }

      const deliveriesAction = parsedArgv.positionals[2];
      if (deliveriesAction === undefined) {
        ensureNoExtraPositionals(parsedArgv, 2);
        const status = readStringOption(parsedArgv, "status");
        const limit = readLimitOption(parsedArgv);
        const input = appendCommonAuthOptions(parsedArgv, {
          projectId,
          ...(status === undefined ? {} : { status: status as "pending" | "retrying" | "delivered" | "failed" }),
          ...(limit === undefined ? {} : { limit })
        });

        return await (dependencies.listProjectGitHubDeliveriesCommand ?? defaultListProjectGitHubDeliveriesCommand)(input);
      }

      if (deliveriesAction === "retry") {
        ensureNoExtraPositionals(parsedArgv, 4);

        return await (dependencies.retryProjectGitHubDeliveryCommand ?? defaultRetryProjectGitHubDeliveryCommand)(
          appendCommonAuthOptions(parsedArgv, {
            projectId,
            deliveryId: requirePositional(parsedArgv, 3, "delivery-id")
          })
        );
      }

      throw new CliInputError("Unknown github deliveries command.");
    }

    if (action !== "rules") {
      throw new CliInputError("Unknown github command.");
    }

    expectNoUnknownOptions(parsedArgv, [
      "auth-file",
      "json",
      "project-id",
      "name",
      "event",
      "environment",
      "service",
      "severity-min",
      "bundle-type",
      "incident-status",
      "cooldown",
      "enabled"
    ]);

    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    const rulesAction = parsedArgv.positionals[2];
    if (rulesAction === undefined) {
      ensureNoExtraPositionals(parsedArgv, 2);
      return await (dependencies.listProjectGitHubRulesCommand ?? defaultListProjectGitHubRulesCommand)(
        appendCommonAuthOptions(parsedArgv, { projectId })
      );
    }

    if (rulesAction === "create") {
      ensureNoExtraPositionals(parsedArgv, 3);
      const name = readStringOption(parsedArgv, "name");
      const eventTypes = readCsvOption(parsedArgv, "event");
      const environments = readCsvOption(parsedArgv, "environment") ?? [];
      const services = readCsvOption(parsedArgv, "service") ?? [];
      const severityMin = readStringOption(parsedArgv, "severity-min");
      const bundleType = readStringOption(parsedArgv, "bundle-type");
      const incidentStatus = readStringOption(parsedArgv, "incident-status") ?? "new_or_reopened";
      const cooldownSeconds = readIntegerOption(parsedArgv, "cooldown") ?? 300;
      const enabled = readBooleanStringOption(parsedArgv, "enabled");

      if (name === undefined || eventTypes === undefined || severityMin === undefined || bundleType === undefined) {
        throw new CliInputError("Missing required GitHub rule options.");
      }

      const commandInput = appendCommonAuthOptions(parsedArgv, {
        projectId,
        name,
        eventTypes,
        environments,
        services,
        severityMin: severityMin as "low" | "medium" | "high" | "critical",
        bundleType: bundleType as "failure" | "improvement",
        incidentStatus: incidentStatus as "new_only" | "reopened_only" | "new_or_reopened",
        cooldownSeconds
      } as {
        projectId: string;
        name: string;
        eventTypes: string[];
        environments: string[];
        services: string[];
        severityMin: "low" | "medium" | "high" | "critical";
        bundleType: "failure" | "improvement";
        incidentStatus: "new_only" | "reopened_only" | "new_or_reopened";
        cooldownSeconds: number;
        enabled?: boolean;
        authFilePath?: string;
        json?: boolean;
      });
      if (enabled !== undefined) {
        commandInput.enabled = enabled;
      }

      return await (dependencies.createProjectGitHubRuleCommand ?? defaultCreateProjectGitHubRuleCommand)(
        commandInput
      );
    }

    if (rulesAction === "update") {
      ensureNoExtraPositionals(parsedArgv, 4);
      const ruleId = requirePositional(parsedArgv, 3, "rule-id");
      const input = appendCommonAuthOptions(parsedArgv, {
        projectId,
        ruleId
      } as {
        projectId: string;
        ruleId: string;
        authFilePath?: string;
        json?: boolean;
        name?: string;
        eventTypes?: string[];
        environments?: string[];
        services?: string[];
        severityMin?: "low" | "medium" | "high" | "critical";
        bundleType?: "failure" | "improvement";
        incidentStatus?: "new_only" | "reopened_only" | "new_or_reopened";
        cooldownSeconds?: number;
        enabled?: boolean;
      });

      const name = readStringOption(parsedArgv, "name");
      const eventTypes = readCsvOption(parsedArgv, "event");
      const environments = readCsvOption(parsedArgv, "environment");
      const services = readCsvOption(parsedArgv, "service");
      const severityMin = readStringOption(parsedArgv, "severity-min");
      const bundleType = readStringOption(parsedArgv, "bundle-type");
      const incidentStatus = readStringOption(parsedArgv, "incident-status");
      const cooldownSeconds = readIntegerOption(parsedArgv, "cooldown");
      const enabled = readBooleanStringOption(parsedArgv, "enabled");

      if (name !== undefined) input.name = name;
      if (eventTypes !== undefined) input.eventTypes = eventTypes;
      if (environments !== undefined) input.environments = environments;
      if (services !== undefined) input.services = services;
      if (severityMin !== undefined) input.severityMin = severityMin as "low" | "medium" | "high" | "critical";
      if (bundleType !== undefined) input.bundleType = bundleType as "failure" | "improvement";
      if (incidentStatus !== undefined) {
        input.incidentStatus = incidentStatus as "new_only" | "reopened_only" | "new_or_reopened";
      }
      if (cooldownSeconds !== undefined) input.cooldownSeconds = cooldownSeconds;
      if (enabled !== undefined) input.enabled = enabled;

      return await (dependencies.updateProjectGitHubRuleCommand ?? defaultUpdateProjectGitHubRuleCommand)(input);
    }

    if (rulesAction === "delete") {
      ensureNoExtraPositionals(parsedArgv, 4);
      return await (dependencies.deleteProjectGitHubRuleCommand ?? defaultDeleteProjectGitHubRuleCommand)(
        appendCommonAuthOptions(parsedArgv, {
          projectId,
          ruleId: requirePositional(parsedArgv, 3, "rule-id")
        })
      );
    }

    throw new CliInputError("Unknown github rules command.");
  }

  const repoAction = requirePositional(parsedArgv, 2, "repo-action");

  if (repoAction === "set") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id"]);
    ensureNoExtraPositionals(parsedArgv, 4);

    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    return await (dependencies.setProjectGitHubRepoCommand ?? defaultSetProjectGitHubRepoCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId,
        repoRef: requirePositional(parsedArgv, 3, "owner/repo")
      })
    );
  }

  if (repoAction === "remove") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    return await (dependencies.removeProjectGitHubRepoCommand ?? defaultRemoveProjectGitHubRepoCommand)(
      appendCommonAuthOptions(parsedArgv, { projectId })
    );
  }

  throw new CliInputError("Unknown github repo command.");
}

export async function handleBillingCommand(parsedArgv: ParsedArgv, dependencies: ManagementCommandDependencies): Promise<CliCommandResult> {
  const action = requirePositional(parsedArgv, 1, "action");

  if (action === "get") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 2);

    return await (dependencies.getBillingSummaryCommand ?? defaultGetBillingSummaryCommand)(appendCommonAuthOptions(parsedArgv, {}));
  }

  if (action !== "capacity") {
    throw new CliInputError("Unknown billing command.");
  }

  const capacityAction = requirePositional(parsedArgv, 2, "capacity-action");

  if (capacityAction === "increase") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "target-additional-capacity-units"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const targetAdditionalCapacityUnits = readIntegerOption(parsedArgv, "target-additional-capacity-units");
    if (targetAdditionalCapacityUnits === undefined) {
      throw new CliInputError("Missing required option --target-additional-capacity-units.");
    }

    return await (dependencies.increaseBillingCapacityCommand ?? defaultIncreaseBillingCapacityCommand)(
      appendCommonAuthOptions(parsedArgv, { targetAdditionalCapacityUnits })
    );
  }

  if (capacityAction === "schedule-reduction") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "target-additional-capacity-units"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const targetAdditionalCapacityUnits = readIntegerOption(parsedArgv, "target-additional-capacity-units");
    if (targetAdditionalCapacityUnits === undefined) {
      throw new CliInputError("Missing required option --target-additional-capacity-units.");
    }

    return await (dependencies.scheduleBillingCapacityReductionCommand ?? defaultScheduleBillingCapacityReductionCommand)(
      appendCommonAuthOptions(parsedArgv, { targetAdditionalCapacityUnits })
    );
  }

  if (capacityAction === "cancel-reduction") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    return await (dependencies.cancelBillingCapacityReductionCommand ?? defaultCancelBillingCapacityReductionCommand)(
      appendCommonAuthOptions(parsedArgv, {})
    );
  }

  throw new CliInputError("Unknown billing capacity command.");
}

export async function handleProjectCommand(parsedArgv: ParsedArgv, dependencies: ManagementCommandDependencies): Promise<CliCommandResult> {
  const action = requirePositional(parsedArgv, 1, "action");

  if (action === "list") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "limit"]);
    ensureNoExtraPositionals(parsedArgv, 2);

    const input = appendCommonAuthOptions(parsedArgv, {} as {
      limit?: number;
      authFilePath?: string;
      json?: boolean;
    });
    const limit = readLimitOption(parsedArgv);
    if (limit !== undefined) {
      input.limit = limit;
    }

    return await (dependencies.listProjectsCommand ?? defaultListProjectsCommand)(input);
  }

  if (action === "create") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "name", "slug", "environment-default"]);
    ensureNoExtraPositionals(parsedArgv, 2);

    const name = readStringOption(parsedArgv, "name");
    if (name === undefined) {
      throw new CliInputError("Missing required option --name.");
    }
    const slug = readStringOption(parsedArgv, "slug");
    if (slug === undefined) {
      throw new CliInputError("Missing required option --slug.");
    }

    const input = appendCommonAuthOptions(parsedArgv, { name, slug } as {
      name: string;
      slug: string;
      environmentDefault?: string;
      authFilePath?: string;
      json?: boolean;
    });
    const environmentDefault = readStringOption(parsedArgv, "environment-default");
    if (environmentDefault !== undefined) {
      input.environmentDefault = environmentDefault;
    }

    return await (dependencies.createProjectCommand ?? defaultCreateProjectCommand)(input);
  }

  if (action === "update") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "name", "slug", "environment-default"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const input = appendCommonAuthOptions(parsedArgv, {
      projectId: requirePositional(parsedArgv, 2, "project-id")
    } as {
      projectId: string;
      name?: string;
      slug?: string;
      environmentDefault?: string;
      authFilePath?: string;
      json?: boolean;
    });
    const name = readStringOption(parsedArgv, "name");
    if (name !== undefined) {
      input.name = name;
    }
    const slug = readStringOption(parsedArgv, "slug");
    if (slug !== undefined) {
      input.slug = slug;
    }
    const environmentDefault = readStringOption(parsedArgv, "environment-default");
    if (environmentDefault !== undefined) {
      input.environmentDefault = environmentDefault;
    }

    if (input.name === undefined && input.slug === undefined && input.environmentDefault === undefined) {
      throw new CliInputError("At least one project field must be provided.");
    }

    return await (dependencies.updateProjectCommand ?? defaultUpdateProjectCommand)(input);
  }

  if (action === "delete") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    return await (dependencies.deleteProjectCommand ?? defaultDeleteProjectCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId: requirePositional(parsedArgv, 2, "project-id")
      })
    );
  }

  throw new CliInputError("Unknown project command.");
}

export async function handleTokenCommand(parsedArgv: ParsedArgv, dependencies: ManagementCommandDependencies): Promise<CliCommandResult> {
  const scope = requirePositional(parsedArgv, 1, "scope");
  const action = requirePositional(parsedArgv, 2, "action");

  if (scope === "project") {
    if (action === "list") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "limit"]);
      ensureNoExtraPositionals(parsedArgv, 4);

      const input = appendCommonAuthOptions(parsedArgv, {
        projectId: requirePositional(parsedArgv, 3, "project-id")
      } as {
        projectId: string;
        limit?: number;
        authFilePath?: string;
        json?: boolean;
      });
      const limit = readLimitOption(parsedArgv);
      if (limit !== undefined) {
        input.limit = limit;
      }

      return await (dependencies.listProjectTokensCommand ?? defaultListProjectTokensCommand)(input);
    }

    if (action === "create") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "label"]);
      ensureNoExtraPositionals(parsedArgv, 4);

      const label = readStringOption(parsedArgv, "label");
      if (label === undefined) {
        throw new CliInputError("Missing required option --label.");
      }

      return await (dependencies.createProjectTokenCommand ?? defaultCreateProjectTokenCommand)(
        appendCommonAuthOptions(parsedArgv, {
          projectId: requirePositional(parsedArgv, 3, "project-id"),
          label
        })
      );
    }

    if (action === "revoke") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
      ensureNoExtraPositionals(parsedArgv, 5);

      return await (dependencies.revokeProjectTokenCommand ?? defaultRevokeProjectTokenCommand)(
        appendCommonAuthOptions(parsedArgv, {
          projectId: requirePositional(parsedArgv, 3, "project-id"),
          tokenId: requirePositional(parsedArgv, 4, "token-id")
        })
      );
    }
  }

  if (scope === "member") {
    if (action === "list") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "limit"]);
      ensureNoExtraPositionals(parsedArgv, 3);

      const input = appendCommonAuthOptions(parsedArgv, {} as {
        limit?: number;
        authFilePath?: string;
        json?: boolean;
      });
      const limit = readLimitOption(parsedArgv);
      if (limit !== undefined) {
        input.limit = limit;
      }

      return await (dependencies.listMemberTokensCommand ?? defaultListMemberTokensCommand)(input);
    }

    if (action === "create") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "label"]);
      ensureNoExtraPositionals(parsedArgv, 3);

      const label = readStringOption(parsedArgv, "label");
      if (label === undefined) {
        throw new CliInputError("Missing required option --label.");
      }

      return await (dependencies.createMemberTokenCommand ?? defaultCreateMemberTokenCommand)(
        appendCommonAuthOptions(parsedArgv, { label })
      );
    }

    if (action === "revoke") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
      ensureNoExtraPositionals(parsedArgv, 4);

      return await (dependencies.revokeMemberTokenCommand ?? defaultRevokeMemberTokenCommand)(
        appendCommonAuthOptions(parsedArgv, {
          tokenId: requirePositional(parsedArgv, 3, "token-id")
        })
      );
    }
  }

  throw new CliInputError("Unknown token command.");
}

export async function handleCapturePolicyCommand(
  parsedArgv: ParsedArgv,
  dependencies: ManagementCommandDependencies
): Promise<CliCommandResult> {
  const action = requirePositional(parsedArgv, 1, "action");

  if (action === "get") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project"]);
    ensureNoExtraPositionals(parsedArgv, 2);

    const projectId = readStringOption(parsedArgv, "project");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project.");
    }

    return await (dependencies.getCapturePolicyCommand ?? defaultGetCapturePolicyCommand)(
      appendCommonAuthOptions(parsedArgv, { projectId })
    );
  }

  if (action === "set") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project", "preset", "override"]);
    ensureNoExtraPositionals(parsedArgv, 2);

    const projectId = readStringOption(parsedArgv, "project");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project.");
    }

    const update: CapturePolicyUpdate = {};
    const preset = readStringOption(parsedArgv, "preset");
    if (preset !== undefined) {
      update.preset = preset as CapturePolicyUpdate["preset"];
    }

    const overrides = readStringListOption(parsedArgv, "override") ?? [];
    for (const override of overrides) {
      const separatorIndex = override.indexOf("=");
      if (separatorIndex <= 0 || separatorIndex === override.length - 1) {
        throw new CliInputError("Invalid value for --override.");
      }

      const key = override.slice(0, separatorIndex);
      const rawValue = override.slice(separatorIndex + 1);
      if (
        key !== "capture_logs" &&
        key !== "capture_request_events" &&
        key !== "capture_breadcrumbs" &&
        key !== "capture_probe_events"
      ) {
        throw new CliInputError("Invalid value for --override.");
      }

      (update as Record<string, string | null | undefined>)[key] = rawValue === "null" ? null : rawValue;
    }

    if (Object.keys(update).length === 0) {
      throw new CliInputError("At least one capture policy field must be provided.");
    }

    return await (dependencies.setCapturePolicyCommand ?? defaultSetCapturePolicyCommand)(
      appendCommonAuthOptions(parsedArgv, { projectId, update })
    );
  }

  throw new CliInputError("Unknown capture-policy command.");
}

export async function handleProbeCommand(parsedArgv: ParsedArgv, dependencies: ManagementCommandDependencies): Promise<CliCommandResult> {
  const action = requirePositional(parsedArgv, 1, "action");

  if (action === "activate") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "label-pattern", "service", "environment", "ttl-seconds", "trigger-ttl-seconds"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const projectId = requirePositional(parsedArgv, 2, "project-id");
    const labelPattern = readStringOption(parsedArgv, "label-pattern");
    if (labelPattern === undefined) {
      throw new CliInputError("Missing required option --label-pattern.");
    }

    const input = appendCommonAuthOptions(parsedArgv, {
      projectId,
      labelPattern
    } as {
      projectId: string;
      labelPattern: string;
      service?: string;
      environment?: string;
      ttlSeconds?: number;
      triggerTtlSeconds?: number;
      authFilePath?: string;
      json?: boolean;
    });
    const service = readStringOption(parsedArgv, "service");
    if (service !== undefined) {
      input.service = service;
    }
    const environment = readStringOption(parsedArgv, "environment");
    if (environment !== undefined) {
      input.environment = environment;
    }
    const ttlSeconds = readIntegerOption(parsedArgv, "ttl-seconds");
    if (ttlSeconds !== undefined) {
      input.ttlSeconds = ttlSeconds;
    }
    const triggerTtlSeconds = readIntegerOption(parsedArgv, "trigger-ttl-seconds");
    if (triggerTtlSeconds !== undefined) {
      input.triggerTtlSeconds = triggerTtlSeconds;
    }

    return await (dependencies.activateProbeCommand ?? defaultActivateProbeCommand)(input);
  }

  if (action === "list") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    return await (dependencies.listActiveProbesCommand ?? defaultListActiveProbesCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId: requirePositional(parsedArgv, 2, "project-id")
      })
    );
  }

  if (action === "deactivate") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 4);

    return await (dependencies.deactivateProbeCommand ?? defaultDeactivateProbeCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId: requirePositional(parsedArgv, 2, "project-id"),
        activationId: requirePositional(parsedArgv, 3, "activation-id")
      })
    );
  }

  throw new CliInputError("Unknown probe command.");
}

export async function handleMemberCommand(parsedArgv: ParsedArgv, dependencies: ManagementCommandDependencies): Promise<CliCommandResult> {
  const action = requirePositional(parsedArgv, 1, "action");

  if (action === "list") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 2);

    return await (dependencies.listMembersCommand ?? defaultListMembersCommand)(appendCommonAuthOptions(parsedArgv, {}));
  }

  if (action === "invites") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 2);

    return await (dependencies.listInvitesCommand ?? defaultListInvitesCommand)(appendCommonAuthOptions(parsedArgv, {}));
  }

  if (action === "invite") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "email", "role"]);
    ensureNoExtraPositionals(parsedArgv, 2);

    const email = readStringOption(parsedArgv, "email");
    if (email === undefined) {
      throw new CliInputError("Missing required option --email.");
    }
    const role = readStringOption(parsedArgv, "role");
    if (role === undefined) {
      throw new CliInputError("Missing required option --role.");
    }

    return await (dependencies.inviteMemberCommand ?? defaultInviteMemberCommand)(
      appendCommonAuthOptions(parsedArgv, { email, role })
    );
  }

  if (action === "cancel-invite") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    return await (dependencies.cancelInviteCommand ?? defaultCancelInviteCommand)(
      appendCommonAuthOptions(parsedArgv, {
        inviteId: requirePositional(parsedArgv, 2, "invite-id")
      })
    );
  }

  if (action === "update-role") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "role"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const role = readStringOption(parsedArgv, "role");
    if (role === undefined) {
      throw new CliInputError("Missing required option --role.");
    }

    return await (dependencies.updateMemberRoleCommand ?? defaultUpdateMemberRoleCommand)(
      appendCommonAuthOptions(parsedArgv, {
        userId: requirePositional(parsedArgv, 2, "user-id"),
        role
      })
    );
  }

  if (action === "remove") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    return await (dependencies.removeMemberCommand ?? defaultRemoveMemberCommand)(
      appendCommonAuthOptions(parsedArgv, {
        userId: requirePositional(parsedArgv, 2, "user-id")
      })
    );
  }

  throw new CliInputError("Unknown member command.");
}

export async function handleWebhookCommand(parsedArgv: ParsedArgv, dependencies: ManagementCommandDependencies): Promise<CliCommandResult> {
  const action = requirePositional(parsedArgv, 1, "action");

  if (action === "list") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id", "limit"]);
    ensureNoExtraPositionals(parsedArgv, 2);

    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    const input = appendCommonAuthOptions(parsedArgv, {
      projectId
    } as {
      projectId: string;
      limit?: number;
      authFilePath?: string;
      json?: boolean;
    });
    const limit = readLimitOption(parsedArgv);
    if (limit !== undefined) {
      input.limit = limit;
    }

    return await (dependencies.listWebhooksCommand ?? defaultListWebhooksCommand)(input);
  }

  if (action === "create") {
    expectNoUnknownOptions(parsedArgv, [
      "auth-file",
      "json",
      "project-id",
      "url",
      "event",
      "environment",
      "service",
      "severity-min",
      "bundle-type",
      "verification",
      "is-enabled"
    ]);
    ensureNoExtraPositionals(parsedArgv, 2);

    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    const url = readStringOption(parsedArgv, "url");
    if (url === undefined) {
      throw new CliInputError("Missing required option --url.");
    }

    const events = readCsvOption(parsedArgv, "event");
    if (events === undefined) {
      throw new CliInputError("Missing required option --event.");
    }

    const input = appendCommonAuthOptions(parsedArgv, {
      projectId,
      url,
      events
    } as {
      projectId: string;
      url: string;
      events: string[];
      filters?: Record<string, unknown>;
      isEnabled?: boolean;
      authFilePath?: string;
      json?: boolean;
    });
    const filters: Record<string, unknown> = {};
    const environment = readCsvOption(parsedArgv, "environment");
    if (environment !== undefined) {
      filters["environment"] = environment;
    }
    const service = readCsvOption(parsedArgv, "service");
    if (service !== undefined) {
      filters["service"] = service;
    }
    const severityMin = readStringOption(parsedArgv, "severity-min");
    if (severityMin !== undefined) {
      filters["severity_min"] = severityMin;
    }
    const bundleType = readCsvOption(parsedArgv, "bundle-type");
    if (bundleType !== undefined) {
      filters["bundle_type"] = bundleType;
    }
    const verification = readBooleanStringOption(parsedArgv, "verification");
    if (verification !== undefined) {
      filters["verification"] = verification;
    }
    if (Object.keys(filters).length > 0) {
      input.filters = filters;
    }
    const isEnabled = readBooleanStringOption(parsedArgv, "is-enabled");
    if (isEnabled !== undefined) {
      input.isEnabled = isEnabled;
    }

    return await (dependencies.createWebhookCommand ?? defaultCreateWebhookCommand)(input);
  }

  if (action === "update") {
    expectNoUnknownOptions(parsedArgv, [
      "auth-file",
      "json",
      "url",
      "event",
      "environment",
      "service",
      "severity-min",
      "bundle-type",
      "verification",
      "is-enabled"
    ]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const input = appendCommonAuthOptions(parsedArgv, {
      webhookId: requirePositional(parsedArgv, 2, "webhook-id")
    } as {
      webhookId: string;
      url?: string;
      events?: string[];
      filters?: Record<string, unknown>;
      isEnabled?: boolean;
      authFilePath?: string;
      json?: boolean;
    });
    const url = readStringOption(parsedArgv, "url");
    if (url !== undefined) {
      input.url = url;
    }
    const events = readCsvOption(parsedArgv, "event");
    if (events !== undefined) {
      input.events = events;
    }
    const filters: Record<string, unknown> = {};
    const environment = readCsvOption(parsedArgv, "environment");
    if (environment !== undefined) {
      filters["environment"] = environment;
    }
    const service = readCsvOption(parsedArgv, "service");
    if (service !== undefined) {
      filters["service"] = service;
    }
    const severityMin = readStringOption(parsedArgv, "severity-min");
    if (severityMin !== undefined) {
      filters["severity_min"] = severityMin;
    }
    const bundleType = readCsvOption(parsedArgv, "bundle-type");
    if (bundleType !== undefined) {
      filters["bundle_type"] = bundleType;
    }
    const verification = readBooleanStringOption(parsedArgv, "verification");
    if (verification !== undefined) {
      filters["verification"] = verification;
    }
    if (Object.keys(filters).length > 0) {
      input.filters = filters;
    }
    const isEnabled = readBooleanStringOption(parsedArgv, "is-enabled");
    if (isEnabled !== undefined) {
      input.isEnabled = isEnabled;
    }

    if (
      input.url === undefined &&
      input.events === undefined &&
      input.filters === undefined &&
      input.isEnabled === undefined
    ) {
      throw new CliInputError("At least one webhook field must be provided.");
    }

    return await (dependencies.updateWebhookCommand ?? defaultUpdateWebhookCommand)(input);
  }

  if (action === "delete") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    return await (dependencies.deleteWebhookCommand ?? defaultDeleteWebhookCommand)(
      appendCommonAuthOptions(parsedArgv, {
        webhookId: requirePositional(parsedArgv, 2, "webhook-id")
      })
    );
  }

  if (action === "test") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "event"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const input = appendCommonAuthOptions(parsedArgv, {
      webhookId: requirePositional(parsedArgv, 2, "webhook-id")
    } as {
      webhookId: string;
      eventType?: "verification.passed" | "verification.failed";
      authFilePath?: string;
      json?: boolean;
    });
    const eventType = readStringOption(parsedArgv, "event");
    if (eventType !== undefined) {
      if (eventType !== "verification.passed" && eventType !== "verification.failed") {
        throw new CliInputError("Invalid value for --event.");
      }

      input.eventType = eventType;
    }

    return await (dependencies.testWebhookCommand ?? defaultTestWebhookCommand)(input);
  }

  if (action === "deliveries") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "limit"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const input = appendCommonAuthOptions(parsedArgv, {
      webhookId: requirePositional(parsedArgv, 2, "webhook-id")
    } as {
      webhookId: string;
      limit?: number;
      authFilePath?: string;
      json?: boolean;
    });
    const limit = readLimitOption(parsedArgv);
    if (limit !== undefined) {
      input.limit = limit;
    }

    return await (dependencies.listWebhookDeliveriesCommand ?? defaultListWebhookDeliveriesCommand)(input);
  }

  if (action === "retry") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 4);

    const input = appendCommonAuthOptions(parsedArgv, {
      webhookId: requirePositional(parsedArgv, 2, "webhook-id"),
      deliveryId: requirePositional(parsedArgv, 3, "delivery-id")
    } as {
      webhookId: string;
      deliveryId: string;
      authFilePath?: string;
      json?: boolean;
    });

    return await (dependencies.retryWebhookDeliveryCommand ?? defaultRetryWebhookDeliveryCommand)(input);
  }

  throw new CliInputError("Unknown webhook command.");
}

export async function handleAlertCommand(parsedArgv: ParsedArgv, dependencies: ManagementCommandDependencies): Promise<CliCommandResult> {
  const action = requirePositional(parsedArgv, 1, "action");

  if (action === "list") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id", "limit"]);
    ensureNoExtraPositionals(parsedArgv, 2);

    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    const input = appendCommonAuthOptions(parsedArgv, {
      projectId
    } as { projectId: string; limit?: number; authFilePath?: string; json?: boolean });
    const limit = readLimitOption(parsedArgv);
    if (limit !== undefined) {
      input.limit = limit;
    }

    return await (dependencies.listAlertsCommand ?? defaultListAlertsCommand)(input);
  }

  if (action === "create") {
    expectNoUnknownOptions(parsedArgv, [
      "auth-file",
      "json",
      "project-id",
      "service-id",
      "channel",
      "condition",
      "severity-min",
      "config-json",
      "is-enabled"
    ]);
    ensureNoExtraPositionals(parsedArgv, 2);

    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }
    const channel = readStringOption(parsedArgv, "channel");
    if (channel === undefined) {
      throw new CliInputError("Missing required option --channel.");
    }
    const conditionType = readStringOption(parsedArgv, "condition");
    if (conditionType === undefined) {
      throw new CliInputError("Missing required option --condition.");
    }

    const input = appendCommonAuthOptions(parsedArgv, {
      projectId,
      channel,
      conditionType
    } as {
      projectId: string;
      serviceId?: string;
      channel: string;
      conditionType: string;
      severityMin?: string;
      config?: Record<string, unknown>;
      isEnabled?: boolean;
      authFilePath?: string;
      json?: boolean;
    });

    const serviceId = readStringOption(parsedArgv, "service-id");
    if (serviceId !== undefined) {
      input.serviceId = serviceId;
    }
    const severityMin = readStringOption(parsedArgv, "severity-min");
    if (severityMin !== undefined) {
      input.severityMin = severityMin;
    }
    const config = readJsonOption(parsedArgv, "config-json");
    if (config === undefined || typeof config !== "object" || config === null) {
      throw new CliInputError("Missing required option --config-json.");
    }
    input.config = config as Record<string, unknown>;
    const isEnabled = readBooleanStringOption(parsedArgv, "is-enabled");
    if (isEnabled !== undefined) {
      input.isEnabled = isEnabled;
    }

    return await (dependencies.createAlertCommand ?? defaultCreateAlertCommand)(input as Parameters<typeof defaultCreateAlertCommand>[0]);
  }

  if (action === "update") {
    expectNoUnknownOptions(parsedArgv, [
      "auth-file",
      "json",
      "service-id",
      "channel",
      "condition",
      "severity-min",
      "config-json",
      "is-enabled"
    ]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const input = appendCommonAuthOptions(parsedArgv, {
      alertId: requirePositional(parsedArgv, 2, "alert-id")
    } as {
      alertId: string;
      serviceId?: string | null;
      channel?: string;
      conditionType?: string;
      severityMin?: string | null;
      config?: Record<string, unknown> | null;
      isEnabled?: boolean;
      authFilePath?: string;
      json?: boolean;
    });

    const serviceId = readStringOption(parsedArgv, "service-id");
    if (serviceId !== undefined) {
      input.serviceId = serviceId === "null" ? null : serviceId;
    }
    const channel = readStringOption(parsedArgv, "channel");
    if (channel !== undefined) {
      input.channel = channel;
    }
    const conditionType = readStringOption(parsedArgv, "condition");
    if (conditionType !== undefined) {
      input.conditionType = conditionType;
    }
    const severityMin = readStringOption(parsedArgv, "severity-min");
    if (severityMin !== undefined) {
      input.severityMin = severityMin === "null" ? null : severityMin;
    }
    const config = readJsonOption(parsedArgv, "config-json");
    if (config !== undefined) {
      input.config = config as Record<string, unknown> | null;
    }
    const isEnabled = readBooleanStringOption(parsedArgv, "is-enabled");
    if (isEnabled !== undefined) {
      input.isEnabled = isEnabled;
    }

    if (
      input.serviceId === undefined &&
      input.channel === undefined &&
      input.conditionType === undefined &&
      input.severityMin === undefined &&
      input.config === undefined &&
      input.isEnabled === undefined
    ) {
      throw new CliInputError("At least one alert field must be provided.");
    }

    return await (dependencies.updateAlertCommand ?? defaultUpdateAlertCommand)(input as Parameters<typeof defaultUpdateAlertCommand>[0]);
  }

  if (action === "delete") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    return await (dependencies.deleteAlertCommand ?? defaultDeleteAlertCommand)(
      appendCommonAuthOptions(parsedArgv, {
        alertId: requirePositional(parsedArgv, 2, "alert-id")
      })
    );
  }

  throw new CliInputError("Unknown alert command.");
}

export async function handleWeeklyReportCommand(parsedArgv: ParsedArgv, dependencies: ManagementCommandDependencies): Promise<CliCommandResult> {
  const action = requirePositional(parsedArgv, 1, "action");

  if (action === "list") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id", "limit"]);
    ensureNoExtraPositionals(parsedArgv, 2);

    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    const input = appendCommonAuthOptions(parsedArgv, {
      projectId
    } as { projectId: string; limit?: number; authFilePath?: string; json?: boolean });
    const limit = readLimitOption(parsedArgv);
    if (limit !== undefined) {
      input.limit = limit;
    }

    return await (dependencies.listWeeklyReportChannelsCommand ?? defaultListWeeklyReportChannelsCommand)(input);
  }

  if (action === "create") {
    expectNoUnknownOptions(parsedArgv, [
      "auth-file",
      "json",
      "project-id",
      "channel",
      "day-of-week",
      "hour-of-day",
      "timezone",
      "config-json",
      "is-enabled"
    ]);
    ensureNoExtraPositionals(parsedArgv, 2);

    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }
    const channel = readStringOption(parsedArgv, "channel");
    if (channel === undefined) {
      throw new CliInputError("Missing required option --channel.");
    }
    const dayOfWeek = readWeeklyReportDayOfWeekOption(parsedArgv, "day-of-week");
    if (dayOfWeek === undefined) {
      throw new CliInputError("Missing required option --day-of-week.");
    }
    const hourOfDay = readIntegerOption(parsedArgv, "hour-of-day");
    if (hourOfDay === undefined) {
      throw new CliInputError("Missing required option --hour-of-day.");
    }
    const timezone = readStringOption(parsedArgv, "timezone");
    if (timezone === undefined) {
      throw new CliInputError("Missing required option --timezone.");
    }
    const config = readJsonOption(parsedArgv, "config-json");
    if (config === undefined || typeof config !== "object" || config === null) {
      throw new CliInputError("Missing required option --config-json.");
    }

    const input = appendCommonAuthOptions(parsedArgv, {
      projectId,
      channel,
      config: channel === "slack" ? { webhookUrl: String((config as Record<string, unknown>)["webhook_url"]) } : { to: (config as { to: string[] }).to },
      schedule: {
        dayOfWeek,
        hourOfDay,
        timezone
      }
    } as Parameters<typeof defaultCreateWeeklyReportChannelCommand>[0]);
    const isEnabled = readBooleanStringOption(parsedArgv, "is-enabled");
    if (isEnabled !== undefined) {
      input.isEnabled = isEnabled;
    }

    return await (dependencies.createWeeklyReportChannelCommand ?? defaultCreateWeeklyReportChannelCommand)(input);
  }

  if (action === "update") {
    expectNoUnknownOptions(parsedArgv, [
      "auth-file",
      "json",
      "day-of-week",
      "hour-of-day",
      "timezone",
      "config-json",
      "is-enabled"
    ]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const input = appendCommonAuthOptions(parsedArgv, {
      channelId: requirePositional(parsedArgv, 2, "channel-id")
    } as Parameters<typeof defaultUpdateWeeklyReportChannelCommand>[0]);

    const dayOfWeek = readWeeklyReportDayOfWeekOption(parsedArgv, "day-of-week");
    const hourOfDay = readIntegerOption(parsedArgv, "hour-of-day");
    const timezone = readStringOption(parsedArgv, "timezone");
    if (dayOfWeek !== undefined || hourOfDay !== undefined || timezone !== undefined) {
      if (dayOfWeek === undefined || hourOfDay === undefined || timezone === undefined) {
        throw new CliInputError("Weekly report schedule updates require --day-of-week, --hour-of-day, and --timezone together.");
      }
      input.schedule = { dayOfWeek, hourOfDay, timezone };
    }

    const config = readJsonOption(parsedArgv, "config-json");
    if (config !== undefined) {
      if (typeof config !== "object" || config === null) {
        throw new CliInputError("Invalid value for --config-json.");
      }
      input.config = "webhook_url" in (config as Record<string, unknown>)
        ? { webhookUrl: String((config as Record<string, unknown>)["webhook_url"]) }
        : { to: (config as { to: string[] }).to };
    }

    const isEnabled = readBooleanStringOption(parsedArgv, "is-enabled");
    if (isEnabled !== undefined) {
      input.isEnabled = isEnabled;
    }

    if (input.schedule === undefined && input.config === undefined && input.isEnabled === undefined) {
      throw new CliInputError("At least one weekly report field must be provided.");
    }

    return await (dependencies.updateWeeklyReportChannelCommand ?? defaultUpdateWeeklyReportChannelCommand)(input);
  }

  if (action === "delete") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    return await (dependencies.deleteWeeklyReportChannelCommand ?? defaultDeleteWeeklyReportChannelCommand)(
      appendCommonAuthOptions(parsedArgv, {
        channelId: requirePositional(parsedArgv, 2, "channel-id")
      })
    );
  }

  throw new CliInputError("Unknown weekly-report command.");
}
