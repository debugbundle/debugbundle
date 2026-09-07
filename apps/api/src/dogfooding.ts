import type { FastifyBaseLogger, FastifyInstance } from "fastify";

import {
  debugbundle,
  type CaptureExceptionContext,
  type DebugBundleNodeInitConfig
} from "@debugbundle/sdk-node";
import type { EventEnvelope } from "@debugbundle/shared-types";
import type { ApiDependencies } from "./api-types.js";
import { requireRateLimitedOwnerMemberAuth } from "./api-helpers.js";
import type {
  OpenAiOperationalMonitor,
  OpenAiOperationalSignal
} from "./openai-operational-monitoring.js";
import { createRuntimeLoggerFromEnv } from "../../../packages/runtime-logger/src/index.js";

const dogfoodingLogger = createRuntimeLoggerFromEnv({
  app: "api",
  defaultService: "debugbundle-api",
  env: process.env,
  ...(process.env["npm_package_version"] === undefined
    ? {}
    : { version: process.env["npm_package_version"] })
});

export interface ApiDogfoodingConfig {
  enabled: true;
  deliveryMode: "connected" | "local-only";
  projectToken: string | null;
  endpoint: string | null;
  environment: string;
  service: string;
  exposeTriggers: boolean;
  exposeOwnerTrigger: boolean;
  captureConsole: boolean;
}

export interface ApiDogfoodingSdk {
  init(config: DebugBundleNodeInitConfig): void;
  captureError(error: unknown, context?: CaptureExceptionContext): void;
  fastify(): (fastify: FastifyInstance, options: Record<string, unknown>, done: () => void) => void;
}

type DogfoodingAuthDependencies = Pick<
  ApiDependencies,
  "memberAuth" | "webAuth" | "authRateLimiter"
>;

const OPENAI_OPERATIONAL_EVENT_NAMES = new Set([
  "openai_mcp_request_failure",
  "openai_mcp_request_timeout",
  "openai_mcp_admission_rejected",
  "openai_oauth_request_failure",
  "openai_reviewer_credential_expiring"
]);

export function sanitizeApiDogfoodingEvent(event: EventEnvelope): EventEnvelope {
  if (
    event.event_type !== "backend_exception" ||
    !OPENAI_OPERATIONAL_EVENT_NAMES.has(event.payload.message.split(" ", 1)[0] ?? "")
  ) {
    return event;
  }

  const message = event.payload.message;
  return {
    ...event,
    correlation: {
      request_id: null,
      trace_id: null,
      session_id: null,
      user_id_hash: null
    },
    payload: {
      name: "OpenAiOperationalSignal",
      message,
      stack: `OpenAiOperationalSignal: ${message}`,
      handled: true,
      request: {
        method: "UNKNOWN",
        path: "/",
        query: {},
        headers: {},
        body: null
      },
      response: { status_code: 0 },
      runtime: { version: event.payload.runtime.version }
    }
  };
}

function formatOpenAiOperationalSignal(signal: OpenAiOperationalSignal): string {
  if (signal.category === "reviewer_credential_expiring") {
    return [
      "openai_reviewer_credential_expiring",
      `remaining_days=${Math.floor(signal.remainingDays)}`,
      `expired=${signal.expired ? "true" : "false"}`
    ].join(" ");
  }
  if (signal.category === "oauth_request_failure") {
    return [
      "openai_oauth_request_failure",
      `endpoint=${signal.endpoint}`,
      `status=${signal.status}`,
      `admission=${signal.admission}`
    ].join(" ");
  }
  return [
    `openai_${signal.category}`,
    `method=${signal.method}`,
    `tool=${signal.tool ?? "none"}`,
    `status=${signal.status}`,
    `admission=${signal.admission}`
  ].join(" ");
}

export function createApiDogfoodingOpenAiMonitor(
  sdk: Pick<ApiDogfoodingSdk, "captureError"> = debugbundle
): OpenAiOperationalMonitor {
  return (signal) => {
    const error = new Error(formatOpenAiOperationalSignal(signal));
    error.stack = `${error.name}: ${error.message}`;
    sdk.captureError(error, { handled: true, request: {} });
  };
}

