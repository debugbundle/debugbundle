import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";

import { debugBundleRelayPlugin } from "@debugbundle/sdk-node/relay/fastify";
import { SESSION_COOKIE_NAME, isValidCsrfToken, readCookieValue } from "../../../packages/auth/src/index.js";
import type { RuntimeLogger } from "../../../packages/runtime-logger/src/index.js";

import type { ApiDependencies } from "./api-types.js";
import { registerApiDogfooding, resolveApiDogfoodingConfig, type ApiDogfoodingSdk } from "./dogfooding.ts";
import { SMALL_REQUEST_BODY_LIMIT_BYTES } from "./http-limits.ts";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAlertRoutes } from "./routes/alerts.js";
import { registerAccountRoutes } from "./routes/account.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerCapturePolicyRoutes } from "./routes/capture-policy.js";
import { registerGitHubRoutes } from "./routes/github.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerImprovementRoutes } from "./routes/improvements.js";
import { registerImprovementSettingsRoutes } from "./routes/improvement-settings.js";
import { registerProjectMemberRoutes } from "./routes/project-members.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerProbeRoutes } from "./routes/probes.js";
import { registerServicesRoutes } from "./routes/services.js";
import { registerSlackRoutes } from "./routes/slack.js";
import { registerStripeWebhookRoute, type StripeWebhookDependencies } from "./routes/stripe-webhook.js";
import { registerTokenRoutes } from "./routes/tokens.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { registerWeeklyReportChannelRoutes } from "./routes/weekly-report-channels.js";
import { registerIncidentRoutes } from "./routes/incidents.js";
import { registerIngestionRoutes } from "./routes/ingestion.js";

export type { ApiDependencies } from "./api-types.js";

export interface ApiServerOptions {
  dogfoodingEnv?: Record<string, string | undefined>;
  dogfoodingSdk?: ApiDogfoodingSdk;
  logger?: FastifyBaseLogger | RuntimeLogger;
  requestTimeoutMs?: number;
  relayFetchImpl?: typeof fetch;
  stripeWebhook?: StripeWebhookDependencies;
  readinessCheck?: () => Promise<void>;
}

const ALLOWED_CORS_HEADERS = ["Authorization", "Content-Type", "X-CSRF-Token"];
const ALLOWED_CORS_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const DEFAULT_API_REQUEST_TIMEOUT_MS = 30_000;
const apiRequestTimeouts = new WeakMap<object, NodeJS.Timeout>();
const CSRF_EXEMPT_ROUTE_KEYS = new Set([
  "POST /v1/auth/request-code",
  "POST /v1/auth/verify-code",
  "POST /v1/auth/github/device/start",
  "POST /v1/auth/github/device/poll",
  "POST /v1/auth/github/device/claim",
  "POST /v1/auth/github/token/exchange",
  "POST /debugbundle/browser"
]);

function normalizeOrigin(value: string | undefined, fallback: string | null = null): string | null {
  const candidate = value?.trim() ?? fallback;
  if (candidate === null || candidate.length === 0) {
    return null;
  }

  try {
    return new URL(candidate).origin;
  } catch {
    return fallback;
  }
}

function resolveAllowedCorsOrigins(env: Record<string, string | undefined>): string[] {
  const origins = new Set<string>();

  const appOrigin = normalizeOrigin(env["APP_BASE_URL"], "http://localhost:5291");
  if (appOrigin !== null) {
    origins.add(appOrigin);
  }

  const publicSiteOrigin = normalizeOrigin(env["PUBLIC_SITE_URL"]);
  if (publicSiteOrigin !== null) {
    origins.add(publicSiteOrigin);
  }

  return [...origins];
}

function appendVaryHeader(existing: string | string[] | number | undefined, value: string): string {
  const current = Array.isArray(existing) ? existing.join(", ") : typeof existing === "string" ? existing : "";
  const entries = current
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.includes(value)) {
    return entries.join(", ");
  }

  return [...entries, value].join(", ");
}

function isCorsPreflightRequest(request: { method: string; headers: Record<string, unknown> }): boolean {
  return request.method === "OPTIONS" && typeof request.headers["access-control-request-method"] === "string";
}

