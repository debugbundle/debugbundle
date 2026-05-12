import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

import { zodToJsonSchema } from "zod-to-json-schema";

import { MCP_TOOL_CATALOG } from "./tool-catalog.js";
import type { ToolRegistry } from "./default-tools.js";

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

type JsonRpcResponse =
  | {
      jsonrpc: "2.0";
      id: JsonRpcId;
      result: unknown;
    }
  | {
      jsonrpc: "2.0";
      id: JsonRpcId;
      error: {
        code: number;
        message: string;
      };
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequestId(id: unknown): JsonRpcId {
  if (typeof id === "string" || typeof id === "number" || id === null) {
    return id;
  }

  return null;
}

function buildError(id: unknown, code: number, message: string): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id: readRequestId(id),
    error: {
      code,
      message
    }
  };
}

function parseToolCallParams(params: unknown): { name: string; arguments: Record<string, unknown> } | null {
  if (!isRecord(params) || typeof params["name"] !== "string") {
    return null;
  }

  const rawArguments = params["arguments"];
  return {
    name: params["name"],
    arguments: isRecord(rawArguments) ? rawArguments : {}
  };
}

function toToolResponse(payload: unknown): unknown {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload)
      }
    ]
  };
}

function toToolErrorResponse(error: unknown): unknown {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          error: error instanceof Error ? error.message : "mcp_tool_error:unknown_error"
        })
      }
    ]
  };
}

function toJsonSchema(schema: unknown): Record<string, unknown> {
  return zodToJsonSchema(schema as never, {
    target: "jsonSchema2019-09",
    $refStrategy: "none"
  }) as Record<string, unknown>;
}

export function createMcpServer(input: { tools: ToolRegistry }): {
  handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | null>;
} {
  return {
    async handleRequest(request) {
      if (request.method === "notifications/initialized") {
        return null;
      }

      if (request.method === "initialize") {
        return {
          jsonrpc: "2.0",
          id: readRequestId(request.id),
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: "@debugbundle/mcp",
              version: "0.1.2"
            }
          }
        };
      }

      if (request.method === "tools/list") {
        return {
          jsonrpc: "2.0",
          id: readRequestId(request.id),
          result: {
            tools: MCP_TOOL_CATALOG.map((tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: toJsonSchema(tool.inputSchema)
            }))
          }
        };
      }

      if (request.method === "tools/call") {
        const params = parseToolCallParams(request.params);
        if (params === null) {
          return buildError(request.id, -32602, "Invalid tools/call params.");
        }

        const catalogEntry = MCP_TOOL_CATALOG.find((tool) => tool.name === params.name);
        const handler = input.tools[params.name];
        if (catalogEntry === undefined || handler === undefined) {
          return buildError(request.id, -32602, `Unknown tool: ${params.name}`);
        }

        const parsedArguments = catalogEntry.inputSchema.safeParse(params.arguments);
        if (!parsedArguments.success) {
          return buildError(request.id, -32602, "Invalid tool arguments.");
        }

        try {
          return {
            jsonrpc: "2.0",
            id: readRequestId(request.id),
            result: toToolResponse(await handler(parsedArguments.data as Record<string, unknown>))
          };
        } catch (error) {
          return {
            jsonrpc: "2.0",
            id: readRequestId(request.id),
            result: toToolErrorResponse(error)
          };
        }
      }

      return buildError(request.id, -32601, "Method not found.");
    }
  };
}

export function runMcpStdioServer(input: {
  input: Readable;
  output: Writable;
  server: ReturnType<typeof createMcpServer>;
}): Promise<void> {
  const lines = createInterface({
    input: input.input,
    terminal: false
  });

  lines.on("line", (line) => {
    void (async () => {
      let request: JsonRpcRequest;
      try {
        request = JSON.parse(line) as JsonRpcRequest;
      } catch {
        input.output.write(`${JSON.stringify(buildError(null, -32700, "Parse error."))}\n`);
        return;
      }

      const response = await input.server.handleRequest(request);
      if (response !== null) {
        input.output.write(`${JSON.stringify(response)}\n`);
      }
    })();
  });

  return Promise.resolve();
}
