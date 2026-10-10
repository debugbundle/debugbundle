import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { PublicStatusError } from "../../../../packages/storage/src/public-status-store.js";
import { sanitizePublicStatusText } from "../../../../packages/storage/src/public-status-projection.js";
import {
  parsePublicStatusBaseUrl,
  PublicStatusIdSchema,
  PublicStatusManagementSchema,
  PublicStatusOptionsSchema,
  PublicStatusOptionsQuerySchema,
  PublicStatusPageSchema,
  PublicStatusSettingsSchema
} from "../../../../packages/shared-types/src/public-status.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedProjectAccess } from "../api-helpers.js";
import { hashAuditIdentifier, recordAuditLog, resolveAuditActorType } from "../audit-logging.js";
import { ProjectParamsSchema } from "../schemas.js";

function publicReadIp(request: FastifyRequest, trustProxy: boolean): string {
  // Only opt in behind a trusted private proxy that appends the actual peer IP.
  // Taking the last hop ignores caller-supplied entries earlier in the chain.
  const header = request.headers["x-forwarded-for"];
  if (!trustProxy || typeof header !== "string" || header.length > 1024) return request.ip;
  const last = header.split(",").at(-1)?.trim();
  const ip = z.string().ip().safeParse(last);
  return ip.success ? ip.data : request.ip;
}

