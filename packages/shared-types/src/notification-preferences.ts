import { z } from "zod";
export { nextDailyNotificationAt } from "./notification-schedule.js";

export const NOTIFICATION_CHANNELS = ["email", "slack", "discord", "webhook"] as const;
export const NotificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;
const mode = z.enum(["inherit", "immediate", "off"]);
export const NotificationChannelsSchema = z
  .object({
    email: z.enum(["inherit", "immediate", "daily", "off"]),
    slack: mode,
    discord: mode,
    webhook: mode
  })
  .strict();
export const NotificationScheduleSchema = z
  .object({
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timezone: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value }).format();
          return true;
        } catch {
          return false;
        }
      }, "Use a valid IANA timezone")
  })
  .strict();
export type NotificationSchedule = z.infer<typeof NotificationScheduleSchema>;
const pauseState = z
  .object({ until: z.string().datetime().nullable(), allow_health_checks: z.boolean() })
  .strict();
const history = z
  .object({ ordinary: z.string().datetime().nullable(), health: z.string().datetime().nullable() })
  .strict();
export const NotificationPreferencesSchema = z
  .object({
    channels: NotificationChannelsSchema,
    daily: NotificationScheduleSchema.nullable(),
    pauses: z.record(NotificationChannelSchema, pauseState),
    discard_before: z.record(NotificationChannelSchema, history)
  })
  .strict();
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;
export const NotificationUpdateSchema = z
  .object({
    channels: NotificationChannelsSchema.partial().optional(),
    daily: NotificationScheduleSchema.nullable().optional()
  })
  .strict()
  .refine(
    (value) => value.channels !== undefined || value.daily !== undefined,
    "No settings supplied"
  );
export const NotificationResumeSchema = z
  .object({ channels: z.array(NotificationChannelSchema).min(1).max(4) })
  .strict();
export const NotificationPauseSchema = NotificationResumeSchema.extend({
  until: z.string().datetime().nullable(),
  allow_health_checks: z.boolean().default(false)
}).strict();
export const NotificationChangeSchema = z.union([
  NotificationUpdateSchema,
  z.object({ pause: NotificationPauseSchema }).strict(),
  z.object({ resume: NotificationResumeSchema }).strict()
]);
export type NotificationChange = z.infer<typeof NotificationChangeSchema>;
export type NotificationAudience = "personal" | "shared";
export const NotificationAudienceSchema = z.enum(["personal", "shared"]);

export function defaultNotificationPreferences(project = false): NotificationPreferences {
  const value = project ? "inherit" : "immediate";
  return {
    channels: { email: value, slack: value, discord: value, webhook: value },
    daily: project ? null : { time: "09:00", timezone: "UTC" },
    pauses: {},
    discard_before: {}
  };
}

/** Keep cutoffs when a pause ends or off is lifted so old jobs cannot flood a resumed channel. */
export function applyNotificationChange(
  previous: NotificationPreferences,
  change: NotificationChange,
  now: Date
): NotificationPreferences {
  const next = NotificationPreferencesSchema.parse(previous);
  function retainCutoff(
    channel: NotificationChannel,
    cutoff: string,
    includeHealth: boolean
  ): void {
    const current = next.discard_before[channel] ?? { ordinary: null, health: null };
    const latest = (value: string | null): string =>
      value !== null && Date.parse(value) > Date.parse(cutoff) ? value : cutoff;
    next.discard_before[channel] = {
      ordinary: latest(current.ordinary),
      health: includeHealth ? latest(current.health) : current.health
    };
  }
  const affected =
    "pause" in change
      ? change.pause.channels
      : "resume" in change
        ? change.resume.channels
        : (Object.keys(change.channels ?? {}) as NotificationChannel[]);
  for (const channel of affected) {
    const old = previous.pauses[channel];
    if (old !== undefined && ("pause" in change || "resume" in change)) {
      retainCutoff(
        channel,
        old.until === null || Date.parse(old.until) > now.getTime() ? now.toISOString() : old.until,
        !old.allow_health_checks
      );
    }
    if ("pause" in change) {
      if (change.pause.until !== null && Date.parse(change.pause.until) <= now.getTime())
        throw new Error("notification_pause_must_be_future");
      next.pauses[channel] = {
        until: change.pause.until,
        allow_health_checks: change.pause.allow_health_checks
      };
    } else if ("resume" in change) {
      delete next.pauses[channel];
    } else {
      if (previous.channels[channel] === "off" && change.channels?.[channel] !== "off")
        retainCutoff(channel, now.toISOString(), true);
    }
  }
  if (!("pause" in change) && !("resume" in change)) {
    next.channels = NotificationChannelsSchema.parse({ ...next.channels, ...change.channels });
    if (change.daily !== undefined) next.daily = change.daily;
  }
  return next;
}

