import { z } from "zod";
import {
  createReportRequest,
  reportPayload,
  reportResourceId,
  type ReportHttpClient,
  type ReportScope
} from "../../report-client/src/http.js";
import {
  ReviewSettingsSchema,
  ReviewSettingsCommandSchema,
  ReviewRecordSchema,
  ReviewArtifactSchema,
  ReviewStatusSchema,
  ReviewListQuerySchema,
  ReviewAllowanceSchema
} from "../../smart-improvements/src/review-contract.js";
export { ReportApiError as ImprovementReviewApiError } from "../../report-client/src/http.js";
export interface ImprovementReviewApi {
  settings(scope: ReportScope): Promise<z.infer<typeof ReviewSettingsSchema>>;
  update(
    scope: ReportScope & { command: z.input<typeof ReviewSettingsCommandSchema> }
  ): Promise<z.infer<typeof ReviewSettingsSchema>>;
  allowance(scope: ReportScope): Promise<z.infer<typeof ReviewAllowanceSchema>>;
  list(
    scope: ReportScope & { query?: z.input<typeof ReviewListQuerySchema> | undefined }
  ): Promise<{ reviews: z.infer<typeof ReviewRecordSchema>[]; next_cursor: string | null }>;
  get(scope: ReportScope & { reviewId: string }): Promise<z.infer<typeof ReviewRecordSchema>>;
  bundle(scope: ReportScope & { reviewId: string }): Promise<{
    bundle: z.infer<typeof ReviewArtifactSchema> | null;
    status: z.infer<typeof ReviewStatusSchema>;
  }>;
}
export function createImprovementReviewApi(client: ReportHttpClient): ImprovementReviewApi {
  const request = createReportRequest(client);
  const base = (scope: ReportScope): string =>
    `/v1/organizations/${reportResourceId(scope.organizationId)}/improvements/reviews`;
  return {
    async settings(scope: ReportScope) {
      return (
        await request(
          scope,
          "GET",
          `${base(scope)}/settings`,
          z.object({ settings: ReviewSettingsSchema }).strict()
        )
      ).settings;
    },
    async update(scope: ReportScope & { command: z.input<typeof ReviewSettingsCommandSchema> }) {
      return (
        await request(
          scope,
          "PATCH",
          `${base(scope)}/settings`,
          z.object({ settings: ReviewSettingsSchema }).strict(),
          reportPayload(ReviewSettingsCommandSchema, scope.command)
        )
      ).settings;
    },
    async allowance(scope: ReportScope) {
      return (
        await request(
          scope,
          "GET",
          `${base(scope)}/allowance`,
          z.object({ allowance: ReviewAllowanceSchema }).strict()
        )
      ).allowance;
    },
    async list(scope: ReportScope & { query?: z.input<typeof ReviewListQuerySchema> | undefined }) {
      const query = reportPayload(ReviewListQuerySchema, scope.query ?? {}),
        params = new URLSearchParams({ limit: String(query.limit) });
      if (query.project_id) params.set("project_id", query.project_id);
      if (query.cursor) params.set("cursor", query.cursor);
      return request(
        scope,
        "GET",
        `${base(scope)}?${params}`,
        z
          .object({
            reviews: z.array(ReviewRecordSchema).max(50),
            next_cursor: z.string().nullable()
          })
          .strict()
      );
    },
    async get(scope: ReportScope & { reviewId: string }) {
      return (
        await request(
          scope,
          "GET",
          `${base(scope)}/${reportResourceId(scope.reviewId)}`,
          z.object({ review: ReviewRecordSchema }).strict()
        )
      ).review;
    },
    async bundle(scope: ReportScope & { reviewId: string }) {
      return request(
        scope,
        "GET",
        `${base(scope)}/${reportResourceId(scope.reviewId)}/bundle`,
        z.object({ bundle: ReviewArtifactSchema.nullable(), status: ReviewStatusSchema }).strict()
      );
    }
  };
}
