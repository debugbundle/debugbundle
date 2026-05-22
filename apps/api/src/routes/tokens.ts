import type { FastifyInstance } from "fastify";

import { generateMemberToken, generateProjectToken } from "../../../../packages/auth/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";
import {
  enforceRequestRateLimit,
  requireMemberAuth,
  requireRateLimitedMemberAuth,
  requireRateLimitedProjectAccess,
  resolveBrowserSession,
} from "../api-helpers.js";
import {
  ProjectParamsSchema,
  ProjectTokenParamsSchema,
  MemberTokenParamsSchema,
  TokenListQuerySchema,
  CreateProjectTokenBodySchema,
  CreateTokenBodySchema,
} from "../schemas.js";
import { normalizeProjectTokenAllowedOrigins } from "../project-token-origins.js";

function serializeProjectToken<T extends { allowed_origins?: string[] }>(token: T): T & { allowed_origins: string[] } {
  return {
    ...token,
    allowed_origins: token.allowed_origins ?? []
  };
}

export function registerTokenRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.get("/v1/projects/:id/tokens", async (request, reply) => {
    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({
        error: "invalid_project_id"
      });
    }

    const parsedQuery = TokenListQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({
        error: "invalid_query"
      });
    }

    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-read",
      projectId: parsedParams.data.id
    });
    if (auth === null) {
      return;
    }

    const tokens = await dependencies.tokenManagement.listProjectTokensForOrganization({
      organization_id: auth.access.organization_id,
      project_id: parsedParams.data.id,
      limit: parsedQuery.data.limit
    });

    if (tokens === null) {
      return reply.status(404).send({
        error: "project_not_found"
      });
    }

    return reply.status(200).send({ tokens: tokens.map(serializeProjectToken) });
  });

  app.post("/v1/projects/:id/tokens", async (request, reply) => {
    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({
        error: "invalid_project_id"
      });
    }

    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-write",
      projectId: parsedParams.data.id
    });
    if (auth === null) {
      return;
    }
    if (auth.access.effective_role !== "owner" && auth.access.effective_role !== "admin") {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsedBody = CreateProjectTokenBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload"
      });
    }

    const allowedOrigins = normalizeProjectTokenAllowedOrigins(parsedBody.data.allowed_origins ?? []);
    if (allowedOrigins === null) {
      return reply.status(400).send({
        error: "invalid_allowed_origins"
      });
    }

    const generated = generateProjectToken(parsedParams.data.id);
    const created = await dependencies.tokenManagement.createProjectTokenForOrganization({
      organization_id: auth.access.organization_id,
      project_id: parsedParams.data.id,
      label: parsedBody.data.label,
      allowed_origins: allowedOrigins,
      token_hash: generated.hash
    });

    if (created === null) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "token.project.create",
        target_type: "project_token",
        target_id: null,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          project_id: parsedParams.data.id,
          label: parsedBody.data.label,
          reason: "project_not_found"
        }
      });

      return reply.status(404).send({
        error: "project_not_found"
      });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: auth.access.organization_id,
      actor_user_id: auth.member.member_id,
      actor_type: resolveAuditActorType(request.headers),
      action: "token.project.create",
      target_type: "project_token",
      target_id: created.token_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        project_id: created.project_id,
        label: created.label
      }
    });

    return reply.status(201).send({
      token: {
        ...created,
        allowed_origins: created.allowed_origins ?? [],
        plaintext: generated.plaintext
      }
    });
  });

  app.post("/v1/projects/:id/tokens/:tokenId/revoke", async (request, reply) => {
    const parsedParams = ProjectTokenParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({
        error: "invalid_token_id"
      });
    }

    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-write",
      projectId: parsedParams.data.id
    });
    if (auth === null) {
      return;
    }
    if (auth.access.effective_role !== "owner" && auth.access.effective_role !== "admin") {
      return reply.status(403).send({ error: "forbidden" });
    }

    const revoked = await dependencies.tokenManagement.revokeProjectTokenForOrganization({
      organization_id: auth.access.organization_id,
      project_id: parsedParams.data.id,
      token_id: parsedParams.data.tokenId,
      revoked_at: new Date().toISOString()
    });

    if (revoked === null) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: auth.access.organization_id,
        actor_user_id: auth.member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "token.project.revoke",
        target_type: "project_token",
        target_id: parsedParams.data.tokenId,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          project_id: parsedParams.data.id,
          reason: "token_not_found"
        }
      });

      return reply.status(404).send({
        error: "token_not_found"
      });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: auth.access.organization_id,
      actor_user_id: auth.member.member_id,
      actor_type: resolveAuditActorType(request.headers),
      action: "token.project.revoke",
      target_type: "project_token",
      target_id: revoked.token_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        project_id: revoked.project_id,
        label: revoked.label
      }
    });

    return reply.status(200).send({ token: serializeProjectToken(revoked) });
  });

  app.get("/v1/member/tokens", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "management-read");
    if (member === null) {
      return;
    }

    const parsedQuery = TokenListQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({
        error: "invalid_query"
      });
    }

    const tokens = await dependencies.tokenManagement.listMemberTokensForOrganization({
      organization_id: member.organization_id,
      user_id: member.member_id,
      limit: parsedQuery.data.limit
    });

    return reply.status(200).send({ tokens });
  });

  app.post("/v1/member/tokens", async (request, reply) => {
    const browserSession =
      request.headers.authorization === undefined
        ? await resolveBrowserSession(request.headers.cookie, dependencies)
        : null;
    const member =
      browserSession !== null
        ? {
            member_id: browserSession.user_id,
            organization_id: browserSession.organization_id
          }
        : await requireMemberAuth(request.headers, dependencies);
    if (member === null) {
      return reply.status(401).send({
        error: "invalid_member_token"
      });
    }

    if (
      !(await enforceRequestRateLimit(request, reply, dependencies, {
        bucket: "management-write",
        subject: `member:${member.member_id}`
      }))
    ) {
      return;
    }

    const parsedBody = CreateTokenBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload"
      });
    }

    if (browserSession?.email_verified_at === null) {
      const existingTokens = await dependencies.tokenManagement.listMemberTokensForOrganization({
        organization_id: member.organization_id,
        user_id: member.member_id,
        limit: 1
      });

      if (existingTokens.length === 0) {
        await recordAuditLog(dependencies.auditLogging, {
          organization_id: member.organization_id,
          actor_user_id: member.member_id,
          actor_type: browserSession !== null ? "browser_session" : "member_token",
          action: "token.member.create",
          target_type: "member_token",
          target_id: null,
          status: "failure",
          ip_address: request.ip,
          metadata: {
            label: parsedBody.data.label,
            reason: "email_verification_required"
          }
        });

        return reply.status(403).send({
          error: "email_verification_required"
        });
      }
    }

    const generated = generateMemberToken(member.member_id);
    const created = await dependencies.tokenManagement.createMemberTokenForOrganization({
      organization_id: member.organization_id,
      user_id: member.member_id,
      label: parsedBody.data.label,
      token_hash: generated.hash
    });

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: member.organization_id,
      actor_user_id: member.member_id,
      actor_type: browserSession !== null ? "browser_session" : "member_token",
      action: "token.member.create",
      target_type: "member_token",
      target_id: created.token_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        label: created.label
      }
    });

    return reply.status(201).send({
      token: {
        ...created,
        plaintext: generated.plaintext
      }
    });
  });

  app.post("/v1/member/tokens/:tokenId/revoke", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }

    const parsedParams = MemberTokenParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({
        error: "invalid_token_id"
      });
    }

    const revoked = await dependencies.tokenManagement.revokeMemberTokenForOrganization({
      organization_id: member.organization_id,
      user_id: member.member_id,
      token_id: parsedParams.data.tokenId,
      revoked_at: new Date().toISOString()
    });

    if (revoked === null) {
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: member.organization_id,
        actor_user_id: member.member_id,
        actor_type: resolveAuditActorType(request.headers),
        action: "token.member.revoke",
        target_type: "member_token",
        target_id: parsedParams.data.tokenId,
        status: "failure",
        ip_address: request.ip,
        metadata: {
          reason: "token_not_found"
        }
      });

      return reply.status(404).send({
        error: "token_not_found"
      });
    }

    await recordAuditLog(dependencies.auditLogging, {
      organization_id: member.organization_id,
      actor_user_id: member.member_id,
      actor_type: resolveAuditActorType(request.headers),
      action: "token.member.revoke",
      target_type: "member_token",
      target_id: revoked.token_id,
      status: "success",
      ip_address: request.ip,
      metadata: {
        label: revoked.label
      }
    });

    return reply.status(200).send({ token: revoked });
  });
}
