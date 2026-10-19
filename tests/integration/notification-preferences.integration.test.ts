import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, afterEach, expect, it, vi } from "vitest";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import {
  migrateStorageSchema,
  assertStorageSchemaMigrationsApplied
} from "../../packages/storage/src/schema-migrations.js";
import { createNotificationPreferencesStore } from "../../packages/storage/src/notification-preferences-store.js";
import { createNotificationDailyStore } from "../../packages/storage/src/notification-daily-store.js";
import {
  deliverNextDailyNotification,
  type DailyNotificationDelivery
} from "../../packages/storage/src/notification-delivery-service.js";
import { filterNotificationDigest } from "../../packages/storage/src/notification-legacy-delivery.js";

runIntegration("notification preferences and durable daily delivery", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  const preferences = createNotificationPreferencesStore(db),
    daily = createNotificationDailyStore(db);
  const now = new Date("2026-10-18T12:00:00Z"),
    due = new Date("2026-10-19T09:00:00Z");
  const schedule = { time: "09:00", timezone: "UTC" };
  beforeAll(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
  });
  afterAll(async () => {
    await pool.end();
  });
  afterEach(async () => {
    // Queue claims are global; pending fixtures must not become another test's candidate.
    await pool.query("DELETE FROM notification_daily_batches");
  });
  async function fixture() {
    const projectId = randomUUID(),
      org = randomUUID();
    const email = `${projectId}@example.com`;
    const { ownerUserId } = await seedOwnedProject({
      pool,
      projectId,
      organizationId: org,
      organizationName: "Notifications",
      organizationSlug: org,
      projectName: "App",
      projectSlug: projectId,
      ownerEmail: email,
      organizationPlan: "team"
    });
    const alertId = randomUUID();
    await pool.query(
      "INSERT INTO alert_rules(id, project_id, created_by_user_id, channel, condition_type, config) VALUES($1,$2,$3,'email','new_incident',$4)",
      [alertId, projectId, ownerUserId, JSON.stringify({ to: email })]
    );
    await preferences.update(
      { audience: "personal", owner_id: ownerUserId, project_id: null },
      { channels: { email: "daily" }, daily: schedule },
      now
    );
    async function incident(resolved = false, health = false) {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO incidents(id,project_id,environment,fingerprint,fingerprint_version,title,severity,status,first_seen_at,last_seen_at)
        VALUES($1::uuid,$2,'production',($1::uuid)::text,$3,'Failure','high',$4,$5,$5)`,
        [id, projectId, health ? "availability-v1" : "v1", resolved ? "resolved" : "open", now]
      );
      return id;
    }
    return { projectId, org, ownerUserId, email, alertId, incident };
  }
  it("requires the ordered forward migration before new runtime readiness", async () => {
    const retainedProject = randomUUID(),
      retainedOrg = randomUUID();
    await seedOwnedProject({
      pool,
      projectId: retainedProject,
      organizationId: retainedOrg,
      organizationName: "Existing account",
      organizationSlug: retainedOrg,
      projectName: "Existing project",
      projectSlug: retainedProject,
      ownerEmail: `${retainedOrg}@example.com`,
      organizationPlan: "team"
    });
    await pool.query(
      "DROP TABLE notification_daily_allowance_usage, notification_daily_items, notification_daily_batches, notification_preferences"
    );
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id = '202610180001_add_notification_preferences'"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow();
    expect((await migrateStorageSchema(db)).applied).toContain(
      "202610180001_add_notification_preferences"
    );
    await assertStorageSchemaMigrationsApplied(db);
    expect((await migrateStorageSchema(db)).applied).toHaveLength(0);
    const indexes = await pool.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE tablename LIKE 'notification_%'"
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "notification_daily_items_incident_idx",
        "notification_daily_items_project_idx",
        "notification_daily_items_user_idx",
        "notification_daily_retention_idx",
        "notification_preferences_organization_idx",
        "notification_preferences_project_idx",
        "notification_daily_allowance_project_idx"
      ])
    );
    expect(
      (await pool.query("SELECT name FROM projects WHERE id=$1", [retainedProject])).rows
    ).toEqual([{ name: "Existing project" }]);
  });
  it("persists concurrent channel updates, personal scopes and health-check priority", async () => {
    const f = await fixture();
    const scope = { audience: "shared" as const, owner_id: f.org, project_id: null };
    await Promise.all([
      preferences.update(scope, { channels: { slack: "off" } }, now),
      preferences.update(
        { project_id: null, owner_id: f.org, audience: "shared" },
        { channels: { discord: "off" } },
        now
      )
    ]);
    expect((await preferences.get(scope, true, now)).settings.channels).toMatchObject({
      slack: "off",
      discord: "off"
    });
    const health = await f.incident(false, true);
    expect(
      (
        await preferences.decide({
          project_id: f.projectId,
          channel: "email",
          recipient: f.email,
          incident_id: health,
          now
        })
      ).mode
    ).toBe("immediate");
    await preferences.update(
      scope,
      { pause: { channels: ["email"], until: null, allow_health_checks: false } },
      now
    );
    expect(
      (
        await preferences.decide({
          project_id: f.projectId,
          channel: "email",
          recipient: f.email,
          incident_id: health,
          now
        })
      ).mode
    ).toBe("off");
    await preferences.update(scope, { resume: { channels: ["email"] } }, due);
    expect(
      (
        await preferences.decide({
          project_id: f.projectId,
          channel: "email",
          recipient: f.email,
          occurred_at: now.toISOString(),
          now: due
        })
      ).mode
    ).toBe("off");
  });
  it("deduplicates concurrent queueing and claims, excludes resolved incidents and does not repeat unchanged incidents", async () => {
    const f = await fixture(),
      open = await f.incident(),
      resolved = await f.incident();
    const enqueue = (id: string) =>
      daily.enqueue({
        alert_id: f.alertId,
        incident_id: id,
        project_id: f.projectId,
        recipient: f.email,
        occurred_at: now.toISOString(),
        schedule,
        now
      });
    await Promise.all(Array.from({ length: 8 }, () => enqueue(open)));
    await enqueue(resolved);
    await pool.query("UPDATE incidents SET status = 'resolved' WHERE id = $1", [resolved]);
    expect(
      Number(
        (
          await pool.query("SELECT count(*) FROM notification_daily_items WHERE project_id=$1", [
            f.projectId
          ])
        ).rows[0].count
      )
    ).toBe(2);
    const claims = await Promise.all([daily.claim(due), daily.claim(due)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const claim = claims.find(Boolean)!;
    expect((await daily.listItems(claim, null)).map((item) => item.incident_id)).toEqual([open]);
    await daily.fail(claim, new Date(due.getTime() - 120000));
    const deliver = vi.fn();
    await deliverNextDailyNotification({ store: daily, preferences, deliver, now: due });
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ total_incident_count: 1 }));
    await enqueue(open);
    expect(await daily.claim(due)).toBeNull();
    const anotherRule = randomUUID();
    await pool.query(
      "INSERT INTO alert_rules(id,project_id,created_by_user_id,channel,condition_type,config) VALUES($1,$2,$3,'email','severity_threshold',$4)",
      [anotherRule, f.projectId, f.ownerUserId, JSON.stringify({ to: f.email })]
    );
    await daily.enqueue({
      alert_id: anotherRule,
      incident_id: open,
      project_id: f.projectId,
      recipient: f.email,
      occurred_at: now.toISOString(),
      schedule,
      now: new Date("2026-10-19T10:00:00Z")
    });
    expect(
      Number(
        (
          await pool.query("SELECT count(*) FROM notification_daily_items WHERE alert_id=$1", [
            anotherRule
          ])
        ).rows[0].count
      )
    ).toBe(0);
    await pool.query("UPDATE incidents SET status='regressed', regressed_at=$2 WHERE id=$1", [
      open,
      "2026-10-19T10:00:00Z"
    ]);
    await daily.enqueue({
      alert_id: f.alertId,
      incident_id: open,
      project_id: f.projectId,
      recipient: f.email,
      occurred_at: "2026-10-19T10:00:00Z",
      schedule,
      now: new Date("2026-10-19T10:00:00Z")
    });
    expect(
      Number(
        (
          await pool.query("SELECT count(*) FROM notification_daily_items WHERE project_id=$1", [
            f.projectId
          ])
        ).rows[0].count
      )
    ).toBe(3);
    await pool.query(
      "UPDATE notification_daily_batches SET status='suppressed' WHERE recipient=$1 AND status='pending'",
      [f.email]
    );
  });
  it("keeps all legacy digest members when switching to daily and honors disabled destinations", async () => {
    const f = await fixture(),
      digestId = randomUUID();
    await pool.query(
      "INSERT INTO alert_email_digests(id,project_id,recipient,status) VALUES($1,$2,$3,'pending')",
      [digestId, f.projectId, f.email]
    );
    for (let index = 0; index < 30; index += 1) {
      const incidentId = await f.incident();
      await pool.query(
        `INSERT INTO alert_email_digest_items(id,digest_id,alert_id,project_id,incident_id,condition_type,dedupe_key,notification_key,payload)
        VALUES($1,$2,$3,$4,$5::uuid,'new_incident',($5::uuid)::text,($5::uuid)::text,$6)`,
        [
          randomUUID(),
          digestId,
          f.alertId,
          f.projectId,
          incidentId,
          JSON.stringify({ occurred_at: now.toISOString() })
        ]
      );
    }
    const result = await filterNotificationDigest({
      digestId,
      recipient: f.email,
      preferences,
      daily,
      now
    });
    expect(result.total).toBe(0);
    expect(
      Number(
        (
          await pool.query("SELECT count(*) FROM notification_daily_items WHERE project_id=$1", [
            f.projectId
          ])
        ).rows[0].count
      )
    ).toBe(30);
    await daily.enqueue({
      alert_id: f.alertId,
      incident_id: await f.incident(),
      project_id: f.projectId,
      recipient: f.email,
      occurred_at: now.toISOString(),
      schedule,
      now
    });
    // The existing short digest already accounts for this converted project/batch.
    expect(
      Number(
        (
          await pool.query(
            "SELECT count(*) FROM notification_daily_items WHERE project_id=$1 AND billable",
            [f.projectId]
          )
        ).rows[0].count
      )
    ).toBe(0);
    await pool.query("UPDATE alert_rules SET is_enabled=false WHERE id=$1", [f.alertId]);
    expect(await daily.listLegacyDigestItems(digestId, null)).toHaveLength(0);
    await pool.query("DELETE FROM projects WHERE id=$1", [f.projectId]);
    expect(
      Number(
        (
          await pool.query("SELECT count(*) FROM notification_daily_items WHERE project_id=$1", [
            f.projectId
          ])
        ).rows[0].count
      )
    ).toBe(0);
  });
  it("limits new billable project digests while allowing new items in an existing batch", async () => {
    const f = await fixture();
    const enqueue = async (allowed: boolean) =>
      daily.enqueue({
        alert_id: f.alertId,
        incident_id: await f.incident(),
        project_id: f.projectId,
        recipient: f.email,
        occurred_at: now.toISOString(),
        schedule,
        now,
        allow_new_delivery: allowed
      });
    expect(await enqueue(false)).toEqual({ created_delivery: false, allowance_exhausted: true });
    expect(await enqueue(true)).toEqual({ created_delivery: true });
    expect(await enqueue(false)).toEqual({ created_delivery: false });
    expect(
      Number(
        (
          await pool.query("SELECT count(*) FROM notification_daily_items WHERE project_id=$1", [
            f.projectId
          ])
        ).rows[0].count
      )
    ).toBe(2);
    const { createPostgresBillingStore } =
      await import("../../packages/storage/src/billing-store.js");
    const billing = await createPostgresBillingStore(db).getBillingSummaryForOrganization({
      organization_id: f.org,
      now: new Date().toISOString()
    });
    expect(billing?.allowances.monthly_alert_deliveries.used).toBe(1);
    await pool.query("DELETE FROM incidents WHERE project_id=$1", [f.projectId]);
    await pool.query(
      "UPDATE notification_daily_batches SET created_at=now()-interval '31 days' WHERE recipient=$1",
      [f.email]
    );
    await daily.cleanup();
    expect(
      (
        await createPostgresBillingStore(db).getBillingSummaryForOrganization({
          organization_id: f.org,
          now: new Date().toISOString()
        })
      )?.allowances.monthly_alert_deliveries.used
    ).toBe(1);
    await pool.query(
      "UPDATE notification_daily_batches SET status='suppressed' WHERE recipient=$1",
      [f.email]
    );
  });
  it("coalesces overdue windows and fences a restarted worker", async () => {
    const f = await fixture();
    for (let day = 18; day <= 20; day += 1) {
      await daily.enqueue({
        alert_id: f.alertId,
        incident_id: await f.incident(),
        project_id: f.projectId,
        recipient: f.email,
        occurred_at: now.toISOString(),
        schedule,
        now: new Date(`2026-10-${day}T12:00:00Z`)
      });
    }
    const restarted = new Date("2026-10-22T09:00:00Z");
    const claims = (await Promise.all([daily.claim(restarted), daily.claim(restarted)])).filter(
      (value) => value !== null
    );
    expect(claims).toHaveLength(1);
    const old = claims[0]!;
    expect(await daily.listItems(old, null)).toHaveLength(3);
    const replacement = await daily.claim(new Date("2026-10-22T09:11:00Z"));
    expect(replacement).not.toBeNull();
    expect(await daily.renew(old, new Date("2026-10-22T09:11:00Z"))).toBe(false);
    const usageBefore = await pool.query(
      "SELECT batch_id FROM notification_daily_allowance_usage WHERE project_id=$1",
      [f.projectId]
    );
    await daily.reschedule(
      old,
      (await daily.listItems(replacement!, null))[0]!.incident_id,
      { time: "10:00", timezone: "UTC" },
      new Date("2026-10-22T09:11:00Z")
    );
    expect(
      (
        await pool.query(
          "SELECT batch_id FROM notification_daily_allowance_usage WHERE project_id=$1",
          [f.projectId]
        )
      ).rows
    ).toEqual(usageBefore.rows);
    await daily.complete(old, true);
    expect(await daily.listItems(replacement!, null)).toHaveLength(3);
    await daily.complete(replacement!, true);
    expect(await daily.claim(new Date("2026-10-22T09:12:00Z"))).toBeNull();
  });
  it("filters former project members and shows shared restrictions in personal project settings", async () => {
    const f = await fixture(),
      memberId = randomUUID(),
      memberEmail = `${memberId}@example.com`;
    await pool.query("INSERT INTO users(id,email) VALUES($1,$2)", [memberId, memberEmail]);
    await pool.query(
      "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'member')",
      [randomUUID(), f.projectId, memberId]
    );
    await pool.query("UPDATE alert_rules SET config=$2 WHERE id=$1", [
      f.alertId,
      JSON.stringify({ to: memberEmail })
    ]);
    await daily.enqueue({
      alert_id: f.alertId,
      incident_id: await f.incident(),
      project_id: f.projectId,
      recipient: memberEmail,
      occurred_at: now.toISOString(),
      schedule,
      now
    });
    const batch = await daily.claim(due);
    expect(await daily.listItems(batch!, null)).toHaveLength(1);
    await pool.query("DELETE FROM project_members WHERE user_id=$1", [memberId]);
    expect(await daily.listItems(batch!, null)).toHaveLength(0);
    await daily.complete(batch!, false);
    await preferences.update(
      { audience: "shared", owner_id: f.org, project_id: null },
      { channels: { email: "off" } },
      now
    );
    const settings = await preferences.get(
      { audience: "personal", owner_id: f.ownerUserId, project_id: f.projectId },
      true,
      now
    );
    expect(settings.effective.email.mode).toBe("off");
    expect(settings.settings.channels.email).toBe("inherit");
  });
  it("exports only authorized notification data and cancels account email on deletion", async () => {
    const f = await fixture(),
      other = await fixture();
    const { exportNotificationAccountData, deleteNotificationAccountData } =
      await import("../../packages/storage/src/notification-account-data.js");
    await daily.enqueue({
      alert_id: f.alertId,
      incident_id: await f.incident(),
      project_id: f.projectId,
      recipient: f.email,
      occurred_at: now.toISOString(),
      schedule,
      now
    });
    const exported = await exportNotificationAccountData(db, {
      user_id: f.ownerUserId,
      organization_id: f.org,
      projectIds: [f.projectId]
    });
    expect(exported["notification_preferences"]).toEqual([
      expect.objectContaining({ user_id: f.ownerUserId })
    ]);
    expect(exported["notification_daily_items"]).toEqual([
      expect.objectContaining({ project_id: f.projectId })
    ]);
    expect(JSON.stringify(exported)).not.toContain(other.email);
    await deleteNotificationAccountData(db, f.ownerUserId);
    expect(
      Number(
        (
          await pool.query("SELECT count(*) FROM notification_daily_batches WHERE recipient=$1", [
            f.email
          ])
        ).rows[0].count
      )
    ).toBe(0);
    expect(
      Number(
        (
          await pool.query("SELECT count(*) FROM notification_preferences WHERE user_id=$1", [
            other.ownerUserId
          ])
        ).rows[0].count
      )
    ).toBe(1);
  });
  it("reschedules safely, defers changed policies without spending retries and cleans retained metadata", async () => {
    const f = await fixture(),
      incident = await f.incident();
    await daily.enqueue({
      alert_id: f.alertId,
      incident_id: incident,
      project_id: f.projectId,
      recipient: f.email,
      occurred_at: now.toISOString(),
      schedule,
      now
    });
    const batch = await daily.claim(due);
    const revision = await daily.policyRevision(batch!);
    await preferences.update(
      { audience: "personal", owner_id: f.ownerUserId, project_id: null },
      { daily: { time: "08:00", timezone: "UTC" } },
      due
    );
    expect(await daily.policyRevision(batch!)).not.toBe(revision);
    await daily.defer(batch!, due);
    const resumed = await daily.claim(due);
    expect(resumed?.attempts).toBe(1);
    await daily.reschedule(resumed!, incident, { time: "08:00", timezone: "UTC" }, due);
    await daily.complete(resumed!, false);
    const tomorrow = await daily.claim(new Date("2026-10-20T08:00:00Z"));
    expect(await daily.listItems(tomorrow!, null)).toHaveLength(1);
    await pool.query("UPDATE notification_daily_batches SET attempts=8 WHERE id=$1", [
      tomorrow!.id
    ]);
    await daily.fail(tomorrow!);
    expect(
      (
        await pool.query("SELECT status,last_error FROM notification_daily_batches WHERE id=$1", [
          tomorrow!.id
        ])
      ).rows[0]
    ).toEqual({ status: "failed", last_error: "notification_email_transport_failed" });
    await pool.query(
      "UPDATE notification_daily_batches SET created_at=now()-interval '31 days' WHERE recipient=$1",
      [f.email]
    );
    await daily.cleanup();
    expect(
      Number(
        (
          await pool.query("SELECT count(*) FROM notification_daily_batches WHERE recipient=$1", [
            f.email
          ])
        ).rows[0].count
      )
    ).toBe(0);
  });
  it.each(["personal", "shared"] as const)(
    "rechecks an earlier %s schedule before the old due time, including a delayed worker",
    async (audience) => {
      const f = await fixture();
      if (audience === "shared") {
        await preferences.update(
          { audience: "personal", owner_id: f.ownerUserId, project_id: null },
          { channels: { email: "immediate" } },
          now
        );
        await preferences.update(
          { audience, owner_id: f.org, project_id: null },
          { channels: { email: "daily" }, daily: schedule },
          now
        );
      }
      await daily.enqueue({
        alert_id: f.alertId,
        incident_id: await f.incident(),
        project_id: f.projectId,
        recipient: f.email,
        occurred_at: now.toISOString(),
        schedule,
        now
      });
      const changed = new Date("2026-10-19T08:00:00Z");
      await preferences.update(
        { audience, owner_id: audience === "personal" ? f.ownerUserId : f.org, project_id: null },
        { daily: { time: "08:30", timezone: "UTC" } },
        changed
      );
      const deliver = vi.fn();
      const restarted = new Date("2026-10-19T08:40:00Z");
      for (let pass = 0; pass < 4; pass += 1)
        await deliverNextDailyNotification({ store: daily, preferences, deliver, now: restarted });
      expect(deliver).toHaveBeenCalledTimes(1);
      expect(deliver).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: f.email, total_incident_count: 1 })
      );
      expect(await daily.claim(restarted)).toBeNull();
    }
  );
  it("does not send a future digest early when another channel or an inherited setting changes", async () => {
    const f = await fixture();
    await daily.enqueue({
      alert_id: f.alertId,
      incident_id: await f.incident(),
      project_id: f.projectId,
      recipient: f.email,
      occurred_at: now.toISOString(),
      schedule,
      now
    });
    const deliver = vi.fn();
    await deliverNextDailyNotification({ store: daily, preferences, deliver, now });
    expect(deliver).not.toHaveBeenCalled();
    const early = new Date("2026-10-19T08:00:00Z");
    await preferences.update(
      { audience: "shared", owner_id: f.org, project_id: f.projectId },
      { channels: { slack: "off" } },
      early
    );
    expect(await daily.claim(early)).toBeNull();
    // The personal schedule still wins, so this wake-up must retain the 09:00 delivery.
    await preferences.update(
      { audience: "shared", owner_id: f.org, project_id: f.projectId },
      { daily: { time: "08:30", timezone: "UTC" } },
      early
    );
    await deliverNextDailyNotification({ store: daily, preferences, deliver, now: early });
    expect(deliver).not.toHaveBeenCalled();
    expect(await daily.claim(early)).toBeNull();
    await deliverNextDailyNotification({ store: daily, preferences, deliver, now: due });
    expect(deliver).toHaveBeenCalledTimes(1);
  });
  it("flushes already pending incidents when daily email is switched to immediate", async () => {
    const f = await fixture();
    await daily.enqueue({
      alert_id: f.alertId,
      incident_id: await f.incident(),
      project_id: f.projectId,
      recipient: f.email,
      occurred_at: now.toISOString(),
      schedule,
      now
    });
    const changed = new Date("2026-10-19T08:00:00Z");
    await preferences.update(
      { audience: "personal", owner_id: f.ownerUserId, project_id: f.projectId },
      { channels: { email: "immediate" } },
      changed
    );
    const deliver = vi.fn();
    for (let pass = 0; pass < 4; pass += 1)
      await deliverNextDailyNotification({ store: daily, preferences, deliver, now: changed });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: f.email, total_incident_count: 1 })
    );
  });
  it("separates projects when only one pending digest schedule changes", async () => {
    const first = await fixture(),
      second = await fixture();
    await pool.query("UPDATE alert_rules SET config=$2 WHERE id=$1", [
      second.alertId,
      JSON.stringify({ to: first.email })
    ]);
    for (const f of [first, second])
      await daily.enqueue({
        alert_id: f.alertId,
        incident_id: await f.incident(),
        project_id: f.projectId,
        recipient: first.email,
        occurred_at: now.toISOString(),
        schedule,
        now
      });
    const deliver = vi.fn();
    await deliverNextDailyNotification({ store: daily, preferences, deliver, now });
    await preferences.update(
      { audience: "personal", owner_id: first.ownerUserId, project_id: first.projectId },
      { daily: { time: "08:30", timezone: "UTC" } },
      new Date("2026-10-19T08:00:00Z")
    );
    for (let pass = 0; pass < 4; pass += 1)
      await deliverNextDailyNotification({
        store: daily,
        preferences,
        deliver,
        now: new Date("2026-10-19T08:30:00Z")
      });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenLastCalledWith(
      expect.objectContaining({
        total_incident_count: 1,
        items: [expect.objectContaining({ project_id: first.projectId })]
      })
    );
    for (let pass = 0; pass < 4; pass += 1)
      await deliverNextDailyNotification({ store: daily, preferences, deliver, now: due });
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(deliver).toHaveBeenLastCalledWith(
      expect.objectContaining({
        total_incident_count: 1,
        items: [expect.objectContaining({ project_id: second.projectId })]
      })
    );
  });
  it("preserves a settings wake-up that arrives while a future batch is being released", async () => {
    const f = await fixture();
    await daily.enqueue({
      alert_id: f.alertId,
      incident_id: await f.incident(),
      project_id: f.projectId,
      recipient: f.email,
      occurred_at: now.toISOString(),
      schedule,
      now
    });
    const batch = await daily.claim(now);
    expect(batch).not.toBeNull();
    const changed = new Date(now.getTime() + 1000);
    await preferences.update(
      { audience: "personal", owner_id: f.ownerUserId, project_id: null },
      { daily: { time: "12:01", timezone: "UTC" } },
      changed
    );
    await daily.defer(batch!, changed, due);
    const deliver = vi.fn();
    for (let pass = 0; pass < 4; pass += 1)
      await deliverNextDailyNotification({
        store: daily,
        preferences,
        deliver,
        now: new Date("2026-10-18T12:01:00Z")
      });
    expect(deliver).toHaveBeenCalledTimes(1);
  });
  it("preserves rule cooldowns across daily and immediate delivery transitions", async () => {
    const f = await fixture();
    const { createPostgresAlertDeliveryStore } =
      await import("../../packages/storage/src/alert-delivery-store.js");
    const alerts = createPostgresAlertDeliveryStore(db);
    const enqueue = async (key: string) =>
      daily.enqueue({
        alert_id: f.alertId,
        incident_id: await f.incident(),
        project_id: f.projectId,
        recipient: f.email,
        occurred_at: now.toISOString(),
        schedule,
        now,
        notification_key: key,
        cooldown_seconds: 3600
      });
    await enqueue("same-signal");
    await enqueue("same-signal");
    expect(
      (
        await pool.query("SELECT id FROM notification_daily_items WHERE project_id=$1", [
          f.projectId
        ])
      ).rows
    ).toHaveLength(1);
    const immediate = async (key: string) =>
      alerts.queueAlertEmailDigestItem({
        alert_id: f.alertId,
        project_id: f.projectId,
        incident_id: await f.incident(),
        condition_type: "new_incident",
        dedupe_key: randomUUID(),
        notification_key: key,
        cooldown_seconds: 3600,
        recipient: f.email,
        payload: {},
        aggregation_window_seconds: 10,
        allow_new_digest: true
      });
    expect((await immediate("same-signal")).created).toBe(false);
    expect((await immediate("different-severity")).created).toBe(true);
    await enqueue("different-severity");
    expect(
      (
        await pool.query("SELECT id FROM notification_daily_items WHERE project_id=$1", [
          f.projectId
        ])
      ).rows
    ).toHaveLength(1);
    await pool.query(
      "UPDATE notification_daily_items SET created_at=now()-interval '2 hours' WHERE project_id=$1",
      [f.projectId]
    );
    expect((await immediate("same-signal")).created).toBe(true);
  });
  it.each(["delivered", "in-flight"] as const)(
    "keeps rescheduled incidents out of an already %s daily email window",
    async (targetState) => {
      const f = await fixture();
      const prior = await f.incident(),
        moved = await f.incident();
      for (const [incidentId, time] of [
        [prior, "09:00"],
        [moved, "10:00"]
      ] as const) {
        await daily.enqueue({
          alert_id: f.alertId,
          incident_id: incidentId,
          project_id: f.projectId,
          recipient: f.email,
          occurred_at: now.toISOString(),
          schedule: { ...schedule, time },
          now
        });
      }
      // Model a schedule change prepared after another window has begun delivery.
      await pool.query(
        "UPDATE notification_daily_batches SET next_attempt_at=due_at WHERE recipient=$1",
        [f.email]
      );
      const target = await daily.claim(due);
      expect((await daily.listItems(target!, null)).map((item) => item.incident_id)).toEqual([
        prior
      ]);
      if (targetState === "delivered") await daily.complete(target!, true);
      const changeAt = new Date("2026-10-19T08:30:00Z"),
        claimAt = new Date("2026-10-19T09:01:00Z");
      await pool.query(
        "UPDATE notification_daily_batches SET next_attempt_at=$2 WHERE recipient=$1 AND schedule_time='10:00'",
        [f.email, changeAt]
      );
      const source = await daily.claim(claimAt);
      await daily.reschedule(source!, moved, schedule, changeAt, undefined, claimAt);
      await daily.complete(source!, false);
      if (targetState === "in-flight") await daily.complete(target!, true);
      expect(
        (
          await pool.query("SELECT incident_id FROM notification_daily_items WHERE batch_id=$1", [
            target!.id
          ])
        ).rows
      ).toEqual([{ incident_id: prior }]);
      const pending = await daily.claim(new Date("2026-10-20T09:00:00Z"));
      expect(pending).not.toBeNull();
      expect((await daily.listItems(pending!, null)).map((item) => item.incident_id)).toEqual([
        moved
      ]);
    }
  );
  it.each(["delivered", "in-flight"] as const)(
    "keeps a delayed new incident out of an already %s daily email window",
    async (targetState) => {
      const f = await fixture();
      const prior = await f.incident(),
        late = await f.incident();
      const enqueue = (incidentId: string, at: Date) =>
        daily.enqueue({
          alert_id: f.alertId,
          incident_id: incidentId,
          project_id: f.projectId,
          recipient: f.email,
          occurred_at: now.toISOString(),
          schedule,
          now: at
        });
      await enqueue(prior, now);
      const target = await daily.claim(due);
      expect((await daily.listItems(target!, null)).map((item) => item.incident_id)).toEqual([
        prior
      ]);
      if (targetState === "delivered") await daily.complete(target!, true);
      // Admission can begin before the deadline and wait behind another transaction.
      await enqueue(late, new Date("2026-10-19T08:59:59Z"));
      if (targetState === "in-flight") await daily.complete(target!, true);
      expect(
        (
          await pool.query("SELECT incident_id FROM notification_daily_items WHERE batch_id=$1", [
            target!.id
          ])
        ).rows
      ).toEqual([{ incident_id: prior }]);
      const pending = await daily.claim(new Date("2026-10-20T09:00:00Z"));
      expect(pending).not.toBeNull();
      expect((await daily.listItems(pending!, null)).map((item) => item.incident_id)).toEqual([
        late
      ]);
    }
  );
  it("still admits new incidents while a future window is checking policies", async () => {
    const f = await fixture();
    const prior = await f.incident(),
      late = await f.incident();
    const enqueue = (incidentId: string) =>
      daily.enqueue({
        alert_id: f.alertId,
        incident_id: incidentId,
        project_id: f.projectId,
        recipient: f.email,
        occurred_at: now.toISOString(),
        schedule,
        now
      });
    await enqueue(prior);
    const future = await daily.claim(now);
    await enqueue(late);
    await daily.defer(future!, now, due);
    const deliver = vi
      .fn<(delivery: DailyNotificationDelivery) => Promise<void>>()
      .mockResolvedValue(undefined);
    await deliverNextDailyNotification({ store: daily, preferences, deliver, now: due });
    expect(deliver).toHaveBeenCalledOnce();
    expect(
      deliver.mock.calls[0]![0].items.map(
        (item: { incident_id: string }) => item.incident_id
      ).sort()
    ).toEqual([prior, late].sort());
    expect(await daily.claim(new Date("2026-10-20T09:00:00Z"))).toBeNull();
  });
});
