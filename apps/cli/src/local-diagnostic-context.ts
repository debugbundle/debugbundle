import { validateEventAtAdmission } from "../../../packages/event-normalizer/src/index.js";
import { sanitizeEvent } from "../../../packages/event-normalizer/src/event-privacy.js";
import { hashEvidencePayload } from "../../../packages/storage/src/evidence-ingestion-receipt.js";
import type { RetainedDiagnosticContext } from "../../../packages/bundle-engine/src/diagnostic-evidence.js";
import type { EventEnvelope } from "../../../packages/shared-types/src/index.js";
import { isRecord } from "./cli-fs-helpers.js";

export interface LocalDiagnosticState {
  diagnostic_contexts?: RetainedDiagnosticContext[];
  diagnostic_receipts?: Record<string, string>;
  diagnostic_payload_hashes?: Record<string, string>;
}
export function parseDiagnosticReceipts(
  value: unknown
): Required<Pick<LocalDiagnosticState, "diagnostic_receipts" | "diagnostic_payload_hashes">> {
  if (!isRecord(value) || Array.isArray(value))
    throw new Error("Invalid local evidence receipt ledger.");
  const receipts: Record<string, string> = {};
  const hashes: Record<string, string> = {};
  for (const [id, entry] of Object.entries(value)) {
    // Timestamp-only ledgers predate payload identity. Preserve their first
    // receipt and bind the first protected payload available during upgrade.
    const at = isRecord(entry) ? entry["received_at"] : entry;
    if (!/^[0-9a-f-]{36}$/i.test(id) || typeof at !== "string" || !Number.isFinite(Date.parse(at)))
      throw new Error("Invalid local evidence receipt ledger.");
    if (isRecord(entry)) {
      const hash = entry["payload_hash"];
      if (
        Object.keys(entry).some((key) => key !== "received_at" && key !== "payload_hash") ||
        (hash !== undefined && (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)))
      )
        throw new Error("Invalid local evidence receipt ledger.");
      if (typeof hash === "string") hashes[id] = hash;
    }
    receipts[id] = at;
  }
  return { diagnostic_receipts: receipts, diagnostic_payload_hashes: hashes };
}

export function serializeDiagnosticReceipts(state: LocalDiagnosticState): string {
  return `${JSON.stringify(
    Object.fromEntries(
      Object.entries(state.diagnostic_receipts ?? {}).map(([id, received_at]) => [
        id,
        { received_at, payload_hash: state.diagnostic_payload_hashes?.[id] }
      ])
    )
  )}\n`;
}
export function parseLocalDiagnosticState(
  candidate: Record<string, unknown>
): LocalDiagnosticState | null {
  if (
    candidate["diagnostic_contexts"] === undefined &&
    candidate["diagnostic_receipts"] === undefined &&
    candidate["diagnostic_payload_hashes"] === undefined
  )
    return {};
  const receipts = candidate["diagnostic_receipts"],
    contexts = candidate["diagnostic_contexts"];
  if (!isRecord(receipts) || Array.isArray(receipts) || !Array.isArray(contexts)) return null;
  const parsedReceipts: Record<string, string> = {};
  for (const [id, at] of Object.entries(receipts)) {
    if (!/^[0-9a-f-]{36}$/i.test(id) || typeof at !== "string" || !Number.isFinite(Date.parse(at)))
      return null;
    parsedReceipts[id] = at;
  }
  const rawHashes = candidate["diagnostic_payload_hashes"] ?? {};
  if (!isRecord(rawHashes) || Array.isArray(rawHashes)) return null;
  const hashes: Record<string, string> = {};
  for (const [id, hash] of Object.entries(rawHashes)) {
    if (
      parsedReceipts[id] === undefined ||
      typeof hash !== "string" ||
      !/^[0-9a-f]{64}$/.test(hash)
    )
      return null;
    hashes[id] = hash;
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
  return {
    diagnostic_contexts: parsed,
    diagnostic_receipts: parsedReceipts,
    diagnostic_payload_hashes: hashes
  };
}

/** Admission time and protected payload identity survive a state rebuild.
 * Reprocessing or editing files cannot revive rejected or changed evidence. */
export function collectLocalDiagnosticContext(
  previous: LocalDiagnosticState | null,
  events: readonly EventEnvelope[],
  receivedAt: string
): LocalDiagnosticState {
  const receipts = { ...previous?.diagnostic_receipts };
  const hashes = { ...previous?.diagnostic_payload_hashes };
  const contexts = new Map(
    (previous?.diagnostic_contexts ?? []).flatMap((context) => {
      const event = sanitizeEvent(context.event);
      const hash = hashEvidencePayload(event);
      if (hashes[context.event.event_id] !== undefined && hashes[context.event.event_id] !== hash)
        return [];
      hashes[context.event.event_id] = hash;
      return [[event.event_id, { ...context, event }] as const];
    })
  );
  for (const event of events) {
    if (event.event_type !== "diagnostic_context") continue;
    if (typeof event.project_id !== "string")
      throw new Error(`Local event ${event.event_id} is missing project_id.`);
    const receipt = receipts[event.event_id] ?? receivedAt;
    receipts[event.event_id] = receipt;
    const protectedEvent = sanitizeEvent(event);
    const hash = hashEvidencePayload(protectedEvent);
    if (hashes[event.event_id] !== undefined && hashes[event.event_id] !== hash) continue;
    hashes[event.event_id] = hash;
    const parsed = validateEventAtAdmission(event, receipt);
    if (!parsed.success || contexts.has(event.event_id)) continue;
    contexts.set(event.event_id, { event: protectedEvent, received_at: receipt });
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
        diagnostic_payload_hashes: Object.fromEntries(
          Object.entries(hashes).sort(([left], [right]) => left.localeCompare(right))
        ),
        diagnostic_receipts: Object.fromEntries(
          Object.entries(receipts).sort(([left], [right]) => left.localeCompare(right))
        )
      };
}
