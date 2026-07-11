import {
  AnalyticsBundleAnalysisKindSchema,
  AnalyticsBundleSeveritySchema,
  AnalyticsOpportunityBundleStatusSchema,
  AnalyticsSavedFunnelCreateSchema,
  AnalyticsSavedFunnelUpdateSchema,
  type AnalyticsBundleAnalysisKind,
  type AnalyticsSettingsUpdate
} from "../../../packages/shared-types/src/index.js";
import {
  getAnalyticsSettingsWithAuthCommand as defaultGetAnalyticsSettingsCommand,
  setAnalyticsSettingsWithAuthCommand as defaultSetAnalyticsSettingsCommand
} from "./analytics-settings-commands.js";
import {
  archiveAnalyticsSavedFunnelWithAuthCommand as defaultArchiveAnalyticsSavedFunnelCommand,
  createAnalyticsSavedFunnelWithAuthCommand as defaultCreateAnalyticsSavedFunnelCommand,
  listAnalyticsSavedFunnelsWithAuthCommand as defaultListAnalyticsSavedFunnelsCommand,
  updateAnalyticsSavedFunnelWithAuthCommand as defaultUpdateAnalyticsSavedFunnelCommand
} from "./analytics-saved-funnel-commands.js";
import {
  createAnalyticsBundleWithAuthCommand as defaultCreateAnalyticsBundleCommand,
  getAnalyticsBundleWithAuthCommand as defaultGetAnalyticsBundleCommand,
  listAnalyticsBundlesWithAuthCommand as defaultListAnalyticsBundlesCommand
} from "./analytics-bundle-commands.js";
import {
  getAnalyticsJourneySampleWithAuthCommand as defaultGetAnalyticsJourneySampleCommand,
  listAnalyticsJourneySamplesWithAuthCommand as defaultListAnalyticsJourneySamplesCommand
} from "./analytics-journey-sample-commands.js";
import {
  getAnalyticsActionsWithAuthCommand as defaultGetAnalyticsActionsCommand,
  getAnalyticsDevicesWithAuthCommand as defaultGetAnalyticsDevicesCommand,
  getAnalyticsFunnelWithAuthCommand as defaultGetAnalyticsFunnelCommand,
  getAnalyticsIncidentImpactWithAuthCommand as defaultGetAnalyticsIncidentImpactCommand,
  getAnalyticsJourneysWithAuthCommand as defaultGetAnalyticsJourneysCommand,
  getAnalyticsOpportunityWithAuthCommand as defaultGetAnalyticsOpportunityCommand,
  getAnalyticsReferrersWithAuthCommand as defaultGetAnalyticsReferrersCommand,
  getAnalyticsRoutesWithAuthCommand as defaultGetAnalyticsRoutesCommand,
  getAnalyticsSummaryWithAuthCommand as defaultGetAnalyticsSummaryCommand,
  listAnalyticsFunnelsWithAuthCommand as defaultListAnalyticsFunnelsCommand,
  listAnalyticsOpportunitiesWithAuthCommand as defaultListAnalyticsOpportunitiesCommand
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
import type {
  CliCommandResult,
  ManagementCommandDependencies
} from "./management-command-dependencies.js";

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

function readAnalyticsSeverity(parsedArgv: ParsedArgv): "low" | "medium" | "high" | undefined {
  const severity = readStringOption(parsedArgv, "severity");
  if (severity === undefined) return undefined;
  const parsed = AnalyticsBundleSeveritySchema.safeParse(severity);
  if (parsed.success) return parsed.data;
  throw new CliInputError("Invalid value for --severity.");
}

function readAnalyticsOpportunityBundleStatus(
  parsedArgv: ParsedArgv
): "not_requested" | "pending" | "running" | "completed" | "failed" | undefined {
  const status = readStringOption(parsedArgv, "bundle-status");
  if (status === undefined) return undefined;
  const parsed = AnalyticsOpportunityBundleStatusSchema.safeParse(status);
  if (parsed.success) return parsed.data;
  throw new CliInputError("Invalid value for --bundle-status.");
}

function readPrivacyMode(
  parsedArgv: ParsedArgv
): AnalyticsSettingsUpdate["privacy_mode"] | undefined {
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

function readAnalyticsOpportunityStatus(
  parsedArgv: ParsedArgv
): "open" | "resolved" | "snoozed" | "all" | undefined {
  const status = readStringOption(parsedArgv, "status");
  if (status === undefined) {
    return undefined;
  }
  if (status === "open" || status === "resolved" || status === "snoozed" || status === "all") {
    return status;
  }

  throw new CliInputError("Invalid value for --status.");
}

function readAnalyticsOpportunityKind(
  parsedArgv: ParsedArgv
): AnalyticsBundleAnalysisKind | undefined {
  const kind = readStringOption(parsedArgv, "kind");
  if (kind === undefined) {
    return undefined;
  }
  const parsed = AnalyticsBundleAnalysisKindSchema.safeParse(kind);
  if (parsed.success) {
    return parsed.data;
  }

  throw new CliInputError("Invalid value for --kind.");
}

function readRequiredAnalyticsBundleKind(parsedArgv: ParsedArgv): AnalyticsBundleAnalysisKind {
  const kind = readAnalyticsOpportunityKind(parsedArgv);
  if (kind === undefined) {
    throw new CliInputError("Missing required option --kind.");
  }

  return kind;
}

function readAnalyticsBundleFilters(parsedArgv: ParsedArgv): Record<string, unknown> | undefined {
  const filters = readJsonOption(parsedArgv, "filters-json");
  if (filters === undefined) {
    return undefined;
  }
  if (typeof filters === "object" && filters !== null && !Array.isArray(filters)) {
    return filters as Record<string, unknown>;
  }

  throw new CliInputError("Invalid value for --filters-json.");
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
    throw new CliInputError(
      "Use either --approved-custom-dimensions or --approved-custom-dimensions-json."
    );
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
  if (
    resource === "summary" ||
    resource === "routes" ||
    resource === "journeys" ||
    resource === "devices" ||
    resource === "referrers" ||
    resource === "actions" ||
    resource === "funnels"
  ) {
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
        ? (dependencies.getAnalyticsSummaryCommand ?? defaultGetAnalyticsSummaryCommand)
        : resource === "routes"
          ? (dependencies.getAnalyticsRoutesCommand ?? defaultGetAnalyticsRoutesCommand)
          : resource === "journeys"
            ? (dependencies.getAnalyticsJourneysCommand ?? defaultGetAnalyticsJourneysCommand)
            : resource === "devices"
              ? (dependencies.getAnalyticsDevicesCommand ?? defaultGetAnalyticsDevicesCommand)
              : resource === "referrers"
                ? (dependencies.getAnalyticsReferrersCommand ?? defaultGetAnalyticsReferrersCommand)
                : resource === "actions"
                  ? (dependencies.getAnalyticsActionsCommand ?? defaultGetAnalyticsActionsCommand)
                  : (dependencies.listAnalyticsFunnelsCommand ??
                    defaultListAnalyticsFunnelsCommand);

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

  if (resource === "incident-impact") {
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
    const incidentId = requirePositional(parsedArgv, 2, "incident id");
    const projectId = readProjectOption(parsedArgv);
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project.");
    }

    return await (
      dependencies.getAnalyticsIncidentImpactCommand ?? defaultGetAnalyticsIncidentImpactCommand
    )(
      appendCommonAuthOptions(parsedArgv, {
        projectId,
        incidentId,
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

  if (resource === "opportunities") {
    expectNoUnknownOptions(parsedArgv, [
      "project",
      "project-id",
      "all-projects",
      "status",
      "kind",
      "service",
      "environment",
      "severity",
      "bundle-status",
      "from",
      "to",
      "cursor",
      "limit",
      "auth-file",
      "json"
    ]);
    ensureNoExtraPositionals(parsedArgv, 2);
    const projectId = readProjectOption(parsedArgv);
    const allProjects = parsedArgv.options.get("all-projects") === true;
    if (projectId !== undefined && allProjects) {
      throw new CliInputError("Use either --project or --all-projects.");
    }
    if (projectId === undefined && !allProjects) {
      throw new CliInputError("Missing required option --project or --all-projects.");
    }

    return await (
      dependencies.listAnalyticsOpportunitiesCommand ?? defaultListAnalyticsOpportunitiesCommand
    )(
      appendCommonAuthOptions(parsedArgv, {
        projectId,
        status: readAnalyticsOpportunityStatus(parsedArgv),
        kind: readAnalyticsOpportunityKind(parsedArgv),
        service: readStringOption(parsedArgv, "service"),
        environment: readStringOption(parsedArgv, "environment"),
        severity: readAnalyticsSeverity(parsedArgv),
        bundleStatus: readAnalyticsOpportunityBundleStatus(parsedArgv),
        from: readStringOption(parsedArgv, "from"),
        to: readStringOption(parsedArgv, "to"),
        cursor: readStringOption(parsedArgv, "cursor"),
        limit: readIntegerOption(parsedArgv, "limit")
      })
    );
  }

  if (resource === "opportunity") {
    const action = requirePositional(parsedArgv, 2, "opportunity action");
    if (action !== "get") {
      throw new CliInputError("Unknown analytics opportunity command.");
    }

    expectNoUnknownOptions(parsedArgv, ["project", "project-id", "auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 4);
    const opportunityId = requirePositional(parsedArgv, 3, "opportunity id");
    const projectId = readProjectOption(parsedArgv);
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project.");
    }

    return await (
      dependencies.getAnalyticsOpportunityCommand ?? defaultGetAnalyticsOpportunityCommand
    )(
      appendCommonAuthOptions(parsedArgv, {
        projectId,
        opportunityId
      })
    );
  }

  if (resource === "bundle") {
    const action = requirePositional(parsedArgv, 2, "bundle action");
    if (action === "list") {
      expectNoUnknownOptions(parsedArgv, [
        "project",
        "project-id",
        "all-projects",
        "status",
        "kind",
        "service",
        "environment",
        "from",
        "to",
        "cursor",
        "limit",
        "auth-file",
        "json"
      ]);
      ensureNoExtraPositionals(parsedArgv, 3);
      const projectId = readProjectOption(parsedArgv);
      const allProjects = parsedArgv.options.get("all-projects") === true;
      if (projectId !== undefined && allProjects) {
        throw new CliInputError("Use either --project or --all-projects.");
      }
      if (projectId === undefined && !allProjects) {
        throw new CliInputError("Missing required option --project or --all-projects.");
      }
      const status = readStringOption(parsedArgv, "status");
      if (
        status !== undefined &&
        status !== "all" &&
        status !== "pending" &&
        status !== "running" &&
        status !== "completed" &&
        status !== "failed"
      ) {
        throw new CliInputError("Invalid value for --status.");
      }

      return await (dependencies.listAnalyticsBundlesCommand ?? defaultListAnalyticsBundlesCommand)(
        appendCommonAuthOptions(parsedArgv, {
          projectId,
          status,
          kind: readAnalyticsOpportunityKind(parsedArgv),
          service: readStringOption(parsedArgv, "service"),
          environment: readStringOption(parsedArgv, "environment"),
          from: readStringOption(parsedArgv, "from"),
          to: readStringOption(parsedArgv, "to"),
          cursor: readStringOption(parsedArgv, "cursor"),
          limit: readIntegerOption(parsedArgv, "limit")
        })
      );
    }

    if (action === "create") {
      expectNoUnknownOptions(parsedArgv, [
        "project",
        "project-id",
        "kind",
        "from",
        "to",
        "last",
        "funnel",
        "route",
        "incident-id",
        "deploy-id",
        "filters-json",
        "auth-file",
        "json"
      ]);
      ensureNoExtraPositionals(parsedArgv, 3);
      const projectId = readProjectOption(parsedArgv);
      if (projectId === undefined) {
        throw new CliInputError("Missing required option --project.");
      }

      return await (
        dependencies.createAnalyticsBundleCommand ?? defaultCreateAnalyticsBundleCommand
      )(
        appendCommonAuthOptions(parsedArgv, {
          projectId,
          analysisKind: readRequiredAnalyticsBundleKind(parsedArgv),
          from: readStringOption(parsedArgv, "from"),
          to: readStringOption(parsedArgv, "to"),
          last: readStringOption(parsedArgv, "last"),
          funnel: readStringOption(parsedArgv, "funnel"),
          route: readStringOption(parsedArgv, "route"),
          incidentId: readStringOption(parsedArgv, "incident-id"),
          deployId: readStringOption(parsedArgv, "deploy-id"),
          filters: readAnalyticsBundleFilters(parsedArgv)
        })
      );
    }

    if (action !== "get") {
      throw new CliInputError("Unknown analytics bundle command.");
    }

    expectNoUnknownOptions(parsedArgv, ["project", "project-id", "auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 4);
    const bundleGenerationId = requirePositional(parsedArgv, 3, "bundle generation id");
    const projectId = readProjectOption(parsedArgv);
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project.");
    }

    return await (dependencies.getAnalyticsBundleCommand ?? defaultGetAnalyticsBundleCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId,
        bundleGenerationId
      })
    );
  }

  if (resource === "journey-samples") {
    const action = requirePositional(parsedArgv, 2, "journey-samples action");
    if (action === "list") {
      expectNoUnknownOptions(parsedArgv, [
        "project",
        "project-id",
        "service",
        "environment",
        "tag",
        "cursor",
        "limit",
        "auth-file",
        "json"
      ]);
      ensureNoExtraPositionals(parsedArgv, 3);
      const projectId = readProjectOption(parsedArgv);
      if (projectId === undefined) {
        throw new CliInputError("Missing required option --project.");
      }

      return await (
        dependencies.listAnalyticsJourneySamplesCommand ?? defaultListAnalyticsJourneySamplesCommand
      )(
        appendCommonAuthOptions(parsedArgv, {
          projectId,
          service: readStringOption(parsedArgv, "service"),
          environment: readStringOption(parsedArgv, "environment"),
          tag: readStringOption(parsedArgv, "tag"),
          cursor: readStringOption(parsedArgv, "cursor"),
          limit: readIntegerOption(parsedArgv, "limit")
        })
      );
    }

    if (action !== "get") {
      throw new CliInputError("Unknown analytics journey-samples command.");
    }

    expectNoUnknownOptions(parsedArgv, ["project", "project-id", "auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 4);
    const sampleId = requirePositional(parsedArgv, 3, "journey sample id");
    const projectId = readProjectOption(parsedArgv);
    if (projectId === undefined) {
      throw new CliInputError("Missing required option --project.");
    }

    return await (
      dependencies.getAnalyticsJourneySampleCommand ?? defaultGetAnalyticsJourneySampleCommand
    )(
      appendCommonAuthOptions(parsedArgv, {
        projectId,
        sampleId
      })
    );
  }

  if (resource === "saved-funnels") {
    const action = requirePositional(parsedArgv, 2, "saved-funnels action");
    const projectId = readProjectOption(parsedArgv);
    if (projectId === undefined) throw new CliInputError("Missing required option --project.");

    if (action === "list") {
      expectNoUnknownOptions(parsedArgv, ["project", "project-id", "auth-file", "json"]);
      ensureNoExtraPositionals(parsedArgv, 3);
      return await (
        dependencies.listAnalyticsSavedFunnelsCommand ?? defaultListAnalyticsSavedFunnelsCommand
      )(appendCommonAuthOptions(parsedArgv, { projectId }));
    }

    if (action === "create") {
      expectNoUnknownOptions(parsedArgv, [
        "project",
        "project-id",
        "key",
        "name",
        "steps-json",
        "auth-file",
        "json"
      ]);
      ensureNoExtraPositionals(parsedArgv, 3);
      const definition = AnalyticsSavedFunnelCreateSchema.safeParse({
        funnel_key: readStringOption(parsedArgv, "key"),
        display_name: readStringOption(parsedArgv, "name"),
        steps: readJsonOption(parsedArgv, "steps-json")
      });
      if (!definition.success) throw new CliInputError("Invalid saved funnel definition.");
      return await (
        dependencies.createAnalyticsSavedFunnelCommand ?? defaultCreateAnalyticsSavedFunnelCommand
      )(appendCommonAuthOptions(parsedArgv, { projectId, definition: definition.data }));
    }

    if (action === "update") {
      expectNoUnknownOptions(parsedArgv, [
        "project",
        "project-id",
        "name",
        "steps-json",
        "auth-file",
        "json"
      ]);
      ensureNoExtraPositionals(parsedArgv, 4);
      const funnelKey = requirePositional(parsedArgv, 3, "saved funnel key");
      const displayName = readStringOption(parsedArgv, "name");
      const steps = readJsonOption(parsedArgv, "steps-json");
      const update = AnalyticsSavedFunnelUpdateSchema.safeParse({
        ...(displayName === undefined ? {} : { display_name: displayName }),
        ...(steps === undefined ? {} : { steps })
      });
      if (!update.success) throw new CliInputError("Invalid saved funnel update.");
      return await (
        dependencies.updateAnalyticsSavedFunnelCommand ?? defaultUpdateAnalyticsSavedFunnelCommand
      )(appendCommonAuthOptions(parsedArgv, { projectId, funnelKey, update: update.data }));
    }

    if (action === "archive") {
      expectNoUnknownOptions(parsedArgv, ["project", "project-id", "auth-file", "json"]);
      ensureNoExtraPositionals(parsedArgv, 4);
      const funnelKey = requirePositional(parsedArgv, 3, "saved funnel key");
      return await (
        dependencies.archiveAnalyticsSavedFunnelCommand ?? defaultArchiveAnalyticsSavedFunnelCommand
      )(appendCommonAuthOptions(parsedArgv, { projectId, funnelKey }));
    }

    throw new CliInputError("Unknown analytics saved-funnels command.");
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
