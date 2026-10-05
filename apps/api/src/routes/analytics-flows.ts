import { AnalyticsFlowCaptureSchemas as schemas } from "../../../../packages/shared-types/src/analytics-flows.js";
import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireProjectToken } from "../../../../packages/auth/src/index.js";
import { sanitizeTelemetry } from "../../../../packages/redaction/src/index.js";
import {
  AnalyticsFlowDefinitionInputSchema,
  AnalyticsFlowKeySchema,
  getTierCapabilities
} from "../../../../packages/shared-types/src/index.js";
import { AnalyticsFlowError } from "../../../../packages/storage/src/analytics-flow-store.js";
import { enforceRequestRateLimit, requireRateLimitedProjectAccess } from "../api-helpers.js";
import {
  claimAnalyticsIngestionQuota,
  releaseAnalyticsQuotaClaimBestEffort,
  toRetryAfterSeconds
} from "../analytics-quota.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";
import { getRequestOrigin, isProjectTokenOriginAllowed } from "../project-token-origins.js";
import type { ApiDependencies } from "../api-types.js";

const Scope = z.object({ id: z.string().uuid(), key: AnalyticsFlowKeySchema });
type Operation = keyof typeof schemas;

export function registerAnalyticsFlowRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  const base = "/v1/projects/:id/analytics/flows";
  app.get(base, async (request, reply) => {
    const access = await managementAccess(request, reply, dependencies, false);
    if (!access) return;
    return { flows: await access.store.list({ project_id: access.projectId }) };
  });
  app.put(`${base}/:key`, async (request, reply) => {
    const access = await managementAccess(request, reply, dependencies, true);
    if (!access) return;
    const params = Scope.safeParse(request.params);
    const body = AnalyticsFlowDefinitionInputSchema.safeParse(request.body);
    if (!params.success || !body.success || body.data.flow_key !== params.data.key)
      return reply.status(400).send({ error: "invalid_flow_definition" });
    try {
      const flow = await access.store.save({
        project_id: access.projectId,
        definition: body.data,
        now: new Date().toISOString()
      });
      await audit("save", request, dependencies, access, params.data.key);
      return { flow };
    } catch (error) {
      return flowError(reply, error);
    }
  });
  app.delete(`${base}/:key`, async (request, reply) => {
    const access = await managementAccess(request, reply, dependencies, true);
    if (!access) return;
    const params = Scope.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_flow" });
    try {
      await access.store.archive({
        project_id: access.projectId,
        flow_key: params.data.key,
        now: new Date().toISOString()
      });
      await audit("archive", request, dependencies, access, params.data.key);
      return { archived: true };
    } catch (error) {
      return flowError(reply, error);
    }
  });
  app.get(`${base}/:key/report`, async (request, reply) => {
    const access = await managementAccess(request, reply, dependencies, false);
    if (!access) return;
    const params = Scope.safeParse(request.params);
    const query = z
      .object({ window: z.enum(["7d", "30d", "90d"]).default("30d") })
      .strict()
      .safeParse(request.query);
    if (!params.success || !query.success)
      return reply.status(400).send({ error: "invalid_flow_query" });
    const to = new Date();
    to.setUTCHours(0, 0, 0, 0);
    const span = Number.parseInt(query.data.window, 10) * 86400_000;
    try {
      return await access.store.report({
        project_id: access.projectId,
        flow_key: params.data.key,
        from: new Date(to.getTime() - span).toISOString(),
        to: to.toISOString(),
        previous_from: new Date(to.getTime() - 2 * span).toISOString()
      });
    } catch (error) {
      return flowError(reply, error);
    }
  });
  for (const operation of Object.keys(schemas) as Operation[]) {
    app.post(`/v1/analytics/flows/:id/:key/${operation}`, async (request, reply) =>
      capture(operation, request, reply, dependencies)
    );
  }
}

