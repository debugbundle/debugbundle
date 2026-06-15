import { createDebugBundleBrowserSdk, type DebugBundleBrowserInitConfig, type DebugBundleBrowserSdk } from "@debugbundle/sdk-browser";

export interface WebDogfoodingEnv {
  DEV?: boolean;
  MODE?: string;
  VITE_API_URL?: string;
  VITE_DEBUGBUNDLE_DOGFOOD_ENABLED?: string;
  VITE_DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN?: string;
  VITE_DEBUGBUNDLE_DOGFOOD_ENDPOINT?: string;
  VITE_DEBUGBUNDLE_DOGFOOD_SERVICE?: string;
  VITE_DEBUGBUNDLE_DOGFOOD_ENVIRONMENT?: string;
  VITE_DEBUGBUNDLE_DOGFOOD_EXPOSE_TRIGGERS?: string;
  VITE_DEBUGBUNDLE_DOGFOOD_CAPTURE_CONSOLE?: string;
}

export interface WebDogfoodingConfig {
  enabled: true;
  projectToken: string | null;
  endpoint: string;
  environment: string;
  service: string;
  exposeTriggers: boolean;
  captureConsole: boolean;
}

export interface DogfoodingWindowTarget {
  setTimeout(handler: () => void, timeout?: number): unknown;
  __DEBUGBUNDLE_DOGFOOD__?: {
    triggerFrontendException(message?: string): void;
  };
}

type WebDogfoodingSdk = Pick<DebugBundleBrowserSdk, "init"> &
  Partial<Pick<DebugBundleBrowserSdk, "captureException" | "flush">>;

const browserDogfoodingSdk = createDebugBundleBrowserSdk();

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

  throw new Error(`web_dogfooding_invalid_boolean: ${variableName}`);
}

function normalizeText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isRelayEndpoint(value: string): boolean {
  return !isAbsoluteHttpUrl(value);
}

function resolveDogfoodingEndpoint(env: WebDogfoodingEnv): string {
  const explicitEndpoint = normalizeText(env.VITE_DEBUGBUNDLE_DOGFOOD_ENDPOINT);
  if (explicitEndpoint !== null) {
    return isAbsoluteHttpUrl(explicitEndpoint) ? new URL(explicitEndpoint).toString() : explicitEndpoint;
  }

  if (env.DEV) {
    return "/debugbundle/browser";
  }

  const apiBaseUrl = normalizeText(env.VITE_API_URL);
  if (apiBaseUrl === null) {
    throw new Error("web_dogfooding_missing_api_url");
  }

  return new URL("/v1/events", apiBaseUrl).toString();
}

function resolveTracePropagationTargets(env: WebDogfoodingEnv): string[] | undefined {
  const apiBaseUrl = normalizeText(env.VITE_API_URL);
  if (apiBaseUrl === null || !isAbsoluteHttpUrl(apiBaseUrl)) {
    return undefined;
  }

  return [new URL(apiBaseUrl).toString()];
}

export function resolveWebDogfoodingConfig(env: WebDogfoodingEnv): WebDogfoodingConfig | null {
  const enabledFlag = parseBooleanFlag(env.VITE_DEBUGBUNDLE_DOGFOOD_ENABLED, "VITE_DEBUGBUNDLE_DOGFOOD_ENABLED");
  if (enabledFlag === false) {
    return null;
  }

  const endpoint = resolveDogfoodingEndpoint(env);
  const projectToken = normalizeText(env.VITE_DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN);
  if (!isRelayEndpoint(endpoint) && projectToken === null) {
    return null;
  }

  if (isRelayEndpoint(endpoint) && enabledFlag !== true && projectToken === null) {
    return null;
  }

  return {
    enabled: true,
    projectToken,
    endpoint,
    environment: normalizeText(env.VITE_DEBUGBUNDLE_DOGFOOD_ENVIRONMENT) ?? normalizeText(env.MODE) ?? "development",
    service: normalizeText(env.VITE_DEBUGBUNDLE_DOGFOOD_SERVICE) ?? "debugbundle-web",
    exposeTriggers:
      parseBooleanFlag(env.VITE_DEBUGBUNDLE_DOGFOOD_EXPOSE_TRIGGERS, "VITE_DEBUGBUNDLE_DOGFOOD_EXPOSE_TRIGGERS") ?? false,
    captureConsole:
      parseBooleanFlag(env.VITE_DEBUGBUNDLE_DOGFOOD_CAPTURE_CONSOLE, "VITE_DEBUGBUNDLE_DOGFOOD_CAPTURE_CONSOLE") ?? false
  };
}

export function initializeWebDogfooding(
  env: WebDogfoodingEnv,
  target: DogfoodingWindowTarget = window,
  sdk: WebDogfoodingSdk = browserDogfoodingSdk,
  warn: (message: string) => void = console.warn
): WebDogfoodingConfig | null {
  try {
    const config = resolveWebDogfoodingConfig(env);
    if (config === null) {
      delete target.__DEBUGBUNDLE_DOGFOOD__;
      return null;
    }
    const tracePropagationTargets = resolveTracePropagationTargets(env);

    sdk.init({
      ...(config.projectToken === null || isRelayEndpoint(config.endpoint) ? {} : { projectToken: config.projectToken }),
      endpoint: config.endpoint,
      environment: config.environment,
      service: config.service,
      captureConsole: config.captureConsole,
      breadcrumbsOnErrorOnly: false,
      ...(tracePropagationTargets === undefined ? {} : { tracePropagationTargets })
    } satisfies DebugBundleBrowserInitConfig);

    if (config.exposeTriggers) {
      target.__DEBUGBUNDLE_DOGFOOD__ = {
        triggerFrontendException(message = "debugbundle_dogfood_frontend_exception"): void {
          const error = new Error(message);

          if (typeof sdk.captureException === "function") {
            sdk.captureException(error);
            void sdk.flush?.();
            return;
          }

          target.setTimeout(() => {
            throw error;
          }, 0);
        }
      };
    } else {
      delete target.__DEBUGBUNDLE_DOGFOOD__;
    }

    return config;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_dogfooding_error";
    delete target.__DEBUGBUNDLE_DOGFOOD__;
    warn(`web_dogfooding_disabled: ${message}`);
    return null;
  }
}
