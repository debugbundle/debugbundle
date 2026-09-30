import { z } from "zod";
import {
  AnalyticsMeasurementPlanSchema,
  AnalyticsProjectPlanValidationResponseSchema,
  AnalyticsSpacePlanApplyResponseSchema,
  AnalyticsSpacePlanPreviewSchema,
  AnalyticsSpacePlanRecordSchema
} from "../../../packages/shared-types/src/index.js";

const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const Base = z.object({ spaceId: Id }).strict();
const WithPlan = Base.extend({ plan: AnalyticsMeasurementPlanSchema });
const Apply = WithPlan.extend({ previewHash: z.string().regex(/^[a-f0-9]{64}$/) });
export const AnalyticsSpacePlanGetInputSchema = Base;
export const AnalyticsSpacePlanValidateInputSchema = WithPlan;
export const AnalyticsSpacePlanPreviewInputSchema = WithPlan;
export const AnalyticsSpacePlanApplyInputSchema = Apply;
export const AnalyticsSpacePlanOperationSchema = z.discriminatedUnion("operation", [
  Base.extend({ operation: z.literal("get") }),
  WithPlan.extend({ operation: z.literal("validate") }),
  WithPlan.extend({ operation: z.literal("preview") }),
  Apply.extend({ operation: z.literal("apply") })
]);
export type AnalyticsSpacePlanOperation = z.infer<typeof AnalyticsSpacePlanOperationSchema>;
export type AnalyticsSpacePlanApiResponse =
  | z.infer<typeof AnalyticsSpacePlanRecordSchema>
  | z.infer<typeof AnalyticsProjectPlanValidationResponseSchema>
  | z.infer<typeof AnalyticsSpacePlanPreviewSchema>
  | z.infer<typeof AnalyticsSpacePlanApplyResponseSchema>;
export type AnalyticsSpacePlanApi = {
  execute(input: {
    bearerToken: string;
    operation: AnalyticsSpacePlanOperation;
  }): Promise<AnalyticsSpacePlanApiResponse>;
};
export type AnalyticsSpacePlanHttpClient = {
  request(input: {
    method: "GET" | "POST";
    path: string;
    bearerToken: string;
    body?: unknown;
  }): Promise<{ status: number; body: unknown }>;
};
export class AnalyticsSpacePlanApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "AnalyticsSpacePlanApiError";
  }
}
const REASONS = new Set([
  "invalid_payload",
  "invalid_member_token",
  "forbidden",
  "shared_access_suspended",
  "rate_limited",
  "analytics_space_plans_not_available",
  "analytics_space_plan_not_found",
  "analytics_space_plan_invalid",
  "analytics_space_plan_forbidden",
  "analytics_space_plan_conflict",
  "analytics_space_plan_mode_unavailable",
  "analytics_space_plan_capacity_exceeded"
]);

export function createAnalyticsSpacePlanApi(
  http: AnalyticsSpacePlanHttpClient
): AnalyticsSpacePlanApi {
  return {
    async execute(input) {
      const parsed = AnalyticsSpacePlanOperationSchema.safeParse(input.operation);
      if (!parsed.success)
        throw new AnalyticsSpacePlanApiError(400, "invalid_analytics_space_plan_request");
      const operation = parsed.data;
      if (
        operation.operation !== "get" &&
        (operation.plan.scope.kind !== "space" ||
          operation.plan.scope.space_id.toLowerCase() !== operation.spaceId)
      )
        throw new AnalyticsSpacePlanApiError(400, "invalid_analytics_space_plan_request");
      const path = `/v1/analytics/spaces/${encodeURIComponent(operation.spaceId)}/plan`;
      const body =
        operation.operation === "get"
          ? undefined
          : operation.operation === "apply"
            ? { plan: operation.plan, preview_hash: operation.previewHash }
            : operation.plan;
      let response;
      try {
        response = await http.request({
          method: body === undefined ? "GET" : "POST",
          path: body === undefined ? path : `${path}/${operation.operation}`,
          bearerToken: input.bearerToken,
          ...(body === undefined ? {} : { body })
        });
      } catch {
        throw new AnalyticsSpacePlanApiError(0, "analytics_space_plan_request_failed");
      }
      if (response.status !== 200) {
        const error = z.object({ error: z.string().max(80) }).safeParse(response.body);
        throw new AnalyticsSpacePlanApiError(
          response.status,
          error.success && REASONS.has(error.data.error)
            ? error.data.error
            : "analytics_space_plan_request_failed"
        );
      }
      const schema =
        operation.operation === "get"
          ? AnalyticsSpacePlanRecordSchema
          : operation.operation === "validate"
            ? AnalyticsProjectPlanValidationResponseSchema
            : operation.operation === "preview"
              ? AnalyticsSpacePlanPreviewSchema
              : AnalyticsSpacePlanApplyResponseSchema;
      const result = schema.safeParse(response.body);
      if (!result.success)
        throw new AnalyticsSpacePlanApiError(500, "invalid_analytics_space_plan_response");
      return result.data;
    }
  };
}
