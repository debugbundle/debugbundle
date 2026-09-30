import type { z } from "zod";
import {
  AnalyticsSpacePlanApiError,
  AnalyticsSpacePlanOperationSchema,
  type AnalyticsSpacePlanApi,
  type AnalyticsSpacePlanApiResponse
} from "../../cli/src/analytics-space-plan-api.js";
import { ANALYTICS_SPACE_PLAN_MCP_TOOL_CATALOG as catalog } from "./analytics-space-plan-tool-catalog.js";

export function createAnalyticsSpacePlanMcpTools(
  api: AnalyticsSpacePlanApi
): Record<
  (typeof catalog)[number]["name"],
  (input: Record<string, unknown>) => Promise<AnalyticsSpacePlanApiResponse>
> {
  async function run(
    input: Record<string, unknown>,
    schema: z.ZodTypeAny,
    operation: "get" | "validate" | "preview" | "apply"
  ): Promise<AnalyticsSpacePlanApiResponse> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new Error("mcp_tool_error:invalid_input");
    const { bearerToken, ...arguments_ } = input;
    if (typeof bearerToken !== "string") throw new Error("mcp_tool_error:invalid_input");
    try {
      const command = AnalyticsSpacePlanOperationSchema.parse({ ...arguments_, operation });
      return await api.execute({ bearerToken, operation: command });
    } catch (error) {
      throw new Error(
        `mcp_tool_error:${error instanceof AnalyticsSpacePlanApiError ? error.message : "analytics_space_plan_request_failed"}`
      );
    }
  }
  return {
    analytics_space_plan_get: (input) => run(input, catalog[0].inputSchema, "get"),
    analytics_space_plan_validate: (input) => run(input, catalog[1].inputSchema, "validate"),
    analytics_space_plan_preview: (input) => run(input, catalog[2].inputSchema, "preview"),
    analytics_space_plan_apply: (input) => run(input, catalog[3].inputSchema, "apply")
  };
}
