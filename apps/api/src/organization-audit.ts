import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ApiDependencies } from "./api-types.js";
import { requireRequestMemberAuth } from "./api-helpers.js";
import { recordAuditLog, resolveAuditActorType } from "./audit-logging.js";

const targets = new WeakMap<FastifyRequest, string>();
export function setOrganizationAuditTarget(request: FastifyRequest, organizationId: string): void {
  targets.set(request, organizationId);
}
const operations: Record<string, string> = {
  "POST /v1/organizations/switch": "organization.session.switch",
  "PATCH /v1/organizations/:id/people/:userId": "organization.person.update",
  "DELETE /v1/organizations/:id/people/:userId": "organization.person.remove",
  "POST /v1/organizations/:id/invites": "organization.invite.create",
  "POST /v1/organizations/:id/invites/:inviteId/resend": "organization.invite.resend",
  "DELETE /v1/organizations/:id/invites/:inviteId": "organization.invite.cancel",
  "POST /v1/organizations/invites/accept": "organization.invite.accept",
  "POST /v1/organizations/:id/ownership-transfer": "organization.ownership.request",
  "DELETE /v1/organizations/:id/ownership-transfer": "organization.ownership.cancel",
  "POST /v1/organizations/ownership-transfer/accept": "organization.ownership.accept"
};

/** Metadata-only audit also covers failures rejected before the route handler. */
export function registerOrganizationAudit(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  app.addHook("onResponse", async (request, reply) => {
    const action = operations[`${request.method} ${request.routeOptions.url}`];
    if (action === undefined || dependencies.auditLogging === undefined) return;
    try {
      const actor = await requireRequestMemberAuth(request, dependencies);
      const params = z
        .object({
          id: z.uuid().optional(),
          userId: z.uuid().optional(),
          inviteId: z.uuid().optional()
        })
        .safeParse(request.params);
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: targets.get(request) ?? (params.success ? (params.data.id ?? null) : null),
        actor_user_id: actor?.member_id ?? null,
        actor_type: actor === null ? "anonymous" : resolveAuditActorType(request.headers),
        action,
        target_type: "organization",
        target_id: params.success
          ? (params.data.userId ?? params.data.inviteId ?? params.data.id ?? null)
          : null,
        status: reply.statusCode < 400 ? "success" : "failure",
        ip_address: request.ip,
        metadata: { status_code: reply.statusCode }
      });
    } catch {
      request.log.warn("organization_audit_context_unavailable");
    }
  });
}
