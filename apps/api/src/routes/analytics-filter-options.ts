import type { FastifyInstance } from "fastify";
import {
  AnalyticsFilterOptionsQuerySchema,
  AnalyticsFilterOptionsResponseSchema,
  getTierCapabilities,
  resolveAnalyticsTimeRange
} from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedProjectAccess } from "../api-helpers.js";
import { sendProjectedAnalyticsRead } from "./analytics-read-projection.js";

export function registerAnalyticsFilterOptionsRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  app.get("/v1/analytics/filter-options", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const parsed = AnalyticsFilterOptionsQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_query" });
    const range = resolveAnalyticsTimeRange(parsed.data);
    if (range === null) return reply.status(400).send({ error: "invalid_query" });
    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "retrieval-read",
      projectId: parsed.data.project_id
    });
    if (auth === null) return;
    if (!getTierCapabilities(auth.access.organization_plan).analytics_bundle) {
      return reply.status(403).send({ error: "upgrade_required" });
    }
    if (dependencies.analyticsFilterOptions === undefined) {
      return reply.status(503).send({ error: "analytics_filter_options_unavailable" });
    }
    const result = await dependencies.analyticsFilterOptions.getFilterOptionsForProject({
      organization_id: auth.access.organization_id,
      project_id: parsed.data.project_id,
      origin_project_ids: auth.access.origin_project_ids ?? [parsed.data.project_id],
      ...range,
      granularity: parsed.data.granularity,
      service: parsed.data.service,
      environment: parsed.data.environment,
      limit: parsed.data.limit
    });
    return sendProjectedAnalyticsRead(reply, result, AnalyticsFilterOptionsResponseSchema, true);
  });
}
