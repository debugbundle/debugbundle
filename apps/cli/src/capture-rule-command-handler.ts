import {
  createCaptureRuleFromIncidentSuggestionWithAuthCommand as defaultCreateCaptureRuleFromIncidentSuggestionCommand,
  suggestCaptureRulesFromIncidentWithAuthCommand as defaultSuggestCaptureRulesFromIncidentCommand
} from "./capture-rule-commands.js";
import {
  appendCommonAuthOptions,
  CliInputError,
  ensureNoExtraPositionals,
  expectNoUnknownOptions,
  readBooleanStringOption,
  readStringOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";
import {
  handleCaptureRuleCommand as handleLegacyCaptureRuleCommand,
  type ManagementCommandDependencies
} from "./management-command-handlers.js";
import type { CliCommandResult } from "./token-commands.js";

export type CaptureRuleCommandDependencies = ManagementCommandDependencies & {
  suggestCaptureRulesFromIncidentCommand?: typeof defaultSuggestCaptureRulesFromIncidentCommand;
  createCaptureRuleFromIncidentSuggestionCommand?: typeof defaultCreateCaptureRuleFromIncidentSuggestionCommand;
};

export async function handleCaptureRuleCommand(
  parsedArgv: ParsedArgv,
  dependencies: CaptureRuleCommandDependencies
): Promise<CliCommandResult> {
  const action = requirePositional(parsedArgv, 1, "action");

  if (action === "suggest") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const incidentId = requirePositional(parsedArgv, 2, "incident-id");
    return await (dependencies.suggestCaptureRulesFromIncidentCommand ?? defaultSuggestCaptureRulesFromIncidentCommand)(
      appendCommonAuthOptions(parsedArgv, {
        incidentId
      })
    );
  }

  if (action === "create-from-suggestion") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "suggestion-id", "name", "description", "enabled", "expires-at"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const incidentId = requirePositional(parsedArgv, 2, "incident-id");
    const suggestionId = readStringOption(parsedArgv, "suggestion-id");
    if (suggestionId === undefined) {
      throw new CliInputError("Missing required option --suggestion-id.");
    }
    const name = readStringOption(parsedArgv, "name");
    const description = readStringOption(parsedArgv, "description");
    const enabled = readBooleanStringOption(parsedArgv, "enabled");
    const expiresAt = readStringOption(parsedArgv, "expires-at");

    return await (dependencies.createCaptureRuleFromIncidentSuggestionCommand ??
      defaultCreateCaptureRuleFromIncidentSuggestionCommand)(
      appendCommonAuthOptions(parsedArgv, {
        incidentId,
        create: {
          suggestion_id: suggestionId,
          ...(name === undefined ? {} : { name }),
          ...(description === undefined ? {} : { description }),
          ...(enabled === undefined ? {} : { enabled }),
          ...(expiresAt === undefined ? {} : { expires_at: expiresAt })
        }
      })
    );
  }

  return await handleLegacyCaptureRuleCommand(parsedArgv, dependencies);
}
