import { z } from "zod";
import { AnalyticsSafeHashSchema } from "./analytics.js";
import {
  MAX_SEMANTIC_ANALYTICS_EVENT_BYTES,
  SemanticAnalyticsEventSchema
} from "./analytics-semantic.js";

export const ANALYTICS_PREPARED_EVENT_PROTOCOL = "2026-09-analytics-prepared-01";
export const ANALYTICS_PREPARED_EVENT_LIFETIME_MS = 7 * 86400000;
const Timestamp = z.string().datetime({ precision: 3 });

/** Persisted SDK-owned finalized bytes, not an acceptance receipt or authentication capability. */
export const AnalyticsPreparedEventSchema = z
  .object({
    protocol: z.literal(ANALYTICS_PREPARED_EVENT_PROTOCOL),
    project_id: z.string().uuid(),
    destination_binding: AnalyticsSafeHashSchema,
    prepared_at: Timestamp,
    expires_at: Timestamp,
    event_id: z.string().uuid(),
    operation_id: AnalyticsSafeHashSchema.nullable(),
    event_json: z.string().min(1).max(MAX_SEMANTIC_ANALYTICS_EVENT_BYTES),
    prepared_content_hash: AnalyticsSafeHashSchema
  })
  .strict()
  .superRefine((value, ctx) => {
    const reject = (): void =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid finalized analytics record." });
    const lifetime = Date.parse(value.expires_at) - Date.parse(value.prepared_at);
    if (lifetime <= 0 || lifetime > ANALYTICS_PREPARED_EVENT_LIFETIME_MS) reject();
    if (
      value.event_json.length > MAX_SEMANTIC_ANALYTICS_EVENT_BYTES ||
      new TextEncoder().encode(value.event_json).byteLength > MAX_SEMANTIC_ANALYTICS_EVENT_BYTES
    ) {
      reject();
      return;
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(value.event_json) as unknown;
    } catch {
      reject();
      return;
    }
    // The compact JSON round trip rejects duplicate keys, alternate numeric spellings and extraneous whitespace.
    // Object key order is retained, not resorted; these exact bytes are persisted once by preparation.
    if (JSON.stringify(decoded) !== value.event_json) {
      reject();
      return;
    }
    const event = SemanticAnalyticsEventSchema.safeParse(decoded);
    if (
      !event.success ||
      event.data.producer.kind !== "server" ||
      event.data.event_id !== value.event_id ||
      event.data.operation_id !== value.operation_id
    )
      reject();
  });
export type AnalyticsPreparedEvent = z.infer<typeof AnalyticsPreparedEventSchema>;

/** Preparation owns no application transaction and never reports remote durable acceptance. */
export const AnalyticsPreparationResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("prepared"), record: AnalyticsPreparedEventSchema }).strict(),
  z
    .object({
      status: z.literal("unavailable"),
      reason: z.enum([
        "disabled",
        "unsupported",
        "consent_required",
        "capacity_exceeded",
        "unsafe_input",
        "hook_dropped",
        "timeout"
      ])
    })
    .strict()
]);
export type AnalyticsPreparationResult = z.infer<typeof AnalyticsPreparationResultSchema>;
