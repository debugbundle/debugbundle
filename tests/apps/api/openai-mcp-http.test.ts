import { PassThrough } from "node:stream";

import Fastify from "fastify";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  openAiResponseSizeBucket,
  registerOpenAiMcpHttpRoutes
} from "../../../apps/api/src/openai-mcp-http.js";

const AUTH: AuthInfo = {
  token: "access-token",
  clientId: "https://chatgpt.com/oauth/client.json",
  scopes: [
    "debugbundle:projects:read",
    "debugbundle:incidents:read",
    "debugbundle:artifacts:read",
    "debugbundle:improvements:read",
    "debugbundle:analytics:read",
    "debugbundle:health:read"
  ],
  expiresAt: 1_900_000_000,
  resource: new URL("https://mcp.debugbundle.com"),
  extra: {
    userId: "user_1",
    organizationId: "org_1",
    grantId: "grant_1"
  }
};

const apps: FastifyInstance[] = [];
const CANONICAL_HEADERS = {
  host: "mcp.debugbundle.test",
  "x-forwarded-host": "mcp.debugbundle.test",
  "x-forwarded-proto": "https",
  "x-debugbundle-surface": "openai-mcp"
};

function createApp(
  input: {
    verifyAccessToken?: (token: string) => Promise<AuthInfo>;
    maxConcurrentRequests?: number;
    domainVerificationToken?: string;
    readinessCheck?: () => Promise<void>;
    logger?: FastifyBaseLogger;
    acquireConcurrency?: (input: {
      bucket: string;
      subject: string;
      limit: number;
      leaseMs: number;
    }) => Promise<{ acquired: boolean; lease_id: string; retry_after_ms: number }>;
    releaseConcurrency?: (input: {
      bucket: string;
      subject: string;
      leaseId: string;
    }) => Promise<void>;
  } = {}
) {
  const app = input.logger === undefined ? Fastify() : Fastify({ loggerInstance: input.logger });
  apps.push(app);
  registerOpenAiMcpHttpRoutes(app, {
    expectedHost: "mcp.debugbundle.test",
    verifier: {
      verifyAccessToken: input.verifyAccessToken ?? vi.fn(async () => AUTH)
    },
    operations: {
      list_projects: vi.fn(async () => ({ projects: [], next_cursor: null }))
    },
    rateLimiter: {
      acquireConcurrency:
        input.acquireConcurrency ??
        vi.fn(async () => ({ acquired: true, lease_id: "lease_1", retry_after_ms: 0 })),
      claimRequest: vi.fn(async () => ({ allowed: true, retry_after_ms: 0 })),
      releaseConcurrency: input.releaseConcurrency ?? vi.fn(async () => undefined)
    },
    ...(input.maxConcurrentRequests === undefined
      ? {}
      : { maxConcurrentRequests: input.maxConcurrentRequests }),
    ...(input.domainVerificationToken === undefined
      ? {}
      : { domainVerificationToken: input.domainVerificationToken }),
    readinessCheck: input.readinessCheck ?? vi.fn(async () => undefined)
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

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("OpenAI hosted MCP HTTP boundary", () => {
  it("classifies every bounded response-size telemetry bucket", () => {
    expect(openAiResponseSizeBucket(4 * 1024)).toBe("le_4_kib");
    expect(openAiResponseSizeBucket(4 * 1024 + 1)).toBe("le_64_kib");
    expect(openAiResponseSizeBucket(64 * 1024 + 1)).toBe("le_512_kib");
    expect(openAiResponseSizeBucket(512 * 1024 + 1)).toBe("gt_512_kib");
  });

  it("serves bounded dependency readiness and the configured verification token only on the MCP host", async () => {
    const readinessCheck = vi.fn(async () => undefined);
    const app = createApp({
      readinessCheck,
      domainVerificationToken: "portal_challenge_token_123456789"
    });
    const ready = await app.inject({
      method: "GET",
      url: "/openai/ready",
      headers: CANONICAL_HEADERS
    });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: "ready", surface: "openai_mcp" });
    expect(readinessCheck).toHaveBeenCalledOnce();

    const challenge = await app.inject({
      method: "GET",
      url: "/.well-known/openai-apps-challenge",
      headers: CANONICAL_HEADERS
    });
    expect(challenge.statusCode).toBe(200);
    expect(challenge.headers["content-type"]).toContain("text/plain");
    expect(challenge.body).toBe("portal_challenge_token_123456789");

    const unavailable = createApp({
      readinessCheck: vi.fn(async () => {
        throw new Error("dependency details must stay private");
      })
    });
    const notReady = await unavailable.inject({
      method: "GET",
      url: "/openai/ready",
      headers: CANONICAL_HEADERS
    });
    expect(notReady.statusCode).toBe(503);
    expect(notReady.body).not.toContain("dependency details");
  });

  it("serves exact protected-resource metadata only on the canonical host", async () => {
    const app = createApp();
    const response = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource",
      headers: CANONICAL_HEADERS
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      resource: "https://mcp.debugbundle.com",
      authorization_servers: ["https://api.debugbundle.com"],
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

    const wrongHost = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource",
      headers: { ...CANONICAL_HEADERS, host: "api.debugbundle.test" }
    });
    expect(wrongHost.statusCode).toBe(421);
  });

  it("returns an RFC 9728 challenge before processing unauthenticated MCP input", async () => {
    const app = createApp();
    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: CANONICAL_HEADERS,
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list" }
    });
    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe(
      'Bearer resource_metadata="https://mcp.debugbundle.com/.well-known/oauth-protected-resource"'
    );
    expect(response.json()).toEqual({
      error: "invalid_access_token",
      _meta: {
        "mcp/www_authenticate": [
          'Bearer resource_metadata="https://mcp.debugbundle.com/.well-known/oauth-protected-resource", error="invalid_token", error_description="A valid DebugBundle connection is required."'
        ]
      }
    });
  });

  it("returns the OAuth challenge for ChatGPT's empty binary discovery probe", async () => {
    const app = createApp();
    app.post("/binary-parser-control", async () => ({ accepted: true }));
    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        ...CANONICAL_HEADERS,
        accept: "*/*",
        "content-type": "application/octet-stream"
      },
      payload: Buffer.alloc(0)
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe(
      'Bearer resource_metadata="https://mcp.debugbundle.com/.well-known/oauth-protected-resource"'
    );
    expect(response.json()).toEqual({
      error: "invalid_access_token",
      _meta: {
        "mcp/www_authenticate": [
          'Bearer resource_metadata="https://mcp.debugbundle.com/.well-known/oauth-protected-resource", error="invalid_token", error_description="A valid DebugBundle connection is required."'
        ]
      }
    });

    const nonEmptyProbe = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        ...CANONICAL_HEADERS,
        "content-type": "application/octet-stream"
      },
      payload: Buffer.from([1])
    });
    expect(nonEmptyProbe.statusCode).toBe(415);

    const unrelatedRoute = await app.inject({
      method: "POST",
      url: "/binary-parser-control",
      headers: { "content-type": "application/octet-stream" },
      payload: Buffer.alloc(0)
    });
    expect(unrelatedRoute.statusCode).toBe(415);
  });

  it("serves the SDK Streamable HTTP initialize response with a verified token", async () => {
    const app = createApp();
    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        ...CANONICAL_HEADERS,
        authorization: "Bearer access-token",
        accept: "application/json, text/event-stream",
        "content-type": "application/json"
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" }
        }
      }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        capabilities: { tools: {} },
        serverInfo: { name: "debugbundle-openai-plugin", version: "1.0.0" }
      }
    });
    expect(response.headers["mcp-session-id"]).toBeUndefined();
  });

  it("fails closed when token verification fails or the MCP bulkhead is disabled", async () => {
    const rejected = createApp({
      verifyAccessToken: vi.fn(async () => {
        throw new Error("invalid token detail must not escape");
      })
    });
    const invalidToken = await rejected.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        ...CANONICAL_HEADERS,
        authorization: "Bearer invalid"
      },
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list" }
    });
    expect(invalidToken.statusCode).toBe(401);
    expect(invalidToken.body).not.toContain("invalid token detail");

    const disabled = createApp({ maxConcurrentRequests: 0 });
    const saturated = await disabled.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        ...CANONICAL_HEADERS,
        authorization: "Bearer access-token"
      },
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list" }
    });
    expect(saturated.statusCode).toBe(503);
    expect(saturated.json()).toEqual({ error: "openai_mcp_capacity_unavailable" });
  });

  it("claims and releases Redis-coordinated global and grant concurrency leases", async () => {
    const acquireConcurrency = vi
      .fn()
      .mockResolvedValueOnce({ acquired: true, lease_id: "global_lease", retry_after_ms: 0 })
      .mockResolvedValueOnce({ acquired: true, lease_id: "grant_lease", retry_after_ms: 0 });
    const releaseConcurrency = vi.fn(async () => undefined);
    const app = createApp({ acquireConcurrency, releaseConcurrency });

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        ...CANONICAL_HEADERS,
        authorization: "Bearer access-token",
        accept: "application/json, text/event-stream",
        "content-type": "application/json"
      },
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list" }
    });

    expect(response.statusCode).toBe(200);
    expect(acquireConcurrency).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ bucket: "openai-mcp-global-concurrency", limit: 2 })
    );
    expect(acquireConcurrency).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ bucket: "openai-mcp-grant-concurrency", limit: 2 })
    );
    expect(releaseConcurrency).toHaveBeenCalledTimes(2);
  });

  it("rolls back a global lease and fails closed when the per-grant lease is unavailable", async () => {
    const acquireConcurrency = vi
      .fn()
      .mockResolvedValueOnce({ acquired: true, lease_id: "global_lease", retry_after_ms: 0 })
      .mockResolvedValueOnce({ acquired: false, lease_id: "", retry_after_ms: 2_000 });
    const releaseConcurrency = vi.fn(async () => undefined);
    const app = createApp({ acquireConcurrency, releaseConcurrency });

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        ...CANONICAL_HEADERS,
        authorization: "Bearer access-token"
      },
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list" }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "openai_mcp_capacity_unavailable" });
    expect(releaseConcurrency).toHaveBeenCalledOnce();
    expect(releaseConcurrency).toHaveBeenCalledWith({
      bucket: "openai-mcp-global-concurrency",
      subject: "global",
      leaseId: "global_lease"
    });
  });

  it("rejects forwarded-host and surface spoofing and selects stateless method semantics", async () => {
    const app = createApp();
    const forwarded = await app.inject({
      method: "GET",
      url: "/mcp",
      headers: { ...CANONICAL_HEADERS, forwarded: "host=attacker.example;proto=https" }
    });
    expect(forwarded.statusCode).toBe(421);

    const wrongSurface = await app.inject({
      method: "GET",
      url: "/mcp",
      headers: { ...CANONICAL_HEADERS, "x-debugbundle-surface": "api" }
    });
    expect(wrongSurface.statusCode).toBe(421);

    const options = await app.inject({
      method: "OPTIONS",
      url: "/mcp",
      headers: CANONICAL_HEADERS
    });
    expect(options.statusCode).toBe(204);
    expect(options.headers.allow).toBe("POST, OPTIONS");

    const get = await app.inject({ method: "GET", url: "/mcp", headers: CANONICAL_HEADERS });
    expect(get.statusCode).toBe(405);
    expect(get.headers.allow).toBe("POST");
  });

  it("fails closed when Redis coordination is unavailable and returns bounded rate limits", async () => {
    const unavailable = Fastify();
    apps.push(unavailable);
    registerOpenAiMcpHttpRoutes(unavailable, {
      expectedHost: "mcp.debugbundle.test",
      verifier: { verifyAccessToken: vi.fn(async () => AUTH) },
      operations: { list_projects: vi.fn() },
      rateLimiter: {
        acquireConcurrency: vi.fn(async () => ({
          acquired: true,
          lease_id: "lease_1",
          retry_after_ms: 0
        })),
        claimRequest: vi.fn(async () => {
          throw new Error("redis secret detail");
        }),
        releaseConcurrency: vi.fn(async () => undefined)
      }
    });
    const coordinationFailure = await unavailable.inject({
      method: "POST",
      url: "/mcp",
      headers: CANONICAL_HEADERS,
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list" }
    });
    expect(coordinationFailure.statusCode).toBe(503);
    expect(coordinationFailure.body).not.toContain("redis secret detail");

    const limited = Fastify();
    apps.push(limited);
    registerOpenAiMcpHttpRoutes(limited, {
      expectedHost: "mcp.debugbundle.test",
      verifier: { verifyAccessToken: vi.fn(async () => AUTH) },
      operations: { list_projects: vi.fn() },
      rateLimiter: {
        acquireConcurrency: vi.fn(async () => ({
          acquired: true,
          lease_id: "lease_1",
          retry_after_ms: 0
        })),
        claimRequest: vi.fn(async () => ({ allowed: false, retry_after_ms: 1_500 })),
        releaseConcurrency: vi.fn(async () => undefined)
      }
    });
    const rateLimited = await limited.inject({
      method: "POST",
      url: "/mcp",
      headers: CANONICAL_HEADERS,
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list" }
    });
    expect(rateLimited.statusCode).toBe(429);
    expect(rateLimited.headers["retry-after"]).toBe("2");
  });

  it("logs only allowlisted MCP metadata and never bearer tokens or arguments", async () => {
    const capture = captureLogger();
    const app = createApp({ logger: capture.logger });
    const bearer = "mcp-secret-access-token-that-must-never-be-logged";
    const customerValue = "customer-project-secret-that-must-never-be-logged";
    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        ...CANONICAL_HEADERS,
        authorization: `Bearer ${bearer}`,
        accept: "application/json, text/event-stream",
        "content-type": "application/json"
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "list_projects",
          arguments: { forbidden_customer_value: customerValue }
        }
      }
    });
    expect(response.statusCode).toBe(200);
    await new Promise<void>((resolve) => setImmediate(resolve));

    const logs = capture.read();
    expect(logs).toContain("openai_mcp_request");
    expect(logs).toContain('"tool":"list_projects"');
    expect(logs).not.toContain(bearer);
    expect(logs).not.toContain(customerValue);
    expect(logs).not.toContain("forbidden_customer_value");
    expect(logs).not.toContain("user_1");
    expect(logs).not.toContain("grant_1");
  });
});
