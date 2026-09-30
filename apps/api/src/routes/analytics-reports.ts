import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ProjectSemanticFunnelQuerySchema,
  ProjectSemanticFunnelRecentQuerySchema,
  ProjectSemanticFunnelReportResponseSchema
} from "../../../../packages/analytics-engine/src/funnel-report-protocol.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedProjectAccess } from "../api-helpers.js";

const Params = z
  .object({
    kind: z.literal("project"),
    id: z.string().uuid()
  })
  .strict();

export function registerAnalyticsReportRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  app.post(
    "/v1/analytics/scopes/:kind/:id/reports/query",
    { bodyLimit: 8 * 1024 },
    async (request, reply) => {
      const params = Params.safeParse(request.params);
      if (!params.success) return reply.status(404).send({ error: "analytics_report_not_found" });
      const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
        bucket: "management-read",
        projectId: params.data.id
      });
      if (auth === null) return;
      if (auth.access.effective_role !== "owner" && auth.access.effective_role !== "admin")
        return reply.status(403).send({ error: "forbidden" });
      const reports = dependencies.semanticAnalyticsReports;
      if (reports?.enabled !== true)
        return reply.status(503).send({ error: "analytics_reports_not_available" });
      const query = ProjectSemanticFunnelQuerySchema.safeParse(request.body);
      const recent = ProjectSemanticFunnelRecentQuerySchema.safeParse(request.body);
      if (!query.success && !recent.success)
        return reply.status(400).send({ error: "invalid_payload" });
      reply.header("Cache-Control", "private, no-store");
      const result = query.success
        ? await reports.read({
            actorUserId: auth.member.member_id,
            projectId: params.data.id.toLowerCase(),
            reportKey: query.data.report_key,
            from: query.data.from,
            to: query.data.to
          })
        : await reports.readRecent({
            actorUserId: auth.member.member_id,
            projectId: params.data.id.toLowerCase(),
            reportKey: recent.data!.report_key,
            last: recent.data!.last
          });
      if (result.kind !== "report") {
        const status =
          result.kind === "invalid"
            ? 400
            : result.kind === "forbidden"
              ? 403
              : result.kind === "not_found"
                ? 404
                : 409;
        return reply.status(status).send({ error: `analytics_report_${result.kind}` });
      }
      const response = ProjectSemanticFunnelReportResponseSchema.safeParse(result);
      if (!response.success)
        return reply.status(503).send({ error: "analytics_reports_not_available" });
      if (
        response.data.report.status === "available" &&
        (response.data.report.scope.kind !== "project" ||
          response.data.report.scope.project_id.toLowerCase() !== params.data.id.toLowerCase() ||
          response.data.report.definition_key !==
            (query.success ? query.data.report_key : recent.data!.report_key) ||
          (query.success
            ? response.data.report.from !== query.data.from ||
              response.data.report.to !== query.data.to
            : Date.parse(response.data.report.to) - Date.parse(response.data.report.from) !==
              Number.parseInt(recent.data!.last, 10) * 86_400_000))
      )
        return reply.status(503).send({ error: "analytics_reports_not_available" });
      return reply.send(response.data);
    }
  );
}
