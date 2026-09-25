import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createDurableWorkerQueue } from "../../apps/worker/src/durable-queue.js";
import { processNextEvaluateAlertsJob } from "../../apps/worker/src/processor-alerts.js";
import { createPostgresAlertDeliveryStore, type RedisQueueClient } from "../../packages/storage/src/index.js";
import { createWorkerJobStore } from "../../packages/storage/src/worker-job-store.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { createIntegrationPool, createQueryable, runIntegration, seedOwnedProject } from "../helpers/integration-setup.ts";

runIntegration("direct alert retry ownership", () => {
  const pool = createIntegrationPool();
  beforeAll(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(createQueryable(pool));
    await migrateStorageSchema(createQueryable(pool));
  });
  afterAll(async () => { await pool.end(); });

  it("provisions one stable per-rule signing key under concurrent legacy evaluations", async () => {
    const projectId = randomUUID(), firstAlert = randomUUID(), secondAlert = randomUUID();
    const { ownerUserId } = await seedOwnedProject({ pool, organizationId: randomUUID(), projectId,
      organizationName: "Signing concurrency", organizationSlug: `signing-${projectId}`,
      projectName: "Signing app", projectSlug: `app-${projectId}`, organizationPlan: "team" });
    for (const id of [firstAlert, secondAlert]) {
      await pool.query(`INSERT INTO alert_rules (id, project_id, created_by_user_id, channel, condition_type, config)
        VALUES ($1, $2, $3, 'webhook', 'new_incident', '{"target_url":"https://example.com/hook"}')`,
      [id, projectId, ownerUserId]);
    }
    const store = createPostgresAlertDeliveryStore(createQueryable(pool));
    const input = { project_id: projectId, condition_type: "new_incident" as const,
      service_name: "api", environment: "production", severity: "high" as const, lifecycle_event: "new_incident" as const };
    const evaluations = await Promise.all(Array.from({ length: 8 }, () => store.listMatchingAlerts(input)));
    const rows = (await pool.query("SELECT id, signing_secret, webhook_payload_version FROM alert_rules WHERE project_id = $1", [projectId])).rows;
    expect(new Set(rows.map((row): unknown => row.signing_secret)).size).toBe(2);
    for (const row of rows) {
      expect(row.signing_secret).toMatch(/^dbundle_asec_[A-Za-z0-9_-]{43}$/);
      expect(row.webhook_payload_version).toBe(0);
      for (const evaluation of evaluations) {
        expect(evaluation.find(rule => rule.alert_id === row.id)?.signing_secret).toBe(row.signing_secret);
      }
    }
  });

  it.each([0, 1000])("does not let another occurrence take over a pending or failed send (timestamp offset %i)", async (offset) => {
    const projectId = randomUUID(), incidentId = randomUUID(), alertId = randomUUID();
    const { ownerUserId } = await seedOwnedProject({
      pool, organizationId: randomUUID(), projectId,
      organizationName: "Retry audit", organizationSlug: `retry-${projectId}`,
      projectName: "Retry app", projectSlug: `app-${projectId}`, organizationPlan: "team"
    });
    await pool.query(`INSERT INTO incidents (id, project_id, environment, fingerprint, title, severity, status, first_seen_at, last_seen_at)
      VALUES ($1::uuid, $2, 'production', ($1::uuid)::text, 'Failure', 'high', 'open', now(), now())`, [incidentId, projectId]);
    await pool.query(`INSERT INTO alert_rules (id, project_id, created_by_user_id, channel, condition_type, severity_min, severity_lifecycle_scope, cooldown_seconds, config, is_enabled)
      VALUES ($1, $2, $3, 'webhook', 'severity_threshold', 'high', 'both', 0, '{"target_url":"https://example.com/hook"}', true)`, [alertId, projectId, ownerUserId]);
    const db = createQueryable(pool);
    const jobs = createWorkerJobStore(db);
    const store = createPostgresAlertDeliveryStore(db);
    const redis = { claim: async () => null } as unknown as RedisQueueClient;
    const firstQueue = createDurableWorkerQueue(db, redis, false);
    const otherQueue = createDurableWorkerQueue(db, redis, false);
    const payload = {
      project_id: projectId, incident_id: incidentId, condition_type: "severity_threshold",
      dedupe_key: "severity_threshold:high", notification_key: incidentId,
      occurred_at: "2026-09-25T00:00:00.000Z", lifecycle_event: "new_incident",
      service_name: "api", environment: "production", severity: "high"
    };
    const ownerId = await jobs.enqueue("evaluate-alerts", payload, { dedupeKey: "first-occurrence" });
    let release!: () => void, started!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const firstStarted = new Promise<void>(resolve => { started = resolve; });
    const deliver = vi.fn().mockImplementationOnce(async () => {
      started(); await held; throw new Error("provider_unavailable");
    }).mockResolvedValue(undefined);
    const process = (queue: typeof firstQueue) => processNextEvaluateAlertsJob({
      queue, alertStore: store, alertTransport: { deliver }
    });
    const first = process(firstQueue).catch((error: unknown) => error);
    try {
      await firstStarted;
      const otherPayload = { ...payload, occurred_at: new Date(Date.parse(payload.occurred_at) + offset).toISOString() };
      const otherId = await jobs.enqueue("evaluate-alerts", otherPayload, { dedupeKey: "other-occurrence" });
      expect(otherId).not.toBe(ownerId);
      await process(otherQueue);
      await otherQueue.ackClaimedJobs();
      expect(deliver).toHaveBeenCalledTimes(1);
      release();
      expect(await first).toMatchObject({ message: "alert_delivery_transport_failed" });
      await firstQueue.failClaimedJobs();
      await jobs.enqueue("evaluate-alerts", otherPayload, { dedupeKey: "later-occurrence" });
      await process(otherQueue);
      await otherQueue.ackClaimedJobs();
      expect(deliver).toHaveBeenCalledTimes(1);
      await pool.query("UPDATE worker_jobs SET available_at = now() WHERE id = $1", [ownerId]);
      await process(firstQueue);
      await firstQueue.ackClaimedJobs();
      expect(deliver).toHaveBeenCalledTimes(2);
      expect(deliver.mock.calls[0]?.[0].delivery_id).toBe(deliver.mock.calls[1]?.[0].delivery_id);
      expect((await pool.query("SELECT status, evaluation_job_id FROM alert_deliveries WHERE alert_id = $1", [alertId])).rows)
        .toEqual([{ status: "delivered", evaluation_job_id: ownerId }]);
      expect((await pool.query("SELECT count(*)::int AS count FROM alert_delivery_members WHERE incident_id = $1", [incidentId])).rows)
        .toEqual([{ count: 1 }]);
    } finally {
      release(); await first;
      await firstQueue.close(); await otherQueue.close();
    }
  });
});
