import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet, type JWTPayload } from "jose";

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

function toPublicVerificationJwks(
  jwks: OpenAiAccessTokenVerifierDependencies["jwks"]
): JSONWebKeySet {
  return {
    keys: jwks.keys.map((key) => ({
      kty: key["kty"],
      kid: key["kid"],
      alg: key["alg"],
      use: key["use"],
      n: key["n"],
      e: key["e"]
    }))
  } as JSONWebKeySet;
}

function readRequiredClaim(payload: JWTPayload, name: string): string {
  const value = payload[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("openai_access_token_invalid");
  }
  return value;
}

function readScopes(payload: JWTPayload): string[] {
  const value = readRequiredClaim(payload, "scope");
  const scopes = value.split(" ").filter((scope) => scope.length > 0);
  const allowedScopes = new Set<string>(OPENAI_HOSTED_MCP_SCOPES);
  if (
    scopes.length === 0 ||
    new Set(scopes).size !== scopes.length ||
    scopes.some((scope) => !allowedScopes.has(scope))
  ) {
    throw new Error("openai_access_token_invalid");
  }
  return scopes;
}

function assertAccessTokenProfile(
  payload: JWTPayload,
  protectedHeader: { alg?: string; typ?: string }
): void {
  if (
    protectedHeader.alg !== "RS256" ||
    protectedHeader.typ !== "at+jwt" ||
    payload.iss !== OPENAI_MCP_ISSUER ||
    payload.aud !== OPENAI_MCP_RESOURCE ||
    typeof payload.iat !== "number" ||
    typeof payload.nbf !== "number" ||
    typeof payload.exp !== "number" ||
    payload.nbf < payload.iat ||
    payload.nbf > payload.iat + 5 ||
    payload.exp - payload.iat !== OPENAI_ACCESS_TOKEN_TTL_SECONDS ||
    payload["email"] !== undefined ||
    payload["email_verified"] !== undefined
  ) {
    throw new Error("openai_access_token_invalid");
  }
}

export function createOpenAiAccessTokenVerifier(
  dependencies: OpenAiAccessTokenVerifierDependencies
): { verifyAccessToken(token: string): Promise<AuthInfo> } {
  // The OAuth provider and resource server share one configured signing key set.
  // Verification must expose only the public RSA parameters to jose.
  const keySet = createLocalJWKSet(toPublicVerificationJwks(dependencies.jwks));

  return {
    async verifyAccessToken(token): Promise<AuthInfo> {
      try {
        const verified = await jwtVerify(token, keySet, {
          issuer: OPENAI_MCP_ISSUER,
          audience: OPENAI_MCP_RESOURCE,
          algorithms: ["RS256"],
          requiredClaims: [
            "sub",
            "client_id",
            "scope",
            "grant_id",
            "organization_id",
            "iat",
            "nbf",
            "exp",
            "jti"
          ]
        });
        assertAccessTokenProfile(verified.payload, verified.protectedHeader);

        const userId = readRequiredClaim(verified.payload, "sub");
        const clientId = readRequiredClaim(verified.payload, "client_id");
        const grantId = readRequiredClaim(verified.payload, "grant_id");
        const organizationId = readRequiredClaim(verified.payload, "organization_id");
        const scopes = readScopes(verified.payload);
        const expiresAt = verified.payload.exp;
        if (clientId !== OPENAI_CIMD_CLIENT_ID || typeof expiresAt !== "number") {
          throw new Error("openai_access_token_invalid");
        }

        const active = await dependencies.isGrantActive({
          grantId,
          userId,
          organizationId,
          clientId,
          resource: OPENAI_MCP_RESOURCE,
          scopes
        });
        if (!active) {
          throw new Error("openai_access_token_invalid");
        }

        return {
          token,
          clientId,
          scopes,
          expiresAt,
          resource: new URL(OPENAI_MCP_RESOURCE),
          extra: { userId, organizationId, grantId }
        };
      } catch {
        throw new Error("openai_access_token_invalid");
      }
    }
  };
}
