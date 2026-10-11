import { exportJWK, generateKeyPair } from "jose";
import { describe, expect, it, vi } from "vitest";

import {
  OPENAI_ACCESS_TOKEN_TTL_SECONDS,
  OPENAI_AUTHORIZATION_CODE_TTL_SECONDS,
  OPENAI_CIMD_CLIENT_ID,
  OPENAI_HOSTED_MCP_SCOPES,
  OPENAI_MCP_ISSUER,
  OPENAI_MCP_RESOURCE,
  OPENAI_OIDC_SCOPES,
  OPENAI_PRODUCTION_REDIRECT_URI,
  OPENAI_REFRESH_TOKEN_TTL_SECONDS,
  buildOpenAiAuthorizationServerMetadata,
  buildOpenAiOidcConfiguration,
  buildOpenAiProtectedResourceMetadata,
  createOpenAiOidcProvider,
  isAllowedOpenAiCimdClient,
  isAllowedOpenAiCimdFetchUrl,
  resolveOpenAiAccount
} from "../../../packages/auth/src/index.js";

describe("OpenAI OAuth/OIDC provider profile", () => {
  it("publishes exact, mutually consistent issuer/resource metadata", () => {
    expect(buildOpenAiProtectedResourceMetadata()).toEqual({
      resource: OPENAI_MCP_RESOURCE,
      authorization_servers: [OPENAI_MCP_ISSUER],
      scopes_supported: [
        "debugbundle:projects:read",
        "debugbundle:incidents:read",
        "debugbundle:artifacts:read",
        "debugbundle:improvements:read",
        "debugbundle:analytics:read",
        "debugbundle:health:read"
      ],
      resource_documentation: "https://debugbundle.com/docs/mcp/openai-plugin"
    });

    expect(buildOpenAiAuthorizationServerMetadata()).toMatchObject({
      issuer: OPENAI_MCP_ISSUER,
      authorization_endpoint: `${OPENAI_MCP_ISSUER}/oauth/authorize`,
      token_endpoint: `${OPENAI_MCP_ISSUER}/oauth/token`,
      revocation_endpoint: `${OPENAI_MCP_ISSUER}/oauth/revoke`,
      userinfo_endpoint: `${OPENAI_MCP_ISSUER}/oauth/userinfo`,
      jwks_uri: `${OPENAI_MCP_ISSUER}/oauth/jwks.json`,
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: true,
      token_endpoint_auth_methods_supported: ["private_key_jwt"],
      code_challenge_methods_supported: ["S256"]
    });
  });

  it("configures the maintained provider for exact lifetimes, PKCE, CIMD, OIDC, and one resource", async () => {
    const claimClientAssertionJti = vi.fn(async () => true);
    const configuration = buildOpenAiOidcConfiguration({
      adapter: vi.fn(),
      cimdCache: {
        getOpenAiCimdResponse: vi.fn(),
        setOpenAiCimdResponse: vi.fn()
      },
      jwks: { keys: [{ kty: "RSA", kid: "test", n: "n", e: "AQAB", d: "d" }] },
      cookieKeys: ["test-cookie-key-at-least-thirty-two-bytes"],
      findVerifiedAccount: vi.fn(),
      claimClientAssertionJti,
      resolveGrantClaims: vi.fn()
    });

    expect(configuration.ttl).toMatchObject({
      AuthorizationCode: OPENAI_AUTHORIZATION_CODE_TTL_SECONDS,
      AccessToken: OPENAI_ACCESS_TOKEN_TTL_SECONDS,
      RefreshToken: OPENAI_REFRESH_TOKEN_TTL_SECONDS
    });
    expect(configuration.pkce.required()).toBe(true);
    expect(configuration.features.clientIdMetadataDocument).toMatchObject({
      enabled: true,
      ack: "draft-02"
    });
    expect(configuration.features.registration).toEqual({ enabled: false });
    expect(configuration.features.devInteractions).toEqual({ enabled: false });
    expect(configuration.rotateRefreshToken).toBe(true);
    expect(configuration.formats).toEqual({ AccessToken: "jwt" });
    expect(configuration.scopes).toEqual(OPENAI_OIDC_SCOPES);
    expect(
      configuration.features.resourceIndicators.getResourceServerInfo({}, OPENAI_MCP_RESOURCE)
    ).toMatchObject({ scope: OPENAI_HOSTED_MCP_SCOPES.join(" ") });
    expect(configuration.routes.authorization).toBe("/oauth/authorize");
    const policy = configuration.interactions.policy;
    expect(policy.map((prompt) => prompt.name)).toEqual(["login"]);
    expect(policy[0]?.checks.map((check) => check.reason)).toEqual(
      expect.arrayContaining(["no_session", "op_scopes_missing", "rs_scopes_missing"])
    );
    for (const reason of ["op_scopes_missing", "op_claims_missing", "rs_scopes_missing"]) {
      const check = policy[0]?.checks.find((candidate) => candidate.reason === reason);
      expect(check).toBeDefined();
      await expect(Promise.resolve().then(() => check?.check({ oidc: {} }))).resolves.toBe(true);
      await expect(
        Promise.resolve().then(() =>
          check?.check({
            oidc: {
              grant: {
                getOIDCScopeEncountered: () => OPENAI_OIDC_SCOPES.join(" "),
                getOIDCClaimsEncountered: () => [],
                getResourceScopeEncountered: () => OPENAI_HOSTED_MCP_SCOPES.join(" ")
              },
              requestParamOIDCScopes: OPENAI_OIDC_SCOPES,
              requestParamClaims: [],
              resourceServers: {
                [OPENAI_MCP_RESOURCE]: { scopes: new Set(OPENAI_HOSTED_MCP_SCOPES) }
              },
              requestParamScopes: OPENAI_HOSTED_MCP_SCOPES
            }
          })
        )
      ).resolves.toBe(false);
    }
    await expect(
      configuration.features.clientIdMetadataDocument.allowClient(
        {},
        {
          client_id: 42,
          redirect_uris: [OPENAI_PRODUCTION_REDIRECT_URI, 42],
          token_endpoint_auth_method: null
        }
      )
    ).resolves.toBe(false);
    await expect(
      configuration.features.clientIdMetadataDocument.allowClient(
        {},
        {
          clientId: OPENAI_CIMD_CLIENT_ID,
          redirectUris: [OPENAI_PRODUCTION_REDIRECT_URI],
          tokenEndpointAuthMethod: "private_key_jwt",
          jwksUri: "https://chatgpt.com/oauth/jwks.json",
          tokenEndpointAuthSigningAlg: "RS256"
        }
      )
    ).resolves.toBe(true);

    const now = Math.floor(Date.now() / 1_000);
    await expect(
      configuration.assertJwtClientAuthClaimsAndHeader(
        {},
        {
          iss: OPENAI_CIMD_CLIENT_ID,
          sub: OPENAI_CIMD_CLIENT_ID,
          aud: "https://api.debugbundle.com/oauth/token",
          iat: now,
          exp: now + 300,
          jti: "assertion-jti"
        },
        { alg: "RS256", kid: "openai-key" },
        { clientId: OPENAI_CIMD_CLIENT_ID }
      )
    ).resolves.toBeUndefined();
    expect(claimClientAssertionJti).toHaveBeenCalledWith({
      issuer: OPENAI_CIMD_CLIENT_ID,
      jti: "assertion-jti",
      expiresAt: now + 315
    });
  });

  it.each([
    { field: "iss", value: "https://attacker.example/client.json" },
    { field: "sub", value: "https://attacker.example/client.json" },
    { field: "aud", value: "https://api.debugbundle.com" },
    { field: "exp", value: null },
    { field: "kid", value: "" }
  ])("rejects non-exact private_key_jwt assertion field $field", async ({ field, value }) => {
    const now = Math.floor(Date.now() / 1_000);
    const configuration = buildOpenAiOidcConfiguration({
      adapter: vi.fn(),
      cimdCache: {
        getOpenAiCimdResponse: vi.fn(),
        setOpenAiCimdResponse: vi.fn()
      },
      jwks: { keys: [{ kty: "RSA", kid: "test", n: "n", e: "AQAB", d: "d" }] },
      cookieKeys: ["test-cookie-key-at-least-thirty-two-bytes"],
      findVerifiedAccount: vi.fn(),
      claimClientAssertionJti: vi.fn(async () => true),
      resolveGrantClaims: vi.fn()
    });
    const claims: Record<string, unknown> = {
      iss: OPENAI_CIMD_CLIENT_ID,
      sub: OPENAI_CIMD_CLIENT_ID,
      aud: "https://api.debugbundle.com/oauth/token",
      iat: now,
      exp: now + 300,
      jti: "assertion-jti"
    };
    const header: Record<string, unknown> = { alg: "RS256", kid: "openai-key" };
    (field === "kid" ? header : claims)[field] = field === "exp" ? now + 301 : value;

    await expect(
      configuration.assertJwtClientAuthClaimsAndHeader({}, claims, header, {
        clientId: OPENAI_CIMD_CLIENT_ID
      })
    ).rejects.toThrow("invalid_client");
  });

  it("rejects a replayed client assertion through the external atomic jti store", async () => {
    const now = Math.floor(Date.now() / 1_000);
    const configuration = buildOpenAiOidcConfiguration({
      adapter: vi.fn(),
      cimdCache: {
        getOpenAiCimdResponse: vi.fn(),
        setOpenAiCimdResponse: vi.fn()
      },
      jwks: { keys: [{ kty: "RSA", kid: "test", n: "n", e: "AQAB", d: "d" }] },
      cookieKeys: ["test-cookie-key-at-least-thirty-two-bytes"],
      findVerifiedAccount: vi.fn(),
      claimClientAssertionJti: vi.fn(async () => false),
      resolveGrantClaims: vi.fn()
    });

    await expect(
      configuration.assertJwtClientAuthClaimsAndHeader(
        {},
        {
          iss: OPENAI_CIMD_CLIENT_ID,
          sub: OPENAI_CIMD_CLIENT_ID,
          aud: "https://api.debugbundle.com/oauth/token",
          iat: now,
          exp: now + 300,
          jti: "replayed-jti"
        },
        { alg: "RS256", kid: "openai-key" },
        { clientId: OPENAI_CIMD_CLIENT_ID }
      )
    ).rejects.toThrow("invalid_client");
  });

  it("allows only the exact OpenAI CIMD client shape", () => {
    expect(isAllowedOpenAiCimdFetchUrl(OPENAI_CIMD_CLIENT_ID)).toBe(true);
    expect(isAllowedOpenAiCimdFetchUrl("https://attacker.example/client.json")).toBe(false);
    expect(
      isAllowedOpenAiCimdClient({
        clientId: OPENAI_CIMD_CLIENT_ID,
        redirectUris: [OPENAI_PRODUCTION_REDIRECT_URI],
        clientAuthMethod: "private_key_jwt"
      })
    ).toBe(true);
    expect(
      isAllowedOpenAiCimdClient({
        clientId: OPENAI_CIMD_CLIENT_ID,
        redirectUris: ["https://attacker.example/callback"],
        clientAuthMethod: "private_key_jwt"
      })
    ).toBe(false);
    expect(
      isAllowedOpenAiCimdClient({
        clientId: "https://attacker.example/client.json",
        redirectUris: [OPENAI_PRODUCTION_REDIRECT_URI],
        clientAuthMethod: "private_key_jwt"
      })
    ).toBe(false);
  });

  it("returns only verified minimal UserInfo claims", async () => {
    const account = await resolveOpenAiAccount("user_1", async () => ({
      userId: "user_1",
      email: " Member@Example.com ",
      emailVerified: true
    }));

    await expect(account?.claims()).resolves.toEqual({
      sub: "user_1",
      email: "member@example.com",
      email_verified: true
    });
    await expect(
      resolveOpenAiAccount("user_2", async () => ({
        userId: "user_2",
        email: "member@example.com",
        emailVerified: false
      }))
    ).resolves.toBeUndefined();
  });

  it("constructs the pinned provider with a production adapter and rotating cookie keys", async () => {
    const pair = await generateKeyPair("RS256", { extractable: true });
    const privateJwk = await exportJWK(pair.privateKey);
    class TestAdapter {
      constructor(model: string) {
        void model;
      }
    }

    const provider = createOpenAiOidcProvider({
      adapter: TestAdapter,
      cimdCache: {
        getOpenAiCimdResponse: vi.fn(),
        setOpenAiCimdResponse: vi.fn()
      },
      jwks: { keys: [{ ...privateJwk, kid: "provider-key", alg: "RS256", use: "sig" }] },
      cookieKeys: [
        "new-cookie-key-at-least-thirty-two-bytes",
        "old-cookie-key-at-least-thirty-two-bytes"
      ],
      findVerifiedAccount: vi.fn(),
      claimClientAssertionJti: vi.fn(async () => true),
      resolveGrantClaims: vi.fn()
    });

    expect(provider.callback()).toEqual(expect.any(Function));
  });

  it("keeps token claims minimal and refuses resources outside the approved audience", async () => {
    const findVerifiedAccount = vi.fn(async (accountId: string) =>
      accountId === "verified-user"
        ? { userId: accountId, email: "synthetic@example.test", emailVerified: true }
        : undefined
    );
    const resolveGrantClaims = vi.fn(
      async () =>
        undefined as { grantId: string; organizationId: string; email?: string } | undefined
    );
    const configuration = buildOpenAiOidcConfiguration({
      adapter: vi.fn(),
      cimdCache: { getOpenAiCimdResponse: vi.fn(), setOpenAiCimdResponse: vi.fn() },
      jwks: { keys: [] },
      cookieKeys: ["synthetic-cookie-key"],
      findVerifiedAccount,
      claimClientAssertionJti: vi.fn(async () => true),
      resolveGrantClaims
    });
    const resource = configuration.features.resourceIndicators;
    await expect(
      configuration.features.clientIdMetadataDocument.allowFetch({}, OPENAI_CIMD_CLIENT_ID)
    ).resolves.toBe(true);
    await expect(
      configuration.features.clientIdMetadataDocument.allowFetch(
        {},
        "https://attacker.example/client.json"
      )
    ).resolves.toBe(false);
    expect(configuration.interactions.url({}, { uid: "interaction/with?delimiters" })).toBe(
      "/oauth/interaction/interaction%2Fwith%3Fdelimiters"
    );
    await expect(configuration.findAccount({}, "missing-user")).resolves.toBeUndefined();
    const verifiedAccount = await configuration.findAccount({}, "verified-user");
    await expect(verifiedAccount?.claims()).resolves.toEqual({
      sub: "verified-user",
      email: "synthetic@example.test",
      email_verified: true
    });
    expect(resource.defaultResource()).toBe(OPENAI_MCP_RESOURCE);
    expect(resource.useGrantedResource()).toBe(true);
    expect(() =>
      resource.getResourceServerInfo({}, "https://mcp.debugbundle.com/muse/mcp")
    ).toThrow("invalid_target");
    expect(configuration.issueRefreshToken()).toBe(true);
    await expect(configuration.extraTokenClaims({}, {})).resolves.toEqual({
      nbf: expect.any(Number)
    });
    expect(resolveGrantClaims).not.toHaveBeenCalled();
    await expect(
      configuration.extraTokenClaims({}, { grantId: "missing-provider-grant" })
    ).resolves.toEqual({ nbf: expect.any(Number) });
    resolveGrantClaims.mockResolvedValue({
      grantId: "normalized-grant",
      organizationId: "organization",
      email: "synthetic@example.test"
    });
    await expect(
      configuration.extraTokenClaims({}, { grantId: "valid-provider-grant" })
    ).resolves.toEqual({
      grant_id: "normalized-grant",
      organization_id: "organization",
      nbf: expect.any(Number)
    });
  });

  it.each(["", "invalid-email"])(
    "rejects an unusable verified identity email: %j",
    async (email) => {
      await expect(
        resolveOpenAiAccount("synthetic-user", async () => ({
          userId: "synthetic-user",
          email,
          emailVerified: true
        }))
      ).resolves.toBeUndefined();
    }
  );
});
