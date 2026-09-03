import { errors } from "oidc-provider";

import {
  OPENAI_ACCESS_TOKEN_TTL_SECONDS,
  OPENAI_AUTHORIZATION_CODE_TTL_SECONDS,
  OPENAI_CIMD_CLIENT_ID,
  OPENAI_CIMD_RESPONSE_LIMIT_BYTES,
  OPENAI_HOSTED_MCP_SCOPES,
  OPENAI_MCP_RESOURCE,
  OPENAI_OIDC_SCOPES,
  OPENAI_REFRESH_TOKEN_TTL_SECONDS
} from "./openai-oauth-constants.js";
import { createOpenAiCimdFetch, type OpenAiCimdResponseCache } from "./openai-cimd-fetch.js";
import { isAllowedOpenAiCimdClient } from "./openai-oauth-metadata.js";

export interface OpenAiVerifiedAccount {
  userId: string;
  email: string;
  emailVerified: boolean;
}

export interface OpenAiGrantClaims {
  grantId: string;
  organizationId: string;
}

export interface OpenAiOidcConfigurationDependencies {
  adapter: unknown;
  cimdCache: OpenAiCimdResponseCache;
  jwks: { keys: Array<Record<string, unknown>> };
  cookieKeys: string[];
  findVerifiedAccount: (accountId: string) => Promise<OpenAiVerifiedAccount | undefined>;
  claimClientAssertionJti: (input: {
    issuer: string;
    jti: string;
    expiresAt: number;
  }) => Promise<boolean>;
  resolveGrantClaims: (grantId: string) => Promise<OpenAiGrantClaims | undefined>;
  fetchImpl?: typeof fetch;
}

export interface OpenAiOidcConfiguration {
  adapter: unknown;
  jwks: { keys: Array<Record<string, unknown>> };
  clients: Array<Record<string, unknown>>;
  cookies: { keys: string[] };
  clientAuthMethods: ["private_key_jwt"];
  scopes: string[];
  responseTypes: string[];
  grantTypes: string[];
  claims: Record<string, string[]>;
  subjectTypes: string[];
  formats: { AccessToken: "jwt" };
  ttl: {
    AuthorizationCode: number;
    AccessToken: number;
    RefreshToken: number;
    Grant: number;
  };
  pkce: { methods: string[]; required: () => boolean };
  features: {
    clientIdMetadataDocument: {
      enabled: true;
      ack: "draft-02";
      allowFetch: (_ctx: unknown, clientId: string) => Promise<boolean>;
      allowClient: (_ctx: unknown, client: Record<string, unknown>) => Promise<boolean>;
      cacheDuration: { min: number; max: number };
    };
    devInteractions: { enabled: false };
    registration: { enabled: false };
    resourceIndicators: {
      enabled: true;
      defaultResource: () => string;
      getResourceServerInfo: (_ctx: unknown, resource: string) => Record<string, unknown>;
      useGrantedResource: () => true;
    };
    revocation: { enabled: true };
    userinfo: { enabled: true };
  };
  routes: {
    authorization: string;
    token: string;
    revocation: string;
    userinfo: string;
    jwks: string;
  };
  interactions: { url: (_ctx: unknown, interaction: { uid: string }) => string };
  fetch: typeof fetch;
  fetchResponseBodyLimits: {
    "client_id metadata document": number;
    jwks_uri: number;
  };
  findAccount: (_ctx: unknown, accountId: string) => ReturnType<typeof resolveOpenAiAccount>;
  conformIdTokenClaims: false;
  issueRefreshToken: () => true;
  extraTokenClaims: (
    _ctx: unknown,
    token: { grantId?: string }
  ) => Promise<Record<string, string | number>>;
  assertJwtClientAuthClaimsAndHeader: (
    _ctx: unknown,
    claims: Record<string, unknown>,
    header: Record<string, unknown>,
    client: Record<string, unknown>
  ) => Promise<void>;
}

const OPENAI_TOKEN_ENDPOINT = "https://api.debugbundle.com/oauth/token";
const OPENAI_CLIENT_ASSERTION_MAX_LIFETIME_SECONDS = 300;
const OPENAI_CLIENT_ASSERTION_CLOCK_TOLERANCE_SECONDS = 15;

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function createOpenAiOidcFetch(
  fetchImpl: typeof fetch | undefined,
  cache: OpenAiCimdResponseCache
): typeof fetch {
  return createOpenAiCimdFetch(fetchImpl, { cache });
}

export async function resolveOpenAiAccount(
  accountId: string,
  findVerifiedAccount: OpenAiOidcConfigurationDependencies["findVerifiedAccount"]
): Promise<
  | {
      accountId: string;
      claims: () => Promise<Record<string, unknown>>;
    }
  | undefined
> {
  const account = await findVerifiedAccount(accountId);
  if (!account?.emailVerified) {
    return undefined;
  }

  const email = account.email.trim().toLowerCase();
  if (email.length === 0 || !email.includes("@")) {
    return undefined;
  }

  return {
    accountId: account.userId,
    claims: () =>
      Promise.resolve({
        sub: account.userId,
        email,
        email_verified: true
      })
  };
}

