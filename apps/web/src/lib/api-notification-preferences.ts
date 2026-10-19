import {
  createNotificationApi,
  type NotificationAction
} from "../../../../packages/alert-client/src/notification-preferences.js";
import type { NotificationAudience } from "../../../../packages/shared-types/src/notification-preferences.js";
import { API_BASE, buildBrowserSessionHeaders } from "./api-client.js";

const api = createNotificationApi({
  async request(input) {
    const response = await fetch(`${API_BASE}${input.path}`, {
      method: input.method,
      credentials: "include",
      headers: buildBrowserSessionHeaders(input.method !== "GET"),
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) })
    });
    return { status: response.status, body: (await response.json()) as unknown };
  }
});
export function requestNotificationPreferences(
  scope: { audience: NotificationAudience; projectId?: string },
  action: NotificationAction,
  body?: unknown
): ReturnType<typeof api.request> {
  return api.request({ ...scope, bearerToken: "" }, action, body);
}
