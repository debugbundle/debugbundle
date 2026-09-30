import { AnalyticsWriterOperationSchema } from "./analytics-writer-api.js";
import { analyticsWritersWithAuthCommand } from "./analytics-writer-commands.js";
import {
  appendCommonAuthOptions,
  CliInputError,
  ensureNoExtraPositionals,
  expectNoUnknownOptions,
  readJsonOption,
  readStringOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";
import type {
  CliCommandResult,
  ManagementCommandDependencies
} from "./management-command-dependencies.js";

export async function handleAnalyticsWritersCommand(
  parsed: ParsedArgv,
  dependencies: ManagementCommandDependencies
): Promise<CliCommandResult> {
  const operation = requirePositional(parsed, 2, "writers action");
  let candidate: unknown;
  if (operation === "list") {
    expectNoUnknownOptions(parsed, ["project", "auth-file", "json"]);
    ensureNoExtraPositionals(parsed, 3);
    candidate = { operation, projectId: readStringOption(parsed, "project") };
  } else if (operation === "preview" || operation === "apply") {
    expectNoUnknownOptions(parsed, [
      "project",
      "change-json",
      "auth-file",
      "json",
      ...(operation === "apply" ? ["preview-hash"] : [])
    ]);
    ensureNoExtraPositionals(parsed, 3);
    candidate = {
      operation,
      projectId: readStringOption(parsed, "project"),
      change: readJsonOption(parsed, "change-json"),
      ...(operation === "apply" ? { previewHash: readStringOption(parsed, "preview-hash") } : {})
    };
  } else throw new CliInputError("Unknown analytics writers command.");
  const input = AnalyticsWriterOperationSchema.safeParse(candidate);
  if (!input.success)
    throw new CliInputError(
      "Invalid analytics writer request. Apply requires --preview-hash from a matching preview."
    );
  return (dependencies.analyticsWritersCommand ?? analyticsWritersWithAuthCommand)(
    appendCommonAuthOptions(parsed, { operation: input.data })
  );
}
