import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  generateOrganizationAccessToken,
  hashToken,
  ORGANIZATION_INVITE_TOKEN_PREFIX,
  OWNERSHIP_TRANSFER_TOKEN_PREFIX,
  readCookieValue,
  SESSION_COOKIE_NAME
} from "../../../../packages/auth/src/index.js";
import {
  OrganizationInviteBodySchema,
  type OrganizationInvite,
  OrganizationMemberUpdateSchema
} from "../../../../packages/shared-types/src/index.js";
import {
  OrganizationManagementError,
  type OrganizationActor
} from "../../../../packages/storage/src/organization-management-types.js";
import type { ApiDependencies } from "../api-types.js";
import type { ResolveMemberResult } from "../../../../packages/storage/src/index.js";
import {
  enforceOrganizationInvitationRateLimit,
  requireRateLimitedMemberAuth,
  resolveBrowserSession
} from "../api-helpers.js";
import { isProjectConsolidationDatabaseError } from "../project-consolidation-http.js";
import { memberReadScope } from "../member-access-scope.js";
import { registerOrganizationAudit, setOrganizationAuditTarget } from "../organization-audit.js";

type OrganizationRequestContext = {
  member: ResolveMemberResult;
  store: NonNullable<ApiDependencies["organizationManagement"]>;
  actor: OrganizationActor;
};

const orgParams = z.object({ id: z.uuid() });
const personParams = orgParams.extend({ userId: z.uuid() });
const inviteParams = orgParams.extend({ inviteId: z.uuid() });
const tokenBody = z.object({ token: z.string().min(20).max(200) }).strict();
const switchBody = z.object({ organization_id: z.uuid() }).strict();
const transferBody = z.object({ recipient_user_id: z.uuid() }).strict();

function guarded(handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return await handler(request, reply);
    } catch (error) {
      if (isProjectConsolidationDatabaseError(error)) throw error;
      if (error instanceof OrganizationManagementError) {
        const status =
          error.code === "not_found"
            ? 404
            : ["people_limit_reached", "invite_exists", "ownership_transfer_unavailable"].includes(
                  error.code
                )
              ? 409
              : ["invalid_invite", "invalid_project_scope"].includes(error.code)
                ? 400
                : 403;
        return reply.status(status).send({ error: error.code });
      }
      request.log.error("organization_management_failed");
      return reply.status(500).send({ error: "organization_management_failed" });
    }
  };
}

