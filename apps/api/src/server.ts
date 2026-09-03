import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";

import { debugBundleRelayPlugin } from "@debugbundle/sdk-node/relay/fastify";
import {
  SESSION_COOKIE_NAME,
  isValidCsrfToken,
  readCookieValue
} from "../../../packages/auth/src/index.js";
import type { RuntimeLogger } from "../../../packages/runtime-logger/src/index.js";
import { ANALYTICS_BUNDLE_GENERATION_ID_HEADER } from "../../../packages/shared-types/src/index.js";

import type { ApiDependencies } from "./api-types.js";
import { resolveBrowserSession } from "./api-helpers.js";
import { registerOpenAiMcpHttpRoutes, type OpenAiMcpHttpOptions } from "./openai-mcp-http.js";
import { registerOpenAiOAuthHttpRoutes, type OpenAiOAuthHttpOptions } from "./openai-oauth-http.js";
import {
  registerApiDogfooding,
  resolveApiDogfoodingConfig,
  type ApiDogfoodingSdk
} from "./dogfooding.ts";
import { SMALL_REQUEST_BODY_LIMIT_BYTES } from "./http-limits.ts";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAlertRoutes } from "./routes/alerts.js";
import { registerAccountRoutes } from "./routes/account.js";
import { registerAdminAnalyticsRoutes } from "./routes/admin-analytics.js";
import { registerAdminBillingRoutes } from "./routes/admin-billing.js";
import { registerAnalyticsRoutes } from "./routes/analytics.js";
import { registerAnalyticsSettingsRoutes } from "./routes/analytics-settings.js";
import { registerAnalyticsSavedFunnelRoutes } from "./routes/analytics-saved-funnels.js";
import { registerAvailabilityCheckRoutes } from "./routes/availability-checks.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerCapturePolicyRoutes } from "./routes/capture-policy.js";
import { registerCaptureRuleRoutes } from "./routes/capture-rules.js";
import { registerGitHubRoutes } from "./routes/github.js";
import { registerHealthRoutes } from "./routes/health.js";
import {
  registerGitHubMarketplaceWebhookRoute,
  type GitHubMarketplaceWebhookDependencies
} from "./routes/github-marketplace-webhook.js";
import { registerImprovementRoutes } from "./routes/improvements.js";
import { registerImprovementSettingsRoutes } from "./routes/improvement-settings.js";
import { registerProjectMemberRoutes } from "./routes/project-members.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerProbeRoutes } from "./routes/probes.js";
import { registerSystemEmailReviewRoutes } from "./routes/system-email-review.js";
import { registerServicesRoutes } from "./routes/services.js";
import { registerSlackRoutes } from "./routes/slack.js";
import {
  registerStripeWebhookRoute,
  type StripeWebhookDependencies
} from "./routes/stripe-webhook.js";
import { registerTokenRoutes } from "./routes/tokens.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { registerWeeklyReportChannelRoutes } from "./routes/weekly-report-channels.js";
import { registerIncidentRoutes } from "./routes/incidents.js";
import { registerIngestionRoutes } from "./routes/ingestion.js";
import { registerOpenAiConnectionRoutes } from "./routes/openai-connections.js";

export type { ApiDependencies } from "./api-types.js";

export interface ApiServerOptions {
  dogfoodingEnv?: Record<string, string | undefined>;
  dogfoodingSdk?: ApiDogfoodingSdk;
  logger?: FastifyBaseLogger | RuntimeLogger;
  requestTimeoutMs?: number;
  relayFetchImpl?: typeof fetch;
  stripeWebhook?: StripeWebhookDependencies;
  githubMarketplaceWebhook?: GitHubMarketplaceWebhookDependencies;
  readinessCheck?: () => Promise<void>;
  openAiMcp?: OpenAiMcpHttpOptions;
  openAiOAuth?: OpenAiOAuthHttpOptions;
}

