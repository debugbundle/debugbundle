import { processNextDeliverAlertEmailDigestJob, processNextEvaluateAlertsJob } from "../../apps/worker/src/processor-alerts.js";
import type { EvaluateAlertsWorkerDependencies } from "../../apps/worker/src/processor-shared.js";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, expect, it, vi } from "vitest";

import {
  buildSeverityThresholdDedupeKey,
  createPostgresAlertDeliveryStore,
  createPostgresAlertGroupInspectionStore,
  createPostgresMetadataStore
} from "../../packages/storage/src/index.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.ts";

runIntegration("alert delivery transition dedupe integration", () => {
  const pool = createIntegrationPool();

  beforeAll(async (): Promise<void> => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    const db = createQueryable(pool);
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
  });

  afterAll(async (): Promise<void> => {
    await pool.end();
  });

  async function seedAlertContext(input: {
    channel: "email" | "slack" | "discord" | "webhook";
    suffix: string;
  }): Promise<{ alertId: string; incidentId: string; projectId: string; organizationId: string; ownerUserId: string; notificationKey: string }> {
    const organizationId = randomUUID();
    const projectId = randomUUID();
    const incidentId = randomUUID();
    const alertId = randomUUID();
    const notificationKey = `availability_check:${input.suffix}`;
    const { ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: `Alert delivery ${input.suffix}`,
      organizationSlug: `alert-delivery-${input.suffix}`,
      projectName: "Production app",
      projectSlug: `production-app-${input.suffix}`,
      organizationPlan: "team"
    });

    await pool.query(
      `
        INSERT INTO incidents (
          id,
          project_id,
          environment,
          fingerprint,
          fingerprint_version,
          title,
          severity,
          status,
          first_seen_at,
          last_seen_at,
          occurrence_count
        )
        VALUES ($1, $2, 'production', $3, 'v1', 'Availability check failed', 'high', 'regressed', now(), now(), 4)
      `,
      [incidentId, projectId, notificationKey]
    );
    await pool.query(
      `
        INSERT INTO alert_rules (
          id,
          project_id,
          created_by_user_id,
          channel,
          condition_type,
          severity_min,
          severity_lifecycle_scope,
          cooldown_seconds,
          config,
          is_enabled
        )
        VALUES ($1, $2, $3, $4, 'severity_threshold', 'high', 'both', 0, $5::jsonb, true)
      `,
      [
        alertId,
        projectId,
        ownerUserId,
        input.channel,
        JSON.stringify(input.channel === "email" ? { to: "alerts@example.com" }
          : input.channel === "webhook" ? { target_url: "https://example.com" }
            : { webhook_url: "https://example.com" })
      ]
    );

    return { alertId, incidentId, projectId, organizationId, ownerUserId, notificationKey };
  }

  it("keeps signed custom alert secrets out of management reads while delivering the current key", async () => {
    const context = await seedAlertContext({ channel: "webhook", suffix: `signing-${randomUUID()}` });
    const db = createQueryable(pool);
    const metadata = createPostgresMetadataStore(db);
    const deliveries = createPostgresAlertDeliveryStore(db);
    const secret = "dbundle_asec_first-test-secret";
    const created = await metadata.createAlertForOrganization({
      organization_id: context.organizationId,
      project_id: context.projectId,
      created_by_user_id: context.ownerUserId,
      channel: "webhook",
      condition_type: "new_incident",
      cooldown_seconds: 0,
      config: { target_url: "https://hooks.example.test/alert" },
      signing_secret: secret,
      is_enabled: true
    });
    expect(created).not.toBeNull();
    if (created === null) throw new Error("alert_creation_failed");
    expect(created).not.toHaveProperty("signing_secret");
    const matching = () => deliveries.listMatchingAlerts({ project_id: context.projectId,
      condition_type: "new_incident", service_name: "api", environment: "production",
      severity: "high" });
    expect((await matching()).find((rule) => rule.alert_id === created?.alert_id)?.signing_secret).toBe(secret);

    const rotated = "dbundle_asec_rotated-test-secret";
    const updated = await metadata.updateAlertForOrganization({
      organization_id: context.organizationId,
      project_id: context.projectId,
      alert_id: created.alert_id,
      actor_user_id: context.ownerUserId,
      actor_role: "owner",
      channel: "webhook",
      signing_secret: rotated
    });
    expect(updated).not.toHaveProperty("signing_secret");
    expect((await matching()).find((rule) => rule.alert_id === created?.alert_id)?.signing_secret).toBe(rotated);
    const listed = await metadata.listAlertsForOrganization({ organization_id: context.organizationId,
      project_id: context.projectId, limit: 10 });
    expect(listed?.every((rule) => !Object.hasOwn(rule, "signing_secret"))).toBe(true);
    await metadata.updateAlertForOrganization({ organization_id: context.organizationId,
      project_id: context.projectId, alert_id: created.alert_id,
      actor_user_id: context.ownerUserId, actor_role: "owner", channel: "slack",
      config: { webhook_url: "https://hooks.slack.test/alert" } });
    expect((await pool.query<{ signing_secret: string | null }>(
      "SELECT signing_secret FROM alert_rules WHERE id = $1", [created.alert_id]
    )).rows[0]?.signing_secret).toBeNull();
    expect((await pool.query<{ signing_secret: string | null }>(
      "SELECT signing_secret FROM alert_rules WHERE id = $1", [context.alertId]
    )).rows[0]?.signing_secret).toBeNull();
  });

  it("creates one direct delivery per regression transition while deduplicating a retry", async (): Promise<void> => {
    const context = await seedAlertContext({ channel: "webhook", suffix: "direct" });
    const store = createPostgresAlertDeliveryStore(createQueryable(pool));
    const firstDedupeKey = buildSeverityThresholdDedupeKey({
      severity: "high",
      lifecycleEvent: "incident_regressed",
      transitionId: "event-1"
    });
    const laterDedupeKey = buildSeverityThresholdDedupeKey({
      severity: "high",
      lifecycleEvent: "incident_regressed",
      transitionId: "event-2"
    });
    const create = (dedupeKey: string) =>
      store.createAlertDeliveryIntent({
        evaluation_job_id: `evaluation:${dedupeKey}`,
        alert_id: context.alertId,
        project_id: context.projectId,
        incident_id: context.incidentId,
        condition_type: "severity_threshold",
        dedupe_key: dedupeKey,
        notification_key: context.notificationKey,
        cooldown_seconds: 0,
        channel: "webhook",
        payload: { incident_id: context.incidentId }
      });

    await expect(create(firstDedupeKey)).resolves.toEqual({
      delivery_id: expect.any(String),
      created: true
    });
    await expect(create(firstDedupeKey)).resolves.toEqual({ delivery_id: expect.any(String), created: false });
    await expect(create(laterDedupeKey)).resolves.toEqual({
      delivery_id: expect.any(String),
      created: true
    });
  });

  it("does not attach an incident from another project to an alert delivery", async () => {
    const owner = await seedAlertContext({ channel: "slack", suffix: `scope-owner-${randomUUID()}` });
    const other = await seedAlertContext({ channel: "slack", suffix: `scope-other-${randomUUID()}` });
    const store = createPostgresAlertDeliveryStore(createQueryable(pool));

    const result = await store.createAlertDeliveryIntent({
      alert_id: owner.alertId,
      project_id: owner.projectId,
      incident_id: other.incidentId,
      condition_type: "new_incident",
      dedupe_key: "new_incident",
      notification_key: "cross-project",
      coalescing_key: "cross-project-burst",
      cooldown_seconds: 0,
      channel: "slack",
      payload: {}
    });

    expect(result).toEqual({ created: false, delivery_id: null });
    expect((await pool.query("SELECT count(*)::int AS count FROM alert_deliveries WHERE alert_id = $1", [owner.alertId])).rows[0]?.count).toBe(0);
  });

  it("does not expose a historical delivery whose root incident belongs to another project", async () => {
    const owner = await seedAlertContext({ channel: "slack", suffix: `legacy-owner-${randomUUID()}` });
    const other = await seedAlertContext({ channel: "slack", suffix: `legacy-other-${randomUUID()}` });
    const deliveryId = randomUUID();
    await pool.query(`
      INSERT INTO alert_deliveries (
        id, alert_id, project_id, incident_id, condition_type, dedupe_key,
        notification_key, channel, status, payload
      ) VALUES ($1, $2, $3, $4, 'new_incident', 'new_incident', $5, 'slack', 'delivered', '{}'::jsonb)
    `, [deliveryId, owner.alertId, owner.projectId, other.incidentId, deliveryId]);
    const inspection = createPostgresAlertGroupInspectionStore(createQueryable(pool));
    expect(await inspection.getGroupForOrganization({
      organization_id: owner.organizationId, project_id: owner.projectId,
      kind: "direct", group_id: deliveryId, limit: 10
    })).toBeNull();
    const listed = await inspection.listGroupsForOrganization({
      organization_id: owner.organizationId, project_id: owner.projectId, limit: 10
    });
    expect(listed?.groups).toEqual([]);
  });

  it("does not expose a historical direct delivery owned by another project's alert rule", async () => {
    const owner = await seedAlertContext({ channel: "slack", suffix: `legacy-rule-owner-${randomUUID()}` });
    const other = await seedAlertContext({ channel: "slack", suffix: `legacy-rule-other-${randomUUID()}` });
    const deliveryId = randomUUID();
    await pool.query(`
      INSERT INTO alert_deliveries (
        id, alert_id, project_id, incident_id, condition_type, dedupe_key,
        notification_key, channel, status, payload
      ) VALUES ($1, $2, $3, $4, 'new_incident', 'new_incident', $5, 'slack', 'delivered', '{}'::jsonb)
    `, [deliveryId, other.alertId, owner.projectId, owner.incidentId, deliveryId]);
    const inspection = createPostgresAlertGroupInspectionStore(createQueryable(pool));
    expect(await inspection.getGroupForOrganization({
      organization_id: owner.organizationId, project_id: owner.projectId,
      kind: "direct", group_id: deliveryId, limit: 10
    })).toBeNull();
    expect((await inspection.listGroupsForOrganization({
      organization_id: owner.organizationId, project_id: owner.projectId, limit: 10
    }))?.groups).toEqual([]);
  });

  it("does not create an email digest for an incident outside the alert's project", async () => {
    const owner = await seedAlertContext({ channel: "email", suffix: `email-scope-owner-${randomUUID()}` });
    const other = await seedAlertContext({ channel: "email", suffix: `email-scope-other-${randomUUID()}` });
    const store = createPostgresAlertDeliveryStore(createQueryable(pool));

    const result = await store.queueAlertEmailDigestItem({
      alert_id: owner.alertId, project_id: owner.projectId,
      incident_id: other.incidentId, condition_type: "new_incident",
      dedupe_key: "new_incident", notification_key: "cross-project",
      cooldown_seconds: 0, recipient: "private@example.com", payload: {},
      aggregation_window_seconds: 10, allow_new_digest: true
    });

    expect(result).toEqual({ digest_id: null, created: false, created_digest: false });
    expect((await pool.query("SELECT count(*)::int AS count FROM alert_email_digests WHERE project_id = $1", [owner.projectId])).rows[0]?.count).toBe(0);
  });

  it("does not expose a historical email item from another project", async () => {
    const owner = await seedAlertContext({ channel: "email", suffix: `legacy-email-owner-${randomUUID()}` });
    const other = await seedAlertContext({ channel: "email", suffix: `legacy-email-other-${randomUUID()}` });
    const digestId = randomUUID();
    await pool.query(`
      INSERT INTO alert_email_digests (id, project_id, recipient, status)
      VALUES ($1, $2, 'private@example.com', 'delivered')
    `, [digestId, owner.projectId]);
    await pool.query(`
      INSERT INTO alert_email_digest_items (
        id, digest_id, alert_id, project_id, incident_id, condition_type,
        dedupe_key, notification_key, payload
      ) VALUES ($1, $2, $3, $4, $5, 'new_incident', 'new_incident', $6, '{}'::jsonb)
    `, [randomUUID(), digestId, owner.alertId, owner.projectId, other.incidentId, digestId]);
    await pool.query(`
      INSERT INTO alert_email_digest_items (
        id, digest_id, alert_id, project_id, incident_id, condition_type,
        dedupe_key, notification_key, payload
      ) VALUES ($1, $2, $3, $4, $5, 'new_incident', 'new_incident', $6, '{}'::jsonb)
    `, [randomUUID(), digestId, other.alertId, owner.projectId, owner.incidentId, digestId]);
    const inspection = createPostgresAlertGroupInspectionStore(createQueryable(pool));
    const group = await inspection.getGroupForOrganization({
      organization_id: owner.organizationId, project_id: owner.projectId,
      kind: "email_digest", group_id: digestId, limit: 10
    });
    expect(group?.members).toEqual([]);
    expect(group?.group.member_count).toBe(0);
    const delivery = await createPostgresAlertDeliveryStore(createQueryable(pool)).getAlertEmailDigest(digestId);
    expect(delivery?.items).toEqual([]);
    expect(delivery?.total_incident_count).toBe(0);
  });

  it("queues later regression emails after cooldown and suppresses retries or too-soon transitions", async (): Promise<void> => {
    const noCooldown = await seedAlertContext({ channel: "email", suffix: "email-no-cooldown" });
    const withCooldown = await seedAlertContext({ channel: "email", suffix: "email-with-cooldown" });
    const store = createPostgresAlertDeliveryStore(createQueryable(pool));
    const firstDedupeKey = buildSeverityThresholdDedupeKey({
      severity: "high",
      lifecycleEvent: "incident_regressed",
      transitionId: "event-1"
    });
    const laterDedupeKey = buildSeverityThresholdDedupeKey({
      severity: "high",
      lifecycleEvent: "incident_regressed",
      transitionId: "event-2"
    });
    const queue = (
      context: Awaited<ReturnType<typeof seedAlertContext>>,
      dedupeKey: string,
      cooldownSeconds: number
    ) =>
      store.queueAlertEmailDigestItem({
        alert_id: context.alertId,
        project_id: context.projectId,
        incident_id: context.incidentId,
        condition_type: "severity_threshold",
        dedupe_key: dedupeKey,
        notification_key: context.notificationKey,
        cooldown_seconds: cooldownSeconds,
        recipient: "alerts@example.com",
        payload: { incident_id: context.incidentId },
        aggregation_window_seconds: 10,
        allow_new_digest: true
      });

    await expect(queue(noCooldown, firstDedupeKey, 0)).resolves.toEqual({
      digest_id: expect.any(String),
      created: true,
      created_digest: true
    });
    await expect(queue(noCooldown, firstDedupeKey, 0)).resolves.toEqual({
      digest_id: null,
      created: false,
      created_digest: false
    });
    await expect(queue(noCooldown, laterDedupeKey, 0)).resolves.toEqual({
      digest_id: expect.any(String),
      created: true,
      created_digest: false
    });

    await expect(queue(withCooldown, firstDedupeKey, 86_400)).resolves.toEqual({
      digest_id: expect.any(String),
      created: true,
      created_digest: true
    });
    await expect(queue(withCooldown, laterDedupeKey, 86_400)).resolves.toEqual({
      digest_id: null,
      created: false,
      created_digest: false
    });
    await pool.query(
      `
        UPDATE alert_email_digest_items
        SET created_at = now() - interval '2 days'
        WHERE alert_id = $1
      `,
      [withCooldown.alertId]
    );
    await expect(queue(withCooldown, laterDedupeKey, 86_400)).resolves.toEqual({
      digest_id: expect.any(String),
      created: true,
      created_digest: false
    });
  });
  async function cloneIncident(projectId: string, sourceId: string): Promise<string> {
    const id = randomUUID();
    await pool.query(`INSERT INTO incidents (id, project_id, environment, fingerprint, title, severity, status, first_seen_at, last_seen_at)
      SELECT $1::uuid, project_id, environment, ($1::uuid)::text, title, severity, status, first_seen_at, last_seen_at FROM incidents WHERE id = $2 AND project_id = $3`, [id, sourceId, projectId]);
    return id;
  }

  it("serializes concurrent notifications sharing a burst cooldown", async () => {
    const context = await seedAlertContext({ channel: "webhook", suffix: `concurrent-${randomUUID()}` });
    const secondId = await cloneIncident(context.projectId, context.incidentId);
    const blocker = await pool.connect();
    const key = "resource-burst";
    await blocker.query("SELECT pg_advisory_lock(hashtext(($1::uuid)::text), hashtext($2))", [context.alertId, key]);
    const store = createPostgresAlertDeliveryStore(createQueryable(pool));
    const create = (incidentId: string) => store.createAlertDeliveryIntent({ alert_id: context.alertId, project_id: context.projectId, incident_id: incidentId, condition_type: "new_incident", dedupe_key: "new_incident", notification_key: incidentId, coalescing_key: key, coalescing_window_seconds: 10, cooldown_seconds: 300, channel: "webhook", payload: {} });
    const pending = Promise.all([create(context.incidentId), create(secondId)]);
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (Number((await pool.query("SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND NOT granted")).rows[0].count) >= 2) break;
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    } finally {
      await blocker.query("SELECT pg_advisory_unlock(hashtext(($1::uuid)::text), hashtext($2))", [context.alertId, key]);
      blocker.release();
    }
    const results = await pending;
    expect(results.filter(result => result.created)).toHaveLength(1);
    const memberRows = (await pool.query<{ incident_id: string }>(`
      SELECT members.incident_id
      FROM alert_delivery_members members
      JOIN alert_deliveries deliveries ON deliveries.id = members.delivery_id
      WHERE deliveries.alert_id = $1 AND deliveries.coalescing_key = $2
    `, [context.alertId, key])).rows;
    expect(new Set(memberRows.map((row) => row.incident_id))).toEqual(new Set([context.incidentId, secondId]));
    expect((await create(secondId)).created).toBe(false);
    const replayCount = await pool.query<{ member_count: string }>(`
      SELECT count(*)::text AS member_count FROM alert_delivery_members members
      JOIN alert_deliveries deliveries ON deliveries.id = members.delivery_id
      WHERE deliveries.alert_id = $1 AND deliveries.coalescing_key = $2
    `, [context.alertId, key]);
    expect(Number(replayCount.rows[0]?.member_count)).toBe(2);
    const notifiedId = results[0].created ? context.incidentId : secondId;
    expect((await store.createAlertDeliveryIntent({ alert_id: context.alertId, project_id: context.projectId, incident_id: notifiedId, condition_type: "incident_regressed", dedupe_key: "later-transition", notification_key: notifiedId, coalescing_key: "later-page-load", coalescing_window_seconds: 10, cooldown_seconds: 300, channel: "webhook", payload: {} })).created).toBe(false);
  });

  it("keeps capture-time burst identity through worker delay without hiding a later transition", async () => {
    const context = await seedAlertContext({ channel: "webhook", suffix: `delayed-${randomUUID()}` });
    const secondId = await cloneIncident(context.projectId, context.incidentId);
    const store = createPostgresAlertDeliveryStore(createQueryable(pool));
    const input = (incidentId: string, key: string, conditionType: "new_incident" | "incident_regressed", dedupeKey: string) => ({
      alert_id: context.alertId, project_id: context.projectId, incident_id: incidentId,
      condition_type: conditionType, dedupe_key: dedupeKey, notification_key: incidentId,
      coalescing_key: key, coalescing_window_seconds: 10, cooldown_seconds: 0,
      channel: "webhook" as const, payload: {}
    });

    expect((await store.createAlertDeliveryIntent(input(context.incidentId, "capture-bucket-a", "new_incident", "new"))).created).toBe(true);
    await pool.query(
      "UPDATE alert_deliveries SET created_at = now() - interval '11 seconds' WHERE alert_id = $1",
      [context.alertId]
    );

    expect((await store.createAlertDeliveryIntent(input(secondId, "capture-bucket-a", "new_incident", "new"))).created).toBe(false);
    expect((await store.createAlertDeliveryIntent(input(secondId, "capture-bucket-a", "incident_regressed", "regressed"))).created).toBe(true);
    expect((await store.createAlertDeliveryIntent(input(secondId, "capture-bucket-b", "new_incident", "new"))).created).toBe(true);
  });

  it("spills a sustained same-cause burst into another delivery after a finite member limit", async () => {
    const context = await seedAlertContext({ channel: "slack", suffix: `bounded-${randomUUID()}` });
    const store = createPostgresAlertDeliveryStore(createQueryable(pool));
    const incidentIds = [context.incidentId];
    for (let index = 1; index <= 1000; index += 1) {
      incidentIds.push(await cloneIncident(context.projectId, context.incidentId));
    }

    const results = [];
    for (const incidentId of incidentIds) {
      results.push(await store.createAlertDeliveryIntent({
        alert_id: context.alertId,
        project_id: context.projectId,
        incident_id: incidentId,
        condition_type: "new_incident",
        dedupe_key: "new_incident",
        notification_key: incidentId,
        coalescing_key: "sustained-cause",
        cooldown_seconds: 0,
        channel: "slack",
        payload: {}
      }));
    }

    expect(results.filter((result) => result.created)).toHaveLength(2);
    const counts = await pool.query<{ member_count: string }>(`
      SELECT count(members.id)::text AS member_count
      FROM alert_deliveries deliveries
      JOIN alert_delivery_members members ON members.delivery_id = deliveries.id
      WHERE deliveries.alert_id = $1
      GROUP BY deliveries.id
      ORDER BY count(members.id) DESC
    `, [context.alertId]);
    expect(counts.rows.map((row) => Number(row.member_count))).toEqual([1000, 1]);
    expect((await store.createAlertDeliveryIntent({
      alert_id: context.alertId, project_id: context.projectId,
      incident_id: incidentIds[0]!, condition_type: "new_incident", dedupe_key: "new_incident",
      notification_key: incidentIds[0]!, coalescing_key: "sustained-cause",
      cooldown_seconds: 0, channel: "slack", payload: {}
    })).created).toBe(false);
    expect((await store.createAlertDeliveryIntent({
      alert_id: context.alertId, project_id: context.projectId,
      incident_id: incidentIds[1]!, condition_type: "new_incident", dedupe_key: "new_incident",
      notification_key: incidentIds[1]!, coalescing_key: "sustained-cause",
      cooldown_seconds: 0, channel: "slack", payload: {}
    })).created).toBe(false);
    const replayCounts = await pool.query<{ member_count: string }>(`
      SELECT count(members.id)::text AS member_count
      FROM alert_deliveries deliveries
      JOIN alert_delivery_members members ON members.delivery_id = deliveries.id
      WHERE deliveries.alert_id = $1
      GROUP BY deliveries.id
      ORDER BY count(members.id) DESC
    `, [context.alertId]);
    expect(replayCounts.rows.map((row) => Number(row.member_count))).toEqual([1000, 1]);
  });

  it("lists project-scoped direct groups and paginates their safe incident identities", async () => {
    const context = await seedAlertContext({ channel: "slack", suffix: `inspect-direct-${randomUUID()}` });
    const other = await seedAlertContext({ channel: "slack", suffix: `inspect-other-${randomUUID()}` });
    const deliveryStore = createPostgresAlertDeliveryStore(createQueryable(pool));
    const inspection = createPostgresAlertGroupInspectionStore(createQueryable(pool));
    const ids = [context.incidentId];
    for (let index = 0; index < 3; index += 1) {
      ids.push(await cloneIncident(context.projectId, context.incidentId));
    }
    for (const incidentId of ids) {
      await deliveryStore.createAlertDeliveryIntent({
        alert_id: context.alertId, project_id: context.projectId, incident_id: incidentId,
        condition_type: "new_incident", dedupe_key: "new_incident", notification_key: incidentId,
        coalescing_key: "inspect-cause", cooldown_seconds: 0, channel: "slack", payload: { secret: "not-for-inspection" }
      });
    }
    await deliveryStore.createAlertDeliveryIntent({
      alert_id: context.alertId, project_id: context.projectId, incident_id: ids[3]!,
      condition_type: "incident_regressed", dedupe_key: "later-regression", notification_key: "later-regression",
      coalescing_key: "other-transition", cooldown_seconds: 0, channel: "slack", payload: {}
    });

    const first = await inspection.listGroupsForOrganization({
      organization_id: context.organizationId, project_id: context.projectId, limit: 1
    });
    expect(first?.groups).toHaveLength(1);
    expect(first?.next_cursor).not.toBeNull();
    if (first?.next_cursor === undefined || first.next_cursor === null) throw new Error("Expected next group page");
    const second = await inspection.listGroupsForOrganization({
      organization_id: context.organizationId, project_id: context.projectId,
      limit: 1, before: first.next_cursor
    });
    expect(second?.groups).toHaveLength(1);
    expect(second?.groups[0]?.member_count).toBe(4);
    expect(JSON.stringify(second)).not.toContain("not-for-inspection");
    const groupId = second?.groups[0]?.group_id;
    if (groupId === undefined) throw new Error("Expected direct group");
    const firstMembers = await inspection.getGroupForOrganization({
      organization_id: context.organizationId, project_id: context.projectId,
      kind: "direct", group_id: groupId, limit: 2
    });
    if (firstMembers?.next_cursor === undefined || firstMembers.next_cursor === null) throw new Error("Expected next member page");
    const laterMembers = await inspection.getGroupForOrganization({
      organization_id: context.organizationId, project_id: context.projectId,
      kind: "direct", group_id: groupId, limit: 2, after: firstMembers.next_cursor
    });
    if (laterMembers === null) throw new Error("Expected later member page");
    expect(new Set([...firstMembers.members, ...laterMembers.members].map((member) => member.incident_id))).toEqual(new Set(ids));
    expect(laterMembers.next_cursor).toBeNull();
    expect(await inspection.getGroupForOrganization({
      organization_id: other.organizationId, project_id: other.projectId,
      kind: "direct", group_id: groupId, limit: 10
    })).toBeNull();
    expect(await inspection.listGroupsForOrganization({
      organization_id: other.organizationId, project_id: context.projectId, limit: 10
    })).toBeNull();
    await pool.query("DELETE FROM alert_delivery_members WHERE delivery_id = $1", [groupId]);
    const legacy = await inspection.getGroupForOrganization({
      organization_id: context.organizationId, project_id: context.projectId,
      kind: "direct", group_id: groupId, limit: 10
    });
    if (legacy === null) throw new Error("Expected legacy group");
    expect(legacy?.members).toEqual([{
      incident_id: context.incidentId, condition_type: "legacy", created_at: legacy.group.created_at
    }]);
  });

  it("retains the original incident when an older direct delivery gains a member after migration", async () => {
    const context = await seedAlertContext({ channel: "slack", suffix: `legacy-member-${randomUUID()}` });
    const nextIncidentId = await cloneIncident(context.projectId, context.incidentId);
    const deliveryId = randomUUID();
    await pool.query(`
      INSERT INTO alert_deliveries (
        id, alert_id, project_id, incident_id, condition_type, dedupe_key,
        notification_key, coalescing_key, channel, status, payload
      ) VALUES ($1, $2, $3, $4, 'new_incident', 'new_incident', $5, $6, 'slack', 'delivered', '{}'::jsonb)
    `, [deliveryId, context.alertId, context.projectId, context.incidentId,
      context.incidentId, "legacy-burst"]);
    const store = createPostgresAlertDeliveryStore(createQueryable(pool));
    expect(await store.createAlertDeliveryIntent({
      alert_id: context.alertId, project_id: context.projectId, incident_id: nextIncidentId,
      condition_type: "new_incident", dedupe_key: "new_incident",
      notification_key: nextIncidentId, coalescing_key: "legacy-burst",
      cooldown_seconds: 0, channel: "slack", payload: {}
    })).toEqual({ created: false, delivery_id: null });
    const inspection = createPostgresAlertGroupInspectionStore(createQueryable(pool));
    const group = await inspection.getGroupForOrganization({
      organization_id: context.organizationId, project_id: context.projectId,
      kind: "direct", group_id: deliveryId, limit: 10
    });
    expect(group?.group.member_count).toBe(2);
    expect(new Set(group?.members.map((member) => member.incident_id))).toEqual(
      new Set([context.incidentId, nextIncidentId])
    );
  });

  it("reserves a member slot for a legacy root before admitting another grouped incident", async () => {
    const context = await seedAlertContext({ channel: "slack", suffix: `legacy-cap-${randomUUID()}` });
    const nextIncidentId = await cloneIncident(context.projectId, context.incidentId);
    const deliveryId = randomUUID();
    await pool.query(`
      INSERT INTO alert_deliveries (
        id, alert_id, project_id, incident_id, condition_type, dedupe_key,
        notification_key, coalescing_key, channel, status, payload
      ) VALUES ($1, $2, $3, $4::uuid, 'new_incident', 'new_incident', $4::text, $5, 'slack', 'delivered', '{}'::jsonb)
    `, [deliveryId, context.alertId, context.projectId, context.incidentId, "legacy-cap"]);
    // Older deliveries may gain members while their original incident has not yet been backfilled.
    await pool.query(`
      INSERT INTO alert_delivery_members (id, delivery_id, incident_id, condition_type, dedupe_key)
      SELECT gen_random_uuid(), $1, gen_random_uuid(), 'new_incident', 'new_incident'
      FROM generate_series(1, 999)
    `, [deliveryId]);

    const store = createPostgresAlertDeliveryStore(createQueryable(pool));
    expect((await store.createAlertDeliveryIntent({
      alert_id: context.alertId, project_id: context.projectId, incident_id: nextIncidentId,
      condition_type: "new_incident", dedupe_key: "new_incident",
      notification_key: nextIncidentId, coalescing_key: "legacy-cap",
      cooldown_seconds: 0, channel: "slack", payload: {}
    })).created).toBe(true);
    const counts = await pool.query<{ delivery_id: string; member_count: string }>(`
      SELECT delivery_id::text, count(*)::text AS member_count FROM alert_delivery_members
      WHERE delivery_id IN (SELECT id FROM alert_deliveries WHERE alert_id = $1)
      GROUP BY delivery_id
    `, [context.alertId]);
    expect(counts.rows.find((row) => row.delivery_id === deliveryId)?.member_count).toBe("999");
    expect(counts.rows.map((row) => Number(row.member_count)).sort((a, b) => b - a)).toEqual([999, 1]);
    const inspection = createPostgresAlertGroupInspectionStore(createQueryable(pool));
    const listed = await inspection.listGroupsForOrganization({
      organization_id: context.organizationId, project_id: context.projectId, limit: 10
    });
    expect(listed?.groups.find((group) => group.group_id === deliveryId)?.member_count).toBe(1000);
    const legacy = await inspection.getGroupForOrganization({
      organization_id: context.organizationId, project_id: context.projectId,
      kind: "direct", group_id: deliveryId, limit: 1
    });
    if (legacy === null) throw new Error("Expected legacy group");
    expect(legacy.group.member_count).toBe(1000);
    expect(legacy.members).toEqual([{
      incident_id: context.incidentId, condition_type: "legacy", created_at: legacy.group.created_at
    }]);
    if (legacy.next_cursor === null) throw new Error("Expected another legacy member page");
    const later = await inspection.getGroupForOrganization({
      organization_id: context.organizationId, project_id: context.projectId,
      kind: "direct", group_id: deliveryId, limit: 1,
      after: legacy.next_cursor
    });
    expect(later?.members).toHaveLength(1);
    expect(later?.members[0]?.incident_id).not.toBe(context.incidentId);
  });

  it("does not backfill a legacy root past the physical member cap on replay", async () => {
    const context = await seedAlertContext({ channel: "slack", suffix: `legacy-replay-cap-${randomUUID()}` });
    const existingIncidentId = await cloneIncident(context.projectId, context.incidentId);
    const deliveryId = randomUUID();
    await pool.query(`
      INSERT INTO alert_deliveries (
        id, alert_id, project_id, incident_id, condition_type, dedupe_key,
        notification_key, coalescing_key, channel, status, payload
      ) VALUES ($1, $2, $3, $4::uuid, 'new_incident', 'new_incident', $4::text, $5, 'slack', 'delivered', '{}'::jsonb)
    `, [deliveryId, context.alertId, context.projectId, context.incidentId, "legacy-replay-cap"]);
    await pool.query(`
      INSERT INTO alert_delivery_members (id, delivery_id, incident_id, condition_type, dedupe_key)
      SELECT gen_random_uuid(), $1, gen_random_uuid(), 'new_incident', 'new_incident'
      FROM generate_series(1, 999)
    `, [deliveryId]);
    await pool.query(`
      INSERT INTO alert_delivery_members (id, delivery_id, incident_id, condition_type, dedupe_key)
      VALUES ($1, $2, $3, 'new_incident', 'new_incident')
    `, [randomUUID(), deliveryId, existingIncidentId]);

    const store = createPostgresAlertDeliveryStore(createQueryable(pool));
    expect((await store.createAlertDeliveryIntent({
      alert_id: context.alertId, project_id: context.projectId, incident_id: existingIncidentId,
      condition_type: "new_incident", dedupe_key: "new_incident",
      notification_key: existingIncidentId, coalescing_key: "legacy-replay-cap",
      cooldown_seconds: 0, channel: "slack", payload: {}
    })).created).toBe(false);
    const count = await pool.query<{ member_count: string }>(`
      SELECT count(*)::text AS member_count FROM alert_delivery_members WHERE delivery_id = $1
    `, [deliveryId]);
    expect(count.rows[0]?.member_count).toBe("1000");
    const inspection = createPostgresAlertGroupInspectionStore(createQueryable(pool));
    const group = await inspection.getGroupForOrganization({
      organization_id: context.organizationId, project_id: context.projectId,
      kind: "direct", group_id: deliveryId, limit: 1
    });
    expect(group?.group.member_count).toBe(1001);
    expect(group?.members[0]?.incident_id).toBe(context.incidentId);
  });

  it("hides existing foreign direct members while retaining deleted member identities", async () => {
    const owner = await seedAlertContext({ channel: "slack", suffix: `member-owner-${randomUUID()}` });
    const other = await seedAlertContext({ channel: "slack", suffix: `member-other-${randomUUID()}` });
    const retainedId = await cloneIncident(owner.projectId, owner.incidentId);
    const store = createPostgresAlertDeliveryStore(createQueryable(pool));
    for (const incidentId of [owner.incidentId, retainedId]) {
      await store.createAlertDeliveryIntent({
        alert_id: owner.alertId, project_id: owner.projectId, incident_id: incidentId,
        condition_type: "new_incident", dedupe_key: "new_incident", notification_key: incidentId,
        coalescing_key: "member-scope", cooldown_seconds: 0, channel: "slack", payload: {}
      });
    }
    const deliveryId = (await pool.query<{ id: string }>(
      "SELECT id::text FROM alert_deliveries WHERE alert_id = $1", [owner.alertId]
    )).rows[0]?.id;
    if (deliveryId === undefined) throw new Error("Expected a direct delivery");
    await pool.query(`
      INSERT INTO alert_delivery_members (
        id, delivery_id, incident_id, condition_type, dedupe_key
      ) VALUES ($1, $2, $3, 'new_incident', 'new_incident')
    `, [randomUUID(), deliveryId, other.incidentId]);
    await pool.query("DELETE FROM incidents WHERE id = $1", [retainedId]);
    const inspection = createPostgresAlertGroupInspectionStore(createQueryable(pool));
    const group = await inspection.getGroupForOrganization({
      organization_id: owner.organizationId, project_id: owner.projectId,
      kind: "direct", group_id: deliveryId, limit: 10
    });
    expect(group?.group.member_count).toBe(2);
    expect(new Set(group?.members.map((member) => member.incident_id))).toEqual(
      new Set([owner.incidentId, retainedId])
    );
    expect((await inspection.listGroupsForOrganization({
      organization_id: owner.organizationId, project_id: owner.projectId, limit: 10
    }))?.groups[0]?.member_count).toBe(2);
  });

  it("inspects email digest members without exposing the recipient or payload", async () => {
    const context = await seedAlertContext({ channel: "email", suffix: `inspect-email-${randomUUID()}` });
    const secondId = await cloneIncident(context.projectId, context.incidentId);
    const deliveryStore = createPostgresAlertDeliveryStore(createQueryable(pool));
    for (const incidentId of [context.incidentId, secondId]) {
      await deliveryStore.queueAlertEmailDigestItem({
        alert_id: context.alertId, project_id: context.projectId, incident_id: incidentId,
        condition_type: "new_incident", dedupe_key: "new_incident", notification_key: incidentId,
        cooldown_seconds: 0, recipient: "private@example.com", payload: { secret: "not-for-inspection" },
        aggregation_window_seconds: 10, allow_new_digest: true
      });
    }
    const inspection = createPostgresAlertGroupInspectionStore(createQueryable(pool));
    const listed = await inspection.listGroupsForOrganization({
      organization_id: context.organizationId, project_id: context.projectId, limit: 10
    });
    expect(listed?.groups[0]).toMatchObject({ kind: "email_digest", channel: "email", member_count: 2 });
    const groupId = listed?.groups[0]?.group_id;
    if (groupId === undefined) throw new Error("Expected email digest group");
    const inspected = await inspection.getGroupForOrganization({
      organization_id: context.organizationId, project_id: context.projectId,
      kind: "email_digest", group_id: groupId, limit: 10
    });
    expect(new Set(inspected?.members.map((member) => member.incident_id))).toEqual(new Set([context.incidentId, secondId]));
    expect(JSON.stringify({ listed, inspected })).not.toContain("private@example.com");
    expect(JSON.stringify({ listed, inspected })).not.toContain("not-for-inspection");
  });

  it.each(["slack", "discord", "webhook"] as const)(
    "sends one %s alert for a same-cause burst at every severity without hiding a separate cause or escalation",
    async (channel) => {
      const context = await seedAlertContext({ channel, suffix: `escalation-${channel}-${randomUUID()}` });
      const relatedIncidentIds = [context.incidentId];
      for (let index = 1; index < 100; index += 1) {
        relatedIncidentIds.push(await cloneIncident(context.projectId, context.incidentId));
      }
      const separateId = await cloneIncident(context.projectId, context.incidentId);
      await pool.query("UPDATE alert_rules SET condition_type = 'new_incident', severity_min = NULL, severity_lifecycle_scope = NULL WHERE id = $1", [context.alertId]);
      const store = createPostgresAlertDeliveryStore(createQueryable(pool));
      for (const severity of ["low", "high", "critical"] as const) {
        const deliver = vi.fn().mockResolvedValue(undefined);
        for (const [incidentId, eventSeverity, causeKey] of [
          ...relatedIncidentIds.map((id) => [id, severity, `same-cause-${severity}`] as const),
          [separateId, "critical", severity === "critical" ? "separate-cause-critical" : `same-cause-${severity}`] as const
        ]) {
          await processNextEvaluateAlertsJob({
            queue: { dequeue: async () => ({
              project_id: context.projectId, incident_id: incidentId,
              condition_type: "new_incident", dedupe_key: `new_incident:${severity}`,
              notification_key: incidentId, coalescing_key: causeKey,
              coalescing_window_seconds: 10, occurred_at: new Date().toISOString(),
              service_name: "web", environment: "production", severity: eventSeverity
            }) },
            alertStore: store,
            alertTransport: { deliver }
          } as unknown as EvaluateAlertsWorkerDependencies);
        }
        expect(deliver).toHaveBeenCalledTimes(2);
        const deliveredSeverities = deliver.mock.calls.map((call) =>
          (call[0] as { payload: { severity: string } }).payload.severity);
        expect(deliveredSeverities).toEqual([severity, "critical"]);
        const members = await pool.query<{ member_count: string }>(`
          SELECT count(*)::text AS member_count
          FROM alert_delivery_members members
          JOIN alert_deliveries deliveries ON deliveries.id = members.delivery_id
          WHERE deliveries.alert_id = $1
            AND deliveries.incident_id = $2
            AND deliveries.payload->>'severity' = $3
        `, [context.alertId, context.incidentId, severity]);
        expect(Number(members.rows[0]?.member_count)).toBe(100);
      }
    }
  );

  it("retries one failed direct burst intent without sending for each later member", async () => {
    const context = await seedAlertContext({ channel: "webhook", suffix: `failed-burst-${randomUUID()}` });
    await pool.query("UPDATE alert_rules SET condition_type = 'new_incident', severity_min = NULL, severity_lifecycle_scope = NULL WHERE id = $1", [context.alertId]);
    const secondAlertId = randomUUID();
    await pool.query(`
      INSERT INTO alert_rules (id, project_id, created_by_user_id, channel, condition_type,
        severity_min, severity_lifecycle_scope, cooldown_seconds, config, is_enabled)
      SELECT $1::uuid, project_id, created_by_user_id, channel, condition_type,
        severity_min, severity_lifecycle_scope, cooldown_seconds, config, is_enabled
      FROM alert_rules WHERE id = $2::uuid
    `, [secondAlertId, context.alertId]);
    const related = [context.incidentId, await cloneIncident(context.projectId, context.incidentId), await cloneIncident(context.projectId, context.incidentId)];
    const store = createPostgresAlertDeliveryStore(createQueryable(pool));
    const deliver = vi.fn().mockRejectedValueOnce(new Error("provider_timeout_after_accept")).mockResolvedValue(undefined);
    let allowanceUsed = 0;
    const evaluate = (incidentId: string) => processNextEvaluateAlertsJob({
      queue: { getActiveJobId: () => `evaluation:${incidentId}`, dequeue: async () => ({
        project_id: context.projectId, incident_id: incidentId,
        condition_type: "new_incident", dedupe_key: "new_incident",
        notification_key: incidentId, coalescing_key: "failed-provider-burst",
        coalescing_window_seconds: 10, occurred_at: new Date().toISOString(),
        service_name: "web", environment: "production", severity: "high"
      }) },
      alertStore: store,
      alertTransport: { deliver },
      billingStore: { getBillingSummaryForProject: async () => ({
        allowances: { monthly_alert_deliveries: { used: allowanceUsed, limit: 2 } },
        usage_window: { starts_at: "2026-09-01T00:00:00.000Z", ends_at: "2026-10-01T00:00:00.000Z" }
      }) }
    } as unknown as EvaluateAlertsWorkerDependencies);

    await expect(evaluate(related[0]!)).rejects.toThrow("alert_delivery_transport_failed");
    allowanceUsed = 2;
    await evaluate(related[1]!);
    await evaluate(related[2]!);
    expect(deliver).toHaveBeenCalledTimes(2);

    await evaluate(related[0]!); // Durable job replay after bounded backoff.
    expect(deliver).toHaveBeenCalledTimes(3);
    const deliveries = await pool.query<{ status: string; member_count: string }>(`
      SELECT deliveries.status, count(members.id)::text AS member_count
      FROM alert_deliveries deliveries
      JOIN alert_delivery_members members ON members.delivery_id = deliveries.id
      WHERE deliveries.alert_id = ANY($1::uuid[])
      GROUP BY deliveries.id
    `, [[context.alertId, secondAlertId]]);
    expect(deliveries.rows).toEqual([
      { status: "delivered", member_count: "3" },
      { status: "delivered", member_count: "3" }
    ]);
  });

  it("keeps distinct resource incidents in one email digest with a configured cooldown", async () => {
    const context = await seedAlertContext({ channel: "email", suffix: `burst-${randomUUID()}` });
    const secondId = await cloneIncident(context.projectId, context.incidentId);
    await pool.query("UPDATE alert_rules SET cooldown_seconds = 300 WHERE id = $1", [context.alertId]);
    const store = createPostgresAlertDeliveryStore(createQueryable(pool));
    for (const incidentId of [context.incidentId, secondId, secondId]) {
      await processNextEvaluateAlertsJob({
        queue: { dequeue: async () => ({ project_id: context.projectId, incident_id: incidentId, condition_type: "severity_threshold", lifecycle_event: "new_incident", dedupe_key: "new_incident", notification_key: "resource-burst", coalescing_window_seconds: 10, occurred_at: new Date().toISOString(), service_name: "web", environment: "production", severity: "high" }) },
        alertStore: store
      } as unknown as EvaluateAlertsWorkerDependencies);
    }
    const items = (await pool.query<{ incident_id: string; digest_id: string }>("SELECT incident_id, digest_id FROM alert_email_digest_items WHERE project_id = $1", [context.projectId])).rows;
    expect(items.map(item => item.incident_id).sort()).toEqual([context.incidentId, secondId].sort());
    expect(new Set(items.map(item => item.digest_id)).size).toBe(1);
  });

  it("reclaims an interrupted email digest schedule and retries the same digest after provider failure", async () => {
    const context = await seedAlertContext({ channel: "email", suffix: `email-retry-${randomUUID()}` });
    const store = createPostgresAlertDeliveryStore(createQueryable(pool));
    const queued = await store.queueAlertEmailDigestItem({
      alert_id: context.alertId, project_id: context.projectId, incident_id: context.incidentId,
      condition_type: "new_incident", dedupe_key: "new_incident", notification_key: context.incidentId,
      cooldown_seconds: 0, recipient: "alerts@example.com", payload: { severity: "high" },
      aggregation_window_seconds: 10, allow_new_digest: true
    });
    expect(queued.digest_id).not.toBeNull();
    const digestId = queued.digest_id!;
    await pool.query(`UPDATE alert_email_digests SET claimed_at = now() - interval '11 minutes',
      next_attempt_at = now() - interval '1 minute' WHERE id = $1`, [digestId]);
    expect(await store.claimDueAlertEmailDigests(10)).toContainEqual({ digest_id: digestId });

    const deliver = vi.fn().mockRejectedValueOnce(new Error("secret=provider-token"))
      .mockResolvedValue(undefined);
    const run = () => processNextDeliverAlertEmailDigestJob({
      queue: { dequeue: async () => ({ digest_id: digestId }) },
      alertStore: store,
      alertEmailDigestTransport: { deliver }
    } as unknown as Parameters<typeof processNextDeliverAlertEmailDigestJob>[0]);
    await expect(run()).rejects.toThrow("alert_delivery_transport_failed");
    const failed = await store.getAlertEmailDigest(digestId);
    expect(failed?.digest).toMatchObject({ status: "failed", last_error: "alert_delivery_transport_failed" });
    await run(); // The durable delivery job retries after its bounded backoff.
    const delivered = await store.getAlertEmailDigest(digestId);
    expect(delivered?.digest).toMatchObject({ status: "delivered", last_error: null });
    expect(deliver).toHaveBeenCalledTimes(2);
  });

  it("retains a large email burst while loading only a severity-prioritized sample", async () => {
    const context = await seedAlertContext({ channel: "email", suffix: `email-sample-${randomUUID()}` });
    const store = createPostgresAlertDeliveryStore(createQueryable(pool));
    const incidentIds = [context.incidentId];
    for (let index = 1; index < 101; index += 1) {
      incidentIds.push(await cloneIncident(context.projectId, context.incidentId));
    }
    for (const [index, incidentId] of incidentIds.entries()) {
      await processNextEvaluateAlertsJob({
        queue: { dequeue: async () => ({
          project_id: context.projectId, incident_id: incidentId,
          condition_type: "severity_threshold", lifecycle_event: "new_incident",
          dedupe_key: "new_incident", notification_key: "resource-burst",
          coalescing_window_seconds: 10, occurred_at: new Date().toISOString(),
          service_name: "web", environment: "production",
          severity: index === 100 ? "critical" : "high"
        }) },
        alertStore: store
      } as unknown as EvaluateAlertsWorkerDependencies);
    }
    const digestId = (await pool.query<{ id: string }>(
      "SELECT id::text FROM alert_email_digests WHERE project_id = $1", [context.projectId]
    )).rows[0]?.id;
    expect(digestId).toBeDefined();
    if (digestId === undefined) throw new Error("Expected a pending digest");
    const digest = await store.getAlertEmailDigest(digestId);
    expect(digest?.total_incident_count).toBe(101);
    expect(digest?.items).toHaveLength(25);
    expect(digest?.items[0]?.payload["severity"]).toBe("critical");
    const persisted = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM alert_email_digest_items WHERE project_id = $1", [context.projectId]
    );
    expect(Number(persisted.rows[0]?.count)).toBe(101);
  });

  it("samples distinct email incidents when one incident matches many alert transitions", async () => {
    const context = await seedAlertContext({ channel: "email", suffix: `email-distinct-${randomUUID()}` });
    const store = createPostgresAlertDeliveryStore(createQueryable(pool));
    const queue = (incidentId: string, index: number, severity: "low" | "critical") =>
      store.queueAlertEmailDigestItem({
        alert_id: context.alertId, project_id: context.projectId, incident_id: incidentId,
        condition_type: index === 1 ? "error_spike" : "new_incident",
        dedupe_key: `transition-${index}`, notification_key: `${incidentId}:${index}`,
        cooldown_seconds: 0, recipient: "alerts@example.com",
        payload: { incident_id: incidentId, severity },
        aggregation_window_seconds: 10, allow_new_digest: true
      });
    for (let index = 0; index < 30; index += 1) {
      expect((await queue(context.incidentId, index, "low")).created).toBe(true);
    }
    const distinctIds: string[] = [];
    for (let index = 0; index < 25; index += 1) {
      const incidentId = await cloneIncident(context.projectId, context.incidentId);
      distinctIds.push(incidentId);
      expect((await queue(incidentId, index + 30, index === 24 ? "critical" : "low")).created).toBe(true);
    }
    const digestId = (await pool.query<{ id: string }>(
      "SELECT id::text FROM alert_email_digests WHERE project_id = $1", [context.projectId]
    )).rows[0]?.id;
    if (digestId === undefined) throw new Error("Expected a pending digest");
    const digest = await store.getAlertEmailDigest(digestId);
    expect(digest?.total_incident_count).toBe(26);
    expect(new Set(digest?.items.map((item) => item.incident_id)).size).toBe(25);
    expect(digest?.items[0]?.incident_id).toBe(distinctIds[24]);
    expect(digest?.items.find((item) => item.incident_id === context.incidentId)?.condition_types)
      .toEqual(expect.arrayContaining(["new_incident", "error_spike"]));
  });

});
