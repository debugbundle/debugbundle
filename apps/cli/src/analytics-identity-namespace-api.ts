import { z } from "zod";
import {
  AnalyticsIdentityNamespaceApplySchema,
  AnalyticsIdentityNamespaceChangeSchema,
  AnalyticsIdentityNamespacePreviewSchema,
  AnalyticsIdentityNamespaceRecordSchema
} from "../../../packages/shared-types/src/index.js";

const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const AnalyticsIdentityNamespaceGetInputSchema = z.object({ projectId: Id }).strict();
export const AnalyticsIdentityNamespacePreviewInputSchema = z
  .object({ projectId: Id, change: AnalyticsIdentityNamespaceChangeSchema })
  .strict();
export const AnalyticsIdentityNamespaceApplyInputSchema =
  AnalyticsIdentityNamespacePreviewInputSchema.extend({
    previewHash: z.string().regex(/^[a-f0-9]{64}$/)
  });
export const AnalyticsIdentityNamespaceOperationSchema = z.discriminatedUnion("operation", [
  AnalyticsIdentityNamespaceGetInputSchema.extend({ operation: z.literal("get") }),
  AnalyticsIdentityNamespacePreviewInputSchema.extend({ operation: z.literal("preview") }),
  AnalyticsIdentityNamespaceApplyInputSchema.extend({ operation: z.literal("apply") })
]);
export type AnalyticsIdentityNamespaceOperation = z.infer<
  typeof AnalyticsIdentityNamespaceOperationSchema
>;
export type AnalyticsIdentityNamespaceApiResponse =
  | z.infer<typeof AnalyticsIdentityNamespaceRecordSchema>
  | z.infer<typeof AnalyticsIdentityNamespacePreviewSchema>
  | z.infer<typeof AnalyticsIdentityNamespaceApplySchema>;
export type AnalyticsIdentityNamespaceApi = {
  execute(input: {
    bearerToken: string;
    operation: AnalyticsIdentityNamespaceOperation;
  }): Promise<AnalyticsIdentityNamespaceApiResponse>;
};
export type AnalyticsIdentityNamespaceHttpClient = {
  request(input: {
    method: "GET" | "POST";
    path: string;
    bearerToken: string;
    body?: unknown;
  }): Promise<{ status: number; body: unknown }>;
};
export class AnalyticsIdentityNamespaceApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "AnalyticsIdentityNamespaceApiError";
  }
}
const REASONS = new Set([
  "invalid_payload",
  "invalid_member_token",
  "forbidden",
  "shared_access_suspended",
  "rate_limited",
  "analytics_identity_namespace_not_found",
  "analytics_identity_namespace_unavailable",
  "analytics_identity_namespace_invalid",
  "analytics_identity_namespace_forbidden",
  "analytics_identity_namespace_conflict"
]);

export function createAnalyticsIdentityNamespaceApi(
  http: AnalyticsIdentityNamespaceHttpClient
): AnalyticsIdentityNamespaceApi {
  return {
    async execute(input) {
      const parsed = AnalyticsIdentityNamespaceOperationSchema.safeParse(input.operation);
      if (!parsed.success)
        throw new AnalyticsIdentityNamespaceApiError(
          400,
          "invalid_analytics_identity_namespace_request"
        );
      const operation = parsed.data;
      const path = `/v1/projects/${encodeURIComponent(operation.projectId)}/analytics/identity-namespace`;
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
        throw new AnalyticsIdentityNamespaceApiError(
          0,
          "analytics_identity_namespace_request_failed"
        );
      }
      if (response.status !== 200) {
        const error = z.object({ error: z.string().max(80) }).safeParse(response.body);
        throw new AnalyticsIdentityNamespaceApiError(
          response.status,
          error.success && REASONS.has(error.data.error)
            ? error.data.error
            : "analytics_identity_namespace_request_failed"
        );
      }
      const schema =
        operation.operation === "get"
          ? AnalyticsIdentityNamespaceRecordSchema
          : operation.operation === "preview"
            ? AnalyticsIdentityNamespacePreviewSchema
            : AnalyticsIdentityNamespaceApplySchema;
      const result = schema.safeParse(response.body);
      if (!result.success)
        throw new AnalyticsIdentityNamespaceApiError(
          500,
          "invalid_analytics_identity_namespace_response"
        );
      return result.data;
    }
  };
}
