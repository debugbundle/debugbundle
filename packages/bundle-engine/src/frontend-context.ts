import type { BundleV1, EventEnvelope } from "../../shared-types/src/index.js";

export type FrontendExceptionEnvelope = Extract<
  EventEnvelope,
  { event_type: "frontend_exception" }
>;
type FrontendBreadcrumbEnvelope = Extract<
  EventEnvelope,
  { event_type: "frontend_breadcrumb" }
>;
type FrontendExceptionBreadcrumb = NonNullable<
  FrontendExceptionEnvelope["payload"]["breadcrumbs"]
>[number];
export type BrowserExceptionEventContext = NonNullable<
  FrontendExceptionEnvelope["payload"]["browser_event"]
>;
type BundleErrorContext = Exclude<BundleV1["context"]["error"], null | undefined>;

function toIsoTimestamp(value: string): string {
  return new Date(value).toISOString();
}

function selectLatestEnvelopeByType<TEnvelope extends EventEnvelope>(
  envelopes: EventEnvelope[],
  predicate: (envelope: EventEnvelope) => envelope is TEnvelope
): TEnvelope | null {
  for (let index = envelopes.length - 1; index >= 0; index -= 1) {
    const envelope = envelopes[index];
    if (envelope !== undefined && predicate(envelope)) {
      return envelope;
    }
  }

  return null;
}

export function isFrontendExceptionEnvelope(
  envelope: EventEnvelope
): envelope is FrontendExceptionEnvelope {
  return envelope.event_type === "frontend_exception";
}

function isFrontendBreadcrumbEnvelope(
  envelope: EventEnvelope
): envelope is FrontendBreadcrumbEnvelope {
  return envelope.event_type === "frontend_breadcrumb";
}

function isBrowserSdkFallbackFrame(frame: string): boolean {
  const normalizedFrame = frame.toLowerCase();
  return (
    normalizedFrame.includes("onerror") &&
    (normalizedFrame.includes("debugbundle-browser-sdk") ||
      normalizedFrame.includes("debugbundle-browser.js") ||
      normalizedFrame.includes("wp-content/plugins/debugbundle/"))
  );
}

export function deriveFirstApplicationFrame(
  errorContext: BundleErrorContext | null
): BundleV1["summary"]["first_application_frame"] {
  const firstFrame = errorContext?.top_frames[0];
  if (firstFrame === undefined) {
    return null;
  }

  if (isBrowserSdkFallbackFrame(firstFrame)) {
    return null;
  }

  const match =
    /at\s+(.*?)\s+\((.*?):(\d+):(\d+)\)$/.exec(firstFrame) ??
    /at\s+(.*?):(\d+):(\d+)$/.exec(firstFrame);
  if (match === null) {
    return {
      file: null,
      line: null,
      function: null
    };
  }

  if (match.length === 5) {
    return {
      function: match[1] ?? null,
      file: match[2] ?? null,
      line: Number(match[3])
    };
  }

  return {
    function: null,
    file: match[1] ?? null,
    line: Number(match[2])
  };
}

export function getPrimaryBrowserExceptionEvent(
  envelopes: EventEnvelope[],
  primarySignalEnvelope: EventEnvelope | null
): BrowserExceptionEventContext | null {
  if (primarySignalEnvelope !== null && isFrontendExceptionEnvelope(primarySignalEnvelope)) {
    return primarySignalEnvelope.payload.browser_event ?? null;
  }

  const envelope = selectLatestEnvelopeByType(envelopes, isFrontendExceptionEnvelope);
  return envelope?.payload.browser_event ?? null;
}

