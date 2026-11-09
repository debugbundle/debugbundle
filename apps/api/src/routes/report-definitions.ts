import { ReportAllowanceResponseSchema } from "../../../../packages/smart-reports/src/report-allowance.js";
import { guardReportHandler, resolveReportRouteActor } from "../report-route-helpers.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  CreateReportRequestSchema,
  DeleteReportDefinitionSchema
} from "../../../../packages/smart-reports/src/report-api-contract.js";
import { ReplaceReportDefinitionSchema } from "../../../../packages/smart-reports/src/report-definition.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRequestMemberAuth } from "../api-helpers.js";
import type { memberJobInitiator } from "../member-access-scope.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";

const orgParams = z.object({ organizationId: z.uuid() }).strict();
const definitionParams = orgParams.extend({ definitionId: z.uuid() });
const base = "/v1/organizations/:organizationId/report-definitions";
const auditActions: Record<string, string> = {
  [`POST ${base}`]: "report.definition.create",
  [`PATCH ${base}/:definitionId`]: "report.definition.update",
  [`DELETE ${base}/:definitionId`]: "report.definition.delete"
};
const guarded = (
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>
): ReturnType<typeof guardReportHandler> => guardReportHandler(handler, "report_definition_failed");
export function registerReportDefinitionRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  // Only resource IDs and outcome enter the audit; never names, recipients or credentials.
  app.addHook("onResponse", async (request, reply) => {
    const action = auditActions[`${request.method} ${request.routeOptions.url}`];
    if (action === undefined || dependencies.auditLogging === undefined) return;
    try {
      const member = await requireRequestMemberAuth(request, dependencies);
      const params = orgParams
        .extend({ definitionId: z.uuid().optional() })
        .safeParse(request.params);
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: params.success ? params.data.organizationId : null,
        actor_user_id: member?.member_id ?? null,
        actor_type: member === null ? "anonymous" : resolveAuditActorType(request.headers),
        action,
        target_type: "report_definition",
        target_id: params.success ? (params.data.definitionId ?? null) : null,
        status: reply.statusCode < 400 ? "success" : "failure",
        ip_address: request.ip,
        metadata: { status_code: reply.statusCode }
      });
    } catch {
      request.log.warn("report_definition_audit_unavailable");
    }
  });
  async function context(
    request: FastifyRequest,
    reply: FastifyReply,
    write: boolean,
    expectedOrg?: string
  ): Promise<{
    store: NonNullable<ApiDependencies["reportDefinitions"]>;
    actor: {
      organization_id: string;
      initiator: NonNullable<ReturnType<typeof memberJobInitiator>>;
    };
  } | null> {
    const actor = await resolveReportRouteActor(request, reply, dependencies, write, expectedOrg);
    if (actor === null) return null;
    const store = dependencies.reportDefinitions;
    if (store === undefined) {
      await reply.status(404).send({ error: "smart_reports_unavailable" });
      return null;
    }
    return { store, actor };
  }
  app.get(
    `${base}/:definitionId/allowance`,
    guarded(async (request, reply) => {
      const params = definitionParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "invalid_payload" });
      const actor = await resolveReportRouteActor(request, reply, dependencies, false);
      if (!actor) return;
      if (!dependencies.reportAllowance)
        return reply.status(404).send({ error: "report_not_found" });
      return reply.send(
        ReportAllowanceResponseSchema.parse({
          allowance: await dependencies.reportAllowance.read({
            ...actor,
            definition_id: params.data.definitionId
          })
        })
      );
    })
  );
  app.get(
    base,
    guarded(async (request, reply) => {
      const ctx = await context(request, reply, false);
      if (ctx === null) return;
      return reply.send({ definitions: await ctx.store.list(ctx.actor) });
    })
  );
  app.post(
    base,
    guarded(async (request, reply) => {
      const parsed = CreateReportRequestSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: "invalid_payload" });
      const ctx = await context(
        request,
        reply,
        true,
        parsed.data.definition.expected_organization_id
      );
      if (ctx === null) return;
      if (dependencies.reportGenerationEnabled === false)
        return reply.status(404).send({ error: "smart_reports_unavailable" });
      const saved = await ctx.store.create({ ...ctx.actor, ...parsed.data });
      return reply.status(201).send({ definition: saved });
    })
  );
  app.get(
    `${base}/:definitionId`,
    guarded(async (request, reply) => {
      const params = definitionParams.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "invalid_report_definition_id" });
      const ctx = await context(request, reply, false);
      if (ctx === null) return;
      const saved = await ctx.store.get({ ...ctx.actor, id: params.data.definitionId });
      return saved === null
        ? reply.status(404).send({ error: "report_not_found" })
        : reply.send({ definition: saved });
    })
  );
  app.patch(
    `${base}/:definitionId`,
    guarded(async (request, reply) => {
      const params = definitionParams.safeParse(request.params),
        definition = ReplaceReportDefinitionSchema.safeParse(request.body);
      if (!params.success || !definition.success)
        return reply.status(400).send({ error: "invalid_payload" });
      const ctx = await context(request, reply, true, definition.data.expected_organization_id);
      if (ctx === null) return;
      if (dependencies.reportGenerationEnabled === false && definition.data.enabled)
        return reply.status(404).send({ error: "smart_reports_unavailable" });
      return reply.send({
        definition: await ctx.store.replace({
          ...ctx.actor,
          id: params.data.definitionId,
          definition: definition.data
        })
      });
    })
  );
  app.delete(
    `${base}/:definitionId`,
    guarded(async (request, reply) => {
      const params = definitionParams.safeParse(request.params),
        body = DeleteReportDefinitionSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send({ error: "invalid_payload" });
      const ctx = await context(request, reply, true, body.data.expected_organization_id);
      if (ctx === null) return;
      const deleted = await ctx.store.remove({
        ...ctx.actor,
        id: params.data.definitionId,
        expected_version: body.data.expected_version
      });
      return deleted
        ? reply.send({ deleted: true })
        : reply.status(404).send({ error: "report_not_found" });
    })
  );
}
