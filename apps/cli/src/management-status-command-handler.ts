import { PublicStatusSettingsSchema } from "../../../packages/shared-types/src/public-status.js";
import { publicStatusWithAuthCommand } from "./public-status-commands.js";
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
export async function handleStatusCommand(
  parsed: ParsedArgv,
  dependencies: ManagementCommandDependencies
): Promise<CliCommandResult> {
  const action = requirePositional(parsed, 2, "action");
  if (!["get", "save", "options", "preview"].includes(action))
    throw new CliInputError("Unknown health status command.");
  expectNoUnknownOptions(parsed, [
    "project-id",
    "auth-file",
    "json",
    ...(action === "save"
      ? ["settings-json"]
      : action === "options"
        ? ["cursor", "check-project-id", "check-cursor"]
        : [])
  ]);
  ensureNoExtraPositionals(parsed, 3);
  const projectId = readStringOption(parsed, "project-id");
  if (!projectId) throw new CliInputError("Missing required option --project-id.");
  let settings;
  if (action === "save") {
    try {
      settings = PublicStatusSettingsSchema.parse(
        JSON.parse(readStringOption(parsed, "settings-json") ?? "null")
      );
    } catch {
      throw new CliInputError(
        "--settings-json must contain a title, enabled flag and explicit project/check selections."
      );
    }
  }
  const cursor = readStringOption(parsed, "cursor");
  const checkProjectId = readStringOption(parsed, "check-project-id");
  const checkCursor = readStringOption(parsed, "check-cursor");
  return (dependencies.publicStatusCommand ?? publicStatusWithAuthCommand)(
    appendCommonAuthOptions(parsed, {
      action: action as "get" | "save" | "options" | "preview",
      projectId,
      ...(settings === undefined ? {} : { settings }),
      ...(cursor === undefined ? {} : { cursor }),
      ...(checkProjectId === undefined ? {} : { check_project_id: checkProjectId }),
      ...(checkCursor === undefined ? {} : { check_cursor: checkCursor })
    })
  );
}
