import { z } from "zod";

import {
  ANALYTICS_BUNDLE_SCHEMA_VERSION,
  AnalyticsBundleAnalysisKindSchema,
  AnalyticsBundleConfidenceSchema,
  AnalyticsBundleGranularitySchema,
  AnalyticsBundleSeveritySchema,
  AnalyticsCustomDimensionKeySchema,
  AnalyticsPrivacyModeSchema,
  AnalyticsSafeHashSchema
} from "./analytics.js";

export const AnalyticsOpportunityStatusValues = ["open", "resolved", "snoozed"] as const;
export const AnalyticsOpportunityStatusSchema = z.enum(AnalyticsOpportunityStatusValues);
export type AnalyticsOpportunityStatus = z.infer<typeof AnalyticsOpportunityStatusSchema>;

export const AnalyticsOpportunityBundleStatusValues = [
  "not_requested",
  "pending",
  "running",
  "completed",
  "failed"
] as const;
export const AnalyticsOpportunityBundleStatusSchema = z.enum(
  AnalyticsOpportunityBundleStatusValues
);
export type AnalyticsOpportunityBundleStatus = z.infer<
  typeof AnalyticsOpportunityBundleStatusSchema
>;

export const AnalyticsBundleGenerationStatusValues = [
  "pending",
  "running",
  "completed",
  "failed"
] as const;
export const AnalyticsBundleGenerationStatusSchema = z.enum(AnalyticsBundleGenerationStatusValues);
export type AnalyticsBundleGenerationStatus = z.infer<typeof AnalyticsBundleGenerationStatusSchema>;

const AnalyticsOpportunityRecordSchema = z
  .object({
    opportunity_id: z.string().uuid(),
    project_id: z.string().uuid(),
    project_name: z.string().trim().min(1).max(200),
    project_color_tag: z.string().trim().min(1).max(32).nullable(),
    service: z.string().trim().min(1).max(120).nullable(),
    environment: z.string().trim().min(1).max(120).nullable(),
    kind: AnalyticsBundleAnalysisKindSchema,
    status: AnalyticsOpportunityStatusSchema,
    severity: AnalyticsBundleSeveritySchema,
    confidence: z.number().min(0).max(1),
    title: z.string().trim().min(1).max(240),
    summary: z.string().trim().min(1).max(2000),
    evidence: z.record(z.string(), z.unknown()),
    related_incident_ids: z.array(z.string().uuid()).max(100),
    related_deploy_ids: z.array(z.string().trim().min(1).max(128)).max(100),
    first_detected_at: z.string().datetime(),
    last_detected_at: z.string().datetime(),
    resolved_at: z.string().datetime().nullable(),
    snoozed_until: z.string().datetime().nullable(),
    bundle_generation_id: z.string().uuid().nullable(),
    bundle_status: AnalyticsOpportunityBundleStatusSchema,
    bundle_created_at: z.string().datetime().nullable(),
    bundle_updated_at: z.string().datetime().nullable(),
    bundle_failure_reason: z.string().trim().min(1).max(240).nullable()
  })
  .strict();

export type AnalyticsOpportunityRecord = z.infer<typeof AnalyticsOpportunityRecordSchema>;

export const AnalyticsOpportunitiesListResponseSchema = z
  .object({
    opportunities: z.array(AnalyticsOpportunityRecordSchema).max(100),
    next_cursor: z.string().trim().min(1).nullable()
  })
  .strict();

export type AnalyticsOpportunitiesListResponse = z.infer<
  typeof AnalyticsOpportunitiesListResponseSchema
>;

export const AnalyticsOpportunityResponseSchema = z
  .object({ opportunity: AnalyticsOpportunityRecordSchema })
  .strict();
export type AnalyticsOpportunityResponse = z.infer<typeof AnalyticsOpportunityResponseSchema>;

export const AnalyticsBundleGenerationRecordSchema = z
  .object({
    generation_id: z.string().uuid(),
    project_id: z.string().uuid(),
    project_name: z.string().trim().min(1).max(200).optional(),
    project_color_tag: z.string().trim().min(1).max(32).nullable().optional(),
    opportunity_id: z.string().uuid().nullable(),
    requested_by_user_id: z.string().uuid().nullable(),
    analysis_kind: AnalyticsBundleAnalysisKindSchema,
    analysis_spec: z.record(z.string(), z.unknown()),
    input_fingerprint: AnalyticsSafeHashSchema,
    status: AnalyticsBundleGenerationStatusSchema,
    has_artifact: z.boolean(),
    failure_reason: z.string().trim().min(1).max(240).nullable(),
    created_at: z.string().datetime(),
    claimed_at: z.string().datetime().nullable(),
    completed_at: z.string().datetime().nullable(),
    updated_at: z.string().datetime()
  })
  .strict();
export type AnalyticsBundleGenerationRecord = z.infer<typeof AnalyticsBundleGenerationRecordSchema>;

export const AnalyticsBundleGenerationsListResponseSchema = z
  .object({
    bundles: z.array(AnalyticsBundleGenerationRecordSchema).max(100),
    next_cursor: z.string().trim().min(1).nullable()
  })
  .strict();
export type AnalyticsBundleGenerationsListResponse = z.infer<
  typeof AnalyticsBundleGenerationsListResponseSchema
>;

const AnalyticsBundleProjectSchema = z
  .object({
    project_id: z.string().uuid(),
    service: z.string().trim().min(1).max(120).nullable(),
    environment: z.string().trim().min(1).max(120).nullable()
  })
  .strict();

const AnalyticsBundleAnalysisWindowSchema = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    granularity: AnalyticsBundleGranularitySchema
  })
  .strict()
  .refine((value) => Date.parse(value.from) <= Date.parse(value.to), {
    message: "AnalyticsBundle analysis_window.from must be before or equal to analysis_window.to.",
    path: ["from"]
  });

const AnalyticsBundleSummarySchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    description: z.string().trim().min(1).max(2000),
    confidence: AnalyticsBundleConfidenceSchema,
    severity: AnalyticsBundleSeveritySchema
  })
  .strict();

const AnalyticsBundleMetricsSchema = z
  .object({
    sessions_analyzed: z.number().int().nonnegative(),
    affected_sessions: z.number().int().nonnegative().nullable(),
    baseline: z.record(z.string(), z.unknown()),
    current: z.record(z.string(), z.unknown())
  })
  .strict();

const AnalyticsBundleRecordSchema = z.record(z.string(), z.unknown());
const AnalyticsBundleRedactionSchema = z
  .object({
    rules_applied: z.array(z.string().trim().min(1).max(120)).max(50),
    omitted_fields: z.array(z.string().trim().min(1).max(200)).max(100)
  })
  .strict();
const AnalyticsBundleMetadataSchema = z
  .object({ input_fingerprint: AnalyticsSafeHashSchema })
  .strict();

export const AnalyticsBundleV1Schema = z
  .object({
    schema_version: z.literal(ANALYTICS_BUNDLE_SCHEMA_VERSION),
    bundle_type: z.literal("analytics"),
    analysis_kind: AnalyticsBundleAnalysisKindSchema,
    project: AnalyticsBundleProjectSchema,
    analysis_window: AnalyticsBundleAnalysisWindowSchema,
    summary: AnalyticsBundleSummarySchema,
    metrics: AnalyticsBundleMetricsSchema,
    segments: z.array(AnalyticsBundleRecordSchema).max(100),
    journey_patterns: z.array(AnalyticsBundleRecordSchema).max(100),
    representative_journeys: z.array(AnalyticsBundleRecordSchema).max(25),
    linked_incidents: z.array(AnalyticsBundleRecordSchema).max(100),
    linked_deploys: z.array(AnalyticsBundleRecordSchema).max(50),
    recommendations: z.array(AnalyticsBundleRecordSchema).max(50),
    redaction: AnalyticsBundleRedactionSchema,
    metadata: AnalyticsBundleMetadataSchema
  })
  .strict();
export type AnalyticsBundleV1 = z.infer<typeof AnalyticsBundleV1Schema>;

export const AnalyticsSettingsSchema = z
  .object({
    enabled: z.boolean(),
    privacy_mode: AnalyticsPrivacyModeSchema,
    consent_required: z.boolean(),
    capture_page_views: z.boolean(),
    capture_route_changes: z.boolean(),
    capture_actions: z.boolean(),
    capture_friction_signals: z.boolean(),
    journey_sample_rate: z.number().min(0).max(1),
    raw_retention_days: z.number().int().min(1).max(30),
    sample_retention_days: z.number().int().min(1).max(365),
    hourly_retention_days: z.number().int().min(1).max(365),
    aggregate_retention_months: z.number().int().min(1).max(120),
    max_saved_funnels: z.number().int().min(0).max(100),
    max_custom_dimensions: z.number().int().min(0).max(20),
    approved_custom_dimensions: z.array(AnalyticsCustomDimensionKeySchema).max(20)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.approved_custom_dimensions.length > value.max_custom_dimensions) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["approved_custom_dimensions"],
        message: "Approved custom dimensions cannot exceed max_custom_dimensions."
      });
    }
  });
export type AnalyticsSettings = z.infer<typeof AnalyticsSettingsSchema>;

export const AnalyticsSdkConfigSchema = z
  .object({
    enabled: z.boolean(),
    privacy_mode: AnalyticsPrivacyModeSchema,
    consent_required: z.boolean(),
    capture_page_views: z.boolean(),
    capture_route_changes: z.boolean(),
    capture_actions: z.boolean(),
    capture_friction_signals: z.boolean()
  })
  .strict();
export type AnalyticsSdkConfig = z.infer<typeof AnalyticsSdkConfigSchema>;

export const AnalyticsSettingsResponseSchema = z
  .object({
    access_mode: z.enum(["manage", "preview"]),
    analytics_available: z.boolean(),
    settings: AnalyticsSettingsSchema
  })
  .strict();
export type AnalyticsSettingsResponse = z.infer<typeof AnalyticsSettingsResponseSchema>;

export const AnalyticsSettingsUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    privacy_mode: AnalyticsPrivacyModeSchema.optional(),
    consent_required: z.boolean().optional(),
    capture_page_views: z.boolean().optional(),
    capture_route_changes: z.boolean().optional(),
    capture_actions: z.boolean().optional(),
    capture_friction_signals: z.boolean().optional(),
    journey_sample_rate: z.number().min(0).max(1).optional(),
    raw_retention_days: z.number().int().min(1).max(30).optional(),
    sample_retention_days: z.number().int().min(1).max(365).optional(),
    hourly_retention_days: z.number().int().min(1).max(365).optional(),
    aggregate_retention_months: z.number().int().min(1).max(120).optional(),
    max_saved_funnels: z.number().int().min(0).max(100).optional(),
    max_custom_dimensions: z.number().int().min(0).max(20).optional(),
    approved_custom_dimensions: z.array(AnalyticsCustomDimensionKeySchema).max(20).optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.max_custom_dimensions !== undefined &&
      value.approved_custom_dimensions !== undefined &&
      value.approved_custom_dimensions.length > value.max_custom_dimensions
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["approved_custom_dimensions"],
        message: "Approved custom dimensions cannot exceed max_custom_dimensions."
      });
    }
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one analytics settings field must be provided."
  });
export type AnalyticsSettingsUpdate = z.infer<typeof AnalyticsSettingsUpdateSchema>;
