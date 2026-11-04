import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ProjectMergeApplySchema,
  ProjectMergeRequestSchema,
  ProjectMergeSelectorSchema
} from "../../../../packages/shared-types/src/project-consolidation.js";
import { ProjectMergeError } from "../../../../packages/storage/src/project-merge-store.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedMemberAuth } from "../api-helpers.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";
import {
  PROJECT_MERGE_REQUEST_BODY_LIMIT_BYTES,
  SMALL_REQUEST_BODY_LIMIT_BYTES
} from "../http-limits.js";
const identity = z.object({ id: z.string().guid() }).strict();
export function registerProjectMergeRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  for (const action of [
    "preview",
    "apply",
    "status",
    "lookup",
    "verify",
    "resume",
    "cancel"
  ] as const) {
    const mutation = ["apply", "resume", "cancel"].includes(action);
    const suffix =
      action === "verify"
        ? "/verification"
        : action === "resume" || action === "cancel"
          ? `/${action}`
          : "";
    app.route({
      bodyLimit:
        action === "preview" || action === "apply"
          ? PROJECT_MERGE_REQUEST_BODY_LIMIT_BYTES
          : SMALL_REQUEST_BODY_LIMIT_BYTES,
      method: mutation || action === "preview" ? "POST" : "GET",
      url:
        action === "preview"
          ? "/v1/project-merges/preview"
          : action === "apply" || action === "lookup"
            ? "/v1/project-merges"
            : `/v1/project-merges/:id${suffix}`,
      async handler(request, reply) {
        const member = await requireRateLimitedMemberAuth(
          request,
          reply,
          dependencies,
          mutation ? "management-write" : "management-read"
        );
        if (!member) return;
        const store = dependencies.projectMerges;
        if (!store) return reply.status(503).send({ error: "project_merges_unavailable" });
        const scope = { user_id: member.member_id };
        let failure: string | undefined;
        let operationId: string | undefined;
        const invalid = (): typeof reply => {
          failure = "invalid_merge_request";
          return reply.status(400).send({ error: failure });
        };
        try {
          if (action === "preview") {
            const data = ProjectMergeRequestSchema.safeParse(request.body);
            if (!data.success) return invalid();
            return reply.send(await store.preview({ ...scope, request: data.data }));
          }
          if (action === "apply") {
            const data = ProjectMergeApplySchema.safeParse(request.body);
            if (!data.success) return invalid();
            const result = await store.apply({ ...scope, ...data.data });
            operationId = result.operation_id;
            return reply.send(result);
          }
          if (action === "lookup") {
            const data = ProjectMergeSelectorSchema.safeParse(request.query);
            if (!data.success || !("idempotency_key" in data.data)) return invalid();
            return reply.send(await store.status({ ...scope, ...data.data }));
          }
          const data = identity.safeParse(request.params);
          if (
            !data.success ||
            (mutation &&
              request.body !== undefined &&
              !z.object({}).strict().safeParse(request.body).success)
          )
            return invalid();
          operationId = data.data.id;
          return reply.send(await store[action]({ ...scope, operation_id: operationId }));
        } catch (error) {
          failure = error instanceof ProjectMergeError ? error.code : "project_merge_failed";
          if (!(error instanceof ProjectMergeError)) throw error;
          operationId = error.operation_id ?? operationId;
          const status =
            error.code === "project_merge_not_found"
              ? 404
              : error.code === "invalid_merge_request"
                ? 400
                : error.code === "project_merge_not_enabled"
                  ? 503
                  : 409;
          return reply.status(status).send({
            error: error.code,
            ...(operationId === undefined ? {} : { operation_id: operationId })
          });
        } finally {
          if (mutation)
            await recordAuditLog(dependencies.auditLogging, {
              organization_id: member.organization_id,
              actor_user_id: member.member_id,
              actor_type: resolveAuditActorType(request.headers),
              action: `project_merge.${action}`,
              target_type: "project_merge",
              target_id: operationId ?? null,
              status: failure === undefined ? "success" : "failure",
              ip_address: request.ip,
              metadata: failure === undefined ? {} : { reason: failure }
            });
        }
      }
    });
  }
}
