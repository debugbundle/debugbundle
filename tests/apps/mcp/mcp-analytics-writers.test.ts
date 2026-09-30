import { afterEach, expect, it, vi } from "vitest";
import {
  AnalyticsWriterApiError,
  type AnalyticsWriterApi
} from "../../../apps/cli/src/analytics-writer-api.js";
import { createAnalyticsWriterMcpTools } from "../../../apps/mcp/src/analytics-writer-tools.js";
import { ANALYTICS_WRITER_MCP_TOOL_CATALOG } from "../../../apps/mcp/src/analytics-writer-tool-catalog.js";
import { MCP_TOOL_CATALOG } from "../../../apps/mcp/src/tool-catalog.js";
import { createDefaultMcpTools } from "../../../apps/mcp/src/default-tools.js";
import { createMcpServer } from "../../../apps/mcp/src/server.js";
import * as authState from "../../../apps/cli/src/auth-state.js";
import * as nodeHttp from "../../../packages/node-http/src/index.js";
import {
  WRITER_CHANGE as change,
  WRITER_PREVIEW as preview,
  WRITER_PROJECT as projectId,
  WRITER_RECORD as writer,
  WRITER_SECRET as plaintext
} from "../../helpers/analytics-writer-fixtures.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("registers strict local writer management tools", () => {
  expect(ANALYTICS_WRITER_MCP_TOOL_CATALOG.map((tool) => tool.name)).toEqual([
    "analytics_writers_list",
    "analytics_writer_preview",
    "analytics_writer_apply"
  ]);
  for (const tool of ANALYTICS_WRITER_MCP_TOOL_CATALOG)
    expect(MCP_TOOL_CATALOG.some((entry) => entry.name === tool.name)).toBe(true);
  const apply = ANALYTICS_WRITER_MCP_TOOL_CATALOG[2].inputSchema;
  expect(apply.safeParse({ bearerToken: "member", projectId, change }).success).toBe(false);
  expect(
    apply.safeParse({ bearerToken: "member", projectId, change, previewHash: preview.preview_hash })
      .success
  ).toBe(true);
  expect(
    apply.safeParse({
      bearerToken: "member",
      projectId,
      change,
      previewHash: preview.preview_hash,
      raw: "never"
    }).success
  ).toBe(false);
});

it("dispatches through the CLI API client and contains untrusted errors", async () => {
  const execute = vi.fn<AnalyticsWriterApi["execute"]>().mockResolvedValue(preview);
  const tools = createAnalyticsWriterMcpTools({ execute });
  await tools.analytics_writers_list({ bearerToken: "member", projectId });
  await tools.analytics_writer_preview({ bearerToken: "member", projectId, change });
  await tools.analytics_writer_apply({
    bearerToken: "member",
    projectId,
    change,
    previewHash: preview.preview_hash
  });
  expect(execute.mock.calls.map(([input]) => input)).toEqual([
    { bearerToken: "member", operation: { operation: "list", projectId } },
    { bearerToken: "member", operation: { operation: "preview", projectId, change } },
    {
      bearerToken: "member",
      operation: { operation: "apply", projectId, change, previewHash: preview.preview_hash }
    }
  ]);
  await expect(
    tools.analytics_writer_apply({ bearerToken: "member", projectId, change })
  ).rejects.toThrow("mcp_tool_error:invalid_input");
  execute.mockRejectedValueOnce(new AnalyticsWriterApiError(403, "analytics_writer_forbidden"));
  await expect(tools.analytics_writers_list({ bearerToken: "member", projectId })).rejects.toThrow(
    "mcp_tool_error:analytics_writer_forbidden"
  );
  execute.mockRejectedValueOnce(new Error(`untrusted ${plaintext}`));
  await expect(tools.analytics_writers_list({ bearerToken: "member", projectId })).rejects.toThrow(
    "mcp_tool_error:analytics_writer_request_failed"
  );
});

it("uses stored local member auth, returns one-time secret, and keeps restricted tools absent", async () => {
  vi.spyOn(authState, "readCliAuthState").mockResolvedValue({
    bearer_token: "synthetic-member",
    base_url: "https://stored.example.test"
  });
  vi.stubEnv("DEBUGBUNDLE_MEMBER_TOKEN", "");
  vi.stubEnv("DEBUGBUNDLE_API_URL", "");
  const fetchMock = vi.spyOn(nodeHttp, "nodeFetch").mockResolvedValue(
    new Response(
      JSON.stringify({ disposition: "issued", revision: 1, replayed: false, writer, plaintext }),
      {
        status: 200
      }
    )
  );
  const server = createMcpServer({
    tools: await createDefaultMcpTools({ localAuth: true }),
    localAuth: true
  });
  const result = await server.handleRequest({
    id: 1,
    method: "tools/call",
    params: {
      name: "analytics_writer_apply",
      arguments: { projectId, change, previewHash: preview.preview_hash }
    }
  });
  const issued = result as { result: { content: Array<{ text: string }> } };
  expect(JSON.parse(issued.result.content[0]!.text)).toEqual({
    disposition: "issued",
    revision: 1,
    replayed: false,
    writer,
    plaintext
  });
  expect(fetchMock).toHaveBeenCalledWith(
    `https://stored.example.test/v1/projects/${projectId}/analytics/writers/apply`,
    expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer synthetic-member" })
    })
  );
  const listed = await server.handleRequest({ id: 2, method: "tools/list" });
  const tools = listed as {
    result: {
      tools: Array<{ name: string; inputSchema: { properties: Record<string, unknown> } }>;
    };
  };
  expect(
    tools.result.tools.find((tool) => tool.name === "analytics_writer_apply")?.inputSchema
      .properties
  ).not.toHaveProperty("bearerToken");

  vi.stubEnv("DEBUGBUNDLE_AGENT_TOKEN", "dbundle_agent_synthetic");
  const restricted = await createDefaultMcpTools({ agentRead: true });
  expect(restricted).not.toHaveProperty("analytics_writer_apply");
});
