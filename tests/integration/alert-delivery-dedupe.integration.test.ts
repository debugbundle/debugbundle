import { processNextEvaluateAlertsJob } from "../../apps/worker/src/processor-alerts.js";
import type { EvaluateAlertsWorkerDependencies } from "../../apps/worker/src/processor-shared.js";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, expect, it } from "vitest";

import {
  buildSeverityThresholdDedupeKey,
  createPostgresAlertDeliveryStore
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
    channel: "email" | "webhook";
    suffix: string;
  }): Promise<{ alertId: string; incidentId: string; projectId: string; notificationKey: string }> {
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
        JSON.stringify(input.channel === "email" ? { to: "alerts@example.com" } : { target_url: "https://example.com" })
      ]
    );

    return { alertId, incidentId, projectId, notificationKey };
  }

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
    await expect(create(firstDedupeKey)).resolves.toEqual({ delivery_id: null, created: false });
    await expect(create(laterDedupeKey)).resolves.toEqual({
      delivery_id: expect.any(String),
      created: true
    });
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
    const notifiedId = results[0].created ? context.incidentId : secondId;
    expect((await store.createAlertDeliveryIntent({ alert_id: context.alertId, project_id: context.projectId, incident_id: notifiedId, condition_type: "incident_regressed", dedupe_key: "later-transition", notification_key: notifiedId, coalescing_key: "later-page-load", coalescing_window_seconds: 10, cooldown_seconds: 300, channel: "webhook", payload: {} })).created).toBe(false);
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

});
