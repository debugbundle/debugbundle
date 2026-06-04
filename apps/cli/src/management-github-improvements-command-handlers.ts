import {
  createProjectGitHubRuleWithAuthCommand as defaultCreateProjectGitHubRuleCommand,
  deleteProjectGitHubRuleWithAuthCommand as defaultDeleteProjectGitHubRuleCommand,
  getGitHubStatusWithAuthCommand as defaultGetGitHubStatusCommand,
  listGitHubRepositoriesWithAuthCommand as defaultListGitHubRepositoriesCommand,
  listProjectGitHubDeliveriesWithAuthCommand as defaultListProjectGitHubDeliveriesCommand,
  listProjectGitHubRulesWithAuthCommand as defaultListProjectGitHubRulesCommand,
  removeProjectGitHubRepoWithAuthCommand as defaultRemoveProjectGitHubRepoCommand,
  retryProjectGitHubDeliveryWithAuthCommand as defaultRetryProjectGitHubDeliveryCommand,
  setProjectGitHubRepoWithAuthCommand as defaultSetProjectGitHubRepoCommand,
  updateProjectGitHubRuleWithAuthCommand as defaultUpdateProjectGitHubRuleCommand
} from "./github-commands.js";
import {
  getImprovementBundleWithAuthCommand as defaultGetImprovementBundleCommand,
  getImprovementWithAuthCommand as defaultGetImprovementCommand,
  listImprovementsWithAuthCommand as defaultListImprovementsCommand,
  reopenImprovementWithAuthCommand as defaultReopenImprovementCommand,
  resolveImprovementWithAuthCommand as defaultResolveImprovementCommand,
  snoozeImprovementWithAuthCommand as defaultSnoozeImprovementCommand
} from "./improvement-commands.js";
import {
  getImprovementSettingsWithAuthCommand as defaultGetImprovementSettingsCommand,
  setImprovementSettingsWithAuthCommand as defaultSetImprovementSettingsCommand
} from "./improvement-settings-commands.js";
import {
  appendCommonAuthOptions,
  CliInputError,
  ensureNoExtraPositionals,
  expectNoUnknownOptions,
  readBooleanStringOption,
  readCsvOption,
  readIntegerOption,
  readLimitOption,
  readStringOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";
import type { ManagementCommandDependencies, CliCommandResult } from "./management-command-dependencies.js";

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

    return await (dependencies.listGitHubRepositoriesCommand ?? defaultListGitHubRepositoriesCommand)(input);
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
          ...(status === undefined ? {} : { status: status as "pending" | "retrying" | "delivered" | "failed" | "skipped" }),
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

export async function handleImprovementsCommand(
  parsedArgv: ParsedArgv,
  dependencies: ManagementCommandDependencies
): Promise<CliCommandResult> {
  const action = requirePositional(parsedArgv, 1, "action");
  if (action === "list") {
    expectNoUnknownOptions(parsedArgv, ["project-id", "environment", "service", "status", "severity", "kind", "cursor", "limit", "auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 2);

    const input = appendCommonAuthOptions(parsedArgv, {} as {
      authFilePath?: string;
      json?: boolean;
      projectId?: string;
      environment?: string;
      service?: string;
      status?: string;
      severity?: string;
      kind?: string;
      cursor?: string;
      limit?: number;
    });
    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId !== undefined) input.projectId = projectId;
    const environment = readStringOption(parsedArgv, "environment");
    if (environment !== undefined) input.environment = environment;
    const service = readStringOption(parsedArgv, "service");
    if (service !== undefined) input.service = service;
    const status = readStringOption(parsedArgv, "status");
    if (status !== undefined) input.status = status;
    const severity = readStringOption(parsedArgv, "severity");
    if (severity !== undefined) input.severity = severity;
    const kind = readStringOption(parsedArgv, "kind");
    if (kind !== undefined) input.kind = kind;
    const cursor = readStringOption(parsedArgv, "cursor");
    if (cursor !== undefined) input.cursor = cursor;
    const limit = readLimitOption(parsedArgv);
    if (limit !== undefined) input.limit = limit;

    return await (dependencies.listImprovementsCommand ?? defaultListImprovementsCommand)(input);
  }

  if (action === "get") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 3);
    return await (dependencies.getImprovementCommand ?? defaultGetImprovementCommand)(
      appendCommonAuthOptions(parsedArgv, {
        improvementId: requirePositional(parsedArgv, 2, "improvement-id")
      })
    );
  }

  if (action === "bundle") {
    expectNoUnknownOptions(parsedArgv, ["project-id", "auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 3);
    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    return await (dependencies.getImprovementBundleCommand ?? defaultGetImprovementBundleCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId,
        improvementId: requirePositional(parsedArgv, 2, "improvement-id")
      })
    );
  }

  if (action === "resolve") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 3);
    return await (dependencies.resolveImprovementCommand ?? defaultResolveImprovementCommand)(
      appendCommonAuthOptions(parsedArgv, {
        improvementId: requirePositional(parsedArgv, 2, "improvement-id")
      })
    );
  }

  if (action === "reopen") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 3);
    return await (dependencies.reopenImprovementCommand ?? defaultReopenImprovementCommand)(
      appendCommonAuthOptions(parsedArgv, {
        improvementId: requirePositional(parsedArgv, 2, "improvement-id")
      })
    );
  }

  if (action === "snooze") {
    expectNoUnknownOptions(parsedArgv, ["until", "auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 3);
    const snoozedUntil = readStringOption(parsedArgv, "until");
    if (snoozedUntil === undefined) {
      throw new CliInputError("Missing required option --until.");
    }

    return await (dependencies.snoozeImprovementCommand ?? defaultSnoozeImprovementCommand)(
      appendCommonAuthOptions(parsedArgv, {
        improvementId: requirePositional(parsedArgv, 2, "improvement-id"),
        snoozedUntil
      })
    );
  }

  if (action !== "settings") {
    throw new CliInputError("Unknown improvements command.");
  }

  const settingsAction = requirePositional(parsedArgv, 2, "settings action");
  if (settingsAction === "get") {
    expectNoUnknownOptions(parsedArgv, ["project", "auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 3);
    const projectId = readStringOption(parsedArgv, "project");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project.");
    }

    return await (dependencies.getImprovementSettingsCommand ?? defaultGetImprovementSettingsCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId
      })
    );
  }

  if (settingsAction === "set") {
    expectNoUnknownOptions(parsedArgv, ["project", "enabled", "sensitivity", "auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 3);
    const projectId = readStringOption(parsedArgv, "project");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project.");
    }

    const update: {
      automated_improvement_bundles_enabled?: boolean;
      improvement_bundle_sensitivity?: "high_confidence" | "balanced" | "verbose";
    } = {};
    const enabled = readBooleanStringOption(parsedArgv, "enabled");
    if (enabled !== undefined) {
      update.automated_improvement_bundles_enabled = enabled;
    }

    const sensitivity = readStringOption(parsedArgv, "sensitivity");
    if (sensitivity !== undefined) {
      if (sensitivity !== "high_confidence" && sensitivity !== "balanced" && sensitivity !== "verbose") {
        throw new CliInputError("Invalid value for --sensitivity.");
      }
      update.improvement_bundle_sensitivity = sensitivity;
    }

    if (Object.keys(update).length === 0) {
      throw new CliInputError("At least one improvement settings field must be provided.");
    }

    return await (dependencies.setImprovementSettingsCommand ?? defaultSetImprovementSettingsCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId,
        update
      })
    );
  }

  throw new CliInputError("Unknown improvements settings command.");
}
