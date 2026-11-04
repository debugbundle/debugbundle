import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import {
  previewProjectAdoption,
  applyProjectAdoption,
  ProjectAdoptionPlanSchema,
  ProjectAdoptionError,
  type ProjectAdoptionPlan
} from "../../../packages/project-adoption/src/index.js";
import {
  createProjectMergesApi,
  ProjectMergeApiError
} from "../../../packages/project-management-client/src/project-merges.js";
import type { HttpClient } from "../../../packages/project-management-client/src/index.js";
import { createCliHttpClient } from "./auth-context.js";
import { readCliAuthState, type CliAuthState } from "./auth-state.js";
import {
  appendCommonAuthOptions,
  CliInputError,
  expectNoUnknownOptions,
  ensureNoExtraPositionals,
  readStringOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";
import { readProjectMergeJson } from "./project-merge-commands.js";
import type { CliCommandResult } from "./token-commands.js";
export type ProjectAdoptionCommandInput = { authFilePath?: string; json?: boolean } & (
  | { action: "preview"; operation_id: string; workspace_root: string }
  | { action: "apply"; plan: ProjectAdoptionPlan }
);
export async function projectAdoptionWithAuthCommand(
  input: ProjectAdoptionCommandInput,
  dependencies: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => HttpClient;
  } = {}
): Promise<CliCommandResult> {
  try {
    const auth = await (dependencies.readAuthState ?? readCliAuthState)(
      input.authFilePath === undefined ? {} : { authFilePath: input.authFilePath }
    );
    const api = createProjectMergesApi(
      (dependencies.createHttpClient ?? createCliHttpClient)({ baseUrl: auth.base_url })
    );
    const scope = {
      bearerToken: auth.bearer_token,
      operation_id: input.action === "preview" ? input.operation_id : input.plan.operation_id
    };
    const operation = await api.getProjectMerge(scope),
      verification = await api.verifyProjectMerge(scope);
    if (!verification.verified) throw new ProjectAdoptionError("adoption_server_not_verified");
    const result =
      input.action === "preview"
        ? await previewProjectAdoption({ workspace_root: input.workspace_root, operation })
        : await applyProjectAdoption({ plan: input.plan, operation });
    return { exitCode: 0, output: JSON.stringify(result, null, input.json ? undefined : 2) };
  } catch (error) {
    const code =
      error instanceof ProjectAdoptionError || error instanceof ProjectMergeApiError
        ? error.message
        : "adoption_request_failed";
    return {
      exitCode: error instanceof ProjectMergeApiError && error.status === 401 ? 2 : 1,
      output: JSON.stringify({ error: code })
    };
  }
}
export async function handleProjectAdoptionCommand(
  argv: ParsedArgv,
  run = projectAdoptionWithAuthCommand
): Promise<CliCommandResult> {
  const action = requirePositional(argv, 3, "adoption action"),
    common = ["auth-file", "json"];
  const option = (key: string): string => {
    const value = readStringOption(argv, key);
    if (value === undefined) throw new CliInputError(`Missing required option --${key}.`);
    return value;
  };
  ensureNoExtraPositionals(argv, 4);
  let input: ProjectAdoptionCommandInput;
  if (action === "preview") {
    expectNoUnknownOptions(argv, [...common, "operation-id", "workspace-root"]);
    const operation_id = option("operation-id"),
      workspace_root = option("workspace-root");
    if (
      !z.string().guid().safeParse(operation_id).success ||
      !isAbsolute(workspace_root) ||
      resolve(workspace_root) !== workspace_root
    )
      throw new CliInputError(
        "Provide a valid operation ID and one canonical absolute workspace root."
      );
    input = { action, operation_id, workspace_root };
  } else if (action === "apply") {
    expectNoUnknownOptions(argv, [...common, "plan-file"]);
    const parsed = ProjectAdoptionPlanSchema.safeParse(
      await readProjectMergeJson(option("plan-file"), 8 * 1024 * 1024)
    );
    if (!parsed.success) throw new CliInputError("Invalid local adoption plan.");
    input = { action, plan: parsed.data };
  } else throw new CliInputError(`Unknown adoption action: ${action}.`);
  return run(appendCommonAuthOptions(argv, input));
}