export function publicStatusUrl(base: string, id: string): string {
  const url = parsePublicStatusBaseUrl(base);
  return `${url.toString().replace(/\/$/, "")}/${PublicStatusIdSchema.parse(id)}`;
}
export function registerPublicStatusRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  app.get("/v1/public/status/:publicId", async (request, reply) => {
    reply.header("Cache-Control", "no-store").header("X-Robots-Tag", "noindex, nofollow");
    const params = z.object({ publicId: PublicStatusIdSchema }).strict().safeParse(request.params);
    if (!params.success || !dependencies.publicStatusPages)
      return reply.status(404).send({ error: "status_page_not_found" });
    if (!dependencies.authRateLimiter)
      return reply.status(503).send({ error: "status_page_unavailable" });
    try {
      if (dependencies.authRateLimiter) {
        const ip = publicReadIp(request, dependencies.publicStatusTrustProxy === true);
        const limit = await dependencies.authRateLimiter.claimRequest({
          ip,
          subject: `public-status:${hashAuditIdentifier(ip)}`,
          bucket: "public-status-read",
          limit: 120,
          now: new Date().toISOString()
        });
        if (!limit.allowed)
          return reply
            .header("Retry-After", String(Math.max(1, Math.ceil(limit.retry_after_ms / 1000))))
            .status(429)
            .send({ error: "rate_limited" });
      }
      const page = await dependencies.publicStatusPages.getPublicPage(params.data.publicId);
      if (!page) return reply.status(404).send({ error: "status_page_not_found" });
      return reply.send(PublicStatusPageSchema.parse(page));
    } catch {
      return reply.status(503).send({ error: "status_page_unavailable" });
    }
  });
  for (const action of ["get", "save", "options", "preview"] as const) {
    const method = action === "save" ? "PUT" : "GET";
    const suffix = action === "options" || action === "preview" ? `/${action}` : "";
    app.route({
      method,
      url: `/v1/projects/:id/status-page${suffix}`,
      handler: async (request, reply) => {
        reply.header("Cache-Control", "no-store");
        const params = ProjectParamsSchema.safeParse(request.params);
        if (!params.success) return reply.status(400).send({ error: "invalid_project_id" });
        const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
          projectId: params.data.id,
          bucket: action === "save" ? "management-write" : "management-read"
        });
        if (!auth) return;
        const manage = auth.access.effective_role === "owner";
        if (action !== "get" && !manage) {
          if (action === "save")
            await recordAuditLog(dependencies.auditLogging, {
              organization_id: auth.access.organization_id,
              actor_user_id: auth.member.member_id,
              actor_type: resolveAuditActorType(request.headers),
              action: "public_status_page.update",
              target_type: "project",
              target_id: params.data.id,
              status: "failure",
              ip_address: request.ip,
              metadata: { reason: "forbidden" }
            });
          return reply.status(403).send({ error: "forbidden" });
        }
        if (!dependencies.publicStatusPages)
          return reply.status(404).send({ error: "status_pages_unavailable" });
        const scope = {
          project_id: params.data.id,
          organization_id: auth.access.organization_id,
          owner_user_id: auth.access.owner_user_id
        };
        try {
          if (action === "options") {
            const query = PublicStatusOptionsQuerySchema.safeParse(request.query);
            if (!query.success) return reply.status(400).send({ error: "invalid_query" });
            return reply.send(
              PublicStatusOptionsSchema.parse(
                await dependencies.publicStatusPages.listOptions(scope, query.data)
              )
            );
          }
          if (action === "preview") {
            const page = await dependencies.publicStatusPages.preview(scope);
            return page
              ? reply.send(PublicStatusPageSchema.parse(page))
              : reply.status(404).send({ error: "status_page_not_found" });
          }
          let result;
          if (action === "save") {
            const body = PublicStatusSettingsSchema.safeParse(request.body);
            if (!body.success) {
              await recordAuditLog(dependencies.auditLogging, {
                organization_id: scope.organization_id,
                actor_user_id: auth.member.member_id,
                actor_type: resolveAuditActorType(request.headers),
                action: "public_status_page.update",
                target_type: "project",
                target_id: scope.project_id,
                status: "failure",
                ip_address: request.ip,
                metadata: { reason: "invalid_payload" }
              });
              return reply.status(400).send({ error: "invalid_payload" });
            }
            result = await dependencies.publicStatusPages.saveSettings(
              { ...scope, owner_user_id: auth.member.member_id },
              body.data
            );
            await recordAuditLog(dependencies.auditLogging, {
              organization_id: scope.organization_id,
              actor_user_id: auth.member.member_id,
              actor_type: resolveAuditActorType(request.headers),
              action: "public_status_page.update",
              target_type: "project",
              target_id: scope.project_id,
              status: "success",
              ip_address: request.ip,
              metadata: {
                enabled: body.data.enabled,
                project_count: body.data.projects.length,
                check_count: body.data.projects.reduce((n, p) => n + p.check_ids.length, 0)
              }
            });
          } else result = await dependencies.publicStatusPages.getSettings(scope);
          const visible = manage
            ? result
            : {
                public_id: result.settings.enabled ? result.public_id : null,
                settings: {
                  title: result.settings.enabled
                    ? sanitizePublicStatusText(result.settings.title)
                    : "Public status page",
                  enabled: result.settings.enabled,
                  projects: [{ project_id: scope.project_id, check_ids: [] }]
                }
              };
          return reply.send(
            PublicStatusManagementSchema.parse({
              ...visible,
              access_mode: manage ? "manage" : "preview",
              public_url:
                visible.public_id === null
                  ? null
                  : publicStatusUrl(
                      dependencies.publicStatusBaseUrl ?? "https://app.debugbundle.com/status",
                      visible.public_id
                    )
            })
          );
        } catch (error) {
          if (action === "save")
            await recordAuditLog(dependencies.auditLogging, {
              organization_id: scope.organization_id,
              actor_user_id: auth.member.member_id,
              actor_type: resolveAuditActorType(request.headers),
              action: "public_status_page.update",
              target_type: "project",
              target_id: scope.project_id,
              status: "failure",
              ip_address: request.ip,
              metadata: { reason: error instanceof PublicStatusError ? error.code : "unavailable" }
            });
          if (error instanceof PublicStatusError)
            return reply.status(error.code === "not_found" ? 404 : 400).send({
              error:
                error.code === "not_found" ? "status_page_not_found" : "invalid_status_selection"
            });
          return reply.status(500).send({ error: "status_page_unavailable" });
        }
      }
    });
  }
}
