export const OPENAI_MCP_ISSUER = "https://api.debugbundle.com";
export const OPENAI_MCP_RESOURCE = "https://mcp.debugbundle.com";
export const OPENAI_CIMD_CLIENT_ID = "https://chatgpt.com/oauth/client.json";
export const OPENAI_CIMD_JWKS_URI = "https://chatgpt.com/oauth/jwks.json";
export const OPENAI_PRODUCTION_REDIRECT_URI =
  "https://chatgpt.com/connector_platform_oauth_redirect";

export const OPENAI_AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60;
export const OPENAI_ACCESS_TOKEN_TTL_SECONDS = 12 * 60;
export const OPENAI_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export const OPENAI_HOSTED_MCP_SCOPES = [
  "debugbundle:projects:read",
  "debugbundle:incidents:read",
  "debugbundle:artifacts:read",
  "debugbundle:improvements:read",
  "debugbundle:analytics:read",
  "debugbundle:health:read"
] as const;

export const OPENAI_OIDC_SCOPES = ["openid", "email"] as const;
export const OPENAI_CIMD_RESPONSE_LIMIT_BYTES = 128 * 1024;
