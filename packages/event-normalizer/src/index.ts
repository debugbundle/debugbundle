import { createHash } from "node:crypto";

import { redact, type JsonValue } from "../../redaction/src/index.js";
import {
  EventEnvelopeSchema,
  classifyRequestStatus,
  type CapturePreset,
  type EventEnvelope,
  type EventClass
} from "../../shared-types/src/index.js";

export interface NormalizedEvent {
  event_type: EventEnvelope["event_type"];
  environment: string;
  error_type: string | null;
  normalized_message: string;
  route_template: string | null;
  http_method: string | null;
  http_status: number | null;
  top_frames: string[];
  browser_event_kind?: "window_error" | "resource_error" | null;
  resource_host?: string | null;
  resource_path?: string | null;
  payload: unknown;
}

export const FINGERPRINT_VERSION = "v1";

export function inferMatchedFields(event: NormalizedEvent): string[] {
  const matchedFields: string[] = ["environment", "normalized_message"];

  if (event.error_type !== null) {
    matchedFields.push("error_type");
  }

  if (event.route_template !== null) {
    matchedFields.push("route_template");
  }

  if (event.top_frames.length > 0) {
    matchedFields.push("top_frames");
  }

  if (event.browser_event_kind != null) {
    matchedFields.push("browser_event_kind");
  }

  if (event.resource_host != null) {
    matchedFields.push("resource_host");
  }

  if (event.resource_path != null) {
    matchedFields.push("resource_path");
  }

  if (event.http_method !== null) {
    matchedFields.push("http_method");
  }

  if (event.http_status !== null) {
    matchedFields.push("http_status");
  }

  return matchedFields;
}

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const ISO_TIMESTAMP_PATTERN = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g;
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const HEX_PATTERN = /\b0x[0-9a-f]+\b/gi;
const BARE_HEX_PATTERN = /\b(?=[0-9a-f]{8,}\b)(?=[0-9a-f]*[a-f])[0-9a-f]+\b/gi;
const LONG_ALPHANUMERIC_TOKEN_PATTERN = /\b(?=[A-Za-z0-9_-]{16,}\b)(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+\b/g;
const LARGE_NUMBER_PATTERN = /\b\d{2,}\b/g;

const DYNAMIC_SEGMENT_PATTERN = /^(?:\d+|[0-9a-f]{8}-[0-9a-f-]{27}|[A-Za-z0-9_-]{24,})$/;

const FRAME_NOISE_PATTERNS = ["node_modules/", "vendor/", "site-packages/", ".venv/"];

type KnownDatabaseMessageFamily = {
  summary: string;
  when: (lowerMessage: string) => boolean;
};

const KNOWN_DATABASE_MESSAGE_FAMILIES: KnownDatabaseMessageFamily[] = [
  {
    summary: "PostgreSQL access rejected by pg_hba.conf",
    when: (message) => looksLikePostgresMessage(message) && message.includes("pg_hba.conf")
  },
  {
    summary: "PostgreSQL authentication failed",
    when: (message) =>
      looksLikePostgresMessage(message) &&
      (message.includes("password authentication failed") || message.includes("authentication failed for user"))
  },
  {
    summary: "PostgreSQL host resolution failed",
    when: (message) =>
      looksLikePostgresMessage(message) &&
      (message.includes("could not translate host name") || message.includes("getaddrinfo enotfound"))
  },
  {
    summary: "PostgreSQL connection timed out",
    when: (message) =>
      looksLikePostgresMessage(message) &&
      (message.includes("connection timed out") || message.includes("timeout expired") || message.includes("etimedout"))
  },
  {
    summary: "PostgreSQL connection limit reached",
    when: (message) =>
      looksLikePostgresMessage(message) &&
      (message.includes("too many connections") || message.includes("remaining connection slots are reserved"))
  },
  {
    summary: "PostgreSQL database does not exist",
    when: (message) => looksLikePostgresMessage(message) && message.includes("does not exist")
  },
  {
    summary: "PostgreSQL connection refused",
    when: (message) => looksLikePostgresMessage(message) && message.includes("connection refused")
  },
  {
    summary: "MySQL authentication failed",
    when: (message) =>
      looksLikeMySqlMessage(message) &&
      (message.includes("access denied for user") || message.includes("authentication failed"))
  },
  {
    summary: "MySQL connection refused",
    when: (message) =>
      looksLikeMySqlMessage(message) &&
      (message.includes("connection refused") || message.includes("can't connect to mysql server"))
  },
  {
    summary: "MySQL connection dropped",
    when: (message) => looksLikeMySqlMessage(message) && message.includes("server has gone away")
  },
  {
    summary: "MySQL connection limit reached",
    when: (message) => looksLikeMySqlMessage(message) && message.includes("too many connections")
  },
  {
    summary: "MySQL database does not exist",
    when: (message) => looksLikeMySqlMessage(message) && message.includes("unknown database")
  },
  {
    summary: "MongoDB authentication failed",
    when: (message) => looksLikeMongoMessage(message) && message.includes("authentication failed")
  },
  {
    summary: "MongoDB host resolution failed",
    when: (message) =>
      looksLikeMongoMessage(message) && (message.includes("getaddrinfo enotfound") || message.includes("ename not found"))
  },
  {
    summary: "MongoDB connection timed out",
    when: (message) =>
      looksLikeMongoMessage(message) &&
      (message.includes("connection timed out") || message.includes("etimedout") || message.includes("server selection timed out"))
  },
  {
    summary: "MongoDB connection refused",
    when: (message) => looksLikeMongoMessage(message) && message.includes("connection refused")
  },
  {
    summary: "Redis authentication failed",
    when: (message) => looksLikeRedisMessage(message) && message.includes("wrongpass")
  },
  {
    summary: "Redis replica is read-only",
    when: (message) => looksLikeRedisMessage(message) && message.includes("readonly")
  },
  {
    summary: "Redis host resolution failed",
    when: (message) =>
      looksLikeRedisMessage(message) && (message.includes("getaddrinfo enotfound") || message.includes("ename not found"))
  },
  {
    summary: "Redis connection timed out",
    when: (message) =>
      looksLikeRedisMessage(message) &&
      (message.includes("connection timed out") || message.includes("etimedout") || message.includes("timeout"))
  },
  {
    summary: "Redis connection refused",
    when: (message) => looksLikeRedisMessage(message) && message.includes("connection refused")
  }
];

function looksLikePostgresMessage(message: string): boolean {
  return (
    message.includes("postgres") ||
    message.includes("pgsql") ||
    message.includes("pg_hba.conf") ||
    message.includes("connection to server at")
  );
}

function looksLikeMySqlMessage(message: string): boolean {
  return message.includes("mysql") || message.includes("mariadb");
}

function looksLikeMongoMessage(message: string): boolean {
  return message.includes("mongodb") || message.includes("mongoserver") || message.includes("mongo");
}

function looksLikeRedisMessage(message: string): boolean {
  return message.includes("redis");
}

function normalizeScalarTokens(message: string): string {
  return message
    .replace(UUID_PATTERN, "{dynamic}")
    .replace(EMAIL_PATTERN, "{dynamic}")
    .replace(ISO_TIMESTAMP_PATTERN, "{dynamic}")
    .replace(IPV4_PATTERN, "{dynamic}")
    .replace(HEX_PATTERN, "{dynamic}")
    .replace(BARE_HEX_PATTERN, "{dynamic}")
    .replace(LONG_ALPHANUMERIC_TOKEN_PATTERN, "{dynamic}")
    .replace(LARGE_NUMBER_PATTERN, "{dynamic}");
}

function collapseWhitespace(message: string): string {
  return message.replace(/\s+/g, " ").trim();
}

function normalizeKnownDatabaseMessage(message: string): string | null {
  const lowerMessage = message.toLowerCase();

  for (const family of KNOWN_DATABASE_MESSAGE_FAMILIES) {
    if (family.when(lowerMessage)) {
      return family.summary;
    }
  }

  return null;
}

function normalizeMessage(message: string): string {
  const knownDatabaseMessage = normalizeKnownDatabaseMessage(message);
  if (knownDatabaseMessage !== null) {
    return knownDatabaseMessage;
  }

  return collapseWhitespace(normalizeScalarTokens(message));
}

function normalizeRoute(path: string | null): string | null {
  if (path === null || path.length === 0) {
    return null;
  }

  const pathWithoutQueryOrFragment = path.split(/[?#]/, 1)[0] ?? "";
  if (pathWithoutQueryOrFragment.length === 0) {
    return "/";
  }

  const normalizedSegments = pathWithoutQueryOrFragment
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => (isDynamicRouteSegment(segment) ? "{param}" : segment));

  return normalizedSegments.length === 0 ? "/" : `/${normalizedSegments.join("/")}`;
}

function decodeRouteSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    // Lenient fallback: decode valid %HH bytes and leave malformed tails untouched.
    return segment.replace(/%([0-9A-Fa-f]{2})/g, (_match, hexByte: string) =>
      String.fromCharCode(parseInt(hexByte, 16))
    );
  }
}

