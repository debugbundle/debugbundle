import type { FastifyInstance } from "fastify";
import type { OfferChangeResponse } from "../../../../packages/billing-client/src/offer-change-client.js";
import { BillingOfferSelectionSchema } from "../../../../packages/shared-types/src/index.js";
import {
  BillingPlanChangeConfirmSchema,
  BillingPlanChangeCancelSchema
} from "../../../../packages/billing-client/src/plan-change.js";
import type { BillingPlanChangeError } from "../../../../packages/billing-client/src/plan-change.js";
import type { ApiDependencies } from "../api-types.js";
import { requireOwnerBillingPrincipal } from "./billing-principal.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";

/** Renewal changes retain the existing Owner automation boundary. */
export function registerBillingOfferChangeRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  for (const action of ["status", "preview", "schedule", "cancel"] as const) {
    app.route({
      method: action === "status" ? "GET" : action === "cancel" ? "DELETE" : "POST",
      url: `/v1/billing/offers/change${action === "preview" ? "/preview" : ""}`,
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
        const context = {
          organization_id: principal.organization_id,
          actor_user_id: principal.user_id
        };
        let result: OfferChangeResponse | BillingPlanChangeError | undefined;
        if (action === "status") result = await billing?.getOfferChange?.(context);
        else if (action === "preview") {
          const parsed = BillingOfferSelectionSchema.safeParse(request.body);
          if (!parsed.success) return reply.status(400).send({ error: "invalid_payload" });
          result = await billing?.previewOfferChange?.({ ...context, ...parsed.data });
        } else if (action === "schedule") {
          const parsed = BillingPlanChangeConfirmSchema.safeParse(request.body);
          if (!parsed.success) return reply.status(400).send({ error: "invalid_payload" });
          result = await billing?.scheduleOfferChange?.({ ...context, ...parsed.data });
        } else {
          const parsed = BillingPlanChangeCancelSchema.safeParse(request.body);
          if (!parsed.success) return reply.status(400).send({ error: "invalid_payload" });
          result = await billing?.cancelOfferChange?.({ ...context, ...parsed.data });
        }
        if (result === undefined)
          return reply.status(503).send({ error: "billing_not_configured" });
        if (action === "schedule" || action === "cancel")
          await recordAuditLog(dependencies.auditLogging, {
            organization_id: principal.organization_id,
            actor_user_id: principal.user_id,
            actor_type: resolveAuditActorType(request.headers),
            action: `billing.offer_change.${action}`,
            target_type: "billing_subscription",
            target_id: principal.organization_id,
            status: typeof result === "string" ? "failure" : "success",
            ip_address: request.ip,
            metadata:
              typeof result === "string"
                ? { reason: result }
                : {
                    has_pending_change: "pending_change" in result && result.pending_change !== null
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
