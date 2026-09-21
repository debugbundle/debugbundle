import { sanitizeTelemetry } from "../../redaction/src/index.js";

const OMITTED_FIELDS = [
  "error",
  "error_message",
  "errorMessage",
  "stack",
  "cause",
  "url",
  "path",
  "query",
  "headers",
  "body",
  "payload",
  "arguments",
  "results"
];

function own(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}

/** Runtime logs retain delivery/status metadata; request and exception text belong in protected evidence. */
export function protectRuntimeLogRecord(input: Record<string, unknown>): Record<string, unknown> {
  try {
    const keys = Object.keys(input);
    if (keys.length > 256) return { privacy: "withheld" };
    const projected: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const value = own(input, key);
      if (value === undefined) continue;
      if (key === "req" || key === "request") {
        const method = own(value, "method") ?? own(own(value, "raw"), "method");
        projected[key] =
          typeof method === "string" && /^[A-Z]{1,16}$/.test(method) ? { method } : {};
      } else if (key === "res" || key === "response") {
        const status = own(value, "statusCode") ?? own(own(value, "raw"), "statusCode");
        projected[key] =
          typeof status === "number" && Number.isInteger(status) ? { statusCode: status } : {};
      } else if (key === "err") {
        projected[key] = { type: "Error" };
      } else {
        projected[key] = value;
      }
    }
    const safe = sanitizeTelemetry(projected, { additionalKeys: OMITTED_FIELDS });
    return safe.ok &&
      safe.value !== null &&
      typeof safe.value === "object" &&
      !Array.isArray(safe.value)
      ? safe.value
      : { privacy: "withheld" };
  } catch {
    return { privacy: "withheld" };
  }
}

export function protectRuntimeLogMessage(message: unknown): string {
  // Call sites use fixed event identifiers. Pino interpolation and exception-derived
  // prose must never introduce request values through the special message field.
  if (typeof message !== "string") return "runtime_event";
  if (["incoming request", "request completed", "request errored"].includes(message))
    return message;
  if (!/^[a-z][a-z0-9_]{0,127}$/.test(message)) return "runtime_event";
  const protectedLabel = sanitizeTelemetry(message);
  return protectedLabel.ok && protectedLabel.value === message ? message : "runtime_event";
}
