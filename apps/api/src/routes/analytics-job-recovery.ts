import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AnalyticsSemanticJobRetryResponseSchema } from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedProjectAccess } from "../api-helpers.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";

const Params = z.object({ id: z.string().uuid(), eventId: z.string().uuid() }).strict();

/** Retry one failed project event only while its protected receipt still owns raw evidence. */
export function registerAnalyticsJobRecoveryRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  app.post(
    "/v1/projects/:id/analytics/events/:eventId/retry",
    { bodyLimit: 1024 },
    async (request, reply) => {
      const params = Params.safeParse(request.params);
      if (!params.success || request.body !== undefined)
        return reply.status(400).send({ error: "invalid_payload" });
      const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
        bucket: "management-write",
        projectId: params.data.id
      });
      if (auth === null) return;
      if (auth.access.effective_role !== "owner" && auth.access.effective_role !== "admin")
        return reply.status(403).send({ error: "forbidden" });
      reply.header("Cache-Control", "private, no-store");
      const service = dependencies.semanticAnalyticsJobRecovery;
      if (service?.enabled !== true)
        return reply.status(503).send({ error: "analytics_job_recovery_unavailable" });
      const projectId = params.data.id.toLowerCase();
      const eventId = params.data.eventId.toLowerCase();
      const result = await service.retry({
        actorUserId: auth.member.member_id,
        projectId,
        eventId
      });
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "analytics_job.retry",
        target_type: "analytics_event",
        target_id: eventId,
        status: result.kind === "queued" ? "success" : "failure",
        ip_address: request.ip,
        metadata: { project_id: projectId, result: result.kind }
      });
      if (result.kind !== "queued")
        return reply
          .status(result.kind === "invalid" ? 400 : result.kind === "forbidden" ? 403 : 409)
          .send({ error: `analytics_job_recovery_${result.kind}` });
      return reply.status(202).send(
        AnalyticsSemanticJobRetryResponseSchema.parse({
          project_id: projectId,
          event_id: eventId,
          status: "queued"
        })
      );
    }
  );
}
