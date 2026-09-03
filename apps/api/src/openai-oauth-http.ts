import type { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type Provider from "oidc-provider";
import { z } from "zod";
import type { OpenAiOAuthStore } from "../../../packages/storage/src/index.js";

import type { OpenAiConsentAuthorization, OpenAiConsentSession } from "./openai-consent-access.js";
import type { OpenAiReviewerAuthorization } from "./openai-reviewer-access.js";
import {
  claimOpenAiRateLimits,
  pseudonymousOpenAiSubject,
  type OpenAiRequestRateLimiter
} from "./openai-rate-limits.js";

export interface OpenAiOAuthHttpOptions {
  expectedHost: string;
  provider: Provider;
  rateLimiter?: OpenAiRequestRateLimiter;
  reviewerAccess?: OpenAiReviewerAuthorization;
  reviewerCredentialExpiresAt?: string;
  consentAccess?: OpenAiConsentAuthorization;
  consentUiBaseUrl?: string;
  connectionStore?: Pick<OpenAiOAuthStore, "listConnectionsForUser" | "revokeConnectionForUser">;
  maxConcurrentRequests?: number;
}

export interface OpenAiOAuthHttpDependencies {
  resolveBrowserSession(
    cookieHeader: string | undefined
  ): Promise<OpenAiConsentSession | undefined>;
}

const ReviewerAccessBodySchema = z.object({ credential: z.string().min(32).max(512) }).strict();
const ConsentDecisionBodySchema = z
  .object({
    decision: z.enum(["allow", "deny"]),
    product_scopes: z
      .array(
        z.enum([
          "debugbundle:projects:read",
          "debugbundle:incidents:read",
          "debugbundle:artifacts:read",
          "debugbundle:improvements:read",
          "debugbundle:analytics:read",
          "debugbundle:health:read"
        ])
      )
      .max(6)
  })
  .strict();
const InteractionParamsSchema = z
  .object({
    uid: z
      .string()
      .min(8)
      .max(256)
      .regex(/^[A-Za-z0-9_-]+$/)
  })
  .strict();

function requireCanonicalApiHost(
  request: FastifyRequest,
  reply: FastifyReply,
  expectedHost: string
): boolean {
  const forwardedHost = request.headers["x-forwarded-host"];
  const forwardedProto = request.headers["x-forwarded-proto"];
  if (
    request.headers.host !== expectedHost ||
    forwardedHost !== expectedHost ||
    forwardedProto !== "https" ||
    request.headers["x-debugbundle-surface"] !== "openai-oauth" ||
    request.headers.forwarded !== undefined
  ) {
    void reply.status(421).send({ error: "canonical_host_required" });
    return false;
  }
  return true;
}

function relayProviderRequest(
  provider: Provider,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const complete = (): void => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    response.once("finish", complete);
    response.once("close", complete);
    try {
      provider.callback()(request, response);
    } catch (error) {
      reject(error instanceof Error ? error : new Error("oauth_provider_request_failed"));
    }
  });
}

function buildProviderRequest(request: FastifyRequest): IncomingMessage {
  if (!Buffer.isBuffer(request.body)) {
    return request.raw;
  }

  const relay = new PassThrough();
  Object.defineProperties(relay, {
    headers: { value: request.headers },
    rawHeaders: { value: request.raw.rawHeaders },
    method: { value: request.method },
    url: { value: request.raw.url },
    httpVersion: { value: request.raw.httpVersion },
    httpVersionMajor: { value: request.raw.httpVersionMajor },
    httpVersionMinor: { value: request.raw.httpVersionMinor },
    socket: { value: request.raw.socket }
  });
  relay.end(request.body);
  return relay as unknown as IncomingMessage;
}

function parseOAuthForm(request: FastifyRequest): URLSearchParams {
  return new URLSearchParams(Buffer.isBuffer(request.body) ? request.body.toString("utf8") : "");
}

