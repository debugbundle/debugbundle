import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { SmartReportError } from "../../../packages/smart-reports/src/report-errors.js";
import { requireRateLimitedMemberAuth } from "./api-helpers.js";
import { memberJobInitiator } from "./member-access-scope.js";
import { isProjectConsolidationDatabaseError } from "./project-consolidation-http.js";
import type { ApiDependencies } from "./api-types.js";
export const ReportOrganizationParamsSchema = z.object({ organizationId: z.uuid() }).strict();
export type ReportRouteActor = {
  organization_id: string;
  initiator: NonNullable<ReturnType<typeof memberJobInitiator>>;
};
export function guardReportHandler(
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>,
  failureCode: "report_definition_failed" | "report_run_failed"
): (request: FastifyRequest, reply: FastifyReply) => Promise<unknown> {
  return async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    try {
      return await handler(request, reply);
    } catch (error) {
      if (isProjectConsolidationDatabaseError(error)) throw error;
      if (error instanceof SmartReportError) {
        const status =
          error.code === "report_not_found"
            ? 404
            : ["report_quota_exhausted", "report_ai_budget_exhausted"].includes(error.code)
              ? 429
              : [
                    "report_definition_limit_reached",
                    "report_request_conflict",
                    "report_version_conflict",
                    "organization_context_changed",
                    "weekly_overlap_confirmation_required"
                  ].includes(error.code)
                ? 409
                : [
                      "invalid_report_scope",
                      "invalid_report_recipient",
                      "report_period_unavailable"
                    ].includes(error.code)
                  ? 400
                  : 403;
        return reply.status(status).send({ error: error.code });
      }
      request.log.error(failureCode);
      return reply.status(500).send({ error: failureCode });
    }
  };
}
export async function resolveReportRouteActor(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: ApiDependencies,
  write: boolean,
  expectedOrg?: string
): Promise<ReportRouteActor | null> {
  const member = await requireRateLimitedMemberAuth(
    request,
    reply,
    dependencies,
    write ? "management-write" : "management-read"
  );
  if (member === null) return null;
  const params = ReportOrganizationParamsSchema.passthrough().safeParse(request.params);
  if (!params.success) {
    await reply.status(400).send({ error: "invalid_organization_id" });
    return null;
  }
  if (
    expectedOrg !== undefined &&
    (expectedOrg !== params.data.organizationId ||
      (member.credential_kind === "browser_session" && expectedOrg !== member.organization_id))
  ) {
    await reply.status(409).send({ error: "organization_context_changed" });
    return null;
  }
  const initiator = memberJobInitiator(member);
  if (initiator === undefined) {
    await reply.status(403).send({ error: "report_actor_unavailable" });
    return null;
  }
  return { organization_id: params.data.organizationId, initiator };
}
