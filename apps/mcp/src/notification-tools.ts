import { z } from "zod";
import {
  NotificationAudienceSchema,
  NotificationUpdateSchema,
  NotificationPauseSchema,
  NotificationResumeSchema
} from "../../../packages/shared-types/src/notification-preferences.js";
import {
  NotificationApiError,
  type NotificationApi
} from "../../../packages/alert-client/src/notification-preferences.js";
const scope = z
  .object({
    bearerToken: z.string().min(1),
    audience: NotificationAudienceSchema.default("personal"),
    projectId: z.string().uuid().optional()
  })
  .strict();
export const NOTIFICATION_MCP_TOOL_NAMES = [
  "get_notification_preferences",
  "update_notification_preferences",
  "pause_notifications",
  "resume_notifications"
] as const;
export const NOTIFICATION_MCP_TOOL_CATALOG = [
  {
    name: NOTIFICATION_MCP_TOOL_NAMES[0],
    group: "notifications",
    description:
      "Read account defaults or project overrides and effective notification policies. Personal affects your email; shared affects team destinations.",
    inputSchema: scope
  },
  {
    name: NOTIFICATION_MCP_TOOL_NAMES[1],
    group: "notifications",
    description:
      "Update channel modes or daily email time and IANA timezone. Project overrides may inherit. Shared settings require account owner or project owner/admin. Monitoring continues; mandatory system emails are separate.",
    inputSchema: scope.extend({ update: NotificationUpdateSchema })
  },
  {
    name: NOTIFICATION_MCP_TOOL_NAMES[2],
    group: "notifications",
    description:
      "Pause selected channels until a future UTC instant, or null for until resumed. Account pauses win over project settings. Explicitly opt in to health-check alerts during the pause. Personal supports email only.",
    inputSchema: scope.extend({ pause: NotificationPauseSchema })
  },
  {
    name: NOTIFICATION_MCP_TOOL_NAMES[3],
    group: "notifications",
    description:
      "Resume selected channels at the chosen account/project scope, preserving delivery modes. An account pause still overrides project resume. Suppressed alerts are not replayed.",
    inputSchema: scope.extend({ resume: NotificationResumeSchema })
  }
] as const;
export function createNotificationMcpTools(
  api: NotificationApi
): Record<string, (input: Record<string, unknown>) => ReturnType<NotificationApi["request"]>> {
  return Object.fromEntries(
    NOTIFICATION_MCP_TOOL_CATALOG.map((tool, index) => [
      tool.name,
      async (input: Record<string, unknown>) => {
        try {
          const parsed = tool.inputSchema.parse(input);
          const action = (["get", "update", "pause", "resume"] as const)[index]!;
          const body =
            "update" in parsed
              ? parsed.update
              : "pause" in parsed
                ? parsed.pause
                : "resume" in parsed
                  ? parsed.resume
                  : undefined;
          return await api.request(
            {
              bearerToken: parsed.bearerToken,
              audience: parsed.audience,
              ...(parsed.projectId === undefined ? {} : { projectId: parsed.projectId })
            },
            action,
            body
          );
        } catch (error) {
          throw new Error(
            `mcp_tool_error:${error instanceof NotificationApiError ? error.message : "invalid_notification_input"}`
          );
        }
      }
    ])
  );
}
