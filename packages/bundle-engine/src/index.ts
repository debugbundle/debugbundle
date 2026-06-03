import { BundleV1Schema, type BundleV1, type EventEnvelope } from "../../shared-types/src/index.js";
import { redact, type JsonValue } from "../../redaction/src/index.js";
import type { BundleBuildContext, BuildBundleJob } from "../../storage/src/index.js";

export interface BundleProbeDataItem {
  label: string;
  data: Record<string, unknown>;
  timestamp: string;
  activation_id: string | null;
}

export interface BuildBundleInput {
  job: Pick<BuildBundleJob, "trigger">;
  incident: BundleBuildContext;
  linkBaseUrls?: {
    api?: string | null;
    app?: string | null;
    docs?: string | null;
  };
  configuredDeploy?: {
    commit_sha?: string | null;
    deploy_version?: string | null;
    branch?: string | null;
    deployed_at?: string | null;
    repo?: string | null;
  };
  bundleMetadata: {
    generation_number: number;
    created_at: string;
    updated_at: string;
    source_event_id: string;
    source_occurred_at: string;
  };
  sourceEnvelopes: EventEnvelope[];
  probeDataItems: BundleProbeDataItem[];
}

type BackendExceptionEnvelope = Extract<EventEnvelope, { event_type: "backend_exception" }>;
type FrontendExceptionEnvelope = Extract<EventEnvelope, { event_type: "frontend_exception" }>;
type RequestEventEnvelope = Extract<EventEnvelope, { event_type: "request_event" }>;
type LogEventEnvelope = Extract<EventEnvelope, { event_type: "log_event" }>;
type FrontendBreadcrumbEnvelope = Extract<EventEnvelope, { event_type: "frontend_breadcrumb" }>;
type FrontendExceptionBreadcrumb = NonNullable<FrontendExceptionEnvelope["payload"]["breadcrumbs"]>[number];
type DeployMetadataEnvelope = Extract<EventEnvelope, { event_type: "deploy_metadata" }>;
type BundleErrorContext = Exclude<BundleV1["context"]["error"], null | undefined>;
type BundleRequestContext = Exclude<BundleV1["context"]["request"], null | undefined>;
type BundleResponseContext = Exclude<BundleV1["context"]["response"], null | undefined>;
type BundleDependenciesContext = Exclude<BundleV1["context"]["dependencies"], null | undefined>;
type BundleRuntimeMemory = NonNullable<Exclude<BundleV1["context"]["runtime"], null | undefined>["memory"]>;
type BrowserExceptionEventContext = NonNullable<FrontendExceptionEnvelope["payload"]["browser_event"]>;
type BackendRuntimePayload = BackendExceptionEnvelope["payload"]["runtime"] & {
  platform?: string | null;
  arch?: string | null;
  pid?: number | null;
  cwd?: string | null;
  uptime_sec?: number | null;
  hostname?: string | null;
  thread_id?: string | number | null;
  framework_version?: string | null;
  memory?: BundleRuntimeMemory | null;
  framework_extras?: Record<string, unknown> | null;
};

const DYNAMIC_SEGMENT_PATTERN = /^(?:\d+|[0-9a-f]{8}-[0-9a-f-]{27}|[A-Za-z0-9_-]{24,})$/;

function toIsoTimestamp(value: string): string {
  return new Date(value).toISOString();
}

