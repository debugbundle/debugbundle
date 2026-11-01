import type { BundleV1, EventEnvelope } from "../../shared-types/src/index.js";
type BackendExceptionEnvelope = Extract<EventEnvelope, { event_type: "backend_exception" }>;
type RequestEventEnvelope = Extract<EventEnvelope, { event_type: "request_event" }>;
type LogEventEnvelope = Extract<EventEnvelope, { event_type: "log_event" }>;
type DeployMetadataEnvelope = Extract<EventEnvelope, { event_type: "deploy_metadata" }>;

export function selectLatestEnvelope(
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

export function selectLatestEnvelopeByType<TEnvelope extends EventEnvelope>(
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

export function isBackendExceptionEnvelope(
  envelope: EventEnvelope
): envelope is BackendExceptionEnvelope {
  return envelope.event_type === "backend_exception";
}

export function isRequestEventEnvelope(envelope: EventEnvelope): envelope is RequestEventEnvelope {
  return envelope.event_type === "request_event";
}

export function isLogEventEnvelope(envelope: EventEnvelope): envelope is LogEventEnvelope {
  return envelope.event_type === "log_event";
}

export function isDeployMetadataEnvelope(
  envelope: EventEnvelope
): envelope is DeployMetadataEnvelope {
  return envelope.event_type === "deploy_metadata";
}

export function selectPrimarySignalEnvelope(
  envelopes: EventEnvelope[],
  sourceEventId: string
): EventEnvelope | null {
  const sourceEnvelope = envelopes.find((envelope) => envelope.event_id === sourceEventId);
  if (sourceEnvelope !== undefined) {
    return sourceEnvelope;
  }

  return null;
}

export function deriveBundleSdk(
  envelopes: EventEnvelope[],
  sourceEventId: string
): BundleV1["sdk"] {
  const sourceEnvelope = envelopes.find((envelope) => envelope.event_id === sourceEventId);
  if (sourceEnvelope !== undefined) {
    return {
      name: sourceEnvelope.sdk_name,
      version: sourceEnvelope.sdk_version
    };
  }

  return {
    name: "unknown",
    version: "unknown"
  };
}
