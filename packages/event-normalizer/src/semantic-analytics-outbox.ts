import { createHash } from "node:crypto";
import { z } from "zod";
import {
  AnalyticsPreparedEventSchema,
  AnalyticsDeliveryReceiptSchema,
  AnalyticsSafeHashSchema,
  type AnalyticsPreparedEvent,
  type AnalyticsDeliveryReceipt,
  type SemanticAnalyticsEvent
} from "../../shared-types/src/index.js";

const ContextSchema = z
  .object({
    project_id: z.string().uuid(),
    destination_binding: AnalyticsSafeHashSchema,
    now: z.string().datetime({ precision: 3 })
  })
  .strict();
const MAX_BATCH_EVENTS = 256;
const MAX_BATCH_BYTES = 256 * 1024;
type PreparedBatchFailure =
  | "invalid_record"
  | "capacity_exceeded"
  | "destination_mismatch"
  | "integrity_mismatch"
  | "expired"
  | "future_preparation";
export type PreparedAnalyticsBatchResult =
  | { valid: false; reason: PreparedBatchFailure }
  | { valid: true; events: SemanticAnalyticsEvent[] };

/** Reference validator for decoded bounded outbox JSON, not raw application objects or a sender. */
export function validatePreparedAnalyticsBatch(
  input: unknown,
  contextInput: unknown
): PreparedAnalyticsBatchResult {
  const context = ContextSchema.safeParse(contextInput);
  if (!context.success || !Array.isArray(input) || input.length === 0)
    return { valid: false, reason: "invalid_record" };
  if (input.length > MAX_BATCH_EVENTS) return { valid: false, reason: "capacity_exceeded" };
  const events: SemanticAnalyticsEvent[] = [];
  let bytes = Buffer.byteLength('{"events":[]}') + input.length - 1;
  for (const value of input) {
    const parsed = AnalyticsPreparedEventSchema.safeParse(value);
    if (!parsed.success) return { valid: false, reason: "invalid_record" };
    const record = parsed.data;
    bytes += Buffer.byteLength(record.event_json);
    if (bytes > MAX_BATCH_BYTES) return { valid: false, reason: "capacity_exceeded" };
    if (
      record.project_id.toLowerCase() !== context.data.project_id.toLowerCase() ||
      record.destination_binding.toLowerCase() !== context.data.destination_binding.toLowerCase()
    ) {
      return { valid: false, reason: "destination_mismatch" };
    }
    if (
      `sha256:${createHash("sha256").update(record.event_json, "utf8").digest("hex")}` !==
      record.prepared_content_hash.toLowerCase()
    ) {
      return { valid: false, reason: "integrity_mismatch" };
    }
    if (Date.parse(record.expires_at) <= Date.parse(context.data.now))
      return { valid: false, reason: "expired" };
    if (Date.parse(record.prepared_at) > Date.parse(context.data.now) + 300000)
      return { valid: false, reason: "future_preparation" };
    // The closed schema has already validated this exact immutable string. Do not rebuild SDK fields.
    events.push(JSON.parse(record.event_json) as SemanticAnalyticsEvent);
  }
  return { valid: true, events };
}

export type AnalyticsReceiptMatch =
  | { matched: false; reason: "protocol_failure" }
  | { matched: true; receipt: AnalyticsDeliveryReceipt };

/** Correspondence only: current credentials/policy and durable server ownership remain separate. */
export function matchAnalyticsDeliveryReceipt(
  receiptInput: unknown,
  recordsInput: unknown,
  projectId: string
): AnalyticsReceiptMatch {
  const fail: AnalyticsReceiptMatch = { matched: false, reason: "protocol_failure" };
  if (
    !Array.isArray(recordsInput) ||
    recordsInput.length === 0 ||
    recordsInput.length > MAX_BATCH_EVENTS
  )
    return fail;
  const records = z.array(AnalyticsPreparedEventSchema).safeParse(recordsInput);
  const receipt = AnalyticsDeliveryReceiptSchema.safeParse(receiptInput);
  if (
    !records.success ||
    !receipt.success ||
    receipt.data.project_id.toLowerCase() !== projectId.toLowerCase() ||
    receipt.data.submitted !== records.data.length ||
    records.data.some((record) => record.project_id.toLowerCase() !== projectId.toLowerCase())
  )
    return fail;
  for (const accepted of receipt.data.accepted_events) {
    const expected: AnalyticsPreparedEvent = records.data[accepted.index]!;
    if (
      accepted.event_id.toLowerCase() !== expected.event_id.toLowerCase() ||
      (accepted.operation_id?.toLowerCase() ?? null) !==
        (expected.operation_id?.toLowerCase() ?? null)
    )
      return fail;
  }
  return { matched: true, receipt: receipt.data };
}
