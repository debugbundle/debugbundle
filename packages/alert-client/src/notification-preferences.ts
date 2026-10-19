import { z } from "zod";
import {
  NotificationSettingsResponseSchema,
  NotificationUpdateSchema,
  NotificationPauseSchema,
  NotificationResumeSchema,
  NotificationAudienceSchema,
  type NotificationSettingsResponse,
  type NotificationAudience
} from "../../shared-types/src/notification-preferences.js";

export type NotificationApiScope = {
  bearerToken: string;
  audience: NotificationAudience;
  projectId?: string;
};
export type NotificationAction = "get" | "update" | "pause" | "resume";
export interface NotificationHttpClient {
  request(input: {
    method: "GET" | "PATCH" | "POST";
    path: string;
    bearerToken: string;
    body?: unknown;
  }): Promise<{ status: number; body: unknown }>;
}
export class NotificationApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}
export interface NotificationApi {
  request(
    scope: NotificationApiScope,
    action: NotificationAction,
    body?: unknown
  ): Promise<NotificationSettingsResponse>;
}
export function createNotificationApi(http: NotificationHttpClient): NotificationApi {
  return {
    async request(scope: NotificationApiScope, action: NotificationAction, body?: unknown) {
      const audience = NotificationAudienceSchema.parse(scope.audience);
      const base =
        scope.projectId === undefined
          ? "/v1/account"
          : `/v1/projects/${z.string().uuid().parse(scope.projectId)}`;
      const payload =
        action === "get"
          ? undefined
          : action === "update"
            ? NotificationUpdateSchema.parse(body)
            : action === "pause"
              ? NotificationPauseSchema.parse(body)
              : NotificationResumeSchema.parse(body);
      const result = await http.request({
        method: action === "get" ? "GET" : action === "update" ? "PATCH" : "POST",
        path: `${base}/notification-preferences${action === "pause" || action === "resume" ? `/${action}` : ""}?audience=${audience}`,
        bearerToken: scope.bearerToken,
        ...(payload === undefined ? {} : { body: payload })
      });
      if (result.status !== 200) {
        const error = z.object({ error: z.string() }).safeParse(result.body);
        throw new NotificationApiError(
          result.status,
          error.success ? error.data.error : "notification_request_failed"
        );
      }
      const response = NotificationSettingsResponseSchema.safeParse(result.body);
      if (!response.success) throw new NotificationApiError(502, "invalid_notification_response");
      return response.data;
    }
  };
}
