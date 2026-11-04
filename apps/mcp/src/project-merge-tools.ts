import { z } from "zod";
import {
  ProjectMergeRequestSchema,
  ProjectMergeApplySchema,
  ProjectMergeSelectorSchema
} from "../../../packages/shared-types/src/project-consolidation.js";
import {
  ProjectMergeApiError,
  type ProjectMergesApi
} from "../../../packages/project-management-client/src/project-merges.js";
const auth = z.object({ bearerToken: z.string().min(1) }).strict();
const identity = auth.extend({ operation_id: z.string().guid() });
const read = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};
const write = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false
};
export const PROJECT_MERGE_MCP_TOOL_CATALOG = [
  {
    name: "preview_project_merge",
    group: "projects",
    description:
      "Preview consolidation into one project with logical services. Read-only; inspect blockers, resource bounds and suggested_service_mappings, then preview explicit mappings again. Same owner/account and compatible access/settings required. Does not edit repositories or deploy.",
    inputSchema: auth.extend({ request: ProjectMergeRequestSchema }),
    annotations: read
  },
  {
    name: "apply_project_merge",
    group: "projects",
    description:
      "Apply the exact checked request and plan_digest using a stable idempotency_key. Preserve IDs, old credentials, evidence and original scopes. After a timeout look up that key; local adoption and deployed-runtime verification are separate pending gates.",
    inputSchema: auth.extend(ProjectMergeApplySchema.shape),
    annotations: write
  },
  {
    name: "get_project_merge",
    group: "projects",
    description:
      "Read a durable merge operation by operation_id OR its original idempotency_key, including uncertain apply outcomes.",
    inputSchema: auth
      .extend({
        operation_id: ProjectMergeSelectorSchema.options[0].shape.operation_id.optional(),
        idempotency_key: ProjectMergeApplySchema.shape.idempotency_key.optional()
      })
      .refine(
        (input) => (input.operation_id !== undefined) !== (input.idempotency_key !== undefined),
        "Provide exactly one operation_id or idempotency_key."
      ),
    annotations: read
  },
  {
    name: "verify_project_merge",
    group: "projects",
    description:
      "Read-only verification of the committed server namespace and service mappings. A failed post-commit check does not imply rollback. Use resume for eligible repair.",
    inputSchema: identity,
    annotations: read
  },
  {
    name: "resume_project_merge",
    group: "projects",
    description:
      "Resume eligible pre-commit work or retry verification after commit without repeating the relational cutover.",
    inputSchema: identity,
    annotations: write
  },
  {
    name: "cancel_project_merge",
    group: "projects",
    description:
      "Cancel an operation only before its atomic cutover starts. Cannot undo a committed merge.",
    inputSchema: identity,
    annotations: write
  }
] as const;
export const PROJECT_MERGE_MCP_TOOL_NAMES = PROJECT_MERGE_MCP_TOOL_CATALOG.map((tool) => tool.name);
export function createProjectMergeMcpTools(
  api: ProjectMergesApi
): Record<string, (input: Record<string, unknown>) => Promise<unknown>> {
  const methods = {
    preview_project_merge: "previewProjectMerge",
    apply_project_merge: "applyProjectMerge",
    get_project_merge: "getProjectMerge",
    verify_project_merge: "verifyProjectMerge",
    resume_project_merge: "resumeProjectMerge",
    cancel_project_merge: "cancelProjectMerge"
  } as const;
  return Object.fromEntries(
    PROJECT_MERGE_MCP_TOOL_CATALOG.map((tool) => [
      tool.name,
      async (input: Record<string, unknown>) => {
        try {
          const parsed = tool.inputSchema.parse(input);
          // Each catalogue entry and method share their validated schema above.
          const method = api[methods[tool.name]] as (data: typeof parsed) => Promise<unknown>;
          return await method(parsed);
        } catch (error) {
          if (error instanceof ProjectMergeApiError)
            throw new Error(
              `mcp_tool_error:${error.code}${error.operation_id === null ? "" : `:operation_id=${error.operation_id}`}`
            );
          throw new Error(
            `mcp_tool_error:${error instanceof z.ZodError ? "invalid_merge_request" : "project_merge_request_failed"}`
          );
        }
      }
    ])
  );
}
