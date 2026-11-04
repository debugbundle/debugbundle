import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { createNotificationPreferencesStore } from "../../packages/storage/src/notification-preferences-store.js";
import { createPostgresImprovementSettingsStore } from "../../packages/storage/src/improvement-settings-store.js";
import { createNotificationDailyStore } from "../../packages/storage/src/notification-daily-store.js";
import { deliverNextDailyNotification } from "../../packages/storage/src/notification-delivery-service.js";
import { filterNotificationDigest } from "../../packages/storage/src/notification-legacy-delivery.js";
import { createPostgresAlertDeliveryStore } from "../../packages/storage/src/alert-delivery-store.js";
import { seedExternalProjectCollaborator } from "../helpers/shared-project-collaborator.js";
import { seedConsolidationProjects } from "../helpers/consolidation-projects.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";

runIntegration("canonical notification and improvement settings", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    preferences = createNotificationPreferencesStore(db),
    improvements = createPostgresImprovementSettingsStore(db);
  const daily = createNotificationDailyStore(db);
  const now = new Date("2026-11-04T12:00:00Z"),
    due = new Date("2026-11-05T09:00:00Z");
  const schedule = { time: "09:00", timezone: "UTC" };
  const recipients = new Set<string>();
  beforeAll(async () => {
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
  });
  afterAll(async () => {
    await pool.end();
  });
  afterEach(async () => {
    await pool.query("DELETE FROM notification_daily_batches WHERE recipient=ANY($1::text[])", [
      [...recipients]
    ]);
    recipients.clear();
  });
  async function dailyFixture() {
    const f = await seedConsolidationProjects(pool, db),
      incidentId = randomUUID(),
      serviceId = randomUUID();
    const emailFor = async (userId: string) => {
      const result = await pool.query<{ email: string }>("SELECT email FROM users WHERE id=$1", [
        userId
      ]);
      const email = result.rows[0]!.email;
      recipients.add(email.toLowerCase());
      return email;
    };
    const email = await emailFor(f.userId);
    await pool.query(
      "INSERT INTO services(id,project_id,name,environment) VALUES($1,$2,'web','production')",
      [serviceId, f.source]
    );
    await pool.query(
      "INSERT INTO incidents(id,project_id,service_id,environment,fingerprint,fingerprint_version,title,severity,first_seen_at,last_seen_at) VALUES($1::uuid,$2,$3,'production',($1::uuid)::text,'v1','Imported failure','high',$4,$4)",
      [incidentId, f.source, serviceId, now]
    );
    await preferences.update(
      { audience: "personal", owner_id: f.userId, project_id: null },
      { channels: { email: "daily" }, daily: schedule },
      now
    );
    const alert = async (project: string, recipient = email) => {
      const id = randomUUID();
      await pool.query(
        "INSERT INTO alert_rules(id,project_id,created_by_user_id,channel,condition_type,config) VALUES($1,$2,$3,'email','new_incident',$4)",
        [id, project, f.userId, JSON.stringify({ to: recipient })]
      );
      return id;
    };
    const enqueue = (alertId: string, recipient = email) =>
      daily.enqueue({
        alert_id: alertId,
        incident_id: incidentId,
        project_id: f.source,
        recipient,
        occurred_at: now.toISOString(),
        schedule,
        now
      });
    return { ...f, email, emailFor, incidentId, alert, enqueue };
  }
  it("delivers a canonical daily rule for an imported incident without widening an older rule or duplicating usage", async () => {
    const f = await dailyFixture(),
      oldRule = await f.alert(f.target);
    await f.consolidate();
    const newRule = await f.alert(f.target);
    expect(await f.enqueue(oldRule)).toEqual({ created_delivery: false });
    expect(await f.enqueue(newRule)).toEqual({ created_delivery: true });
    expect(await f.enqueue(newRule)).toEqual({ created_delivery: false });
    expect(
      (
        await pool.query(
          "SELECT project_id,alert_id,incident_id FROM notification_daily_items WHERE incident_id=$1",
          [f.incidentId]
        )
      ).rows
    ).toEqual([{ project_id: f.source, alert_id: newRule, incident_id: f.incidentId }]);
    expect(
      (
        await pool.query(
          "SELECT project_id,billable FROM notification_daily_allowance_usage WHERE project_id=$1",
          [f.source]
        )
      ).rows
    ).toEqual([{ project_id: f.source, billable: true }]);
    const deliver = vi.fn();
    expect(
      await deliverNextDailyNotification({ store: daily, preferences, deliver, now: due })
    ).toBe(true);
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: f.email,
        total_incident_count: 1,
        items: [expect.objectContaining({ incident_id: f.incidentId, project_id: f.source })]
      })
    );
    expect(
      await deliverNextDailyNotification({ store: daily, preferences, deliver, now: due })
    ).toBe(false);
    expect(deliver).toHaveBeenCalledTimes(1);
  });
  it("rechecks canonical membership for daily mail admitted before consolidation", async () => {
    const f = await dailyFixture();
    const user = await seedExternalProjectCollaborator(pool, [f.target, f.source]);
    const email = await f.emailFor(user),
      alert = await f.alert(f.source, email);
    expect(await f.enqueue(alert, email)).toEqual({ created_delivery: true });
    await f.consolidate();
    await pool.query("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2", [
      f.target,
      user
    ]);
    expect(
      (
        await pool.query("SELECT id FROM project_members WHERE project_id=$1 AND user_id=$2", [
          f.source,
          user
        ])
      ).rows
    ).toHaveLength(1);
    const batch = await daily.claim(due);
    expect(batch).not.toBeNull();
    expect(await daily.listItems(batch!, null)).toEqual([]);
  });
  it("binds new daily recipients to current canonical membership instead of treating them as external", async () => {
    const f = await dailyFixture();
    await f.consolidate();
    const user = await seedExternalProjectCollaborator(pool, [f.target]);
    const email = await f.emailFor(user),
      alert = await f.alert(f.target, email);
    expect(await f.enqueue(alert, email)).toEqual({ created_delivery: true });
    expect(
      (
        await pool.query(
          "SELECT recipient_user_id FROM notification_daily_items WHERE incident_id=$1",
          [f.incidentId]
        )
      ).rows
    ).toEqual([{ recipient_user_id: user }]);
    await pool.query("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2", [
      f.target,
      user
    ]);
    const batch = await daily.claim(due);
    expect(await daily.listItems(batch!, null)).toEqual([]);
  });
  it("defers a prepared daily email when canonical pause settings change during preparation", async () => {
    const f = await dailyFixture(),
      alert = await f.alert(f.source);
    expect(await f.enqueue(alert)).toEqual({ created_delivery: true });
    await f.consolidate();
    const deliver = vi.fn();
    const decide = vi.fn(async (input: Parameters<typeof preferences.decide>[0]) => {
      const decision = await preferences.decide(input);
      await preferences.update(
        { audience: "shared", owner_id: f.organizationId, project_id: f.target },
        { pause: { channels: ["email"], until: null, allow_health_checks: false } },
        due
      );
      return decision;
    });
    expect(
      await deliverNextDailyNotification({
        store: daily,
        preferences: { decide },
        deliver,
        now: due
      })
    ).toBe(true);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(deliver).not.toHaveBeenCalled();
    expect(
      (
        await pool.query("SELECT status FROM notification_daily_batches WHERE recipient=$1", [
          f.email.toLowerCase()
        ])
      ).rows
    ).toEqual([{ status: "pending" }]);
    expect(
      await deliverNextDailyNotification({ store: daily, preferences, deliver, now: due })
    ).toBe(true);
    expect(deliver).not.toHaveBeenCalled();
  });
  it("retains canonical short-digest members and converts them to daily delivery without charging again", async () => {
    const f = await dailyFixture();
    await f.consolidate();
    const alert = await f.alert(f.target);
    const queued = await createPostgresAlertDeliveryStore(db).queueAlertEmailDigestItem({
      alert_id: alert,
      project_id: f.source,
      incident_id: f.incidentId,
      condition_type: "new_incident",
      dedupe_key: randomUUID(),
      notification_key: f.incidentId,
      cooldown_seconds: 0,
      recipient: f.email,
      payload: { occurred_at: now.toISOString(), severity: "high" },
      aggregation_window_seconds: 60,
      allow_new_digest: true
    });
    expect(queued.created).toBe(true);
    expect(await daily.listLegacyDigestItems(queued.digest_id!, null)).toMatchObject([
      { incident_id: f.incidentId, alert_ids: [alert], project_id: f.source }
    ]);
    expect(
      await filterNotificationDigest({
        digestId: queued.digest_id!,
        recipient: f.email,
        preferences,
        daily,
        now
      })
    ).toEqual({ items: [], total: 0 });
    expect(
      (
        await pool.query(
          "SELECT project_id,billable FROM notification_daily_allowance_usage WHERE project_id=$1",
          [f.source]
        )
      ).rows
    ).toEqual([{ project_id: f.source, billable: false }]);
    const deliver = vi.fn();
    expect(
      await deliverNextDailyNotification({ store: daily, preferences, deliver, now: due })
    ).toBe(true);
    expect(deliver).toHaveBeenCalledTimes(1);
  });
  it("applies current shared policy to retained origins and retains health-notification exceptions", async () => {
    const f = await seedConsolidationProjects(pool, db);
    await f.consolidate();
    const scope = { audience: "shared" as const, owner_id: f.organizationId, project_id: f.target };
    await preferences.update(scope, { channels: { webhook: "off", email: "off" } });
    expect((await preferences.decide({ project_id: f.source, channel: "webhook" })).mode).toBe(
      "off"
    );
    expect(await preferences.read({ ...scope, project_id: f.source })).toEqual(
      await preferences.read(scope)
    );
    const health = randomUUID();
    await pool.query(
      "INSERT INTO incidents(id,project_id,fingerprint,fingerprint_version,title,severity,first_seen_at,last_seen_at) VALUES($1,$2,'health','availability-v1','Unreachable','high',now(),now())",
      [health, f.source]
    );
    await preferences.update(scope, { channels: { email: "immediate" } });
    await preferences.update(scope, {
      pause: { channels: ["email"], until: null, allow_health_checks: true }
    });
    expect(
      (
        await preferences.decide({
          project_id: f.source,
          channel: "email",
          recipient: "owner@example.test"
        })
      ).mode
    ).toBe("off");
    expect(
      (
        await preferences.decide({
          project_id: f.source,
          channel: "email",
          recipient: "owner@example.test",
          incident_id: health
        })
      ).mode
    ).toBe("immediate");
    expect(
      await preferences.decide({
        project_id: f.source,
        channel: "email",
        recipient: "owner@example.test",
        incident_id: health
      })
    ).toEqual(
      await preferences.decide({
        project_id: f.target,
        channel: "email",
        recipient: "owner@example.test",
        incident_id: health
      })
    );
    await expect(
      preferences.update({ ...scope, project_id: f.source }, { channels: { webhook: "immediate" } })
    ).rejects.toThrow("project_consolidated");
  });
  it("reads canonical improvement settings through old project IDs", async () => {
    const f = await seedConsolidationProjects(pool, db);
    await f.consolidate();
    await improvements.updateImprovementSettings({
      project_id: f.target,
      automated_improvement_bundles_enabled: false,
      improvement_bundle_sensitivity: "verbose"
    });
    expect(await improvements.getImprovementSettingsByProjectId(f.source)).toEqual({
      automated_improvement_bundles_enabled: false,
      improvement_bundle_sensitivity: "verbose"
    });
  });
});