function isStateChangingMethod(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

function registerApiRequestTimeout(app: FastifyInstance, timeoutMs: number): void {
  app.addHook("onRequest", async (request, reply) => {
    const timer = setTimeout(() => {
      if (reply.sent || reply.raw.writableEnded || reply.raw.destroyed) {
        return;
      }

      reply.hijack();
      reply.raw.statusCode = 503;
      reply.raw.setHeader("content-type", "application/json; charset=utf-8");
      reply.raw.end(JSON.stringify({ error: "request_timeout" }));
    }, timeoutMs);

    apiRequestTimeouts.set(reply.raw, timer);

    reply.raw.once("close", () => {
      clearTimeout(timer);
      apiRequestTimeouts.delete(reply.raw);
    });
  });

  app.addHook("onResponse", async (_request, reply) => {
    const timer = apiRequestTimeouts.get(reply.raw);
    if (timer !== undefined) {
      clearTimeout(timer);
      apiRequestTimeouts.delete(reply.raw);
    }
  });
}

function registerApiCsrfProtection(app: FastifyInstance): void {
  app.addHook("preValidation", async (request, reply) => {
    if (!isStateChangingMethod(request.method)) {
      return;
    }

    if (request.headers.authorization !== undefined) {
      return;
    }

    const sessionToken = readCookieValue(request.headers.cookie, SESSION_COOKIE_NAME);
    if (sessionToken === null) {
      return;
    }

    const routeKey = `${request.method} ${request.routeOptions.url}`;
    if (CSRF_EXEMPT_ROUTE_KEYS.has(routeKey)) {
      return;
    }

    const csrfTokenHeader = request.headers["x-csrf-token"];
    const csrfToken = typeof csrfTokenHeader === "string" ? csrfTokenHeader : undefined;
    if (csrfToken === undefined || !isValidCsrfToken(sessionToken, csrfToken)) {
      return reply.status(403).send({ error: "invalid_csrf_token" });
    }
  });
}

function registerApiCors(app: FastifyInstance, allowedOrigins: string[]): void {
  app.addHook("onRequest", async (request, reply) => {
    const requestOrigin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;

    if (requestOrigin === undefined) {
      return;
    }

    reply.header("Vary", appendVaryHeader(reply.getHeader("Vary"), "Origin"));

    if (!allowedOrigins.includes(requestOrigin)) {
      if (isCorsPreflightRequest(request)) {
        return reply.status(403).send({ error: "cors_origin_not_allowed" });
      }

      return;
    }

    reply.header("Access-Control-Allow-Origin", requestOrigin);
    reply.header("Access-Control-Allow-Credentials", "true");

    if (!isCorsPreflightRequest(request)) {
      return;
    }

    reply.header("Vary", appendVaryHeader(reply.getHeader("Vary"), "Access-Control-Request-Method"));
    reply.header("Vary", appendVaryHeader(reply.getHeader("Vary"), "Access-Control-Request-Headers"));
    reply.header("Access-Control-Allow-Methods", ALLOWED_CORS_METHODS.join(", "));
    reply.header("Access-Control-Allow-Headers", ALLOWED_CORS_HEADERS.join(", "));
    reply.header("Access-Control-Max-Age", "86400");

    return reply.status(204).send();
  });
}

export function createApiServer(dependencies: ApiDependencies, options: ApiServerOptions = {}): FastifyInstance {
  const app: FastifyInstance = Fastify({
    ...(options.logger === undefined ? { logger: false } : { loggerInstance: options.logger as FastifyBaseLogger }),
    bodyLimit: SMALL_REQUEST_BODY_LIMIT_BYTES
  });
  const dogfoodingEnv = options.dogfoodingEnv ?? process.env;
  const dogfoodingConfig = resolveApiDogfoodingConfig(dogfoodingEnv);
  const allowedOrigins = resolveAllowedCorsOrigins(dogfoodingEnv);
  const context = {
    startedAtMs: Date.now(),
    apiVersion: process.env["npm_package_version"] ?? "0.1.0",
    ...(options.readinessCheck === undefined ? {} : { readinessCheck: options.readinessCheck })
  };
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_API_REQUEST_TIMEOUT_MS;

  registerApiCors(app, allowedOrigins);
  registerApiRequestTimeout(app, requestTimeoutMs);
  registerApiCsrfProtection(app);

  debugBundleRelayPlugin(
    app,
    {
      allowedOrigins,
      projectMode: dogfoodingConfig?.deliveryMode ?? "local-only",
      ...(dogfoodingConfig?.projectToken === null || dogfoodingConfig?.projectToken === undefined
        ? {}
        : { projectToken: dogfoodingConfig.projectToken }),
      ...(dogfoodingConfig?.endpoint === null || dogfoodingConfig?.endpoint === undefined
        ? {}
        : { endpoint: dogfoodingConfig.endpoint }),
      ...(options.relayFetchImpl === undefined ? {} : { fetchImpl: options.relayFetchImpl })
    },
    () => undefined
  );

  registerApiDogfooding(app, dogfoodingEnv, dependencies, options.dogfoodingSdk, app.log);

  registerAccountRoutes(app, dependencies);
  registerAuthRoutes(app, dependencies);
  registerBillingRoutes(app, dependencies);
  registerGitHubRoutes(app, dependencies);
  registerHealthRoutes(app, dependencies, context);
  registerProjectMemberRoutes(app, dependencies);
  registerProjectRoutes(app, dependencies);
  registerProbeRoutes(app, dependencies);
  registerSlackRoutes(app, dependencies);
  registerTokenRoutes(app, dependencies);
  registerAlertRoutes(app, dependencies);
  registerCapturePolicyRoutes(app, dependencies);
  registerImprovementSettingsRoutes(app, dependencies);
  registerWeeklyReportChannelRoutes(app, dependencies);
  registerWebhookRoutes(app, dependencies);
  registerServicesRoutes(app, dependencies);
  registerIncidentRoutes(app, dependencies);
  registerImprovementRoutes(app, dependencies);
  registerIngestionRoutes(app, dependencies);

  if (options.stripeWebhook !== undefined) {
    registerStripeWebhookRoute(app, options.stripeWebhook);
  }

  return app;
}
