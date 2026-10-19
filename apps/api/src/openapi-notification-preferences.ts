import { z } from "zod";
import {
  NotificationAudienceSchema,
  NotificationSettingsResponseSchema,
  NotificationUpdateSchema,
  NotificationPauseSchema,
  NotificationResumeSchema
} from "../../../packages/shared-types/src/notification-preferences.js";
import { anyMemberAuth, component, type OperationSpec } from "./openapi-model.js";
import { apiError } from "./openapi-components.js";
export function notificationPreferencesOperations(): OperationSpec[] {
  return [false, true].flatMap((project) =>
    (["get", "update", "pause", "resume"] as const).map(
      (action): OperationSpec => ({
        method: action === "get" ? "get" : action === "update" ? "patch" : "post",
        path: `/v1/${project ? "projects/{id}" : "account"}/notification-preferences${action === "pause" || action === "resume" ? `/${action}` : ""}`,
        operationId: `${action}${project ? "Project" : "Account"}NotificationPreferences`,
        summary: `${action} ${project ? "project" : "account"} notification preferences; shared mutations require owner/admin permission`,
        tags: ["Notifications"],
        security: anyMemberAuth,
        ...(project ? { params: z.object({ id: z.string().uuid() }) } : {}),
        query: z.object({ audience: NotificationAudienceSchema.default("personal") }),
        ...(action === "get"
          ? {}
          : {
              requestBody: component(
                `Notification${action}`,
                action === "pause"
                  ? NotificationPauseSchema
                  : action === "resume"
                    ? NotificationResumeSchema
                    : NotificationUpdateSchema
              )
            }),
        responses: {
          "200": {
            description:
              "Saved preferences, inherited account defaults and effective channel policy. Pauses preserve modes; daily email sends unresolved new/reopened incidents, with health checks immediate.",
            schema: component("NotificationSettingsResponse", NotificationSettingsResponseSchema)
          },
          "400": {
            description: "Invalid scope, channel, timezone, mode or pause end.",
            schema: apiError
          },
          "401": { description: "Member authentication required.", schema: apiError },
          "403": {
            description: "Shared management permission or session CSRF token required.",
            schema: apiError
          },
          "404": { description: "Project unavailable.", schema: apiError },
          "429": { description: "Rate limited.", schema: apiError },
          "500": {
            description: "Could not read or save preferences; internal details are withheld.",
            schema: apiError
          },
          "503": { description: "Notification settings unavailable.", schema: apiError }
        }
      })
    )
  );
}
