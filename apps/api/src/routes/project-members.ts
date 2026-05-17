import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { generateProjectInviteToken } from "../../../../packages/auth/src/index.js";
import type { ProjectAccessRecord, ResolveMemberResult } from "../../../../packages/storage/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { buildProjectMemberAvatarUrl } from "../avatar-urls.js";
import { requireRateLimitedMemberAuth, resolveBrowserSession } from "../api-helpers.js";
import {
  CreateProjectInviteBodySchema,
  ProjectInviteParamsSchema,
  ProjectMemberParamsSchema,
  ProjectParamsSchema,
  UpdateProjectMemberRoleBodySchema
} from "../schemas.js";

const INVITE_LIFETIME_MS = 1000 * 60 * 60 * 24 * 7;

function toPublicProjectMember(
  projectId: string,
  member: {
    user_id: string;
    email: string;
    role: "owner" | "admin" | "member";
    membership_type: "owner" | "collaborator";
    created_at: string;
    avatar_object_key?: string | null;
  }
): {
  user_id: string;
  email: string;
  role: "owner" | "admin" | "member";
  membership_type: "owner" | "collaborator";
  created_at: string;
  avatar_url: string | null;
} {
  const { avatar_object_key, ...publicMember } = member;

  return {
    ...publicMember,
    avatar_url:
      avatar_object_key === null || avatar_object_key === undefined
        ? null
        : buildProjectMemberAvatarUrl(projectId, member.user_id)
  };
}

