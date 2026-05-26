import { debugbundle, type DebugBundleNodeInitConfig } from "@debugbundle/sdk-node";

import { createRuntimeLoggerFromEnv, getErrorMessage } from "../../../packages/runtime-logger/src/index.js";

const dogfoodingLogger = createRuntimeLoggerFromEnv({
  app: "worker",
  defaultService: "debugbundle-worker",
  env: process.env,
  ...(process.env["npm_package_version"] === undefined ? {} : { version: process.env["npm_package_version"] })
});

let workerDogfoodingEnabled = false;

export interface WorkerDogfoodingConfig {
  enabled: true;
  deliveryMode: "connected" | "local-only";
  projectToken: string | null;
  endpoint: string | null;
  environment: string;
  service: string;
  captureConsole: boolean;
}

export interface WorkerDogfoodingSdk {
  init(config: DebugBundleNodeInitConfig): void;
  captureError(error: unknown, context?: { handled?: boolean }): void;
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

  throw new Error(`worker_dogfooding_invalid_boolean: ${variableName}`);
}

function normalizeText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

function resolveDogfoodingEndpoint(env: Record<string, string | undefined>, projectToken: string | null): string | null {
  if (projectToken === null) {
    return null;
  }

  const explicitEndpoint = normalizeText(env["DEBUGBUNDLE_WORKER_DOGFOOD_ENDPOINT"]);
  if (explicitEndpoint !== null) {
    return new URL(explicitEndpoint).toString();
  }

  const apiBaseUrl = normalizeText(env["DEBUGBUNDLE_API_URL"])
    ?? normalizeText(env["API_BASE_URL"])
    ?? normalizeText(env["VITE_API_URL"]);
  if (apiBaseUrl === null) {
    throw new Error("worker_dogfooding_missing_api_url");
  }

  return new URL("/v1/events", apiBaseUrl).toString();
}

export function resolveWorkerDogfoodingConfig(env: Record<string, string | undefined>): WorkerDogfoodingConfig | null {
  const enabledFlag = parseBooleanFlag(
    env["DEBUGBUNDLE_WORKER_DOGFOOD_ENABLED"],
    "DEBUGBUNDLE_WORKER_DOGFOOD_ENABLED"
  );
  const projectToken = normalizeText(env["DEBUGBUNDLE_WORKER_DOGFOOD_PROJECT_TOKEN"]);
  if (enabledFlag === false || (enabledFlag !== true && projectToken === null)) {
    return null;
  }

  return {
    enabled: true,
    deliveryMode: projectToken === null ? "local-only" : "connected",
    projectToken,
    endpoint: resolveDogfoodingEndpoint(env, projectToken),
    environment:
      normalizeText(env["DEBUGBUNDLE_WORKER_DOGFOOD_ENVIRONMENT"])
      ?? normalizeText(env["NODE_ENV"])
      ?? "development",
    service: normalizeText(env["DEBUGBUNDLE_WORKER_DOGFOOD_SERVICE"]) ?? "debugbundle-worker",
    captureConsole:
      parseBooleanFlag(
        env["DEBUGBUNDLE_WORKER_DOGFOOD_CAPTURE_CONSOLE"],
        "DEBUGBUNDLE_WORKER_DOGFOOD_CAPTURE_CONSOLE"
      ) ?? false
  };
}

export function registerWorkerDogfooding(
  env: Record<string, string | undefined>,
  sdk: WorkerDogfoodingSdk = debugbundle,
  logger: Pick<typeof dogfoodingLogger, "warn"> = dogfoodingLogger
): WorkerDogfoodingConfig | null {
  workerDogfoodingEnabled = false;

  try {
    const config = resolveWorkerDogfoodingConfig(env);
    if (config === null) {
      return null;
    }

    if (config.projectToken !== null && config.endpoint !== null) {
      sdk.init({
        projectToken: config.projectToken,
        endpoint: config.endpoint,
        environment: config.environment,
        service: config.service,
        framework: "worker",
        captureConsole: config.captureConsole,
        projectMode: config.deliveryMode,
        transport: createHostedDogfoodingTransport(config.projectToken)
      });
      workerDogfoodingEnabled = true;
    }

    return config;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_dogfooding_error";
    logger.warn({ error_message: message }, "worker_dogfooding_disabled");
    return null;
  }
}

export function captureWorkerDogfoodingStepFailure(
  jobName: string,
  error: unknown,
  sdk: WorkerDogfoodingSdk = debugbundle
): void {
  if (!workerDogfoodingEnabled) {
    return;
  }

  const message = getErrorMessage(error, "unknown_worker_step_error");
  const reportedError = new Error(`worker_step_failed:${jobName}:${message}`);

  if (error instanceof Error && typeof error.stack === "string" && error.stack.length > 0) {
    reportedError.stack = error.stack;
  }

  sdk.captureError(reportedError, { handled: true });
}
