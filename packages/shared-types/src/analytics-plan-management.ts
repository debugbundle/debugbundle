import { z } from "zod";
import {
  AnalyticsCatalogEntrySchema,
  AnalyticsMeasurementPlanSchema,
  AnalyticsReportDefinitionSchema
} from "./analytics-definitions.js";
import { SemanticAnalyticsKeySchema } from "./analytics-semantic-primitives.js";

const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const AnalyticsProjectPlanReportStateSchema = z
  .object({
    definition: AnalyticsReportDefinitionSchema,
    available_from: z.string().datetime()
  })
  .strict();
export const AnalyticsProjectPlanObservationSchema = z
  .object({
    event_name: SemanticAnalyticsKeySchema,
    event_revision: Revision.positive(),
    producer_kind: z.enum(["browser", "mobile", "server"]),
    observed_count: z.string().regex(/^[1-9]\d*$/),
    first_observed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    last_observed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  })
  .strict();
export const AnalyticsProjectPlanProducerObservationSchema =
  AnalyticsProjectPlanObservationSchema.extend({
    sdk_name: z.string().min(1).max(120),
    sdk_version: z.string().min(1).max(64)
  }).strict();
export const AnalyticsProjectPlanRecordSchema = z
  .object({
    project_id: Id,
    revision: Revision.positive(),
    catalog_revision: Revision,
    business_measurement_enabled: z.boolean(),
    catalog: z.array(AnalyticsCatalogEntrySchema).max(100),
    reports: z.array(AnalyticsProjectPlanReportStateSchema).max(100),
    /** Current entry-revision observations only; delivery does not verify business meaning. */
    observations: z.array(AnalyticsProjectPlanObservationSchema).max(300).optional(),
    producer_observations: z
      .array(AnalyticsProjectPlanProducerObservationSchema)
      .max(300)
      .optional(),
    producer_observations_truncated: z.boolean().optional()
  })
  .strict();
export const AnalyticsProjectPlanPreviewSchema = z
  .object({
    project_id: Id,
    preview_hash: Hash,
    expected_revision: Revision,
    resulting_revision: Revision.positive(),
    catalog_revision: Revision,
    business_measurement_enabled_after: z.boolean(),
    capacity_limit: z.number().int().min(0).max(100),
    legacy_saved_funnels: z.number().int().min(0).max(100),
    report_slots_after: z.number().int().min(0).max(100),
    added_reports: z.array(z.string().min(1).max(120)).max(100),
    removed_reports: z.array(z.string().min(1).max(120)).max(100),
    changed_reports: z.array(z.string().min(1).max(120)).max(100),
    already_applied: z.boolean()
  })
  .strict();
export const AnalyticsProjectPlanApplyRequestSchema = z
  .object({ plan: AnalyticsMeasurementPlanSchema, preview_hash: Hash })
  .strict();
export const AnalyticsProjectPlanApplyResponseSchema = z
  .object({ plan: AnalyticsProjectPlanRecordSchema, replayed: z.boolean() })
  .strict();
export const AnalyticsProjectPlanIssueSchema = z
  .object({
    code: z.enum([
      "invalid_schema",
      "unsafe_metadata",
      "unknown_event",
      "unknown_property",
      "invalid_property_value",
      "unavailable_producer",
      "unknown_breakdown",
      "impossible_predicate"
    ]),
    report_index: z.number().int().min(0).max(99).nullable()
  })
  .strict();
export const AnalyticsProjectPlanValidationResponseSchema = z.discriminatedUnion("valid", [
  z.object({ valid: z.literal(true) }).strict(),
  z
    .object({
      valid: z.literal(false),
      issues: z.array(AnalyticsProjectPlanIssueSchema).min(1).max(100)
    })
    .strict()
]);

export type AnalyticsProjectPlanRecord = z.infer<typeof AnalyticsProjectPlanRecordSchema>;
export type AnalyticsProjectPlanPreview = z.infer<typeof AnalyticsProjectPlanPreviewSchema>;