export function registerProjectMemberRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  async function requireProjectAccess(input: {
    request: FastifyRequest;
    reply: FastifyReply;
    projectId: string;
    bucket: "management-read" | "management-write";
  }): Promise<{ member: ResolveMemberResult; access: ProjectAccessRecord } | null> {
    const member = await requireRateLimitedMemberAuth(input.request, input.reply, dependencies, input.bucket);
    if (member === null) {
      return null;
    }
    if (dependencies.projectManagement?.resolveProjectAccessForUser === undefined) {
      input.reply.status(404).send({ error: "project_not_found" });
      return null;
    }

    const access = await dependencies.projectManagement.resolveProjectAccessForUser({
      user_id: member.member_id,
      project_id: input.projectId
    });
    if (access === null) {
      input.reply.status(404).send({ error: "project_not_found" });
      return null;
    }

    return {
      member,
      access
    };
  }

  app.get("/v1/projects/:id/members", async (request, reply) => {
    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_project_id" });
    }

    const auth = await requireProjectAccess({
      request,
      reply,
      projectId: parsedParams.data.id,
      bucket: "management-read"
    });
    if (auth === null) {
      return;
    }
    if (auth.access.effective_role !== "owner" && auth.access.effective_role !== "admin") {
      return reply.status(403).send({ error: "forbidden" });
    }
    const projectCollaboration = dependencies.projectCollaboration;
    if (projectCollaboration === undefined || projectCollaboration.listMembersForProject === undefined) {
      return reply.status(404).send({ error: "member_management_not_available" });
    }

    const listed = await projectCollaboration.listMembersForProject({
      project_id: parsedParams.data.id,
      user_id: auth.member.member_id
    });
    if (listed === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    return reply.status(200).send({
      members: listed.members.map((member) => toPublicProjectMember(parsedParams.data.id, member))
    });
  });

  app.get("/v1/projects/:id/members/:userId/avatar", async (request, reply) => {
    const parsedParams = ProjectMemberParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_member_id" });
    }

    const auth = await requireProjectAccess({
      request,
      reply,
      projectId: parsedParams.data.id,
      bucket: "management-read"
    });
    if (auth === null) {
      return;
    }
    if (auth.access.effective_role !== "owner" && auth.access.effective_role !== "admin") {
      return reply.status(403).send({ error: "forbidden" });
    }

    const projectCollaboration = dependencies.projectCollaboration;
    if (
      projectCollaboration === undefined ||
      projectCollaboration.listMembersForProject === undefined ||
      dependencies.accountManagement === undefined
    ) {
      return reply.status(503).send({ error: "account_management_not_configured" });
    }

    const listed = await projectCollaboration.listMembersForProject({
      project_id: parsedParams.data.id,
      user_id: auth.member.member_id
    });
    if (listed === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    const member = listed.members.find((candidate) => candidate.user_id === parsedParams.data.userId);
    if (member === undefined) {
      return reply.status(404).send({ error: "member_not_found" });
    }

    const avatar = await dependencies.accountManagement.getUserAvatar({
      user_id: parsedParams.data.userId
    });
    if (avatar === null) {
      return reply.status(404).send({ error: "avatar_not_found" });
    }

    const body = await dependencies.objectStoreReader.getObject({
      key: avatar.object_key
    }).catch(() => null);
    if (body === null) {
      return reply.status(404).send({ error: "avatar_not_found" });
    }

    reply.header("Cache-Control", "private, max-age=300");
    reply.header("Content-Type", avatar.content_type);
    return reply.status(200).send(body);
  });

  app.get("/v1/projects/:id/invites", async (request, reply) => {
    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_project_id" });
    }

    const auth = await requireProjectAccess({
      request,
      reply,
      projectId: parsedParams.data.id,
      bucket: "management-read"
    });
    if (auth === null) {
      return;
    }
    if (auth.access.effective_role !== "owner" && auth.access.effective_role !== "admin") {
      return reply.status(403).send({ error: "forbidden" });
    }
    const projectCollaboration = dependencies.projectCollaboration;
    if (projectCollaboration === undefined || projectCollaboration.listPendingInvitesForProject === undefined) {
      return reply.status(404).send({ error: "member_management_not_available" });
    }

    const invites = await projectCollaboration.listPendingInvitesForProject({
      project_id: parsedParams.data.id,
      user_id: auth.member.member_id,
      now: new Date().toISOString()
    });
    if (invites === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    return reply.status(200).send({ invites });
  });

  app.post("/v1/projects/:id/invite", async (request, reply) => {
    const browserSession =
      request.headers.authorization === undefined
        ? await resolveBrowserSession(request.headers.cookie, dependencies)
        : null;
    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_project_id" });
    }

    const auth = await requireProjectAccess({
      request,
      reply,
      projectId: parsedParams.data.id,
      bucket: "management-write"
    });
    if (auth === null) {
      return;
    }
    if (auth.access.effective_role !== "owner" && auth.access.effective_role !== "admin") {
      return reply.status(403).send({ error: "forbidden" });
    }
    const projectCollaboration = dependencies.projectCollaboration;
    if (projectCollaboration === undefined || projectCollaboration.createInviteForProject === undefined) {
      return reply.status(404).send({ error: "member_management_not_available" });
    }
    if (browserSession?.email_verified_at === null) {
      return reply.status(403).send({ error: "email_verification_required" });
    }

    const parsedBody = CreateProjectInviteBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const inviteToken = generateProjectInviteToken(auth.member.member_id);
    const result = await projectCollaboration.createInviteForProject({
      project_id: parsedParams.data.id,
      user_id: auth.member.member_id,
      email: parsedBody.data.email,
      role: parsedBody.data.role,
      invited_by_user_id: auth.member.member_id,
      invite_token_hash: inviteToken.hash,
      expires_at: new Date(Date.now() + INVITE_LIFETIME_MS).toISOString()
    });

    if (result === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }
    if (result.kind === "upgrade_required") {
      return reply.status(403).send({ error: "upgrade_required" });
    }
    if (result.kind === "collaborator_limit_reached") {
      return reply.status(409).send({ error: "collaborator_limit_reached" });
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

    await dependencies.inviteEmails?.sendProjectInviteEmail({
      email: result.invite.email,
      token: inviteToken.plaintext
    });

    return reply.status(201).send({ invite: result.invite });
  });

  app.delete("/v1/projects/:id/invites/:inviteId", async (request, reply) => {
    const browserSession =
      request.headers.authorization === undefined
        ? await resolveBrowserSession(request.headers.cookie, dependencies)
        : null;
    const parsedParams = ProjectInviteParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_invite_id" });
    }

    const auth = await requireProjectAccess({
      request,
      reply,
      projectId: parsedParams.data.id,
      bucket: "management-write"
    });
    if (auth === null) {
      return;
    }
    if (auth.access.effective_role !== "owner" && auth.access.effective_role !== "admin") {
      return reply.status(403).send({ error: "forbidden" });
    }
    const projectCollaboration = dependencies.projectCollaboration;
    if (projectCollaboration === undefined || projectCollaboration.cancelInviteForProject === undefined) {
      return reply.status(404).send({ error: "member_management_not_available" });
    }
    if (browserSession?.email_verified_at === null) {
      return reply.status(403).send({ error: "email_verification_required" });
    }

    const invite = await projectCollaboration.cancelInviteForProject({
      project_id: parsedParams.data.id,
      user_id: auth.member.member_id,
      invite_id: parsedParams.data.inviteId
    });
    if (invite === null) {
      return reply.status(404).send({ error: "invite_not_found" });
    }

    return reply.status(200).send({ invite });
  });

  app.patch("/v1/projects/:id/members/:userId", async (request, reply) => {
    const parsedParams = ProjectMemberParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_member_id" });
    }

    const auth = await requireProjectAccess({
      request,
      reply,
      projectId: parsedParams.data.id,
      bucket: "management-write"
    });
    if (auth === null) {
      return;
    }
    if (auth.access.effective_role !== "owner" && auth.access.effective_role !== "admin") {
      return reply.status(403).send({ error: "forbidden" });
    }
    const projectCollaboration = dependencies.projectCollaboration;
    if (projectCollaboration === undefined || projectCollaboration.updateProjectMemberRole === undefined) {
      return reply.status(404).send({ error: "member_management_not_available" });
    }

    const parsedBody = UpdateProjectMemberRoleBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const updated = await projectCollaboration.updateProjectMemberRole({
      project_id: parsedParams.data.id,
      actor_user_id: auth.member.member_id,
      user_id: parsedParams.data.userId,
      role: parsedBody.data.role
    });
    if (updated === null) {
      return reply.status(404).send({ error: "member_not_found" });
    }
    if (updated.kind === "owner_role_change_forbidden") {
      return reply.status(409).send({ error: "owner_role_change_not_allowed" });
    }

    return reply.status(200).send({ member: toPublicProjectMember(parsedParams.data.id, updated.member) });
  });

  app.delete("/v1/projects/:id/members/:userId", async (request, reply) => {
    const parsedParams = ProjectMemberParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_member_id" });
    }

    const auth = await requireProjectAccess({
      request,
      reply,
      projectId: parsedParams.data.id,
      bucket: "management-write"
    });
    if (auth === null) {
      return;
    }
    if (auth.access.effective_role !== "owner" && auth.access.effective_role !== "admin") {
      return reply.status(403).send({ error: "forbidden" });
    }
    const projectCollaboration = dependencies.projectCollaboration;
    if (projectCollaboration === undefined || projectCollaboration.removeProjectMember === undefined) {
      return reply.status(404).send({ error: "member_management_not_available" });
    }

    const removed = await projectCollaboration.removeProjectMember({
      project_id: parsedParams.data.id,
      actor_user_id: auth.member.member_id,
      user_id: parsedParams.data.userId
    });
    if (removed === null) {
      return reply.status(404).send({ error: "member_not_found" });
    }
    if (removed.kind === "owner_removal_forbidden") {
      return reply.status(409).send({ error: "owner_removal_not_allowed" });
    }

    return reply.status(200).send({ member: toPublicProjectMember(parsedParams.data.id, removed.member) });
  });
}
