import {
  createPlanChangeClient,
  type PlanChangeRequest,
  type PlanChangeResponse
} from "../../../../packages/billing-client/src/plan-change-client.js";
import { API_BASE, buildBrowserSessionHeaders } from "./api-client.js";

const requestPlanChange = createPlanChangeClient(
  {
    async request(input) {
      const response = await fetch(`${API_BASE}${input.path}`, {
        method: input.method,
        credentials: "include",
        cache: "no-store",
        ...(input.body === undefined
          ? {}
          : { headers: buildBrowserSessionHeaders(true), body: JSON.stringify(input.body) })
      });
      return { status: response.status, body: (await response.json()) as unknown };
    }
  },
  (_status, body) => {
    throw new Error(
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : "billing_service_error"
    );
  }
);
export const getBillingPlanChange = (): Promise<PlanChangeResponse> =>
  requestPlanChange({ bearerToken: "", action: "status" });
export const previewBillingPlanChange = (): Promise<PlanChangeResponse> =>
  requestPlanChange({ bearerToken: "", action: "preview" });
export const scheduleBillingPlanChange = (confirmationToken: string): Promise<PlanChangeResponse> =>
  requestPlanChange({ bearerToken: "", action: "schedule", confirmationToken });
export const cancelBillingPlanChange = (scheduleId: string): Promise<PlanChangeResponse> =>
  requestPlanChange({ bearerToken: "", action: "cancel", scheduleId });
export type { PlanChangeRequest };
