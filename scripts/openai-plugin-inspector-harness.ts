import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, type Tool } from "@modelcontextprotocol/sdk/types.js";

import {
  OPENAI_TOOL_CATALOG,
  getOpenAiToolSchemas
} from "../packages/mcp-core/src/openai-contract.js";

const server = new Server(
  { name: "debugbundle-openai-inspector-harness", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: OPENAI_TOOL_CATALOG.map((tool): Tool => {
    const schemas = getOpenAiToolSchemas(tool.name);
    return {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: schemas.inputSchema as Tool["inputSchema"],
      outputSchema: schemas.outputSchema as Tool["outputSchema"],
      annotations: tool.annotations,
      _meta: { securitySchemes: tool.securitySchemes }
    };
  })
}));

await server.connect(new StdioServerTransport());
