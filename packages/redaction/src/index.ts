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

const DEFAULT_SENSITIVE_KEYS = [
  "password",
  "secret",
  "token",
  "api_key",
  "apikey",
  "access_token",
  "refresh_token",
  "private_key",
  "authorization",
  "bearer",
  "cookie",
  "session_id",
  "passwd",
  "ssn",
  "credit_card",
  "card_number",
  "cvv",
  "cvc",
  "pin",
  "expiry",
  "phone",
  "otp",
  "verification_code"
] as const;

function canonicalizeSensitiveKey(value: string): string {
  return value.replace(/[^a-z0-9]+/g, "");
}

function splitKeyIntoSegments(key: string): string[] {
  return key
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((segment) => segment.length > 0);
}

function buildKeyCandidates(key: string): string[] {
  const segments = splitKeyIntoSegments(key);
  const candidates = new Set<string>();

  for (let start = 0; start < segments.length; start += 1) {
    let combined = "";
    for (let end = start; end < segments.length; end += 1) {
      combined += segments[end];
      candidates.add(combined);
    }
  }

  return [...candidates];
}

function isSensitiveKey(key: string, sensitiveKeys: readonly string[]): boolean {
  const normalized = key.trim().toLowerCase();
  if (sensitiveKeys.includes(normalized)) {
    return true;
  }

  const canonicalSensitiveKeys = new Set(sensitiveKeys.map(canonicalizeSensitiveKey));
  const candidates = buildKeyCandidates(key);

  return candidates.some((candidate) => canonicalSensitiveKeys.has(candidate));
}

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
