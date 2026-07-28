import { createHash } from "node:crypto";

const MOBILE_SDKS = new Set(["@debugbundle/sdk-android", "@debugbundle/sdk-swift"]);

export type InstalledMobileCompatibility =
  | "legacy_android_event"
  | "legacy_swift_event";

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}

function readString(candidate: unknown): string | null {
  if (typeof candidate === "string" && candidate.length > 0) {
    return candidate;
  }
  if (typeof candidate === "number" || typeof candidate === "boolean") {
    return String(candidate);
  }
  return null;
}

function readNumber(candidate: unknown): number | null {
  if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0) {
    return candidate;
  }
  return null;
}

function readInteger(candidate: unknown): number | null {
  const value = readNumber(candidate);
  return value !== null && Number.isInteger(value) ? value : null;
}

function readBoolean(candidate: unknown): boolean | null {
  return typeof candidate === "boolean" ? candidate : null;
}

function readField(record: Record<string, unknown>, snakeCase: string, camelCase: string): unknown {
  return record[snakeCase] ?? record[camelCase];
}

function stableValue(candidate: unknown): unknown {
  if (Array.isArray(candidate)) {
    return candidate.map(stableValue);
  }
  if (!isRecord(candidate)) {
    return candidate;
  }
  return Object.fromEntries(
    Object.keys(candidate)
      .sort()
      .map((key) => [key, stableValue(candidate[key])])
  );
}

function deterministicEventId(candidate: Record<string, unknown>): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(stableValue(candidate)))
    .digest("hex");
  const chars = digest.slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ["8", "9", "a", "b"][Number.parseInt(chars[16] ?? "0", 16) % 4] ?? "8";
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseScreenResolution(candidate: unknown): {
  width: number | null;
  height: number | null;
} {
  if (typeof candidate !== "string") {
    return { width: null, height: null };
  }
  const match = /^(\d+)x(\d+)$/.exec(candidate.trim());
  return {
    width: match?.[1] === undefined ? null : Number.parseInt(match[1], 10),
    height: match?.[2] === undefined ? null : Number.parseInt(match[2], 10)
  };
}

function normalizeMobileDevice(
  candidate: unknown,
  event: Record<string, unknown>
): Record<string, unknown> {
  const device = isRecord(candidate) ? candidate : {};
  const screen = parseScreenResolution(readField(device, "screen_resolution", "screenResolution"));
  const screenWidth =
    readInteger(readField(device, "screen_width", "screenWidth")) ?? screen.width ?? 0;
  const screenHeight =
    readInteger(readField(device, "screen_height", "screenHeight")) ?? screen.height ?? 0;
  const deviceType = readString(readField(device, "device_type", "deviceType"));
  return {
    user_agent: null,
    os: {
      name: readString(readField(device, "os_name", "osName")),
      version: readString(readField(device, "os_version", "osVersion"))
    },
    device_type: deviceType === "mobile" || deviceType === "tablet" ? deviceType : "unknown",
    screen: {
      width: screenWidth,
      height: screenHeight
    },
    viewport: {
      width: screenWidth,
      height: screenHeight
    },
    device_pixel_ratio: null,
    touch_capable: true,
    language: readString(device["locale"]),
    connection_type:
      readString(readField(device, "connection_type", "connectionType")) ??
      readString(readField(device, "network_connection_type", "networkConnectionType")),
    color_scheme_preference: null,
    app_version:
      readString(readField(device, "app_version", "appVersion")) ??
      readString(event["app_version"]),
    build_number:
      readString(readField(device, "build_number", "buildNumber")) ??
      readString(event["build_number"]),
    release_channel:
      readString(readField(device, "release_channel", "releaseChannel")) ??
      readString(event["release_channel"]),
    api_level: readInteger(readField(device, "api_level", "apiLevel")),
    manufacturer: readString(device["manufacturer"]),
    model: readString(device["model"]),
    timezone: readString(device["timezone"]),
    battery_level: readNumber(readField(device, "battery_level", "batteryLevel")),
    battery_charging:
      readBoolean(readField(device, "battery_charging", "batteryCharging")) ??
      readBoolean(device["charging"]),
    free_disk_bytes: readInteger(readField(device, "free_disk_bytes", "freeDiskBytes")),
    free_memory_bytes: readInteger(readField(device, "free_memory_bytes", "freeMemoryBytes")),
    jailbroken: readBoolean(device["jailbroken"]) ?? readBoolean(device["rooted"])
  };
}

