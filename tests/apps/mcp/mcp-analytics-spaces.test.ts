import { expect, it, vi } from "vitest";
import {
  AnalyticsSpaceApiError,
  type AnalyticsSpaceApi
} from "../../../apps/cli/src/analytics-space-api.js";
import { createAnalyticsSpaceMcpTools } from "../../../apps/mcp/src/analytics-space-tools.js";
import { ANALYTICS_SPACE_MCP_TOOL_CATALOG } from "../../../apps/mcp/src/analytics-space-tool-catalog.js";
import { MCP_TOOL_CATALOG } from "../../../apps/mcp/src/tool-catalog.js";
import { createDefaultMcpTools } from "../../../apps/mcp/src/default-tools.js";
import { createMcpServer } from "../../../apps/mcp/src/server.js";
import * as authState from "../../../apps/cli/src/auth-state.js";
import * as nodeHttp from "../../../packages/node-http/src/index.js";
import {
  SPACE_ID as id,
  SPACE_ORGANIZATION as organizationId,
  SPACE_CHANGE as change,
  SPACE_PREVIEW as preview
} from "../../helpers/analytics-space-fixtures.js";
it("registers strict aggregate metadata and revision-aware mutation tools", () => {
  expect(ANALYTICS_SPACE_MCP_TOOL_CATALOG.map((tool) => tool.name)).toEqual([
    "analytics_spaces_list",
    "analytics_space_get",
    "analytics_space_preview",
    "analytics_space_apply"
  ]);
  for (const tool of ANALYTICS_SPACE_MCP_TOOL_CATALOG)
    expect(MCP_TOOL_CATALOG.some((entry) => entry.name === tool.name)).toBe(true);
  const apply = ANALYTICS_SPACE_MCP_TOOL_CATALOG[3].inputSchema;
  expect(apply.safeParse({ bearerToken: "member", spaceId: null, change }).success).toBe(false);
  expect(
    apply.safeParse({
      bearerToken: "member",
      spaceId: null,
      change,
      previewHash: preview.preview_hash
    }).success
  ).toBe(true);
  expect(
    apply.safeParse({
      bearerToken: "member",
      spaceId: null,
      change,
      previewHash: preview.preview_hash,
      event_payload: []
    }).success
  ).toBe(false);
});
it("uses stored local-auth credentials over the real stdio schema without exposing a bearer argument", async () => {
  const auth = vi
    .spyOn(authState, "readCliAuthState")
    .mockResolvedValue({
      bearer_token: "synthetic-member",
      base_url: "https://stored.example.test"
    });
  vi.stubEnv("DEBUGBUNDLE_MEMBER_TOKEN", "");
  vi.stubEnv("DEBUGBUNDLE_API_URL", "");
  const fetchMock = vi
    .spyOn(nodeHttp, "nodeFetch")
    .mockResolvedValue(new Response(JSON.stringify({ spaces: [] }), { status: 200 }));
  try {
    const server = createMcpServer({
      tools: await createDefaultMcpTools({ localAuth: true }),
      localAuth: true
    });
    const response = await server.handleRequest({
      id: 1,
      method: "tools/call",
      params: { name: "analytics_spaces_list", arguments: { organizationId } }
    });
    expect(response).toMatchObject({
      result: { content: [{ text: JSON.stringify({ spaces: [] }) }] }
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://stored.example.test/v1/analytics/spaces?organization_id=${organizationId}`,
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer synthetic-member" })
      })
    );
    const listed = await server.handleRequest({ id: 2, method: "tools/list" });
    const catalogResult = listed as {
      result: {
        tools: Array<{ name: string; inputSchema: { properties: Record<string, unknown> } }>;
      };
    };
    expect(
      catalogResult.result.tools.find((tool) => tool.name === "analytics_space_apply")?.inputSchema
        .properties
    ).not.toHaveProperty("bearerToken");
  } finally {
    auth.mockRestore();
    fetchMock.mockRestore();
    vi.unstubAllEnvs();
  }
});
it("uses the same API as CLI and validates calls before dispatch", async () => {
  const execute = vi.fn<AnalyticsSpaceApi["execute"]>().mockResolvedValue({ spaces: [] });
  const tools = createAnalyticsSpaceMcpTools({ execute });
  await tools.analytics_spaces_list({ bearerToken: "member", organizationId });
  await tools.analytics_space_get({ bearerToken: "member", spaceId: id });
  await tools.analytics_space_preview({ bearerToken: "member", spaceId: null, change });
  await tools.analytics_space_apply({
    bearerToken: "member",
    spaceId: id,
    change,
    previewHash: preview.preview_hash
  });
  expect(execute.mock.calls.map(([input]) => input)).toEqual([
    { bearerToken: "member", operation: { operation: "list", organizationId } },
    { bearerToken: "member", operation: { operation: "get", spaceId: id } },
    { bearerToken: "member", operation: { operation: "preview", spaceId: null, change } },
    {
      bearerToken: "member",
      operation: { operation: "apply", spaceId: id, change, previewHash: preview.preview_hash }
    }
  ]);
  await expect(
    tools.analytics_space_apply({ bearerToken: "member", spaceId: id, change })
  ).rejects.toThrow("mcp_tool_error:invalid_input");
  expect(execute).toHaveBeenCalledTimes(4);
  execute.mockRejectedValueOnce(new AnalyticsSpaceApiError(403, "analytics_space_forbidden"));
  await expect(tools.analytics_space_get({ bearerToken: "member", spaceId: id })).rejects.toThrow(
    "mcp_tool_error:analytics_space_forbidden"
  );
  execute.mockRejectedValueOnce(new Error("raw untrusted details"));
  await expect(tools.analytics_space_get({ bearerToken: "member", spaceId: id })).rejects.toThrow(
    "mcp_tool_error:analytics_space_request_failed"
  );
});
