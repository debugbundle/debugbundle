import { AnalyticsJobRecoveryInputSchema } from "./analytics-job-recovery-api.js";
import { analyticsJobRecoveryWithAuthCommand } from "./analytics-job-recovery-commands.js";
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

export async function handleAnalyticsJobRecoveryCommand(
  parsed: ParsedArgv,
  dependencies: ManagementCommandDependencies
): Promise<CliCommandResult> {
  if (requirePositional(parsed, 2, "jobs action") !== "retry")
    throw new CliInputError("Unknown analytics jobs command.");
  expectNoUnknownOptions(parsed, ["project", "event", "auth-file", "json"]);
  ensureNoExtraPositionals(parsed, 3);
  const retry = AnalyticsJobRecoveryInputSchema.safeParse({
    projectId: readStringOption(parsed, "project"),
    eventId: readStringOption(parsed, "event")
  });
  if (!retry.success) throw new CliInputError("Invalid analytics job retry request.");
  return (dependencies.analyticsJobRecoveryCommand ?? analyticsJobRecoveryWithAuthCommand)(
    appendCommonAuthOptions(parsed, { retry: retry.data })
  );
}
