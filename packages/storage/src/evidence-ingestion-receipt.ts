import { createHash } from "node:crypto";
import { EvidenceReferenceSchema, type EventEnvelope } from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";

export interface EvidenceReceiptResult {
  received_at: string;
  matches: boolean;
}
export interface EvidenceIngestionReceiptStore {
  claim(
    projectId: string,
    event: EventEnvelope,
    receivedAt: string
  ): Promise<EvidenceReceiptResult>;
}

export function requiresEvidenceReceipt(event: EventEnvelope): boolean {
  return (
    event.event_type === "diagnostic_context" ||
    EvidenceReferenceSchema.safeParse(event.context?.["evidence_reference"]).success
  );
}

// Events have already crossed the bounded, mandatory sanitization boundary. Object
// key order is not identity; array order and every protected field remain significant.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function hashEvidencePayload(event: EventEnvelope): string {
  return createHash("sha256").update(canonical(event)).digest("hex");
}

/** A claim precedes admission and object writes, including rejected future context.
 * Conflicting event identities never overwrite an earlier protected raw payload. */
export function createEvidenceIngestionReceiptStore(db: Queryable): EvidenceIngestionReceiptStore {
  return {
    async claim(projectId, event, receivedAt) {
      const hash = hashEvidencePayload(event);
      const result = await db.query<{ received_at: string; payload_hash: string }>(
        `INSERT INTO evidence_ingestion_receipts AS receipt
          (project_id,event_id,occurred_at,received_at,payload_hash,is_diagnostic,expires_at)
         VALUES ($1,$2,$3::timestamptz,$4::timestamptz,$5,$6,LEAST($3::timestamptz,$4::timestamptz) + interval '7 days')
         ON CONFLICT (project_id,event_id) DO UPDATE SET payload_hash=receipt.payload_hash
         RETURNING received_at::text,payload_hash`,
        [
          projectId,
          event.event_id,
          event.occurred_at,
          receivedAt,
          hash,
          event.event_type === "diagnostic_context"
        ]
      );
      const row = result.rows[0];
      if (!row) throw new Error("evidence_receipt_missing");
      return {
        received_at: new Date(row.received_at).toISOString(),
        matches: row.payload_hash === hash
      };
    }
  };
}
