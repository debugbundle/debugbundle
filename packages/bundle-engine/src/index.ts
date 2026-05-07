import { BundleV1Schema, type BundleV1, type EventEnvelope } from "../../shared-types/src/index.js";
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
type DeployMetadataEnvelope = Extract<EventEnvelope, { event_type: "deploy_metadata" }>;

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

function deriveFirstApplicationFrame(errorContext: BundleV1["context"]["error"]): BundleV1["summary"]["first_application_frame"] {
  const firstFrame = errorContext?.top_frames[0];
  if (firstFrame === undefined) {
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

function buildErrorContext(
  envelopes: EventEnvelope[],
  incident: BundleBuildContext,
  primarySignalEnvelope: EventEnvelope | null
): BundleV1["context"]["error"] {
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

function buildRequestContext(envelopes: EventEnvelope[]): BundleV1["context"]["request"] {
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
    route_template: null,
    query: exceptionEvent.payload.request.query,
    headers: exceptionEvent.payload.request.headers,
    body: exceptionEvent.payload.request.body ?? null,
    request_id: exceptionEvent.correlation?.request_id ?? null
  };
}

function buildResponseContext(envelopes: EventEnvelope[]): BundleV1["context"]["response"] {
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
      const timestamp = toIsoTimestamp(envelope.occurred_at);
      if (envelope.payload.breadcrumb_type === "route_change") {
        const from = typeof envelope.payload.data["from"] === "string" ? envelope.payload.data["from"] : "unknown";
        const to = typeof envelope.payload.data["to"] === "string" ? envelope.payload.data["to"] : envelope.payload.route ?? "unknown";
        routeChanges.push({ from, to, ts: timestamp });
      }

      if (envelope.payload.breadcrumb_type === "click") {
        clicks.push({
          selector: typeof envelope.payload.data["selector"] === "string" ? envelope.payload.data["selector"] : "unknown",
          label: typeof envelope.payload.data["label"] === "string" ? envelope.payload.data["label"] : "unknown",
          ts: timestamp
        });
      }

      if (envelope.payload.breadcrumb_type === "form_submit") {
        formSubmissions.push({
          form: typeof envelope.payload.data["form"] === "string" ? envelope.payload.data["form"] : "unknown",
          fields:
            envelope.payload.data["fields"] !== null && typeof envelope.payload.data["fields"] === "object"
              ? (envelope.payload.data["fields"] as Record<string, unknown>)
              : {},
          ts: timestamp
        });
      }

      if (envelope.payload.breadcrumb_type === "console_log") {
        consoleLogs.push({
          ts: timestamp,
          ...envelope.payload.data
        });
      }

      if (envelope.payload.breadcrumb_type === "network_request") {
        const d = envelope.payload.data;
        const entry: (typeof networkRequests)[number] = {
          method: typeof d["method"] === "string" ? d["method"] : "GET",
          url: typeof d["url"] === "string" ? d["url"] : "unknown",
          status:
            typeof d["status_code"] === "number" && Number.isInteger(d["status_code"])
              ? d["status_code"]
              : typeof d["status"] === "number" && Number.isInteger(d["status"])
                ? d["status"]
                : 0,
          ts: timestamp
        };

        if (typeof d["duration_ms"] === "number") entry.duration_ms = d["duration_ms"];
        if (Array.isArray(d["caller_trace"])) entry.caller_trace = d["caller_trace"] as string[];
        if (d["response_body"] !== undefined) entry.response_body = d["response_body"];
        if (d["request_body"] !== undefined) entry.request_body = d["request_body"];
        if (typeof d["response_headers"] === "object" && d["response_headers"] !== null) {
          entry.response_headers = d["response_headers"] as Record<string, string>;
        }
        if (typeof d["response_content_length"] === "number") {
          entry.response_content_length = d["response_content_length"];
        }

        networkRequests.push(entry);
      }
    }

    if (isFrontendExceptionEnvelope(envelope)) {
      exceptions.push({
        name: envelope.payload.name,
        message: envelope.payload.message,
        route: envelope.payload.route ?? null,
        browser: envelope.payload.browser,
        ts: toIsoTimestamp(envelope.occurred_at)
      });
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
  trigger: BuildBundleJob["trigger"]
): BundleV1["context"]["deploy"] {
  const envelope = selectLatestEnvelopeByType(envelopes, isDeployMetadataEnvelope);
  if (envelope === null) {
    return null;
  }

  return {
    version: 1,
    commit_sha: envelope.payload.commit_sha,
    deploy_version: envelope.payload.version,
    branch: envelope.payload.branch,
    deployed_at: toIsoTimestamp(envelope.payload.deployed_at),
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

  return {
    version: 1,
    name: backendException.service.runtime ?? "unknown",
    runtime_version: backendException.payload.runtime.version,
    platform: null,
    arch: null,
    pid: null,
    cwd: null,
    uptime_sec: null,
    hostname: null,
    thread_id: null,
    framework: backendException.service.framework ?? null,
    framework_version: null,
    memory: null,
    framework_extras: null
  };
}

function buildGitContext(envelopes: EventEnvelope[]): BundleV1["context"]["git"] {
  const deployEnvelope = selectLatestEnvelopeByType(envelopes, isDeployMetadataEnvelope);
  if (deployEnvelope === null) {
    return null;
  }

  return {
    version: 1,
    commit: deployEnvelope.payload.commit_sha,
    commit_short: deployEnvelope.payload.commit_sha.slice(0, 7),
    branch: deployEnvelope.payload.branch,
    repo: null,
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
  const deployContext = buildDeployContext(sourceEnvelopes, input.job.trigger);
  const runtimeContext = buildRuntimeContext(sourceEnvelopes);
  const gitContext = buildGitContext(sourceEnvelopes);
  const deviceContext = buildDeviceContext(sourceEnvelopes);
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

  return BundleV1Schema.parse({
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
      likely_cause: null,
      confidence: 0,
      recommended_action: null,
      severity: input.incident.severity,
      error_type: primarySourceEvent,
      error_message: errorContext?.message ?? input.incident.title,
      first_application_frame: deriveFirstApplicationFrame(errorContext),
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
      dependencies: null,
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
      self: null,
      reproduction: null,
      incident: null,
      project: null,
      docs: null
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
  });
}