export function buildOpenAiOidcConfiguration(
  dependencies: OpenAiOidcConfigurationDependencies
): OpenAiOidcConfiguration {
  return {
    adapter: dependencies.adapter,
    jwks: dependencies.jwks,
    cookies: { keys: dependencies.cookieKeys },
    clients: [],
    clientAuthMethods: ["private_key_jwt"],
    scopes: [...OPENAI_OIDC_SCOPES, ...OPENAI_HOSTED_MCP_SCOPES],
    responseTypes: ["code"],
    grantTypes: ["authorization_code", "refresh_token"],
    claims: {
      openid: ["sub"],
      email: ["email", "email_verified"]
    },
    subjectTypes: ["public"],
    formats: { AccessToken: "jwt" },
    ttl: {
      AuthorizationCode: OPENAI_AUTHORIZATION_CODE_TTL_SECONDS,
      AccessToken: OPENAI_ACCESS_TOKEN_TTL_SECONDS,
      RefreshToken: OPENAI_REFRESH_TOKEN_TTL_SECONDS,
      Grant: OPENAI_REFRESH_TOKEN_TTL_SECONDS
    },
    pkce: {
      methods: ["S256"],
      required: () => true
    },
    features: {
      clientIdMetadataDocument: {
        enabled: true,
        ack: "draft-02",
        allowFetch: (_ctx: unknown, clientId: string) =>
          Promise.resolve(clientId === OPENAI_CIMD_CLIENT_ID),
        allowClient: (_ctx: unknown, client: Record<string, unknown>) => {
          const jwksUri = readOptionalString(client["jwksUri"]);
          const signingAlgorithm = readOptionalString(client["tokenEndpointAuthSigningAlg"]);
          return Promise.resolve(
            isAllowedOpenAiCimdClient({
              clientId: readString(client["clientId"]),
              redirectUris: readStringArray(client["redirectUris"]),
              clientAuthMethod: readString(client["tokenEndpointAuthMethod"]),
              ...(jwksUri === undefined ? {} : { jwksUri }),
              ...(signingAlgorithm === undefined ? {} : { signingAlgorithm })
            })
          );
        },
        cacheDuration: { min: 300, max: 300 }
      },
      devInteractions: { enabled: false },
      registration: { enabled: false },
      resourceIndicators: {
        enabled: true,
        defaultResource: () => OPENAI_MCP_RESOURCE,
        getResourceServerInfo: (_ctx: unknown, resource: string) => {
          if (resource !== OPENAI_MCP_RESOURCE) {
            throw new Error("invalid_target");
          }
          return {
            scope: OPENAI_HOSTED_MCP_SCOPES.join(" "),
            audience: OPENAI_MCP_RESOURCE,
            accessTokenFormat: "jwt",
            accessTokenTTL: OPENAI_ACCESS_TOKEN_TTL_SECONDS
          };
        },
        useGrantedResource: () => true
      },
      revocation: { enabled: true },
      userinfo: { enabled: true }
    },
    routes: {
      authorization: "/oauth/authorize",
      token: "/oauth/token",
      revocation: "/oauth/revoke",
      userinfo: "/oauth/userinfo",
      jwks: "/oauth/jwks.json"
    },
    interactions: {
      url: (_ctx: unknown, interaction: { uid: string }) =>
        `/oauth/interaction/${encodeURIComponent(interaction.uid)}`
    },
    fetch: createOpenAiOidcFetch(dependencies.fetchImpl, dependencies.cimdCache),
    fetchResponseBodyLimits: {
      "client_id metadata document": OPENAI_CIMD_RESPONSE_LIMIT_BYTES,
      jwks_uri: OPENAI_CIMD_RESPONSE_LIMIT_BYTES
    },
    findAccount: async (_ctx: unknown, accountId: string) =>
      resolveOpenAiAccount(accountId, dependencies.findVerifiedAccount),
    conformIdTokenClaims: false,
    issueRefreshToken: () => true,
    extraTokenClaims: async (_ctx: unknown, token: { grantId?: string }) => {
      const notBefore = Math.floor(Date.now() / 1_000);
      if (!token.grantId) {
        return { nbf: notBefore };
      }
      const claims = await dependencies.resolveGrantClaims(token.grantId);
      return claims
        ? {
            grant_id: claims.grantId,
            organization_id: claims.organizationId,
            nbf: notBefore
          }
        : { nbf: notBefore };
    },
    assertJwtClientAuthClaimsAndHeader: async (
      _ctx: unknown,
      claims: Record<string, unknown>,
      header: Record<string, unknown>,
      client: Record<string, unknown>
    ) => {
      const now = Math.floor(Date.now() / 1_000);
      const issuedAt = claims["iat"];
      const expiresAt = claims["exp"];
      const jti = claims["jti"];
      if (
        claims["iss"] !== OPENAI_CIMD_CLIENT_ID ||
        claims["sub"] !== OPENAI_CIMD_CLIENT_ID ||
        claims["aud"] !== OPENAI_TOKEN_ENDPOINT ||
        client["clientId"] !== OPENAI_CIMD_CLIENT_ID ||
        header["alg"] !== "RS256" ||
        typeof header["kid"] !== "string" ||
        header["kid"].length === 0 ||
        typeof issuedAt !== "number" ||
        !Number.isInteger(issuedAt) ||
        issuedAt > now + OPENAI_CLIENT_ASSERTION_CLOCK_TOLERANCE_SECONDS ||
        typeof expiresAt !== "number" ||
        !Number.isInteger(expiresAt) ||
        expiresAt <= issuedAt ||
        expiresAt - issuedAt > OPENAI_CLIENT_ASSERTION_MAX_LIFETIME_SECONDS ||
        expiresAt <= now - OPENAI_CLIENT_ASSERTION_CLOCK_TOLERANCE_SECONDS ||
        typeof jti !== "string" ||
        jti.length === 0 ||
        jti.length > 512
      ) {
        throw new errors.InvalidClientAuth();
      }
      const claimed = await dependencies.claimClientAssertionJti({
        issuer: OPENAI_CIMD_CLIENT_ID,
        jti,
        expiresAt: expiresAt + OPENAI_CLIENT_ASSERTION_CLOCK_TOLERANCE_SECONDS
      });
      if (!claimed) {
        throw new errors.InvalidClientAuth();
      }
    }
  };
}