export function isOpaqueBrowserError(
  errorContext: BundleErrorContext | null,
  browserEvent: BrowserExceptionEventContext | null
): boolean {
  if (browserEvent?.opaque === true) {
    return true;
  }

  const firstFrame = errorContext?.top_frames[0];
  return (
    errorContext?.message === "Window error" &&
    firstFrame !== undefined &&
    isBrowserSdkFallbackFrame(firstFrame)
  );
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
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function buildFrontendBreadcrumbKey(input: {
  breadcrumb_type: FrontendExceptionBreadcrumb["breadcrumb_type"];
  route: string | null | undefined;
  data: Record<string, unknown>;
  ts: string;
}): string {
  return `${input.breadcrumb_type}:${input.ts}:${input.route ?? ""}:${stableJson(input.data)}`;
}

export function buildFrontendContext(
  envelopes: EventEnvelope[]
): BundleV1["context"]["frontend"] {
  const breadcrumbs = new Map<
    string,
    {
      breadcrumb_type: FrontendExceptionBreadcrumb["breadcrumb_type"];
      route: string | null | undefined;
      data: Record<string, unknown>;
      ts: string;
    }
  >();
  const routeChanges: Array<{ from: string; to: string; ts: string }> = [];
  const clicks: Array<{ selector: string; label: string; ts: string }> = [];
  const formSubmissions: Array<{ form: string; fields: Record<string, unknown>; ts: string }> = [];
  const consoleLogs: unknown[] = [];
  const networkRequests: Array<{
    method: string;
    url: string;
    status: number;
    ts: string;
    duration_ms?: number;
    caller_trace?: string[];
    response_body?: unknown;
    request_body?: unknown;
    response_headers?: Record<string, string>;
    response_content_length?: number;
  }> = [];
  const exceptions: unknown[] = [];

  for (const envelope of envelopes) {
    if (isFrontendBreadcrumbEnvelope(envelope)) {
      const entry = {
        breadcrumb_type: envelope.payload.breadcrumb_type,
        route: envelope.payload.route,
        data: envelope.payload.data,
        ts: toIsoTimestamp(envelope.occurred_at)
      } satisfies {
        breadcrumb_type: FrontendExceptionBreadcrumb["breadcrumb_type"];
        route: string | null | undefined;
        data: Record<string, unknown>;
        ts: string;
      };
      breadcrumbs.set(buildFrontendBreadcrumbKey(entry), entry);
    }

    if (isFrontendExceptionEnvelope(envelope)) {
      for (const breadcrumb of envelope.payload.breadcrumbs ?? []) {
        const entry = {
          breadcrumb_type: breadcrumb.breadcrumb_type,
          route: breadcrumb.route,
          data: breadcrumb.data,
          ts: toIsoTimestamp(breadcrumb.ts)
        } satisfies {
          breadcrumb_type: FrontendExceptionBreadcrumb["breadcrumb_type"];
          route: string | null | undefined;
          data: Record<string, unknown>;
          ts: string;
        };
        breadcrumbs.set(buildFrontendBreadcrumbKey(entry), entry);
      }

      exceptions.push({
        name: envelope.payload.name,
        message: envelope.payload.message,
        route: envelope.payload.route ?? null,
        browser: envelope.payload.browser,
        ts: toIsoTimestamp(envelope.occurred_at),
        ...(envelope.payload.browser_event !== undefined
          ? { browser_event: envelope.payload.browser_event }
          : {})
      });
    }
  }

  const sortedBreadcrumbs = [...breadcrumbs.values()].sort((left, right) => {
    const timestampComparison = left.ts.localeCompare(right.ts);
    if (timestampComparison !== 0) {
      return timestampComparison;
    }

    return buildFrontendBreadcrumbKey(left).localeCompare(buildFrontendBreadcrumbKey(right));
  });

  for (const breadcrumb of sortedBreadcrumbs) {
    if (breadcrumb.breadcrumb_type === "route_change") {
      const from =
        typeof breadcrumb.data["from"] === "string" ? breadcrumb.data["from"] : "unknown";
      const to =
        typeof breadcrumb.data["to"] === "string"
          ? breadcrumb.data["to"]
          : (breadcrumb.route ?? "unknown");
      routeChanges.push({ from, to, ts: breadcrumb.ts });
    }

    if (breadcrumb.breadcrumb_type === "click") {
      clicks.push({
        selector:
          typeof breadcrumb.data["selector"] === "string" ? breadcrumb.data["selector"] : "unknown",
        label: typeof breadcrumb.data["label"] === "string" ? breadcrumb.data["label"] : "unknown",
        ts: breadcrumb.ts
      });
    }

    if (breadcrumb.breadcrumb_type === "form_submit") {
      formSubmissions.push({
        form: typeof breadcrumb.data["form"] === "string" ? breadcrumb.data["form"] : "unknown",
        fields:
          breadcrumb.data["fields"] !== null && typeof breadcrumb.data["fields"] === "object"
            ? (breadcrumb.data["fields"] as Record<string, unknown>)
            : {},
        ts: breadcrumb.ts
      });
    }

    if (breadcrumb.breadcrumb_type === "console_log") {
      consoleLogs.push({
        ts: breadcrumb.ts,
        ...breadcrumb.data
      });
    }

    if (breadcrumb.breadcrumb_type === "network_request") {
      const entry: (typeof networkRequests)[number] = {
        method: typeof breadcrumb.data["method"] === "string" ? breadcrumb.data["method"] : "GET",
        url: typeof breadcrumb.data["url"] === "string" ? breadcrumb.data["url"] : "unknown",
        status:
          typeof breadcrumb.data["status_code"] === "number" &&
          Number.isInteger(breadcrumb.data["status_code"])
            ? breadcrumb.data["status_code"]
            : typeof breadcrumb.data["status"] === "number" &&
                Number.isInteger(breadcrumb.data["status"])
              ? breadcrumb.data["status"]
              : 0,
        ts: breadcrumb.ts
      };

      if (typeof breadcrumb.data["duration_ms"] === "number")
        entry.duration_ms = breadcrumb.data["duration_ms"];
      if (Array.isArray(breadcrumb.data["caller_trace"]))
        entry.caller_trace = breadcrumb.data["caller_trace"] as string[];
      if (breadcrumb.data["response_body"] !== undefined)
        entry.response_body = breadcrumb.data["response_body"];
      if (breadcrumb.data["request_body"] !== undefined)
        entry.request_body = breadcrumb.data["request_body"];
      if (
        typeof breadcrumb.data["response_headers"] === "object" &&
        breadcrumb.data["response_headers"] !== null
      ) {
        entry.response_headers = breadcrumb.data["response_headers"] as Record<string, string>;
      }
      if (typeof breadcrumb.data["response_content_length"] === "number") {
        entry.response_content_length = breadcrumb.data["response_content_length"];
      }

      networkRequests.push(entry);
    }
  }

  const latestFrontendException = selectLatestEnvelopeByType(
    envelopes,
    isFrontendExceptionEnvelope
  );
  const domContext = latestFrontendException?.payload.dom_context ?? null;

  if (
    routeChanges.length === 0 &&
    clicks.length === 0 &&
    formSubmissions.length === 0 &&
    consoleLogs.length === 0 &&
    networkRequests.length === 0 &&
    exceptions.length === 0 &&
    domContext === null
  ) {
    return null;
  }

  return {
    version: 1,
    route_changes: routeChanges,
    clicks,
    form_submissions: formSubmissions,
    console_logs: consoleLogs,
    network_requests: networkRequests,
    exceptions,
    dom_context: domContext
  };
}
