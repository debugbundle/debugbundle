import { z } from "zod";

export const ANALYTICS_EVENT_SCHEMA_VERSION = "2026-07-analytics-01";
export const ANALYTICS_BUNDLE_SCHEMA_VERSION = "analytics_bundle.v1";
export const MAX_ANALYTICS_CUSTOM_DIMENSIONS_PER_EVENT = 8;

export const AnalyticsEventKindValues = [
  "session_start",
  "page_view",
  "route_change",
  "action",
  "funnel_step",
  "conversion",
  "journey_marker",
  "session_summary",
] as const;

export const AnalyticsEventKindSchema = z.enum(AnalyticsEventKindValues);
export type AnalyticsEventKind = z.infer<typeof AnalyticsEventKindSchema>;

export const AnalyticsPrivacyModeValues = ["strict", "standard", "custom"] as const;
export const AnalyticsPrivacyModeSchema = z.enum(AnalyticsPrivacyModeValues);
export type AnalyticsPrivacyMode = z.infer<typeof AnalyticsPrivacyModeSchema>;

export const AnalyticsAuthStateValues = ["anonymous", "authenticated", "unknown"] as const;
export const AnalyticsAuthStateSchema = z.enum(AnalyticsAuthStateValues);
export type AnalyticsAuthState = z.infer<typeof AnalyticsAuthStateSchema>;

export const AnalyticsDeviceTypeValues = ["desktop", "mobile", "tablet", "unknown"] as const;
export const AnalyticsDeviceTypeSchema = z.enum(AnalyticsDeviceTypeValues);
export type AnalyticsDeviceType = z.infer<typeof AnalyticsDeviceTypeSchema>;

export const AnalyticsViewportBucketValues = ["small", "medium", "large", "unknown"] as const;
export const AnalyticsViewportBucketSchema = z.enum(AnalyticsViewportBucketValues);
export type AnalyticsViewportBucket = z.infer<typeof AnalyticsViewportBucketSchema>;

export const AnalyticsBundleAnalysisKindValues = [
  "usage_summary",
  "route_health",
  "funnel_dropoff",
  "journey_friction",
  "feature_usage",
  "incident_impact",
  "deploy_comparison",
  "conversion_path",
] as const;

export const AnalyticsBundleAnalysisKindSchema = z.enum(AnalyticsBundleAnalysisKindValues);
export type AnalyticsBundleAnalysisKind = z.infer<typeof AnalyticsBundleAnalysisKindSchema>;

export const AnalyticsBundleConfidenceValues = ["low", "medium", "high"] as const;
export const AnalyticsBundleConfidenceSchema = z.enum(AnalyticsBundleConfidenceValues);
export type AnalyticsBundleConfidence = z.infer<typeof AnalyticsBundleConfidenceSchema>;

export const AnalyticsBundleSeverityValues = ["low", "medium", "high"] as const;
export const AnalyticsBundleSeveritySchema = z.enum(AnalyticsBundleSeverityValues);
export type AnalyticsBundleSeverity = z.infer<typeof AnalyticsBundleSeveritySchema>;

export const AnalyticsBundleGranularityValues = ["hour", "day", "week", "month"] as const;
export const AnalyticsBundleGranularitySchema = z.enum(AnalyticsBundleGranularityValues);
export type AnalyticsBundleGranularity = z.infer<typeof AnalyticsBundleGranularitySchema>;

export const AnalyticsMetricsGranularityValues = ["hour", "day"] as const;
export const AnalyticsMetricsGranularitySchema = z.enum(AnalyticsMetricsGranularityValues);
export type AnalyticsMetricsGranularity = z.infer<typeof AnalyticsMetricsGranularitySchema>;

const AnalyticsSafeHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/i);
const AnalyticsNullableHashSchema = AnalyticsSafeHashSchema.nullable();
const AnalyticsNullableTextSchema = (max: number): z.ZodNullable<z.ZodString> => z.string().trim().min(1).max(max).nullable();

const AnalyticsRoutePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => !value.includes("?") && !value.includes("#"), {
    message: "Analytics route paths must not include query strings or fragments.",
  })
  .nullable();

const AnalyticsDomainSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => !/[/?#@]/.test(value), {
    message: "Analytics referrer domains must be hostnames, not URLs.",
  })
  .nullable();

const AnalyticsLocaleSchema = z
  .string()
  .trim()
  .min(2)
  .max(35)
  .regex(/^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/)
  .nullable();

const AnalyticsRegionCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .regex(/^[A-Za-z0-9-]+$/)
  .nullable();

const AnalyticsSignalKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/);

export const AnalyticsSignalSchema = z
  .object({
    action_key: AnalyticsSignalKeySchema.nullable().optional(),
    funnel_key: AnalyticsSignalKeySchema.nullable().optional(),
    step_key: AnalyticsSignalKeySchema.nullable().optional(),
    conversion_key: AnalyticsSignalKeySchema.nullable().optional(),
    marker_key: AnalyticsSignalKeySchema.nullable().optional(),
  })
  .strict()
  .transform((value) => ({
    action_key: value.action_key ?? null,
    funnel_key: value.funnel_key ?? null,
    step_key: value.step_key ?? null,
    conversion_key: value.conversion_key ?? null,
    marker_key: value.marker_key ?? null,
  }));
export type AnalyticsSignal = z.infer<typeof AnalyticsSignalSchema>;

export const AnalyticsRouteSchema = z
  .object({
    path: AnalyticsRoutePathSchema,
    normalized_path: AnalyticsRoutePathSchema,
    title: AnalyticsNullableTextSchema(200),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.path === null && value.normalized_path === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["path"],
        message: "Analytics routes require path or normalized_path.",
      });
    }
  });
export type AnalyticsRoute = z.infer<typeof AnalyticsRouteSchema>;

export const AnalyticsDimensionsSchema = z
  .object({
    auth_state: AnalyticsAuthStateSchema,
    device_type: AnalyticsDeviceTypeSchema,
    browser_family: AnalyticsNullableTextSchema(80),
    browser_major: z.number().int().nonnegative().max(10000).nullable(),
    os_family: AnalyticsNullableTextSchema(80),
    os_major: z.number().int().nonnegative().max(10000).nullable(),
    language: AnalyticsLocaleSchema,
    locale: AnalyticsLocaleSchema,
    viewport_bucket: AnalyticsViewportBucketSchema,
    referrer_domain: AnalyticsDomainSchema,
    utm_source: AnalyticsNullableTextSchema(128),
    utm_medium: AnalyticsNullableTextSchema(128),
    utm_campaign: AnalyticsNullableTextSchema(128),
    country_code: z.string().trim().regex(/^[A-Z]{2}$/).nullable(),
    region_code: AnalyticsRegionCodeSchema,
  })
  .strict();
export type AnalyticsDimensions = z.infer<typeof AnalyticsDimensionsSchema>;

export const AnalyticsCustomDimensionKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_.-]*$/)
  .refine((value) => !isSensitiveCustomDimensionKey(value), {
    message: "Analytics custom dimension key is reserved for sensitive or high-cardinality data.",
  });
export type AnalyticsCustomDimensionKey = z.infer<typeof AnalyticsCustomDimensionKeySchema>;

const AnalyticsCustomDimensionStringValueSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine((value) => !looksSensitiveCustomDimensionValue(value), {
    message: "Analytics custom dimension value appears sensitive or high-cardinality.",
  });

export const AnalyticsCustomDimensionValueSchema = z.union([
  AnalyticsCustomDimensionStringValueSchema,
  z.number().finite().min(-1_000_000).max(1_000_000),
  z.boolean(),
  z.null(),
]);
export type AnalyticsCustomDimensionValue = z.infer<typeof AnalyticsCustomDimensionValueSchema>;