export const EffectiveNotificationSchema = z.object({
  mode: z.enum(["immediate", "daily", "off"]),
  reason: z.enum([
    "account_default",
    "project_override",
    "account_paused",
    "project_paused",
    "suppressed_history",
    "health_priority"
  ]),
  paused_until: z.string().datetime().nullable(),
  daily: NotificationScheduleSchema
});
export type EffectiveNotification = z.infer<typeof EffectiveNotificationSchema>;
export function resolveNotificationPolicy(input: {
  account: NotificationPreferences;
  project?: NotificationPreferences;
  channel: NotificationChannel;
  now: Date;
  health?: boolean;
  occurredAt?: string;
}): EffectiveNotification {
  const { account, project, channel, now } = input;
  const override = project?.channels[channel];
  const chosen =
    override !== undefined && override !== "inherit" ? override : account.channels[channel];
  const result: EffectiveNotification = {
    mode: chosen === "inherit" ? "immediate" : chosen,
    reason:
      override !== undefined && override !== "inherit" ? "project_override" : "account_default",
    paused_until: null,
    daily: project?.daily ?? account.daily ?? { time: "09:00", timezone: "UTC" }
  };
  for (const [settings, reason] of [
    [account, "account_paused"],
    [project, "project_paused"]
  ] as const) {
    if (settings === undefined) continue;
    const pause = settings.pauses[channel];
    const bypass = input.health === true && pause?.allow_health_checks === true;
    if (
      pause !== undefined &&
      !bypass &&
      (pause.until === null || Date.parse(pause.until) > now.getTime())
    ) {
      return { ...result, mode: "off", reason, paused_until: pause.until };
    }
    const cutoff =
      settings.discard_before[channel]?.[input.health === true ? "health" : "ordinary"];
    const expired =
      pause !== undefined &&
      !bypass &&
      pause.until !== null &&
      Date.parse(pause.until) <= now.getTime()
        ? pause.until
        : null;
    if (
      input.occurredAt !== undefined &&
      [cutoff, expired].some(
        (value) => value != null && Date.parse(input.occurredAt!) <= Date.parse(value)
      )
    ) {
      return { ...result, mode: "off", reason: "suppressed_history" };
    }
  }
  if (input.health === true && result.mode === "daily")
    return { ...result, mode: "immediate", reason: "health_priority" };
  return result;
}

export const NotificationSettingsResponseSchema = z.object({
  audience: NotificationAudienceSchema,
  project_id: z.string().uuid().nullable(),
  can_manage: z.boolean(),
  settings: NotificationPreferencesSchema,
  account: NotificationPreferencesSchema,
  shared: z
    .object({ account: NotificationPreferencesSchema, project: NotificationPreferencesSchema })
    .optional(),
  effective: z.object({
    email: EffectiveNotificationSchema,
    slack: EffectiveNotificationSchema,
    discord: EffectiveNotificationSchema,
    webhook: EffectiveNotificationSchema
  })
});
export type NotificationSettingsResponse = z.infer<typeof NotificationSettingsResponseSchema>;

/** Shared restrictions and the recipient's own preferences both apply. */
export function combineNotificationPolicies(
  team: EffectiveNotification,
  personal: EffectiveNotification
): EffectiveNotification {
  if (team.mode === "off") return team;
  if (personal.mode === "off" || personal.mode === "daily") return personal;
  return team;
}

export function resolveSettingsNotification(
  data: Pick<NotificationSettingsResponse, "account" | "settings" | "project_id" | "shared">,
  channel: NotificationChannel,
  now: Date
): EffectiveNotification {
  const own = resolveNotificationPolicy({
    account: data.account,
    ...(data.project_id === null ? {} : { project: data.settings }),
    channel,
    now
  });
  if (data.shared === undefined || channel !== "email") return own;
  return combineNotificationPolicies(
    resolveNotificationPolicy({ ...data.shared, channel, now }),
    own
  );
}