const ALLOWED_CORS_HEADERS = [
  "Authorization",
  "Content-Type",
  "X-CSRF-Token",
  "X-DebugBundle-Analytics-Config",
  "X-Debugbundle-Trace-Id"
];
const ALLOWED_CORS_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const SDK_PROJECT_TOKEN_CORS_PATHS = new Set(["/v1/events", "/v1/sdk/config"]);
const DEFAULT_API_REQUEST_TIMEOUT_MS = 30_000;
const API_SEARCH_CRAWLER_POLICY = "noindex, nofollow, noarchive";
const CONTENT_LENGTH_HEADER = "content-length";
const apiRequestTimeouts = new WeakMap<object, NodeJS.Timeout>();
const CSRF_EXEMPT_ROUTE_KEYS = new Set([
  "POST /v1/auth/request-code",
  "POST /v1/auth/verify-code",
  "POST /v1/auth/github/device/start",
  "POST /v1/auth/github/device/poll",
  "POST /v1/auth/github/device/claim",
  "POST /v1/auth/github/token/exchange",
  "POST /debugbundle/browser",
  "POST /oauth/*"
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
  const current = Array.isArray(existing)
    ? existing.join(", ")
    : typeof existing === "string"
      ? existing
      : "";
  const entries = current
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.includes(value)) {
    return entries.join(", ");
  }

  return [...entries, value].join(", ");
}

function isCorsPreflightRequest(request: {
  method: string;
  headers: Record<string, unknown>;
}): boolean {
  return (
    request.method === "OPTIONS" &&
    typeof request.headers["access-control-request-method"] === "string"
  );
}

function getRequestPath(url: string): string {
  try {
    return new URL(url, "http://debugbundle.local").pathname;
  } catch {
    return url;
  }
}

function isSdkProjectTokenCorsRequest(request: { url: string }): boolean {
  return SDK_PROJECT_TOKEN_CORS_PATHS.has(getRequestPath(request.url));
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
    const requestOrigin =
      typeof request.headers.origin === "string" ? request.headers.origin : undefined;

    if (requestOrigin === undefined) {
      return;
    }

    reply.header("Vary", appendVaryHeader(reply.getHeader("Vary"), "Origin"));

    if (!allowedOrigins.includes(requestOrigin)) {
      if (isSdkProjectTokenCorsRequest(request) && normalizeOrigin(requestOrigin) !== null) {
        reply.header("Access-Control-Allow-Origin", requestOrigin);

        if (!isCorsPreflightRequest(request)) {
          return;
        }

        reply.header(
          "Vary",
          appendVaryHeader(reply.getHeader("Vary"), "Access-Control-Request-Method")
        );
        reply.header(
          "Vary",
          appendVaryHeader(reply.getHeader("Vary"), "Access-Control-Request-Headers")
        );
        reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        reply.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
        reply.header("Access-Control-Max-Age", "86400");

        return reply.status(204).send();
      }

      if (isCorsPreflightRequest(request)) {
        return reply.status(403).send({ error: "cors_origin_not_allowed" });
      }

      return;
    }

    reply.header("Access-Control-Allow-Origin", requestOrigin);
    reply.header("Access-Control-Allow-Credentials", "true");
    reply.header("Access-Control-Expose-Headers", ANALYTICS_BUNDLE_GENERATION_ID_HEADER);

    if (!isCorsPreflightRequest(request)) {
      return;
    }

    reply.header(
      "Vary",
      appendVaryHeader(reply.getHeader("Vary"), "Access-Control-Request-Method")
    );
    reply.header(
      "Vary",
      appendVaryHeader(reply.getHeader("Vary"), "Access-Control-Request-Headers")
    );
    reply.header("Access-Control-Allow-Methods", ALLOWED_CORS_METHODS.join(", "));
    reply.header("Access-Control-Allow-Headers", ALLOWED_CORS_HEADERS.join(", "));
    reply.header("Access-Control-Max-Age", "86400");

    return reply.status(204).send();
  });
}

function registerApiSearchCrawlerControls(app: FastifyInstance): void {
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Robots-Tag", API_SEARCH_CRAWLER_POLICY);
    return payload;
  });
}

