import type { IncomingMessage } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { buildOpenAiProtectedResourceMetadata } from "../../../packages/auth/src/index.js";
import {
  OPENAI_TOOL_NAMES,
  createOpenAiSdkServer,
  openAiMcpInvalidTokenChallenge,
  type OpenAiHostedOperations
} from "../../../packages/mcp-core/src/index.js";
import {
  claimOpenAiRateLimits,
  pseudonymousOpenAiSubject,
  type OpenAiMcpAdmissionCoordinator
} from "./openai-rate-limits.js";

const OPENAI_MCP_RESOURCE = "https://mcp.debugbundle.com";
const OPENAI_CIMD_CLIENT_ID = "https://chatgpt.com/oauth/client.json";
const OPENAI_RESOURCE_METADATA_URL =
  "https://mcp.debugbundle.com/.well-known/oauth-protected-resource";
const OPENAI_ALLOWED_SCOPES = new Set([
  "openid",
  "email",
  "debugbundle:projects:read",
  "debugbundle:incidents:read",
  "debugbundle:artifacts:read",
  "debugbundle:improvements:read",
  "debugbundle:analytics:read",
  "debugbundle:health:read"
]);

export interface OpenAiAccessTokenVerifier {
  verifyAccessToken(token: string): Promise<AuthInfo>;
}

export interface OpenAiMcpHttpOptions {
  expectedHost: string;
  verifier: OpenAiAccessTokenVerifier;
  operations: OpenAiHostedOperations;
  rateLimiter: OpenAiMcpAdmissionCoordinator;
  maxConcurrentRequests?: number;
  maxConcurrentRequestsPerGrant?: number;
  operationTimeoutMs?: number;
  domainVerificationToken?: string;
  readinessCheck?: () => Promise<void>;
}

const OPENAI_TOOL_NAME_SET = new Set<string>(OPENAI_TOOL_NAMES);
const OPENAI_MCP_METHODS = new Set([
  "initialize",
  "notifications/initialized",
  "ping",
  "tools/list",
  "tools/call"
]);

function requireCanonicalHost(
  request: FastifyRequest,
  reply: FastifyReply,
  expectedHost: string
): boolean {
  if (
    request.headers.host !== expectedHost ||
    request.headers["x-forwarded-host"] !== expectedHost ||
    request.headers["x-forwarded-proto"] !== "https" ||
    request.headers["x-debugbundle-surface"] !== "openai-mcp" ||
    request.headers.forwarded !== undefined
  ) {
    void reply.status(421).send({ error: "canonical_host_required" });
    return false;
  }
  return true;
}

function sendBearerChallenge(reply: FastifyReply): FastifyReply {
  return reply
    .header("WWW-Authenticate", `Bearer resource_metadata="${OPENAI_RESOURCE_METADATA_URL}"`)
    .status(401)
    .send({
      error: "invalid_access_token",
      _meta: { "mcp/www_authenticate": [openAiMcpInvalidTokenChallenge()] }
    });
}

function readBearerToken(header: string | undefined): string | undefined {
  const match = /^Bearer ([^\s,]+)$/i.exec(header ?? "");
  return match?.[1];
}

function isValidAuthInfo(auth: AuthInfo): boolean {
  const extra = auth.extra;
  return (
    auth.clientId === OPENAI_CIMD_CLIENT_ID &&
    auth.resource?.origin === OPENAI_MCP_RESOURCE &&
    auth.expiresAt !== undefined &&
    auth.expiresAt > Math.floor(Date.now() / 1000) &&
    auth.scopes.length > 0 &&
    new Set(auth.scopes).size === auth.scopes.length &&
    auth.scopes.every((scope) => OPENAI_ALLOWED_SCOPES.has(scope)) &&
    typeof extra?.["userId"] === "string" &&
    typeof extra["organizationId"] === "string" &&
    typeof extra["grantId"] === "string"
  );
}

function readToolName(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  if (record["method"] !== "tools/call") {
    return undefined;
  }
  const params = record["params"];
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    return undefined;
  }
  const name = (params as Record<string, unknown>)["name"];
  return typeof name === "string" && OPENAI_TOOL_NAME_SET.has(name) ? name : undefined;
}

