import { randomBytes } from "node:crypto";

import { exportJWK, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  createOpenAiPluginServerOptions,
  parseOpenAiPluginRuntimeConfig,
  resolveOpenAiMcpConcurrency
} from "../../../apps/api/src/openai-plugin-runtime.js";
import { resolveApiDatabasePoolMax } from "../../../apps/api/src/default-dependencies-env.js";

const PRIVATE_JWKS = JSON.stringify({
  keys: [
    {
      kty: "RSA",
      kid: "openai-signing-2026-08",
      alg: "RS256",
      use: "sig",
      n: "test-modulus",
      e: "AQAB",
      d: "test-private-exponent"
    }
  ]
});
let runtimePrivateJwks = PRIVATE_JWKS;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  const privateJwk = await exportJWK(pair.privateKey);
  runtimePrivateJwks = JSON.stringify({
    keys: [{ ...privateJwk, kid: "runtime-key", alg: "RS256", use: "sig" }]
  });
});

function enabledEnv(): Record<string, string> {
  return {
    OPENAI_OAUTH_ENABLED: "true",
    HOSTED_MCP_ENABLED: "true",
    OPENAI_REVIEWER_ACCESS_ENABLED: "false",
    OPENAI_OAUTH_PRIVATE_JWKS_JSON: PRIVATE_JWKS,
    OPENAI_OAUTH_COOKIE_KEYS: [
      "new-cookie-key-at-least-thirty-two-bytes",
      "old-cookie-key-at-least-thirty-two-bytes"
    ].join(","),
    OPENAI_OAUTH_ADAPTER_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
    OPENAI_APPS_CHALLENGE_TOKEN: "portal_challenge_token_123456789",
    APP_BASE_URL: "https://app.debugbundle.com",
    DB_POOL_MAX: "10"
  };
}

