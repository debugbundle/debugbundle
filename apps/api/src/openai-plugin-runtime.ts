import { z } from "zod";

import {
  createOpenAiAccessTokenVerifier,
  createOpenAiOidcProvider
} from "../../../packages/auth/src/index.js";
import {
  createPostgresOidcProviderAdapterFactory,
  createPostgresOpenAiOAuthStore,
  createPostgresAuditLogStore,
  type Queryable
} from "../../../packages/storage/src/index.js";
import {
  createOpenAiHostedOperations,
  type OpenAiHostedReadDependencies
} from "./openai-mcp-operations.js";
import { createOpenAiConsentAuthorization } from "./openai-consent-access.js";
import type { OpenAiMcpAdmissionCoordinator } from "./openai-rate-limits.js";
import { createOpenAiReviewerAuthorization } from "./openai-reviewer-access.js";
import type { ApiServerOptions } from "./server.js";

const OPENAI_PRIMARY_DB_RESERVE = 6;
const OPENAI_MCP_DEFAULT_CONCURRENCY = 2;
const OPENAI_MCP_MAX_CONCURRENCY = 4;
const FORBIDDEN_ORIGIN_ENV_KEYS = [
  "OPENAI_MCP_ISSUER",
  "OPENAI_MCP_RESOURCE",
  "OPENAI_MCP_HOST",
  "OPENAI_OAUTH_HOST"
] as const;

const JsonWebKeySetSchema = z
  .object({
    keys: z
      .array(
        z
          .object({
            kty: z.literal("RSA"),
            kid: z.string().min(1),
            alg: z.literal("RS256"),
            use: z.literal("sig"),
            n: z.string().min(1),
            e: z.string().min(1),
            d: z.string().min(1)
          })
          .passthrough()
      )
      .min(1)
  })
  .strict();

export interface OpenAiPluginRuntimeConfig {
  oauthEnabled: boolean;
  hostedMcpEnabled: boolean;
  reviewerAccessEnabled: boolean;
  dbPoolMax: number;
  mcpMaxConcurrentRequests: number;
  dashboardBaseUrl?: string;
  privateJwks?: { keys: Array<Record<string, unknown>> };
  cookieKeys?: string[];
  adapterEncryptionKey?: string;
  domainVerificationToken?: string;
  reviewer?: {
    credentialHash: string;
    expiresAt: string;
    userId: string;
    organizationId: string;
    projectId: string;
  };
}

function parseFlag(value: string | undefined, key: string): boolean {
  if (value === undefined || value.trim() === "" || value === "false") {
    return false;
  }
  if (value === "true") {
    return true;
  }
  throw new Error(`openai_plugin_runtime_config_invalid:${key}`);
}

function parseInteger(value: string | undefined, fallback: number, key: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`openai_plugin_runtime_config_invalid:${key}`);
  }
  return parsed;
}

function requireHttpsOrigin(value: string | undefined, key: string): string {
  if (value === undefined) {
    throw new Error(`openai_plugin_runtime_config_invalid:${key}`);
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      url.pathname !== "/"
    ) {
      throw new Error("invalid");
    }
    return url.origin;
  } catch {
    throw new Error(`openai_plugin_runtime_config_invalid:${key}`);
  }
}

function parsePrivateJwks(value: string | undefined): {
  keys: Array<Record<string, unknown>>;
} {
  if (value === undefined) {
    throw new Error("openai_plugin_runtime_config_invalid:OPENAI_OAUTH_PRIVATE_JWKS_JSON");
  }
  try {
    return JsonWebKeySetSchema.parse(JSON.parse(value)) as {
      keys: Array<Record<string, unknown>>;
    };
  } catch {
    throw new Error("openai_plugin_runtime_config_invalid:OPENAI_OAUTH_PRIVATE_JWKS_JSON");
  }
}

