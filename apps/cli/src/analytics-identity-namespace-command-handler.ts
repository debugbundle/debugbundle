import { AnalyticsIdentityNamespaceOperationSchema } from "./analytics-identity-namespace-api.js";
import { analyticsIdentityNamespaceWithAuthCommand } from "./analytics-identity-namespace-commands.js";
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

export async function handleAnalyticsIdentityNamespaceCommand(
  parsed: ParsedArgv,
  dependencies: ManagementCommandDependencies
): Promise<CliCommandResult> {
  const operation = requirePositional(parsed, 2, "identity namespace action");
  let candidate: unknown;
  if (operation === "get") {
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
  } else throw new CliInputError("Unknown analytics identity-namespace command.");
  const parsedInput = AnalyticsIdentityNamespaceOperationSchema.safeParse(candidate);
  if (!parsedInput.success)
    throw new CliInputError(
      "Invalid analytics identity-namespace request. Apply requires --preview-hash from a matching preview."
    );
  return (
    dependencies.analyticsIdentityNamespaceCommand ?? analyticsIdentityNamespaceWithAuthCommand
  )(appendCommonAuthOptions(parsed, { operation: parsedInput.data }));
}
