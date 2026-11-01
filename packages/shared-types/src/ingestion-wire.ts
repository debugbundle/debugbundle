import {
  EVENT_INGESTION_MAX_BODY_BYTES,
  EVENT_ENVELOPE_MAX_WIRE_BYTES,
  type EventEnvelope
} from "./event-envelope.js";
import { EvidenceReferenceSchema } from "./diagnostic-context.js";
import { utf8ByteLength, withinUtf8Budget } from "./evidence-bounds.js";
import { withoutOptionalExceptionEvidence } from "./evidence-emission.js";

/** Only owned, canonical, privacy-protected JSON may enter this wire boundary.
 * Optional evidence must not strand an otherwise admissible primary failure. */
export function fitEventToIngestionWire(event: EventEnvelope): EventEnvelope | null {
  const fits = (candidate: EventEnvelope): boolean =>
    withinUtf8Budget(JSON.stringify(candidate), EVENT_ENVELOPE_MAX_WIRE_BYTES);
  try {
    if (fits(event)) return event;
    const marked = withoutOptionalExceptionEvidence(event, true);
    if (marked !== null && fits(marked)) return marked;
    let reduced = withoutOptionalExceptionEvidence(event, false) ?? event;
    if (reduced !== event && fits(reduced)) return reduced;
    if (EvidenceReferenceSchema.safeParse(reduced.context?.["evidence_reference"]).success) {
      const context = { ...reduced.context };
      delete context["evidence_reference"];
      reduced = { ...reduced, context };
      if (fits(reduced)) return reduced;
    }
    return null;
  } catch {
    return null;
  }
}

/** Preflight owned canonical events before any network send. Count the exact
 * JSON request wrapper and commas in linear work; never silently drop an unfit
 * primary. Optional reductions retain the latest accepted content. */
export function partitionEventsForIngestion(
  events: readonly EventEnvelope[]
): EventEnvelope[][] | null {
  const batches: EventEnvelope[][] = [];
  let batch: EventEnvelope[] = [],
    size = 13;
  for (const original of events) {
    const event = fitEventToIngestionWire(original);
    if (event === null) return null;
    const bytes = utf8ByteLength(JSON.stringify(event), EVENT_ENVELOPE_MAX_WIRE_BYTES);
    if (bytes === null) return null;
    if (size + bytes + (batch.length > 0 ? 1 : 0) > EVENT_INGESTION_MAX_BODY_BYTES) {
      batches.push(batch);
      batch = [];
      size = 13;
    }
    size += bytes + (batch.length > 0 ? 1 : 0);
    batch.push(event);
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}
