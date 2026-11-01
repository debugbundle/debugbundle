import {
  EvidenceCapabilitiesSchema,
  EvidenceCapabilityValues,
  type EvidenceCapabilities
} from "./evidence-capabilities.js";
import { EvidenceReferenceSchema } from "./diagnostic-context.js";
import type { EventEnvelope } from "./event-envelope.js";

function descriptor(value: unknown): EvidenceCapabilities {
  const parsed = EvidenceCapabilitiesSchema.safeParse(value);
  return {
    version: 1,
    features: parsed.success
      ? EvidenceCapabilityValues.filter((feature) => parsed.data.features.includes(feature))
      : []
  };
}

/** Owned by one SDK instance/destination. A pin asserts a verified complete path;
 * subsequent discovery can revoke it. It never grants capture-policy permission. */
export class EvidenceDeliveryState {
  private proof: EvidenceCapabilities;
  constructor(pin?: unknown) {
    this.proof = descriptor(pin);
  }
  get descriptor(): EvidenceCapabilities {
    return { version: 1, features: [...this.proof.features] };
  }
  supports(feature: EvidenceCapabilities["features"][number]): boolean {
    return this.proof.features.includes(feature);
  }
  observe(value: unknown): boolean {
    const next = descriptor(value),
      downgraded = this.proof.features.some((feature) => !next.features.includes(feature));
    this.proof = next;
    return downgraded;
  }
}

function omitPayloadFields(event: EventEnvelope, fields: readonly string[]): EventEnvelope {
  const payload: Record<string, unknown> = { ...event.payload };
  for (const field of fields) delete payload[field];
  return { ...event, payload } as EventEnvelope;
}

/** Normalised JSON only. Keep admissible original errors when optional evidence
 * no longer fits privacy/wire budgets. Standalone context has no legacy form. */
export function withoutOptionalExceptionEvidence(
  event: EventEnvelope,
  mark = false
): EventEnvelope | null {
  if (event.event_type !== "backend_exception" && event.event_type !== "frontend_exception")
    return null;
  const fields = ["exception_evidence", "resource_observations", "execution"].filter((field) =>
    Object.prototype.hasOwnProperty.call(event.payload, field)
  );
  if (fields.length === 0) return null;
  const reduced = omitPayloadFields(event, fields);
  return mark
    ? {
        ...reduced,
        context: {
          ...event.context,
          evidence_limits: {
            version: 1,
            ...Object.fromEntries(fields.map((field) => [field, "budget_exceeded"]))
          }
        }
      }
    : reduced;
}

/** Apply at final delivery too: discovery may change while an event is queued.
 * Callers still apply their ordinary privacy, sampling, policy and quota gates. */
export function stripUnsupportedEvidence(
  event: EventEnvelope,
  capabilityProof: unknown
): EventEnvelope | null {
  const features = descriptor(capabilityProof).features;
  if (event.event_type === "diagnostic_context")
    return features.includes(
      event.payload.kind === "recovery" ? "recovery_v1" : "resource_observations_v1"
    )
      ? event
      : null;
  const fields: string[] = [];
  if (!features.includes("exception_evidence_v1")) fields.push("exception_evidence", "execution");
  if (!features.includes("resource_observations_v1")) fields.push("resource_observations");
  const changed = fields.some((field) =>
    Object.prototype.hasOwnProperty.call(event.payload, field)
  );
  let result = changed ? omitPayloadFields(event, fields) : event;
  if (
    !features.includes("recovery_v1") &&
    !features.includes("resource_observations_v1") &&
    EvidenceReferenceSchema.safeParse(event.context?.["evidence_reference"]).success
  ) {
    const context = { ...event.context };
    delete context["evidence_reference"];
    result = { ...result, context };
  }
  return result;
}
