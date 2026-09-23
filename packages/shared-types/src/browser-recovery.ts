import type { EventEnvelope } from "./event-envelope.js";

/** Only explicit, relative recovery endpoints qualify; no external origin is inferred. */
export function readBrowserRecoveryFailure(input: {
  path: unknown;
  method: unknown;
  status: unknown;
}): { path: string; method: string; status_code: number } | null {
  const { path, method, status } = input;
  if (
    typeof path !== "string" ||
    path.length > 4096 ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(path)
  )
    return null;
  const cleanPath = path.split(/[?#]/, 1)[0]!;
  if (
    cleanPath.length > 1024 ||
    !/(?:^|[/_-])(refresh|renew|recover|recovery|retry|presign|signed[/_-]?url)(?:[/_.-]|$)/i.test(
      cleanPath
    )
  )
    return null;
  if (
    typeof method !== "string" ||
    !/^[A-Za-z]{1,32}$/.test(method) ||
    typeof status !== "number" ||
    !Number.isInteger(status) ||
    status < 400 ||
    status > 599
  )
    return null;
  return { path: cleanPath, method: method.toUpperCase(), status_code: status };
}

export function browserRecoveryFailureFromEvent(
  event: EventEnvelope
): ReturnType<typeof readBrowserRecoveryFailure> {
  if (event.event_type === "request_event")
    return readBrowserRecoveryFailure({
      path: event.payload.path,
      method: event.payload.method,
      status: event.payload.response_status
    });
  if (
    event.event_type === "frontend_breadcrumb" &&
    event.payload.breadcrumb_type === "network_request"
  ) {
    const data = event.payload.data;
    return readBrowserRecoveryFailure({
      path: data["url"],
      method: data["method"],
      status: data["status_code"] ?? data["status"]
    });
  }
  return null;
}