describe("OpenAI plugin runtime configuration", () => {
  it("keeps every surface dark by default without requiring secrets", () => {
    expect(parseOpenAiPluginRuntimeConfig({})).toEqual({
      oauthEnabled: false,
      hostedMcpEnabled: false,
      reviewerAccessEnabled: false,
      dbPoolMax: 10,
      mcpMaxConcurrentRequests: 2
    });
  });

  it("parses the complete fail-closed production profile", () => {
    const config = parseOpenAiPluginRuntimeConfig(enabledEnv());
    expect(config).toMatchObject({
      oauthEnabled: true,
      hostedMcpEnabled: true,
      reviewerAccessEnabled: false,
      dashboardBaseUrl: "https://app.debugbundle.com",
      dbPoolMax: 10,
      mcpMaxConcurrentRequests: 2,
      domainVerificationToken: "portal_challenge_token_123456789",
      cookieKeys: [
        "new-cookie-key-at-least-thirty-two-bytes",
        "old-cookie-key-at-least-thirty-two-bytes"
      ]
    });
    expect(config.privateJwks?.keys).toHaveLength(1);
  });

  it("rejects partial activation, overrideable public origins, and unsafe pool budgets", () => {
    expect(() => parseOpenAiPluginRuntimeConfig({ OPENAI_OAUTH_ENABLED: "yes" })).toThrow(
      "openai_plugin_runtime_config_invalid:OPENAI_OAUTH_ENABLED"
    );
    expect(() => parseOpenAiPluginRuntimeConfig({ HOSTED_MCP_ENABLED: "true" })).toThrow(
      "openai_plugin_runtime_config_invalid"
    );
    expect(() =>
      parseOpenAiPluginRuntimeConfig({
        ...enabledEnv(),
        OPENAI_MCP_ISSUER: "https://attacker.example"
      })
    ).toThrow("openai_plugin_public_origin_not_configurable");
    expect(() => parseOpenAiPluginRuntimeConfig({ ...enabledEnv(), DB_POOL_MAX: "7" })).toThrow(
      "openai_mcp_database_reserve_invalid"
    );
  });

  it("validates the complete temporary reviewer lifecycle configuration", () => {
    const reviewerEnv = {
      ...enabledEnv(),
      OPENAI_REVIEWER_ACCESS_ENABLED: "true",
      OPENAI_REVIEWER_CREDENTIAL_HASH:
        "$argon2id$v=19$m=65536,t=3,p=1$fixture-salt$fixture-credential-hash",
      OPENAI_REVIEWER_CREDENTIAL_EXPIRES_AT: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1_000
      ).toISOString(),
      OPENAI_REVIEWER_USER_ID: "10000000-0000-4000-8000-000000000001",
      OPENAI_REVIEWER_ORGANIZATION_ID: "20000000-0000-4000-8000-000000000002",
      OPENAI_REVIEWER_PROJECT_ID: "30000000-0000-4000-8000-000000000003"
    };

    expect(parseOpenAiPluginRuntimeConfig(reviewerEnv).reviewer).toEqual({
      credentialHash: reviewerEnv.OPENAI_REVIEWER_CREDENTIAL_HASH,
      expiresAt: reviewerEnv.OPENAI_REVIEWER_CREDENTIAL_EXPIRES_AT,
      userId: reviewerEnv.OPENAI_REVIEWER_USER_ID,
      organizationId: reviewerEnv.OPENAI_REVIEWER_ORGANIZATION_ID,
      projectId: reviewerEnv.OPENAI_REVIEWER_PROJECT_ID
    });

    expect(() =>
      parseOpenAiPluginRuntimeConfig({
        ...reviewerEnv,
        OPENAI_REVIEWER_CREDENTIAL_EXPIRES_AT: new Date(
          Date.now() + 24 * 60 * 60 * 1_000
        ).toISOString()
      })
    ).toThrow("openai_plugin_runtime_config_invalid:OPENAI_REVIEWER_ACCESS");
    expect(() =>
      parseOpenAiPluginRuntimeConfig({
        ...reviewerEnv,
        OPENAI_REVIEWER_CREDENTIAL_HASH: "not-an-argon2-reviewer-credential-hash"
      })
    ).toThrow("openai_plugin_runtime_config_invalid:OPENAI_REVIEWER_ACCESS");
  });

  it("derives the MCP bulkhead from the configured database pool", () => {
    expect(resolveApiDatabasePoolMax({})).toBe(10);
    expect(resolveApiDatabasePoolMax({ DB_POOL_MAX: "12" })).toBe(12);
    expect(() => resolveApiDatabasePoolMax({ DB_POOL_MAX: "unbounded" })).toThrow(
      "api_database_pool_max_invalid"
    );
    expect(resolveOpenAiMcpConcurrency({ dbPoolMax: 10 })).toBe(2);
    expect(resolveOpenAiMcpConcurrency({ dbPoolMax: 12, requested: 4 })).toBe(4);
    expect(() => resolveOpenAiMcpConcurrency({ dbPoolMax: 9, requested: 4 })).toThrow(
      "openai_mcp_database_reserve_invalid"
    );
  });

  it("composes OAuth and the hosted MCP route from the same bounded runtime resources", async () => {
    const env = enabledEnv();
    env["OPENAI_OAUTH_PRIVATE_JWKS_JSON"] = runtimePrivateJwks;
    const options = createOpenAiPluginServerOptions({
      env,
      db: { query: vi.fn(async () => ({ rows: [] })) },
      hostedReadDependencies: {
        projectManagement: {
          resolveProjectAccessForUser: vi.fn(),
          listProjectsForUser: vi.fn()
        },
        incidentRetrieval: {
          listIncidentsForOrganization: vi.fn(),
          getIncidentForOrganization: vi.fn(),
          listServicesForOrganization: vi.fn()
        },
        improvementManagement: {
          listImprovementsForOrganization: vi.fn(),
          getImprovementForOrganization: vi.fn()
        },
        availabilityCheckManagement: {
          listChecksForProjectInOrganization: vi.fn(),
          getCheckForProjectInOrganization: vi.fn(),
          listResultsForCheckInOrganization: vi.fn(),
          listDailyRollupsForCheckInOrganization: vi.fn()
        },
        analyticsMetrics: {
          getUsageSummary: vi.fn(),
          getRouteMetrics: vi.fn(),
          getJourneyPatterns: vi.fn(),
          getDeviceBreakdown: vi.fn(),
          getReferrerMetrics: vi.fn(),
          getActionMetrics: vi.fn(),
          listFunnels: vi.fn(),
          getFunnelAnalysis: vi.fn(),
          getIncidentImpact: vi.fn()
        },
        objectStoreReader: { getObject: vi.fn() }
      },
      rateLimiter: {
        acquireConcurrency: vi.fn(async () => ({
          acquired: true,
          lease_id: "lease_1",
          retry_after_ms: 0
        })),
        claimRequest: vi.fn(async () => ({ allowed: true, retry_after_ms: 0 })),
        claimOpenAiClientAssertionJti: vi.fn(async () => true),
        checkAvailability: vi.fn(async () => undefined),
        getOpenAiCimdResponse: vi.fn(async () => undefined),
        releaseConcurrency: vi.fn(async () => undefined),
        setOpenAiCimdResponse: vi.fn(async () => undefined)
      }
    });

    expect(options.openAiOAuth).toMatchObject({
      expectedHost: "api.debugbundle.com",
      maxConcurrentRequests: 16
    });
    expect(options.openAiMcp).toMatchObject({
      expectedHost: "mcp.debugbundle.com",
      maxConcurrentRequests: 2,
      maxConcurrentRequestsPerGrant: 2,
      operationTimeoutMs: 24_000,
      domainVerificationToken: "portal_challenge_token_123456789"
    });
    await expect(options.openAiMcp!.readinessCheck!()).resolves.toBeUndefined();
  });
});
