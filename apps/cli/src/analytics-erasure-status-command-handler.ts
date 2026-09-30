import { AnalyticsErasureStatusInputSchema } from "./analytics-erasure-status-api.js";
import { analyticsErasureStatusWithAuthCommand } from "./analytics-erasure-status-commands.js";
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

export async function handleAnalyticsErasureStatusCommand(
  parsed: ParsedArgv,
  dependencies: ManagementCommandDependencies
): Promise<CliCommandResult> {
  if (requirePositional(parsed, 2, "erasures action") !== "status")
    throw new CliInputError("Unknown analytics erasures command.");
  expectNoUnknownOptions(parsed, ["project", "task", "auth-file", "json"]);
  ensureNoExtraPositionals(parsed, 3);
  const query = AnalyticsErasureStatusInputSchema.safeParse({
    projectId: readStringOption(parsed, "project"),
    taskId: readStringOption(parsed, "task")
  });
  if (!query.success) throw new CliInputError("Invalid analytics erasure status query.");
  return (dependencies.analyticsErasureStatusCommand ?? analyticsErasureStatusWithAuthCommand)(
    appendCommonAuthOptions(parsed, { query: query.data })
  );
}
