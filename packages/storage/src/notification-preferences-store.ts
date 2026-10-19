import { randomUUID } from "node:crypto";
import {
  applyNotificationChange,
  defaultNotificationPreferences,
  NOTIFICATION_CHANNELS,
  NotificationPreferencesSchema,
  resolveNotificationPolicy,
  resolveSettingsNotification,
  combineNotificationPolicies,
  type NotificationAudience,
  type NotificationChange,
  type NotificationChannel,
  type NotificationPreferences,
  type NotificationSettingsResponse,
  type EffectiveNotification
} from "../../shared-types/src/notification-preferences.js";
import type { Queryable } from "./types.js";
import { runInTransaction } from "./transaction.js";

export interface NotificationScope {
  audience: NotificationAudience;
  owner_id: string;
  project_id: string | null;
}
export interface NotificationDeliveryInput {
  project_id: string;
  channel: NotificationChannel;
  recipient?: string;
  incident_id?: string;
  occurred_at?: string;
  now?: Date;
}
export interface NotificationPreferencesStore {
  read(scope: NotificationScope, tx?: Queryable): Promise<NotificationPreferences>;
  get(
    scope: NotificationScope,
    canManage: boolean,
    now?: Date
  ): Promise<NotificationSettingsResponse>;
  update(
    scope: NotificationScope,
    change: NotificationChange,
    now?: Date
  ): Promise<NotificationSettingsResponse>;
  decide(input: NotificationDeliveryInput): Promise<EffectiveNotification>;
}

