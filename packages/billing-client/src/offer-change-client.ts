import { z } from "zod";
import {
  BillingOfferSelectionSchema,
  BillingOfferQuoteSchema,
  BillingOfferStatusSchema,
  BillingOfferChangeStateSchema,
  type BillingOfferQuote,
  type BillingOfferStatus,
  type BillingOfferChangeState,
  type PaidTierName,
  type BillingInterval
} from "../../shared-types/src/index.js";
import {
  BillingPlanChangeCancelSchema,
  BillingPlanChangeConfirmSchema,
  type BillingPlanChangeError
} from "./plan-change.js";
import type { HttpClient } from "./index.js";

export const OfferChangeRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), bearerToken: z.string().min(1) }).strict(),
  z
    .object({
      action: z.literal("preview"),
      bearerToken: z.string().min(1),
      targetPlan: z.enum(["solo", "team", "business"]),
      interval: z.enum(["month", "year"])
    })
    .strict(),
  z
    .object({
      action: z.literal("schedule"),
      bearerToken: z.string().min(1),
      confirmationToken: z.string().min(1).max(8192)
    })
    .strict(),
  z
    .object({
      action: z.literal("cancel"),
      bearerToken: z.string().min(1),
      scheduleId: z.string().min(1).max(255)
    })
    .strict()
]);
export type OfferChangeRequest = z.infer<typeof OfferChangeRequestSchema>;
export type OfferChangeResponse =
  | BillingOfferStatus
  | BillingOfferChangeState
  | { quote: BillingOfferQuote };
type ActorContext = { organization_id: string; actor_user_id: string };
export interface BillingOfferChangeManagement {
  getOfferChange(input: ActorContext): Promise<BillingOfferStatus | BillingPlanChangeError>;
  previewOfferChange(
    input: ActorContext & { target_plan: PaidTierName; interval: BillingInterval }
  ): Promise<{ quote: BillingOfferQuote } | BillingPlanChangeError>;
  scheduleOfferChange(
    input: ActorContext & { confirmation_token: string }
  ): Promise<BillingOfferChangeState | BillingPlanChangeError>;
  cancelOfferChange(
    input: ActorContext & { schedule_id: string }
  ): Promise<BillingOfferChangeState | BillingPlanChangeError>;
}

export function createOfferChangeClient(
  client: HttpClient,
  fail: (status: number, body: unknown) => never
): (input: OfferChangeRequest) => Promise<OfferChangeResponse> {
  return async (input) => {
    input = OfferChangeRequestSchema.parse(input);
    const body =
      input.action === "preview"
        ? BillingOfferSelectionSchema.parse({
            target_plan: input.targetPlan,
            interval: input.interval
          })
        : input.action === "schedule"
          ? BillingPlanChangeConfirmSchema.parse({ confirmation_token: input.confirmationToken })
          : input.action === "cancel"
            ? BillingPlanChangeCancelSchema.parse({ schedule_id: input.scheduleId })
            : {};
    const response = await client.request({
      method: input.action === "status" ? "GET" : input.action === "cancel" ? "DELETE" : "POST",
      path: `/v1/billing/offers/change${input.action === "preview" ? "/preview" : ""}`,
      bearerToken: input.bearerToken,
      ...(input.action === "status" ? {} : { body })
    });
    if (response.status < 200 || response.status >= 300) fail(response.status, response.body);
    const parsed = (
      input.action === "status"
        ? BillingOfferStatusSchema
        : input.action === "preview"
          ? z.object({ quote: BillingOfferQuoteSchema }).strict()
          : BillingOfferChangeStateSchema
    ).safeParse(response.body);
    if (!parsed.success) fail(response.status, { error: "invalid_response_shape" });
    return parsed.data;
  };
}