function oauthEndpoint(request: FastifyRequest): string {
  const pathname = new URL(request.raw.url ?? "/", "https://api.debugbundle.com").pathname;
  const known = new Set([
    "/.well-known/oauth-authorization-server",
    "/.well-known/openid-configuration",
    "/oauth/authorize",
    "/oauth/token",
    "/oauth/revoke",
    "/oauth/userinfo",
    "/oauth/jwks.json",
    "/oauth/reviewer/access"
  ]);
  return known.has(pathname)
    ? pathname
    : pathname.startsWith("/oauth/interaction/")
      ? pathname.endsWith("/reviewer")
        ? "/oauth/interaction/:uid/reviewer"
        : "/oauth/interaction/:uid"
      : "/oauth/other";
}

function oauthClientKey(request: FastifyRequest): string | undefined {
  const url = new URL(request.raw.url ?? "/", "https://api.debugbundle.com");
  const form = parseOAuthForm(request);
  const clientId = url.searchParams.get("client_id") ?? form.get("client_id");
  return clientId === null ? undefined : pseudonymousOpenAiSubject("client", clientId);
}

function logOAuthRequest(
  request: FastifyRequest,
  input: {
    outcome: "success" | "failure";
    status: number;
    durationMs: number;
    admission: string;
    clientKey?: string;
  }
): void {
  request.log.info(
    {
      event: "openai_oauth_request",
      request_id: request.id,
      endpoint: oauthEndpoint(request),
      ...(input.clientKey === undefined ? {} : { client_key: input.clientKey }),
      outcome: input.outcome,
      status: input.status,
      duration_ms: Math.max(0, Math.round(input.durationMs)),
      admission: input.admission
    },
    "openai_oauth_request"
  );
}

function registerReviewerExpiryMonitor(app: FastifyInstance, expiresAt: string): void {
  const emit = (): void => {
    const remainingMs = new Date(expiresAt).getTime() - Date.now();
    const remainingDays = Math.floor(remainingMs / (24 * 60 * 60 * 1_000));
    if (remainingDays <= 14) {
      app.log.warn(
        {
          event: "openai_reviewer_credential_expiring",
          remaining_days: remainingDays,
          expired: remainingMs <= 0
        },
        "openai_reviewer_credential_expiring"
      );
    }
  };
  const timer = setInterval(emit, 6 * 60 * 60 * 1_000);
  timer.unref();
  app.addHook("onReady", () => emit());
  app.addHook("onClose", () => clearInterval(timer));
}

function oauthRateLimitClaims(request: FastifyRequest): Array<{
  bucket: string;
  subject: string;
  limit: number;
}> {
  const url = new URL(request.raw.url ?? "/", "https://api.debugbundle.com");
  const claims = [
    {
      bucket: "openai-oauth-ip",
      subject: pseudonymousOpenAiSubject("ip", request.ip),
      limit: 120
    },
    { bucket: "openai-oauth-global", subject: "global", limit: 2_000 }
  ];
  if (url.pathname === "/oauth/authorize") {
    const clientId = url.searchParams.get("client_id") ?? "missing";
    const session = request.headers.cookie ?? request.ip;
    claims.push({
      bucket: "openai-oauth-authorize-session-client",
      subject: pseudonymousOpenAiSubject("authorize", `${session}:${clientId}`),
      limit: 30
    });
  }
  if (url.pathname === "/oauth/token") {
    const form = parseOAuthForm(request);
    const clientId = form.get("client_id") ?? "missing";
    const credentialKey = form.get("code") ?? form.get("refresh_token") ?? "missing";
    claims.push(
      {
        bucket: "openai-oauth-token-client",
        subject: pseudonymousOpenAiSubject("client", clientId),
        limit: 30
      },
      {
        bucket: "openai-oauth-token-credential",
        subject: pseudonymousOpenAiSubject("credential", credentialKey),
        limit: 5
      }
    );
  }
  return claims;
}

