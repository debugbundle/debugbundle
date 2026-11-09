import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ReportEmailDeliveriesSchema } from "../../../../packages/smart-reports/src/report-email.js";
import type { ApiDependencies } from "../api-types.js";
import {
  guardReportHandler,
  resolveReportRouteActor,
  ReportOrganizationParamsSchema
} from "../report-route-helpers.js";
const identity = ReportOrganizationParamsSchema.extend({ runId: z.uuid() });
export function registerReportDeliveryRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  app.get(
    "/v1/organizations/:organizationId/reports/:runId/deliveries",
    guardReportHandler(async (request, reply) => {
      const params = identity.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "invalid_payload" });
      const actor = await resolveReportRouteActor(request, reply, dependencies, false);
      if (!actor) return;
      if (!dependencies.reportEmail) return reply.status(404).send({ error: "report_not_found" });
      return reply.send(
        ReportEmailDeliveriesSchema.parse({
          deliveries: await dependencies.reportEmail.list({ ...actor, id: params.data.runId })
        })
      );
    }, "report_run_failed")
  );
}
