import { AnalyticsSpaceOperationSchema } from "./analytics-space-api.js";
import { analyticsSpacesWithAuthCommand } from "./analytics-space-commands.js";
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
export async function handleAnalyticsSpacesCommand(
  parsed: ParsedArgv,
  dependencies: ManagementCommandDependencies
): Promise<CliCommandResult> {
  const operation = requirePositional(parsed, 2, "spaces action");
  let candidate: unknown;
  if (operation === "list") {
    expectNoUnknownOptions(parsed, ["organization", "auth-file", "json"]);
    ensureNoExtraPositionals(parsed, 3);
    candidate = { operation, organizationId: readStringOption(parsed, "organization") };
  } else if (operation === "get") {
    expectNoUnknownOptions(parsed, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsed, 4);
    candidate = { operation, spaceId: requirePositional(parsed, 3, "space id") };
  } else if (operation === "preview" || operation === "apply") {
    expectNoUnknownOptions(parsed, [
      "space",
      "change-json",
      "auth-file",
      "json",
      ...(operation === "apply" ? ["preview-hash"] : [])
    ]);
    ensureNoExtraPositionals(parsed, 3);
    candidate = {
      operation,
      spaceId: readStringOption(parsed, "space") ?? null,
      change: readJsonOption(parsed, "change-json"),
      ...(operation === "apply" ? { previewHash: readStringOption(parsed, "preview-hash") } : {})
    };
  } else throw new CliInputError("Unknown analytics spaces command.");
  const input = AnalyticsSpaceOperationSchema.safeParse(candidate);
  if (!input.success)
    throw new CliInputError(
      "Invalid analytics space request. Apply requires --preview-hash from a matching preview."
    );
  return (dependencies.analyticsSpacesCommand ?? analyticsSpacesWithAuthCommand)(
    appendCommonAuthOptions(parsed, { operation: input.data })
  );
}
