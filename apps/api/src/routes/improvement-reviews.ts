import { z } from "zod";
import { ReviewPlanDocumentSchema } from "../../../../packages/smart-improvements/src/review-planning-contract.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ReviewSettingsCommandSchema,
  ReviewSettingsSchema,
  ReviewRecordSchema,
  ReviewArtifactSchema,
  ReviewStatusSchema,
  ReviewListQuerySchema,
  ReviewAllowanceSchema
} from "../../../../packages/smart-improvements/src/review-contract.js";
import { SmartReportError } from "../../../../packages/smart-reports/src/report-errors.js";
import {
  resolveReportRouteActor,
  ReportOrganizationParamsSchema
} from "../report-route-helpers.js";
import type { ApiDependencies } from "../api-types.js";
const base = "/v1/organizations/:organizationId/improvements/reviews";
function guard(
  handler: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>
): (req: FastifyRequest, reply: FastifyReply) => Promise<unknown> {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    reply.header("Cache-Control", "no-store");
    try {
      return await handler(req, reply);
    } catch (error) {
      if (error instanceof SmartReportError)
        return reply
          .code(
            error.code === "report_not_found"
              ? 404
              : error.code === "report_version_conflict" ||
                  error.code === "organization_context_changed"
                ? 409
                : 403
          )
          .send({
            error: error.code === "report_not_found" ? "improvement_review_not_found" : error.code
          });
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return reply.code(400).send({ error: "invalid_improvement_review_input" });
      req.log.error("improvement_review_operation_failed");
      return reply.code(500).send({ error: "improvement_review_operation_failed" });
    }
  };
}
export function registerImprovementReviewRoutes(app: FastifyInstance, deps: ApiDependencies): void {
  for (const operation of ["settings", "allowance", "list", "get", "bundle", "plan"] as const) {
    const path =
      operation === "list"
        ? base
        : operation === "get"
          ? `${base}/:reviewId`
          : operation === "bundle" || operation === "plan"
            ? `${base}/:reviewId/${operation}`
            : `${base}/${operation}`;
    app.get(
      path,
      guard(async (req, reply) => {
        const actor = await resolveReportRouteActor(req, reply, deps, false);
        if (!actor) return;
        if (!deps.improvementReviews)
          return reply.code(404).send({ error: "improvement_reviews_unavailable" });
        if (operation === "settings")
          return reply.send({
            settings: ReviewSettingsSchema.parse(await deps.improvementReviews.settings.get(actor))
          });
        if (operation === "allowance")
          return reply.send({
            allowance: ReviewAllowanceSchema.parse(await deps.improvementReviews.allowance(actor))
          });
        if (operation === "list") {
          const result = await deps.improvementReviews.store.list({
            ...actor,
            ...ReviewListQuerySchema.parse(req.query)
          });
          return reply.send({
            reviews: result.items.map((item) => ReviewRecordSchema.parse(item)),
            next_cursor: result.next_cursor
          });
        }
        const params = ReportOrganizationParamsSchema.extend({ reviewId: z.uuid() }).parse(
            req.params
          ),
          input = { ...actor, id: params.reviewId };
        if (operation === "get")
          return reply.send({
            review: ReviewRecordSchema.parse(await deps.improvementReviews.store.get(input))
          });
        if (operation === "plan") {
          z.object({}).strict().parse(req.query);
          return reply.send(
            z
              .object({ bundle: ReviewPlanDocumentSchema.nullable(), status: ReviewStatusSchema })
              .strict()
              .parse(await deps.improvementReviews.store.plan(input))
          );
        }
        const result = await deps.improvementReviews.store.bundle(input);
        return reply.send(
          z
            .object({ bundle: ReviewArtifactSchema.nullable(), status: ReviewStatusSchema })
            .strict()
            .parse(result)
        );
      })
    );
  }
  app.patch(
    `${base}/settings`,
    guard(async (req, reply) => {
      const command = ReviewSettingsCommandSchema.parse(req.body);
      const actor = await resolveReportRouteActor(
        req,
        reply,
        deps,
        true,
        command.expected_organization_id
      );
      if (!actor) return;
      if (!deps.improvementReviews)
        return reply.code(404).send({ error: "improvement_reviews_unavailable" });
      if (command.enabled && deps.improvementReviewsEnabled !== true)
        return reply.code(503).send({ error: "improvement_reviews_disabled" });
      return reply.send({
        settings: ReviewSettingsSchema.parse(
          await deps.improvementReviews.settings.replace({ ...actor, command })
        )
      });
    })
  );
}
