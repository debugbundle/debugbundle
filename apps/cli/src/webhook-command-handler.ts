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
  appendCommonAuthOptions,
  CliInputError,
  ensureNoExtraPositionals,
  expectNoUnknownOptions,
  readBooleanStringOption,
  readCsvOption,
  readJsonOption,
  readLimitOption,
  readStringOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";
import type {
  ManagementCommandDependencies,
  CliCommandResult
} from "./management-command-dependencies.js";
import {
  WebhookEventTypeSchema,
  WebhookFiltersSchema,
  type WebhookEventType
} from "../../../packages/webhook-client/src/index.js";

function readWebhookFilters(parsedArgv: ParsedArgv): Record<string, unknown> | undefined {
  const explicitFilters = readJsonOption(parsedArgv, "filters-json");
  if (explicitFilters !== undefined) {
    if (
      ["environment", "service", "severity-min", "bundle-type", "verification"].some((option) =>
        parsedArgv.options.has(option)
      )
    ) {
      throw new CliInputError("--filters-json cannot be combined with individual filter options.");
    }
    const parsed = WebhookFiltersSchema.safeParse(explicitFilters);
    if (!parsed.success) {
      throw new CliInputError("Invalid value for --filters-json.");
    }
    return parsed.data;
  }

  const filters: Record<string, unknown> = {};
  for (const [option, field] of [
    ["environment", "environment"],
    ["service", "service"],
    ["bundle-type", "bundle_type"]
  ] as const) {
    const values = readCsvOption(parsedArgv, option);
    if (values !== undefined) filters[field] = values;
  }
  const severityMin = readStringOption(parsedArgv, "severity-min");
  if (severityMin !== undefined) filters["severity_min"] = severityMin;
  const verification = readBooleanStringOption(parsedArgv, "verification");
  if (verification !== undefined) filters["verification"] = verification;
  return Object.keys(filters).length > 0 ? filters : undefined;
}

export async function handleWebhookCommand(
  parsedArgv: ParsedArgv,
  dependencies: ManagementCommandDependencies
): Promise<CliCommandResult> {
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
    const filters = readWebhookFilters(parsedArgv);
    if (filters !== undefined) {
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
      "filters-json",
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
    const filters = readWebhookFilters(parsedArgv);
    if (filters !== undefined) {
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
      eventType?: WebhookEventType;
      authFilePath?: string;
      json?: boolean;
    });
    const eventType = readStringOption(parsedArgv, "event");
    if (eventType !== undefined) {
      const parsedEvent = WebhookEventTypeSchema.safeParse(eventType);
      if (!parsedEvent.success) {
        throw new CliInputError("Invalid value for --event.");
      }

      input.eventType = parsedEvent.data;
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

    return await (dependencies.listWebhookDeliveriesCommand ?? defaultListWebhookDeliveriesCommand)(
      input
    );
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

    return await (dependencies.retryWebhookDeliveryCommand ?? defaultRetryWebhookDeliveryCommand)(
      input
    );
  }

  throw new CliInputError("Unknown webhook command.");
}
