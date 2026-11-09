import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ReportPdfStateResponseSchema,
  isReportPdfBytes
} from "../../../../packages/smart-reports/src/report-pdf.js";
import { ReportRunMutationSchema } from "../../../../packages/smart-reports/src/report-run-api-contract.js";
import type { ApiDependencies } from "../api-types.js";
import {
  guardReportHandler,
  resolveReportRouteActor,
  ReportOrganizationParamsSchema
} from "../report-route-helpers.js";
import { requireRequestMemberAuth, enforceRequestRateLimit } from "../api-helpers.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";
const base = "/v1/organizations/:organizationId/reports/:runId/pdf";
const identity = ReportOrganizationParamsSchema.extend({ runId: z.uuid() });
export function registerReportPdfRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.addHook("onResponse", async (request, reply) => {
    if (
      request.method !== "POST" ||
      request.routeOptions.url !== base ||
      !dependencies.auditLogging
    )
      return;
    try {
      const member = await requireRequestMemberAuth(request, dependencies),
        params = identity.safeParse(request.params);
      await recordAuditLog(dependencies.auditLogging, {
        organization_id: params.success ? params.data.organizationId : null,
        actor_user_id: member?.member_id ?? null,
        actor_type: member === null ? "anonymous" : resolveAuditActorType(request.headers),
        action: "report.pdf.prepare",
        target_type: "report_run",
        target_id: params.success ? params.data.runId : null,
        status: reply.statusCode < 400 ? "success" : "failure",
        ip_address: request.ip,
        metadata: { status_code: reply.statusCode }
      });
    } catch {
      request.log.warn("report_pdf_audit_unavailable");
    }
  });
  for (const operation of ["status", "request", "download"] as const)
    app.route({
      method: operation === "request" ? "POST" : "GET",
      url: operation === "download" ? `${base}/file` : base,
      handler: guardReportHandler(async (request, reply) => {
        const params = identity.safeParse(request.params),
          body = ReportRunMutationSchema.safeParse(
            operation === "request" ? request.body : undefined
          );
        if (!params.success || !body.success)
          return reply.status(400).send({ error: "invalid_payload" });
        const actor = await resolveReportRouteActor(
          request,
          reply,
          dependencies,
          false,
          body.data.expected_organization_id
        );
        if (actor === null) return;
        // Preparing already-readable content retains a read grant. Its CPU/job
        // admission still consumes the stricter management request rate budget.
        if (
          operation === "request" &&
          !(await enforceRequestRateLimit(request, reply, dependencies, {
            bucket: "management-write",
            subject: `member:${actor.initiator.user_id}`
          }))
        )
          return;
        const store = dependencies.reportPdf;
        if (!store) return reply.status(404).send({ error: "report_not_found" });
        const input = { ...actor, id: params.data.runId };
        if (operation === "download") {
          const state = ReportPdfStateResponseSchema.parse({ pdf: await store.status(input) }).pdf;
          if (state.status !== "ready")
            return reply.status(409).send({ error: "report_pdf_not_ready" });
          const bytes = await store.download(input);
          if (!Buffer.isBuffer(bytes) || !isReportPdfBytes(bytes))
            throw new Error("report_pdf_output_invalid");
          reply.header(
            "Content-Disposition",
            `attachment; filename="debugbundle-report-${params.data.runId}.pdf"`
          );
          reply.header("X-Content-Type-Options", "nosniff");
          reply.header("Content-Security-Policy", "default-src 'none'; sandbox");
          return reply.type("application/pdf").send(bytes);
        }
        const result = ReportPdfStateResponseSchema.parse({ pdf: await store[operation](input) });
        return reply
          .status(operation === "request" && result.pdf.status !== "ready" ? 202 : 200)
          .send(result);
      }, "report_run_failed")
    });
}
