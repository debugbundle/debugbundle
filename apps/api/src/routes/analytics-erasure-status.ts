import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AnalyticsSubjectErasureTaskStatusSchema } from "../../../../packages/shared-types/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedProjectAccess } from "../api-helpers.js";

const Params = z.object({ id: z.string().uuid(), taskId: z.string().uuid() }).strict();

/** Owner/admin task progress read; the relay request never exposes subject references here. */
export function registerAnalyticsErasureStatusRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  app.get("/v1/projects/:id/analytics/identity/erasures/:taskId", async (request, reply) => {
    const params = Params.safeParse(request.params);
    if (!params.success) return reply.status(404).send({ error: "analytics_erasure_not_found" });
    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-read",
      projectId: params.data.id
    });
    if (auth === null) return;
    if (auth.access.effective_role !== "owner" && auth.access.effective_role !== "admin")
      return reply.status(403).send({ error: "forbidden" });
    reply.header("Cache-Control", "private, no-store");
    const service = dependencies.semanticAnalyticsSubjectErasure;
    if (service?.enabled !== true)
      return reply.status(503).send({ error: "analytics_identity_unavailable" });
    const result = await service.readStatus({
      actorUserId: auth.member.member_id,
      projectId: params.data.id.toLowerCase(),
      taskId: params.data.taskId.toLowerCase()
    });
    if (result.kind !== "status")
      return reply
        .status(result.kind === "invalid" ? 400 : result.kind === "forbidden" ? 403 : 404)
        .send({ error: `analytics_erasure_${result.kind}` });
    const status = AnalyticsSubjectErasureTaskStatusSchema.safeParse(result.task);
    if (!status.success) return reply.status(503).send({ error: "analytics_identity_unavailable" });
    return reply.send(status.data);
  });
}
