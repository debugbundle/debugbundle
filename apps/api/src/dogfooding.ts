import type { FastifyBaseLogger, FastifyInstance } from "fastify";

import { debugbundle, type DebugBundleNodeInitConfig } from "@debugbundle/sdk-node";
import type { ApiDependencies } from "./api-types.js";
import { requireRateLimitedOwnerMemberAuth } from "./api-helpers.js";
import { createRuntimeLoggerFromEnv } from "../../../packages/runtime-logger/src/index.js";

const dogfoodingLogger = createRuntimeLoggerFromEnv({
  app: "api",
  defaultService: "debugbundle-api",
  env: process.env,
  ...(process.env["npm_package_version"] === undefined ? {} : { version: process.env["npm_package_version"] })
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
  fastify(): (fastify: FastifyInstance, options: Record<string, unknown>, done: () => void) => void;
}

type DogfoodingAuthDependencies = Pick<ApiDependencies, "memberAuth" | "webAuth" | "authRateLimiter">;

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

export function resolveApiDogfoodingConfig(env: Record<string, string | undefined>): ApiDogfoodingConfig | null {
  const enabledFlag = parseBooleanFlag(env["DEBUGBUNDLE_DOGFOOD_ENABLED"], "DEBUGBUNDLE_DOGFOOD_ENABLED");
  const projectToken = normalizeText(env["DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN"]);
  if (enabledFlag === false || (enabledFlag !== true && projectToken === null)) {
    return null;
  }

  const apiPort = normalizeText(env["API_PORT"]) ?? "3000";
  const endpoint = projectToken === null
    ? null
    : new URL(
        normalizeText(env["DEBUGBUNDLE_DOGFOOD_ENDPOINT"]) ?? `http://127.0.0.1:${apiPort}/v1/events`
      ).toString();

  return {
    enabled: true,
    deliveryMode: projectToken === null ? "local-only" : "connected",
    projectToken,
    endpoint,
    environment: normalizeText(env["DEBUGBUNDLE_DOGFOOD_ENVIRONMENT"]) ?? normalizeText(env["NODE_ENV"]) ?? "development",
    service: normalizeText(env["DEBUGBUNDLE_DOGFOOD_SERVICE"]) ?? "debugbundle-api",
    exposeTriggers: parseBooleanFlag(env["DEBUGBUNDLE_DOGFOOD_EXPOSE_TRIGGERS"], "DEBUGBUNDLE_DOGFOOD_EXPOSE_TRIGGERS") ?? false,
    exposeOwnerTrigger:
      parseBooleanFlag(
        env["DEBUGBUNDLE_DOGFOOD_EXPOSE_OWNER_TRIGGER"],
        "DEBUGBUNDLE_DOGFOOD_EXPOSE_OWNER_TRIGGER"
      ) ?? false,
    captureConsole: parseBooleanFlag(env["DEBUGBUNDLE_DOGFOOD_CAPTURE_CONSOLE"], "DEBUGBUNDLE_DOGFOOD_CAPTURE_CONSOLE") ?? false
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
        const member = await requireRateLimitedOwnerMemberAuth(request, reply, dependencies, "management-write");
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