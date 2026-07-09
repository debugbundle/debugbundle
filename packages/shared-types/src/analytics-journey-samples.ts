import { z } from "zod";

const AnalyticsHashLikeSchema = z.string().trim().min(1).max(200);

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

export type AnalyticsJourneySamplesListResponse = z.infer<typeof AnalyticsJourneySamplesListResponseSchema>;

export const AnalyticsJourneySampleArtifactSchema = z.record(z.string(), z.unknown());
export type AnalyticsJourneySampleArtifact = z.infer<typeof AnalyticsJourneySampleArtifactSchema>;

export const AnalyticsJourneySampleResponseSchema = z
  .object({
    sample: AnalyticsJourneySampleMetadataSchema,
    journey: AnalyticsJourneySampleArtifactSchema
  })
  .strict();

export type AnalyticsJourneySampleResponse = z.infer<typeof AnalyticsJourneySampleResponseSchema>;