function normalizeCorrelation(candidate: unknown): Record<string, string | null> | undefined {
  if (!isRecord(candidate)) {
    return undefined;
  }
  return {
    request_id: readString(readField(candidate, "request_id", "requestId")),
    trace_id: readString(readField(candidate, "trace_id", "traceId")),
    session_id: readString(readField(candidate, "session_id", "sessionId")),
    user_id_hash: readString(readField(candidate, "user_id_hash", "userIdHash"))
  };
}

function objectWrapProbeValue(candidate: unknown): Record<string, unknown> {
  return isRecord(candidate) ? { ...candidate } : { value: candidate };
}

function normalizeInlineProbeData(
  candidate: unknown,
  occurredAt: string
): Record<string, unknown> | undefined {
  if (!isRecord(candidate)) {
    return undefined;
  }

  if (candidate["version"] === 1 && Array.isArray(candidate["items"])) {
    return {
      version: 1,
      items: candidate["items"].filter(isRecord).map((item) => ({
        label: readString(item["label"]) ?? "probe",
        data: objectWrapProbeValue(item["data"]),
        timestamp: readString(item["timestamp"]) ?? occurredAt,
        activation_id: readString(item["activation_id"])
      }))
    };
  }

  const items: Record<string, unknown>[] = [];
  for (const [label, values] of Object.entries(candidate)) {
    const entries = Array.isArray(values) ? values : [values];
    for (const value of entries) {
      items.push({
        label,
        data: objectWrapProbeValue(value),
        timestamp: occurredAt,
        activation_id: null
      });
    }
  }
  return { version: 1, items };
}

function normalizeBreadcrumbs(
  candidate: unknown,
  occurredAt: string
): Record<string, unknown>[] | undefined {
  if (!Array.isArray(candidate)) {
    return undefined;
  }
  return candidate.filter(isRecord).map((breadcrumb) => ({
    ts:
      readString(breadcrumb["ts"]) ??
      readString(breadcrumb["occurred_at"]) ??
      readString(breadcrumb["occurredAt"]) ??
      occurredAt,
    breadcrumb_type:
      readString(readField(breadcrumb, "breadcrumb_type", "breadcrumbType")) ?? "mobile_breadcrumb",
    ...(readString(breadcrumb["route"]) === null ? {} : { route: readString(breadcrumb["route"]) }),
    data: isRecord(breadcrumb["data"]) ? { ...breadcrumb["data"] } : {}
  }));
}

function requestPathAndQuery(candidate: unknown): {
  path: string;
  query: Record<string, unknown>;
} {
  const rawUrl = readString(candidate) ?? "/";
  try {
    const parsed = new URL(rawUrl, "https://debugbundle.invalid");
    return {
      path: parsed.pathname.length > 0 ? parsed.pathname : "/",
      query: Object.fromEntries(parsed.searchParams.entries())
    };
  } catch {
    return { path: rawUrl.length > 0 ? rawUrl : "/", query: {} };
  }
}

