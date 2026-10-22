import { z, anyMemberAuth, component, type OperationSpec } from "./openapi-model.js";
import { apiError } from "./openapi-components.js";
import {
  BillingPlanChangePreviewSchema,
  BillingPlanChangeStateSchema,
  BillingPlanChangeConfirmSchema,
  BillingPlanChangeCancelSchema
} from "../../../packages/billing-client/src/plan-change.js";

export function billingPlanChangeOperations(): OperationSpec[] {
  return (["status", "preview", "schedule", "cancel"] as const).map((action) => ({
    method: action === "status" ? "get" : action === "cancel" ? "delete" : "post",
    path: `/v1/billing/plan-change${action === "preview" ? "/preview" : ""}`,
    operationId: `${action}BillingPlanChange`,
    summary: `${action} a same-subscription Team to Solo change at renewal`,
    tags: ["Billing"],
    security: anyMemberAuth,
    ...(action === "status"
      ? {}
      : {
          requestBody: component(
            `BillingPlanChange${action}Body`,
            action === "schedule"
              ? BillingPlanChangeConfirmSchema
              : action === "cancel"
                ? BillingPlanChangeCancelSchema
                : z.object({}).strict()
          )
        }),
    responses: {
      "200": {
        description:
          action === "preview"
            ? "Ten-minute signed renewal quote; no charge or schedule created. Show effective date, retained extra units and Team feature loss before confirmation."
            : "Current owned pending change, or null. Team access remains until renewal. Cancellation releases only the supplied schedule ID.",
        schema: component(
          action === "preview" ? "BillingPlanChangePreview" : "BillingPlanChangeState",
          action === "preview" ? BillingPlanChangePreviewSchema : BillingPlanChangeStateSchema
        )
      },
      "400": { description: "Invalid payload.", schema: apiError },
      "401": { description: "Invalid session or member token.", schema: apiError },
      "403": {
        description: "Owner access required; browser writes require CSRF and a verified email.",
        schema: apiError
      },
      "409": {
        description: "Changed quote, conflicting payment/schedule, or unsafe subscription state.",
        schema: apiError
      },
      "429": { description: "Rate limit reached.", schema: apiError },
      "503": {
        description: "Billing service unavailable; retry the same confirmed request.",
        schema: apiError
      }
    }
  }));
}