async function managementAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  manage: boolean
): Promise<{
  store: NonNullable<ApiDependencies["analyticsFlows"]>;
  projectId: string;
  auth: NonNullable<Awaited<ReturnType<typeof requireRateLimitedProjectAccess>>>;
} | null> {
  const params = z.object({ id: z.string().uuid() }).passthrough().safeParse(request.params);
  if (!params.success) {
    await reply.status(400).send({ error: "invalid_project_id" });
    return null;
  }
  const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
    projectId: params.data.id,
    bucket: manage ? "management-write" : "management-read"
  });
  if (!auth) return null;
  if (
    !getTierCapabilities(auth.access.organization_plan).analytics_bundle ||
    (manage && !["owner", "admin"].includes(auth.access.effective_role))
  ) {
    await reply.status(403).send({ error: "forbidden" });
    return null;
  }
  if (!dependencies.analyticsFlows) {
    await reply.status(503).send({ error: "analytics_flows_unavailable" });
    return null;
  }
  return { store: dependencies.analyticsFlows, projectId: params.data.id, auth };
}
async function audit(
  action: string,
  request: FastifyRequest,
  dependencies: ApiDependencies,
  access: NonNullable<Awaited<ReturnType<typeof managementAccess>>>,
  key: string
): Promise<void> {
  await recordAuditLog(dependencies.auditLogging, {
    organization_id: access.auth.access.organization_id,
    actor_user_id: access.auth.member.member_id,
    actor_type: resolveAuditActorType(request.headers),
    action: `analytics_flow.${action}`,
    target_type: "analytics_flow",
    target_id: `${access.projectId}:${key}`,
    status: "success",
    ip_address: request.ip,
    metadata: { project_id: access.projectId, flow_key: key }
  });
}
function flowError(reply: FastifyReply, error: unknown): FastifyReply {
  if (!(error instanceof AnalyticsFlowError)) throw error;
  const status = error.code === "not_found" ? 404 : error.code === "origin_not_allowed" ? 403 : 409;
  return reply.status(status).send({ error: `analytics_flow_${error.code}` });
}
async function capture(
  operation: Operation,
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies
): Promise<unknown> {
  reply.header("Cache-Control", "no-store");
  const params = Scope.safeParse(request.params);
  const body = schemas[operation].safeParse(request.body);
  if (!params.success || !body.success)
    return reply.status(400).send({ error: "invalid_flow_capture" });
  if (operation === "start") {
    const attribution = schemas.start.parse(body.data);
    for (const value of [attribution.source, attribution.campaign]) {
      if (value === undefined) continue;
      const checked = sanitizeTelemetry(value);
      if (!checked.ok || checked.value !== value)
        return reply.status(400).send({ error: "invalid_flow_attribution" });
    }
  }
  const auth = await requireProjectToken({
    authorizationHeader: request.headers.authorization,
    resolveByTokenHash: (tokenHash) =>
      dependencies.ingestionMetadata.resolveProjectByTokenHash(tokenHash)
  });
  if (!auth.ok || auth.context.project_id !== params.data.id)
    return reply.status(401).send({ error: "invalid_project_token" });
  const origin = getRequestOrigin(request.headers);
  if (
    origin === null ||
    !isProjectTokenOriginAllowed({ headers: request.headers, projectToken: auth.context })
  )
    return reply.status(403).send({ error: "origin_not_allowed" });
  if (
    !(await enforceRequestRateLimit(request, reply, dependencies, {
      bucket: "management-write",
      subject: `flow:${params.data.id}:${request.ip}`
    }))
  )
    return;
  const store = dependencies.analyticsFlows;
  if (!store) return reply.status(503).send({ error: "analytics_flows_unavailable" });
  const scope = { project_id: params.data.id, flow_key: params.data.key };
  const input = { ...scope, ...body.data, origin, now: new Date().toISOString() };
  if (operation === "withdraw") {
    await store.withdraw(input);
    return { withdrawn: true };
  }
  const organizationId = auth.context.organization_id;
  if (!organizationId || !dependencies.analyticsSettingsManagement)
    return reply.status(403).send({ error: "analytics_disabled" });
  const settings = await dependencies.analyticsSettingsManagement.getAnalyticsSettingsForProject({
    organization_id: organizationId,
    project_id: params.data.id
  });
  if (!settings?.enabled) return reply.status(403).send({ error: "analytics_disabled" });
  if (settings.consent_required && body.data.consent !== true)
    return reply.status(403).send({ error: "analytics_consent_required" });
  // Stable, project-scoped claim keys keep ordinary retries from consuming allowances twice.
  const identity = createHash("sha256")
    .update(
      JSON.stringify([
        scope,
        operation,
        body.data.context,
        "step_key" in body.data ? body.data.step_key : "token" in body.data ? body.data.token : ""
      ])
    )
    .digest("hex");
  const claim = await claimAnalyticsIngestionQuota({
    dependencies,
    organization_id: organizationId,
    organization_plan: auth.context.organization_plan,
    now: new Date(input.now),
    events: [
      {
        event: {
          event_id: `flow:${identity}`,
          correlation: {
            session_id: `flow:${createHash("sha256").update(body.data.context).digest("hex")}`
          },
          payload: { kind: operation === "start" ? "session_start" : "funnel_step" }
        }
      }
    ]
  });
  if (!claim.allowed)
    return reply
      .header("Retry-After", toRetryAfterSeconds(claim.retry_after_ms))
      .status(429)
      .send({ error: "analytics_quota_exceeded" });
  try {
    let result: unknown;
    if (operation === "start") {
      const start = schemas.start.parse(body.data);
      result = await store.start({
        ...scope,
        context: start.context,
        origin,
        now: input.now,
        step_key: start.step_key,
        ...(start.source === undefined ? {} : { source: start.source }),
        ...(start.campaign === undefined ? {} : { campaign: start.campaign })
      });
    } else if (operation === "step") {
      await store.step({ ...input, ...schemas.step.parse(body.data) });
      result = { recorded: true };
    } else if (operation === "handoff")
      result = await store.handoff({ ...input, ...schemas.handoff.parse(body.data) });
    else result = await store.arrive({ ...input, ...schemas.arrive.parse(body.data) });
    return reply.status(200).send(result);
  } catch (error) {
    if (claim.release)
      await releaseAnalyticsQuotaClaimBestEffort({ dependencies, release: claim.release });
    return flowError(reply, error);
  }
}
