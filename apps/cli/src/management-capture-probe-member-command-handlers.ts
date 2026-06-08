import {
  ImmediateClientErrorPathRulesSchema,
  RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES
} from "../../../packages/shared-types/src/index.js";
import type { CapturePolicyUpdate, CaptureRuleCreate, CaptureRuleUpdate } from "../../../packages/shared-types/src/index.js";
import {
  getCapturePolicyWithAuthCommand as defaultGetCapturePolicyCommand,
  setCapturePolicyWithAuthCommand as defaultSetCapturePolicyCommand
} from "./capture-policy-commands.js";
import {
  createCaptureRuleWithAuthCommand as defaultCreateCaptureRuleCommand,
  deleteCaptureRuleWithAuthCommand as defaultDeleteCaptureRuleCommand,
  listCaptureRulesWithAuthCommand as defaultListCaptureRulesCommand,
  updateCaptureRuleWithAuthCommand as defaultUpdateCaptureRuleCommand
} from "./capture-rule-commands.js";
import {
  appendCommonAuthOptions,
  CliInputError,
  ensureNoExtraPositionals,
  expectNoUnknownOptions,
  readBooleanStringOption,
  readIntegerOption,
  readJsonOption,
  readStringListOption,
  readStringOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";
import type { ManagementCommandDependencies, CliCommandResult } from "./management-command-dependencies.js";
import {
  activateProbeWithAuthCommand as defaultActivateProbeCommand,
  deactivateProbeWithAuthCommand as defaultDeactivateProbeCommand,
  listActiveProbesWithAuthCommand as defaultListActiveProbesCommand
} from "./probe-commands.js";

export async function handleCapturePolicyCommand(
  parsedArgv: ParsedArgv,
  dependencies: ManagementCommandDependencies
): Promise<CliCommandResult> {
  function parseClientErrorStatusesOption(value: string): number[] {
    const parts = value.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
    if (parts.length === 0) {
      throw new CliInputError("Invalid value for --client-error-statuses.");
    }

    const statuses: number[] = [];
    for (const part of parts) {
      if (!/^\d+$/.test(part)) {
        throw new CliInputError("Invalid value for --client-error-statuses.");
      }

      const status = Number(part);
      if (!Number.isInteger(status) || status < 400 || status > 499) {
        throw new CliInputError("Invalid value for --client-error-statuses.");
      }

      statuses.push(status);
    }

    const normalized = Array.from(new Set(statuses)).sort((left, right) => left - right);
    if (normalized.length > 12) {
      throw new CliInputError("Invalid value for --client-error-statuses.");
    }

    return normalized;
  }

  function parseClientErrorPathRuleOption(value: string): NonNullable<CapturePolicyUpdate["immediate_client_error_path_rules"]>[number] {
    const separatorIndex = value.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
      throw new CliInputError("Invalid value for --client-error-path-rule.");
    }

    const status = Number(value.slice(0, separatorIndex));
    if (!Number.isInteger(status) || status < 400 || status > 499) {
      throw new CliInputError("Invalid value for --client-error-path-rule.");
    }

    const ruleValue = value.slice(separatorIndex + 1);
    const methodSeparatorIndex = ruleValue.lastIndexOf("@");
    const pathPattern = methodSeparatorIndex === -1 ? ruleValue : ruleValue.slice(0, methodSeparatorIndex);
    const methods = methodSeparatorIndex === -1
      ? []
      : ruleValue
          .slice(methodSeparatorIndex + 1)
          .split(",")
          .map((method) => method.trim().toUpperCase())
          .filter((method) => method.length > 0);
    const parsed = ImmediateClientErrorPathRulesSchema.safeParse([
      {
        status_code: status,
        path_pattern: pathPattern,
        methods
      }
    ]);
    if (!parsed.success || parsed.data[0] === undefined) {
      throw new CliInputError("Invalid value for --client-error-path-rule.");
    }

    return parsed.data[0];
  }

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
    expectNoUnknownOptions(parsedArgv, [
      "auth-file",
      "json",
      "project",
      "preset",
      "override",
      "client-error-incidents",
      "client-error-statuses",
      "client-error-path-rule",
      "client-error-path-rules-json"
    ]);
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

    const clientErrorIncidents = readStringOption(parsedArgv, "client-error-incidents");
    const clientErrorStatuses = readStringOption(parsedArgv, "client-error-statuses");
    const clientErrorPathRuleOptions = readStringListOption(parsedArgv, "client-error-path-rule") ?? [];
    const clientErrorPathRulesJson = readJsonOption(parsedArgv, "client-error-path-rules-json");

    if (clientErrorStatuses !== undefined && clientErrorIncidents !== "custom") {
      throw new CliInputError("Use --client-error-statuses only with --client-error-incidents custom.");
    }

    if (clientErrorPathRuleOptions.length > 0 && clientErrorPathRulesJson !== undefined) {
      throw new CliInputError("Use either --client-error-path-rule or --client-error-path-rules-json, not both.");
    }

    if (clientErrorIncidents !== undefined) {
      switch (clientErrorIncidents) {
        case "preset-default":
          update.immediate_client_error_statuses = null;
          break;
        case "none":
          update.immediate_client_error_statuses = [];
          break;
        case "recommended":
          update.immediate_client_error_statuses = [...RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES];
          break;
        case "custom":
          if (clientErrorStatuses === undefined) {
            throw new CliInputError("Missing required option --client-error-statuses.");
          }
          update.immediate_client_error_statuses = parseClientErrorStatusesOption(clientErrorStatuses);
          break;
        default:
          throw new CliInputError("Invalid value for --client-error-incidents.");
      }
    }

    if (clientErrorPathRulesJson !== undefined) {
      if (clientErrorPathRulesJson === null) {
        update.immediate_client_error_path_rules = null;
      } else {
        const parsed = ImmediateClientErrorPathRulesSchema.safeParse(clientErrorPathRulesJson);
        if (!parsed.success) {
          throw new CliInputError("Invalid value for --client-error-path-rules-json.");
        }
        update.immediate_client_error_path_rules = parsed.data;
      }
    }

    if (clientErrorPathRuleOptions.length > 0) {
      update.immediate_client_error_path_rules = ImmediateClientErrorPathRulesSchema.parse(
        clientErrorPathRuleOptions.map(parseClientErrorPathRuleOption)
      );
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

export async function handleCaptureRuleCommand(
  parsedArgv: ParsedArgv,
  dependencies: ManagementCommandDependencies
): Promise<CliCommandResult> {
  const action = requirePositional(parsedArgv, 1, "action");

  if (action === "list") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id"]);
    ensureNoExtraPositionals(parsedArgv, 2);

    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    return await (dependencies.listCaptureRulesCommand ?? defaultListCaptureRulesCommand)(
      appendCommonAuthOptions(parsedArgv, { projectId })
    );
  }

  if (action === "create") {
    expectNoUnknownOptions(parsedArgv, [
      "auth-file",
      "json",
      "project-id",
      "name",
      "description",
      "enabled",
      "action",
      "matcher-json",
      "sample-rate",
      "sample-event-class",
      "expires-at"
    ]);
    ensureNoExtraPositionals(parsedArgv, 2);

    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }
    const name = readStringOption(parsedArgv, "name");
    if (name === undefined) {
      throw new CliInputError("Missing required option --name.");
    }
    const actionValue = readStringOption(parsedArgv, "action");
    if (actionValue === undefined) {
      throw new CliInputError("Missing required option --action.");
    }
    if (actionValue !== "demote" && actionValue !== "sample" && actionValue !== "drop") {
      throw new CliInputError("Invalid value for --action.");
    }
    const matcher = readJsonOption(parsedArgv, "matcher-json");
    if (matcher === undefined) {
      throw new CliInputError("Missing required option --matcher-json.");
    }
    if (matcher === null || typeof matcher !== "object" || Array.isArray(matcher)) {
      throw new CliInputError("Invalid value for --matcher-json.");
    }

    const create: CaptureRuleCreate = {
      name,
      description: readStringOption(parsedArgv, "description") ?? null,
      enabled: readBooleanStringOption(parsedArgv, "enabled") ?? true,
      action: actionValue,
      matcher,
      sample_rate: null as number | null,
      sample_event_class: null as "preserve" | "context" | null,
      created_by_user_id: null,
      created_from_incident_id: null,
      created_from_event_id: null,
      expires_at: readStringOption(parsedArgv, "expires-at") ?? null
    };

    const sampleRate = readStringOption(parsedArgv, "sample-rate");
    if (sampleRate !== undefined) {
      const parsed = Number(sampleRate);
      if (!Number.isFinite(parsed)) {
        throw new CliInputError("Invalid value for --sample-rate.");
      }
      create.sample_rate = parsed;
    }

    const sampleEventClass = readStringOption(parsedArgv, "sample-event-class");
    if (sampleEventClass !== undefined) {
      if (sampleEventClass !== "preserve" && sampleEventClass !== "context") {
        throw new CliInputError("Invalid value for --sample-event-class.");
      }
      create.sample_event_class = sampleEventClass;
    }

    return await (dependencies.createCaptureRuleCommand ?? defaultCreateCaptureRuleCommand)(
      appendCommonAuthOptions(parsedArgv, { projectId, create })
    );
  }

  if (action === "update") {
    expectNoUnknownOptions(parsedArgv, [
      "auth-file",
      "json",
      "project-id",
      "name",
      "description",
      "enabled",
      "action",
      "matcher-json",
      "sample-rate",
      "sample-event-class",
      "expires-at"
    ]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const projectId = readStringOption(parsedArgv, "project-id");
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project-id.");
    }

    const update: CaptureRuleUpdate = {};
    const name = readStringOption(parsedArgv, "name");
    if (name !== undefined) {
      update["name"] = name;
    }
    const description = readStringOption(parsedArgv, "description");
    if (description !== undefined) {
      update["description"] = description;
    }
    const enabled = readBooleanStringOption(parsedArgv, "enabled");
    if (enabled !== undefined) {
      update["enabled"] = enabled;
    }
    const actionValue = readStringOption(parsedArgv, "action");
    if (actionValue !== undefined) {
      if (actionValue !== "demote" && actionValue !== "sample" && actionValue !== "drop") {
        throw new CliInputError("Invalid value for --action.");
      }
      update["action"] = actionValue;
    }
    const matcher = readJsonOption(parsedArgv, "matcher-json");
    if (matcher !== undefined) {
      if (matcher === null || typeof matcher !== "object" || Array.isArray(matcher)) {
        throw new CliInputError("Invalid value for --matcher-json.");
      }
      update["matcher"] = matcher;
    }
    const sampleRate = readStringOption(parsedArgv, "sample-rate");
    if (sampleRate !== undefined) {
      const parsed = Number(sampleRate);
      if (!Number.isFinite(parsed)) {
        throw new CliInputError("Invalid value for --sample-rate.");
      }
      update["sample_rate"] = parsed;
    }
    const sampleEventClass = readStringOption(parsedArgv, "sample-event-class");
    if (sampleEventClass !== undefined) {
      if (sampleEventClass !== "preserve" && sampleEventClass !== "context") {
        throw new CliInputError("Invalid value for --sample-event-class.");
      }
      update["sample_event_class"] = sampleEventClass;
    }
    const expiresAt = readStringOption(parsedArgv, "expires-at");
    if (expiresAt !== undefined) {
      update["expires_at"] = expiresAt;
    }

    if (Object.keys(update).length === 0) {
      throw new CliInputError("At least one capture rule field must be provided.");
    }

    return await (dependencies.updateCaptureRuleCommand ?? defaultUpdateCaptureRuleCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId,
        ruleId: requirePositional(parsedArgv, 2, "rule-id"),
        update
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

    return await (dependencies.deleteCaptureRuleCommand ?? defaultDeleteCaptureRuleCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId,
        ruleId: requirePositional(parsedArgv, 2, "rule-id")
      })
    );
  }

  throw new CliInputError("Unknown capture-rule command.");
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

export function handleMemberCommand(parsedArgv: ParsedArgv, dependencies: ManagementCommandDependencies): Promise<CliCommandResult> {
  void parsedArgv;
  void dependencies;
  throw new CliInputError("Use `debugbundle project members ... --project-id <id>` for project collaboration commands.");
}
