import {
  MAX_SEMANTIC_ANALYTICS_EVENT_BYTES,
  SEMANTIC_ANALYTICS_SCHEMA_VERSION,
  SemanticAnalyticsEventSchema,
  type SemanticAnalyticsEvent
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";

export type ValidSemanticClientEvent = { index: number; event: SemanticAnalyticsEvent };

/** Exact-version dispatch leaves installed and unknown-version analytics on the V1 rejection path. */
export function isSemanticClientCandidate(candidate: unknown): boolean {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    (candidate as Record<string, unknown>)["event_type"] === "analytics_event" &&
    (candidate as Record<string, unknown>)["schema_version"] === SEMANTIC_ANALYTICS_SCHEMA_VERSION
  );
}

export function parseSemanticClientCandidate(input: {
  candidate: unknown;
  index: number;
}):
  | { event: ValidSemanticClientEvent; error?: never }
  | { event?: never; error: { index: number; reason: string } } {
  try {
    const serialized = JSON.stringify(input.candidate);
    if (typeof serialized !== "string")
      return { error: { index: input.index, reason: "analytics_invalid_event" } };
    if (Buffer.byteLength(serialized, "utf8") > MAX_SEMANTIC_ANALYTICS_EVENT_BYTES)
      return { error: { index: input.index, reason: "event_too_large" } };
    const parsed = SemanticAnalyticsEventSchema.safeParse(input.candidate);
    if (!parsed.success)
      return { error: { index: input.index, reason: "analytics_invalid_event" } };
    if (parsed.data.producer.kind === "server")
      return { error: { index: input.index, reason: "source_not_authorized" } };
    return { event: { index: input.index, event: parsed.data } };
  } catch {
    return { error: { index: input.index, reason: "analytics_invalid_event" } };
  }
}

/** A transient failure is unresolved; the caller must avoid a fabricated indexed rejection. */
export async function persistSemanticClientEvents(input: {
  delivery: NonNullable<ApiDependencies["semanticAnalyticsClientDelivery"]>;
  events: ValidSemanticClientEvent[];
  projectId: string;
  credentialHash: string;
  isRequestClosed: () => boolean;
}): Promise<
  | { kind: "complete"; accepted: number; errors: Array<{ index: number; reason: string }> }
  | { kind: "unavailable" }
> {
  const errors: Array<{ index: number; reason: string }> = [];
  let accepted = 0;
  for (const { index, event } of input.events) {
    if (input.isRequestClosed()) return { kind: "unavailable" };
    let result: Awaited<ReturnType<typeof input.delivery.persist>>;
    try {
      result = await input.delivery.persist({
        projectId: input.projectId,
        credentialHash: input.credentialHash,
        event
      });
    } catch {
      return { kind: "unavailable" };
    }
    if (result.kind === "accepted") {
      if (
        result.receipt.event_id.toLowerCase() !== event.event_id.toLowerCase() ||
        result.receipt.operation_id !== null
      )
        return { kind: "unavailable" };
      accepted += 1;
    } else if (result.kind === "rejected") {
      errors.push({ index, reason: result.reason });
    } else if (result.kind === "authority_changed" || result.kind === "object_not_staged") {
      return { kind: "unavailable" };
    } else {
      errors.push({
        index,
        reason: result.kind === "quota_exceeded" ? "analytics_quota_exceeded" : result.kind
      });
    }
  }
  return { kind: "complete", accepted, errors };
}
