import { validateEventAtAdmission } from "../../../packages/event-normalizer/src/index.js";
import { sanitizeEvent } from "../../../packages/event-normalizer/src/event-privacy.js";
import type { RetainedDiagnosticContext } from "../../../packages/bundle-engine/src/diagnostic-evidence.js";
import type { EventEnvelope } from "../../../packages/shared-types/src/index.js";
import { isRecord } from "./cli-fs-helpers.js";

export interface LocalDiagnosticState {
  diagnostic_contexts?: RetainedDiagnosticContext[];
  diagnostic_receipts?: Record<string, string>;
}
export function parseDiagnosticReceipts(value: unknown): Record<string, string> {
  if (!isRecord(value)) throw new Error("Invalid local evidence receipt ledger.");
  const receipts: Record<string, string> = {};
  for (const [id, at] of Object.entries(value)) {
    if (!/^[0-9a-f-]{36}$/i.test(id) || typeof at !== "string" || !Number.isFinite(Date.parse(at)))
      throw new Error("Invalid local evidence receipt ledger.");
    receipts[id] = at;
  }
  return receipts;
}
export function parseLocalDiagnosticState(
  candidate: Record<string, unknown>
): LocalDiagnosticState | null {
  if (
    candidate["diagnostic_contexts"] === undefined &&
    candidate["diagnostic_receipts"] === undefined
  )
    return {};
  const receipts = candidate["diagnostic_receipts"],
    contexts = candidate["diagnostic_contexts"];
  if (!isRecord(receipts) || !Array.isArray(contexts)) return null;
  const parsedReceipts: Record<string, string> = {};
  for (const [id, at] of Object.entries(receipts)) {
    if (!/^[0-9a-f-]{36}$/i.test(id) || typeof at !== "string" || !Number.isFinite(Date.parse(at)))
      return null;
    parsedReceipts[id] = at;
  }
  const parsed: RetainedDiagnosticContext[] = [];
  for (const context of contexts) {
    if (!isRecord(context) || typeof context["received_at"] !== "string") return null;
    const event = validateEventAtAdmission(context["event"], context["received_at"]);
    if (
      !event.success ||
      event.data.event_type !== "diagnostic_context" ||
      parsedReceipts[event.data.event_id] !== context["received_at"]
    )
      return null;
    parsed.push({ event: event.data, received_at: context["received_at"] });
  }
  return { diagnostic_contexts: parsed, diagnostic_receipts: parsedReceipts };
}

/** Admission time is persisted independently of event time. Reprocessing files
 * cannot make a previously future-dated observation eligible. */
export function collectLocalDiagnosticContext(
  previous: LocalDiagnosticState | null,
  events: readonly EventEnvelope[],
  receivedAt: string
): LocalDiagnosticState {
  const receipts = { ...previous?.diagnostic_receipts };
  const contexts = new Map(
    (previous?.diagnostic_contexts ?? []).map((context) => [context.event.event_id, context])
  );
  for (const event of events) {
    if (event.event_type !== "diagnostic_context") continue;
    if (typeof event.project_id !== "string")
      throw new Error(`Local event ${event.event_id} is missing project_id.`);
    const receipt = receipts[event.event_id] ?? receivedAt;
    receipts[event.event_id] = receipt;
    const parsed = validateEventAtAdmission(event, receipt);
    if (!parsed.success || contexts.has(event.event_id)) continue;
    contexts.set(event.event_id, { event: sanitizeEvent(parsed.data), received_at: receipt });
  }
  const retained = [...contexts.values()]
    .filter(
      (context) =>
        Math.min(Date.parse(context.event.occurred_at), Date.parse(context.received_at)) +
          7 * 86_400_000 >
        Date.parse(receivedAt)
    )
    .sort(
      (left, right) =>
        Date.parse(left.event.occurred_at) - Date.parse(right.event.occurred_at) ||
        left.event.event_id.localeCompare(right.event.event_id)
    );
  return Object.keys(receipts).length === 0
    ? {}
    : {
        diagnostic_contexts: retained,
        diagnostic_receipts: Object.fromEntries(
          Object.entries(receipts).sort(([left], [right]) => left.localeCompare(right))
        )
      };
}
