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
const LARGE_NUMBER_PATTERN = /\b\d{2,}\b/g;

const DYNAMIC_SEGMENT_PATTERN = /^(?:\d+|[0-9a-f]{8}-[0-9a-f-]{27}|[A-Za-z0-9_-]{24,})$/;

const FRAME_NOISE_PATTERNS = ["node_modules/", "vendor/", "site-packages/", ".venv/"];

function normalizeMessage(message: string): string {
  return message
    .replace(UUID_PATTERN, "{dynamic}")
    .replace(EMAIL_PATTERN, "{dynamic}")
    .replace(ISO_TIMESTAMP_PATTERN, "{dynamic}")
    .replace(IPV4_PATTERN, "{dynamic}")
    .replace(HEX_PATTERN, "{dynamic}")
    .replace(BARE_HEX_PATTERN, "{dynamic}")
    .replace(LARGE_NUMBER_PATTERN, "{dynamic}");
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
    payload: redactedPayload
  };
}

export function fingerprint(event: NormalizedEvent): string {
  const canonical = {
    error_type: event.error_type,
    normalized_message: event.normalized_message,
    top_frames: event.top_frames,
    route_template: event.route_template,
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
      return classifyRequestStatus({ responseStatus, capturePreset });
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
