import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import {
  AnalyticsDeviceBreakdownResponseSchema,
  AnalyticsFunnelAnalysisResponseSchema,
  AnalyticsJourneyPatternsResponseSchema,
  AnalyticsMetricsGranularitySchema,
  AnalyticsReferrerMetricsResponseSchema,
  AnalyticsRouteMetricsResponseSchema,
  AnalyticsUsageSummaryResponseSchema,
  getTierCapabilities
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedProjectAccess } from "../api-helpers.js";

const DEFAULT_LAST_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LAST_MS = 370 * 24 * 60 * 60 * 1000;

const AnalyticsSummaryQuerySchema = z
  .object({
    project_id: z.string().uuid(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    last: z.string().trim().min(2).max(16).optional(),
    granularity: AnalyticsMetricsGranularitySchema.optional().default("day"),
    service: z.string().trim().min(1).max(120).optional(),
    environment: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10)
  })
  .strict();

const AnalyticsFunnelParamsSchema = z.object({
  key: z.string().trim().min(1).max(120)
}).strict();

type AnalyticsQuery = z.infer<typeof AnalyticsSummaryQuerySchema>;
type AuthorizedAnalyticsQuery = AnalyticsQuery & { from: string; to: string; organization_id: string };

export function registerAnalyticsRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.get("/v1/analytics/summary", async (request, reply) => {
    const input = await requireAnalyticsMetricsQuery(request, reply, dependencies);
    if (input === null) {
      return;
    }

    const summary = await dependencies.analyticsMetrics!.getUsageSummaryForProject(toMetricsInput(input));

    return reply.status(200).send(AnalyticsUsageSummaryResponseSchema.parse(summary));
  });

  app.get("/v1/analytics/routes", async (request, reply) => {
    const input = await requireAnalyticsMetricsQuery(request, reply, dependencies);
    if (input === null) {
      return;
    }

    const routes = await dependencies.analyticsMetrics!.getRouteMetricsForProject(toMetricsInput(input));

    return reply.status(200).send(AnalyticsRouteMetricsResponseSchema.parse(routes));
  });

  app.get("/v1/analytics/journey-patterns", async (request, reply) => {
    const input = await requireAnalyticsMetricsQuery(request, reply, dependencies);
    if (input === null) {
      return;
    }

    const journeys = await dependencies.analyticsMetrics!.getJourneyPatternsForProject(toMetricsInput(input));

    return reply.status(200).send(AnalyticsJourneyPatternsResponseSchema.parse(journeys));
  });

  app.get("/v1/analytics/devices", async (request, reply) => {
    const input = await requireAnalyticsMetricsQuery(request, reply, dependencies);
    if (input === null) {
      return;
    }

    const devices = await dependencies.analyticsMetrics!.getDeviceBreakdownForProject(toMetricsInput(input));

    return reply.status(200).send(AnalyticsDeviceBreakdownResponseSchema.parse(devices));
  });

  app.get("/v1/analytics/referrers", async (request, reply) => {
    const input = await requireAnalyticsMetricsQuery(request, reply, dependencies);
    if (input === null) {
      return;
    }

    const referrers = await dependencies.analyticsMetrics!.getReferrerMetricsForProject(toMetricsInput(input));

    return reply.status(200).send(AnalyticsReferrerMetricsResponseSchema.parse(referrers));
  });

  app.get("/v1/analytics/funnels/:key", async (request, reply) => {
    const parsedParams = AnalyticsFunnelParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_funnel_key" });
    }

    const input = await requireAnalyticsMetricsQuery(request, reply, dependencies);
    if (input === null) {
      return;
    }

    const funnel = await dependencies.analyticsMetrics!.getFunnelAnalysisForProject({
      ...toMetricsInput(input),
      funnel_key: parsedParams.data.key
    });

    return reply.status(200).send(AnalyticsFunnelAnalysisResponseSchema.parse(funnel));
  });
}

async function requireAnalyticsMetricsQuery(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies
): Promise<AuthorizedAnalyticsQuery | null> {
  const parsedQuery = AnalyticsSummaryQuerySchema.safeParse(request.query);
  if (!parsedQuery.success) {
    await reply.status(400).send({ error: "invalid_query" });
    return null;
  }

  const range = resolveAnalyticsTimeRange(parsedQuery.data);
  if (range === null) {
    await reply.status(400).send({ error: "invalid_query" });
    return null;
  }

  const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
    bucket: "retrieval-read",
    projectId: parsedQuery.data.project_id
  });
  if (auth === null) {
    return null;
  }

  if (!getTierCapabilities(auth.access.organization_plan).analytics_bundle) {
    await reply.status(403).send({ error: "upgrade_required" });
    return null;
  }

  if (dependencies.analyticsMetrics === undefined) {
    await reply.status(404).send({ error: "analytics_metrics_not_available" });
    return null;
  }

  return {
    ...parsedQuery.data,
    from: range.from,
    to: range.to,
    organization_id: auth.access.organization_id
  };
}

function toMetricsInput(input: AuthorizedAnalyticsQuery): {
  organization_id: string;
  project_id: string;
  from: string;
  to: string;
  granularity: "hour" | "day";
  service?: string | undefined;
  environment?: string | undefined;
  limit?: number | undefined;
} {
  return {
    organization_id: input.organization_id,
    project_id: input.project_id,
    from: input.from,
    to: input.to,
    granularity: input.granularity,
    service: input.service,
    environment: input.environment,
    limit: input.limit
  };
}

function resolveAnalyticsTimeRange(input: {
  from?: string | undefined;
  to?: string | undefined;
  last?: string | undefined;
}): { from: string; to: string } | null {
  if (input.last !== undefined && input.from !== undefined) {
    return null;
  }

  const to = input.to ?? new Date().toISOString();
  const toMs = Date.parse(to);
  if (Number.isNaN(toMs)) {
    return null;
  }

  let from = input.from;
  if (from === undefined) {
    const lastMs = input.last === undefined ? DEFAULT_LAST_MS : parseLastDurationMs(input.last);
    if (lastMs === null) {
      return null;
    }
    from = new Date(toMs - lastMs).toISOString();
  }

  const fromMs = Date.parse(from);
  if (Number.isNaN(fromMs) || fromMs > toMs) {
    return null;
  }

  return {
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString()
  };
}

function parseLastDurationMs(value: string): number | null {
  const match = /^([1-9][0-9]{0,4})([hdw])$/.exec(value.trim());
  if (match === null) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier =
    unit === "h"
      ? 60 * 60 * 1000
      : unit === "d"
        ? 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;
  const durationMs = amount * multiplier;

  return durationMs <= MAX_LAST_MS ? durationMs : null;
}
