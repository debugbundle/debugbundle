import { z } from "zod";
import { AnalyticsSubjectErasureTaskStatusSchema } from "../../../packages/shared-types/src/index.js";

const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const AnalyticsErasureStatusInputSchema = z.object({ projectId: Id, taskId: Id }).strict();
export type AnalyticsErasureStatusInput = z.infer<typeof AnalyticsErasureStatusInputSchema>;
export type AnalyticsErasureStatusApi = {
  read(input: {
    bearerToken: string;
    query: AnalyticsErasureStatusInput;
  }): Promise<z.infer<typeof AnalyticsSubjectErasureTaskStatusSchema>>;
};
export type AnalyticsErasureStatusHttpClient = {
  request(input: {
    method: "GET";
    path: string;
    bearerToken: string;
  }): Promise<{ status: number; body: unknown }>;
};
export class AnalyticsErasureStatusApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "AnalyticsErasureStatusApiError";
  }
}
const REASONS = new Set([
  "invalid_payload",
  "invalid_member_token",
  "forbidden",
  "analytics_erasure_invalid",
  "analytics_erasure_forbidden",
  "analytics_erasure_not_found",
  "analytics_identity_unavailable",
  "rate_limited"
]);

export function createAnalyticsErasureStatusApi(
  http: AnalyticsErasureStatusHttpClient
): AnalyticsErasureStatusApi {
  return {
    async read(input) {
      const parsed = AnalyticsErasureStatusInputSchema.safeParse(input.query);
      if (!parsed.success)
        throw new AnalyticsErasureStatusApiError(400, "invalid_analytics_erasure_status_request");
      let response;
      try {
        response = await http.request({
          method: "GET",
          path: `/v1/projects/${encodeURIComponent(parsed.data.projectId)}/analytics/identity/erasures/${encodeURIComponent(parsed.data.taskId)}`,
          bearerToken: input.bearerToken
        });
      } catch {
        throw new AnalyticsErasureStatusApiError(0, "analytics_erasure_status_request_failed");
      }
      if (response.status !== 200) {
        const error = z.object({ error: z.string().max(80) }).safeParse(response.body);
        throw new AnalyticsErasureStatusApiError(
          response.status,
          error.success && REASONS.has(error.data.error)
            ? error.data.error
            : "analytics_erasure_status_request_failed"
        );
      }
      const task = AnalyticsSubjectErasureTaskStatusSchema.safeParse(response.body);
      if (
        !task.success ||
        task.data.project_id !== parsed.data.projectId ||
        task.data.task_id !== parsed.data.taskId
      )
        throw new AnalyticsErasureStatusApiError(500, "invalid_analytics_erasure_status_response");
      return task.data;
    }
  };
}
