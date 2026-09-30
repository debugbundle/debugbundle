import { z } from "zod";
import {
  AnalyticsWriterApplyResultSchema,
  AnalyticsWriterChangeSchema,
  AnalyticsWriterListSchema,
  AnalyticsWriterPreviewSchema
} from "../../../packages/shared-types/src/index.js";

const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const AnalyticsWriterListInputSchema = z.object({ projectId: Id }).strict();
export const AnalyticsWriterPreviewInputSchema = z
  .object({ projectId: Id, change: AnalyticsWriterChangeSchema })
  .strict();
export const AnalyticsWriterApplyInputSchema = AnalyticsWriterPreviewInputSchema.extend({
  previewHash: z.string().regex(/^[a-f0-9]{64}$/)
});
export const AnalyticsWriterOperationSchema = z.discriminatedUnion("operation", [
  AnalyticsWriterListInputSchema.extend({ operation: z.literal("list") }),
  AnalyticsWriterPreviewInputSchema.extend({ operation: z.literal("preview") }),
  AnalyticsWriterApplyInputSchema.extend({ operation: z.literal("apply") })
]);
export type AnalyticsWriterOperation = z.infer<typeof AnalyticsWriterOperationSchema>;
export type AnalyticsWriterApiResponse =
  | z.infer<typeof AnalyticsWriterListSchema>
  | z.infer<typeof AnalyticsWriterPreviewSchema>
  | z.infer<typeof AnalyticsWriterApplyResultSchema>;
export type AnalyticsWriterApi = {
  execute(input: {
    bearerToken: string;
    operation: AnalyticsWriterOperation;
  }): Promise<AnalyticsWriterApiResponse>;
};
export type AnalyticsWriterHttpClient = {
  request(input: {
    method: "GET" | "POST";
    path: string;
    bearerToken: string;
    body?: unknown;
  }): Promise<{ status: number; body: unknown }>;
};
export class AnalyticsWriterApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "AnalyticsWriterApiError";
  }
}
const REASONS = new Set([
  "invalid_payload",
  "invalid_member_token",
  "forbidden",
  "project_not_found",
  "shared_access_suspended",
  "rate_limited",
  "analytics_writers_not_available",
  "analytics_writer_invalid",
  "analytics_writer_forbidden",
  "analytics_writer_conflict",
  "analytics_writer_capacity_exceeded"
]);

export function createAnalyticsWriterApi(http: AnalyticsWriterHttpClient): AnalyticsWriterApi {
  return {
    async execute(input) {
      const parsed = AnalyticsWriterOperationSchema.safeParse(input.operation);
      if (!parsed.success)
        throw new AnalyticsWriterApiError(400, "invalid_analytics_writer_request");
      const operation = parsed.data;
      const path = `/v1/projects/${encodeURIComponent(operation.projectId)}/analytics/writers`;
      const body =
        operation.operation === "preview"
          ? operation.change
          : operation.operation === "apply"
            ? { change: operation.change, preview_hash: operation.previewHash }
            : undefined;
      let response;
      try {
        response = await http.request({
          method: body === undefined ? "GET" : "POST",
          path: body === undefined ? path : `${path}/${operation.operation}`,
          bearerToken: input.bearerToken,
          ...(body === undefined ? {} : { body })
        });
      } catch {
        throw new AnalyticsWriterApiError(0, "analytics_writer_request_failed");
      }
      if (response.status !== 200) {
        const error = z.object({ error: z.string().max(80) }).safeParse(response.body);
        throw new AnalyticsWriterApiError(
          response.status,
          error.success && REASONS.has(error.data.error)
            ? error.data.error
            : "analytics_writer_request_failed"
        );
      }
      const schema =
        operation.operation === "list"
          ? AnalyticsWriterListSchema
          : operation.operation === "preview"
            ? AnalyticsWriterPreviewSchema
            : AnalyticsWriterApplyResultSchema;
      const result = schema.safeParse(response.body);
      if (!result.success)
        throw new AnalyticsWriterApiError(500, "invalid_analytics_writer_response");
      return result.data;
    }
  };
}