function selectLatestEnvelope(
  envelopes: EventEnvelope[],
  predicate: (envelope: EventEnvelope) => boolean
): EventEnvelope | null {
  for (let index = envelopes.length - 1; index >= 0; index -= 1) {
    const envelope = envelopes[index];
    if (envelope !== undefined && predicate(envelope)) {
      return envelope;
    }
  }

  return null;
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

function isBackendExceptionEnvelope(envelope: EventEnvelope): envelope is BackendExceptionEnvelope {
  return envelope.event_type === "backend_exception";
}

function isFrontendExceptionEnvelope(envelope: EventEnvelope): envelope is FrontendExceptionEnvelope {
  return envelope.event_type === "frontend_exception";
}

function isRequestEventEnvelope(envelope: EventEnvelope): envelope is RequestEventEnvelope {
  return envelope.event_type === "request_event";
}

function isLogEventEnvelope(envelope: EventEnvelope): envelope is LogEventEnvelope {
  return envelope.event_type === "log_event";
}

function isFrontendBreadcrumbEnvelope(envelope: EventEnvelope): envelope is FrontendBreadcrumbEnvelope {
  return envelope.event_type === "frontend_breadcrumb";
}

function isDeployMetadataEnvelope(envelope: EventEnvelope): envelope is DeployMetadataEnvelope {
  return envelope.event_type === "deploy_metadata";
}

function selectPrimarySignalEnvelope(envelopes: EventEnvelope[], sourceEventId: string): EventEnvelope | null {
  const sourceEnvelope = envelopes.find((envelope) => envelope.event_id === sourceEventId);
  if (sourceEnvelope !== undefined) {
    return sourceEnvelope;
  }

  return (
    selectLatestEnvelope(
      envelopes,
      (envelope) =>
        envelope.event_type === "backend_exception" ||
        envelope.event_type === "frontend_exception" ||
        envelope.event_type === "request_event"
    ) ?? null
  );
}

function mapSignalType(eventType: EventEnvelope["event_type"] | null): BundleV1["signal"]["signal_type"] {
  if (eventType === "request_event") {
    return "request_failure";
  }

  if (eventType === "frontend_exception") {
    return "frontend_exception";
  }

  return "exception";
}

function inferSignalTypeFromSourceEventTypes(sourceEventTypes: string[]): BundleV1["signal"]["signal_type"] {
  if (sourceEventTypes.includes("frontend_exception")) {
    return "frontend_exception";
  }

  if (sourceEventTypes.includes("backend_exception")) {
    return "exception";
  }

  if (sourceEventTypes.includes("request_event")) {
    return "request_failure";
  }

  return "exception";
}

function extractTopFrames(stack: string): string[] {
  return stack
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at "))
    .slice(0, 3);
}

function decodeRouteSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
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

function normalizeRouteTemplate(path: string | null): string | null {
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

function isBrowserSdkFallbackFrame(frame: string): boolean {
  const normalizedFrame = frame.toLowerCase();
  return (
    normalizedFrame.includes("onerror") &&
    (
      normalizedFrame.includes("debugbundle-browser-sdk") ||
      normalizedFrame.includes("debugbundle-browser.js") ||
      normalizedFrame.includes("wp-content/plugins/debugbundle/")
    )
  );
}

function deriveFirstApplicationFrame(errorContext: BundleErrorContext | null): BundleV1["summary"]["first_application_frame"] {
  const firstFrame = errorContext?.top_frames[0];
  if (firstFrame === undefined) {
    return null;
  }

  if (isBrowserSdkFallbackFrame(firstFrame)) {
    return null;
  }

  const match = /at\s+(.*?)\s+\((.*?):(\d+):(\d+)\)$/.exec(firstFrame) ?? /at\s+(.*?):(\d+):(\d+)$/.exec(firstFrame);
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

function getPrimaryBrowserExceptionEvent(
  envelopes: EventEnvelope[],
  primarySignalEnvelope: EventEnvelope | null
): BrowserExceptionEventContext | null {
  if (primarySignalEnvelope !== null && isFrontendExceptionEnvelope(primarySignalEnvelope)) {
    return primarySignalEnvelope.payload.browser_event ?? null;
  }

  const envelope = selectLatestEnvelopeByType(envelopes, isFrontendExceptionEnvelope);
  return envelope?.payload.browser_event ?? null;
}

function isOpaqueBrowserError(
  errorContext: BundleErrorContext | null,
  browserEvent: BrowserExceptionEventContext | null
): boolean {
  if (browserEvent?.opaque === true) {
    return true;
  }

  const firstFrame = errorContext?.top_frames[0];
  return errorContext?.message === "Window error" && firstFrame !== undefined && isBrowserSdkFallbackFrame(firstFrame);
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

function buildErrorContext(
  envelopes: EventEnvelope[],
  incident: BundleBuildContext,
  primarySignalEnvelope: EventEnvelope | null
): BundleErrorContext | null {
  if (primarySignalEnvelope !== null && isBackendExceptionEnvelope(primarySignalEnvelope)) {
    return {
      version: 1,
      name: primarySignalEnvelope.payload.name,
      message: primarySignalEnvelope.payload.message,
      stack: primarySignalEnvelope.payload.stack,
      handled: primarySignalEnvelope.payload.handled,
      top_frames: extractTopFrames(primarySignalEnvelope.payload.stack)
    };
  }

  if (primarySignalEnvelope !== null && isFrontendExceptionEnvelope(primarySignalEnvelope)) {
    return {
      version: 1,
      name: primarySignalEnvelope.payload.name,
      message: primarySignalEnvelope.payload.message,
      stack: primarySignalEnvelope.payload.stack,
      handled: false,
      top_frames: extractTopFrames(primarySignalEnvelope.payload.stack)
    };
  }

  const envelope =
    selectLatestEnvelopeByType(envelopes, isBackendExceptionEnvelope) ??
    selectLatestEnvelopeByType(envelopes, isFrontendExceptionEnvelope);

  if (envelope === null) {
    if (
      !incident.source_event_types.includes("backend_exception") &&
      !incident.source_event_types.includes("frontend_exception")
    ) {
      return null;
    }

    const fallbackName = incident.source_event_types.includes("frontend_exception")
      ? "frontend_exception"
      : "backend_exception";

    return {
      version: 1,
      name: fallbackName,
      message: incident.title,
      stack: "unavailable",
      handled: false,
      top_frames: []
    };
  }

  return {
    version: 1,
    name: envelope.payload.name,
    message: envelope.payload.message,
    stack: envelope.payload.stack,
    handled: envelope.event_type === "backend_exception" ? envelope.payload.handled : false,
    top_frames: extractTopFrames(envelope.payload.stack)
  };
}

function buildRequestContext(envelopes: EventEnvelope[]): BundleRequestContext | null {
  const requestEvent = selectLatestEnvelopeByType(envelopes, isRequestEventEnvelope);
  if (requestEvent !== null) {
    return {
      version: 1,
      method: requestEvent.payload.method,
      path: requestEvent.payload.path,
      route_template: requestEvent.payload.route_template ?? null,
      query: requestEvent.payload.query,
      headers: requestEvent.payload.headers,
      body: requestEvent.payload.body ?? null,
      request_id: requestEvent.correlation?.request_id ?? null
    };
  }

  const exceptionEvent = selectLatestEnvelopeByType(envelopes, isBackendExceptionEnvelope);
  if (exceptionEvent === null) {
    return null;
  }

  return {
    version: 1,
    method: exceptionEvent.payload.request.method,
    path: exceptionEvent.payload.request.path,
    route_template: normalizeRouteTemplate(exceptionEvent.payload.request.path),
    query: exceptionEvent.payload.request.query,
    headers: exceptionEvent.payload.request.headers,
    body: exceptionEvent.payload.request.body ?? null,
    request_id: exceptionEvent.correlation?.request_id ?? null
  };
}

function titleCaseWord(value: string): string {
  if (value.toLowerCase() === "github") {
    return "GitHub";
  }

  if (value.toLowerCase() === "api") {
    return "API";
  }

  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function formatDependencyName(name: string): string {
  return name.split("_").filter((part) => part.length > 0).map(titleCaseWord).join(" ");
}

function inferDependencyName(text: string): string | null {
  const match = /\b([a-z][a-z0-9]*_api)_(?:invalid_response|error|failure|failed|unavailable|timeout)\b/.exec(text);
  return match?.[1] ?? null;
}

function buildDependenciesContext(
  incident: BundleBuildContext,
  errorContext: BundleErrorContext | null,
  requestContext: BundleRequestContext | null
): BundleDependenciesContext | null {
  if (errorContext === null) {
    return null;
  }

  const text = `${incident.title} ${errorContext.name} ${errorContext.message}`.toLowerCase();
  const dependencyName = inferDependencyName(text);
  if (dependencyName === null) {
    return null;
  }

  const displayName = formatDependencyName(dependencyName);
  const route = requestContext?.route_template ?? requestContext?.path ?? null;
  const requestDescription = requestContext !== null ? `${requestContext.method} ${route ?? requestContext.path}` : "the failing request";
  const invalidResponse = text.includes("invalid_response");

  return {
    version: 1,
    items: [
      {
        name: dependencyName,
        status: "failed",
        notes: invalidResponse
          ? `${displayName} returned an unexpected response shape while handling ${requestDescription}.`
          : `${displayName} failed while handling ${requestDescription}.`
      }
    ]
  };
}

function buildSummaryGuidance(input: {
  errorContext: BundleErrorContext | null;
  requestContext: BundleRequestContext | null;
  responseContext: BundleResponseContext | null;
  dependenciesContext: BundleDependenciesContext | null;
  firstApplicationFrame: BundleV1["summary"]["first_application_frame"];
  browserEvent: BrowserExceptionEventContext | null;
  opaqueBrowserError: boolean;
}): Pick<BundleV1["summary"], "likely_cause" | "confidence" | "recommended_action"> {
  if (input.errorContext === null) {
    return {
      likely_cause: null,
      confidence: 0,
      recommended_action: null
    };
  }

  if (input.opaqueBrowserError) {
    if (input.browserEvent?.kind === "resource_error") {
      return {
        likely_cause: "The browser reported a resource load error without a usable application stack.",
        confidence: 0.35,
        recommended_action:
          "Inspect the captured resource target, browser network failures, CSP rules, and cross-origin asset configuration."
      };
    }

    return {
      likely_cause: "The browser reported an opaque window error without a usable application stack.",
      confidence: 0.35,
      recommended_action:
        "Inspect browser console output, resource loading, cross-origin script settings, and framework-level error boundaries for the affected route."
    };
  }

  const route = input.requestContext?.route_template ?? input.requestContext?.path ?? null;
  const requestDescription = input.requestContext !== null ? `${input.requestContext.method} ${route ?? input.requestContext.path}` : null;
  const firstDependency = input.dependenciesContext?.items[0] ?? null;
  const dependencyDisplayName = firstDependency !== null ? formatDependencyName(firstDependency.name) : null;
  const firstFrame = input.firstApplicationFrame;
  const frameDescription = firstFrame?.file !== null && firstFrame?.file !== undefined ? ` in ${firstFrame.file}` : "";
  const invalidResponse = input.errorContext.message.toLowerCase().includes("invalid_response");

  let likelyCause: string | null = null;
  let recommendedAction: string | null = null;

  if (firstDependency !== null && dependencyDisplayName !== null && requestDescription !== null && invalidResponse) {
    likelyCause = `${dependencyDisplayName} returned a response that did not match the expected schema while handling ${requestDescription}.`;
    recommendedAction = `Inspect the ${dependencyDisplayName} response handling${frameDescription}, including schema validation and sanitized upstream response shape.`;
  } else if (firstDependency !== null && dependencyDisplayName !== null && requestDescription !== null) {
    likelyCause = `${dependencyDisplayName} failed while handling ${requestDescription}.`;
    recommendedAction = `Inspect the ${dependencyDisplayName} call path${frameDescription} and compare the captured dependency notes with upstream status.`;
  } else if (requestDescription !== null) {
    likelyCause = `${input.errorContext.name} occurred while handling ${requestDescription}${frameDescription}.`;
    recommendedAction = `Inspect the first application frame${frameDescription} and the captured request/response context.`;
  } else if (firstFrame !== null) {
    likelyCause = `${input.errorContext.name} originated from the first captured application frame${frameDescription}.`;
    recommendedAction = `Inspect the first application frame${frameDescription} and surrounding error handling.`;
  }

  if (likelyCause === null || recommendedAction === null) {
    return {
      likely_cause: null,
      confidence: 0,
      recommended_action: null
    };
  }

  let confidence = 0.25;
  if (input.requestContext !== null) confidence += 0.15;
  if (input.responseContext !== null) confidence += 0.1;
  if (firstFrame !== null && firstFrame.file !== null) confidence += 0.1;
  if (firstDependency !== null) confidence += 0.1;
  if (input.errorContext.message.length > 0) confidence += 0.05;

  return {
    likely_cause: likelyCause,
    confidence: Math.min(0.8, Number(confidence.toFixed(2))),
    recommended_action: recommendedAction
  };
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return null;
  }

  return trimmed.replace(/\/+$/, "");
}

function buildLinks(
  incident: BundleBuildContext,
  linkBaseUrls: BuildBundleInput["linkBaseUrls"]
): BundleV1["links"] {
  const apiBaseUrl = normalizeBaseUrl(linkBaseUrls?.api);
  const appBaseUrl = normalizeBaseUrl(linkBaseUrls?.app);
  const docsBaseUrl = normalizeBaseUrl(linkBaseUrls?.docs);
  const incidentPath = `/v1/incidents/${encodeURIComponent(incident.incident_id)}`;
  const appIncidentPath = `/incidents/${encodeURIComponent(incident.incident_id)}`;
  const appProjectPath = `/projects/${encodeURIComponent(incident.project_id)}`;

  return {
    self: apiBaseUrl !== null ? `${apiBaseUrl}${incidentPath}/bundle` : null,
    reproduction: apiBaseUrl !== null ? `${apiBaseUrl}${incidentPath}/reproduction` : null,
    incident: appBaseUrl !== null ? `${appBaseUrl}${appIncidentPath}` : null,
    project: appBaseUrl !== null ? `${appBaseUrl}${appProjectPath}` : null,
    docs: docsBaseUrl !== null ? `${docsBaseUrl}/bundles` : null
  };
}

function applyBundleRedaction(candidate: unknown): unknown {
  const redactionResult = redact(candidate as JsonValue);
  const fields = [...new Set(redactionResult.redacted_fields)].sort();
  const redactedBundle = redactionResult.redacted as Record<string, unknown>;

  redactedBundle["redaction"] = {
    redacted: true,
    fields,
    notes: fields.length > 0 ? "Sensitive bundle fields were redacted before storage." : null
  };

  return redactedBundle;
}

function buildResponseContext(envelopes: EventEnvelope[]): BundleResponseContext | null {
  const requestEvent = selectLatestEnvelopeByType(envelopes, isRequestEventEnvelope);
  if (requestEvent !== null) {
    const context: NonNullable<BundleV1["context"]["response"]> = {
      version: 1,
      status_code: requestEvent.payload.response_status,
      duration_ms: requestEvent.payload.duration_ms
    };

    const responseHeaders = (requestEvent.payload as Record<string, unknown>)["response_headers"];
    if (typeof responseHeaders === "object" && responseHeaders !== null) {
      context.headers = responseHeaders as Record<string, unknown>;
    }

    const responseBody = (requestEvent.payload as Record<string, unknown>)["response_body"];
    if (responseBody !== undefined) {
      context.body = responseBody;
    }

    return context;
  }

  const exceptionEvent = selectLatestEnvelopeByType(envelopes, isBackendExceptionEnvelope);
  if (exceptionEvent === null) {
    return null;
  }

  const context: NonNullable<BundleV1["context"]["response"]> = {
    version: 1,
    status_code: exceptionEvent.payload.response.status_code,
    duration_ms: null
  };

  if (exceptionEvent.payload.response.headers !== undefined) {
    context.headers = exceptionEvent.payload.response.headers;
  }
  if (exceptionEvent.payload.response.body !== undefined) {
    context.body = exceptionEvent.payload.response.body;
  }

  return context;
}

function buildLogsContext(envelopes: EventEnvelope[]): BundleV1["context"]["logs"] {
  const items = envelopes
    .filter(isLogEventEnvelope)
    .map((envelope) => ({
      level: envelope.payload.level,
      message: envelope.payload.message,
      timestamp: toIsoTimestamp(envelope.occurred_at),
      attributes: envelope.payload.attributes
    }));

  if (items.length === 0) {
    return null;
  }

  return {
    version: 1,
    items
  };
}

function buildFrontendContext(envelopes: EventEnvelope[]): BundleV1["context"]["frontend"] {
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
        ...(envelope.payload.browser_event !== undefined ? { browser_event: envelope.payload.browser_event } : {})
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
      const from = typeof breadcrumb.data["from"] === "string" ? breadcrumb.data["from"] : "unknown";
      const to = typeof breadcrumb.data["to"] === "string" ? breadcrumb.data["to"] : breadcrumb.route ?? "unknown";
      routeChanges.push({ from, to, ts: breadcrumb.ts });
    }

    if (breadcrumb.breadcrumb_type === "click") {
      clicks.push({
        selector: typeof breadcrumb.data["selector"] === "string" ? breadcrumb.data["selector"] : "unknown",
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
          typeof breadcrumb.data["status_code"] === "number" && Number.isInteger(breadcrumb.data["status_code"])
            ? breadcrumb.data["status_code"]
            : typeof breadcrumb.data["status"] === "number" && Number.isInteger(breadcrumb.data["status"])
              ? breadcrumb.data["status"]
              : 0,
        ts: breadcrumb.ts
      };

      if (typeof breadcrumb.data["duration_ms"] === "number") entry.duration_ms = breadcrumb.data["duration_ms"];
      if (Array.isArray(breadcrumb.data["caller_trace"])) entry.caller_trace = breadcrumb.data["caller_trace"] as string[];
      if (breadcrumb.data["response_body"] !== undefined) entry.response_body = breadcrumb.data["response_body"];
      if (breadcrumb.data["request_body"] !== undefined) entry.request_body = breadcrumb.data["request_body"];
      if (typeof breadcrumb.data["response_headers"] === "object" && breadcrumb.data["response_headers"] !== null) {
        entry.response_headers = breadcrumb.data["response_headers"] as Record<string, string>;
      }
      if (typeof breadcrumb.data["response_content_length"] === "number") {
        entry.response_content_length = breadcrumb.data["response_content_length"];
      }

      networkRequests.push(entry);
    }
  }

  const latestFrontendException = selectLatestEnvelopeByType(envelopes, isFrontendExceptionEnvelope);
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

function buildDeployContext(
  envelopes: EventEnvelope[],
  trigger: BuildBundleJob["trigger"],
  configuredDeploy: BuildBundleInput["configuredDeploy"]
): BundleV1["context"]["deploy"] {
  const envelope = selectLatestEnvelopeByType(envelopes, isDeployMetadataEnvelope);
  if (envelope !== null) {
    return {
      version: 1,
      commit_sha: envelope.payload.commit_sha,
      deploy_version: envelope.payload.version,
      branch: envelope.payload.branch,
      deployed_at: toIsoTimestamp(envelope.payload.deployed_at),
      regression_window: trigger === "regression_reopen"
    };
  }

  const commitSha = configuredDeploy?.commit_sha ?? null;
  const deployVersion = configuredDeploy?.deploy_version ?? null;
  const branch = configuredDeploy?.branch ?? null;
  const deployedAt = configuredDeploy?.deployed_at ?? null;
  if (commitSha === null && deployVersion === null && branch === null && deployedAt === null) {
    return null;
  }

  return {
    version: 1,
    commit_sha: commitSha,
    deploy_version: deployVersion,
    branch,
    deployed_at: deployedAt === null ? null : toIsoTimestamp(deployedAt),
    regression_window: trigger === "regression_reopen"
  };
}

function buildRuntimeContext(
  envelopes: EventEnvelope[]
): BundleV1["context"]["runtime"] {
  const backendException = selectLatestEnvelopeByType(envelopes, isBackendExceptionEnvelope);
  if (backendException === null) {
    return null;
  }

  const runtime = backendException.payload.runtime as BackendRuntimePayload;

  return {
    version: 1,
    name: backendException.service.runtime ?? "unknown",
    runtime_version: runtime.version,
    platform: runtime.platform ?? null,
    arch: runtime.arch ?? null,
    pid: runtime.pid ?? null,
    cwd: runtime.cwd ?? null,
    uptime_sec: runtime.uptime_sec ?? null,
    hostname: runtime.hostname ?? null,
    thread_id: runtime.thread_id ?? null,
    framework: backendException.service.framework ?? null,
    framework_version: runtime.framework_version ?? null,
    memory: runtime.memory ?? null,
    framework_extras: runtime.framework_extras ?? null
  };
}

function buildGitContext(
  envelopes: EventEnvelope[],
  configuredDeploy: BuildBundleInput["configuredDeploy"]
): BundleV1["context"]["git"] {
  const deployEnvelope = selectLatestEnvelopeByType(envelopes, isDeployMetadataEnvelope);
  if (deployEnvelope === null) {
    const commit = configuredDeploy?.commit_sha ?? null;
    const branch = configuredDeploy?.branch ?? null;
    const repo = configuredDeploy?.repo ?? null;
    if (commit === null && branch === null && repo === null) {
      return null;
    }

    return {
      version: 1,
      commit,
      commit_short: commit === null ? null : commit.slice(0, 7),
      branch,
      repo,
      dirty: false,
      source: "env"
    };
  }

  return {
    version: 1,
    commit: deployEnvelope.payload.commit_sha,
    commit_short: deployEnvelope.payload.commit_sha.slice(0, 7),
    branch: deployEnvelope.payload.branch,
    repo: configuredDeploy?.repo ?? null,
    dirty: false,
    source: "env"
  };
}

function buildDeviceContext(envelopes: EventEnvelope[]): BundleV1["context"]["device"] {
  const envelope = selectLatestEnvelopeByType(envelopes, isFrontendExceptionEnvelope);
  if (envelope === null || envelope.payload.device === undefined || envelope.payload.device === null) {
    return null;
  }

  return {
    version: 1,
    user_agent: envelope.payload.device.user_agent,
    browser: {
      name: envelope.payload.browser.name,
      version: envelope.payload.browser.version
    },
    os: envelope.payload.device.os,
    device_type: envelope.payload.device.device_type,
    screen: envelope.payload.device.screen,
    viewport: envelope.payload.device.viewport,
    device_pixel_ratio: envelope.payload.device.device_pixel_ratio,
    touch_capable: envelope.payload.device.touch_capable,
    language: envelope.payload.device.language,
    connection_type: envelope.payload.device.connection_type,
    color_scheme_preference: envelope.payload.device.color_scheme_preference
  };
}

export function buildBundle(input: BuildBundleInput): BundleV1 {
  const sourceEnvelopes = [...input.sourceEnvelopes].sort((left, right) => {
    const occurredAtComparison = left.occurred_at.localeCompare(right.occurred_at);
    if (occurredAtComparison !== 0) {
      return occurredAtComparison;
    }
    return left.event_id.localeCompare(right.event_id);
  });
  const sourceEventTypes = [...input.incident.source_event_types].sort();
  const primarySignalEnvelope = selectPrimarySignalEnvelope(sourceEnvelopes, input.bundleMetadata.source_event_id);
  const errorContext = buildErrorContext(sourceEnvelopes, input.incident, primarySignalEnvelope);
  const requestContext = buildRequestContext(sourceEnvelopes);
  const responseContext = buildResponseContext(sourceEnvelopes);
  const logsContext = buildLogsContext(sourceEnvelopes);
  const frontendContext = buildFrontendContext(sourceEnvelopes);
  const deployContext = buildDeployContext(sourceEnvelopes, input.job.trigger, input.configuredDeploy);
  const runtimeContext = buildRuntimeContext(sourceEnvelopes);
  const gitContext = buildGitContext(sourceEnvelopes, input.configuredDeploy);
  const deviceContext = buildDeviceContext(sourceEnvelopes);
  const dependenciesContext = buildDependenciesContext(input.incident, errorContext, requestContext);
  const browserEvent = getPrimaryBrowserExceptionEvent(sourceEnvelopes, primarySignalEnvelope);
  const opaqueBrowserError = isOpaqueBrowserError(errorContext, browserEvent);
  const primarySignalType =
    primarySignalEnvelope !== null
      ? mapSignalType(primarySignalEnvelope.event_type)
      : inferSignalTypeFromSourceEventTypes(sourceEventTypes);
  const primarySourceEvent = errorContext?.name ?? sourceEventTypes[0] ?? "backend_exception";
  const firstSeenAt = new Date(input.incident.first_seen_at).toISOString();
  const lastSeenAt = new Date(input.incident.last_seen_at).toISOString();
  const capturedAt =
    primarySignalEnvelope !== null
      ? toIsoTimestamp(primarySignalEnvelope.occurred_at)
      : toIsoTimestamp(input.bundleMetadata.source_occurred_at);
  const serviceRuntime =
    input.incident.service_runtime ??
    selectLatestEnvelope(sourceEnvelopes, (envelope) => envelope.event_type !== "probe_event")?.service.runtime ??
    null;
  const serviceFramework =
    input.incident.service_framework ??
    selectLatestEnvelope(sourceEnvelopes, (envelope) => envelope.event_type !== "probe_event")?.service.framework ??
    null;
  const customerVisible = frontendContext !== null;
  const firstApplicationFrame = opaqueBrowserError ? null : deriveFirstApplicationFrame(errorContext);
  const summaryGuidance = buildSummaryGuidance({
    errorContext,
    requestContext,
    responseContext,
    dependenciesContext,
    firstApplicationFrame,
    browserEvent,
    opaqueBrowserError
  });

  const candidate = {
    bundle_version: 1,
    bundle_id: `bnd_${input.incident.incident_id}`,
    bundle_type: "failure",
    captured_at: capturedAt,
    sdk: {
      name: "debugbundle-worker",
      version: "0.1.0"
    },
    project: {
      id: input.incident.project_id,
      slug: input.incident.project_id,
      environment: input.incident.environment
    },
    service: {
      id: input.incident.service_id ?? "svc_unknown",
      name: input.incident.service_name,
      runtime: serviceRuntime,
      framework: serviceFramework,
      version: null,
      region: null
    },
    signal: {
      signal_id: primarySignalEnvelope?.event_id ?? input.bundleMetadata.source_event_id,
      signal_type: primarySignalType,
      severity: input.incident.severity,
      fingerprint: input.incident.fingerprint,
      first_seen_at: firstSeenAt,
      last_seen_at: lastSeenAt,
      occurrence_count: input.incident.occurrence_count,
      source_event_types: sourceEventTypes
    },
    summary: {
      title: input.incident.title,
      description: `Deterministic bundle generated from ${input.job.trigger}`,
      likely_cause: summaryGuidance.likely_cause,
      confidence: summaryGuidance.confidence,
      recommended_action: summaryGuidance.recommended_action,
      severity: input.incident.severity,
      error_type: primarySourceEvent,
      error_message: errorContext?.message ?? input.incident.title,
      first_application_frame: firstApplicationFrame,
      primary_signal: primarySignalType,
      signals: {
        new_deploy: input.job.trigger === "deploy_metadata",
        regression_suspected: input.job.trigger === "regression_reopen",
        customer_visible: customerVisible
      }
    },
    impact: {
      affected_users_estimate: null,
      affected_requests_estimate: null,
      business_criticality: input.incident.severity,
      customer_visible: customerVisible,
      regression_suspected: input.job.trigger === "regression_reopen"
    },
    context: {
      error: errorContext,
      request: requestContext,
      response: responseContext,
      logs: logsContext,
      frontend: frontendContext,
      environment: null,
      deploy: deployContext,
      runtime: runtimeContext,
      git: gitContext,
      dependencies: dependenciesContext,
      probe_data: {
        version: 1,
        items: input.probeDataItems
      },
      device: deviceContext
    },
    reproduction: {
      possible: false,
      confidence: 0,
      reason: "reproduction_not_generated",
      artifacts: null,
      feasibility_reference: null
    },
    verification: {
      verification_type: null,
      synthetic: false,
      local_verified: false,
      production_verified: false
    },
    links: {
      ...buildLinks(input.incident, input.linkBaseUrls)
    },
    redaction: {
      redacted: true,
      fields: [],
      notes: null
    },
    metadata: {
      created_at: toIsoTimestamp(input.bundleMetadata.created_at),
      updated_at: toIsoTimestamp(input.bundleMetadata.updated_at),
      generator_version: "worker-build-bundle-v2",
      generation_number: input.bundleMetadata.generation_number
    }
  };

  return BundleV1Schema.parse(applyBundleRedaction(candidate));
}