function parseCookieKeys(value: string | undefined): string[] {
  const keys = (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (
    keys.length < 2 ||
    new Set(keys).size !== keys.length ||
    keys.some((key) => key.length < 32)
  ) {
    throw new Error("openai_plugin_runtime_config_invalid:OPENAI_OAUTH_COOKIE_KEYS");
  }
  return keys;
}

function requireAdapterEncryptionKey(value: string | undefined): string {
  if (value === undefined || value.trim().length < 32) {
    throw new Error("openai_plugin_runtime_config_invalid:OPENAI_OAUTH_ADAPTER_ENCRYPTION_KEY");
  }
  return value.trim();
}

function parseDomainVerificationToken(value: string | undefined): string | undefined {
  const token = value?.trim();
  if (token === undefined || token.length === 0) {
    return undefined;
  }
  if (!/^[A-Za-z0-9_-]{20,512}$/.test(token)) {
    throw new Error("openai_plugin_runtime_config_invalid:OPENAI_APPS_CHALLENGE_TOKEN");
  }
  return token;
}

function parseReviewerConfig(
  env: Record<string, string | undefined>
): NonNullable<OpenAiPluginRuntimeConfig["reviewer"]> {
  const parsed = z
    .object({
      credentialHash: z.string().min(32),
      expiresAt: z.string().datetime(),
      userId: z.string().uuid(),
      organizationId: z.string().uuid(),
      projectId: z.string().uuid()
    })
    .safeParse({
      credentialHash: env["OPENAI_REVIEWER_CREDENTIAL_HASH"],
      expiresAt: env["OPENAI_REVIEWER_CREDENTIAL_EXPIRES_AT"],
      userId: env["OPENAI_REVIEWER_USER_ID"],
      organizationId: env["OPENAI_REVIEWER_ORGANIZATION_ID"],
      projectId: env["OPENAI_REVIEWER_PROJECT_ID"]
    });
  if (
    !parsed.success ||
    !parsed.data.credentialHash.startsWith("$argon2") ||
    new Date(parsed.data.expiresAt).getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1_000
  ) {
    throw new Error("openai_plugin_runtime_config_invalid:OPENAI_REVIEWER_ACCESS");
  }
  return parsed.data;
}

export function resolveOpenAiMcpConcurrency(input: {
  dbPoolMax: number;
  requested?: number;
}): number {
  const requested = input.requested ?? OPENAI_MCP_DEFAULT_CONCURRENCY;
  const available = input.dbPoolMax - OPENAI_PRIMARY_DB_RESERVE;
  if (
    !Number.isInteger(input.dbPoolMax) ||
    !Number.isInteger(requested) ||
    requested < 1 ||
    requested > OPENAI_MCP_MAX_CONCURRENCY ||
    available < requested
  ) {
    throw new Error("openai_mcp_database_reserve_invalid");
  }
  return requested;
}

export function parseOpenAiPluginRuntimeConfig(
  env: Record<string, string | undefined>
): OpenAiPluginRuntimeConfig {
  for (const key of FORBIDDEN_ORIGIN_ENV_KEYS) {
    if (env[key] !== undefined) {
      throw new Error(`openai_plugin_public_origin_not_configurable:${key}`);
    }
  }

  const oauthEnabled = parseFlag(env["OPENAI_OAUTH_ENABLED"], "OPENAI_OAUTH_ENABLED");
  const hostedMcpEnabled = parseFlag(env["HOSTED_MCP_ENABLED"], "HOSTED_MCP_ENABLED");
  const reviewerAccessEnabled = parseFlag(
    env["OPENAI_REVIEWER_ACCESS_ENABLED"],
    "OPENAI_REVIEWER_ACCESS_ENABLED"
  );
  const dbPoolMax = parseInteger(env["DB_POOL_MAX"], 10, "DB_POOL_MAX");
  const requestedConcurrency = parseInteger(
    env["OPENAI_MCP_MAX_CONCURRENT_REQUESTS"],
    OPENAI_MCP_DEFAULT_CONCURRENCY,
    "OPENAI_MCP_MAX_CONCURRENT_REQUESTS"
  );
  const mcpMaxConcurrentRequests = hostedMcpEnabled
    ? resolveOpenAiMcpConcurrency({ dbPoolMax, requested: requestedConcurrency })
    : OPENAI_MCP_DEFAULT_CONCURRENCY;

  if ((hostedMcpEnabled || reviewerAccessEnabled) && !oauthEnabled) {
    throw new Error("openai_plugin_runtime_config_invalid:OPENAI_OAUTH_ENABLED");
  }
  if (!oauthEnabled) {
    return {
      oauthEnabled,
      hostedMcpEnabled,
      reviewerAccessEnabled,
      dbPoolMax,
      mcpMaxConcurrentRequests
    };
  }
  const domainVerificationToken = parseDomainVerificationToken(env["OPENAI_APPS_CHALLENGE_TOKEN"]);

  return {
    oauthEnabled,
    hostedMcpEnabled,
    reviewerAccessEnabled,
    dbPoolMax,
    mcpMaxConcurrentRequests,
    dashboardBaseUrl: requireHttpsOrigin(env["APP_BASE_URL"], "APP_BASE_URL"),
    privateJwks: parsePrivateJwks(env["OPENAI_OAUTH_PRIVATE_JWKS_JSON"]),
    cookieKeys: parseCookieKeys(env["OPENAI_OAUTH_COOKIE_KEYS"]),
    adapterEncryptionKey: requireAdapterEncryptionKey(env["OPENAI_OAUTH_ADAPTER_ENCRYPTION_KEY"]),
    ...(domainVerificationToken === undefined ? {} : { domainVerificationToken }),
    ...(reviewerAccessEnabled ? { reviewer: parseReviewerConfig(env) } : {})
  };
}

function requireEnabledConfig(
  config: OpenAiPluginRuntimeConfig
): asserts config is OpenAiPluginRuntimeConfig & {
  dashboardBaseUrl: string;
  privateJwks: { keys: Array<Record<string, unknown>> };
  cookieKeys: string[];
  adapterEncryptionKey: string;
} {
  if (
    config.dashboardBaseUrl === undefined ||
    config.privateJwks === undefined ||
    config.cookieKeys === undefined ||
    config.adapterEncryptionKey === undefined
  ) {
    throw new Error("openai_plugin_runtime_config_invalid");
  }
}

export function createOpenAiPluginServerOptions(input: {
  env: Record<string, string | undefined>;
  db: Queryable;
  hostedReadDependencies: OpenAiHostedReadDependencies;
  rateLimiter: OpenAiMcpAdmissionCoordinator & {
    getOpenAiCimdResponse(url: string): Promise<string | undefined>;
    setOpenAiCimdResponse(url: string, response: string, ttlMs: number): Promise<void>;
    claimOpenAiClientAssertionJti(input: {
      issuer: string;
      jti: string;
      expiresAt: number;
    }): Promise<boolean>;
  };
}): Pick<ApiServerOptions, "openAiMcp" | "openAiOAuth"> {
  const config = parseOpenAiPluginRuntimeConfig(input.env);
  if (!config.oauthEnabled) {
    return {};
  }
  requireEnabledConfig(config);

  const oauthStore = createPostgresOpenAiOAuthStore(input.db, config.adapterEncryptionKey);
  const provider = createOpenAiOidcProvider({
    adapter: createPostgresOidcProviderAdapterFactory(input.db, config.adapterEncryptionKey),
    cimdCache: input.rateLimiter,
    jwks: config.privateJwks,
    cookieKeys: config.cookieKeys,
    claimClientAssertionJti: (request) => input.rateLimiter.claimOpenAiClientAssertionJti(request),
    findVerifiedAccount: async (accountId) => {
      const result = await input.db.query<
        {
          user_id: string;
          email: string;
          email_verified_at: string | null;
        } & Record<string, unknown>
      >(
        `
          SELECT
            id::text AS user_id,
            email,
            email_verified_at::text AS email_verified_at
          FROM users
          WHERE id = $1::uuid
          LIMIT 1
        `,
        [accountId]
      );
      const account = result.rows[0];
      return account === undefined
        ? undefined
        : {
            userId: account.user_id,
            email: account.email,
            emailVerified: account.email_verified_at !== null
          };
    },
    resolveGrantClaims: async (providerGrantId) => {
      const claims = await oauthStore.resolveProviderGrantClaims(providerGrantId);
      return claims === undefined
        ? undefined
        : { grantId: claims.grantId, organizationId: claims.organizationId };
    }
  });
  const consentAccess = createOpenAiConsentAuthorization({
    provider,
    oauthStore,
    reviewerAccessAvailable: config.reviewerAccessEnabled,
    async resolveOrganizationName(request) {
      const result = await input.db.query<{ name: string } & Record<string, unknown>>(
        `
          SELECT o.name
          FROM organizations o
          JOIN organization_members om
            ON om.organization_id = o.id
           AND om.user_id = $1::uuid
          WHERE o.id = $2::uuid
            AND o.suspended_at IS NULL
            AND om.suspended_at IS NULL
          LIMIT 1
        `,
        [request.userId, request.organizationId]
      );
      return result.rows[0]?.name;
    }
  });

  const result: Pick<ApiServerOptions, "openAiMcp" | "openAiOAuth"> = {
    openAiOAuth: {
      expectedHost: "api.debugbundle.com",
      provider,
      consentAccess,
      consentUiBaseUrl: config.dashboardBaseUrl,
      connectionStore: oauthStore,
      rateLimiter: input.rateLimiter,
      maxConcurrentRequests: 16
    }
  };
  if (config.reviewerAccessEnabled) {
    const reviewer = config.reviewer;
    if (reviewer === undefined) {
      throw new Error("openai_plugin_runtime_config_invalid:OPENAI_REVIEWER_ACCESS");
    }
    const auditLogStore = createPostgresAuditLogStore(input.db);
    result.openAiOAuth!.reviewerAccess = createOpenAiReviewerAuthorization({
      provider,
      oauthStore,
      credentialHash: reviewer.credentialHash,
      expiresAt: reviewer.expiresAt,
      userId: reviewer.userId,
      organizationId: reviewer.organizationId,
      boundary: {
        async assertSyntheticBoundary() {
          const boundary = await input.db.query<{ valid: boolean } & Record<string, unknown>>(
            `
              SELECT (
                EXISTS (
                  SELECT 1
                  FROM users u
                  JOIN organization_members om ON om.user_id = u.id
                  JOIN organizations o ON o.id = om.organization_id
                  JOIN projects p ON p.organization_id = o.id
                  WHERE u.id = $1::uuid
                    AND u.email_verified_at IS NOT NULL
                    AND om.organization_id = $2::uuid
                    AND om.suspended_at IS NULL
                    AND o.suspended_at IS NULL
                    AND p.id = $3::uuid
                    AND p.owner_user_id = u.id
                )
                AND NOT EXISTS (
                  SELECT 1 FROM organization_members
                  WHERE user_id = $1::uuid AND organization_id <> $2::uuid
                )
                AND NOT EXISTS (
                  SELECT 1 FROM projects
                  WHERE owner_user_id = $1::uuid AND id <> $3::uuid
                )
                AND NOT EXISTS (
                  SELECT 1 FROM project_members
                  WHERE user_id = $1::uuid AND project_id <> $3::uuid
                )
              ) AS valid
            `,
            [reviewer.userId, reviewer.organizationId, reviewer.projectId]
          );
          if (boundary.rows[0]?.valid !== true) {
            throw new Error("openai_reviewer_synthetic_boundary_invalid");
          }
        },
        async audit(event) {
          await auditLogStore.createAuditLog({
            organization_id: reviewer.organizationId,
            actor_user_id: event.status === "success" ? reviewer.userId : null,
            actor_type: event.status === "success" ? "system" : "anonymous",
            action: `openai_reviewer.${event.action}`,
            target_type: "openai_reviewer_project",
            target_id: reviewer.projectId,
            status: event.status,
            ip_address: null,
            metadata: { synthetic_only: true },
            occurred_at: new Date().toISOString()
          });
        }
      }
    });
    result.openAiOAuth!.reviewerCredentialExpiresAt = reviewer.expiresAt;
  }
  if (config.hostedMcpEnabled) {
    result.openAiMcp = {
      expectedHost: "mcp.debugbundle.com",
      verifier: createOpenAiAccessTokenVerifier({
        jwks: config.privateJwks,
        isGrantActive: (request) => oauthStore.isGrantActive(request)
      }),
      operations: createOpenAiHostedOperations({
        dependencies: input.hostedReadDependencies,
        dashboardBaseUrl: config.dashboardBaseUrl
      }),
      rateLimiter: input.rateLimiter,
      maxConcurrentRequests: config.mcpMaxConcurrentRequests,
      maxConcurrentRequestsPerGrant: 2,
      operationTimeoutMs: 24_000,
      ...(config.domainVerificationToken === undefined
        ? {}
        : { domainVerificationToken: config.domainVerificationToken }),
      readinessCheck: async () => {
        await input.db.query("SELECT 1 AS openai_mcp_ready", []);
        if (input.rateLimiter.checkAvailability === undefined) {
          throw new Error("openai_mcp_coordination_check_unavailable");
        }
        await input.rateLimiter.checkAvailability();
      }
    };
  }
  return result;
}
