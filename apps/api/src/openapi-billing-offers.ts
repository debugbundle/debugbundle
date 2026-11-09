import { z, anyMemberAuth, component, type OperationSpec } from "./openapi-model.js";
import { apiError } from "./openapi-components.js";
import {
  BillingOfferSelectionSchema,
  BillingOfferQuoteSchema,
  BillingOfferStatusSchema,
  BillingOfferChangeStateSchema
} from "../../../packages/shared-types/src/index.js";
import {
  BillingPlanChangeConfirmSchema,
  BillingPlanChangeCancelSchema
} from "../../../packages/billing-client/src/plan-change.js";

export function billingOfferOperations(): OperationSpec[] {
  return (["status", "preview", "schedule", "cancel"] as const).map((action) => ({
    method: action === "status" ? "get" : action === "cancel" ? "delete" : "post",
    path: `/v1/billing/offers/change${action === "preview" ? "/preview" : ""}`,
    operationId: `${action}BillingOfferChange`,
    summary: `${action} an explicit tier/interval change at paid renewal`,
    tags: ["Billing"],
    security: anyMemberAuth,
    ...(action === "status"
      ? {}
      : {
          requestBody: component(
            `BillingOfferChange${action}Body`,
            action === "preview"
              ? BillingOfferSelectionSchema
              : action === "schedule"
                ? BillingPlanChangeConfirmSchema
                : BillingPlanChangeCancelSchema
          )
        }),
    responses: {
      "200": {
        description:
          action === "status"
            ? "Current provider interval, unit prices and paid term, plus the exact known pending change. Monthly allowances are separate."
            : action === "preview"
              ? "Ten-minute actor-bound recurring-total quote. No payment or schedule mutation; show full amount and feature loss before confirmation."
              : "Exact pending change or null. Purchased quantity is retained; cancellation releases only the verified schedule ID.",
        schema: component(
          action === "status"
            ? "BillingOfferStatus"
            : action === "preview"
              ? "BillingOfferChangePreview"
              : "BillingOfferChangeState",
          action === "status"
            ? BillingOfferStatusSchema
            : action === "preview"
              ? z.object({ quote: BillingOfferQuoteSchema }).strict()
              : BillingOfferChangeStateSchema
        )
      },
      "400": { description: "Invalid or incomplete offer selection.", schema: apiError },
      "401": { description: "Invalid session or member token.", schema: apiError },
      "403": {
        description: "Current Owner required; browser writes require verified email and CSRF.",
        schema: apiError
      },
      "409": {
        description: "Stale quote, conflicting operation or unsupported subscription state.",
        schema: apiError
      },
      "429": { description: "Rate limit reached.", schema: apiError },
      "503": {
        description: "Provider unavailable or not configured; uncertain commands remain reserved.",
        schema: apiError
      }
    }
  }));
}
