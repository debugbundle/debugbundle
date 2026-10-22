import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiDependencies } from "../api-types.js";
import { requireOwnerBillingPrincipal } from "./billing-principal.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";
import {
  BillingPlanChangeConfirmSchema,
  BillingPlanChangeCancelSchema
} from "../../../../packages/billing-client/src/plan-change.js";

export function registerBillingPlanChangeRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  for (const action of ["status", "preview", "schedule", "cancel"] as const) {
    app.route({
      method: action === "status" ? "GET" : action === "cancel" ? "DELETE" : "POST",
      url: `/v1/billing/plan-change${action === "preview" ? "/preview" : ""}`,
      async handler(request, reply) {
        reply.header("Cache-Control", "no-store");
        const principal = await requireOwnerBillingPrincipal(
          request,
          reply,
          dependencies,
          action === "status" ? "management-read" : "management-write",
          true
        );
        if (!principal) return;
        const billing = dependencies.billingManagement;
        const parsed = (
          action === "schedule"
            ? BillingPlanChangeConfirmSchema
            : action === "cancel"
              ? BillingPlanChangeCancelSchema
              : z.object({}).strict()
        ).safeParse(action === "status" ? {} : request.body);
        if (!parsed.success) return reply.status(400).send({ error: "invalid_payload" });
        const context = { organization_id: principal.organization_id };
        const result =
          action === "status"
            ? await billing?.getPlanChange?.(context)
            : action === "preview"
              ? await billing?.previewPlanChange?.(context)
              : action === "schedule"
                ? await billing?.schedulePlanChange?.({
                    ...context,
                    ...BillingPlanChangeConfirmSchema.parse(parsed.data)
                  })
                : await billing?.cancelPlanChange?.({
                    ...context,
                    ...BillingPlanChangeCancelSchema.parse(parsed.data)
                  });
        if (result === undefined)
          return reply.status(503).send({ error: "billing_not_configured" });
        if (action === "schedule" || action === "cancel")
          await recordAuditLog(dependencies.auditLogging, {
            organization_id: principal.organization_id,
            actor_user_id: principal.user_id,
            actor_type: resolveAuditActorType(request.headers),
            action: `billing.plan_change.${action}`,
            target_type: "billing_subscription",
            target_id: principal.organization_id,
            status: typeof result === "string" ? "failure" : "success",
            ip_address: request.ip,
            metadata: {
              target_plan: "solo",
              ...(typeof result === "string" ? { reason: result } : {})
            }
          });
        return typeof result === "string"
          ? reply
              .status(
                result === "billing_not_configured" || result === "billing_service_error"
                  ? 503
                  : 409
              )
              .send({ error: result })
          : reply.status(200).send(result);
      }
    });
  }
}