function normalizePayload(input: {
  eventType: string;
  payload: Record<string, unknown>;
  device: Record<string, unknown>;
  occurredAt: string;
}): Record<string, unknown> {
  const { eventType, payload, device, occurredAt } = input;
  if (eventType === "frontend_exception") {
    const error = isRecord(payload["error"]) ? payload["error"] : {};
    const name =
      readString(error["name"]) ??
      readString(error["type"]) ??
      readString(error["domain"]) ??
      readString(payload["name"]) ??
      "MobileError";
    const message = readString(error["message"]) ?? readString(payload["message"]) ?? name;
    const stackTrace = Array.isArray(error["stack_trace"])
      ? error["stack_trace"].map(readString).filter((value): value is string => value !== null)
      : [];
    const stack =
      readString(error["stack"]) ??
      readString(payload["stack"]) ??
      (stackTrace.length > 0
        ? `${name}: ${message}\n${stackTrace.join("\n")}`
        : `${name}: ${message}`);
    const breadcrumbs = normalizeBreadcrumbs(payload["breadcrumbs"], occurredAt);
    const probeData = normalizeInlineProbeData(payload["probe_data"], occurredAt);
    return {
      name,
      message,
      stack,
      ...(readString(payload["route"]) === null ? {} : { route: readString(payload["route"]) }),
      ...(breadcrumbs === undefined ? {} : { breadcrumbs }),
      ...(probeData === undefined ? {} : { probe_data: probeData }),
      device,
      ...(isRecord(payload["context"]) ? { context: payload["context"] } : {})
    };
  }

  if (eventType === "request_event") {
    const parsedUrl = requestPathAndQuery(payload["url"] ?? payload["path"]);
    return {
      method: readString(payload["method"]) ?? "UNKNOWN",
      path: readString(payload["path"]) ?? parsedUrl.path,
      query: isRecord(payload["query"]) ? payload["query"] : parsedUrl.query,
      headers: isRecord(payload["headers"]) ? payload["headers"] : {},
      ...("body" in payload ? { body: payload["body"] ?? null } : {}),
      response_status: readInteger(payload["response_status"] ?? payload["status_code"]) ?? 0,
      duration_ms: readNumber(payload["duration_ms"]) ?? 0,
      ...(readString(payload["route_template"]) === null
        ? {}
        : { route_template: readString(payload["route_template"]) }),
      ...(isRecord(payload["response_headers"])
        ? { response_headers: payload["response_headers"] }
        : {}),
      ...("response_body" in payload ? { response_body: payload["response_body"] } : {}),
      device,
      ...(isRecord(payload["context"]) ? { context: payload["context"] } : {})
    };
  }

  if (eventType === "log_event") {
    const attributes = isRecord(payload["attributes"]) ? { ...payload["attributes"] } : {};
    for (const [key, value] of Object.entries(payload)) {
      if (!["level", "message", "context", "attributes"].includes(key)) {
        attributes[key] = value;
      }
    }
    if (isRecord(payload["context"])) {
      Object.assign(attributes, payload["context"]);
    }
    return {
      level: readString(payload["level"]) ?? "error",
      message: readString(payload["message"]) ?? "Mobile log event",
      attributes,
      device,
      ...(isRecord(payload["context"]) ? { context: payload["context"] } : {})
    };
  }

  if (eventType === "frontend_breadcrumb") {
    return {
      breadcrumb_type:
        readString(readField(payload, "breadcrumb_type", "breadcrumbType")) ?? "mobile_breadcrumb",
      ...(readString(payload["route"]) === null ? {} : { route: readString(payload["route"]) }),
      data: isRecord(payload["data"]) ? payload["data"] : {},
      device
    };
  }

  if (eventType === "error_suppressed") {
    return {
      fingerprint: readString(payload["fingerprint"]) ?? "mobile-suppressed-event",
      suppressed_count: readInteger(payload["suppressed_count"]) ?? 0,
      window_seconds: Math.max(1, readInteger(payload["window_seconds"]) ?? 1),
      first_seen: readString(payload["first_seen"]) ?? occurredAt,
      last_seen: readString(payload["last_seen"]) ?? occurredAt,
      device
    };
  }

  if (eventType === "probe_event") {
    return {
      label: readString(payload["label"]) ?? "probe",
      data: objectWrapProbeValue(payload["data"]),
      activation_id: readString(payload["activation_id"]),
      probe_label_pattern:
        readString(payload["probe_label_pattern"]) ?? readString(payload["label"]) ?? "probe",
      device
    };
  }

  return payload;
}

