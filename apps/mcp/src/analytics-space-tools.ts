import type { z } from "zod";
import {
  AnalyticsSpaceApiError,
  AnalyticsSpaceOperationSchema,
  type AnalyticsSpaceApi,
  type AnalyticsSpaceApiResponse
} from "../../cli/src/analytics-space-api.js";
import { ANALYTICS_SPACE_MCP_TOOL_CATALOG as catalog } from "./analytics-space-tool-catalog.js";

export function createAnalyticsSpaceMcpTools(
  api: AnalyticsSpaceApi
): Record<
  (typeof catalog)[number]["name"],
  (input: Record<string, unknown>) => Promise<AnalyticsSpaceApiResponse>
> {
  async function run(
    input: Record<string, unknown>,
    schema: z.ZodType<{ bearerToken: string }>,
    operation: "list" | "get" | "preview" | "apply"
  ): Promise<AnalyticsSpaceApiResponse> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new Error("mcp_tool_error:invalid_input");
    const { bearerToken, ...arguments_ } = parsed.data;
    try {
      const command = AnalyticsSpaceOperationSchema.parse({ ...arguments_, operation });
      return await api.execute({ bearerToken, operation: command });
    } catch (error) {
      throw new Error(
        `mcp_tool_error:${error instanceof AnalyticsSpaceApiError ? error.message : "analytics_space_request_failed"}`
      );
    }
  }
  return {
    analytics_spaces_list: (input: Record<string, unknown>) =>
      run(input, catalog[0].inputSchema, "list"),
    analytics_space_get: (input: Record<string, unknown>) =>
      run(input, catalog[1].inputSchema, "get"),
    analytics_space_preview: (input: Record<string, unknown>) =>
      run(input, catalog[2].inputSchema, "preview"),
    analytics_space_apply: (input: Record<string, unknown>) =>
      run(input, catalog[3].inputSchema, "apply")
  };
}
