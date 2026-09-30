import { AnalyticsSpacePlanOperationSchema } from "./analytics-space-plan-api.js";
import { analyticsSpacePlanWithAuthCommand } from "./analytics-space-plan-commands.js";
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

export async function handleAnalyticsSpacePlanCommand(
  parsed: ParsedArgv,
  dependencies: ManagementCommandDependencies
): Promise<CliCommandResult> {
  const operation = requirePositional(parsed, 2, "space-plan action");
  let candidate: unknown;
  if (operation === "get") {
    expectNoUnknownOptions(parsed, ["space", "auth-file", "json"]);
    ensureNoExtraPositionals(parsed, 3);
    candidate = { operation, spaceId: readStringOption(parsed, "space") };
  } else if (["validate", "preview", "apply"].includes(operation)) {
    expectNoUnknownOptions(parsed, [
      "space",
      "plan-json",
      "auth-file",
      "json",
      ...(operation === "apply" ? ["preview-hash"] : [])
    ]);
    ensureNoExtraPositionals(parsed, 3);
    candidate = {
      operation,
      spaceId: readStringOption(parsed, "space"),
      plan: readJsonOption(parsed, "plan-json"),
      ...(operation === "apply" ? { previewHash: readStringOption(parsed, "preview-hash") } : {})
    };
  } else throw new CliInputError("Unknown analytics space-plan command.");
  const input = AnalyticsSpacePlanOperationSchema.safeParse(candidate);
  if (!input.success)
    throw new CliInputError(
      "Invalid analytics space-plan request. Apply requires --preview-hash from a matching preview."
    );
  return (dependencies.analyticsSpacePlanCommand ?? analyticsSpacePlanWithAuthCommand)(
    appendCommonAuthOptions(parsed, { operation: input.data })
  );
}
