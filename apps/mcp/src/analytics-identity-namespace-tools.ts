import type { z } from "zod";
import {
  AnalyticsIdentityNamespaceApiError,
  AnalyticsIdentityNamespaceOperationSchema,
  type AnalyticsIdentityNamespaceApi,
  type AnalyticsIdentityNamespaceApiResponse
} from "../../cli/src/analytics-identity-namespace-api.js";
import { ANALYTICS_IDENTITY_NAMESPACE_MCP_TOOL_CATALOG as catalog } from "./analytics-identity-namespace-tool-catalog.js";

export function createAnalyticsIdentityNamespaceMcpTools(
  api: AnalyticsIdentityNamespaceApi
): Record<
  (typeof catalog)[number]["name"],
  (input: Record<string, unknown>) => Promise<AnalyticsIdentityNamespaceApiResponse>
> {
  async function run(
    input: Record<string, unknown>,
    schema: z.ZodType<{ bearerToken: string }>,
    operation: "get" | "preview" | "apply"
  ): Promise<AnalyticsIdentityNamespaceApiResponse> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new Error("mcp_tool_error:invalid_input");
    const { bearerToken, ...arguments_ } = parsed.data;
    try {
      const command = AnalyticsIdentityNamespaceOperationSchema.parse({
        ...arguments_,
        operation
      });
      return await api.execute({ bearerToken, operation: command });
    } catch (error) {
      throw new Error(
        `mcp_tool_error:${error instanceof AnalyticsIdentityNamespaceApiError ? error.message : "analytics_identity_namespace_request_failed"}`
      );
    }
  }
  return {
    analytics_identity_namespace_get: (input: Record<string, unknown>) =>
      run(input, catalog[0].inputSchema, "get"),
    analytics_identity_namespace_preview: (input: Record<string, unknown>) =>
      run(input, catalog[1].inputSchema, "preview"),
    analytics_identity_namespace_apply: (input: Record<string, unknown>) =>
      run(input, catalog[2].inputSchema, "apply")
  };
}
