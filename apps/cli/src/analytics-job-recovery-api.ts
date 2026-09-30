import { z } from "zod";
import { AnalyticsSemanticJobRetryResponseSchema } from "../../../packages/shared-types/src/index.js";

const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const AnalyticsJobRecoveryInputSchema = z.object({ projectId: Id, eventId: Id }).strict();
export type AnalyticsJobRecoveryInput = z.infer<typeof AnalyticsJobRecoveryInputSchema>;
export type AnalyticsJobRecoveryApi = {
  retry(input: {
    bearerToken: string;
    retry: AnalyticsJobRecoveryInput;
  }): Promise<z.infer<typeof AnalyticsSemanticJobRetryResponseSchema>>;
};
export type AnalyticsJobRecoveryHttpClient = {
  request(input: {
    method: "POST";
    path: string;
    bearerToken: string;
  }): Promise<{ status: number; body: unknown }>;
};
export class AnalyticsJobRecoveryApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "AnalyticsJobRecoveryApiError";
  }
}
const REASONS = new Set([
  "invalid_payload",
  "invalid_member_token",
  "forbidden",
  "project_not_found",
  "shared_access_suspended",
  "rate_limited",
  "analytics_job_recovery_unavailable",
  "analytics_job_recovery_invalid",
  "analytics_job_recovery_forbidden"
]);

export function createAnalyticsJobRecoveryApi(
  http: AnalyticsJobRecoveryHttpClient
): AnalyticsJobRecoveryApi {
  return {
    async retry(input) {
      const parsed = AnalyticsJobRecoveryInputSchema.safeParse(input.retry);
      if (!parsed.success)
        throw new AnalyticsJobRecoveryApiError(400, "invalid_analytics_job_recovery_request");
      let response;
      try {
        response = await http.request({
          method: "POST",
          path: `/v1/projects/${encodeURIComponent(parsed.data.projectId)}/analytics/events/${encodeURIComponent(parsed.data.eventId)}/retry`,
          bearerToken: input.bearerToken
        });
      } catch {
        throw new AnalyticsJobRecoveryApiError(0, "analytics_job_recovery_request_failed");
      }
      if (response.status !== 202) {
        const error = z.object({ error: z.string().max(80) }).safeParse(response.body);
        throw new AnalyticsJobRecoveryApiError(
          response.status,
          error.success && REASONS.has(error.data.error)
            ? error.data.error
            : "analytics_job_recovery_request_failed"
        );
      }
      const result = AnalyticsSemanticJobRetryResponseSchema.safeParse(response.body);
      if (
        !result.success ||
        result.data.project_id !== parsed.data.projectId ||
        result.data.event_id !== parsed.data.eventId
      )
        throw new AnalyticsJobRecoveryApiError(500, "invalid_analytics_job_recovery_response");
      return result.data;
    }
  };
}
