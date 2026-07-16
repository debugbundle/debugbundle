import { z } from "zod";

const AnalyticsHashLikeSchema = z.string().trim().min(1).max(200);
const AnalyticsJourneySafeScalarSchema = z.union([
  z.string().max(256),
  z.number().finite(),
  z.boolean(),
  z.null()
]);
const AnalyticsJourneyDimensionsSchema = z
  .record(z.string().trim().min(1).max(64), AnalyticsJourneySafeScalarSchema)
  .refine((value) => Object.keys(value).length <= 32);
const AnalyticsJourneyDimensionsSummarySchema = z
  .record(
    z.string().trim().min(1).max(64),
    z.union([AnalyticsJourneySafeScalarSchema, AnalyticsJourneyDimensionsSchema])
  )
  .superRefine((value, context) => {
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === "object" && entry !== null && key !== "custom_dimensions") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: "Only controlled custom_dimensions may be nested in a journey summary."
        });
      }
    }
  });
const AnalyticsJourneyRouteSchema = z
  .object({
    path: z.string().trim().min(1).max(2048).nullable().optional(),
    normalized_path: z.string().trim().min(1).max(2048).nullable().optional(),
    title: z.string().trim().min(1).max(200).nullable().optional()
  })
  .strict()
  .refine((value) => value.path != null || value.normalized_path != null);
const AnalyticsJourneySignalSchema = z
  .object({
    action_key: z.string().trim().min(1).max(120).nullable().optional(),
    funnel_key: z.string().trim().min(1).max(120).nullable().optional(),
    step_key: z.string().trim().min(1).max(120).nullable().optional(),
    conversion_key: z.string().trim().min(1).max(120).nullable().optional(),
    marker_key: z.string().trim().min(1).max(120).nullable().optional()
  })
  .strict();

export const AnalyticsJourneySampleEventSchema = z
  .object({
    event_id: z.string().trim().min(1).max(128),
    occurred_at: z.string().datetime(),
    kind: z.enum([
      "session_start",
      "page_view",
      "route_change",
      "action",
      "funnel_step",
      "conversion",
      "journey_marker",
      "session_summary"
    ]),
    route: AnalyticsJourneyRouteSchema.nullable(),
    previous_route: AnalyticsJourneyRouteSchema.nullable(),
    signal: AnalyticsJourneySignalSchema.nullable(),
    trace_id: z.string().trim().min(1).max(128).nullable(),
    deploy_id: z.string().trim().min(1).max(128).nullable(),
    dimensions: AnalyticsJourneyDimensionsSchema,
    custom_dimensions: AnalyticsJourneyDimensionsSchema
  })
  .strict();

export type AnalyticsJourneySampleEvent = z.infer<typeof AnalyticsJourneySampleEventSchema>;

export const AnalyticsJourneySampleMetadataSchema = z
  .object({
    sample_id: z.string().uuid(),
    project_id: z.string().uuid(),
    service: z.string().trim().min(1).max(120).nullable(),
    environment: z.string().trim().min(1).max(120).nullable(),
    session_id_hash: AnalyticsHashLikeSchema,
    visitor_id_hash: AnalyticsHashLikeSchema.nullable(),
    analysis_tags: z.array(z.string().trim().min(1).max(120)).max(50),
    first_seen_at: z.string().datetime(),
    last_seen_at: z.string().datetime(),
    dimensions_summary: z.record(z.string(), z.unknown()),
    has_artifact: z.boolean(),
    expires_at: z.string().datetime(),
    created_at: z.string().datetime()
  })
  .strict();

export type AnalyticsJourneySampleMetadata = z.infer<typeof AnalyticsJourneySampleMetadataSchema>;

export const AnalyticsJourneySamplesListResponseSchema = z
  .object({
    samples: z.array(AnalyticsJourneySampleMetadataSchema).max(100),
    next_cursor: z.string().trim().min(1).nullable()
  })
  .strict();

export type AnalyticsJourneySamplesListResponse = z.infer<
  typeof AnalyticsJourneySamplesListResponseSchema
>;

export const AnalyticsJourneySampleArtifactSchema = z
  .object({
    schema_version: z.literal("analytics_journey_sample.v1"),
    sample_id: z.string().uuid(),
    project_id: z.string().uuid(),
    service: z.string().trim().min(1).max(120),
    environment: z.string().trim().min(1).max(120),
    session_id_hash: AnalyticsHashLikeSchema,
    visitor_id_hash: AnalyticsHashLikeSchema.nullable(),
    first_seen_at: z.string().datetime(),
    last_seen_at: z.string().datetime(),
    analysis_tags: z.array(z.string().trim().min(1).max(120)).max(50),
    dimensions_summary: AnalyticsJourneyDimensionsSummarySchema,
    events: z.array(AnalyticsJourneySampleEventSchema).max(100)
  })
  .strict()
  .refine((value) => Date.parse(value.first_seen_at) <= Date.parse(value.last_seen_at), {
    path: ["last_seen_at"],
    message: "Journey sample last_seen_at must not precede first_seen_at."
  });
export type AnalyticsJourneySampleArtifact = z.infer<typeof AnalyticsJourneySampleArtifactSchema>;

export const AnalyticsJourneySampleResponseSchema = z
  .object({
    sample: AnalyticsJourneySampleMetadataSchema,
    journey: AnalyticsJourneySampleArtifactSchema
  })
  .strict();

export type AnalyticsJourneySampleResponse = z.infer<typeof AnalyticsJourneySampleResponseSchema>;
