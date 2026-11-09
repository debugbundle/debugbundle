import { z } from "zod";
import {
  createReportApi,
  ReportApiError,
  type ReportHttpClient
} from "../../../packages/report-client/src/index.js";
import {
  CreateReportDefinitionSchema,
  ReplaceReportDefinitionSchema
} from "../../../packages/smart-reports/src/report-definition.js";
import { createCliHttpClient } from "./auth-context.js";
import { readCliAuthState, type CliAuthState } from "./auth-state.js";
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

type Base = { organizationId: string; authFilePath?: string; json?: boolean };
export type ReportCommandInput = Base &
  (
    | { action: "list" }
    | { action: "get" | "allowance"; definitionId: string }
    | {
        action: "create";
        requestId: string;
        definition: z.input<typeof CreateReportDefinitionSchema>;
      }
    | {
        action: "update";
        definitionId: string;
        definition: z.input<typeof ReplaceReportDefinitionSchema>;
      }
    | { action: "delete"; definitionId: string; expectedVersion: number }
  );
export async function reportsWithAuthCommand(
  input: ReportCommandInput,
  dependencies: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => ReportHttpClient;
  } = {}
): Promise<CliCommandResult> {
  try {
    const auth = await (dependencies.readAuthState ?? readCliAuthState)(
      input.authFilePath === undefined ? {} : { authFilePath: input.authFilePath }
    );
    const api = createReportApi(
      (dependencies.createHttpClient ?? createCliHttpClient)({ baseUrl: auth.base_url })
    );
    const scope = { bearerToken: auth.bearer_token, organizationId: input.organizationId };
    let result: unknown;
    switch (input.action) {
      case "list":
        result = { definitions: await api.list(scope) };
        break;
      case "allowance":
        result = { allowance: await api.allowance({ ...scope, definitionId: input.definitionId }) };
        break;
      case "get":
        result = { definition: await api.get({ ...scope, definitionId: input.definitionId }) };
        break;
      case "create":
        result = {
          definition: await api.create({
            ...scope,
            requestId: input.requestId,
            definition: input.definition
          })
        };
        break;
      case "update":
        result = {
          definition: await api.replace({
            ...scope,
            definitionId: input.definitionId,
            definition: input.definition
          })
        };
        break;
      case "delete":
        await api.remove({
          ...scope,
          definitionId: input.definitionId,
          expectedVersion: input.expectedVersion
        });
        result = { deleted: true };
        break;
    }
    return { exitCode: 0, output: JSON.stringify(result, null, input.json ? undefined : 2) };
  } catch (error) {
    return {
      exitCode: error instanceof ReportApiError && error.status === 403 ? 4 : 1,
      output:
        error instanceof ReportApiError
          ? error.code
          : error instanceof CliInputError
            ? error.message
            : "report_command_failed"
    };
  }
}
function definitionJson<S extends z.ZodType>(parsed: ParsedArgv, schema: S): z.output<S> {
  const raw = readStringOption(parsed, "definition-json");
  try {
    if (raw === undefined || raw.length > 32_768) throw new Error("invalid");
    return schema.parse(JSON.parse(raw));
  } catch {
    throw new CliInputError(
      "Provide valid --definition-json with explicit source consent and expected_version when updating."
    );
  }
}
export async function handleReportCommand(
  parsed: ParsedArgv,
  command: typeof reportsWithAuthCommand = reportsWithAuthCommand
): Promise<CliCommandResult> {
  const action = requirePositional(parsed, 1, "action");
  if (!["list", "get", "allowance", "create", "update", "delete"].includes(action))
    throw new CliInputError("Unknown reports action.");
  const resource =
    action === "get" || action === "allowance" || action === "update" || action === "delete";
  expectNoUnknownOptions(parsed, [
    "auth-file",
    "json",
    ...(action === "create"
      ? ["request-id", "definition-json"]
      : action === "update"
        ? ["definition-json"]
        : action === "delete"
          ? ["expected-version"]
          : [])
  ]);
  ensureNoExtraPositionals(parsed, resource ? 4 : 3);
  const base: Base = { organizationId: requirePositional(parsed, 2, "organization-id") };
  const auth = readStringOption(parsed, "auth-file");
  if (auth !== undefined) base.authFilePath = auth;
  const json = readBooleanOption(parsed, "json");
  if (json !== undefined) base.json = json;
  if (action === "list") return command({ ...base, action });
  if (action === "create") {
    const requestId = z.uuid().safeParse(readStringOption(parsed, "request-id"));
    if (!requestId.success)
      throw new CliInputError(
        "Provide a stable UUID with --request-id and reuse it for the same creation retry."
      );
    return command({
      ...base,
      action,
      requestId: requestId.data,
      definition: definitionJson(parsed, CreateReportDefinitionSchema)
    });
  }
  const definitionId = requirePositional(parsed, 3, "definition-id");
  if (action === "get" || action === "allowance") return command({ ...base, action, definitionId });
  if (action === "update")
    return command({
      ...base,
      action,
      definitionId,
      definition: definitionJson(parsed, ReplaceReportDefinitionSchema)
    });
  const version = readIntegerOption(parsed, "expected-version");
  if (version === undefined || version < 1)
    throw new CliInputError("Provide a positive --expected-version from the saved definition.");
  return command({ ...base, action: "delete", definitionId, expectedVersion: version });
}