function readMcpMethod(body: unknown): string {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return "invalid";
  }
  const method = (body as Record<string, unknown>)["method"];
  return typeof method === "string" && OPENAI_MCP_METHODS.has(method) ? method : "other";
}

export function openAiResponseSizeBucket(bytes: number): string {
  if (bytes <= 4 * 1024) return "le_4_kib";
  if (bytes <= 64 * 1024) return "le_64_kib";
  if (bytes <= 512 * 1024) return "le_512_kib";
  return "gt_512_kib";
}

function logMcpRequest(
  request: FastifyRequest,
  input: {
    method: string;
    tool?: string;
    grantKey?: string;
    clientKey?: string;
    outcome: "success" | "failure";
    status: number;
    durationMs: number;
    admission: string;
    responseBytes?: number;
    timeout?: boolean;
    canceled?: boolean;
  }
): void {
  request.log.info(
    {
      event: "openai_mcp_request",
      request_id: request.id,
      method: input.method,
      ...(input.tool === undefined ? {} : { tool: input.tool }),
      ...(input.grantKey === undefined ? {} : { grant_key: input.grantKey }),
      ...(input.clientKey === undefined ? {} : { client_key: input.clientKey }),
      outcome: input.outcome,
      status: input.status,
      duration_ms: Math.max(0, Math.round(input.durationMs)),
      response_size_bucket: openAiResponseSizeBucket(input.responseBytes ?? 0),
      admission: input.admission,
      timeout: input.timeout ?? false,
      canceled: input.canceled ?? false
    },
    "openai_mcp_request"
  );
}

