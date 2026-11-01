import type { BundleV1, EventEnvelope } from "../../shared-types/src/index.js";
import { selectLatestEnvelopeByType, isBackendExceptionEnvelope } from "./envelope-selection.js";
import { isFrontendExceptionEnvelope } from "./frontend-context.js";
type BackendExceptionEnvelope = Extract<EventEnvelope, { event_type: "backend_exception" }>;
type BundleRuntimeMemory = NonNullable<
  Exclude<BundleV1["context"]["runtime"], null | undefined>["memory"]
>;
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

export function buildRuntimeContext(envelopes: EventEnvelope[]): BundleV1["context"]["runtime"] {
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

export function buildDeviceContext(envelopes: EventEnvelope[]): BundleV1["context"]["device"] {
  const envelope = selectLatestEnvelopeByType(envelopes, isFrontendExceptionEnvelope);
  if (
    envelope === null ||
    envelope.payload.device === undefined ||
    envelope.payload.device === null
  ) {
    return null;
  }

  return {
    version: 1,
    user_agent: envelope.payload.device.user_agent,
    browser: {
      name: envelope.payload.browser?.name ?? null,
      version: envelope.payload.browser?.version ?? null
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
