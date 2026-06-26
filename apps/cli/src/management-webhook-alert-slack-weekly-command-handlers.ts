import {
  createAlertWithAuthCommand as defaultCreateAlertCommand,
  deleteAlertWithAuthCommand as defaultDeleteAlertCommand,
  listAlertsWithAuthCommand as defaultListAlertsCommand,
  updateAlertWithAuthCommand as defaultUpdateAlertCommand
} from "./alert-commands.js";
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
  readStringOption,
  readWeeklyReportDayOfWeekOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";
import type { ManagementCommandDependencies, CliCommandResult } from "./management-command-dependencies.js";
import {
  deleteSlackDestinationWithAuthCommand as defaultDeleteSlackDestinationCommand,
  getSlackConnectUrlWithAuthCommand as defaultGetSlackConnectUrlCommand,
  listSlackDestinationsWithAuthCommand as defaultListSlackDestinationsCommand,
  testSlackDestinationWithAuthCommand as defaultTestSlackDestinationCommand
} from "./slack-commands.js";
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
    ensureNoExtraPositionals(parsedArgv, 3);
    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    const input = appendCommonAuthOptions(parsedArgv, {
      projectId,
      webhookId: requirePositional(parsedArgv, 2, "webhook-id")
    } as {
      projectId: string;
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
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id"]);
    ensureNoExtraPositionals(parsedArgv, 3);
    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    return await (dependencies.deleteWebhookCommand ?? defaultDeleteWebhookCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId,
        webhookId: requirePositional(parsedArgv, 2, "webhook-id")
      })
    );
  }

  if (action === "test") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id", "event"]);
    ensureNoExtraPositionals(parsedArgv, 3);
    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    const input = appendCommonAuthOptions(parsedArgv, {
      projectId,
      webhookId: requirePositional(parsedArgv, 2, "webhook-id")
    } as {
      projectId: string;
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
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id", "limit"]);
    ensureNoExtraPositionals(parsedArgv, 3);
    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    const input = appendCommonAuthOptions(parsedArgv, {
      projectId,
      webhookId: requirePositional(parsedArgv, 2, "webhook-id")
    } as {
      projectId: string;
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
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id"]);
    ensureNoExtraPositionals(parsedArgv, 4);
    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    const input = appendCommonAuthOptions(parsedArgv, {
      projectId,
      webhookId: requirePositional(parsedArgv, 2, "webhook-id"),
      deliveryId: requirePositional(parsedArgv, 3, "delivery-id")
    } as {
      projectId: string;
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
      "severity-lifecycle-scope",
      "cooldown",
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
      severityLifecycleScope?: string;
      cooldownSeconds?: number;
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
    const severityLifecycleScope = readStringOption(parsedArgv, "severity-lifecycle-scope");
    if (severityLifecycleScope !== undefined) {
      input.severityLifecycleScope = severityLifecycleScope;
    }
    const cooldownSeconds = readIntegerOption(parsedArgv, "cooldown");
    if (cooldownSeconds !== undefined) {
      input.cooldownSeconds = cooldownSeconds;
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
      "project-id",
      "service-id",
      "channel",
      "condition",
      "severity-min",
      "severity-lifecycle-scope",
      "cooldown",
      "config-json",
      "is-enabled"
    ]);
    ensureNoExtraPositionals(parsedArgv, 3);
    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    const input = appendCommonAuthOptions(parsedArgv, {
      projectId,
      alertId: requirePositional(parsedArgv, 2, "alert-id")
    } as {
      projectId: string;
      alertId: string;
      serviceId?: string | null;
      channel?: string;
      conditionType?: string;
      severityMin?: string | null;
      severityLifecycleScope?: string | null;
      cooldownSeconds?: number;
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
    const severityLifecycleScope = readStringOption(parsedArgv, "severity-lifecycle-scope");
    if (severityLifecycleScope !== undefined) {
      input.severityLifecycleScope = severityLifecycleScope === "null" ? null : severityLifecycleScope;
    }
    const cooldownSeconds = readIntegerOption(parsedArgv, "cooldown");
    if (cooldownSeconds !== undefined) {
      input.cooldownSeconds = cooldownSeconds;
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
      input.severityLifecycleScope === undefined &&
      input.cooldownSeconds === undefined &&
      input.config === undefined &&
      input.isEnabled === undefined
    ) {
      throw new CliInputError("At least one alert field must be provided.");
    }

    return await (dependencies.updateAlertCommand ?? defaultUpdateAlertCommand)(input as Parameters<typeof defaultUpdateAlertCommand>[0]);
  }

  if (action === "delete") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id"]);
    ensureNoExtraPositionals(parsedArgv, 3);
    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    return await (dependencies.deleteAlertCommand ?? defaultDeleteAlertCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId,
        alertId: requirePositional(parsedArgv, 2, "alert-id")
      })
    );
  }

  throw new CliInputError("Unknown alert command.");
}

export async function handleSlackCommand(parsedArgv: ParsedArgv, dependencies: ManagementCommandDependencies): Promise<CliCommandResult> {
  const action = requirePositional(parsedArgv, 1, "action");

  if (action === "list") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id"]);
    ensureNoExtraPositionals(parsedArgv, 2);

    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    return await (dependencies.listSlackDestinationsCommand ?? defaultListSlackDestinationsCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId
      })
    );
  }

  if (action === "connect-url") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id", "return-to"]);
    ensureNoExtraPositionals(parsedArgv, 2);

    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    const input = appendCommonAuthOptions(parsedArgv, {
      projectId
    } as { projectId: string; returnTo?: string; authFilePath?: string; json?: boolean });
    const returnTo = readStringOption(parsedArgv, "return-to");
    if (returnTo !== undefined) {
      input.returnTo = returnTo;
    }

    return await (dependencies.getSlackConnectUrlCommand ?? defaultGetSlackConnectUrlCommand)(input);
  }

  if (action === "test") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    return await (dependencies.testSlackDestinationCommand ?? defaultTestSlackDestinationCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId,
        destinationId: requirePositional(parsedArgv, 2, "destination-id")
      })
    );
  }

  if (action === "delete") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    return await (dependencies.deleteSlackDestinationCommand ?? defaultDeleteSlackDestinationCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId,
        destinationId: requirePositional(parsedArgv, 2, "destination-id")
      })
    );
  }

  throw new CliInputError("Unknown slack command.");
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

    let weeklyReportConfig: { to: string[] } | { webhookUrl: string } | { slackDestinationId: string };
    if (channel === "slack") {
      if (typeof (config as Record<string, unknown>)["slack_destination_id"] === "string") {
        weeklyReportConfig = { slackDestinationId: String((config as Record<string, unknown>)["slack_destination_id"]) };
      } else {
        weeklyReportConfig = { webhookUrl: String((config as Record<string, unknown>)["webhook_url"]) };
      }
    } else {
      weeklyReportConfig = { to: (config as { to: string[] }).to };
    }

    const input = appendCommonAuthOptions(parsedArgv, {
      projectId,
      channel,
      config: weeklyReportConfig,
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
      input.config = "slack_destination_id" in (config as Record<string, unknown>)
        ? { slackDestinationId: String((config as Record<string, unknown>)["slack_destination_id"]) }
        : "webhook_url" in (config as Record<string, unknown>)
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
