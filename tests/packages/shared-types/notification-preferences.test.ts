import { describe, expect, it } from "vitest";
import {
  defaultNotificationPreferences,
  NotificationUpdateSchema,
  NotificationPauseSchema,
  resolveNotificationPolicy,
  applyNotificationChange,
  nextDailyNotificationAt
} from "../../../packages/shared-types/src/notification-preferences.js";

const now = new Date("2026-10-18T08:00:00.000Z");
describe("notification delivery preferences", () => {
  it("preserves immediate defaults and permits daily email only", () => {
    expect(
      resolveNotificationPolicy({
        account: defaultNotificationPreferences(),
        channel: "email",
        now
      }).mode
    ).toBe("immediate");
    expect(NotificationUpdateSchema.safeParse({ channels: { slack: "daily" } }).success).toBe(
      false
    );
    expect(
      NotificationUpdateSchema.safeParse({ daily: { time: "25:00", timezone: "Mars" } }).success
    ).toBe(false);
    expect(NotificationPauseSchema.safeParse({ channels: [], until: null }).success).toBe(false);
  });
  it("lets project modes override account defaults while an account pause wins", () => {
    const account = applyNotificationChange(
      defaultNotificationPreferences(),
      { channels: { email: "daily" } },
      now
    );
    const project = applyNotificationChange(
      defaultNotificationPreferences(true),
      { channels: { email: "immediate" } },
      now
    );
    expect(resolveNotificationPolicy({ account, project, channel: "email", now }).mode).toBe(
      "immediate"
    );
    const paused = applyNotificationChange(
      account,
      { pause: { channels: ["email"], until: null, allow_health_checks: false } },
      now
    );
    expect(
      resolveNotificationPolicy({ account: paused, project, channel: "email", now }).reason
    ).toBe("account_paused");
    expect(
      resolveNotificationPolicy({ account: paused, project, channel: "slack", now }).mode
    ).toBe("immediate");
  });
  it("prioritizes health checks over daily mode but honors explicit silence", () => {
    const account = applyNotificationChange(
      defaultNotificationPreferences(),
      { channels: { email: "daily" } },
      now
    );
    expect(resolveNotificationPolicy({ account, channel: "email", health: true, now }).mode).toBe(
      "immediate"
    );
    for (const allow of [false, true]) {
      const paused = applyNotificationChange(
        account,
        { pause: { channels: ["email"], until: null, allow_health_checks: allow } },
        now
      );
      expect(
        resolveNotificationPolicy({ account: paused, channel: "email", health: true, now }).mode
      ).toBe(allow ? "immediate" : "off");
    }
  });
  it("automatically resumes without replaying suppressed or queued older events", () => {
    const until = "2026-10-19T08:00:00.000Z";
    const account = applyNotificationChange(
      defaultNotificationPreferences(),
      { pause: { channels: ["email"], until, allow_health_checks: false } },
      now
    );
    const later = new Date("2026-10-19T09:00:00.000Z");
    expect(resolveNotificationPolicy({ account, channel: "email", now: later }).mode).toBe(
      "immediate"
    );
    expect(
      resolveNotificationPolicy({
        account,
        channel: "email",
        now: later,
        occurredAt: now.toISOString()
      }).reason
    ).toBe("suppressed_history");
    const resumed = applyNotificationChange(
      account,
      { resume: { channels: ["email"] } },
      new Date("2026-10-18T12:00:00.000Z")
    );
    expect(
      resolveNotificationPolicy({
        account: resumed,
        channel: "email",
        now: later,
        occurredAt: now.toISOString()
      }).mode
    ).toBe("off");
    expect(
      resolveNotificationPolicy({
        account: resumed,
        channel: "email",
        now: later,
        occurredAt: "2026-10-18T13:00:00.000Z"
      }).mode
    ).toBe("immediate");
  });
  it("does not queue events while off for a later catch-up", () => {
    const off = applyNotificationChange(
      defaultNotificationPreferences(),
      { channels: { email: "off" } },
      now
    );
    const resumed = applyNotificationChange(
      off,
      { channels: { email: "daily" } },
      new Date("2026-10-19T08:00:00.000Z")
    );
    expect(
      resolveNotificationPolicy({
        account: resumed,
        channel: "email",
        now: new Date("2026-10-20Z"),
        occurredAt: now.toISOString()
      }).mode
    ).toBe("off");
  });
  it("schedules local mornings across DST and chooses only one repeated local time", () => {
    expect(
      nextDailyNotificationAt(
        { time: "09:00", timezone: "Europe/Ljubljana" },
        new Date("2026-10-24T08:00:00Z")
      )
    ).toBe("2026-10-25T08:00:00.000Z");
    expect(
      nextDailyNotificationAt(
        { time: "02:30", timezone: "Europe/Ljubljana" },
        new Date("2026-10-25T00:40:00Z")
      )
    ).toBe("2026-10-26T01:30:00.000Z");
    expect(
      nextDailyNotificationAt(
        { time: "02:30", timezone: "Europe/Ljubljana" },
        new Date("2026-03-28T12:00:00Z")
      )
    ).toBe("2026-03-29T01:00:00.000Z");
  });
});

it("round-trips preference data, rejects missing fields and invalid pause ends", async () => {
  const { NotificationPreferencesSchema, NotificationScheduleSchema, NotificationResumeSchema } =
    await import("../../../packages/shared-types/src/notification-preferences.js");
  const settings = defaultNotificationPreferences();
  expect(NotificationPreferencesSchema.parse(JSON.parse(JSON.stringify(settings)))).toEqual(
    settings
  );
  for (const key of Object.keys(settings)) {
    const partial: Record<string, unknown> = { ...settings };
    delete partial[key];
    expect(NotificationPreferencesSchema.safeParse(partial).success).toBe(false);
  }
  expect(NotificationScheduleSchema.safeParse({ time: "09:00" }).success).toBe(false);
  expect(NotificationScheduleSchema.safeParse({ timezone: "UTC" }).success).toBe(false);
  expect(NotificationResumeSchema.safeParse({ channels: "email" }).success).toBe(false);
  expect(NotificationPauseSchema.safeParse({ channels: ["email"] }).success).toBe(false);
  expect(() =>
    applyNotificationChange(
      settings,
      { pause: { channels: ["email"], until: now.toISOString(), allow_health_checks: false } },
      now
    )
  ).toThrow("notification_pause_must_be_future");
  settings.discard_before.email = { ordinary: "2026-10-18T08:00:00Z", health: null };
  settings.channels.email = "off";
  const resumed = applyNotificationChange(
    settings,
    { channels: { email: "immediate" } },
    new Date("2026-10-18T08:00:00.001Z")
  );
  expect(resumed.discard_before.email?.ordinary).toBe("2026-10-18T08:00:00.001Z");
});
