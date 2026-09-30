import { AnalyticsReportRequestSchema } from "./analytics-report-api.js";
import { analyticsReportWithAuthCommand } from "./analytics-report-commands.js";
import {
  appendCommonAuthOptions,
  CliInputError,
  ensureNoExtraPositionals,
  expectNoUnknownOptions,
  readStringOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";
import type {
  CliCommandResult,
  ManagementCommandDependencies
} from "./management-command-dependencies.js";

export async function handleAnalyticsReportCommand(
  parsed: ParsedArgv,
  dependencies: ManagementCommandDependencies
): Promise<CliCommandResult> {
  if (requirePositional(parsed, 2, "reports action") !== "query")
    throw new CliInputError("Unknown analytics reports command.");
  expectNoUnknownOptions(parsed, [
    "project",
    "report-key",
    "from",
    "to",
    "last",
    "auth-file",
    "json"
  ]);
  ensureNoExtraPositionals(parsed, 3);
  const last = readStringOption(parsed, "last");
  const query = AnalyticsReportRequestSchema.safeParse(
    last === undefined
      ? {
          projectId: readStringOption(parsed, "project"),
          reportKey: readStringOption(parsed, "report-key"),
          from: readStringOption(parsed, "from"),
          to: readStringOption(parsed, "to")
        }
      : {
          projectId: readStringOption(parsed, "project"),
          reportKey: readStringOption(parsed, "report-key"),
          last,
          ...(readStringOption(parsed, "from") === undefined
            ? {}
            : { from: readStringOption(parsed, "from") }),
          ...(readStringOption(parsed, "to") === undefined
            ? {}
            : { to: readStringOption(parsed, "to") })
        }
  );
  if (!query.success) throw new CliInputError("Invalid analytics report query.");
  return (dependencies.analyticsReportCommand ?? analyticsReportWithAuthCommand)(
    appendCommonAuthOptions(parsed, { query: query.data })
  );
}
