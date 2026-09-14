import { sanitizeHealthCheckUrl } from "./openai-contract.js";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 8_192) return null;
  try {
    const url = new URL(value, "https://debugbundle.invalid");
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return new URL(sanitizeHealthCheckUrl(url.toString()));
  } catch {
    return null;
  }
}

function path(value: unknown, normalize = false): string | null {
  const url = safeUrl(value);
  if (url === null) return null;
  return url.pathname
    .split("/")
    .map((segment) =>
      normalize && /^(?:\d+|[0-9a-f]{8}-[0-9a-f-]{27}|[A-Za-z0-9_-]{24,})$/i.test(segment)
        ? "{param}"
        : segment
    )
    .join("/")
    .slice(0, 1024);
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function projectBrowserEvidence(
  bundle: Record<string, unknown>
): { route: string | null; context: Record<string, unknown> } | null {
  const signal = record(bundle["signal"]);
  const summary = record(bundle["summary"]);
  if (
    signal["signal_type"] !== "frontend_exception" &&
    summary["primary_signal"] !== "frontend_exception"
  )
    return null;
  const context = record(bundle["context"]);
  const error = record(context["error"]);
  const exceptions = record(context["frontend"])["exceptions"];
  if (!Array.isArray(exceptions)) return null;
  const cutoff = Date.parse(String(bundle["captured_at"]));
  if (!Number.isFinite(cutoff)) return null;
  let selected: Record<string, unknown> | null = null;
  let selectedAt = -Infinity;
  // Artifact reads already have a byte limit. Also bound this evidence projection.
  for (const candidate of exceptions.slice(-50)) {
    const entry = record(candidate);
    const at = Date.parse(String(entry["ts"]));
    if (
      !Number.isFinite(at) ||
      at > cutoff ||
      at < selectedAt ||
      entry["message"] !== (summary["error_message"] ?? error["message"])
    )
      continue;
    selected = entry;
    selectedAt = at;
  }
  if (selected === null) return null;
  const event = record(selected["browser_event"]);
  const target = record(event["target"]);
  const page = record(event["page"]);
  const source = path(event["file_name"]);
  const resource = safeUrl(target["source_url"]);
  const resourceHost =
    resource?.hostname === "debugbundle.invalid" ? null : (resource?.hostname ?? null);
  const kind =
    event["kind"] === "window_error" || event["kind"] === "resource_error" ? event["kind"] : null;
  const opaque = typeof event["opaque"] === "boolean" ? event["opaque"] : null;
  return {
    route: path(selected["route"], true) ?? path(page["url"], true),
    context: {
      kind,
      opaque,
      source_file: source,
      line: positiveInteger(event["line_number"]),
      column: positiveInteger(event["column_number"]),
      resource_type:
        typeof target["tag_name"] === "string" ? target["tag_name"].slice(0, 32) : null,
      resource_host: resourceHost,
      resource_path: path(target["source_url"]),
      ready_state: ["loading", "interactive", "complete"].includes(String(page["ready_state"]))
        ? page["ready_state"]
        : null,
      visibility_state: ["visible", "hidden", "prerender", "unloaded"].includes(
        String(page["visibility_state"])
      )
        ? page["visibility_state"]
        : null,
      evidence_status:
        kind === "resource_error"
          ? "resource_load_failure"
          : opaque === true &&
              /^Script error\.?$/i.test(String(event["message"])) &&
              source === null
            ? "browser_details_withheld"
            : source !== null || opaque === false
              ? "details_available"
              : "context_missing"
    }
  };
}
