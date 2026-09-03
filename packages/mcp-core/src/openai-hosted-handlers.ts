import {
  OPENAI_TOOL_CATALOG,
  OPENAI_TOOL_NAMES,
  parseOpenAiToolInput,
  projectOpenAiToolOutput,
  type OpenAiToolName
} from "./openai-contract.js";
import { OpenAiMcpInsufficientScopeError } from "./openai-auth-challenge.js";

export interface OpenAiMcpPrincipal {
  userId: string;
  organizationId: string;
  grantId: string;
  scopes: readonly string[];
}

export interface OpenAiHostedOperationInput {
  principal: OpenAiMcpPrincipal;
  input: Record<string, unknown>;
}

export type OpenAiHostedOperation = (input: OpenAiHostedOperationInput) => Promise<unknown>;
export type OpenAiHostedOperations = Partial<Record<OpenAiToolName, OpenAiHostedOperation>>;

export interface OpenAiHostedToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
}

export type OpenAiHostedToolHandler = (
  input: OpenAiHostedOperationInput
) => Promise<OpenAiHostedToolResult>;
export type OpenAiHostedToolHandlers = Record<OpenAiToolName, OpenAiHostedToolHandler>;

function requiredScopes(name: OpenAiToolName): readonly string[] {
  const tool = OPENAI_TOOL_CATALOG.find((entry) => entry.name === name);
  if (tool === undefined) {
    throw new Error(`openai_mcp_contract_missing_tool:${name}`);
  }
  return tool.securitySchemes.flatMap((scheme) => scheme.scopes);
}

function requireStructuredObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("openai_mcp_invalid_structured_output");
  }
  return value as Record<string, unknown>;
}

export function createOpenAiHostedToolHandlers(input: {
  operations: OpenAiHostedOperations;
}): OpenAiHostedToolHandlers {
  return Object.fromEntries(
    OPENAI_TOOL_NAMES.map((name) => [
      name,
      async (request: OpenAiHostedOperationInput): Promise<OpenAiHostedToolResult> => {
        for (const scope of requiredScopes(name)) {
          if (!request.principal.scopes.includes(scope)) {
            throw new OpenAiMcpInsufficientScopeError(scope);
          }
        }

        const operation = input.operations[name];
        if (operation === undefined) {
          throw new Error(`openai_mcp_operation_unavailable:${name}`);
        }
        const parsedInput = parseOpenAiToolInput(name, request.input);
        const structuredContent = requireStructuredObject(
          projectOpenAiToolOutput(
            name,
            await operation({ principal: request.principal, input: parsedInput })
          )
        );

        return {
          content: [{ type: "text", text: JSON.stringify(structuredContent) }],
          structuredContent
        };
      }
    ])
  ) as OpenAiHostedToolHandlers;
}
