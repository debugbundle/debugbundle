import { z } from "zod";
import {
  AnalyticsRetentionDefinitionSchema,
  AnalyticsScopeSchema,
  AnalyticsSubjectSchema
} from "../../shared-types/src/index.js";
import { SemanticAnalyticsKeySchema } from "../../shared-types/src/analytics-semantic-primitives.js";

const Revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const Timestamp = z.string().datetime({ precision: 3 });
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const MAX_RETENTION_FACTS = 10000;

/** Privately compiled, protected evidence; loaders establish current all-source authority. */
export const RetentionFactSchema = z
  .object({
    scope: AnalyticsScopeSchema,
    scope_revision: Revision,
    definition_key: SemanticAnalyticsKeySchema,
    definition_revision: Revision,
    subject: AnalyticsSubjectSchema,
    origin_project_id: Uuid,
    event_id: Uuid,
    content_hash: Hash,
    subject_key: Hash,
    occurred_at: Timestamp,
    received_at: Timestamp,
    entry: z.boolean(),
    returned: z.boolean()
  })
  .strict();
export type RetentionFact = z.infer<typeof RetentionFactSchema>;

export const RetentionQuerySchema = z
  .object({
    definition: AnalyticsRetentionDefinitionSchema,
    scope_revision: Revision,
    from: Timestamp,
    to: Timestamp,
    observation_cutoff: Timestamp,
    watermark: Timestamp,
    available_from: Timestamp,
    definition_effective_from: Timestamp,
    incomplete: z.boolean(),
    sample_rate: z.number().finite().gt(0).max(1),
    calendar_version: z.string().min(1).max(64)
  })
  .strict()
  .refine(
    (q) =>
      q.from < q.to &&
      Date.parse(q.to) - Date.parse(q.from) <= 90 * 86400000 &&
      q.to <= q.observation_cutoff &&
      q.observation_cutoff <= q.watermark
  );
export type RetentionQuery = z.infer<typeof RetentionQuerySchema>;

export interface RetentionCell {
  offset: number;
  eligible: number;
  retained: number;
  pending: number;
  unknown: number;
  rate: { numerator: number; denominator: number } | null;
}
export type RetentionQualityReason =
  | "sampled"
  | "incomplete_evidence"
  | "immature_periods"
  | "correction_window";
export type RetentionResult =
  | {
      status: "unavailable";
      reason:
        | "invalid_input"
        | "capacity_exceeded"
        | "insufficient_history"
        | "calendar_version_unavailable"
        | "stale_evidence"
        | "conflicting_evidence";
    }
  | {
      status: "available";
      calculation_version: "calendar-retention-1";
      quality: "exact" | "provisional" | "partial";
      quality_reasons: RetentionQualityReason[];
      scope: RetentionQuery["definition"]["scope"];
      scope_revision: number;
      definition_key: string;
      definition_revision: number;
      subject: RetentionQuery["definition"]["subject"];
      from: string;
      to: string;
      observation_cutoff: string;
      watermark: string;
      calendar_version: string;
      timezone: string;
      period: RetentionQuery["definition"]["period"];
      mode: RetentionQuery["definition"]["mode"];
      horizon: number;
      entry_basis: "first_observed_since_tracking_start";
      tracking_start: string;
      sample_rate: number;
      population: number;
      cohorts: { period_start: string; entered: number; cells: RetentionCell[] }[];
      summary: RetentionCell[];
    };
