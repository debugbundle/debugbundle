import { open } from "node:fs/promises";
import { z } from "zod";
import {
  ProjectMergeRequestSchema,
  ProjectMergeApplySchema,
  ProjectMergePlanSchema,
  ProjectMergeSelectorSchema,
  type ProjectMergeRequest,
  type ProjectMergeApply
} from "../../../packages/shared-types/src/project-consolidation.js";
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
  ensureNoExtraPositionals,
  expectNoUnknownOptions,
  readStringOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";
import type { CliCommandResult } from "./token-commands.js";

export type ProjectMergeCommandInput = { authFilePath?: string; json?: boolean } & (
  | { action: "preview"; request: ProjectMergeRequest }
  | { action: "apply"; apply: ProjectMergeApply }
  | { action: "status"; selector: z.infer<typeof ProjectMergeSelectorSchema> }
  | { action: "verify" | "resume" | "cancel"; selector: { operation_id: string } }
);
export async function projectMergeWithAuthCommand(
  input: ProjectMergeCommandInput,
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
    const scope = { bearerToken: auth.bearer_token };
    const result =
      input.action === "preview"
        ? await api.previewProjectMerge({ ...scope, request: input.request })
        : input.action === "apply"
          ? await api.applyProjectMerge({ ...scope, ...input.apply })
          : input.action === "status"
            ? await api.getProjectMerge({ ...scope, ...input.selector })
            : input.action === "verify"
              ? await api.verifyProjectMerge({ ...scope, ...input.selector })
              : input.action === "resume"
                ? await api.resumeProjectMerge({ ...scope, ...input.selector })
                : await api.cancelProjectMerge({ ...scope, ...input.selector });
    return { exitCode: 0, output: JSON.stringify(result, null, input.json ? undefined : 2) };
  } catch (error) {
    const known = error instanceof ProjectMergeApiError;
    return {
      exitCode: known
        ? error.status === 401
          ? 2
          : error.status === 404
            ? 3
            : error.status === 400
              ? 4
              : 1
        : 1,
      output: known
        ? JSON.stringify({
            error: error.code,
            ...(error.operation_id === null ? {} : { operation_id: error.operation_id })
          })
        : "Could not authenticate or complete the project merge request. If apply timed out, inspect status using its original idempotency key."
    };
  }
}
export async function readProjectMergeJson(
  path: string,
  maximumBytes = 4 * 1024 * 1024
): Promise<unknown> {
  let file;
  try {
    file = await open(path, "r");
    const info = await file.stat();
    if (!info.isFile() || info.size > maximumBytes) throw new Error("invalid");
    // Limit the actual read as well as stat, including a concurrently growing file.
    const buffer = Buffer.alloc(maximumBytes + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > maximumBytes) throw new Error("invalid");
    return JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")) as unknown;
  } catch {
    throw new CliInputError(
      "Could not read a valid JSON plan or mapping file within its size limit."
    );
  } finally {
    await file?.close();
  }
}
function checked<Schema extends z.ZodType>(schema: Schema, value: unknown): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new CliInputError(
      "Invalid project merge request. Check project IDs, mappings and the saved preview."
    );
  return result.data;
}
export async function handleProjectMergeCommand(
  argv: ParsedArgv,
  run = projectMergeWithAuthCommand
): Promise<CliCommandResult> {
  const action = requirePositional(argv, 2, "merge action");
  const common = ["auth-file", "json"];
  const option = (name: string): string => {
    const value = readStringOption(argv, name);
    if (value === undefined) throw new CliInputError(`Missing required option --${name}.`);
    return value;
  };
  let input: ProjectMergeCommandInput;
  if (action === "preview") {
    expectNoUnknownOptions(argv, [...common, "target", "sources", "mapping-file"]);
    ensureNoExtraPositionals(argv, 3);
    const file = readStringOption(argv, "mapping-file");
    input = {
      action,
      request: checked(ProjectMergeRequestSchema, {
        target_project_id: option("target"),
        source_project_ids: option("sources")
          .split(",")
          .map((id) => id.trim()),
        service_mappings: file === undefined ? [] : await readProjectMergeJson(file)
      })
    };
  } else if (action === "apply") {
    expectNoUnknownOptions(argv, [...common, "plan-file", "idempotency-key"]);
    ensureNoExtraPositionals(argv, 3);
    const plan = checked(ProjectMergePlanSchema, await readProjectMergeJson(option("plan-file")));
    if (!plan.ready)
      throw new CliInputError(
        "The saved preview contains blockers. Resolve them and preview again."
      );
    input = {
      action,
      apply: checked(ProjectMergeApplySchema, {
        request: {
          target_project_id: plan.target_project_id,
          source_project_ids: plan.source_project_ids,
          service_mappings: plan.service_mappings
        },
        plan_digest: plan.plan_digest,
        idempotency_key: option("idempotency-key")
      })
    };
  } else if (
    action === "status" ||
    action === "verify" ||
    action === "resume" ||
    action === "cancel"
  ) {
    expectNoUnknownOptions(argv, action === "status" ? [...common, "idempotency-key"] : common);
    ensureNoExtraPositionals(argv, 4);
    const key = readStringOption(argv, "idempotency-key"),
      id = argv.positionals[3];
    const selector = checked(ProjectMergeSelectorSchema, {
      ...(id === undefined ? {} : { operation_id: id }),
      ...(key === undefined ? {} : { idempotency_key: key })
    });
    if (action === "status") input = { action, selector };
    else {
      if (!("operation_id" in selector)) throw new CliInputError("An operation ID is required.");
      input = { action, selector };
    }
  } else throw new CliInputError(`Unknown merge action: ${action}.`);
  return run(appendCommonAuthOptions(argv, input));
}
