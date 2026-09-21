import type { JsonValue } from "./index.js";
import { DEFAULT_SENSITIVE_KEYS, isSensitiveKey } from "./keys.js";
import { scrubCredentialText } from "./telemetry-text.js";

const REDACTED = "[REDACTED]";
export const TELEMETRY_PRIVACY_POLICY_VERSION = "telemetry-privacy-v1";
const MAX_DEPTH = 16;
const MAX_NODES = 4096;
const MAX_ENTRIES = 256;
const MAX_STRING_BYTES = 16 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024;

export interface TelemetrySanitizationOptions {
  additionalKeys?: readonly string[];
  maxTotalBytes?: number;
}

export type TelemetrySanitizationResult =
  | { ok: true; value: JsonValue; redactionCount: number }
  | { ok: false; reason: "unsafe_input" | "budget_exceeded" };

interface WorkState {
  nodes: number;
  textBytes: number;
  redactionCount: number;
  seen: WeakSet<object>;
  keys: string[];
  extra: readonly string[];
  maxTotalBytes: number;
}

class BudgetExceeded extends Error {}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function mask(state: WorkState): string {
  state.redactionCount += 1;
  return REDACTED;
}

function sanitizeString(value: string, state: WorkState, allowStructured: boolean): JsonValue {
  if (value.length > MAX_STRING_BYTES) return mask(state);
  const length = byteLength(value);
  if (length > MAX_STRING_BYTES) return mask(state);
  state.textBytes += length;
  if (state.textBytes > state.maxTotalBytes) throw new BudgetExceeded();

  if (allowStructured && (value.startsWith("{") || value.startsWith("["))) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === "object" && parsed !== null) {
        const nested = sanitizeValue(parsed, state, 0, false);
        const encoded = JSON.stringify(nested);
        if (encoded !== value) state.redactionCount += 1;
        return encoded;
      }
    } catch (error) {
      if (error instanceof BudgetExceeded) throw error;
      // Malformed structured content with a recognizable sensitive label is withheld below.
    }
  }

  const result = scrubCredentialText(value, state.extra);
  if (result !== value) state.redactionCount += 1;
  if ((value.startsWith("{") || value.startsWith("[")) && result === value &&
      /(?:password|token|secret|authorization|cookie)["']?\s*[:=]/i.test(value)) {
    return mask(state);
  }
  return result;
}

function sanitizeValue(value: unknown, state: WorkState, depth: number, allowStructured: boolean): JsonValue {
  state.nodes += 1;
  if (state.nodes > MAX_NODES) throw new BudgetExceeded();
  if (depth > MAX_DEPTH) return mask(state);
  if (typeof value === "string") return sanitizeString(value, state, allowStructured);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object") throw new TypeError("unsafe_input");

  if (state.seen.has(value)) return "[Circular]";
  state.seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_ENTRIES) return mask(state);
      return Array.from({ length: value.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !("value" in descriptor)) throw new TypeError("unsafe_input");
        return sanitizeValue(descriptor.value, state, depth + 1, allowStructured);
      });
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new TypeError("unsafe_input");
    }
    const keys = Object.keys(value);
    if (keys.length > MAX_ENTRIES) return mask(state);
    const result: Record<string, JsonValue> = {};
    for (const key of keys) {
      if (key.length > 128) {
        state.redactionCount += 1;
        continue;
      }
      state.textBytes += byteLength(key);
      if (state.textBytes > state.maxTotalBytes) throw new BudgetExceeded();
      const safeKey = scrubCredentialText(key, state.extra);
      if (safeKey !== key) {
        state.redactionCount += 1;
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) throw new TypeError("unsafe_input");
      const safeValue = isSensitiveKey(key, state.keys)
        ? mask(state)
        : sanitizeValue(descriptor.value, state, depth + 1, allowStructured);
      Object.defineProperty(result, key, {
        value: safeValue,
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    return result;
  } finally {
    state.seen.delete(value);
  }
}

/** Mandatory telemetry policy; unlike the legacy `redact` helper, custom keys are additive. */
export function sanitizeTelemetry(value: unknown, options: TelemetrySanitizationOptions = {}): TelemetrySanitizationResult {
  try {
    const extra = options.additionalKeys ?? [];
    if (extra.length > 128 || extra.some((key) => typeof key !== "string" || key.length > 64 || !key.trim())) {
      return { ok: false, reason: "unsafe_input" };
    }
    const maxTotalBytes = options.maxTotalBytes ?? MAX_TOTAL_BYTES;
    if (!Number.isInteger(maxTotalBytes) || maxTotalBytes < 1 || maxTotalBytes > 512 * 1024) {
      return { ok: false, reason: "unsafe_input" };
    }
    const state: WorkState = {
      nodes: 0,
      textBytes: 0,
      redactionCount: 0,
      seen: new WeakSet<object>(),
      keys: [...DEFAULT_SENSITIVE_KEYS, ...extra],
      extra,
      maxTotalBytes
    };
    const sanitized = sanitizeValue(value, state, 0, true);
    if (byteLength(JSON.stringify(sanitized)) > maxTotalBytes) {
      return { ok: false, reason: "budget_exceeded" };
    }
    return { ok: true, value: sanitized, redactionCount: state.redactionCount };
  } catch (error) {
    return { ok: false, reason: error instanceof BudgetExceeded ? "budget_exceeded" : "unsafe_input" };
  }
}
