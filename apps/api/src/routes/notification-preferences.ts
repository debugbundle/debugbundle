import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  NotificationAudienceSchema,
  NotificationPauseSchema,
  NotificationResumeSchema,
  NotificationUpdateSchema,
  type NotificationChange
} from "../../../../packages/shared-types/src/notification-preferences.js";
import type { NotificationScope } from "../../../../packages/storage/src/notification-preferences-store.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedMemberAuth, requireRateLimitedProjectAccess } from "../api-helpers.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";

const querySchema = z.object({ audience: NotificationAudienceSchema.default("personal") }).strict();
export function registerNotificationPreferencesRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  for (const project of [false, true]) {
    const base = project
      ? "/v1/projects/:id/notification-preferences"
      : "/v1/account/notification-preferences";
    for (const action of ["get", "update", "pause", "resume"] as const) {
      app.route({
        method: action === "get" ? "GET" : action === "update" ? "PATCH" : "POST",
        url: action === "get" || action === "update" ? base : `${base}/${action}`,
        async handler(request, reply) {
          const query = querySchema.safeParse(request.query);
          const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
          if (!query.success || (project && !params.success))
            return reply.status(400).send({ error: "invalid_notification_scope" });
          const projectId = project && params.success ? params.data.id : null;
          const bucket = action === "get" ? "management-read" : "management-write";
          const access =
            projectId === null
              ? null
              : await requireRateLimitedProjectAccess(request, reply, dependencies, {
                  bucket,
                  projectId
                });
          if (projectId !== null && access === null) return;
          const member =
            access?.member ??
            (await requireRateLimitedMemberAuth(request, reply, dependencies, bucket));
          if (member === null) return;
          const organizationId = access?.access.organization_id ?? member.organization_id;
          const canManage =
            query.data.audience === "personal" ||
            (projectId === null
              ? member.role === "owner"
              : access?.access.effective_role === "owner" ||
                access?.access.effective_role === "admin");
          if (action !== "get" && !canManage) return reply.status(403).send({ error: "forbidden" });
          const store = dependencies.notificationPreferences;
          if (store === undefined)
            return reply.status(503).send({ error: "notification_preferences_unavailable" });
          const scope: NotificationScope = {
            audience: query.data.audience,
            owner_id: query.data.audience === "personal" ? member.member_id : organizationId,
            project_id: projectId
          };
          reply.header("Cache-Control", "no-store");
          if (action === "get") {
            try {
              return reply.send(await store.get(scope, canManage));
            } catch {
              return reply.status(500).send({ error: "notification_preferences_failed" });
            }
          }
          const parsed =
            action === "pause"
              ? NotificationPauseSchema.safeParse(request.body)
              : action === "resume"
                ? NotificationResumeSchema.safeParse(request.body)
                : NotificationUpdateSchema.safeParse(request.body);
          if (!parsed.success)
            return reply.status(400).send({ error: "invalid_notification_preferences" });
          const change = (
            action === "pause"
              ? { pause: parsed.data }
              : action === "resume"
                ? { resume: parsed.data }
                : parsed.data
          ) as NotificationChange;
          try {
            const response = await store.update(scope, change);
            await recordAuditLog(dependencies.auditLogging, {
              organization_id: organizationId,
              actor_user_id: member.member_id,
              actor_type: resolveAuditActorType(request.headers),
              action: `notification_preferences.${action}`,
              target_type: projectId === null ? "account" : "project",
              target_id: projectId ?? organizationId,
              status: "success",
              ip_address: request.ip,
              metadata: { audience: scope.audience }
            });
            return reply.send(response);
          } catch (error) {
            if (
              error instanceof Error &&
              [
                "notification_personal_email_only",
                "notification_account_cannot_inherit",
                "notification_pause_must_be_future"
              ].includes(error.message)
            ) {
              return reply.status(400).send({ error: error.message });
            }
            return reply.status(500).send({ error: "notification_preferences_failed" });
          }
        }
      });
    }
  }
}
