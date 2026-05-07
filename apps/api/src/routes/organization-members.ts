import type { FastifyInstance } from "fastify";

import { generateOrganizationInviteToken } from "../../../../packages/auth/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";
import { requireRateLimitedOwnerMemberAuth, resolveBrowserSession } from "../api-helpers.js";
import {
  CreateOrganizationInviteBodySchema,
  OrganizationInviteParamsSchema,
  OrganizationMemberParamsSchema,
  UpdateOrganizationMemberRoleBodySchema
} from "../schemas.js";

const INVITE_LIFETIME_MS = 1000 * 60 * 60 * 24 * 7;

export function registerOrganizationMemberRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.get("/v1/organization/members", async (request, reply) => {
    const member = await requireRateLimitedOwnerMemberAuth(request, reply, dependencies, "management-read");
    if (member === null) {
      return;
    }
    if (member === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.organizationManagement === undefined) {
      return reply.status(404).send({ error: "member_management_not_available" });
    }

    const listed = await dependencies.organizationManagement.listMembersForOrganization({
      organization_id: member.organization_id
    });

    if (listed === null) {
      return reply.status(404).send({ error: "member_management_not_available" });
    }

    return reply.status(200).send({ members: listed.members });
  });

  app.get("/v1/organization/members/invites", async (request, reply) => {
    const member = await requireRateLimitedOwnerMemberAuth(request, reply, dependencies, "management-read");
    if (member === null) {
      return;
    }
    if (member === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.organizationManagement === undefined) {
      return reply.status(404).send({ error: "member_management_not_available" });
    }

    const invites = await dependencies.organizationManagement.listPendingInvitesForOrganization({
      organization_id: member.organization_id,
      now: new Date().toISOString()
    });

    if (invites === null) {
      return reply.status(404).send({ error: "member_management_not_available" });
    }

    return reply.status(200).send({ invites });
  });

  app.post("/v1/organization/members/invite", async (request, reply) => {
    const browserSession =
      request.headers.authorization === undefined
        ? await resolveBrowserSession(request.headers.cookie, dependencies)
        : null;
    const member = await requireRateLimitedOwnerMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (member === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.organizationManagement === undefined) {
      return reply.status(404).send({ error: "member_management_not_available" });
    }
    if (browserSession?.email_verified_at === null) {
      return reply.status(403).send({ error: "email_verification_required" });
    }

    const parsedBody = CreateOrganizationInviteBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const inviteToken = generateOrganizationInviteToken(member.member_id);

    const result = await dependencies.organizationManagement.createInviteForOrganization({
      organization_id: member.organization_id,
      email: parsedBody.data.email,
      role: parsedBody.data.role,
      invited_by_user_id: member.member_id,
      invite_token_hash: inviteToken.hash,
      expires_at: new Date(Date.now() + INVITE_LIFETIME_MS).toISOString()
    });

    if (result === null) {
      return reply.status(404).send({ error: "member_management_not_available" });
    }
    if (result.kind === "upgrade_required") {
      return reply.status(403).send({ error: "upgrade_required" });
    }
    if (result.kind === "member_exists") {
      return reply.status(409).send({ error: "member_already_exists" });
    }
    if (result.kind === "invite_exists") {
      return reply.status(409).send({ error: "invite_already_exists" });
    }
    if (result.kind !== "created") {
      return reply.status(500).send({ error: "member_management_not_available" });
    }

    await dependencies.inviteEmails?.sendOrganizationInviteEmail({
      email: result.invite.email,
      token: inviteToken.plaintext
    });

    return reply.status(201).send({ invite: result.invite });
  });

  app.delete("/v1/organization/members/invites/:inviteId", async (request, reply) => {
    const browserSession =
      request.headers.authorization === undefined
        ? await resolveBrowserSession(request.headers.cookie, dependencies)
        : null;
    const member = await requireRateLimitedOwnerMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (member === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.organizationManagement === undefined) {
      return reply.status(404).send({ error: "member_management_not_available" });
    }
    if (browserSession?.email_verified_at === null) {
      return reply.status(403).send({ error: "email_verification_required" });
    }

    const parsedParams = OrganizationInviteParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_invite_id" });
    }

    const invite = await dependencies.organizationManagement.cancelInviteForOrganization({
      organization_id: member.organization_id,
      invite_id: parsedParams.data.inviteId
    });

    if (invite === null) {
      return reply.status(404).send({ error: "invite_not_found" });
    }

    return reply.status(200).send({ invite });
  });

  app.patch("/v1/organization/members/:userId", async (request, reply) => {
    const member = await requireRateLimitedOwnerMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (member === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.organizationManagement === undefined) {
      return reply.status(404).send({ error: "member_management_not_available" });
    }

    const parsedParams = OrganizationMemberParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_member_id" });
    }

    const parsedBody = UpdateOrganizationMemberRoleBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const updated = await dependencies.organizationManagement.updateMemberRoleForOrganization({
      organization_id: member.organization_id,
      user_id: parsedParams.data.userId,
      role: parsedBody.data.role
    });

    if (updated === null) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: member.organization_id,
        actor_user_id: member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "organization.member.role.update",
        target_type: "organization_member",
        target_id: parsedParams.data.userId,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          role: parsedBody.data.role,
          reason: "member_not_found"
        }
      });

      return reply.status(404).send({ error: "member_not_found" });
    }
    if (updated.kind === "owner_role_change_forbidden") {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: member.organization_id,
        actor_user_id: member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "organization.member.role.update",
        target_type: "organization_member",
        target_id: parsedParams.data.userId,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          role: parsedBody.data.role,
          reason: "owner_role_change_not_allowed"
        }
      });

      return reply.status(409).send({ error: "owner_role_change_not_allowed" });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: member.organization_id,
      actor_user_id: member.member_id,
      actor_type: resolveAuditActorType(request.headers),
      action: "organization.member.role.update",
      target_type: "organization_member",
      target_id: updated.member.user_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        role: updated.member.role
      }
    });

    return reply.status(200).send({ member: updated.member });
  });

  app.delete("/v1/organization/members/:userId", async (request, reply) => {
    const member = await requireRateLimitedOwnerMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (member === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.organizationManagement === undefined) {
      return reply.status(404).send({ error: "member_management_not_available" });
    }

    const parsedParams = OrganizationMemberParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_member_id" });
    }

    const removed = await dependencies.organizationManagement.removeMemberFromOrganization({
      organization_id: member.organization_id,
      user_id: parsedParams.data.userId,
      revoked_at: new Date().toISOString()
    });

    if (removed === null) {
      return reply.status(404).send({ error: "member_not_found" });
    }
    if (removed.kind === "owner_removal_forbidden") {
      return reply.status(409).send({ error: "owner_removal_not_allowed" });
    }

    return reply.status(200).send({ member: removed.member });
  });
}