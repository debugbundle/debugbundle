export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export interface RedactionResult<T extends JsonValue> {
  redacted: T;
  redacted_fields: string[];
}

export interface RedactionOptions {
  sensitiveKeys?: string[];
  replacement?: string;
}

import { DEFAULT_SENSITIVE_KEYS, isSensitiveKey } from "./keys.js";
export {
  sanitizeTelemetry,
  TELEMETRY_PRIVACY_POLICY_VERSION,
  type TelemetrySanitizationResult,
  type TelemetrySanitizationOptions
} from "./telemetry.js";

function redactInternal(
  value: JsonValue,
  path: string,
  sensitiveKeys: readonly string[],
  replacement: string,
  touchedPaths: string[],
  seen: WeakSet<object>
): JsonValue {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);
    const redactedArray = value.map((entry, index) =>
      redactInternal(entry, path.length === 0 ? `[${index}]` : `${path}[${index}]`, sensitiveKeys, replacement, touchedPaths, seen)
    );
    seen.delete(value);
    return redactedArray;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  const output: JsonObject = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    const nextPath = path.length === 0 ? key : `${path}.${key}`;

    if (isSensitiveKey(key, sensitiveKeys)) {
      output[key] = replacement;
      touchedPaths.push(nextPath);
      continue;
    }

    output[key] = redactInternal(nestedValue, nextPath, sensitiveKeys, replacement, touchedPaths, seen);
  }

  seen.delete(value);
  return output;
}

export function redact<T extends JsonValue>(payload: T, options?: RedactionOptions): RedactionResult<T> {
  const sensitiveKeys = options?.sensitiveKeys?.map((key) => key.trim().toLowerCase()) ?? [...DEFAULT_SENSITIVE_KEYS];
  const replacement = options?.replacement ?? "[REDACTED]";
  const touchedPaths: string[] = [];
  const redacted = redactInternal(payload, "", sensitiveKeys, replacement, touchedPaths, new WeakSet<object>()) as T;

  return {
    redacted,
    redacted_fields: touchedPaths
  };
}
