import { z } from "zod";
import {
  AnalyticsSpacePlanApplyInputSchema,
  AnalyticsSpacePlanGetInputSchema,
  AnalyticsSpacePlanPreviewInputSchema,
  AnalyticsSpacePlanValidateInputSchema
} from "../../cli/src/analytics-space-plan-api.js";

const auth = { bearerToken: z.string().min(1).max(4096) };
const getInputSchema: z.ZodTypeAny = AnalyticsSpacePlanGetInputSchema.extend(auth);
const validateInputSchema: z.ZodTypeAny = AnalyticsSpacePlanValidateInputSchema.extend(auth);
const previewInputSchema: z.ZodTypeAny = AnalyticsSpacePlanPreviewInputSchema.extend(auth);
const applyInputSchema: z.ZodTypeAny = AnalyticsSpacePlanApplyInputSchema.extend(auth);
export const ANALYTICS_SPACE_PLAN_MCP_TOOL_CATALOG = [
  {
    name: "analytics_space_plan_get",
    group: "analytics_space_plan",
    description:
      "Read the current all-source space measurement-plan declaration with owner and current source access. No report is activated.",
    inputSchema: getInputSchema
  },
  {
    name: "analytics_space_plan_validate",
    group: "analytics_space_plan",
    description:
      "Validate a proposed space measurement plan's finite shape and references without writing state or proving source coverage.",
    inputSchema: validateInputSchema
  },
  {
    name: "analytics_space_plan_preview",
    group: "analytics_space_plan",
    description:
      "Preview a zero-report space plan against current membership, mode and every source catalog revision without writing state.",
    inputSchema: previewInputSchema
  },
  {
    name: "analytics_space_plan_apply",
    group: "analytics_space_plan",
    description:
      "Apply a reviewed zero-report space plan using its matching preview hash, expected revision and idempotency key. Rechecks all-source authority; does not enable capture or reports.",
    inputSchema: applyInputSchema
  }
] as const;
export const ANALYTICS_SPACE_PLAN_MCP_TOOL_NAMES = ANALYTICS_SPACE_PLAN_MCP_TOOL_CATALOG.map(
  (tool) => tool.name
);
