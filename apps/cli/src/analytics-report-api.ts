import { z } from "zod";
import {
  ProjectSemanticFunnelQuerySchema,
  ProjectSemanticFunnelRecentQuerySchema,
  ProjectSemanticFunnelReportResponseSchema
} from "../../../packages/analytics-engine/src/funnel-report-protocol.js";

const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const QueryFields = ProjectSemanticFunnelQuerySchema.innerType().shape;
export const AnalyticsReportInputSchema = z
  .object({
    projectId: Id,
    reportKey: QueryFields.report_key,
    from: QueryFields.from,
    to: QueryFields.to
  })
  .strict()
  .refine(
    (value) =>
      ProjectSemanticFunnelQuerySchema.safeParse({
        report_key: value.reportKey,
        from: value.from,
        to: value.to
      }).success
  );
export type AnalyticsReportInput = z.infer<typeof AnalyticsReportInputSchema>;
export const AnalyticsReportRecentInputSchema = z
  .object({
    projectId: Id,
    reportKey: QueryFields.report_key,
    last: ProjectSemanticFunnelRecentQuerySchema.shape.last
  })
  .strict();
export const AnalyticsReportRequestSchema = z.union([
  AnalyticsReportInputSchema,
  AnalyticsReportRecentInputSchema
]);
export type AnalyticsReportRequest = z.infer<typeof AnalyticsReportRequestSchema>;
export type AnalyticsReportResponse = z.infer<typeof ProjectSemanticFunnelReportResponseSchema>;
export type AnalyticsReportApi = {
  execute(input: {
    bearerToken: string;
    query: AnalyticsReportRequest;
  }): Promise<AnalyticsReportResponse>;
};
export type AnalyticsReportHttpClient = {
  request(input: {
    method: "POST";
    path: string;
    bearerToken: string;
    body: unknown;
  }): Promise<{ status: number; body: unknown }>;
};
export class AnalyticsReportApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "AnalyticsReportApiError";
  }
}
const REASONS = new Set([
  "invalid_payload",
  "invalid_member_token",
  "forbidden",
  "project_not_found",
  "shared_access_suspended",
  "rate_limited",
  "analytics_reports_not_available",
  "analytics_report_invalid",
  "analytics_report_forbidden",
  "analytics_report_not_found",
  "analytics_report_insufficient_history"
]);

export function createAnalyticsReportApi(http: AnalyticsReportHttpClient): AnalyticsReportApi {
  return {
    async execute(input) {
      const parsed = AnalyticsReportRequestSchema.safeParse(input.query);
      if (!parsed.success)
        throw new AnalyticsReportApiError(400, "invalid_analytics_report_request");
      let response;
      try {
        response = await http.request({
          method: "POST",
          path: `/v1/analytics/scopes/project/${encodeURIComponent(parsed.data.projectId)}/reports/query`,
          bearerToken: input.bearerToken,
          body:
            "last" in parsed.data
              ? { report_key: parsed.data.reportKey, last: parsed.data.last }
              : { report_key: parsed.data.reportKey, from: parsed.data.from, to: parsed.data.to }
        });
      } catch {
        throw new AnalyticsReportApiError(0, "analytics_report_request_failed");
      }
      if (response.status !== 200) {
        const error = z.object({ error: z.string().max(80) }).safeParse(response.body);
        throw new AnalyticsReportApiError(
          response.status,
          error.success && REASONS.has(error.data.error)
            ? error.data.error
            : "analytics_report_request_failed"
        );
      }
      const result = ProjectSemanticFunnelReportResponseSchema.safeParse(response.body);
      if (!result.success)
        throw new AnalyticsReportApiError(500, "invalid_analytics_report_response");
      return result.data;
    }
  };
}
