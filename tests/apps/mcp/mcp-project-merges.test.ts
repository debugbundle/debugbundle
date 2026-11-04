import { expect, it, vi } from "vitest";
import { createMcpServer } from "../../../apps/mcp/src/server.js";
import {
  createProjectMergeMcpTools,
  PROJECT_MERGE_MCP_TOOL_NAMES
} from "../../../apps/mcp/src/project-merge-tools.js";
it("advertises object input schemas that ordinary MCP clients can load", async () => {
  const api = {
    previewProjectMerge: vi.fn(),
    applyProjectMerge: vi.fn(),
    getProjectMerge: vi.fn().mockResolvedValue({ state: "completed" }),
    verifyProjectMerge: vi.fn(),
    resumeProjectMerge: vi.fn(),
    cancelProjectMerge: vi.fn()
  };
  const tools = createProjectMergeMcpTools(api),
    server = createMcpServer({ tools: tools as never });
  const response = await server.handleRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  expect(response).toHaveProperty("result");
  const catalogue = (
    response as { result: { tools: { name: string; inputSchema: { type?: string } }[] } }
  ).result.tools;
  expect(
    catalogue
      .filter((tool) =>
        PROJECT_MERGE_MCP_TOOL_NAMES.includes(
          tool.name as (typeof PROJECT_MERGE_MCP_TOOL_NAMES)[number]
        )
      )
      .every((tool) => tool.inputSchema.type === "object")
  ).toBe(true);
  expect(
    catalogue.filter((tool) =>
      PROJECT_MERGE_MCP_TOOL_NAMES.includes(
        tool.name as (typeof PROJECT_MERGE_MCP_TOOL_NAMES)[number]
      )
    )
  ).toHaveLength(6);
});
