import type { z } from "zod";
import {
  AnalyticsPlanApiError,
  AnalyticsPlanOperationSchema,
  type AnalyticsPlanApi,
  type AnalyticsPlanApiResponse
} from "../../cli/src/analytics-plan-api.js";
import { ANALYTICS_PLAN_MCP_TOOL_CATALOG as catalog } from "./analytics-plan-tool-catalog.js";

export function createAnalyticsPlanMcpTools(
  api: AnalyticsPlanApi
): Record<
  (typeof catalog)[number]["name"],
  (input: Record<string, unknown>) => Promise<AnalyticsPlanApiResponse>
> {
  async function run(
    input: Record<string, unknown>,
    schema: z.ZodTypeAny,
    operation: "get" | "validate" | "preview" | "apply"
  ): Promise<AnalyticsPlanApiResponse> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new Error("mcp_tool_error:invalid_input");
    // The strict runtime tool schema has already checked the full input. Keep
    // the credential typed separately without expanding the plan schema in TS.
    const { bearerToken, ...arguments_ } = input;
    if (typeof bearerToken !== "string") throw new Error("mcp_tool_error:invalid_input");
    try {
      const command = AnalyticsPlanOperationSchema.parse({ ...arguments_, operation });
      return await api.execute({ bearerToken, operation: command });
    } catch (error) {
      throw new Error(
        `mcp_tool_error:${error instanceof AnalyticsPlanApiError ? error.message : "analytics_plan_request_failed"}`
      );
    }
  }
  return {
    analytics_plan_get: (input) => run(input, catalog[0].inputSchema, "get"),
    analytics_plan_validate: (input) => run(input, catalog[1].inputSchema, "validate"),
    analytics_plan_preview: (input) => run(input, catalog[2].inputSchema, "preview"),
    analytics_plan_apply: (input) => run(input, catalog[3].inputSchema, "apply")
  };
}