/**
 * Converts only the wire shapes emitted by installed Android and Swift releases.
 * Canonical mobile envelopes pass through unchanged and all other SDK identities
 * remain subject to the strict shared event contract.
 */
export function classifyInstalledMobileEventCompatibility(
  candidate: unknown
): InstalledMobileCompatibility | null {
  if (!isRecord(candidate) || !MOBILE_SDKS.has(readString(candidate["sdk_name"]) ?? "")) {
    return null;
  }

  const payload = isRecord(candidate["payload"]) ? candidate["payload"] : null;
  const isLegacy =
    "device" in candidate ||
    typeof candidate["service"] === "string" ||
    typeof candidate["schema_version"] !== "string" ||
    typeof candidate["event_id"] !== "string" ||
    (payload !== null && "error" in payload);
  if (!isLegacy || payload === null) {
    return null;
  }

  return candidate["sdk_name"] === "@debugbundle/sdk-android"
    ? "legacy_android_event"
    : "legacy_swift_event";
}

export function normalizeInstalledMobileEvent(candidate: unknown): unknown {
  if (classifyInstalledMobileEventCompatibility(candidate) === null || !isRecord(candidate)) {
    return candidate;
  }

  const payload = isRecord(candidate["payload"]) ? candidate["payload"] : {};
  const event = { ...candidate };
  const sdkName = readString(event["sdk_name"]) ?? "";
  const occurredAt = readString(event["occurred_at"]) ?? new Date(0).toISOString();
  const serviceCandidate = event["service"];
  const service = isRecord(serviceCandidate)
    ? {
        name: readString(serviceCandidate["name"]) ?? "mobile-app",
        environment:
          readString(serviceCandidate["environment"]) ??
          readString(event["environment"]) ??
          "production",
        runtime: sdkName === "@debugbundle/sdk-android" ? "android" : "swift",
        framework: readString(serviceCandidate["framework"])
      }
    : {
        name: readString(serviceCandidate) ?? "mobile-app",
        environment: readString(event["environment"]) ?? "production",
        runtime: sdkName === "@debugbundle/sdk-android" ? "android" : "swift",
        framework: null
      };
  const device = normalizeMobileDevice(event["device"], event);
  const eventType = readString(event["event_type"]) ?? "";

  event["schema_version"] = readString(event["schema_version"]) ?? "2026-03-01";
  event["event_id"] = readString(event["event_id"]) ?? deterministicEventId(candidate);
  event["service"] = service;
  event["occurred_at"] = occurredAt;
  event["payload"] = normalizePayload({ eventType, payload: { ...payload }, device, occurredAt });

  const correlation = normalizeCorrelation(event["correlation"]);
  if (correlation === undefined) {
    delete event["correlation"];
  } else {
    event["correlation"] = correlation;
  }

  delete event["device"];
  delete event["environment"];
  delete event["release_channel"];
  delete event["app_version"];
  delete event["build_number"];
  return event;
}

export function objectWrapCompatibleProbeData(
  eventType: string,
  payload: Record<string, unknown>
): void {
  if (eventType === "probe_event" && !isRecord(payload["data"])) {
    payload["data"] = objectWrapProbeValue(payload["data"]);
  }

  const probeData = payload["probe_data"];
  if (!isRecord(probeData) || !Array.isArray(probeData["items"])) {
    return;
  }
  probeData["items"] = probeData["items"].map((candidate: unknown) => {
    if (!isRecord(candidate) || isRecord(candidate["data"])) {
      return candidate;
    }
    return { ...candidate, data: objectWrapProbeValue(candidate["data"]) };
  });
}
