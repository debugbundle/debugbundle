import {
  defaultNotificationPreferences,
  NOTIFICATION_CHANNELS,
  resolveNotificationPolicy,
  type NotificationSettingsResponse
} from "../../packages/shared-types/src/notification-preferences.js";
export function notificationResponse(): NotificationSettingsResponse {
  const settings = defaultNotificationPreferences();
  const policy = resolveNotificationPolicy({
    account: settings,
    channel: "email",
    now: new Date()
  });
  return {
    audience: "personal",
    project_id: null,
    can_manage: true,
    settings,
    account: settings,
    effective: Object.fromEntries(
      NOTIFICATION_CHANNELS.map((channel) => [channel, policy])
    ) as NotificationSettingsResponse["effective"]
  };
}
