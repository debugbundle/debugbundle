import { z } from "zod";
import {
  applyNotificationChange,
  defaultNotificationPreferences,
  NOTIFICATION_CHANNELS,
  NotificationAudienceSchema,
  NotificationChangeSchema,
  NotificationUpdateSchema,
  NotificationSettingsResponseSchema,
  resolveSettingsNotification,
  type NotificationPreferences
} from "../../packages/shared-types/src/notification-preferences.js";
import type { createDevMockFixtures } from "./fixtures.js";
import type { MockResponse } from "./api.js";

/** Preview-only state. Reuses production schemas/policies and never queues or sends mail. */
export function createNotificationMocks(
  data: ReturnType<typeof createDevMockFixtures>,
  isSignedIn: () => boolean
): {
  handle(
    method: string,
    path: string,
    query: URLSearchParams,
    payload?: unknown
  ): MockResponse | null;
} {
  const settings = new Map<string, NotificationPreferences>();
  const querySchema = z
    .object({ audience: NotificationAudienceSchema.default("personal") })
    .strict();
  return {
    handle(method, path, query, payload) {
      const match =
        /^\/v1\/(account|projects\/([^/]+))\/notification-preferences(?:\/(pause|resume))?$/.exec(
          path
        );
      if (!match) return null;
      const reply = (body: unknown, status = 200): MockResponse => ({
        status,
        body,
        headers: { "cache-control": "no-store" }
      });
      if (!isSignedIn()) return reply({ error: "unauthorized" }, 401);
      const parsedQuery = querySchema.safeParse(Object.fromEntries(query));
      if (!parsedQuery.success) return reply({ error: "invalid_notification_scope" }, 400);
      const audience = parsedQuery.data.audience,
        projectId = match[2] ?? null;
      const project = data.projects.find((p) => p["project_id"] === projectId);
      if (projectId !== null && !project) return reply({ error: "project_not_found" }, 404);
      const canManage =
        audience === "personal" ||
        (projectId === null
          ? data.session.role === "owner"
          : project?.["owner_user_id"] === data.session.user_id ||
            project?.["effective_role"] === "admin");
      const key = (who: "personal" | "shared", id: string | null): string =>
        JSON.stringify([
          who,
          who === "personal"
            ? data.session.user_id
            : (project?.["organization_id"] ?? data.session.organization_id),
          id
        ]);
      const read = (who: "personal" | "shared", id: string | null): NotificationPreferences =>
        settings.get(key(who, id)) ?? defaultNotificationPreferences(id !== null);
      const action = match[3];
      if (method !== (action ? "POST" : "GET") && !(method === "PATCH" && !action))
        return reply({ error: "method_not_allowed" }, 405);
      if (method !== "GET") {
        if (!canManage) return reply({ error: "forbidden" }, 403);
        const parsed = (action ? NotificationChangeSchema : NotificationUpdateSchema).safeParse(
          action ? { [action]: payload } : payload
        );
        if (!parsed.success) return reply({ error: "invalid_notification_preferences" }, 400);
        const change = parsed.data;
        const channels =
          "pause" in change
            ? change.pause.channels
            : "resume" in change
              ? change.resume.channels
              : Object.keys(change.channels ?? {});
        if (audience === "personal" && channels.some((c) => c !== "email"))
          return reply({ error: "notification_personal_email_only" }, 400);
        try {
          const next = applyNotificationChange(read(audience, projectId), change, new Date());
          if (projectId === null && Object.values(next.channels).includes("inherit"))
            return reply({ error: "notification_account_cannot_inherit" }, 400);
          settings.set(key(audience, projectId), next);
        } catch {
          return reply({ error: "notification_pause_must_be_future" }, 400);
        }
      }
      const state = {
        audience,
        project_id: projectId,
        can_manage: canManage,
        settings: read(audience, projectId),
        account: read(audience, null),
        ...(audience === "personal" && projectId !== null
          ? { shared: { account: read("shared", null), project: read("shared", projectId) } }
          : {})
      };
      return reply(
        NotificationSettingsResponseSchema.parse({
          ...state,
          effective: Object.fromEntries(
            NOTIFICATION_CHANNELS.map((channel) => [
              channel,
              resolveSettingsNotification(state, channel, new Date())
            ])
          )
        })
      );
    }
  };
}
