import { z } from "zod";
import type { ImprovementReviewApi } from "../../../packages/improvement-review-client/src/index.js";
import { ImprovementReviewApiError } from "../../../packages/improvement-review-client/src/index.js";
import {
  ReviewListQuerySchema,
  ReviewSettingsCommandSchema
} from "../../../packages/smart-improvements/src/review-contract.js";
const scope = z.object({ bearerToken: z.string().min(1), organizationId: z.uuid() }).strict();
const identity = scope.extend({ reviewId: z.uuid() });
const list = scope.extend({ query: ReviewListQuerySchema.optional() });
const configure = scope.extend({ command: ReviewSettingsCommandSchema });
export const IMPROVEMENT_REVIEW_MCP_TOOL_NAMES = [
  "list_improvement_reviews",
  "get_improvement_review",
  "get_improvement_review_bundle",
  "get_improvement_review_settings",
  "update_improvement_review_settings",
  "get_improvement_review_allowance",
  "get_improvement_review_plan"
] as const;
export const IMPROVEMENT_REVIEW_MCP_TOOL_CATALOG = [
  {
    name: IMPROVEMENT_REVIEW_MCP_TOOL_NAMES[6],
    inputSchema: identity,
    description:
      "Read the saved weekly review plan with evidence-linked failure, noise, flow or evidence checks and verification. Inspect current settings and linked bundles before an authorised change. Capture policy/rules, alert delivery, sensitivity and diagnostics have different effects. SDK-local settings are unobserved. Never suppress genuine failures or treat a quiet period as a verified fix. Reading never generates or changes anything."
  },
  {
    name: IMPROVEMENT_REVIEW_MCP_TOOL_NAMES[0],
    inputSchema: list,
    description:
      "List existing weekly project improvement reviews in an explicit workspace. Requires current access to each complete saved origin scope. Reads never generate, enqueue or call AI."
  },
  {
    name: IMPROVEMENT_REVIEW_MCP_TOOL_NAMES[1],
    inputSchema: identity,
    description:
      "Read existing weekly review metadata, period and safe generation state. Missing evidence and correlations are not proven causes."
  },
  {
    name: IMPROVEMENT_REVIEW_MCP_TOOL_NAMES[2],
    inputSchema: identity,
    description:
      "Read a saved versioned improvement review artifact containing bounded server facts, linked sources and optional validated investigation guidance. Pending work returns status without generating. Does not inspect a repository/UI or perform actions."
  },
  {
    name: IMPROVEMENT_REVIEW_MCP_TOOL_NAMES[3],
    inputSchema: scope,
    description:
      "Read the explicitly selected weekly review scope, evidence consent and schedule. No future projects are silently added."
  },
  {
    name: IMPROVEMENT_REVIEW_MCP_TOOL_NAMES[4],
    inputSchema: configure,
    description:
      "Replace weekly improvement review settings as current workspace Owner with expected_version, explicit project selection and source consent. Before enabling, obtain explicit chat confirmation of workspace, selected projects, evidence mode and recurring weekly provider use under the separate Team/Business allowance. Enabling schedules provider work only when qualified AI is enabled. Explain that consent/privacy narrowing or removing projects deletes affected derived content; paid/uncertain holds remain. Read settings back after saving. Existing customers default off. This does not send email or change ordinary opportunities."
  },
  {
    name: IMPROVEMENT_REVIEW_MCP_TOOL_NAMES[5],
    inputSchema: scope,
    description:
      "Read the separate monthly improvement review allowance. Capacity and report generations do not multiply or share this pool. Does not reserve quota."
  }
].map((entry) => ({
  ...entry,
  group: "improvements" as const,
  annotations: {
    readOnlyHint: entry.name !== "update_improvement_review_settings",
    destructiveHint: entry.name === "update_improvement_review_settings",
    idempotentHint: entry.name !== "update_improvement_review_settings",
    openWorldHint: entry.name === "update_improvement_review_settings"
  }
}));
export function createImprovementReviewMcpTools(
  api: ImprovementReviewApi
): Record<
  (typeof IMPROVEMENT_REVIEW_MCP_TOOL_NAMES)[number],
  (raw: Record<string, unknown>) => Promise<unknown>
> {
  const run =
    <T>(schema: z.ZodType<T>, fn: (input: T) => Promise<unknown>) =>
    async (raw: Record<string, unknown>) => {
      try {
        return await fn(schema.parse(raw));
      } catch (error) {
        throw new Error(
          `mcp_tool_error:${error instanceof ImprovementReviewApiError ? error.code : error instanceof z.ZodError ? "invalid_payload" : "improvement_review_failed"}`
        );
      }
    };
  return {
    list_improvement_reviews: run(list, (input) => api.list(input)),
    get_improvement_review: run(identity, async (input) => ({ review: await api.get(input) })),
    get_improvement_review_bundle: run(identity, (input) => api.bundle(input)),
    get_improvement_review_plan: run(identity, (input) => api.plan(input)),
    get_improvement_review_settings: run(scope, async (input) => ({
      settings: await api.settings(input)
    })),
    update_improvement_review_settings: run(configure, async (input) => ({
      settings: await api.update(input)
    })),
    get_improvement_review_allowance: run(scope, async (input) => ({
      allowance: await api.allowance(input)
    }))
  };
}
