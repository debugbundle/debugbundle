import { OPENAI_TOOL_CATALOG } from "./openai-contract.js";

const OPENAI_RESOURCE_METADATA_URL =
  "https://mcp.debugbundle.com/.well-known/oauth-protected-resource";
const OPENAI_TOOL_SCOPE_SET = new Set(
  OPENAI_TOOL_CATALOG.flatMap((tool) =>
    tool.securitySchemes.flatMap((securityScheme) => securityScheme.scopes)
  )
);

export class OpenAiMcpAuthenticationError extends Error {
  constructor() {
    super("openai_mcp_unauthorized");
    this.name = "OpenAiMcpAuthenticationError";
  }
}

export class OpenAiMcpInsufficientScopeError extends Error {
  constructor(readonly requiredScope: string) {
    super(`openai_mcp_insufficient_scope:${requiredScope}`);
    this.name = "OpenAiMcpInsufficientScopeError";
  }
}

export function openAiMcpInvalidTokenChallenge(): string {
  return `Bearer resource_metadata="${OPENAI_RESOURCE_METADATA_URL}", error="invalid_token", error_description="A valid DebugBundle connection is required."`;
}

export function openAiMcpInsufficientScopeChallenge(requiredScope: string): string {
  if (!OPENAI_TOOL_SCOPE_SET.has(requiredScope)) {
    throw new Error("openai_mcp_invalid_required_scope");
  }
  return `Bearer resource_metadata="${OPENAI_RESOURCE_METADATA_URL}", error="insufficient_scope", error_description="The connection does not grant the required DebugBundle scope.", scope="${requiredScope}"`;
}

export function openAiMcpAuthChallengeForError(error: unknown): string | undefined {
  if (error instanceof OpenAiMcpAuthenticationError) {
    return openAiMcpInvalidTokenChallenge();
  }
  if (error instanceof OpenAiMcpInsufficientScopeError) {
    return openAiMcpInsufficientScopeChallenge(error.requiredScope);
  }
  return undefined;
}
