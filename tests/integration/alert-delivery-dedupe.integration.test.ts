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
});
