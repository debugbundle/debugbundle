import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ReportRunCommandSchema } from "../../../../packages/smart-reports/src/report-run.js";
import {
  ReportRunListQuerySchema,
  ReportRunMutationSchema,
  ReportRunResponseSchema,
  ReportRunListResponseSchema
} from "../../../../packages/smart-reports/src/report-run-api-contract.js";
import type { ApiDependencies } from "../api-types.js";
import {
  guardReportHandler,
  resolveReportRouteActor,
  ReportOrganizationParamsSchema,
  type ReportRouteActor
} from "../report-route-helpers.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";
import { requireRequestMemberAuth } from "../api-helpers.js";
const base = "/v1/organizations/:organizationId/reports";
const paramsSchema = ReportOrganizationParamsSchema.extend({ runId: z.uuid() });
export function registerReportRunRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  const actions: Record<string, string> = {
    [`POST ${base}`]: "report.generate",
    [`POST ${base}/:runId/cancel`]: "report.cancel",
    [`DELETE ${base}/:runId`]: "report.delete"
  };
  app.addHook("onResponse", async (request, reply) => {
    const action = actions[`${request.method} ${request.routeOptions.url}`];
    if (action === undefined || dependencies.auditLogging === undefined) return;
    try {
      const member = await requireRequestMemberAuth(request, dependencies),
        params = ReportOrganizationParamsSchema.extend({ runId: z.uuid().optional() }).safeParse(
          request.params
        );
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: params.success ? params.data.organizationId : null,
        actor_user_id: member?.member_id ?? null,
        actor_type: member === null ? "anonymous" : resolveAuditActorType(request.headers),
        action,
        target_type: "report_run",
        target_id: params.success ? (params.data.runId ?? null) : null,
        status: reply.statusCode < 400 ? "success" : "failure",
        ip_address: request.ip,
        metadata: { status_code: reply.statusCode }
      });
    } catch {
      request.log.warn("report_run_audit_unavailable");
    }
  });
  async function context(
    request: FastifyRequest,
    reply: FastifyReply,
    write: boolean,
    expectedOrg?: string
  ): Promise<{
    actor: ReportRouteActor;
    store: NonNullable<ApiDependencies["reportRuns"]>;
  } | null> {
    const actor = await resolveReportRouteActor(request, reply, dependencies, write, expectedOrg);
    if (actor === null) return null;
    if (dependencies.reportRuns === undefined) {
      await reply.status(404).send({ error: "smart_reports_unavailable" });
      return null;
    }
    return { actor, store: dependencies.reportRuns };
  }
  app.get(
    base,
    guardReportHandler(async (request, reply) => {
      const query = ReportRunListQuerySchema.safeParse(request.query);
      if (!query.success) return reply.status(400).send({ error: "invalid_report_query" });
      const ctx = await context(request, reply, false);
      if (ctx === null) return;
      const page = await ctx.store.management.list({
        ...ctx.actor,
        limit: query.data.limit,
        ...(query.data.cursor === undefined ? {} : { cursor: query.data.cursor })
      });
      return reply.send(
        ReportRunListResponseSchema.parse({ runs: page.items, next_cursor: page.next_cursor })
      );
    }, "report_run_failed")
  );
  app.get(
    `${base}/:runId`,
    guardReportHandler(async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "invalid_report_id" });
      const ctx = await context(request, reply, false);
      if (ctx === null) return;
      return reply.send(
        ReportRunResponseSchema.parse({
          run: await ctx.store.management.get({ ...ctx.actor, id: params.data.runId })
        })
      );
    }, "report_run_failed")
  );
  app.post(
    base,
    guardReportHandler(async (request, reply) => {
      const command = ReportRunCommandSchema.safeParse(request.body);
      if (!command.success) return reply.status(400).send({ error: "invalid_payload" });
      const ctx = await context(request, reply, true, command.data.expected_organization_id);
      if (ctx === null) return;
      if (dependencies.reportGenerationEnabled === false)
        return reply.status(404).send({ error: "smart_reports_unavailable" });
      const run = await ctx.store.admission.admit({
        ...command.data,
        ...ctx.actor,
        kind: command.data.regenerate_from_run_id === undefined ? "manual" : "regeneration"
      });
      return reply.status(202).send(ReportRunResponseSchema.parse({ run }));
    }, "report_run_failed")
  );
  for (const action of ["cancel", "delete"] as const) {
    app.route({
      method: action === "cancel" ? "POST" : "DELETE",
      url: action === "cancel" ? `${base}/:runId/cancel` : `${base}/:runId`,
      handler: guardReportHandler(async (request, reply) => {
        const params = paramsSchema.safeParse(request.params),
          body = ReportRunMutationSchema.safeParse(request.body);
        if (!params.success || !body.success)
          return reply.status(400).send({ error: "invalid_payload" });
        const ctx = await context(request, reply, true, body.data.expected_organization_id);
        if (ctx === null) return;
        if (action === "cancel")
          return reply.send(
            ReportRunResponseSchema.parse({
              run: await ctx.store.management.cancel({ ...ctx.actor, id: params.data.runId })
            })
          );
        await ctx.store.management.remove({ ...ctx.actor, id: params.data.runId });
        return reply.send({ deleted: true });
      }, "report_run_failed")
    });
  }
}
