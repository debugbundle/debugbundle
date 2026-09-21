import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedProjectAccess } from "../api-helpers.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";

const ProjectId = z.object({ id: z.string().uuid() });
const TokenId = ProjectId.extend({ tokenId: z.string().uuid() });
const CreateBody = z.object({
  label: z.string().trim().min(1).max(120),
  expires_at: z.string().datetime().optional()
}).strict();
const DAY_MS = 86_400_000;

export function registerAgentTokenRoutes(app: FastifyInstance, dependencies: ApiDependencies, issuanceEnabled = false): void {
  app.get("/v1/projects/:id/agent-tokens", async (request, reply) => {
    const params = ProjectId.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_project_id" });
    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-read", projectId: params.data.id
    });
    if (auth === null) return;
    if (auth.access.effective_role !== "owner" && auth.access.effective_role !== "admin") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.agentTokens === undefined) return reply.status(503).send({ error: "agent_tokens_unavailable" });
    const tokens = await dependencies.agentTokens.list({ projectId: params.data.id, actorUserId: auth.member.member_id });
    return tokens === null
      ? reply.status(404).send({ error: "project_not_found" })
      : reply.send({ tokens });
  });

  app.post("/v1/projects/:id/agent-tokens", async (request, reply) => {
    const params = ProjectId.safeParse(request.params);
    const body = CreateBody.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: "invalid_payload" });
    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-write", projectId: params.data.id
    });
    if (auth === null) return;
    if (auth.access.effective_role !== "owner" && auth.access.effective_role !== "admin") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (!issuanceEnabled) return reply.status(503).send({ error: "agent_token_issuance_unavailable" });
    if (dependencies.agentTokens === undefined) return reply.status(503).send({ error: "agent_tokens_unavailable" });
    const now = Date.now();
    const expiresAt = body.data.expires_at ?? new Date(now + 30 * DAY_MS).toISOString();
    const lifetime = Date.parse(expiresAt) - now;
    if (!Number.isFinite(lifetime) || lifetime <= 0 || lifetime > 90 * DAY_MS) {
      return reply.status(400).send({ error: "invalid_expiry" });
    }
    const created = await dependencies.agentTokens.create({
      projectId: params.data.id, actorUserId: auth.member.member_id,
      label: body.data.label, expiresAt
    });
    if (created !== null) await recordAuditLog(dependencies.auditLogging, {
      organization_id: auth.access.organization_id, actor_user_id: auth.member.member_id,
      actor_type: resolveAuditActorType(request.headers), action: "token.agent.create",
      target_type: "agent_token", target_id: created.token_id, status: "success",
      ip_address: request.ip, metadata: { project_id: params.data.id, expires_at: created.expires_at }
    });
    return created === null
      ? reply.status(404).send({ error: "project_not_found" })
      : reply.header("Cache-Control", "no-store").status(201).send({ token: created });
  });

  app.post("/v1/projects/:id/agent-tokens/:tokenId/revoke", async (request, reply) => {
    const params = TokenId.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_token_id" });
    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-write", projectId: params.data.id
    });
    if (auth === null) return;
    if (auth.access.effective_role !== "owner" && auth.access.effective_role !== "admin") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.agentTokens === undefined) return reply.status(503).send({ error: "agent_tokens_unavailable" });
    const revoked = await dependencies.agentTokens.revoke({
      projectId: params.data.id, actorUserId: auth.member.member_id, tokenId: params.data.tokenId
    });
    if (revoked !== null) await recordAuditLog(dependencies.auditLogging, {
      organization_id: auth.access.organization_id, actor_user_id: auth.member.member_id,
      actor_type: resolveAuditActorType(request.headers), action: "token.agent.revoke",
      target_type: "agent_token", target_id: revoked.token_id, status: "success",
      ip_address: request.ip, metadata: { project_id: params.data.id }
    });
    return revoked === null
      ? reply.status(404).send({ error: "agent_token_not_found" })
      : reply.send({ token: revoked });
  });
}
