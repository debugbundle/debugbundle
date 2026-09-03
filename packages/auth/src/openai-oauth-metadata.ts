import {
  OPENAI_CIMD_CLIENT_ID,
  OPENAI_CIMD_JWKS_URI,
  OPENAI_HOSTED_MCP_SCOPES,
  OPENAI_MCP_ISSUER,
  OPENAI_MCP_RESOURCE
} from "./openai-oauth-constants.js";

export function buildOpenAiProtectedResourceMetadata(): Record<string, unknown> {
  return {
    resource: OPENAI_MCP_RESOURCE,
    authorization_servers: [OPENAI_MCP_ISSUER],
    scopes_supported: [...OPENAI_HOSTED_MCP_SCOPES],
    resource_documentation: "https://debugbundle.com/docs/mcp/openai-plugin"
  };
}

export function buildOpenAiAuthorizationServerMetadata(): Record<string, unknown> {
  return {
    issuer: OPENAI_MCP_ISSUER,
    authorization_endpoint: `${OPENAI_MCP_ISSUER}/oauth/authorize`,
    token_endpoint: `${OPENAI_MCP_ISSUER}/oauth/token`,
    revocation_endpoint: `${OPENAI_MCP_ISSUER}/oauth/revoke`,
    userinfo_endpoint: `${OPENAI_MCP_ISSUER}/oauth/userinfo`,
    jwks_uri: `${OPENAI_MCP_ISSUER}/oauth/jwks.json`,
    scopes_supported: ["openid", "email", ...OPENAI_HOSTED_MCP_SCOPES],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["private_key_jwt"],
    revocation_endpoint_auth_methods_supported: ["private_key_jwt"],
    code_challenge_methods_supported: ["S256"],
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: true,
    client_id_metadata_document_signing_alg_values_supported: ["RS256", "ES256", "PS256", "EdDSA"],
    resource_indicators_supported: true,
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"]
  };
}

export function isAllowedOpenAiCimdClient(input: {
  clientId: string;
  redirectUris: readonly string[];
  clientAuthMethod: string;
  jwksUri?: string;
  signingAlgorithm?: string;
}): boolean {
  return (
    input.clientId === OPENAI_CIMD_CLIENT_ID &&
    input.clientAuthMethod === "private_key_jwt" &&
    input.redirectUris.length === 1 &&
    input.redirectUris[0] === "https://chatgpt.com/connector_platform_oauth_redirect" &&
    (input.jwksUri === undefined || input.jwksUri === OPENAI_CIMD_JWKS_URI) &&
    (input.signingAlgorithm === undefined || input.signingAlgorithm === "RS256")
  );
}

export function isAllowedOpenAiCimdFetchUrl(value: string): boolean {
  return value === OPENAI_CIMD_CLIENT_ID || value === OPENAI_CIMD_JWKS_URI;
}