export function createNotificationPreferencesStore(db: Queryable): NotificationPreferencesStore {
  async function read(scope: NotificationScope, tx = db): Promise<NotificationPreferences> {
    const rows = await tx.query<{ preferences: unknown }>(
      `SELECT preferences FROM notification_preferences
      WHERE ${scope.audience === "personal" ? "user_id" : "organization_id"} = $1 AND project_id IS NOT DISTINCT FROM $2::uuid`,
      [scope.owner_id, scope.project_id]
    );
    return rows.rows[0] === undefined
      ? defaultNotificationPreferences(scope.project_id !== null)
      : NotificationPreferencesSchema.parse(rows.rows[0].preferences);
  }
  async function get(
    scope: NotificationScope,
    canManage: boolean,
    now = new Date()
  ): Promise<NotificationSettingsResponse> {
    const account = await read({ ...scope, project_id: null });
    const settings = scope.project_id === null ? account : await read(scope);
    let shared: NotificationSettingsResponse["shared"];
    if (scope.audience === "personal" && scope.project_id !== null) {
      const project = await db.query<{ organization_id: string }>(
        "SELECT organization_id FROM projects WHERE id = $1",
        [scope.project_id]
      );
      const organizationId = project.rows[0]?.organization_id;
      if (organizationId !== undefined) {
        const sharedScope = {
          audience: "shared" as const,
          owner_id: organizationId,
          project_id: scope.project_id
        };
        shared = {
          account: await read({ ...sharedScope, project_id: null }),
          project: await read(sharedScope)
        };
      }
    }
    const state = {
      audience: scope.audience,
      project_id: scope.project_id,
      can_manage: canManage,
      settings,
      account,
      ...(shared === undefined ? {} : { shared })
    };
    const effective = Object.fromEntries(
      NOTIFICATION_CHANNELS.map((channel) => [
        channel,
        resolveSettingsNotification(state, channel, now)
      ])
    ) as NotificationSettingsResponse["effective"];
    return { ...state, effective };
  }
  return {
    read,
    get,
    async update(
      scope: NotificationScope,
      change: NotificationChange,
      now = new Date()
    ): Promise<NotificationSettingsResponse> {
      if (scope.audience === "personal") {
        const channels =
          "pause" in change
            ? change.pause.channels
            : "resume" in change
              ? change.resume.channels
              : Object.keys(change.channels ?? {});
        if (channels.some((channel) => channel !== "email"))
          throw new Error("notification_personal_email_only");
      }
      await runInTransaction(db, async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
          JSON.stringify([scope.audience, scope.owner_id, scope.project_id])
        ]);
        const preferences = applyNotificationChange(await read(scope, tx), change, now);
        if (scope.project_id === null && Object.values(preferences.channels).includes("inherit"))
          throw new Error("notification_account_cannot_inherit");
        await tx.query(
          `INSERT INTO notification_preferences(id, user_id, organization_id, project_id, preferences, updated_at)
          VALUES ($1, $2, $3, $4, $5::jsonb, $6) ON CONFLICT (user_id, organization_id, project_id)
          DO UPDATE SET preferences = EXCLUDED.preferences, updated_at = EXCLUDED.updated_at`,
          [
            randomUUID(),
            scope.audience === "personal" ? scope.owner_id : null,
            scope.audience === "shared" ? scope.owner_id : null,
            scope.project_id,
            JSON.stringify(preferences),
            now.toISOString()
          ]
        );
        const affectsEmail =
          "pause" in change
            ? change.pause.channels.includes("email")
            : "resume" in change
              ? change.resume.channels.includes("email")
              : change.daily !== undefined || change.channels?.email !== undefined;
        if (affectsEmail) {
          // Revisit pending mail now, including schedules moved earlier. This timestamp is
          // also the scheduling anchor if the worker is unavailable when settings change.
          await tx.query(
            `UPDATE notification_daily_batches b SET next_attempt_at = $4
            WHERE b.status = 'pending' AND EXISTS(
              SELECT 1 FROM notification_daily_items d JOIN projects p ON p.id = d.project_id
              WHERE d.batch_id = b.id AND ($3::uuid IS NULL OR p.id = $3)
              AND (($1 = 'shared' AND p.organization_id = $2::uuid) OR
                ($1 = 'personal' AND b.recipient = (SELECT lower(email) FROM users WHERE id = $2::uuid))))`,
            [scope.audience, scope.owner_id, scope.project_id, now.toISOString()]
          );
        }
      });
      return get(scope, true, now);
    },
    /** Resolve shared restrictions plus the actual recipient's personal policy, never the rule creator's email preferences. */
    async decide(input: NotificationDeliveryInput): Promise<EffectiveNotification> {
      const context = await db.query<{
        organization_id: string;
        user_id: string | null;
        health: boolean;
      }>(
        `
        SELECT p.organization_id, u.id AS user_id,
          EXISTS(SELECT 1 FROM incidents i WHERE i.id = $3::uuid AND i.project_id = p.id
            AND i.fingerprint_version = 'availability-v1') AS health
        FROM projects p LEFT JOIN users u ON lower(u.email) = lower($2::text) WHERE p.id = $1`,
        [input.project_id, input.recipient ?? null, input.incident_id ?? null]
      );
      const row = context.rows[0];
      if (row === undefined)
        return {
          mode: "off",
          reason: "suppressed_history",
          paused_until: null,
          daily: { time: "09:00", timezone: "UTC" }
        };
      const now = input.now ?? new Date();
      const shared: NotificationScope = {
        audience: "shared",
        owner_id: row.organization_id,
        project_id: input.project_id
      };
      async function resolve(scope: NotificationScope): Promise<EffectiveNotification> {
        return resolveNotificationPolicy({
          account: await read({ ...scope, project_id: null }),
          project: await read(scope),
          channel: input.channel,
          now,
          health: row!.health,
          ...(input.occurred_at === undefined ? {} : { occurredAt: input.occurred_at })
        });
      }
      const team = await resolve(shared);
      if (team.mode === "off" || input.channel !== "email" || row.user_id === null) return team;
      const personal = await resolve({
        audience: "personal",
        owner_id: row.user_id,
        project_id: input.project_id
      });
      return combineNotificationPolicies(team, personal);
    }
  };
}
