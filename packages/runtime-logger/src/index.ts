import pino, { type LevelWithSilent, type Logger } from "pino";

export type RuntimeApp = "api" | "worker";
export type RuntimeLogger = Logger;

export interface CreateRuntimeLoggerInput {
  app: RuntimeApp;
  environment: string;
  service: string;
  level?: LevelWithSilent;
  version?: string;
}

export interface CreateRuntimeLoggerFromEnvInput {
  app: RuntimeApp;
  defaultService: string;
  env: Record<string, string | undefined>;
  version?: string;
}

const DEFAULT_LOG_LEVEL: LevelWithSilent = "info";
const VALID_LOG_LEVELS = new Set<LevelWithSilent>([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent"
]);

function normalizeText(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    return message.length > 0 ? message : fallback;
  }

  return fallback;
}

export function resolveRuntimeLogLevel(env: Record<string, string | undefined>): LevelWithSilent {
  const configured = normalizeText(env["DEBUGBUNDLE_LOG_LEVEL"]);
  if (configured === null) {
    return DEFAULT_LOG_LEVEL;
  }

  return VALID_LOG_LEVELS.has(configured as LevelWithSilent)
    ? (configured as LevelWithSilent)
    : DEFAULT_LOG_LEVEL;
}

export function resolveRuntimeEnvironment(env: Record<string, string | undefined>): string {
  return normalizeText(env["DEBUGBUNDLE_LOG_ENVIRONMENT"])
    ?? normalizeText(env["NODE_ENV"])
    ?? "development";
}

export function resolveRuntimeService(
  env: Record<string, string | undefined>,
  defaultService: string
): string {
  return normalizeText(env["DEBUGBUNDLE_LOG_SERVICE"]) ?? defaultService;
}

export function createRuntimeLogger(input: CreateRuntimeLoggerInput): RuntimeLogger {
  return pino({
    level: input.level ?? DEFAULT_LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      app: input.app,
      environment: input.environment,
      service: input.service,
      ...(input.version === undefined ? {} : { version: input.version })
    },
    formatters: {
      level(label) {
        return { level: label };
      }
    },
    serializers: {
      err: pino.stdSerializers.err
    }
  });
}

export function createRuntimeLoggerFromEnv(input: CreateRuntimeLoggerFromEnvInput): RuntimeLogger {
  return createRuntimeLogger({
    app: input.app,
    environment: resolveRuntimeEnvironment(input.env),
    service: resolveRuntimeService(input.env, input.defaultService),
    level: resolveRuntimeLogLevel(input.env),
    ...(input.version === undefined ? {} : { version: input.version })
  });
}