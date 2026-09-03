import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool
} from "@modelcontextprotocol/sdk/types.js";

import {
  OPENAI_TOOL_CATALOG,
  getOpenAiToolSchemas,
  type OpenAiToolName
} from "./openai-contract.js";
import {
  createOpenAiHostedToolHandlers,
  type OpenAiHostedOperations,
  type OpenAiMcpPrincipal
} from "./openai-hosted-handlers.js";
import {
  OpenAiMcpAuthenticationError,
  openAiMcpAuthChallengeForError
} from "./openai-auth-challenge.js";

const OPENAI_MCP_RESOURCE = "https://mcp.debugbundle.com/";
const OPENAI_CIMD_CLIENT_ID = "https://chatgpt.com/oauth/client.json";

function requirePrincipal(
  authInfo:
    | {
        clientId?: string;
        scopes?: string[];
        resource?: URL;
        extra?: Record<string, unknown>;
      }
    | undefined
): OpenAiMcpPrincipal {
  if (
    authInfo?.clientId !== OPENAI_CIMD_CLIENT_ID ||
    authInfo.resource?.toString() !== OPENAI_MCP_RESOURCE ||
    !Array.isArray(authInfo.scopes) ||
    typeof authInfo.extra?.["userId"] !== "string" ||
    typeof authInfo.extra["organizationId"] !== "string" ||
    typeof authInfo.extra["grantId"] !== "string"
  ) {
    throw new OpenAiMcpAuthenticationError();
  }

  return {
    userId: authInfo.extra["userId"],
    organizationId: authInfo.extra["organizationId"],
    grantId: authInfo.extra["grantId"],
    scopes: authInfo.scopes
  };
}

function toolContractToSdkTool(tool: (typeof OPENAI_TOOL_CATALOG)[number]): Tool {
  const schemas = getOpenAiToolSchemas(tool.name);
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: schemas.inputSchema as Tool["inputSchema"],
    outputSchema: schemas.outputSchema as Tool["outputSchema"],
    annotations: tool.annotations,
    _meta: {
      securitySchemes: tool.securitySchemes
    }
  };
}

function toolError(authChallenge?: string): CallToolResult {
  return {
    isError: true,
    ...(authChallenge === undefined
      ? {}
      : { _meta: { "mcp/www_authenticate": [authChallenge] } }),
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: "openai_mcp_tool_error" })
      }
    ]
  };
}

export function createOpenAiSdkServer(input: {
  operations: OpenAiHostedOperations;
  operationTimeoutMs?: number;
}): Server {
  const server = new Server(
    { name: "debugbundle-openai-plugin", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  const operationTimeoutMs = input.operationTimeoutMs ?? 24_000;
  const operations = Object.fromEntries(
    Object.entries(input.operations).map(([name, operation]) => [
      name,
      operation === undefined
        ? undefined
        : async (...args: Parameters<typeof operation>) => {
            let timer: NodeJS.Timeout | undefined;
            try {
              return await Promise.race([
                operation(...args),
                new Promise<never>((_resolve, reject) => {
                  timer = setTimeout(
                    () => reject(new Error("openai_mcp_operation_timeout")),
                    operationTimeoutMs
                  );
                  timer.unref();
                })
              ]);
            } finally {
              if (timer !== undefined) {
                clearTimeout(timer);
              }
            }
          }
    ])
  ) as OpenAiHostedOperations;
  const handlers = createOpenAiHostedToolHandlers({ operations });

  server.setRequestHandler(ListToolsRequestSchema, (_request, extra) => {
    requirePrincipal(extra.authInfo);
    return { tools: OPENAI_TOOL_CATALOG.map(toolContractToSdkTool) };
  });

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request, extra): Promise<CallToolResult> => {
      try {
        const name = request.params.name as OpenAiToolName;
        const handler = handlers[name];
        if (handler === undefined) {
          return toolError();
        }
        const result = await handler({
          principal: requirePrincipal(extra.authInfo),
          input: request.params.arguments ?? {}
        });
        return {
          content: result.content,
          structuredContent: result.structuredContent
        };
      } catch (error) {
        return toolError(openAiMcpAuthChallengeForError(error));
      }
    }
  );

  return server;
}
