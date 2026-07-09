import { gunzipSync } from "node:zlib";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";

import {
  AnalyticsJourneySampleArtifactSchema,
  AnalyticsJourneySampleResponseSchema,
  AnalyticsJourneySamplesListResponseSchema,
  getTierCapabilities
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { isObjectNotFoundError, requireRateLimitedProjectAccess } from "../api-helpers.js";

const AnalyticsJourneySampleParamsSchema = z.object({
  id: z.string().uuid()
}).strict();

const AnalyticsJourneySamplesListQuerySchema = z
  .object({
    project_id: z.string().uuid(),
    service: z.string().trim().min(1).max(120).optional(),
    environment: z.string().trim().min(1).max(120).optional(),
    tag: z.string().trim().min(1).max(120).optional(),
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20)
  })
  .strict();

const AnalyticsJourneySampleQuerySchema = z
  .object({
    project_id: z.string().uuid()
  })
  .strict();

type AnalyticsJourneySample = NonNullable<
  Awaited<ReturnType<NonNullable<ApiDependencies["analyticsJourneySamples"]>["getAnalyticsJourneySampleForProject"]>>
>;

export function registerAnalyticsJourneySampleRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.get("/v1/analytics/journey-samples", async (request, reply) => {
    const parsedQuery = AnalyticsJourneySamplesListQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const parsedCursor = parseAnalyticsJourneySamplesCursor(parsedQuery.data.cursor);
    if (parsedQuery.data.cursor !== undefined && parsedCursor === null) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const access = await requireAnalyticsProjectReadAccess(request, reply, dependencies, parsedQuery.data.project_id);
    if (access === null) {
      return;
    }

    if (dependencies.analyticsJourneySamples === undefined) {
      return reply.status(404).send({ error: "analytics_journey_samples_not_available" });
    }

    const samples = await dependencies.analyticsJourneySamples.listAnalyticsJourneySamplesForProject({
      organization_id: access.organization_id,
      project_id: parsedQuery.data.project_id,
      service: parsedQuery.data.service,
      environment: parsedQuery.data.environment,
      tag: parsedQuery.data.tag,
      ...(parsedCursor === null ? {} : { cursor: parsedCursor }),
      limit: parsedQuery.data.limit,
      now: new Date().toISOString()
    });

    return reply.status(200).send(AnalyticsJourneySamplesListResponseSchema.parse({
      samples: samples.samples.map(toAnalyticsJourneySampleMetadata),
      next_cursor: samples.next_cursor
    }));
  });

  app.get("/v1/analytics/journey-samples/:id", async (request, reply) => {
    const parsedParams = AnalyticsJourneySampleParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_journey_sample_id" });
    }

    const parsedQuery = AnalyticsJourneySampleQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const access = await requireAnalyticsProjectReadAccess(request, reply, dependencies, parsedQuery.data.project_id);
    if (access === null) {
      return;
    }

    if (dependencies.analyticsJourneySamples === undefined) {
      return reply.status(404).send({ error: "analytics_journey_samples_not_available" });
    }

    const sample = await dependencies.analyticsJourneySamples.getAnalyticsJourneySampleForProject({
      organization_id: access.organization_id,
      project_id: parsedQuery.data.project_id,
      sample_id: parsedParams.data.id,
      now: new Date().toISOString()
    });
    if (sample === null) {
      return reply.status(404).send({ error: "analytics_journey_sample_not_found" });
    }

    let journeyArtifact: unknown;
    try {
      const compressed = await dependencies.objectStoreReader.getObject({ key: sample.object_key });
      journeyArtifact = JSON.parse(gunzipSync(compressed).toString("utf8"));
    } catch (error) {
      if (isObjectNotFoundError(error)) {
        return reply.status(404).send({ error: "analytics_journey_sample_artifact_not_found" });
      }

      return reply.status(500).send({ error: "analytics_journey_sample_artifact_unavailable" });
    }

    const parsedArtifact = AnalyticsJourneySampleArtifactSchema.safeParse(journeyArtifact);
    if (!parsedArtifact.success) {
      return reply.status(500).send({ error: "analytics_journey_sample_artifact_invalid" });
    }

    return reply.status(200).send(AnalyticsJourneySampleResponseSchema.parse({
      sample: toAnalyticsJourneySampleMetadata(sample),
      journey: parsedArtifact.data
    }));
  });
}

async function requireAnalyticsProjectReadAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  projectId: string
): Promise<{ organization_id: string } | null> {
  const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
    bucket: "retrieval-read",
    projectId
  });
  if (auth === null) {
    return null;
  }

  if (!getTierCapabilities(auth.access.organization_plan).analytics_bundle) {
    await reply.status(403).send({ error: "upgrade_required" });
    return null;
  }

  return {
    organization_id: auth.access.organization_id
  };
}

function toAnalyticsJourneySampleMetadata(sample: AnalyticsJourneySample): unknown {
  return {
    sample_id: sample.sample_id,
    project_id: sample.project_id,
    service: sample.service,
    environment: sample.environment,
    session_id_hash: sample.session_id_hash,
    visitor_id_hash: sample.visitor_id_hash,
    analysis_tags: sample.analysis_tags,
    first_seen_at: sample.first_seen_at,
    last_seen_at: sample.last_seen_at,
    dimensions_summary: sample.dimensions_summary,
    has_artifact: sample.object_key !== "",
    expires_at: sample.expires_at,
    created_at: sample.created_at
  };
}

function parseAnalyticsJourneySamplesCursor(
  rawCursor: string | undefined
): { last_seen_at: string; sample_id: string } | null {
  if (rawCursor === undefined) {
    return null;
  }

  const separatorIndex = rawCursor.lastIndexOf("|");
  if (separatorIndex <= 0 || separatorIndex >= rawCursor.length - 1) {
    return null;
  }

  const lastSeenAt = rawCursor.slice(0, separatorIndex);
  const sampleId = rawCursor.slice(separatorIndex + 1);
  const parsedTimestamp = Date.parse(lastSeenAt);
  if (Number.isNaN(parsedTimestamp)) {
    return null;
  }

  const parsed = z.object({
    last_seen_at: z.string().datetime(),
    sample_id: z.string().uuid()
  }).safeParse({
    last_seen_at: new Date(parsedTimestamp).toISOString(),
    sample_id: sampleId
  });

  return parsed.success ? parsed.data : null;
}