export function registerOpenAiOAuthHttpRoutes(
  app: FastifyInstance,
  options: OpenAiOAuthHttpOptions,
  dependencies?: OpenAiOAuthHttpDependencies
): void {
  const maxConcurrentRequests = options.maxConcurrentRequests ?? 16;
  let activeRequests = 0;

  if (options.reviewerCredentialExpiresAt !== undefined) {
    registerReviewerExpiryMonitor(app, options.reviewerCredentialExpiresAt);
  }

  async function admitConsentInteraction(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<boolean> {
    try {
      const rate = await claimOpenAiRateLimits({
        limiter: options.rateLimiter,
        ip: request.ip,
        claims: [
          {
            bucket: "openai-oauth-consent-ip",
            subject: pseudonymousOpenAiSubject("ip", request.ip),
            limit: 10
          },
          {
            bucket: "openai-oauth-consent-session-client",
            subject: pseudonymousOpenAiSubject("consent", request.headers.cookie ?? request.ip),
            limit: 30
          },
          { bucket: "openai-oauth-consent-global", subject: "global", limit: 2_000 }
        ]
      });
      if (rate.allowed) {
        return true;
      }
      await reply
        .header("Retry-After", String(rate.retryAfterSeconds))
        .status(429)
        .send({ error: "oauth_rate_limited" });
      return false;
    } catch {
      await reply.status(503).send({ error: "oauth_coordination_unavailable" });
      return false;
    }
  }

  app.addContentTypeParser("application/x-www-form-urlencoded", (request, payload, done) => {
    void request;
    const chunks: Buffer[] = [];
    payload.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    payload.once("end", () => done(null, Buffer.concat(chunks)));
    payload.once("error", done);
  });

  const relay = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const startedAt = performance.now();
    const clientKey = oauthClientKey(request);
    if (!requireCanonicalApiHost(request, reply, options.expectedHost)) {
      logOAuthRequest(request, {
        outcome: "failure",
        status: 421,
        durationMs: performance.now() - startedAt,
        admission: "canonical_host_rejected",
        ...(clientKey === undefined ? {} : { clientKey })
      });
      return;
    }
    try {
      const rate = await claimOpenAiRateLimits({
        limiter: options.rateLimiter,
        ip: request.ip,
        claims: oauthRateLimitClaims(request)
      });
      if (!rate.allowed) {
        logOAuthRequest(request, {
          outcome: "failure",
          status: 429,
          durationMs: performance.now() - startedAt,
          admission: "rate_limited",
          ...(clientKey === undefined ? {} : { clientKey })
        });
        await reply
          .header("Retry-After", String(rate.retryAfterSeconds))
          .status(429)
          .send({ error: "oauth_rate_limited" });
        return;
      }
    } catch {
      logOAuthRequest(request, {
        outcome: "failure",
        status: 503,
        durationMs: performance.now() - startedAt,
        admission: "coordination_unavailable",
        ...(clientKey === undefined ? {} : { clientKey })
      });
      await reply.status(503).send({ error: "oauth_coordination_unavailable" });
      return;
    }
    if (activeRequests >= maxConcurrentRequests) {
      logOAuthRequest(request, {
        outcome: "failure",
        status: 503,
        durationMs: performance.now() - startedAt,
        admission: "capacity_rejected",
        ...(clientKey === undefined ? {} : { clientKey })
      });
      await reply.status(503).send({ error: "oauth_capacity_unavailable" });
      return;
    }
    activeRequests += 1;
    try {
      reply.hijack();
      await relayProviderRequest(options.provider, buildProviderRequest(request), reply.raw);
      logOAuthRequest(request, {
        outcome: reply.raw.statusCode >= 400 ? "failure" : "success",
        status: reply.raw.statusCode,
        durationMs: performance.now() - startedAt,
        admission: "allowed",
        ...(clientKey === undefined ? {} : { clientKey })
      });
    } catch {
      if (!reply.raw.headersSent) {
        reply.raw.statusCode = 500;
        reply.raw.setHeader("content-type", "application/json; charset=utf-8");
        reply.raw.end(JSON.stringify({ error: "oauth_provider_error" }));
      }
      logOAuthRequest(request, {
        outcome: "failure",
        status: reply.raw.statusCode >= 400 ? reply.raw.statusCode : 500,
        durationMs: performance.now() - startedAt,
        admission: "allowed",
        ...(clientKey === undefined ? {} : { clientKey })
      });
    } finally {
      activeRequests -= 1;
    }
  };

  app.get("/.well-known/oauth-authorization-server", relay);
  app.get("/.well-known/openid-configuration", relay);

  app.route({
    method: ["GET", "PUT", "PATCH", "DELETE"],
    url: "/oauth/interaction/:uid/reviewer",
    handler: async (request, reply) => {
      if (!requireCanonicalApiHost(request, reply, options.expectedHost)) {
        return;
      }
      if (options.reviewerAccess === undefined) {
        return reply.status(404).send({ error: "not_found" });
      }
      return reply.header("Allow", "POST").status(405).send({ error: "method_not_allowed" });
    }
  });
  app.post("/oauth/interaction/:uid/reviewer", async (request, reply) => {
    const startedAt = performance.now();
    if (!requireCanonicalApiHost(request, reply, options.expectedHost)) {
      logOAuthRequest(request, {
        outcome: "failure",
        status: 421,
        durationMs: performance.now() - startedAt,
        admission: "canonical_host_rejected"
      });
      return;
    }
    if (options.reviewerAccess === undefined) {
      return reply.status(404).send({ error: "not_found" });
    }
    const params = InteractionParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }
    const parsed = ReviewerAccessBodySchema.safeParse(request.body);
    if (!parsed.success) {
      logOAuthRequest(request, {
        outcome: "failure",
        status: 400,
        durationMs: performance.now() - startedAt,
        admission: "invalid_payload"
      });
      return reply.status(400).send({ error: "invalid_payload" });
    }
    try {
      const rate = await claimOpenAiRateLimits({
        limiter: options.rateLimiter,
        ip: request.ip,
        claims: [
          {
            bucket: "openai-reviewer-ip",
            subject: pseudonymousOpenAiSubject("ip", request.ip),
            limit: 10
          },
          {
            bucket: "openai-reviewer-credential",
            subject: pseudonymousOpenAiSubject("reviewer", parsed.data.credential),
            limit: 5
          },
          { bucket: "openai-reviewer-global", subject: "global", limit: 30 }
        ]
      });
      if (!rate.allowed) {
        logOAuthRequest(request, {
          outcome: "failure",
          status: 429,
          durationMs: performance.now() - startedAt,
          admission: "rate_limited",
          clientKey: pseudonymousOpenAiSubject("reviewer", parsed.data.credential)
        });
        return reply
          .header("Retry-After", String(rate.retryAfterSeconds))
          .status(429)
          .send({ error: "openai_reviewer_rate_limited" });
      }
    } catch {
      logOAuthRequest(request, {
        outcome: "failure",
        status: 503,
        durationMs: performance.now() - startedAt,
        admission: "coordination_unavailable",
        clientKey: pseudonymousOpenAiSubject("reviewer", parsed.data.credential)
      });
      return reply.status(503).send({ error: "oauth_coordination_unavailable" });
    }

    try {
      const completed = await options.reviewerAccess.complete({
        interactionId: params.data.uid,
        credential: parsed.data.credential,
        request: request.raw,
        response: reply.raw
      });
      await reply.header("Cache-Control", "no-store").send({
        continue_url: completed.continueUrl
      });
      logOAuthRequest(request, {
        outcome: "success",
        status: 200,
        durationMs: performance.now() - startedAt,
        admission: "allowed",
        clientKey: pseudonymousOpenAiSubject("reviewer", parsed.data.credential)
      });
    } catch {
      await reply.status(401).send({ error: "openai_reviewer_access_denied" });
      logOAuthRequest(request, {
        outcome: "failure",
        status: 401,
        durationMs: performance.now() - startedAt,
        admission: "credential_rejected",
        clientKey: pseudonymousOpenAiSubject("reviewer", parsed.data.credential)
      });
    }
  });

  app.route({
    method: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    url: "/oauth/reviewer/access",
    handler: async (_request, reply) => reply.status(404).send({ error: "not_found" })
  });

  app.get("/oauth/interaction/:uid", async (request, reply) => {
    if (!requireCanonicalApiHost(request, reply, options.expectedHost)) {
      return;
    }
    if (options.consentAccess === undefined || dependencies === undefined) {
      return reply.status(503).send({ error: "oauth_consent_unavailable" });
    }
    const params = InteractionParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "oauth_interaction_invalid" });
    }
    if (!(await admitConsentInteraction(request, reply))) {
      return;
    }
    const accept = request.headers.accept ?? "";
    if (!accept.includes("application/json")) {
      if (options.consentUiBaseUrl === undefined) {
        return reply.status(503).send({ error: "oauth_consent_unavailable" });
      }
      const destination = new URL("/oauth/consent", options.consentUiBaseUrl);
      destination.searchParams.set("interaction", params.data.uid);
      return reply.header("Cache-Control", "no-store").redirect(destination.toString(), 303);
    }
    try {
      const session = await dependencies.resolveBrowserSession(request.headers.cookie);
      const interaction = await options.consentAccess.describe({
        request: request.raw,
        response: reply.raw,
        ...(session === undefined ? {} : { session })
      });
      if (interaction.interaction_id !== params.data.uid) {
        return reply.status(400).send({ error: "oauth_interaction_invalid" });
      }
      return reply.header("Cache-Control", "no-store").send({ interaction });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "openai_consent_session_invalid") {
        return reply.status(401).send({ error: "invalid_session" });
      }
      if (
        message === "openai_consent_session_mismatch" ||
        message === "openai_consent_organization_unavailable"
      ) {
        return reply.status(403).send({ error: "oauth_consent_forbidden" });
      }
      if (message === "openai_authorization_interaction_invalid") {
        return reply.status(400).send({ error: "oauth_interaction_invalid" });
      }
      return reply.status(503).send({ error: "oauth_consent_unavailable" });
    }
  });

  app.post("/oauth/interaction/:uid", async (request, reply) => {
    if (!requireCanonicalApiHost(request, reply, options.expectedHost)) {
      return;
    }
    if (options.consentAccess === undefined || dependencies === undefined) {
      return reply.status(503).send({ error: "oauth_consent_unavailable" });
    }
    const params = InteractionParamsSchema.safeParse(request.params);
    const body = ConsentDecisionBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }
    if (!(await admitConsentInteraction(request, reply))) {
      return;
    }
    try {
      const session = await dependencies.resolveBrowserSession(request.headers.cookie);
      const completed = await options.consentAccess.complete({
        interactionId: params.data.uid,
        request: request.raw,
        response: reply.raw,
        ...(session === undefined ? {} : { session }),
        decision: body.data.decision,
        productScopes: body.data.product_scopes
      });
      return reply.header("Cache-Control", "no-store").send({
        continue_url: completed.continueUrl
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "openai_consent_session_invalid") {
        return reply.status(401).send({ error: "invalid_session" });
      }
      if (
        message === "openai_consent_session_mismatch" ||
        message === "openai_consent_organization_unavailable"
      ) {
        return reply.status(403).send({ error: "oauth_consent_forbidden" });
      }
      if (
        message === "openai_consent_scopes_invalid" ||
        message === "openai_authorization_interaction_invalid"
      ) {
        return reply.status(400).send({ error: "oauth_interaction_invalid" });
      }
      return reply.status(503).send({ error: "oauth_consent_unavailable" });
    }
  });

  app.route({
    method: ["GET", "POST"],
    url: "/oauth/*",
    handler: relay
  });
}
