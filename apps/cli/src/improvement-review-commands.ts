import { z } from "zod";
import {
  createImprovementReviewApi,
  ImprovementReviewApiError
} from "../../../packages/improvement-review-client/src/index.js";
import { ReviewSettingsCommandSchema } from "../../../packages/smart-improvements/src/review-contract.js";
import { createCliHttpClient } from "./auth-context.js";
import { readCliAuthState, type CliAuthState } from "./auth-state.js";
import type { ReportHttpClient } from "../../../packages/report-client/src/http.js";
import {
  CliInputError,
  ensureNoExtraPositionals,
  expectNoUnknownOptions,
  readBooleanOption,
  readIntegerOption,
  readStringOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";
import type { CliCommandResult } from "./token-commands.js";
type Input = { organizationId: string; authFilePath?: string; json?: boolean } & (
  | { action: "list"; projectId?: string; limit?: number; cursor?: string }
  | { action: "get" | "bundle"; reviewId: string }
  | { action: "settings" | "allowance" }
  | { action: "configure"; command: z.input<typeof ReviewSettingsCommandSchema> }
);
export async function improvementReviewsWithAuthCommand(
  input: Input,
  deps: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => ReportHttpClient;
  } = {}
): Promise<CliCommandResult> {
  try {
    const auth = await (deps.readAuthState ?? readCliAuthState)(
      input.authFilePath === undefined ? {} : { authFilePath: input.authFilePath }
    );
    const api = createImprovementReviewApi(
      (deps.createHttpClient ?? createCliHttpClient)({ baseUrl: auth.base_url })
    );
    const scope = { bearerToken: auth.bearer_token, organizationId: input.organizationId };
    const result =
      input.action === "list"
        ? await api.list({
            ...scope,
            query: {
              ...(input.projectId ? { project_id: input.projectId } : {}),
              ...(input.limit === undefined ? {} : { limit: input.limit }),
              ...(input.cursor ? { cursor: input.cursor } : {})
            }
          })
        : input.action === "get"
          ? { review: await api.get({ ...scope, reviewId: input.reviewId }) }
          : input.action === "bundle"
            ? await api.bundle({ ...scope, reviewId: input.reviewId })
            : input.action === "settings"
              ? { settings: await api.settings(scope) }
              : input.action === "allowance"
                ? { allowance: await api.allowance(scope) }
                : input.action === "configure"
                  ? { settings: await api.update({ ...scope, command: input.command }) }
                  : null;
    return { exitCode: 0, output: JSON.stringify(result, null, input.json ? undefined : 2) };
  } catch (error) {
    return {
      exitCode:
        error instanceof ImprovementReviewApiError && [400, 403, 409].includes(error.status)
          ? 4
          : 1,
      output:
        error instanceof ImprovementReviewApiError
          ? error.code
          : "improvement_review_command_failed"
    };
  }
}
export async function handleImprovementReviewCommand(
  parsed: ParsedArgv,
  command = improvementReviewsWithAuthCommand
): Promise<CliCommandResult> {
  const action = requirePositional(parsed, 2, "action"),
    organizationId = requirePositional(parsed, 3, "organization-id");
  if (!["list", "get", "bundle", "settings", "configure", "allowance"].includes(action))
    throw new CliInputError("Unknown improvements reviews action.");
  expectNoUnknownOptions(parsed, [
    "auth-file",
    "json",
    ...(action === "list"
      ? ["project-id", "limit", "cursor"]
      : action === "configure"
        ? ["settings-json"]
        : [])
  ]);
  ensureNoExtraPositionals(parsed, action === "get" || action === "bundle" ? 5 : 4);
  if (!z.uuid().safeParse(organizationId).success)
    throw new CliInputError("Invalid organization-id.");
  const auth = readStringOption(parsed, "auth-file"),
    json = readBooleanOption(parsed, "json");
  const base = {
    organizationId,
    ...(auth === undefined ? {} : { authFilePath: auth }),
    ...(json === undefined ? {} : { json })
  };
  if (action === "list") {
    const projectId = readStringOption(parsed, "project-id"),
      limit = readIntegerOption(parsed, "limit"),
      cursor = readStringOption(parsed, "cursor");
    return command({
      ...base,
      action,
      ...(projectId === undefined ? {} : { projectId }),
      ...(limit === undefined ? {} : { limit }),
      ...(cursor === undefined ? {} : { cursor })
    });
  }
  if (action === "get" || action === "bundle")
    return command({ ...base, action, reviewId: requirePositional(parsed, 4, "review-id") });
  if (action === "settings" || action === "allowance") return command({ ...base, action });
  const raw = readStringOption(parsed, "settings-json");
  try {
    if (!raw || raw.length > 32768) throw new Error("invalid");
    return command({
      ...base,
      action: "configure",
      command: ReviewSettingsCommandSchema.parse(JSON.parse(raw))
    });
  } catch {
    throw new CliInputError(
      "Provide valid --settings-json with expected_version, explicit projects and source consent."
    );
  }
}
