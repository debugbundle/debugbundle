import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

import { createHostedAccessTokenVerifier } from "./hosted-access-token-verifier.js";
import {
  OPENAI_ACCESS_TOKEN_TTL_SECONDS,
  OPENAI_CIMD_CLIENT_ID,
  OPENAI_HOSTED_MCP_SCOPES,
  OPENAI_MCP_ISSUER,
  OPENAI_MCP_RESOURCE
} from "./openai-oauth-constants.js";

export interface OpenAiGrantStatusInput {
  grantId: string;
  userId: string;
  organizationId: string;
  clientId: string;
  resource: string;
  scopes: string[];
}

export interface OpenAiAccessTokenVerifierDependencies {
  jwks: { keys: Array<Record<string, unknown>> };
  isGrantActive: (input: OpenAiGrantStatusInput) => Promise<boolean>;
}

/** Frozen OpenAI policy and callback shape around shared verification mechanics. */
export function createOpenAiAccessTokenVerifier(
  dependencies: OpenAiAccessTokenVerifierDependencies
): { verifyAccessToken(token: string): Promise<AuthInfo> } {
  return createHostedAccessTokenVerifier(
    {
      profileId: "openai",
      issuer: OPENAI_MCP_ISSUER,
      resource: OPENAI_MCP_RESOURCE,
      clientId: OPENAI_CIMD_CLIENT_ID,
      scopes: [...OPENAI_HOSTED_MCP_SCOPES],
      accessTokenTtlSeconds: OPENAI_ACCESS_TOKEN_TTL_SECONDS
    },
    {
      jwks: dependencies.jwks,
      isGrantActive: ({ grantId, userId, organizationId, clientId, resource, scopes }) =>
        dependencies.isGrantActive({ grantId, userId, organizationId, clientId, resource, scopes })
    }
  );
}