function parseContentLengthHeader(value: unknown): number | null {
  let rawValue: string;
  if (typeof value === "string") {
    rawValue = value;
  } else if (Array.isArray(value)) {
    const values = value as readonly unknown[];
    const firstValue = values[0];
    if (typeof firstValue !== "string") {
      return null;
    }
    rawValue = firstValue;
  } else {
    return null;
  }

  if (rawValue.trim().length === 0) {
    return null;
  }

  const parsed = Number(rawValue);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function registerApiContentLengthLimit(app: FastifyInstance, limitBytes: number): void {
  app.addHook("onRequest", async (request, reply) => {
    const declaredLength = parseContentLengthHeader(request.headers[CONTENT_LENGTH_HEADER]);
    if (declaredLength === null || declaredLength <= limitBytes) {
      return;
    }

    if (getRequestPath(request.url) === "/v1/events") {
      return reply.status(413).send({
        accepted: 0,
        rejected: 0,
        errors: [
          {
            index: -1,
            reason: "payload_too_large"
          }
        ]
      });
    }

    return reply.status(413).send({ error: "payload_too_large" });
  });
}

export function createApiServer(
  dependencies: ApiDependencies,
  options: ApiServerOptions = {}
): FastifyInstance {
  const app: FastifyInstance = Fastify({
    ...(options.logger === undefined
      ? { logger: false }
      : { loggerInstance: options.logger as FastifyBaseLogger }),
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
  registerApiSearchCrawlerControls(app);
  registerApiContentLengthLimit(app, SMALL_REQUEST_BODY_LIMIT_BYTES);
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
  registerAdminAnalyticsRoutes(app, dependencies);
  registerAdminBillingRoutes(app, dependencies);
  registerAuthRoutes(app, dependencies);
  registerBillingRoutes(app, dependencies);
  registerGitHubRoutes(app, dependencies);
  registerHealthRoutes(app, dependencies, context);
  registerProjectMemberRoutes(app, dependencies);
  registerProjectRoutes(app, dependencies);
  registerAvailabilityCheckRoutes(app, dependencies);
  registerProbeRoutes(app, dependencies);
  registerSystemEmailReviewRoutes(app, dependencies, dogfoodingEnv);
  registerSlackRoutes(app, dependencies);
  registerTokenRoutes(app, dependencies);
  registerAlertRoutes(app, dependencies);
  registerAnalyticsRoutes(app, dependencies);
  registerAnalyticsSettingsRoutes(app, dependencies);
  registerAnalyticsSavedFunnelRoutes(app, dependencies);
  registerCapturePolicyRoutes(app, dependencies);
  registerCaptureRuleRoutes(app, dependencies);
  registerImprovementSettingsRoutes(app, dependencies);
  registerWeeklyReportChannelRoutes(app, dependencies);
  registerWebhookRoutes(app, dependencies);
  registerServicesRoutes(app, dependencies);
  registerIncidentRoutes(app, dependencies);
  registerImprovementRoutes(app, dependencies);
  registerIngestionRoutes(app, dependencies);

  if (options.openAiMcp !== undefined) {
    registerOpenAiMcpHttpRoutes(app, options.openAiMcp);
  }
  if (options.openAiOAuth !== undefined) {
    if (options.openAiOAuth.connectionStore !== undefined) {
      registerOpenAiConnectionRoutes(app, dependencies, options.openAiOAuth.connectionStore);
    }
    registerOpenAiOAuthHttpRoutes(app, options.openAiOAuth, {
      async resolveBrowserSession(cookieHeader) {
        const session = await resolveBrowserSession(cookieHeader, dependencies);
        return session === null
          ? undefined
          : {
              userId: session.user_id,
              organizationId: session.organization_id,
              emailVerified: session.email_verified_at !== null
            };
      }
    });
  }

  if (options.stripeWebhook !== undefined) {
    registerStripeWebhookRoute(app, options.stripeWebhook);
  }
  if (options.githubMarketplaceWebhook !== undefined) {
    registerGitHubMarketplaceWebhookRoute(app, options.githubMarketplaceWebhook);
  }

  return app;
}
