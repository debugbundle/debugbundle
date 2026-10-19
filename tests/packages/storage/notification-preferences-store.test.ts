import { describe, expect, it, vi } from "vitest";
import { createNotificationPreferencesStore } from "../../../packages/storage/src/notification-preferences-store.js";
import type { Queryable } from "../../../packages/storage/src/types.js";
import {
  applyNotificationChange,
  defaultNotificationPreferences
} from "../../../packages/shared-types/src/notification-preferences.js";

describe("notification recipient policy", () => {
  it("combines shared restrictions and recipient preferences without using the alert creator", async () => {
    const personal = applyNotificationChange(
      defaultNotificationPreferences(),
      { channels: { email: "daily" } },
      new Date()
    );
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ organization_id: "org", user_id: "recipient", health: false }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ preferences: personal }] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await createNotificationPreferencesStore({ query }).decide({
      project_id: "project",
      channel: "email",
      recipient: "person@example.com"
    });
    expect(result.mode).toBe("daily");
    expect(query.mock.calls[3]?.[1]).toEqual(["recipient", null]);
  });
  it("rejects shared-channel changes through personal preferences", async () => {
    const query = vi.fn();
    await expect(
      createNotificationPreferencesStore({ query }).update(
        { audience: "personal", owner_id: "user", project_id: null },
        { pause: { channels: ["slack"], until: null, allow_health_checks: false } }
      )
    ).rejects.toThrow("notification_personal_email_only");
    expect(query).not.toHaveBeenCalled();
  });
  it("fails closed for missing projects", async () => {
    const result = await createNotificationPreferencesStore({
      query: vi.fn().mockResolvedValue({ rows: [] })
    }).decide({ project_id: "gone", channel: "slack" });
    expect(result.mode).toBe("off");
  });
  it("shows shared project restrictions in a personal inherited response", async () => {
    const shared = applyNotificationChange(
      defaultNotificationPreferences(),
      { channels: { email: "off" } },
      new Date()
    );
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ organization_id: "org" }] })
      .mockResolvedValueOnce({ rows: [{ preferences: shared }] })
      .mockResolvedValueOnce({ rows: [] });
    const response = await createNotificationPreferencesStore({ query }).get(
      { audience: "personal", owner_id: "user", project_id: "project" },
      false
    );
    expect(response.can_manage).toBe(false);
    expect(response.settings.channels.email).toBe("inherit");
    expect(response.effective.email.mode).toBe("off");
    expect(response.shared?.account).toEqual(shared);
  });

  it.each([
    {
      channels: { email: "daily" as const },
      daily: { time: "09:00", timezone: "Europe/Ljubljana" }
    },
    { pause: { channels: ["email" as const], until: null, allow_health_checks: false } },
    { resume: { channels: ["email" as const] } }
  ])(
    "persists an email change and wakes pending mail in the same transaction: %j",
    async (change) => {
      const at = new Date("2026-10-19T08:00:00Z");
      let persisted = defaultNotificationPreferences();
      const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
        if (sql.startsWith("INSERT INTO notification_preferences"))
          persisted = JSON.parse(String(params?.[4]));
        return { rows: sql.startsWith("SELECT preferences") ? [{ preferences: persisted }] : [] };
      });
      const store = createNotificationPreferencesStore({ query: query as Queryable["query"] });
      const response = await store.update(
        { owner_id: "user", project_id: null, audience: "personal" },
        change,
        at
      );
      expect(response.settings).toEqual(
        applyNotificationChange(defaultNotificationPreferences(), change, at)
      );
      expect(response.can_manage).toBe(true);
      expect(query.mock.calls[1]?.[1]).toEqual(['["personal","user",null]']);
      const wake = query.mock.calls.findIndex(([sql]) =>
        sql.startsWith("UPDATE notification_daily_batches")
      );
      expect(wake).toBeGreaterThan(0);
      expect(query.mock.calls[wake]?.[1]).toEqual(["personal", "user", null, at.toISOString()]);
      expect(query.mock.calls[wake + 1]?.[0]).toBe("COMMIT");
    }
  );

  it("does not wake email for a Slack-only change", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await createNotificationPreferencesStore({ query }).update(
      { audience: "shared", owner_id: "org", project_id: "project" },
      { channels: { slack: "off" } }
    );
    expect(
      query.mock.calls.some(([sql]) => String(sql).startsWith("UPDATE notification_daily_batches"))
    ).toBe(false);
    expect(
      query.mock.calls.find(([sql]) =>
        String(sql).startsWith("INSERT INTO notification_preferences")
      )?.[1]
    ).toEqual([expect.any(String), null, "org", "project", expect.any(String), expect.any(String)]);
  });

  it("rolls back invalid account inheritance without persisting or waking mail", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(
      createNotificationPreferencesStore({ query }).update(
        { audience: "shared", owner_id: "org", project_id: null },
        { channels: { email: "inherit" } }
      )
    ).rejects.toThrow("notification_account_cannot_inherit");
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith("INSERT"))).toBe(false);
  });
});
