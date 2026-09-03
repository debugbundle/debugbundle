import { PassThrough } from "node:stream";

import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { exportJWK, generateKeyPair } from "jose";
import type Provider from "oidc-provider";
import pino from "pino";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createOpenAiOidcProvider } from "../../../packages/auth/src/index.js";
import { registerOpenAiOAuthHttpRoutes } from "../../../apps/api/src/openai-oauth-http.js";

let provider: Provider;
const apps: FastifyInstance[] = [];
const CANONICAL_HEADERS = {
  host: "api.debugbundle.com",
  "x-forwarded-host": "api.debugbundle.com",
  "x-forwarded-proto": "https",
  "x-debugbundle-surface": "openai-oauth"
};

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  const privateJwk = await exportJWK(pair.privateKey);
  class TestAdapter {
    constructor(model: string) {
      void model;
    }
  }
  provider = createOpenAiOidcProvider({
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
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function createApp(): FastifyInstance {
  const app = Fastify();
  apps.push(app);
  registerOpenAiOAuthHttpRoutes(app, {
    expectedHost: "api.debugbundle.com",
    provider
  });
  return app;
}

function captureLogger(): { logger: FastifyBaseLogger; read: () => string } {
  const stream = new PassThrough();
  let output = "";
  stream.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  return {
    logger: pino({ level: "info" }, stream) as FastifyBaseLogger,
    read: () => output
  };
}

describe("OpenAI OAuth HTTP boundary", () => {
  it("redirects browser interactions to the approved UI and keeps JSON decisions on the API origin", async () => {
    const describeInteraction = vi.fn(async () => ({
      interaction_id: "interaction_123",
      client_name: "ChatGPT and Codex" as const,
      publisher: "OpenAI" as const,
      organization_name: "Acme Engineering",
      identity_scopes: ["openid", "email"] as ["openid", "email"],
      product_scopes: ["debugbundle:projects:read"],
      reviewer_access_available: true
    }));
    const complete = vi.fn(async () => ({
      continueUrl: "https://api.debugbundle.com/oauth/authorize/resume"
    }));
    const resolveBrowserSession = vi.fn(async () => ({
      userId: "user_1",
      organizationId: "org_1",
      emailVerified: true
    }));
    const app = Fastify();
    apps.push(app);
    registerOpenAiOAuthHttpRoutes(
      app,
      {
        expectedHost: "api.debugbundle.com",
        provider,
        consentUiBaseUrl: "https://app.debugbundle.com",
        consentAccess: { describe: describeInteraction, complete }
      },
      { resolveBrowserSession }
    );

    const browser = await app.inject({
      method: "GET",
      url: "/oauth/interaction/interaction_123",
      headers: CANONICAL_HEADERS
    });
    expect(browser.statusCode).toBe(303);
    expect(browser.headers.location).toBe(
      "https://app.debugbundle.com/oauth/consent?interaction=interaction_123"
    );
    expect(describeInteraction).not.toHaveBeenCalled();

    const interaction = await app.inject({
      method: "GET",
      url: "/oauth/interaction/interaction_123",
      headers: {
        ...CANONICAL_HEADERS,
        accept: "application/json",
        cookie: "dbundle_session=secret"
      }
    });
    expect(interaction.statusCode).toBe(200);
    expect(interaction.headers["cache-control"]).toBe("no-store");
    expect(interaction.json()).toMatchObject({
      interaction: { interaction_id: "interaction_123", organization_name: "Acme Engineering" }
    });
    expect(resolveBrowserSession).toHaveBeenCalledWith("dbundle_session=secret");
    expect(describeInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        session: { userId: "user_1", organizationId: "org_1", emailVerified: true }
      })
    );

    const decision = await app.inject({
      method: "POST",
      url: "/oauth/interaction/interaction_123",
      headers: { ...CANONICAL_HEADERS, cookie: "dbundle_session=secret" },
      payload: {
        decision: "allow",
        product_scopes: ["debugbundle:projects:read"]
      }
    });
    expect(decision.statusCode).toBe(200);
    expect(decision.json()).toEqual({
      continue_url: "https://api.debugbundle.com/oauth/authorize/resume"
    });
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        interactionId: "interaction_123",
        decision: "allow",
        productScopes: ["debugbundle:projects:read"],
        session: { userId: "user_1", organizationId: "org_1", emailVerified: true }
      })
    );
  });

  it("rate-limits consent interactions with bounded retry guidance", async () => {
    const claimRequest = vi.fn().mockResolvedValue({
      allowed: false,
      retry_after_ms: 4_200
    });
    const app = Fastify();
    apps.push(app);
    registerOpenAiOAuthHttpRoutes(
      app,
      {
        expectedHost: "api.debugbundle.com",
        provider,
        consentUiBaseUrl: "https://app.debugbundle.com",
        consentAccess: {
          describe: vi.fn(),
          complete: vi.fn()
        },
        rateLimiter: { claimRequest }
      },
      { resolveBrowserSession: vi.fn() }
    );

    const response = await app.inject({
      method: "GET",
      url: "/oauth/interaction/interaction_123",
      headers: CANONICAL_HEADERS
    });
    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("5");
    expect(response.json()).toEqual({ error: "oauth_rate_limited" });
    expect(claimRequest).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: "openai-oauth-consent-ip", limit: 10 })
    );
  });

  it("warns when the bounded reviewer credential is near expiry", async () => {
    const capture = captureLogger();
    const app = Fastify({ loggerInstance: capture.logger });
    apps.push(app);
    registerOpenAiOAuthHttpRoutes(app, {
      expectedHost: "api.debugbundle.com",
      provider,
      reviewerCredentialExpiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1_000).toISOString()
    });

    await app.ready();
    await new Promise<void>((resolve) => setImmediate(resolve));

    const logs = capture.read();
    expect(logs).toContain("openai_reviewer_credential_expiring");
    expect(logs).toContain('"expired":false');
  });

  it("keeps reviewer access POST-only and relays only the bounded body credential", async () => {
    const complete = vi.fn(async () => ({
      continueUrl: "https://api.debugbundle.com/oauth/authorize/resume"
    }));
    const app = Fastify();
    apps.push(app);
    registerOpenAiOAuthHttpRoutes(app, {
      expectedHost: "api.debugbundle.com",
      provider,
      reviewerAccess: { complete }
    });

    const get = await app.inject({
      method: "GET",
      url: "/oauth/interaction/reviewer-flow/reviewer",
      headers: CANONICAL_HEADERS
    });
    expect(get.statusCode).toBe(405);
    expect(get.headers.allow).toBe("POST");

    const credential = "reviewer-credential-at-least-thirty-two-characters";
    const post = await app.inject({
      method: "POST",
      url: "/oauth/interaction/reviewer-flow/reviewer",
      headers: CANONICAL_HEADERS,
      payload: { credential }
    });
    expect(post.statusCode).toBe(200);
    expect(post.json()).toEqual({
      continue_url: "https://api.debugbundle.com/oauth/authorize/resume"
    });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ credential }));

    const queryCredential = await app.inject({
      method: "POST",
      url: `/oauth/interaction/reviewer-flow/reviewer?credential=${credential}`,
      headers: CANONICAL_HEADERS,
      payload: {}
    });
    expect(queryCredential.statusCode).toBe(400);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("serves provider discovery with exact RFC 9207, PKCE, and client-auth metadata", async () => {
    const app = createApp();
    const response = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
      headers: CANONICAL_HEADERS
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      issuer: "https://api.debugbundle.com",
      authorization_endpoint: "https://api.debugbundle.com/oauth/authorize",
      token_endpoint: "https://api.debugbundle.com/oauth/token",
      revocation_endpoint: "https://api.debugbundle.com/oauth/revoke",
      userinfo_endpoint: "https://api.debugbundle.com/oauth/userinfo",
      jwks_uri: "https://api.debugbundle.com/oauth/jwks.json",
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: true,
      token_endpoint_auth_methods_supported: ["private_key_jwt"],
      code_challenge_methods_supported: ["S256"]
    });
  });

  it("isolates the API host and fails closed when consent composition is unavailable", async () => {
    const app = createApp();
    const wrongHost = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
      headers: { ...CANONICAL_HEADERS, host: "mcp.debugbundle.test" }
    });
    expect(wrongHost.statusCode).toBe(421);

    const interaction = await app.inject({
      method: "GET",
      url: "/oauth/interaction/reviewer-flow",
      headers: CANONICAL_HEADERS
    });
    expect(interaction.statusCode).toBe(503);
    expect(interaction.json()).toEqual({ error: "oauth_consent_unavailable" });
  });

  it("relays bounded form posts to the provider without exposing protocol errors", async () => {
    const app = createApp();
    const response = await app.inject({
      method: "POST",
      url: "/oauth/token",
      headers: {
        ...CANONICAL_HEADERS,
        "content-type": "application/x-www-form-urlencoded"
      },
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: "https://chatgpt.com/oauth/client.json",
        code: "not-a-real-code",
        redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
        code_verifier: "a".repeat(64)
      }).toString()
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThanOrEqual(500);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.body).not.toContain("not-a-real-code");
  });

  it("logs only bounded OAuth metadata and never codes, verifiers, assertions, or reviewer credentials", async () => {
    const capture = captureLogger();
    const app = Fastify({ loggerInstance: capture.logger });
    apps.push(app);
    registerOpenAiOAuthHttpRoutes(app, {
      expectedHost: "api.debugbundle.com",
      provider,
      reviewerAccess: {
        complete: vi.fn(async () => {
          throw new Error("reviewer secret rejection detail");
        })
      }
    });

    const code = "oauth-code-secret-that-must-never-be-logged";
    const verifier = "oauth-verifier-secret-that-must-never-be-logged";
    const assertion = "oauth-client-assertion-that-must-never-be-logged";
    await app.inject({
      method: "POST",
      url: "/oauth/token",
      headers: {
        ...CANONICAL_HEADERS,
        "content-type": "application/x-www-form-urlencoded"
      },
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: "https://chatgpt.com/oauth/client.json",
        code,
        code_verifier: verifier,
        client_assertion: assertion,
        redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect"
      }).toString()
    });

    const reviewerCredential = "reviewer-credential-that-must-never-be-logged";
    await app.inject({
      method: "POST",
      url: "/oauth/interaction/reviewer-flow/reviewer",
      headers: CANONICAL_HEADERS,
      payload: { credential: reviewerCredential }
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    const logs = capture.read();
    expect(logs).toContain("openai_oauth_request");
    expect(logs).toContain('"endpoint":"/oauth/token"');
    expect(logs).toContain('"endpoint":"/oauth/interaction/:uid/reviewer"');
    expect(logs).not.toContain(code);
    expect(logs).not.toContain(verifier);
    expect(logs).not.toContain(assertion);
    expect(logs).not.toContain(reviewerCredential);
    expect(logs).not.toContain("reviewer secret rejection detail");
  });
});
