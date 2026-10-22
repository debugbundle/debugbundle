import {
  BillingPlanChangeConfirmSchema,
  BillingPlanChangeCancelSchema,
  BillingPlanChangeStateSchema,
  BillingPlanChangePreviewSchema,
  type BillingPlanChangeQuote,
  type BillingPlanChangeState
} from "./plan-change.js";
import type { HttpClient } from "./index.js";

export type PlanChangeRequest = { bearerToken: string } & (
  | { action: "status" | "preview" }
  | { action: "schedule"; confirmationToken: string }
  | { action: "cancel"; scheduleId: string }
);
export type PlanChangeResponse = BillingPlanChangeState | { quote: BillingPlanChangeQuote };
export function createPlanChangeClient(
  client: HttpClient,
  fail: (status: number, body: unknown) => never
) {
  return async (input: PlanChangeRequest): Promise<PlanChangeResponse> => {
    const body =
      input.action === "schedule"
        ? BillingPlanChangeConfirmSchema.parse({ confirmation_token: input.confirmationToken })
        : input.action === "cancel"
          ? BillingPlanChangeCancelSchema.parse({ schedule_id: input.scheduleId })
          : {};
    const response = await client.request({
      method: input.action === "status" ? "GET" : input.action === "cancel" ? "DELETE" : "POST",
      path: `/v1/billing/plan-change${input.action === "preview" ? "/preview" : ""}`,
      bearerToken: input.bearerToken,
      ...(input.action === "status" ? {} : { body })
    });
    if (response.status < 200 || response.status >= 300) fail(response.status, response.body);
    const parsed = (
      input.action === "preview" ? BillingPlanChangePreviewSchema : BillingPlanChangeStateSchema
    ).safeParse(response.body);
    if (!parsed.success) fail(response.status, { error: "invalid_response_shape" });
    return parsed.data;
  };
}