export function registerOrganizationRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  registerOrganizationAudit(app, dependencies);
  async function manager(
    request: FastifyRequest,
    reply: FastifyReply,
    write: boolean
  ): Promise<OrganizationRequestContext | null> {
    const member = await requireRateLimitedMemberAuth(
      request,
      reply,
      dependencies,
      write ? "management-write" : "management-read"
    );
    if (member === null) return null;
    const params = orgParams.safeParse(request.params);
    if (!params.success) {
      await reply.status(400).send({ error: "invalid_organization_id" });
      return null;
    }
    const inherited = memberReadScope(member).include_organization_grants === true;
    const policy = member.token_policy;
    if (
      (member.role !== "owner" && !(member.role === "admin" && inherited)) ||
      (policy !== undefined &&
        (policy.mode !== "organization" ||
          policy.organization_id !== params.data.id ||
          !policy.permissions.includes("organization:admin")))
    ) {
      await reply.status(403).send({ error: "forbidden" });
      return null;
    }
    const store = dependencies.organizationManagement;
    if (store === undefined) {
      await reply.status(404).send({ error: "organization_management_unavailable" });
      return null;
    }
    const actor: OrganizationActor = {
      organization_id: params.data.id,
      actor_user_id: member.member_id,
      ...(inherited ? { include_organization_grants: true } : {})
    };
    return { member, store, actor };
  }
  async function browser(
    request: FastifyRequest,
    reply: FastifyReply,
    verified: boolean
  ): ReturnType<typeof resolveBrowserSession> {
    const member = await requireRateLimitedMemberAuth(
      request,
      reply,
      dependencies,
      "management-write"
    );
    if (member === null) return null;
    const session =
      request.headers.authorization === undefined
        ? await resolveBrowserSession(request.headers.cookie, dependencies)
        : null;
    if (session === null || (verified && session.email_verified_at === null)) {
      await reply.status(403).send({ error: "interactive_verification_required" });
      return null;
    }
    return session;
  }
  async function deliverInvitation(
    context: OrganizationRequestContext,
    invite: OrganizationInvite,
    plaintext: string,
    reply: FastifyReply,
    status: 200 | 201
  ): Promise<FastifyReply> {
    const organizations = await context.store.listOrganizationsForUser(context.member.member_id);
    try {
      await dependencies.organizationEmails!.send({
        kind: "invite",
        email: invite.email,
        token: plaintext,
        organization_name:
          organizations.find((org) => org.organization_id === invite.organization_id)?.name ??
          "your DebugBundle organisation",
        sender_name: context.member.email ?? "An organisation administrator",
        access_summary:
          invite.role === "admin"
            ? "Organisation Admin access to current and future projects."
            : `${invite.default_project_role === "viewer" ? "Read-only" : "Member"} access to ${invite.project_access === "all" ? "current and future projects" : "selected projects"}.`
      });
    } catch {
      return reply.status(503).send({ error: "organization_invite_delivery_failed", invite });
    }
    return reply.status(status).send({ invite });
  }
  app.get(
    "/v1/organizations",
    guarded(async (request, reply) => {
      const member = await requireRateLimitedMemberAuth(
        request,
        reply,
        dependencies,
        "management-read"
      );
      if (member === null) return;
      if (dependencies.organizationManagement === undefined)
        return reply.status(404).send({ error: "organization_management_unavailable" });
      let organizations = await dependencies.organizationManagement.listOrganizationsForUser(
        member.member_id
      );
      const policy = member.token_policy;
      if (policy !== undefined)
        organizations = organizations.filter(
          (org) => policy.mode === "organization" && org.organization_id === policy.organization_id
        );
      return reply.send({ organizations });
    })
  );
  app.post(
    "/v1/organizations/switch",
    guarded(async (request, reply) => {
      const session = await browser(request, reply, false);
      if (session === null) return;
      const parsed = switchBody.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: "invalid_payload" });
      setOrganizationAuditTarget(request, parsed.data.organization_id);
      const token = readCookieValue(request.headers.cookie, SESSION_COOKIE_NAME);
      if (token === null || dependencies.organizationManagement === undefined)
        return reply.status(404).send({ error: "organization_management_unavailable" });
      const switched = await dependencies.organizationManagement.switchSessionOrganization({
        user_id: session.user_id,
        organization_id: parsed.data.organization_id,
        session_token_hash: hashToken(token)
      });
      return switched
        ? reply.send({ organization_id: parsed.data.organization_id })
        : reply.status(403).send({ error: "forbidden" });
    })
  );
  app.get(
    "/v1/organizations/:id/people",
    guarded(async (request, reply) => {
      const context = await manager(request, reply, false);
      if (context === null) return;
      return reply.send({ people: await context.store.listOrganizationPeople(context.actor) });
    })
  );
  app.patch(
    "/v1/organizations/:id/people/:userId",
    guarded(async (request, reply) => {
      const context = await manager(request, reply, true);
      if (context === null) return;
      const params = personParams.safeParse(request.params),
        body = OrganizationMemberUpdateSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send({ error: "invalid_payload" });
      await context.store.updateOrganizationPerson({
        ...context.actor,
        user_id: params.data.userId,
        changes: body.data
      });
      return reply.send({ updated: true });
    })
  );
  app.delete(
    "/v1/organizations/:id/people/:userId",
    guarded(async (request, reply) => {
      const context = await manager(request, reply, true);
      if (context === null) return;
      const params = personParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "invalid_user_id" });
      await context.store.removeOrganizationPerson({
        ...context.actor,
        user_id: params.data.userId
      });
      return reply.send({ removed: true });
    })
  );
  app.get(
    "/v1/organizations/:id/invites",
    guarded(async (request, reply) => {
      const context = await manager(request, reply, false);
      if (context === null) return;
      return reply.send({ invites: await context.store.listOrganizationInvites(context.actor) });
    })
  );
  app.post(
    "/v1/organizations/:id/invites",
    guarded(async (request, reply) => {
      const context = await manager(request, reply, true);
      if (context === null) return;
      const body = OrganizationInviteBodySchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: "invalid_payload" });
      if (dependencies.organizationEmails === undefined)
        return reply.status(503).send({ error: "organization_email_unavailable" });
      if (
        !(await enforceOrganizationInvitationRateLimit(
          request,
          reply,
          dependencies,
          context.actor.organization_id
        ))
      )
        return;
      const token = generateOrganizationAccessToken("invite");
      const invite = await context.store.createOrganizationInvite({
        ...context.actor,
        ...body.data,
        invite_token_hash: token.hash,
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString()
      });
      return deliverInvitation(context, invite, token.plaintext, reply, 201);
    })
  );
  app.post(
    "/v1/organizations/:id/invites/:inviteId/resend",
    guarded(async (request, reply) => {
      const context = await manager(request, reply, true);
      if (context === null) return;
      const params = inviteParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "invalid_invite_id" });
      if (dependencies.organizationEmails === undefined)
        return reply.status(503).send({ error: "organization_email_unavailable" });
      if (
        !(await enforceOrganizationInvitationRateLimit(
          request,
          reply,
          dependencies,
          context.actor.organization_id
        ))
      )
        return;
      const token = generateOrganizationAccessToken("invite");
      const invite = await context.store.refreshOrganizationInvite({
        ...context.actor,
        invite_id: params.data.inviteId,
        invite_token_hash: token.hash,
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString()
      });
      return deliverInvitation(context, invite, token.plaintext, reply, 200);
    })
  );
  app.delete(
    "/v1/organizations/:id/invites/:inviteId",
    guarded(async (request, reply) => {
      const context = await manager(request, reply, true);
      if (context === null) return;
      const params = inviteParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "invalid_invite_id" });
      return (await context.store.cancelOrganizationInvite({
        ...context.actor,
        invite_id: params.data.inviteId
      }))
        ? reply.send({ canceled: true })
        : reply.status(404).send({ error: "not_found" });
    })
  );
  app.post(
    "/v1/organizations/invites/accept",
    guarded(async (request, reply) => {
      const session = await browser(request, reply, true);
      if (session === null) return;
      const body = tokenBody.safeParse(request.body);
      if (!body.success || !body.data.token.startsWith(ORGANIZATION_INVITE_TOKEN_PREFIX))
        return reply.status(400).send({ error: "invalid_invite" });
      if (dependencies.organizationManagement === undefined)
        return reply.status(404).send({ error: "organization_management_unavailable" });
      const accepted = await dependencies.organizationManagement.acceptOrganizationInvite({
        user_id: session.user_id,
        invite_token_hash: hashToken(body.data.token),
        now: new Date().toISOString()
      });
      setOrganizationAuditTarget(request, accepted.organization_id);
      return reply.send(accepted);
    })
  );
  app.get(
    "/v1/organizations/:id/ownership-transfer",
    guarded(async (request, reply) => {
      const context = await manager(request, reply, false);
      if (context === null) return;
      return reply.send({
        transfer: await context.store.getOrganizationOwnershipTransfer(context.actor)
      });
    })
  );
  app.delete(
    "/v1/organizations/:id/ownership-transfer",
    guarded(async (request, reply) => {
      const session = await browser(request, reply, true);
      if (session === null) return;
      const context = await manager(request, reply, true);
      if (context === null) return;
      return reply.send({
        canceled: await context.store.cancelOrganizationOwnershipTransfer(context.actor)
      });
    })
  );
  app.post(
    "/v1/organizations/:id/ownership-transfer",
    guarded(async (request, reply) => {
      const session = await browser(request, reply, true);
      if (session === null) return;
      const context = await manager(request, reply, true);
      if (context === null) return;
      if (context.member.role !== "owner") return reply.status(403).send({ error: "forbidden" });
      const body = transferBody.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: "invalid_payload" });
      if (dependencies.organizationEmails === undefined)
        return reply.status(503).send({ error: "organization_email_unavailable" });
      const recipient = (await context.store.listOrganizationPeople(context.actor)).find(
        (person) => person.user_id === body.data.recipient_user_id
      );
      if (recipient === undefined) return reply.status(404).send({ error: "not_found" });
      if (
        !(await enforceOrganizationInvitationRateLimit(
          request,
          reply,
          dependencies,
          context.actor.organization_id
        ))
      )
        return;
      const token = generateOrganizationAccessToken("ownership_transfer");
      const transfer = await context.store.requestOrganizationOwnershipTransfer({
        ...context.actor,
        recipient_user_id: recipient.user_id,
        accept_token_hash: token.hash,
        expires_at: new Date(Date.now() + 2 * 86_400_000).toISOString()
      });
      const organizations = await context.store.listOrganizationsForUser(session.user_id);
      try {
        await dependencies.organizationEmails.send({
          kind: "ownership_transfer",
          email: recipient.email,
          token: token.plaintext,
          organization_name:
            organizations.find((org) => org.organization_id === context.actor.organization_id)
              ?.name ?? "your DebugBundle organisation",
          sender_name: session.email
        });
      } catch {
        return reply.status(503).send({ error: "ownership_transfer_delivery_failed", transfer });
      }
      return reply.status(201).send({ transfer });
    })
  );
  app.post(
    "/v1/organizations/ownership-transfer/accept",
    guarded(async (request, reply) => {
      const session = await browser(request, reply, true);
      if (session === null) return;
      const body = tokenBody.safeParse(request.body);
      if (!body.success || !body.data.token.startsWith(OWNERSHIP_TRANSFER_TOKEN_PREFIX))
        return reply.status(400).send({ error: "ownership_transfer_unavailable" });
      if (dependencies.organizationManagement === undefined)
        return reply.status(404).send({ error: "organization_management_unavailable" });
      const accepted =
        await dependencies.organizationManagement.acceptOrganizationOwnershipTransfer({
          user_id: session.user_id,
          accept_token_hash: hashToken(body.data.token),
          now: new Date().toISOString()
        });
      setOrganizationAuditTarget(request, accepted.organization_id);
      return reply.send(accepted);
    })
  );
}
