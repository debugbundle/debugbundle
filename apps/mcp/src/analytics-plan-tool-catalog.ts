import { z } from "zod";
import {
  AnalyticsPlanApplyInputSchema,
  AnalyticsPlanGetInputSchema,
  AnalyticsPlanPreviewInputSchema,
  AnalyticsPlanValidateInputSchema
} from "../../cli/src/analytics-plan-api.js";

const auth = { bearerToken: z.string().min(1).max(4096) };
// Keep the finite runtime schemas while bounding catalog-wide TypeScript inference.
const getInputSchema: z.ZodTypeAny = AnalyticsPlanGetInputSchema.extend(auth);
const validateInputSchema: z.ZodTypeAny = AnalyticsPlanValidateInputSchema.extend(auth);
const previewInputSchema: z.ZodTypeAny = AnalyticsPlanPreviewInputSchema.extend(auth);
const applyInputSchema: z.ZodTypeAny = AnalyticsPlanApplyInputSchema.extend(auth);
export const ANALYTICS_PLAN_MCP_TOOL_CATALOG = [
  {
    name: "analytics_plan_get",
    group: "analytics_plan",
    description:
      "Read the current project semantic measurement plan, catalog, prospective reports and retained current-entry observed producer counts with owner/admin access. Observations do not verify a business success boundary.",
    inputSchema: getInputSchema
  },
  {
    name: "analytics_plan_validate",
    group: "analytics_plan",
    description:
      "Validate a proposed project measurement plan against finite schema, catalog references and privacy rules without writing state. Validation does not grant capture or prove instrumentation.",
    inputSchema: validateInputSchema
  },
  {
    name: "analytics_plan_preview",
    group: "analytics_plan",
    description:
      "Preview a project plan change without writing state. Returns a hash bound to the proposal, current catalog revision and effective saved-report capacity, plus additions, changes and removals.",
    inputSchema: previewInputSchema
  },
  {
    name: "analytics_plan_apply",
    group: "analytics_plan",
    description:
      "Apply a reviewed project measurement plan using the matching preview hash, expected revision and idempotency key. Rechecks owner/admin access and capacity; report revisions begin prospectively. This does not enable V2 SDK capture or execute reports.",
    inputSchema: applyInputSchema
  }
] as const;
export const ANALYTICS_PLAN_MCP_TOOL_NAMES = ANALYTICS_PLAN_MCP_TOOL_CATALOG.map(
  (tool) => tool.name
);
