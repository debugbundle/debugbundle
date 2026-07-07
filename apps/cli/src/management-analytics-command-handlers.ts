import type { AnalyticsSettingsUpdate } from "../../../packages/shared-types/src/index.js";
import {
  getAnalyticsSettingsWithAuthCommand as defaultGetAnalyticsSettingsCommand,
  setAnalyticsSettingsWithAuthCommand as defaultSetAnalyticsSettingsCommand
} from "./analytics-settings-commands.js";
import {
  getAnalyticsDevicesWithAuthCommand as defaultGetAnalyticsDevicesCommand,
  getAnalyticsFunnelWithAuthCommand as defaultGetAnalyticsFunnelCommand,
  getAnalyticsReferrersWithAuthCommand as defaultGetAnalyticsReferrersCommand,
  getAnalyticsRoutesWithAuthCommand as defaultGetAnalyticsRoutesCommand,
  getAnalyticsSummaryWithAuthCommand as defaultGetAnalyticsSummaryCommand
} from "./analytics-metrics-commands.js";
import {
  appendCommonAuthOptions,
  CliInputError,
  ensureNoExtraPositionals,
  expectNoUnknownOptions,
  readBooleanStringOption,
  readCsvOption,
  readIntegerOption,
  readJsonOption,
  readStringOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";
import type { CliCommandResult, ManagementCommandDependencies } from "./management-command-dependencies.js";

function readFloatOption(parsedArgv: ParsedArgv, optionName: string): number | undefined {
  const rawValue = readStringOption(parsedArgv, optionName);
  if (rawValue === undefined) {
    return undefined;
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    throw new CliInputError(`Invalid value for --${optionName}.`);
  }

  return value;
}

function readPrivacyMode(parsedArgv: ParsedArgv): AnalyticsSettingsUpdate["privacy_mode"] | undefined {
  const privacyMode = readStringOption(parsedArgv, "privacy-mode");
  if (privacyMode === undefined) {
    return undefined;
  }
  if (privacyMode === "strict" || privacyMode === "standard" || privacyMode === "custom") {
    return privacyMode;
  }

  throw new CliInputError("Invalid value for --privacy-mode.");
}

function readAnalyticsGranularity(parsedArgv: ParsedArgv): "hour" | "day" | undefined {
  const granularity = readStringOption(parsedArgv, "granularity");
  if (granularity === undefined) {
    return undefined;
  }
  if (granularity === "hour" || granularity === "day") {
    return granularity;
  }

  throw new CliInputError("Invalid value for --granularity.");
}

function readProjectOption(parsedArgv: ParsedArgv): string | undefined {
  const project = readStringOption(parsedArgv, "project");
  const projectId = readStringOption(parsedArgv, "project-id");
  if (project !== undefined && projectId !== undefined) {
    throw new CliInputError("Use either --project or --project-id.");
  }

  return project ?? projectId;
}

function readApprovedCustomDimensions(parsedArgv: ParsedArgv): string[] | undefined {
  const csvDimensions = readCsvOption(parsedArgv, "approved-custom-dimensions");
  const jsonDimensions = readJsonOption(parsedArgv, "approved-custom-dimensions-json");
  if (csvDimensions !== undefined && jsonDimensions !== undefined) {
    throw new CliInputError("Use either --approved-custom-dimensions or --approved-custom-dimensions-json.");
  }
  if (jsonDimensions === undefined) {
    return csvDimensions;
  }
  if (Array.isArray(jsonDimensions) && jsonDimensions.every((value) => typeof value === "string")) {
    return jsonDimensions;
  }

  throw new CliInputError("Invalid value for --approved-custom-dimensions-json.");
}

function buildAnalyticsSettingsUpdate(parsedArgv: ParsedArgv): AnalyticsSettingsUpdate {
  const update: AnalyticsSettingsUpdate = {};
  const booleanOptions: Array<[keyof AnalyticsSettingsUpdate, string]> = [
    ["enabled", "enabled"],
    ["consent_required", "consent-required"],
    ["capture_page_views", "capture-page-views"],
    ["capture_route_changes", "capture-route-changes"],
    ["capture_actions", "capture-actions"],
    ["capture_friction_signals", "capture-friction-signals"]
  ];
  for (const [field, option] of booleanOptions) {
    const value = readBooleanStringOption(parsedArgv, option);
    if (value !== undefined) {
      update[field] = value as never;
    }
  }

  const privacyMode = readPrivacyMode(parsedArgv);
  if (privacyMode !== undefined) {
    update.privacy_mode = privacyMode;
  }

  const journeySampleRate = readFloatOption(parsedArgv, "journey-sample-rate");
  if (journeySampleRate !== undefined) {
    if (journeySampleRate < 0 || journeySampleRate > 1) {
      throw new CliInputError("Invalid value for --journey-sample-rate.");
    }
    update.journey_sample_rate = journeySampleRate;
  }

  const integerOptions: Array<[keyof AnalyticsSettingsUpdate, string]> = [
    ["raw_retention_days", "raw-retention-days"],
    ["sample_retention_days", "sample-retention-days"],
    ["aggregate_retention_months", "aggregate-retention-months"],
    ["max_saved_funnels", "max-saved-funnels"],
    ["max_custom_dimensions", "max-custom-dimensions"]
  ];
  for (const [field, option] of integerOptions) {
    const value = readIntegerOption(parsedArgv, option);
    if (value !== undefined) {
      update[field] = value as never;
    }
  }

  const approvedCustomDimensions = readApprovedCustomDimensions(parsedArgv);
  if (approvedCustomDimensions !== undefined) {
    update.approved_custom_dimensions = approvedCustomDimensions;
  }

  return update;
}

export async function handleAnalyticsCommand(
  parsedArgv: ParsedArgv,
  dependencies: ManagementCommandDependencies
): Promise<CliCommandResult> {
  const resource = requirePositional(parsedArgv, 1, "analytics resource");
  if (resource === "summary" || resource === "routes" || resource === "devices" || resource === "referrers") {
    expectNoUnknownOptions(parsedArgv, [
      "project",
      "project-id",
      "from",
      "to",
      "last",
      "granularity",
      "service",
      "environment",
      "limit",
      "auth-file",
      "json"
    ]);
    ensureNoExtraPositionals(parsedArgv, 2);
    const projectId = readProjectOption(parsedArgv);
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project.");
    }

    const input = appendCommonAuthOptions(parsedArgv, {
      projectId,
      from: readStringOption(parsedArgv, "from"),
      to: readStringOption(parsedArgv, "to"),
      last: readStringOption(parsedArgv, "last"),
      granularity: readAnalyticsGranularity(parsedArgv),
      service: readStringOption(parsedArgv, "service"),
      environment: readStringOption(parsedArgv, "environment"),
      limit: readIntegerOption(parsedArgv, "limit")
    });
    const command =
      resource === "summary"
        ? dependencies.getAnalyticsSummaryCommand ?? defaultGetAnalyticsSummaryCommand
        : resource === "routes"
          ? dependencies.getAnalyticsRoutesCommand ?? defaultGetAnalyticsRoutesCommand
          : resource === "devices"
            ? dependencies.getAnalyticsDevicesCommand ?? defaultGetAnalyticsDevicesCommand
            : dependencies.getAnalyticsReferrersCommand ?? defaultGetAnalyticsReferrersCommand;

    return await command(input);
  }

  if (resource === "funnel") {
    expectNoUnknownOptions(parsedArgv, [
      "project",
      "project-id",
      "from",
      "to",
      "last",
      "granularity",
      "service",
      "environment",
      "limit",
      "auth-file",
      "json"
    ]);
    ensureNoExtraPositionals(parsedArgv, 3);
    const funnelKey = requirePositional(parsedArgv, 2, "funnel key");
    const projectId = readProjectOption(parsedArgv);
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project.");
    }

    return await (dependencies.getAnalyticsFunnelCommand ?? defaultGetAnalyticsFunnelCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId,
        funnelKey,
        from: readStringOption(parsedArgv, "from"),
        to: readStringOption(parsedArgv, "to"),
        last: readStringOption(parsedArgv, "last"),
        granularity: readAnalyticsGranularity(parsedArgv),
        service: readStringOption(parsedArgv, "service"),
        environment: readStringOption(parsedArgv, "environment"),
        limit: readIntegerOption(parsedArgv, "limit")
      })
    );
  }

  if (resource !== "settings") {
    throw new CliInputError("Unknown analytics command.");
  }

  const action = requirePositional(parsedArgv, 2, "settings action");
  if (action === "get") {
    expectNoUnknownOptions(parsedArgv, ["project", "project-id", "auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 3);
    const projectId = readProjectOption(parsedArgv);
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project.");
    }

    return await (dependencies.getAnalyticsSettingsCommand ?? defaultGetAnalyticsSettingsCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId
      })
    );
  }

  if (action === "set") {
    expectNoUnknownOptions(parsedArgv, [
      "project",
      "project-id",
      "enabled",
      "privacy-mode",
      "consent-required",
      "capture-page-views",
      "capture-route-changes",
      "capture-actions",
      "capture-friction-signals",
      "journey-sample-rate",
      "raw-retention-days",
      "sample-retention-days",
      "aggregate-retention-months",
      "max-saved-funnels",
      "max-custom-dimensions",
      "approved-custom-dimensions",
      "approved-custom-dimensions-json",
      "auth-file",
      "json"
    ]);
    ensureNoExtraPositionals(parsedArgv, 3);
    const projectId = readProjectOption(parsedArgv);
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project.");
    }

    const update = buildAnalyticsSettingsUpdate(parsedArgv);
    if (Object.keys(update).length === 0) {
      throw new CliInputError("At least one analytics settings field must be provided.");
    }

    return await (dependencies.setAnalyticsSettingsCommand ?? defaultSetAnalyticsSettingsCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId,
        update
      })
    );
  }

  throw new CliInputError("Unknown analytics settings command.");
}
