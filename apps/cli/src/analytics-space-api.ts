import { z } from "zod";
import {
  AnalyticsSpaceChangeSchema,
  AnalyticsSpacePreviewSchema,
  AnalyticsSpaceResponseSchema,
  AnalyticsSpacesResponseSchema
} from "../../../packages/shared-types/src/index.js";

const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const AnalyticsSpaceListInputSchema = z.object({ organizationId: Id }).strict();
export const AnalyticsSpaceGetInputSchema = z.object({ spaceId: Id }).strict();
export const AnalyticsSpacePreviewInputSchema = z
  .object({ spaceId: Id.nullable(), change: AnalyticsSpaceChangeSchema })
  .strict();
export const AnalyticsSpaceApplyInputSchema = AnalyticsSpacePreviewInputSchema.extend({
  previewHash: z.string().regex(/^[a-f0-9]{64}$/)
});
export const AnalyticsSpaceOperationSchema = z.discriminatedUnion("operation", [
  AnalyticsSpaceListInputSchema.extend({ operation: z.literal("list") }),
  AnalyticsSpaceGetInputSchema.extend({ operation: z.literal("get") }),
  AnalyticsSpacePreviewInputSchema.extend({ operation: z.literal("preview") }),
  AnalyticsSpaceApplyInputSchema.extend({ operation: z.literal("apply") })
]);
export type AnalyticsSpaceOperation = z.infer<typeof AnalyticsSpaceOperationSchema>;
export type AnalyticsSpaceApiResponse =
  | z.infer<typeof AnalyticsSpacesResponseSchema>
  | z.infer<typeof AnalyticsSpaceResponseSchema>
  | z.infer<typeof AnalyticsSpacePreviewSchema>;
export type AnalyticsSpaceApi = {
  execute(input: {
    bearerToken: string;
    operation: AnalyticsSpaceOperation;
  }): Promise<AnalyticsSpaceApiResponse>;
};
export type AnalyticsSpaceHttpClient = {
  request(input: {
    method: "GET" | "POST";
    path: string;
    bearerToken: string;
    body?: unknown;
  }): Promise<{ status: number; body: unknown }>;
};
export class AnalyticsSpaceApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "AnalyticsSpaceApiError";
  }
}
const REASONS = new Set([
  "invalid_payload",
  "invalid_member_token",
  "forbidden",
  "rate_limited",
  "analytics_spaces_not_available",
  "analytics_space_not_found",
  "analytics_space_invalid",
  "analytics_space_forbidden",
  "analytics_space_conflict",
  "analytics_space_project_already_linked",
  "analytics_space_capacity_exceeded"
]);

export function createAnalyticsSpaceApi(http: AnalyticsSpaceHttpClient): AnalyticsSpaceApi {
  return {
    async execute(input) {
      const parsed = AnalyticsSpaceOperationSchema.safeParse(input.operation);
      if (!parsed.success) throw new AnalyticsSpaceApiError(400, "invalid_analytics_space_request");
      const operation = parsed.data;
      const collection = "/v1/analytics/spaces";
      const path =
        operation.operation === "list"
          ? `${collection}?organization_id=${encodeURIComponent(operation.organizationId)}`
          : `${collection}${operation.spaceId === null ? "" : `/${encodeURIComponent(operation.spaceId)}`}${operation.operation === "get" ? "" : `/${operation.operation}`}`;
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
          path,
          bearerToken: input.bearerToken,
          ...(body === undefined ? {} : { body })
        });
      } catch {
        throw new AnalyticsSpaceApiError(0, "analytics_space_request_failed");
      }
      if (response.status !== 200) {
        const error = z.object({ error: z.string().max(80) }).safeParse(response.body);
        throw new AnalyticsSpaceApiError(
          response.status,
          error.success && REASONS.has(error.data.error)
            ? error.data.error
            : "analytics_space_request_failed"
        );
      }
      const schema =
        operation.operation === "list"
          ? AnalyticsSpacesResponseSchema
          : operation.operation === "preview"
            ? AnalyticsSpacePreviewSchema
            : AnalyticsSpaceResponseSchema;
      const result = schema.safeParse(response.body);
      if (!result.success)
        throw new AnalyticsSpaceApiError(500, "invalid_analytics_space_response");
      return result.data;
    }
  };
}
