import { z } from "zod";
import {
  AnalyticsMeasurementPlanSchema,
  AnalyticsProjectPlanApplyResponseSchema,
  AnalyticsProjectPlanPreviewSchema,
  AnalyticsProjectPlanRecordSchema,
  AnalyticsProjectPlanValidationResponseSchema
} from "../../../packages/shared-types/src/index.js";

const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const Base = z.object({ projectId: Id }).strict();
const WithPlan = z.object({ projectId: Id, plan: AnalyticsMeasurementPlanSchema }).strict();
const Apply = WithPlan.extend({ previewHash: z.string().regex(/^[a-f0-9]{64}$/) });
export const AnalyticsPlanGetInputSchema = Base;
export const AnalyticsPlanValidateInputSchema = WithPlan;
export const AnalyticsPlanPreviewInputSchema = WithPlan;
export const AnalyticsPlanApplyInputSchema = Apply;
export const AnalyticsPlanOperationSchema = z.discriminatedUnion("operation", [
  Base.extend({ operation: z.literal("get") }),
  WithPlan.extend({ operation: z.literal("validate") }),
  WithPlan.extend({ operation: z.literal("preview") }),
  Apply.extend({ operation: z.literal("apply") })
]);
export type AnalyticsPlanOperation = z.infer<typeof AnalyticsPlanOperationSchema>;
export type AnalyticsPlanApiResponse =
  | z.infer<typeof AnalyticsProjectPlanRecordSchema>
  | z.infer<typeof AnalyticsProjectPlanValidationResponseSchema>
  | z.infer<typeof AnalyticsProjectPlanPreviewSchema>
  | z.infer<typeof AnalyticsProjectPlanApplyResponseSchema>;
export type AnalyticsPlanApi = {
  execute(input: {
    bearerToken: string;
    operation: AnalyticsPlanOperation;
  }): Promise<AnalyticsPlanApiResponse>;
};
export type AnalyticsPlanHttpClient = {
  request(input: {
    method: "GET" | "POST";
    path: string;
    bearerToken: string;
    body?: unknown;
  }): Promise<{ status: number; body: unknown }>;
};
export class AnalyticsPlanApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "AnalyticsPlanApiError";
  }
}
const REASONS = new Set([
  "invalid_payload",
  "invalid_member_token",
  "forbidden",
  "project_not_found",
  "shared_access_suspended",
  "rate_limited",
  "analytics_plans_not_available",
  "analytics_plan_not_found",
  "analytics_plan_invalid",
  "analytics_plan_forbidden",
  "analytics_plan_conflict",
  "analytics_plan_capacity_exceeded"
]);

export function createAnalyticsPlanApi(http: AnalyticsPlanHttpClient): AnalyticsPlanApi {
  return {
    async execute(input) {
      const parsed = AnalyticsPlanOperationSchema.safeParse(input.operation);
      if (!parsed.success) throw new AnalyticsPlanApiError(400, "invalid_analytics_plan_request");
      const operation = parsed.data;
      if (
        operation.operation !== "get" &&
        (operation.plan.scope.kind !== "project" ||
          operation.plan.scope.project_id.toLowerCase() !== operation.projectId)
      )
        throw new AnalyticsPlanApiError(400, "invalid_analytics_plan_request");
      const path = `/v1/projects/${encodeURIComponent(operation.projectId)}/analytics/plan`;
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
        throw new AnalyticsPlanApiError(0, "analytics_plan_request_failed");
      }
      if (response.status !== 200) {
        const error = z.object({ error: z.string().max(80) }).safeParse(response.body);
        throw new AnalyticsPlanApiError(
          response.status,
          error.success && REASONS.has(error.data.error)
            ? error.data.error
            : "analytics_plan_request_failed"
        );
      }
      const schema =
        operation.operation === "get"
          ? AnalyticsProjectPlanRecordSchema
          : operation.operation === "validate"
            ? AnalyticsProjectPlanValidationResponseSchema
            : operation.operation === "preview"
              ? AnalyticsProjectPlanPreviewSchema
              : AnalyticsProjectPlanApplyResponseSchema;
      const result = schema.safeParse(response.body);
      if (!result.success) throw new AnalyticsPlanApiError(500, "invalid_analytics_plan_response");
      return result.data;
    }
  };
}