export const AnalyticsCustomDimensionsSchema = z
  .record(AnalyticsCustomDimensionKeySchema, AnalyticsCustomDimensionValueSchema)
  .superRefine((value, context) => {
    if (Object.keys(value).length > MAX_ANALYTICS_CUSTOM_DIMENSIONS_PER_EVENT) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Analytics events may include at most ${MAX_ANALYTICS_CUSTOM_DIMENSIONS_PER_EVENT} custom dimensions.`,
      });
    }
  });

export type AnalyticsCustomDimensions = z.infer<typeof AnalyticsCustomDimensionsSchema>;

export const AnalyticsServiceSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    runtime: z.literal("browser").nullable().optional(),
    framework: z.string().trim().min(1).max(80).nullable().optional(),
    environment: z.string().trim().min(1).max(120),
  })
  .strict();

export type AnalyticsService = z.infer<typeof AnalyticsServiceSchema>;

export const AnalyticsCorrelationSchema = z
  .object({
    session_id: z.string().trim().min(1).max(128),
    visitor_id_hash: AnalyticsNullableHashSchema,
    user_id_hash: AnalyticsNullableHashSchema,
    trace_id: z.string().trim().min(1).max(128).nullable(),
    deploy_id: z.string().trim().min(1).max(128).nullable(),
  })
  .strict();

export type AnalyticsCorrelation = z.infer<typeof AnalyticsCorrelationSchema>;

export const AnalyticsPayloadSchema = z
  .object({
    kind: AnalyticsEventKindSchema,
    signal: AnalyticsSignalSchema.optional(),
    route: AnalyticsRouteSchema.nullable().optional(),
    previous_route: AnalyticsRouteSchema.nullable().optional(),
    dimensions: AnalyticsDimensionsSchema,
    custom_dimensions: AnalyticsCustomDimensionsSchema.optional().default({}),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.kind === "page_view" || value.kind === "route_change") && value.route == null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["route"],
        message: "Page view and route change analytics events require route context.",
      });
    }

    if (value.previous_route != null && value.kind !== "route_change") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["previous_route"],
        message: "Analytics previous_route is only valid for route_change events.",
      });
    }

    if (value.kind === "action" && value.signal?.action_key == null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["signal", "action_key"],
        message: "Action analytics events require signal.action_key.",
      });
    }

    if (value.kind === "funnel_step") {
      if (value.signal?.funnel_key == null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["signal", "funnel_key"],
          message: "Funnel step analytics events require signal.funnel_key.",
        });
      }
      if (value.signal?.step_key == null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["signal", "step_key"],
          message: "Funnel step analytics events require signal.step_key.",
        });
      }
    }

    if (value.kind === "conversion" && value.signal?.conversion_key == null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["signal", "conversion_key"],
        message: "Conversion analytics events require signal.conversion_key.",
      });
    }

    if (value.kind === "journey_marker" && value.signal?.marker_key == null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["signal", "marker_key"],
        message: "Journey marker analytics events require signal.marker_key.",
      });
    }
  });

export type AnalyticsPayload = z.infer<typeof AnalyticsPayloadSchema>;

export const AnalyticsEventEnvelopeSchema = z
  .object({
    schema_version: z.literal(ANALYTICS_EVENT_SCHEMA_VERSION),
    event_id: z.string().uuid(),
    event_type: z.literal("analytics_event"),
    project_token: z.string().trim().min(1).max(256).optional(),
    project_id: z.string().uuid().nullable().optional(),
    occurred_at: z.string().datetime(),
    sdk_name: z.string().trim().min(1).max(120),
    sdk_version: z.string().trim().min(1).max(80),
    service: AnalyticsServiceSchema,
    correlation: AnalyticsCorrelationSchema,
    payload: AnalyticsPayloadSchema,
  })
  .strict();

export type AnalyticsEventEnvelope = z.infer<typeof AnalyticsEventEnvelopeSchema>;

const AnalyticsMetricsSegmentSchema = z
  .object({
    value: z.string().trim().min(1).max(255),
    sessions: z.number().int().nonnegative(),
    pageviews: z.number().int().nonnegative(),
  })
  .strict();

export type AnalyticsMetricsSegment = z.infer<typeof AnalyticsMetricsSegmentSchema>;

const AnalyticsUsageSummarySchema = z
  .object({
    project_id: z.string().uuid(),
    from: z.string().datetime(),
    to: z.string().datetime(),
    granularity: AnalyticsMetricsGranularitySchema,
    service: z.string().trim().min(1).max(120).nullable(),
    environment: z.string().trim().min(1).max(120).nullable(),
    sessions: z.number().int().nonnegative(),
    pageviews: z.number().int().nonnegative(),
    active_visitors: z.number().int().nonnegative(),
    new_visitors: z.number().int().nonnegative(),
    returning_visitors: z.number().int().nonnegative(),
    exits: z.number().int().nonnegative(),
    conversions: z.number().int().nonnegative(),
  })
  .strict()
  .refine((value) => Date.parse(value.from) <= Date.parse(value.to), {
    message: "Analytics summary from must be before or equal to to.",
    path: ["from"],
  });

export type AnalyticsUsageSummary = z.infer<typeof AnalyticsUsageSummarySchema>;

const AnalyticsUsageBreakdownsSchema = z
  .object({
    device_types: z.array(AnalyticsMetricsSegmentSchema).max(100),
    browsers: z.array(AnalyticsMetricsSegmentSchema).max(100),
    os: z.array(AnalyticsMetricsSegmentSchema).max(100),
    languages: z.array(AnalyticsMetricsSegmentSchema).max(100),
    referrers: z.array(AnalyticsMetricsSegmentSchema).max(100),
    auth_states: z.array(AnalyticsMetricsSegmentSchema).max(100),
  })
  .strict();

export type AnalyticsUsageBreakdowns = z.infer<typeof AnalyticsUsageBreakdownsSchema>;

export const AnalyticsUsageSummaryResponseSchema = z
  .object({
    summary: AnalyticsUsageSummarySchema,
    breakdowns: AnalyticsUsageBreakdownsSchema,
  })
  .strict();

export type AnalyticsUsageSummaryResponse = z.infer<typeof AnalyticsUsageSummaryResponseSchema>;

const AnalyticsMetricsWindowSchema = z
  .object({
    project_id: z.string().uuid(),
    from: z.string().datetime(),
    to: z.string().datetime(),
    granularity: AnalyticsMetricsGranularitySchema,
    service: z.string().trim().min(1).max(120).nullable(),
    environment: z.string().trim().min(1).max(120).nullable(),
  })
  .strict();

export type AnalyticsMetricsWindow = z.infer<typeof AnalyticsMetricsWindowSchema>;

const AnalyticsRouteMetricSchema = z
  .object({
    route_key: z.string().trim().min(1).max(2048),
    pageviews: z.number().int().nonnegative(),
    unique_sessions: z.number().int().nonnegative(),
    entrances: z.number().int().nonnegative(),
    exits: z.number().int().nonnegative(),
    bounces: z.number().int().nonnegative(),
    linked_incident_sessions: z.number().int().nonnegative(),
  })
  .strict();

export type AnalyticsRouteMetric = z.infer<typeof AnalyticsRouteMetricSchema>;

export const AnalyticsRouteMetricsResponseSchema = z
  .object({
    window: AnalyticsMetricsWindowSchema,
    routes: z.array(AnalyticsRouteMetricSchema).max(100),
  })
  .strict();

export type AnalyticsRouteMetricsResponse = z.infer<typeof AnalyticsRouteMetricsResponseSchema>;

const AnalyticsJourneyPatternSchema = z
  .object({
    from_route_key: z.string().trim().min(1).max(2048),
    to_route_key: z.string().trim().min(1).max(2048),
    transition_count: z.number().int().nonnegative(),
    unique_sessions: z.number().int().nonnegative(),
    transition_share: z.number().min(0).max(1),
    sample_ids: z.array(z.string().uuid()).max(3).default([]),
  })
  .strict();

export type AnalyticsJourneyPattern = z.infer<typeof AnalyticsJourneyPatternSchema>;

export const AnalyticsJourneyPatternsResponseSchema = z
  .object({
    window: AnalyticsMetricsWindowSchema,
    patterns: z.array(AnalyticsJourneyPatternSchema).max(100),
  })
  .strict();

export type AnalyticsJourneyPatternsResponse = z.infer<typeof AnalyticsJourneyPatternsResponseSchema>;

export const AnalyticsDeviceBreakdownResponseSchema = z
  .object({
    window: AnalyticsMetricsWindowSchema,
    device_types: z.array(AnalyticsMetricsSegmentSchema).max(100),
    browsers: z.array(AnalyticsMetricsSegmentSchema).max(100),
    os: z.array(AnalyticsMetricsSegmentSchema).max(100),
    languages: z.array(AnalyticsMetricsSegmentSchema).max(100),
  })
  .strict();

export type AnalyticsDeviceBreakdownResponse = z.infer<typeof AnalyticsDeviceBreakdownResponseSchema>;

export const AnalyticsReferrerMetricsResponseSchema = z
  .object({
    window: AnalyticsMetricsWindowSchema,
    referrers: z.array(AnalyticsMetricsSegmentSchema).max(100),
    utm_sources: z.array(AnalyticsMetricsSegmentSchema).max(100),
    utm_mediums: z.array(AnalyticsMetricsSegmentSchema).max(100),
    utm_campaigns: z.array(AnalyticsMetricsSegmentSchema).max(100),
  })
  .strict();

export type AnalyticsReferrerMetricsResponse = z.infer<typeof AnalyticsReferrerMetricsResponseSchema>;

const AnalyticsActionMetricSchema = z
  .object({
    action_key: z.string().trim().min(1).max(160),
    kind: z.enum(["action", "conversion", "marker"]),
    event_count: z.number().int().nonnegative(),
    unique_sessions: z.number().int().nonnegative()
  })
  .strict();

export type AnalyticsActionMetric = z.infer<typeof AnalyticsActionMetricSchema>;

export const AnalyticsActionMetricsResponseSchema = z
  .object({
    window: AnalyticsMetricsWindowSchema,
    actions: z.array(AnalyticsActionMetricSchema).max(100)
  })
  .strict();

export type AnalyticsActionMetricsResponse = z.infer<typeof AnalyticsActionMetricsResponseSchema>;

const AnalyticsFunnelListItemSchema = z
  .object({
    funnel_key: z.string().trim().min(1).max(120),
    sessions_entered: z.number().int().nonnegative(),
    sessions_completed: z.number().int().nonnegative(),
    dropoffs: z.number().int().nonnegative(),
    conversion_rate: z.number().min(0).max(1)
  })
  .strict();

export type AnalyticsFunnelListItem = z.infer<typeof AnalyticsFunnelListItemSchema>;

export const AnalyticsFunnelsResponseSchema = z
  .object({
    window: AnalyticsMetricsWindowSchema,
    funnels: z.array(AnalyticsFunnelListItemSchema).max(100)
  })
  .strict();

export type AnalyticsFunnelsResponse = z.infer<typeof AnalyticsFunnelsResponseSchema>;

const AnalyticsFunnelStepMetricSchema = z
  .object({
    step_key: z.string().trim().min(1).max(120),
    step_order: z.number().int().nonnegative(),
    sessions_entered: z.number().int().nonnegative(),
    sessions_completed: z.number().int().nonnegative(),
    dropoffs: z.number().int().nonnegative(),
    conversion_rate: z.number().min(0).max(1),
  })
  .strict();

export type AnalyticsFunnelStepMetric = z.infer<typeof AnalyticsFunnelStepMetricSchema>;

const AnalyticsFunnelSummarySchema = z
  .object({
    project_id: z.string().uuid(),
    funnel_key: z.string().trim().min(1).max(120),
    from: z.string().datetime(),
    to: z.string().datetime(),
    granularity: AnalyticsMetricsGranularitySchema,
    service: z.string().trim().min(1).max(120).nullable(),
    environment: z.string().trim().min(1).max(120).nullable(),
    sessions_entered: z.number().int().nonnegative(),
    sessions_completed: z.number().int().nonnegative(),
    dropoffs: z.number().int().nonnegative(),
    conversion_rate: z.number().min(0).max(1),
  })
  .strict();

export type AnalyticsFunnelSummary = z.infer<typeof AnalyticsFunnelSummarySchema>;

export const AnalyticsFunnelAnalysisResponseSchema = z
  .object({
    funnel: AnalyticsFunnelSummarySchema,
    steps: z.array(AnalyticsFunnelStepMetricSchema).max(100),
  })
  .strict();

export type AnalyticsFunnelAnalysisResponse = z.infer<typeof AnalyticsFunnelAnalysisResponseSchema>;

export const AnalyticsOpportunityStatusValues = ["open", "resolved", "snoozed"] as const;
export const AnalyticsOpportunityStatusSchema = z.enum(AnalyticsOpportunityStatusValues);
export type AnalyticsOpportunityStatus = z.infer<typeof AnalyticsOpportunityStatusSchema>;

export const AnalyticsOpportunityBundleStatusValues = ["not_requested", "pending", "running", "completed", "failed"] as const;
export const AnalyticsOpportunityBundleStatusSchema = z.enum(AnalyticsOpportunityBundleStatusValues);
export type AnalyticsOpportunityBundleStatus = z.infer<typeof AnalyticsOpportunityBundleStatusSchema>;

export const AnalyticsBundleGenerationStatusValues = ["pending", "running", "completed", "failed"] as const;
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
    bundle_failure_reason: z.string().trim().min(1).max(240).nullable(),
  })
  .strict();

export type AnalyticsOpportunityRecord = z.infer<typeof AnalyticsOpportunityRecordSchema>;

export const AnalyticsOpportunitiesListResponseSchema = z
  .object({
    opportunities: z.array(AnalyticsOpportunityRecordSchema).max(100),
    next_cursor: z.string().trim().min(1).nullable(),
  })
  .strict();

export type AnalyticsOpportunitiesListResponse = z.infer<typeof AnalyticsOpportunitiesListResponseSchema>;

export const AnalyticsOpportunityResponseSchema = z
  .object({
    opportunity: AnalyticsOpportunityRecordSchema,
  })
  .strict();

export type AnalyticsOpportunityResponse = z.infer<typeof AnalyticsOpportunityResponseSchema>;

export const AnalyticsBundleGenerationRecordSchema = z
  .object({
    generation_id: z.string().uuid(),
    project_id: z.string().uuid(),
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
    updated_at: z.string().datetime(),
  })
  .strict();

export type AnalyticsBundleGenerationRecord = z.infer<typeof AnalyticsBundleGenerationRecordSchema>;

export const AnalyticsBundleGenerationsListResponseSchema = z
  .object({
    bundles: z.array(AnalyticsBundleGenerationRecordSchema).max(100),
    next_cursor: z.string().trim().min(1).nullable(),
  })
  .strict();

export type AnalyticsBundleGenerationsListResponse = z.infer<typeof AnalyticsBundleGenerationsListResponseSchema>;

const AnalyticsBundleProjectSchema = z
  .object({
    project_id: z.string().uuid(),
    service: z.string().trim().min(1).max(120).nullable(),
    environment: z.string().trim().min(1).max(120).nullable(),
  })
  .strict();

const AnalyticsBundleAnalysisWindowSchema = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    granularity: AnalyticsBundleGranularitySchema,
  })
  .strict()
  .refine((value) => Date.parse(value.from) <= Date.parse(value.to), {
    message: "AnalyticsBundle analysis_window.from must be before or equal to analysis_window.to.",
    path: ["from"],
  });

const AnalyticsBundleSummarySchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    description: z.string().trim().min(1).max(2000),
    confidence: AnalyticsBundleConfidenceSchema,
    severity: AnalyticsBundleSeveritySchema,
  })
  .strict();

const AnalyticsBundleMetricsSchema = z
  .object({
    sessions_analyzed: z.number().int().nonnegative(),
    affected_sessions: z.number().int().nonnegative().nullable(),
    baseline: z.record(z.string(), z.unknown()),
    current: z.record(z.string(), z.unknown()),
  })
  .strict();

const AnalyticsBundleRecordSchema = z.record(z.string(), z.unknown());

const AnalyticsBundleRedactionSchema = z
  .object({
    rules_applied: z.array(z.string().trim().min(1).max(120)).max(50),
    omitted_fields: z.array(z.string().trim().min(1).max(200)).max(100),
  })
  .strict();

const AnalyticsBundleMetadataSchema = z
  .object({
    input_fingerprint: AnalyticsSafeHashSchema,
  })
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
    metadata: AnalyticsBundleMetadataSchema,
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
    aggregate_retention_months: z.number().int().min(1).max(120),
    max_saved_funnels: z.number().int().min(0).max(100),
    max_custom_dimensions: z.number().int().min(0).max(20),
    approved_custom_dimensions: z.array(AnalyticsCustomDimensionKeySchema).max(20),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.approved_custom_dimensions.length > value.max_custom_dimensions) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["approved_custom_dimensions"],
        message: "Approved custom dimensions cannot exceed max_custom_dimensions.",
      });
    }
  });

export type AnalyticsSettings = z.infer<typeof AnalyticsSettingsSchema>;

export const AnalyticsSettingsResponseSchema = z
  .object({
    access_mode: z.enum(["manage", "preview"]),
    analytics_available: z.boolean(),
    settings: AnalyticsSettingsSchema,
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
    aggregate_retention_months: z.number().int().min(1).max(120).optional(),
    max_saved_funnels: z.number().int().min(0).max(100).optional(),
    max_custom_dimensions: z.number().int().min(0).max(20).optional(),
    approved_custom_dimensions: z.array(AnalyticsCustomDimensionKeySchema).max(20).optional(),
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
        message: "Approved custom dimensions cannot exceed max_custom_dimensions.",
      });
    }
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one analytics settings field must be provided.",
  });

export type AnalyticsSettingsUpdate = z.infer<typeof AnalyticsSettingsUpdateSchema>;

function normalizeCustomDimensionKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function isSensitiveCustomDimensionKey(value: string): boolean {
  const normalized = normalizeCustomDimensionKey(value);
  const sensitiveKeys = new Set([
    "email",
    "email_address",
    "phone",
    "phone_number",
    "password",
    "passcode",
    "token",
    "secret",
    "api_key",
    "apikey",
    "authorization",
    "auth_token",
    "card",
    "card_number",
    "credit_card",
    "ssn",
    "ip",
    "ip_address",
    "user_id",
    "userid",
    "account_id",
    "workspace_id",
    "order_id",
    "ticket_id",
    "url",
    "href",
    "query",
    "text",
    "message",
    "body",
    "payload",
    "session_id",
    "visitor_id",
  ]);

  return sensitiveKeys.has(normalized)
    || normalized.endsWith("_id")
    || normalized.endsWith("_token")
    || normalized.endsWith("_secret")
    || normalized.endsWith("_password");
}

function looksSensitiveCustomDimensionValue(value: string): boolean {
  return /https?:\/\//i.test(value)
    || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    || /\bBearer\s+[A-Za-z0-9._~+/=-]+/i.test(value)
    || /\b(?:token|password|secret|api_key)=/i.test(value);
}
