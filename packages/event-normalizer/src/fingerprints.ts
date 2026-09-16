import { createHash } from "node:crypto";
import type { NormalizedEvent } from "./index.js";

export const FINGERPRINT_VERSION = "v2";
export const RESOURCE_FINGERPRINT_VERSION = "v3";
export type FingerprintVersion = "v1" | "v2" | "v3";

export function fingerprintVersion(event: NormalizedEvent): "v2" | "v3" {
  return event.resource_type != null ? RESOURCE_FINGERPRINT_VERSION : FINGERPRINT_VERSION;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

export function fingerprint(event: NormalizedEvent): string {
  const canonical =
    event.resource_type != null
      ? {
          // A concrete resource is the grouping unit, not proof of a common underlying cause.
          browser_event_kind: "resource_error",
          resource_host: event.resource_host,
          resource_path: event.resource_path,
          resource_type: event.resource_type,
          environment: event.environment,
          fingerprint_version: RESOURCE_FINGERPRINT_VERSION
        }
      : {
          // Preserve exact historical bytes for every non-resource event and explicit legacy normalization.
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

export function inferMatchedFields(event: NormalizedEvent): string[] {
  if (event.resource_type != null)
    return ["environment", "browser_event_kind", "resource_host", "resource_path", "resource_type"];
  const fields = ["environment", "normalized_message"];
  if (event.error_type !== null) fields.push("error_type");
  if (event.route_template !== null) fields.push("route_template");
  if (event.top_frames.length > 0) fields.push("top_frames");
  if (event.browser_event_kind != null) fields.push("browser_event_kind");
  if (event.resource_host != null) fields.push("resource_host");
  if (event.resource_path != null) fields.push("resource_path");
  if (event.http_method !== null) fields.push("http_method");
  if (event.http_status !== null) fields.push("http_status");
  return fields;
}
