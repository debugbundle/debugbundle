import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { readBearerToken, validateAgentToken, type AgentTokenContext } from "../../../../packages/auth/src/index.js";
import { parseOpenAiToolInput, projectOpenAiToolOutput, type OpenAiToolName } from "../../../../packages/mcp-core/src/index.js";
import { sanitizeTelemetry } from "../../../../packages/redaction/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { enforceRequestRateLimit } from "../api-helpers.js";
import { createOpenAiHostedOperations } from "../openai-mcp-operations.js";

const ProjectParams = z.object({ id: z.string().uuid() });
const IncidentParams = ProjectParams.extend({ incidentId: z.string().uuid() });
const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).optional(), cursor: z.string().max(2048).optional() }).strict();
const POLICY = "telemetry-privacy-v1";

/** Agent credentials are never passed through member auth or a saved login fallback. */
export function registerAgentEvidenceRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  async function authorize(request: FastifyRequest, reply: FastifyReply, projectId: string): Promise<AgentTokenContext | null> {
    const header = request.headers.authorization;
    const bearer = header !== undefined && /^Bearer dbundle_agent_[A-Za-z0-9_-]+$/.test(header)
      ? readBearerToken(header) : null;
    if (bearer === null || dependencies.agentTokens === undefined) {
      await reply.status(401).send({ error: "invalid_agent_token" });
      return null;
    }
    const auth = await validateAgentToken(bearer, (hash) => dependencies.agentTokens!.resolveByTokenHash(hash));
    if (!auth.ok || auth.context.project_id !== projectId) {
      await reply.status(401).send({ error: "invalid_agent_token" });
      return null;
    }
    const access = await dependencies.projectManagement?.resolveProjectAccessForUser?.({
      user_id: auth.context.user_id, project_id: projectId
    });
    if (access === undefined || access === null || access.organization_id !== auth.context.organization_id ||
        access.shared_access_suspended || access.project_id !== projectId) {
      await reply.status(403).send({ error: "agent_access_denied" });
      return null;
    }
    if (!(await enforceRequestRateLimit(request, reply, dependencies, {
      bucket: "retrieval-read", subject: `agent:${auth.context.token_id}`
    }))) return null;
    return auth.context;
  }

  async function read(request: FastifyRequest, reply: FastifyReply, name: OpenAiToolName, projectId: string, incidentId?: string, query?: { limit?: number; cursor?: string }): Promise<FastifyReply | undefined> {
    const token = await authorize(request, reply, projectId);
    if (token === null) return;
    if (dependencies.agentReads === undefined) return reply.status(503).send({ error: "agent_reads_unavailable" });
    const cursor = query?.cursor;
    if (cursor !== undefined && (!cursor.startsWith(`${projectId}.`) || !/^[A-Za-z0-9_-]{1,1900}$/.test(cursor.slice(projectId.length + 1)))) {
      return reply.status(400).send({ error: "invalid_cursor" });
    }
    // Selection is fixed here; no caller-controlled operation name or method dispatch.
    const operation = createOpenAiHostedOperations({ dependencies: dependencies.agentReads,
      dashboardBaseUrl: dependencies.agentDashboardBaseUrl ?? "https://app.debugbundle.com" })[name];
    if (operation === undefined) return reply.status(503).send({ error: "agent_reads_unavailable" });
    try {
      const input = parseOpenAiToolInput(name, {
        projectId, ...(incidentId === undefined ? {} : { incidentId }), ...query,
        ...(cursor === undefined ? {} : { cursor: cursor.slice(projectId.length + 1) })
      });
      const result = await operation({
        principal: { userId: token.user_id, organizationId: token.organization_id, grantId: token.token_id, scopes: [] },
        input
      });
      const projected = projectOpenAiToolOutput(name, result);
      const bound = name === "list_incidents" && projected !== null && typeof projected === "object" &&
        "next_cursor" in projected && typeof projected.next_cursor === "string"
        ? { ...projected, next_cursor: `${projectId}.${projected.next_cursor}` } : projected;
      return reply.header("Cache-Control", "no-store")
        .header("x-debugbundle-privacy-policy", POLICY).send(bound);
    } catch {
      return reply.status(404).send({ error: "agent_evidence_unavailable" });
    }
  }

  app.get("/v1/agent/projects/:id", async (request, reply) => {
    const params = ProjectParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_project_id" });
    const token = await authorize(request, reply, params.data.id);
    if (token === null) return;
    const access = await dependencies.projectManagement!.resolveProjectAccessForUser!({
      user_id: token.user_id, project_id: params.data.id
    });
    if (access === null || access.organization_id !== token.organization_id || access.shared_access_suspended) {
      return reply.status(403).send({ error: "agent_access_denied" });
    }
    const result = sanitizeTelemetry({ project_id: params.data.id, name: access.project_name ?? "Project" });
    if (!result.ok) return reply.status(503).send({ error: "agent_reads_unavailable" });
    return reply.header("Cache-Control", "no-store")
      .header("x-debugbundle-privacy-policy", POLICY).send({ project: result.value });
  });

  app.get("/v1/agent/projects/:id/incidents", async (request, reply) => {
    const params = ProjectParams.safeParse(request.params);
    const query = ListQuery.safeParse(request.query);
    if (!params.success || !query.success) return reply.status(400).send({ error: "invalid_query" });
    return read(request, reply, "list_incidents", params.data.id, undefined, {
      ...(query.data.limit === undefined ? {} : { limit: query.data.limit }),
      ...(query.data.cursor === undefined ? {} : { cursor: query.data.cursor })
    });
  });

  for (const [suffix, name] of [
    ["", "get_incident"], ["/context", "get_incident_context"], ["/bundle", "get_bundle"]
  ] as const) {
    app.get(`/v1/agent/projects/:id/incidents/:incidentId${suffix}`, async (request, reply) => {
      const params = IncidentParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "invalid_incident_id" });
      return read(request, reply, name, params.data.id, params.data.incidentId);
    });
  }
}
