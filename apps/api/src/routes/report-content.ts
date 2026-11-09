import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ReportContentViewSchema,
  reportLinkLocation
} from "../../../../packages/smart-reports/src/report-content.js";
import { ReportReferenceSchema } from "../../../../packages/smart-reports/src/model-evidence.js";
import { renderReportHtml } from "../../../../packages/smart-reports/src/report-html.js";
import type { ApiDependencies } from "../api-types.js";
import {
  guardReportHandler,
  resolveReportRouteActor,
  ReportOrganizationParamsSchema
} from "../report-route-helpers.js";
const base = "/v1/organizations/:organizationId/reports/:runId";
const identity = ReportOrganizationParamsSchema.extend({ runId: z.uuid() });
const sourceIdentity = identity.extend({ reference: ReportReferenceSchema });
const issueSourceLocation = z
  .string()
  .regex(/^\/projects\/([0-9a-f-]{36})\/(incidents|improvements)\/([0-9a-f-]{36})$/)
  .refine((value) => {
    const parts = value.split("/");
    return z.uuid().safeParse(parts[2]).success && z.uuid().safeParse(parts[4]).success;
  });
const sourceLocation = z.union([
  issueSourceLocation,
  z
    .string()
    .regex(/^\/projects\/[0-9a-f-]{36}\/health$/)
    .refine((value) => z.uuid().safeParse(value.split("/")[2]).success)
]);
export function registerReportContentRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  for (const format of ["document", "html", "sources/:reference"] as const)
    app.get(
      `${base}/${format}`,
      guardReportHandler(async (request, reply) => {
        const params = (format === "sources/:reference" ? sourceIdentity : identity).safeParse(
          request.params
        );
        if (!params.success) return reply.status(400).send({ error: "invalid_report_id" });
        const actor = await resolveReportRouteActor(request, reply, dependencies, false);
        if (actor === null) return;
        if (dependencies.reportContent === undefined)
          return reply.status(404).send({ error: "report_not_found" });
        const input = { ...actor, id: params.data.runId };
        if (format === "sources/:reference") {
          const reference = sourceIdentity.parse(request.params).reference;
          const location = await dependencies.reportContent.source({ ...input, reference });
          if (location === null)
            return reply.status(404).send({ error: "report_source_unavailable" });
          const path = sourceLocation.parse(location);
          const destination = reportLinkLocation(path, dependencies.reportDashboardBaseUrl);
          return reply.code(303).redirect(destination);
        }
        const view = ReportContentViewSchema.parse(await dependencies.reportContent.view(input));
        if (format === "document") return reply.send(view);
        reply.header(
          "Content-Security-Policy",
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        );
        reply.header("X-Content-Type-Options", "nosniff");
        reply.header("Content-Disposition", 'inline; filename="debugbundle-report.html"');
        return reply
          .type("text/html; charset=utf-8")
          .send(
            renderReportHtml(view.document, { available_source_refs: view.available_source_refs })
          );
      }, "report_run_failed")
    );
}
