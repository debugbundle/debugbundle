import type { z } from "zod";
import {
  AnalyticsWriterApiError,
  AnalyticsWriterOperationSchema,
  type AnalyticsWriterApi,
  type AnalyticsWriterApiResponse
} from "../../cli/src/analytics-writer-api.js";
import { ANALYTICS_WRITER_MCP_TOOL_CATALOG as catalog } from "./analytics-writer-tool-catalog.js";

export function createAnalyticsWriterMcpTools(
  api: AnalyticsWriterApi
): Record<
  (typeof catalog)[number]["name"],
  (input: Record<string, unknown>) => Promise<AnalyticsWriterApiResponse>
> {
  async function run(
    input: Record<string, unknown>,
    schema: z.ZodType<{ bearerToken: string }>,
    operation: "list" | "preview" | "apply"
  ): Promise<AnalyticsWriterApiResponse> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new Error("mcp_tool_error:invalid_input");
    const { bearerToken, ...arguments_ } = parsed.data;
    try {
      const command = AnalyticsWriterOperationSchema.parse({ ...arguments_, operation });
      return await api.execute({ bearerToken, operation: command });
    } catch (error) {
      throw new Error(
        `mcp_tool_error:${error instanceof AnalyticsWriterApiError ? error.message : "analytics_writer_request_failed"}`
      );
    }
  }
  return {
    analytics_writers_list: (input: Record<string, unknown>) =>
      run(input, catalog[0].inputSchema, "list"),
    analytics_writer_preview: (input: Record<string, unknown>) =>
      run(input, catalog[1].inputSchema, "preview"),
    analytics_writer_apply: (input: Record<string, unknown>) =>
      run(input, catalog[2].inputSchema, "apply")
  };
}
