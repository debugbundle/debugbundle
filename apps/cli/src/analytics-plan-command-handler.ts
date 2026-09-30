import { AnalyticsPlanOperationSchema } from "./analytics-plan-api.js";
import { analyticsPlanWithAuthCommand } from "./analytics-plan-commands.js";
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

export async function handleAnalyticsPlanCommand(
  parsed: ParsedArgv,
  dependencies: ManagementCommandDependencies
): Promise<CliCommandResult> {
  const operation = requirePositional(parsed, 2, "plan action");
  let candidate: unknown;
  if (operation === "get") {
    expectNoUnknownOptions(parsed, ["project", "auth-file", "json"]);
    ensureNoExtraPositionals(parsed, 3);
    candidate = { operation, projectId: readStringOption(parsed, "project") };
  } else if (["validate", "preview", "apply"].includes(operation)) {
    expectNoUnknownOptions(parsed, [
      "project",
      "plan-json",
      "auth-file",
      "json",
      ...(operation === "apply" ? ["preview-hash"] : [])
    ]);
    ensureNoExtraPositionals(parsed, 3);
    candidate = {
      operation,
      projectId: readStringOption(parsed, "project"),
      plan: readJsonOption(parsed, "plan-json"),
      ...(operation === "apply" ? { previewHash: readStringOption(parsed, "preview-hash") } : {})
    };
  } else throw new CliInputError("Unknown analytics plan command.");
  const input = AnalyticsPlanOperationSchema.safeParse(candidate);
  if (!input.success)
    throw new CliInputError(
      "Invalid analytics plan request. Apply requires --preview-hash from a matching preview."
    );
  return (dependencies.analyticsPlanCommand ?? analyticsPlanWithAuthCommand)(
    appendCommonAuthOptions(parsed, { operation: input.data })
  );
}