export function registerOpenAiMcpHttpRoutes(
  app: FastifyInstance,
  options: OpenAiMcpHttpOptions
): void {
  const maxConcurrentRequests = options.maxConcurrentRequests ?? 2;
  const maxConcurrentRequestsPerGrant = options.maxConcurrentRequestsPerGrant ?? 2;
  const operationTimeoutMs = options.operationTimeoutMs ?? 24_000;
  const concurrencyLeaseMs = Math.max(60_000, operationTimeoutMs * 2);
  let activeRequests = 0;
  const activeRequestsByGrant = new Map<string, number>();

  if (options.domainVerificationToken !== undefined) {
    app.get("/.well-known/openai-apps-challenge", async (request, reply) => {
      if (!requireCanonicalHost(request, reply, options.expectedHost)) {
        return;
      }
      return reply
        .header("Cache-Control", "no-store")
        .type("text/plain; charset=utf-8")
        .send(options.domainVerificationToken);
    });
  }

  app.get("/openai/ready", async (request, reply) => {
    if (!requireCanonicalHost(request, reply, options.expectedHost)) {
      return;
    }
    try {
      if (options.readinessCheck === undefined) {
        throw new Error("openai_mcp_readiness_not_configured");
      }
      await options.readinessCheck();
      return reply.header("Cache-Control", "no-store").send({
        status: "ready",
        surface: "openai_mcp"
      });
    } catch {
      return reply
        .header("Cache-Control", "no-store")
        .status(503)
        .send({ status: "not_ready", surface: "openai_mcp" });
    }
  });

  app.get("/.well-known/oauth-protected-resource", async (request, reply) => {
    if (!requireCanonicalHost(request, reply, options.expectedHost)) {
      return;
    }
    return reply
      .header("Cache-Control", "public, max-age=300")
      .send(buildOpenAiProtectedResourceMetadata());
  });

  app.get("/mcp", async (request, reply) => {
    if (!requireCanonicalHost(request, reply, options.expectedHost)) {
      return;
    }
    return reply.header("Allow", "POST").status(405).send({ error: "method_not_allowed" });
  });

  app.delete("/mcp", async (request, reply) => {
    if (!requireCanonicalHost(request, reply, options.expectedHost)) {
      return;
    }
    return reply.header("Allow", "POST").status(405).send({ error: "method_not_allowed" });
  });

  app.options("/mcp", async (request, reply) => {
    if (!requireCanonicalHost(request, reply, options.expectedHost)) {
      return;
    }
    return reply.header("Allow", "POST, OPTIONS").status(204).send();
  });

  // ChatGPT uses an empty binary POST to discover the OAuth challenge. Keep
  // this compatibility behavior limited to /mcp and reject every other binary
  // body before it can reach authentication or an application route.
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer", bodyLimit: 1 },
    (request, body, done) => {
      if (request.method !== "POST" || request.url !== "/mcp" || body.length !== 0) {
        const error = new Error("Unsupported Media Type") as Error & {
          code: string;
          statusCode: number;
        };
        error.code = "FST_ERR_CTP_INVALID_MEDIA_TYPE";
        error.statusCode = 415;
        done(error);
        return;
      }
      done(null, undefined);
    }
  );

  app.post("/mcp", async (request, reply) => {
    const startedAt = performance.now();
    const method = readMcpMethod(request.body);
    const toolName = readToolName(request.body);
    if (!requireCanonicalHost(request, reply, options.expectedHost)) {
      logMcpRequest(request, {
        method,
        ...(toolName === undefined ? {} : { tool: toolName }),
        outcome: "failure",
        status: 421,
        durationMs: performance.now() - startedAt,
        admission: "canonical_host_rejected"
      });
      return;
    }

    const token = readBearerToken(request.headers.authorization);
    if (token === undefined) {
      try {
        const rate = await claimOpenAiRateLimits({
          limiter: options.rateLimiter,
          ip: request.ip,
          claims: [
            {
              bucket: "openai-mcp-unauthenticated-ip",
              subject: pseudonymousOpenAiSubject("ip", request.ip),
              limit: 120
            },
            { bucket: "openai-mcp-unauthenticated-global", subject: "global", limit: 2_000 }
          ]
        });
        if (!rate.allowed) {
          logMcpRequest(request, {
            method,
            ...(toolName === undefined ? {} : { tool: toolName }),
            outcome: "failure",
            status: 429,
            durationMs: performance.now() - startedAt,
            admission: "rate_limited"
          });
          request.log.info(
            {
              event: "openai_mcp_admission_rejected",
              request_id: request.id,
              decision: "rate_limited"
            },
            "openai_mcp_admission_rejected"
          );
          return reply
            .header("Retry-After", String(rate.retryAfterSeconds))
            .status(429)
            .send({ error: "openai_mcp_rate_limited" });
        }
      } catch {
        logMcpRequest(request, {
          method,
          ...(toolName === undefined ? {} : { tool: toolName }),
          outcome: "failure",
          status: 503,
          durationMs: performance.now() - startedAt,
          admission: "coordination_unavailable"
        });
        return reply.status(503).send({ error: "openai_mcp_coordination_unavailable" });
      }
      logMcpRequest(request, {
        method,
        ...(toolName === undefined ? {} : { tool: toolName }),
        outcome: "failure",
        status: 401,
        durationMs: performance.now() - startedAt,
        admission: "unauthenticated"
      });
      return sendBearerChallenge(reply);
    }

    let auth: AuthInfo;
    try {
      auth = await options.verifier.verifyAccessToken(token);
    } catch {
      logMcpRequest(request, {
        method,
        ...(toolName === undefined ? {} : { tool: toolName }),
        outcome: "failure",
        status: 401,
        durationMs: performance.now() - startedAt,
        admission: "auth_rejected"
      });
      return sendBearerChallenge(reply);
    }
    if (!isValidAuthInfo(auth)) {
      logMcpRequest(request, {
        method,
        ...(toolName === undefined ? {} : { tool: toolName }),
        outcome: "failure",
        status: 401,
        durationMs: performance.now() - startedAt,
        admission: "auth_rejected"
      });
      return sendBearerChallenge(reply);
    }

    const userId = auth.extra!["userId"] as string;
    const grantId = auth.extra!["grantId"] as string;
    const isArtifactTool =
      toolName === "get_incident_context" ||
      toolName === "get_bundle" ||
      toolName === "get_reproduction" ||
      toolName === "get_improvement_bundle";
    try {
      const claims = [
        {
          bucket: "openai-mcp-authenticated-user",
          subject: pseudonymousOpenAiSubject("user", userId),
          limit: 60
        },
        {
          bucket: "openai-mcp-authenticated-grant",
          subject: pseudonymousOpenAiSubject("grant", grantId),
          limit: 60
        },
        { bucket: "openai-mcp-authenticated-global", subject: "global", limit: 2_000 }
      ];
      if (isArtifactTool) {
        claims.push(
          {
            bucket: "openai-mcp-artifact-user",
            subject: pseudonymousOpenAiSubject("user", userId),
            limit: 20
          },
          {
            bucket: "openai-mcp-artifact-grant",
            subject: pseudonymousOpenAiSubject("grant", grantId),
            limit: 20
          }
        );
      }
      const rate = await claimOpenAiRateLimits({
        limiter: options.rateLimiter,
        ip: request.ip,
        claims
      });
      if (!rate.allowed) {
        logMcpRequest(request, {
          method,
          ...(toolName === undefined ? {} : { tool: toolName }),
          grantKey: pseudonymousOpenAiSubject("grant", grantId),
          clientKey: pseudonymousOpenAiSubject("client", auth.clientId),
          outcome: "failure",
          status: 429,
          durationMs: performance.now() - startedAt,
          admission: "rate_limited"
        });
        request.log.info(
          {
            event: "openai_mcp_admission_rejected",
            request_id: request.id,
            grant_key: pseudonymousOpenAiSubject("grant", grantId),
            decision: "rate_limited"
          },
          "openai_mcp_admission_rejected"
        );
        return reply
          .header("Retry-After", String(rate.retryAfterSeconds))
          .status(429)
          .send({ error: "openai_mcp_rate_limited" });
      }
    } catch {
      logMcpRequest(request, {
        method,
        ...(toolName === undefined ? {} : { tool: toolName }),
        grantKey: pseudonymousOpenAiSubject("grant", grantId),
        clientKey: pseudonymousOpenAiSubject("client", auth.clientId),
        outcome: "failure",
        status: 503,
        durationMs: performance.now() - startedAt,
        admission: "coordination_unavailable"
      });
      return reply.status(503).send({ error: "openai_mcp_coordination_unavailable" });
    }

    const grantConcurrency = activeRequestsByGrant.get(grantId) ?? 0;
    if (
      activeRequests >= maxConcurrentRequests ||
      grantConcurrency >= maxConcurrentRequestsPerGrant
    ) {
      logMcpRequest(request, {
        method,
        ...(toolName === undefined ? {} : { tool: toolName }),
        grantKey: pseudonymousOpenAiSubject("grant", grantId),
        clientKey: pseudonymousOpenAiSubject("client", auth.clientId),
        outcome: "failure",
        status: 503,
        durationMs: performance.now() - startedAt,
        admission: "capacity_rejected"
      });
      request.log.info(
        {
          event: "openai_mcp_admission_rejected",
          request_id: request.id,
          grant_key: pseudonymousOpenAiSubject("grant", grantId),
          decision: "capacity_rejected",
          global_concurrency: activeRequests,
          grant_concurrency: grantConcurrency
        },
        "openai_mcp_admission_rejected"
      );
      return reply.status(503).send({ error: "openai_mcp_capacity_unavailable" });
    }

    const grantSubject = pseudonymousOpenAiSubject("grant", grantId);
    const leases: Array<{ bucket: string; subject: string; leaseId: string }> = [];
    try {
      for (const claim of [
        {
          bucket: "openai-mcp-global-concurrency",
          subject: "global",
          limit: maxConcurrentRequests
        },
        {
          bucket: "openai-mcp-grant-concurrency",
          subject: grantSubject,
          limit: maxConcurrentRequestsPerGrant
        }
      ]) {
        const result = await options.rateLimiter.acquireConcurrency({
          ...claim,
          leaseMs: concurrencyLeaseMs
        });
        if (!result.acquired) {
          await Promise.all(leases.map((lease) => options.rateLimiter.releaseConcurrency(lease)));
          logMcpRequest(request, {
            method,
            ...(toolName === undefined ? {} : { tool: toolName }),
            grantKey: grantSubject,
            clientKey: pseudonymousOpenAiSubject("client", auth.clientId),
            outcome: "failure",
            status: 503,
            durationMs: performance.now() - startedAt,
            admission: "capacity_rejected"
          });
          return reply
            .header("Retry-After", String(Math.max(1, Math.ceil(result.retry_after_ms / 1_000))))
            .status(503)
            .send({ error: "openai_mcp_capacity_unavailable" });
        }
        leases.push({
          bucket: claim.bucket,
          subject: claim.subject,
          leaseId: result.lease_id
        });
      }
    } catch {
      await Promise.allSettled(
        leases.map((lease) => options.rateLimiter.releaseConcurrency(lease))
      );
      logMcpRequest(request, {
        method,
        ...(toolName === undefined ? {} : { tool: toolName }),
        grantKey: grantSubject,
        clientKey: pseudonymousOpenAiSubject("client", auth.clientId),
        outcome: "failure",
        status: 503,
        durationMs: performance.now() - startedAt,
        admission: "coordination_unavailable"
      });
      return reply.status(503).send({ error: "openai_mcp_coordination_unavailable" });
    }
    const admittedGrantConcurrency = activeRequestsByGrant.get(grantId) ?? 0;
    activeRequests += 1;
    activeRequestsByGrant.set(grantId, admittedGrantConcurrency + 1);

    let server: ReturnType<typeof createOpenAiSdkServer> | undefined;
    let transport: StreamableHTTPServerTransport | undefined;
    const rawRequest = request.raw as IncomingMessage & { auth?: AuthInfo };
    rawRequest.auth = auth;
    const socketBytesBefore = reply.raw.socket?.bytesWritten ?? 0;
    let transportFailed = false;

    try {
      server = createOpenAiSdkServer({
        operations: options.operations,
        operationTimeoutMs
      });
      transport = new StreamableHTTPServerTransport({
        enableJsonResponse: true
      });
      await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
      reply.hijack();
      await transport.handleRequest(rawRequest, reply.raw, request.body);
    } catch {
      transportFailed = true;
      if (!reply.raw.headersSent) {
        reply.raw.statusCode = 500;
        reply.raw.setHeader("content-type", "application/json; charset=utf-8");
        reply.raw.end(JSON.stringify({ error: "openai_mcp_transport_error" }));
      }
    } finally {
      const responseBytes = Math.max(
        0,
        (reply.raw.socket?.bytesWritten ?? socketBytesBefore) - socketBytesBefore
      );
      const durationMs = performance.now() - startedAt;
      logMcpRequest(request, {
        method,
        ...(toolName === undefined ? {} : { tool: toolName }),
        grantKey: pseudonymousOpenAiSubject("grant", grantId),
        clientKey: pseudonymousOpenAiSubject("client", auth.clientId),
        outcome: transportFailed || reply.raw.statusCode >= 500 ? "failure" : "success",
        status: reply.raw.statusCode,
        durationMs,
        admission: "allowed",
        responseBytes,
        timeout: durationMs >= operationTimeoutMs,
        canceled: request.raw.aborted || reply.raw.destroyed
      });
      activeRequests -= 1;
      const remainingGrantRequests = (activeRequestsByGrant.get(grantId) ?? 1) - 1;
      if (remainingGrantRequests <= 0) {
        activeRequestsByGrant.delete(grantId);
      } else {
        activeRequestsByGrant.set(grantId, remainingGrantRequests);
      }
      await transport?.close().catch(() => undefined);
      await server?.close().catch(() => undefined);
      const releases = await Promise.allSettled(
        leases.map((lease) => options.rateLimiter.releaseConcurrency(lease))
      );
      if (releases.some((release) => release.status === "rejected")) {
        request.log.warn(
          {
            event: "openai_mcp_coordination_release_failed",
            request_id: request.id,
            grant_key: grantSubject
          },
          "openai_mcp_coordination_release_failed"
        );
      }
    }
  });
}