function isDynamicRouteSegment(segment: string): boolean {
  if (DYNAMIC_SEGMENT_PATTERN.test(segment)) {
    return true;
  }

  const decodedSegment = decodeRouteSegment(segment);
  if (decodedSegment.includes("/")) {
    return true;
  }

  if (decodedSegment !== segment && DYNAMIC_SEGMENT_PATTERN.test(decodedSegment)) {
    return true;
  }

  const strippedMalformedPercent = decodedSegment.replace(/%+/g, "");
  return strippedMalformedPercent !== decodedSegment && DYNAMIC_SEGMENT_PATTERN.test(strippedMalformedPercent);
}

function selectTopFrames(stack: string, limit = 5): string[] {
  const normalizedStack = stack.replace(/\\n/g, "\n").replace(/\r\n/g, "\n");

  const frames = normalizedStack
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at "))
    .filter((line) => FRAME_NOISE_PATTERNS.every((pattern) => !line.includes(pattern)))
    .slice(0, limit);

  return frames;
}

function normalizeResourceIdentity(value: string | null): { host: string | null; path: string | null } {
  if (value === null) {
    return { host: null, path: null };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { host: null, path: null };
  }

  if (trimmed.startsWith("/")) {
    return {
      host: null,
      path: normalizeRoute(trimmed)
    };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return {
        host: parsed.hostname.length > 0 ? parsed.hostname.toLowerCase() : null,
        path: normalizeRoute(parsed.pathname)
      };
    }

    return {
      host: null,
      path: parsed.protocol.replace(/:$/, "")
    };
  } catch {
    return {
      host: null,
      path: normalizeRoute(trimmed) ?? trimmed
    };
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();

  const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`);

  return `{${pairs.join(",")}}`;
}

export function validateEvent(candidate: unknown): ReturnType<typeof EventEnvelopeSchema.safeParse> {
  return EventEnvelopeSchema.safeParse(candidate);
}

export function normalizeEvent(event: EventEnvelope): NormalizedEvent {
  const redactedPayload = redact(event.payload as JsonValue).redacted;

  if (event.event_type === "backend_exception") {
    return {
      event_type: event.event_type,
      environment: event.service.environment,
      error_type: event.payload.name,
      normalized_message: normalizeMessage(event.payload.message),
      route_template: normalizeRoute(event.payload.request.path),
      http_method: event.payload.request.method,
      http_status: event.payload.response.status_code,
      top_frames: selectTopFrames(event.payload.stack),
      browser_event_kind: null,
      resource_host: null,
      resource_path: null,
      payload: redactedPayload
    };
  }

  if (event.event_type === "request_event") {
    return {
      event_type: event.event_type,
      environment: event.service.environment,
      error_type: null,
      normalized_message: `request ${event.payload.method} ${normalizeRoute(event.payload.path) ?? "/"}`,
      route_template: normalizeRoute(event.payload.route_template ?? event.payload.path),
      http_method: event.payload.method,
      http_status: event.payload.response_status,
      top_frames: [],
      browser_event_kind: null,
      resource_host: null,
      resource_path: null,
      payload: redactedPayload
    };
  }

  if (event.event_type === "log_event") {
    return {
      event_type: event.event_type,
      environment: event.service.environment,
      error_type: null,
      normalized_message: normalizeMessage(event.payload.message),
      route_template: null,
      http_method: null,
      http_status: null,
      top_frames: [],
      browser_event_kind: null,
      resource_host: null,
      resource_path: null,
      payload: redactedPayload
    };
  }

  if (event.event_type === "frontend_exception") {
    const browserEvent = event.payload.browser_event;
    const resourceIdentity =
      browserEvent?.kind === "resource_error"
        ? normalizeResourceIdentity(browserEvent.target?.source_url ?? browserEvent.file_name)
        : { host: null, path: null };
    const topFrames = browserEvent?.opaque === true ? [] : selectTopFrames(event.payload.stack);

    return {
      event_type: event.event_type,
      environment: event.service.environment,
      error_type: event.payload.name,
      normalized_message: normalizeMessage(event.payload.message),
      route_template: normalizeRoute(event.payload.route ?? null),
      http_method: null,
      http_status: null,
      top_frames: topFrames,
      browser_event_kind: browserEvent?.kind ?? null,
      resource_host: resourceIdentity.host,
      resource_path: resourceIdentity.path,
      payload: redactedPayload
    };
  }

  return {
    event_type: event.event_type,
    environment: event.service.environment,
    error_type: null,
    normalized_message: event.event_type,
    route_template: null,
    http_method: null,
    http_status: null,
    top_frames: [],
    browser_event_kind: null,
    resource_host: null,
    resource_path: null,
    payload: redactedPayload
  };
}

export function fingerprint(event: NormalizedEvent): string {
  const canonical = {
    error_type: event.error_type,
    normalized_message: event.normalized_message,
    top_frames: event.top_frames,
    route_template: event.route_template,
    browser_event_kind: event.browser_event_kind,
    resource_host: event.resource_host,
    resource_path: event.resource_path,
    http_method: event.http_method,
    http_status: event.http_status,
    environment: event.environment
  };

  return createHash("sha256").update(stableJson(canonical)).digest("hex");
}

const INCIDENT_LOG_LEVELS = new Set(["error", "fatal", "critical"]);

function getRequestResponseStatus(payload?: Record<string, unknown>): number | null {
  const status = payload?.["response_status"];
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

/**
 * Classify an event into one of three event classes:
 * - incident_signal: failure events that create/update incidents and count toward Free billing
 * - context_signal: contextual events attached to incidents but not incident-creating
 * - operational_signal: operational/meta events (suppression summaries, standalone probes)
 */
export function classifyEvent(
  eventType: string,
  logLevel?: string,
  probeActivationId?: string | null,
  payload?: Record<string, unknown>,
  capturePreset: CapturePreset = "minimal",
  immediateClientErrorStatuses: readonly number[] = [],
): EventClass {
  switch (eventType) {
    case "backend_exception":
    case "frontend_exception":
      return "incident_signal";

    case "log_event":
      if (logLevel !== undefined && INCIDENT_LOG_LEVELS.has(logLevel)) {
        return "incident_signal";
      }
      return "context_signal";

    case "request_event": {
      const responseStatus = getRequestResponseStatus(payload);
      return classifyRequestStatus({ responseStatus, capturePreset, immediateClientErrorStatuses });
    }

    case "frontend_breadcrumb":
    case "deploy_metadata":
      return "context_signal";

    case "error_suppressed":
      return "operational_signal";

    case "probe_event":
      // Error-flush probes (no activation_id) are context; standalone are operational
      if (probeActivationId !== undefined && probeActivationId !== null) {
        return "operational_signal";
      }
      return "context_signal";

    default:
      return "context_signal";
  }
}
