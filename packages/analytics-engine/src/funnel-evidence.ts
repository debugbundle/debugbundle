import { z } from "zod";
import { AnalyticsScopeSchema, AnalyticsSubjectSchema } from "../../shared-types/src/index.js";
import {
  SemanticAnalyticsKeySchema,
  SemanticAnalyticsValueSchema
} from "../../shared-types/src/analytics-semantic-primitives.js";

const Revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const Timestamp = z.string().datetime({ precision: 3 });
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
export const MAX_FUNNEL_FACTS = 10000;
export const MAX_FUNNEL_BREAKDOWNS = 32;
export const FUNNEL_CORRECTION_MS = 48 * 3600000;

const Snapshot = {
  subject: AnalyticsSubjectSchema,
  scope: AnalyticsScopeSchema,
  scope_revision: Revision,
  definition_key: SemanticAnalyticsKeySchema,
  definition_revision: Revision
};
const BreakdownSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("missing") }).strict(),
  z
    .object({
      kind: z.literal("value"),
      value: z.union([SemanticAnalyticsValueSchema, z.boolean(), z.null()])
    })
    .strict()
]);
export type FunnelBreakdown = z.infer<typeof BreakdownSchema> | { kind: "ambiguous" };

/** Protected, definition-compiled evidence from authorized storage. Never a client ingress schema. */
export const FunnelFactSchema = z
  .object({
    ...Snapshot,
    event_id: z.string().uuid(),
    origin_project_id: z.string().uuid(),
    content_hash: Hash,
    subject_key: Hash,
    occurred_at: Timestamp,
    received_at: Timestamp,
    producer_kind: z.enum(["server", "browser", "mobile"]),
    stream_id: z.string().uuid().nullable(),
    sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
    matches: z.array(z.boolean()).min(2).max(10),
    breakdown: BreakdownSchema
  })
  .strict()
  .refine((value) => (value.stream_id === null) === (value.sequence === null));
export type FunnelFact = z.infer<typeof FunnelFactSchema>;

export const FunnelQuerySchema = z
  .object({
    ...Snapshot,
    step_keys: z
      .array(SemanticAnalyticsKeySchema)
      .min(2)
      .max(10)
      .refine((values) => new Set(values).size === values.length),
    conversion_window_seconds: z
      .number()
      .int()
      .min(1)
      .max(30 * 86400),
    from: Timestamp,
    to: Timestamp,
    observation_cutoff: Timestamp,
    watermark: Timestamp,
    available_from: Timestamp,
    definition_effective_from: Timestamp,
    sample_rate: z.number().finite().gt(0).max(1),
    incomplete: z.boolean()
  })
  .strict()
  .refine((value) => {
    const from = Date.parse(value.from),
      to = Date.parse(value.to);
    return (
      !(value.scope.kind === "space" && value.subject === "session") &&
      from < to &&
      to - from <= 90 * 86400000 &&
      to <= Date.parse(value.observation_cutoff) &&
      Date.parse(value.observation_cutoff) <= Date.parse(value.watermark)
    );
  });
export type FunnelQuery = z.infer<typeof FunnelQuerySchema>;

export type FunnelUnavailableReason =
  | "invalid_input"
  | "insufficient_history"
  | "capacity_exceeded"
  | "conflicting_evidence"
  | "stale_evidence";
export type FunnelQualityReason =
  | "incomplete_evidence"
  | "sampled"
  | "ambiguous_order"
  | "ambiguous_entry_breakdown"
  | "open_entries"
  | "correction_window";
export type FunnelRatio = { numerator: number; denominator: number } | null;
export interface FunnelPopulation {
  entered: number;
  completed: number;
  open: number;
  expired: number;
  unknown: number;
  mature: number;
}
export type FunnelResult =
  | { status: "unavailable"; reason: FunnelUnavailableReason }
  | {
      status: "available";
      calculation_version: "ordered-funnel-1";
      quality: "exact" | "provisional" | "partial";
      quality_reasons: FunnelQualityReason[];
      scope: FunnelQuery["scope"];
      subject: FunnelQuery["subject"];
      scope_revision: number;
      definition_key: string;
      definition_revision: number;
      from: string;
      to: string;
      observation_cutoff: string;
      watermark: string;
      available_from: string;
      sample_rate: number;
      population: FunnelPopulation;
      steps: { key: string; reached: number; overall: FunnelRatio; previous: FunnelRatio }[];
      breakdowns: { breakdown: FunnelBreakdown; entered: number; completed: number }[];
      time_to_convert: null | {
        basis: "first_confirmed_path";
        count: number;
        sum_ms: string;
        min_ms: number;
        max_ms: number;
        p50_ms: number;
        p95_ms: number;
      };
    };
