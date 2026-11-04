import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { createPostgresWeeklyReportChannelStore } from "../../packages/storage/src/weekly-report-channel-store.js";
import { createPostgresWeeklyReportDeliveryStore } from "../../packages/storage/src/weekly-report-delivery-store.js";
import { createMetadataWeeklyReports } from "../../packages/storage/src/metadata-weekly-reports.js";
import { seedConsolidationProjects } from "../helpers/consolidation-projects.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";

runIntegration("weekly report convergence and accepted scopes", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    channels = createPostgresWeeklyReportChannelStore(db),
    deliveries = createPostgresWeeklyReportDeliveryStore(db),
    reports = createMetadataWeeklyReports(db);
  beforeAll(async () => {
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
  });
  afterAll(async () => {
    await pool.end();
  });
  async function fixture() {
    const f = await seedConsolidationProjects(pool, db);
    const create = (projectId: string) =>
      channels.createWeeklyReportChannelForOrganization({
        organization_id: f.organizationId,
        project_id: projectId,
        channel: "email",
        config: { to: ["owner@example.test"] },
        schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
        is_enabled: true
      });
    const targetChannel = await create(f.target),
      sourceChannel = await create(f.source);
    if (
      !targetChannel ||
      typeof targetChannel === "string" ||
      !sourceChannel ||
      typeof sourceChannel === "string"
    )
      throw new Error("channel_fixture_failed");
    for (const origin of [f.source, f.target, f.target])
      await pool.query(
        "INSERT INTO incidents(id,project_id,fingerprint,title,severity,first_seen_at,last_seen_at) VALUES($1::uuid,$2,$1::text,'Failure','high','2026-11-02T12:00:00Z','2026-11-02T12:00:00Z')",
        [randomUUID(), origin]
      );
    const window = {
      window_start: "2026-11-02T00:00:00.000Z",
      window_end: "2026-11-09T00:00:00.000Z"
    };
    const claim = (
      projectId: string,
      channelId: string,
      windowStart = window.window_start,
      windowEnd = window.window_end
    ) =>
      deliveries.claimWeeklyReportDelivery({
        project_id: projectId,
        weekly_report_channel_id: channelId,
        channel: "email",
        window_start: windowStart,
        window_end: windowEnd
      });
    return { ...f, targetChannel, sourceChannel, window, claim };
  }
  it("converges future scheduling without duplicating an already accepted origin window", async () => {
    const f = await fixture();
    const accepted = await f.claim(f.source, f.sourceChannel.channel_id);
    await f.consolidate();
    const scheduled = (await channels.listEnabledWeeklyReportChannels({ limit: 1000 })).filter(
      (c) => [f.target, f.source].includes(c.project_id)
    );
    expect(scheduled.map((c) => c.channel_id)).toEqual([f.targetChannel.channel_id]);
    const again = await f.claim(f.target, f.targetChannel.channel_id);
    expect(again).toEqual({ delivery_id: accepted.delivery_id, created: false });
    expect(
      await channels.getWeeklyReportChannelById({ channel_id: f.sourceChannel.channel_id })
    ).toMatchObject({ channel_id: f.sourceChannel.channel_id, project_id: f.source });
    await channels.updateWeeklyReportChannelForOrganization({
      organization_id: f.organizationId,
      channel_id: f.targetChannel.channel_id,
      is_enabled: false
    });
    expect(
      await channels.getWeeklyReportChannelById({ channel_id: f.sourceChannel.channel_id })
    ).toMatchObject({ is_enabled: false });
    await channels.updateWeeklyReportChannelForOrganization({
      organization_id: f.organizationId,
      channel_id: f.targetChannel.channel_id,
      is_enabled: true
    });
    expect(
      await reports.getWeeklyProjectReport({
        project_id: f.source,
        delivery_id: accepted.delivery_id,
        ...f.window
      })
    ).toMatchObject({ new_incidents: 1 });
    expect(
      await reports.getWeeklyProjectReport({ project_id: f.target, ...f.window })
    ).toMatchObject({ new_incidents: 3 });
    const next = await f.claim(
      f.target,
      f.targetChannel.channel_id,
      "2026-11-09T00:00:00.000Z",
      "2026-11-16T00:00:00.000Z"
    );
    expect(next.created).toBe(true);
    expect(
      (
        await pool.query<{ scope_origin_ids: string[] }>(
          "SELECT scope_origin_ids FROM weekly_report_deliveries WHERE id=$1",
          [next.delivery_id]
        )
      ).rows[0]?.scope_origin_ids.sort()
    ).toEqual([f.source, f.target].sort());
    expect(
      (await reports.listProjectsWithWeeklyActivity({ ...f.window, limit: 1000 })).filter((id) =>
        [f.target, f.source].includes(id)
      )
    ).toEqual([f.target]);
  });
  it("preserves both accepted scopes and claim IDs when each project already has work queued", async () => {
    const f = await fixture();
    const a = await f.claim(f.source, f.sourceChannel.channel_id),
      b = await f.claim(f.target, f.targetChannel.channel_id);
    await f.consolidate();
    expect(
      await reports.getWeeklyProjectReport({
        project_id: f.source,
        delivery_id: a.delivery_id,
        ...f.window
      })
    ).toMatchObject({ new_incidents: 1 });
    expect(
      await reports.getWeeklyProjectReport({
        project_id: f.target,
        delivery_id: b.delivery_id,
        ...f.window
      })
    ).toMatchObject({ new_incidents: 2 });
    expect((await f.claim(f.target, f.targetChannel.channel_id)).created).toBe(false);
    await channels.deleteWeeklyReportChannelForOrganization({
      organization_id: f.organizationId,
      channel_id: f.targetChannel.channel_id
    });
    expect(
      await channels.getWeeklyReportChannelById({ channel_id: f.sourceChannel.channel_id })
    ).toBeNull();
    expect(
      (
        await pool.query("SELECT id FROM weekly_report_deliveries WHERE id=ANY($1::uuid[])", [
          [a.delivery_id, b.delivery_id]
        ])
      ).rows
    ).toHaveLength(2);
  });
  it("retries an accepted source claim with its original identities and never reopens suppressed history", async () => {
    const f = await fixture();
    const source = await f.claim(f.source, f.sourceChannel.channel_id),
      target = await f.claim(f.target, f.targetChannel.channel_id);
    await deliveries.markWeeklyReportDeliveryResult({
      delivery_id: source.delivery_id,
      delivered: false,
      error_message: "temporary_fixture_failure"
    });
    await deliveries.markWeeklyReportDeliveryResult({
      delivery_id: target.delivery_id,
      delivered: false,
      error_message: "notification_suppressed"
    });
    await f.consolidate();
    expect(await f.claim(f.target, f.targetChannel.channel_id)).toEqual({
      delivery_id: source.delivery_id,
      created: true,
      project_id: f.source,
      weekly_report_channel_id: f.sourceChannel.channel_id
    });
    expect((await f.claim(f.target, f.targetChannel.channel_id)).created).toBe(false);
    expect(
      (
        await pool.query("SELECT status,last_error FROM weekly_report_deliveries WHERE id=$1", [
          target.delivery_id
        ])
      ).rows[0]
    ).toEqual({ status: "failed", last_error: "notification_suppressed" });
  });
  it("flattens equivalent schedule identities across repeated merges", async () => {
    const f = await fixture();
    const accepted = await f.claim(f.source, f.sourceChannel.channel_id);
    await f.consolidate();
    const later = randomUUID();
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Later',$1::text)",
      [later, f.organizationId, f.userId]
    );
    const channel = await channels.createWeeklyReportChannelForOrganization({
      organization_id: f.organizationId,
      project_id: later,
      channel: "email",
      config: f.targetChannel.config,
      schedule: f.targetChannel.schedule,
      is_enabled: true
    });
    if (!channel || typeof channel === "string") throw new Error("later_channel_fixture_failed");
    const request = {
      target_project_id: later,
      source_project_ids: [f.target],
      service_mappings: f.request.service_mappings.map((m) => ({
        ...m,
        source_project_id: f.target
      }))
    };
    const preview = await f.store.preview({ user_id: f.userId, request });
    expect(preview.blockers).toEqual([]);
    await f.store.apply({
      user_id: f.userId,
      request,
      plan_digest: preview.plan_digest,
      idempotency_key: randomUUID()
    });
    expect(await f.claim(later, channel.channel_id)).toEqual({
      delivery_id: accepted.delivery_id,
      created: false
    });
    expect(
      (
        await pool.query(
          "SELECT legacy_channel_id,canonical_channel_id FROM weekly_report_channel_aliases WHERE legacy_channel_id=ANY($1::uuid[]) ORDER BY legacy_channel_id",
          [[f.sourceChannel.channel_id, f.targetChannel.channel_id]]
        )
      ).rows
    ).toEqual(
      [f.sourceChannel.channel_id, f.targetChannel.channel_id]
        .sort()
        .map((id) => ({ legacy_channel_id: id, canonical_channel_id: channel.channel_id }))
    );
  });
});