export function createHostedDogfoodingTransport(
  projectToken: string,
  fetchImpl: typeof fetch = globalThis.fetch
): NonNullable<DebugBundleNodeInitConfig["transport"]> {
  return async (request) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeout_ms);

    try {
      const response = await fetchImpl(request.endpoint, {
        method: "POST",
        headers: {
          ...request.headers,
          Authorization: `Bearer ${projectToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ events: request.events }),
        signal: controller.signal
      });

      return {
        status: response.status
      };
    } finally {
      clearTimeout(timeout);
    }
  };
}

function parseBooleanFlag(value: string | undefined, variableName: string): boolean | null {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  throw new Error(`api_dogfooding_invalid_boolean: ${variableName}`);
}

function normalizeText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

export function resolveApiDogfoodingConfig(
  env: Record<string, string | undefined>
): ApiDogfoodingConfig | null {
  const enabledFlag = parseBooleanFlag(
    env["DEBUGBUNDLE_DOGFOOD_ENABLED"],
    "DEBUGBUNDLE_DOGFOOD_ENABLED"
  );
  const projectToken = normalizeText(env["DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN"]);
  if (enabledFlag === false || (enabledFlag !== true && projectToken === null)) {
    return null;
  }

  const apiPort = normalizeText(env["API_PORT"]) ?? "3000";
  const endpoint =
    projectToken === null
      ? null
      : new URL(
          normalizeText(env["DEBUGBUNDLE_DOGFOOD_ENDPOINT"]) ??
            `http://127.0.0.1:${apiPort}/v1/events`
        ).toString();

  return {
    enabled: true,
    deliveryMode: projectToken === null ? "local-only" : "connected",
    projectToken,
    endpoint,
    environment:
      normalizeText(env["DEBUGBUNDLE_DOGFOOD_ENVIRONMENT"]) ??
      normalizeText(env["NODE_ENV"]) ??
      "development",
    service: normalizeText(env["DEBUGBUNDLE_DOGFOOD_SERVICE"]) ?? "debugbundle-api",
    exposeTriggers:
      parseBooleanFlag(
        env["DEBUGBUNDLE_DOGFOOD_EXPOSE_TRIGGERS"],
        "DEBUGBUNDLE_DOGFOOD_EXPOSE_TRIGGERS"
      ) ?? false,
    exposeOwnerTrigger:
      parseBooleanFlag(
        env["DEBUGBUNDLE_DOGFOOD_EXPOSE_OWNER_TRIGGER"],
        "DEBUGBUNDLE_DOGFOOD_EXPOSE_OWNER_TRIGGER"
      ) ?? false,
    captureConsole:
      parseBooleanFlag(
        env["DEBUGBUNDLE_DOGFOOD_CAPTURE_CONSOLE"],
        "DEBUGBUNDLE_DOGFOOD_CAPTURE_CONSOLE"
      ) ?? false
  };
}

export function registerApiDogfooding(
  app: FastifyInstance,
  env: Record<string, string | undefined>,
  dependencies: DogfoodingAuthDependencies,
  sdk: ApiDogfoodingSdk = debugbundle,
  logger: Pick<FastifyBaseLogger, "warn"> = dogfoodingLogger as FastifyBaseLogger
): ApiDogfoodingConfig | null {
  try {
    const config = resolveApiDogfoodingConfig(env);
    if (config === null) {
      return null;
    }

    if (config.projectToken !== null && config.endpoint !== null) {
      sdk.init({
        projectToken: config.projectToken,
        endpoint: config.endpoint,
        environment: config.environment,
        service: config.service,
        framework: "fastify",
        captureConsole: config.captureConsole,
        projectMode: config.deliveryMode,
        beforeSend: sanitizeApiDogfoodingEvent,
        transport: createHostedDogfoodingTransport(config.projectToken)
      });
      sdk.fastify()(app, {}, () => undefined);
    }

    if (config.exposeTriggers) {
      app.get("/__dogfood/backend-error", (_request, reply) => {
        reply.code(500);
        throw new Error("debugbundle_dogfood_backend_exception");
      });
    }

    if (config.exposeOwnerTrigger) {
      app.post("/v1/internal/dogfooding/backend-error", async (request, reply) => {
        const member = await requireRateLimitedOwnerMemberAuth(
          request,
          reply,
          dependencies,
          "management-write"
        );
        if (member === null) {
          return;
        }

        if (member === "forbidden") {
          return reply.status(403).send({ error: "forbidden" });
        }

        reply.code(500);
        throw new Error("debugbundle_dogfood_backend_exception");
      });
    }

    return config;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_dogfooding_error";
    logger.warn({ error_message: message }, "api_dogfooding_disabled");
    return null;
  }
}
