import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";

import { afterAll, beforeAll, expect, it } from "vitest";

import {
  buildBundleObjectKey,
  buildReproductionObjectKey,
  createPostgresRetentionStore,
  createRetentionCleanupService
} from "../../packages/storage/src/index.js";

import {
  createIntegrationPool,
  createQueryable,
  createS3AdminClient,
  createTestObjectStore,
  runIntegration,
  bootstrapStorageAndCreateBucket
} from "../helpers/integration-setup.ts";

runIntegration("retention cleanup integration", () => {
  const pool = createIntegrationPool();
  const s3Admin = createS3AdminClient();

  beforeAll(async (): Promise<void> => {
    await bootstrapStorageAndCreateBucket(pool, s3Admin);
  });

  afterAll(async (): Promise<void> => {
    await pool.end();
  });

  it("expires sampled raw-event blobs by tier and downgrades them to summary-only metadata", async (): Promise<void> => {
    await resetRetentionTables(pool);

    const objectStore = createTestObjectStore();
    const queryable = createQueryable(pool);
    const retentionStore = createPostgresRetentionStore(queryable);
    const retentionCleanup = createRetentionCleanupService({
      retentionStore,
      objectStore,
      batchSize: 20,
      maxBatches: 2
    });

    const fixtures = [
      { plan: "free", expiredOffsetDays: 8, retainedOffsetDays: 6 },
      { plan: "solo", expiredOffsetDays: 15, retainedOffsetDays: 13 },
      { plan: "team", expiredOffsetDays: 31, retainedOffsetDays: 29 }
    ] as const;

    const expiredEventIds: string[] = [];
    const retainedEventIds: string[] = [];
    const expiredKeys: string[] = [];
    const retainedKeys: string[] = [];

    for (const fixture of fixtures) {
      const seeded = await seedRetentionFixture({
        pool,
        objectStore,
        plan: fixture.plan,
        expiredOccurredAt: daysBefore("2026-04-04T12:00:00.000Z", fixture.expiredOffsetDays),
        retainedOccurredAt: daysBefore("2026-04-04T12:00:00.000Z", fixture.retainedOffsetDays)
      });

      expiredEventIds.push(seeded.expiredEventId);
      retainedEventIds.push(seeded.retainedEventId);
      expiredKeys.push(seeded.expiredKey);
      retainedKeys.push(seeded.retainedKey);
    }

    await retentionCleanup.runCleanup({
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });

    for (const key of expiredKeys) {
      await expect(objectStore.getObject({ key })).rejects.toThrow();
    }

    for (const key of retainedKeys) {
      await expect(objectStore.getObject({ key })).resolves.toBeInstanceOf(Buffer);
    }

    for (const eventId of expiredEventIds) {
      const result = await pool.query<{
        is_sampled: boolean;
        retain_first: boolean;
        retain_latest: boolean;
        retain_after_deploy: boolean;
        retain_highest_severity: boolean;
        retain_deploy_metadata: boolean;
      }>(
        `
          SELECT
            is_sampled,
            retain_first,
            retain_latest,
            retain_after_deploy,
            retain_highest_severity,
            retain_deploy_metadata
          FROM incident_events
          WHERE event_id = $1::uuid
        `,
        [eventId]
      );

      expect(result.rows[0]).toEqual({
        is_sampled: false,
        retain_first: false,
        retain_latest: false,
        retain_after_deploy: false,
        retain_highest_severity: false,
        retain_deploy_metadata: false
      });
    }

    for (const eventId of retainedEventIds) {
      const result = await pool.query<{ is_sampled: boolean }>(
        `
          SELECT is_sampled
          FROM incident_events
          WHERE event_id = $1::uuid
        `,
        [eventId]
      );

      expect(result.rows[0]?.is_sampled ?? false).toBe(true);
    }
  });

  it("expires retained incident bundles and reproductions by tier before deleting the incident metadata", async (): Promise<void> => {
    await resetRetentionTables(pool);

    const objectStore = createTestObjectStore();
    const queryable = createQueryable(pool);
    const retentionStore = createPostgresRetentionStore(queryable);
    const retentionCleanup = createRetentionCleanupService({
      retentionStore,
      objectStore,
      batchSize: 20,
      maxBatches: 2
    });

    const fixtures = [
      { plan: "free", expiredOffsetDays: 8, retainedOffsetDays: 6 },
      { plan: "solo", expiredOffsetDays: 31, retainedOffsetDays: 29 },
      { plan: "team", expiredOffsetDays: 91, retainedOffsetDays: 89 }
    ] as const;

    const expiredIncidentIds: string[] = [];
    const retainedIncidentIds: string[] = [];
    const expiredBundleKeys: string[] = [];
    const expiredReproductionKeys: string[] = [];
    const retainedBundleKeys: string[] = [];
    const retainedReproductionKeys: string[] = [];

    for (const fixture of fixtures) {
      const seeded = await seedBundleRetentionFixture({
        pool,
        objectStore,
        plan: fixture.plan,
        expiredBundleAt: daysBefore("2026-04-04T12:00:00.000Z", fixture.expiredOffsetDays),
        retainedBundleAt: daysBefore("2026-04-04T12:00:00.000Z", fixture.retainedOffsetDays)
      });

      expiredIncidentIds.push(seeded.expiredIncidentId);
      retainedIncidentIds.push(seeded.retainedIncidentId);
      expiredBundleKeys.push(seeded.expiredBundleKey);
      expiredReproductionKeys.push(seeded.expiredReproductionKey);
      retainedBundleKeys.push(seeded.retainedBundleKey);
      retainedReproductionKeys.push(seeded.retainedReproductionKey);
    }

    await retentionCleanup.runCleanup({
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });

    for (const key of expiredBundleKeys) {
      await expect(objectStore.getObject({ key })).rejects.toThrow();
    }

    for (const key of expiredReproductionKeys) {
      await expect(objectStore.getObject({ key })).rejects.toThrow();
    }

    for (const key of retainedBundleKeys) {
      await expect(objectStore.getObject({ key })).resolves.toBeInstanceOf(Buffer);
    }

    for (const key of retainedReproductionKeys) {
      await expect(objectStore.getObject({ key })).resolves.toBeInstanceOf(Buffer);
    }

    for (const incidentId of expiredIncidentIds) {
      const incidentResult = await pool.query<{ incident_id: string }>(
        `
          SELECT id::text AS incident_id
          FROM incidents
          WHERE id = $1::uuid
        `,
        [incidentId]
      );
      const generationResult = await pool.query<{ incident_id: string }>(
        `
          SELECT incident_id::text AS incident_id
          FROM bundle_generations
          WHERE incident_id = $1::uuid
        `,
        [incidentId]
      );

      expect(incidentResult.rows).toHaveLength(0);
      expect(generationResult.rows).toHaveLength(0);
    }

    for (const incidentId of retainedIncidentIds) {
      const incidentResult = await pool.query<{ incident_id: string }>(
        `
          SELECT id::text AS incident_id
          FROM incidents
          WHERE id = $1::uuid
        `,
        [incidentId]
      );

      expect(incidentResult.rows).toHaveLength(1);
    }
  });
});

function daysBefore(referenceIso: string, days: number): string {
  return new Date(new Date(referenceIso).getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function resetRetentionTables(pool: ReturnType<typeof createIntegrationPool>): Promise<void> {
  await pool.query(
    `
      TRUNCATE TABLE
        incident_events,
        incidents,
        services,
        projects,
        organizations
      CASCADE
    `,
    []
  );
}

async function seedRetentionFixture(input: {
  pool: ReturnType<typeof createIntegrationPool>;
  objectStore: ReturnType<typeof createTestObjectStore>;
  plan: "free" | "solo" | "team";
  expiredOccurredAt: string;
  retainedOccurredAt: string;
}): Promise<{
  expiredEventId: string;
  retainedEventId: string;
  expiredKey: string;
  retainedKey: string;
}> {
  const organizationId = randomUUID();
  const projectId = randomUUID();
  const serviceId = randomUUID();
  const incidentId = randomUUID();
  const expiredEventId = randomUUID();
  const retainedEventId = randomUUID();

  await input.pool.query(
    `
      INSERT INTO organizations (id, name, slug, plan)
      VALUES ($1, $2, $3, $4)
    `,
    [organizationId, `${input.plan} retention org`, `${input.plan}-retention-${organizationId.slice(0, 8)}`, input.plan]
  );

  await input.pool.query(
    `
      INSERT INTO projects (id, organization_id, name, slug, environment_default)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [projectId, organizationId, `${input.plan} project`, `${input.plan}-project-${projectId.slice(0, 8)}`, "production"]
  );

  await input.pool.query(
    `
      INSERT INTO services (id, project_id, name, environment)
      VALUES ($1, $2, $3, $4)
    `,
    [serviceId, projectId, `${input.plan}-service`, "production"]
  );

  await input.pool.query(
    `
      INSERT INTO incidents (
        id,
        project_id,
        service_id,
        environment,
        fingerprint,
        fingerprint_version,
        title,
        severity,
        status,
        first_seen_at,
        last_seen_at,
        occurrence_count,
        matched_fields,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        'open',
        $9::timestamptz,
        $10::timestamptz,
        2,
        $11::text[],
        now(),
        now()
      )
    `,
    [
      incidentId,
      projectId,
      serviceId,
      "production",
      `fp_${input.plan}`,
      "v1",
      `${input.plan} retention incident`,
      "high",
      input.expiredOccurredAt,
      input.retainedOccurredAt,
      ["normalized_message"]
    ]
  );

  await input.pool.query(
    `
      INSERT INTO incident_events (
        incident_id,
        event_id,
        event_type,
        event_class,
        occurred_at,
        is_sampled,
        retain_first,
        retain_latest,
        retain_after_deploy,
        retain_highest_severity,
        retain_deploy_metadata,
        level,
        severity_rank
      )
      VALUES
        ($1, $2, 'backend_exception', 'incident_signal', $3::timestamptz, true, true, false, false, false, false, 'error', 3),
        ($1, $4, 'backend_exception', 'incident_signal', $5::timestamptz, true, false, true, false, false, false, 'error', 3)
    `,
    [incidentId, expiredEventId, input.expiredOccurredAt, retainedEventId, input.retainedOccurredAt]
  );

  const expiredKey = `raw-events/${projectId}/${toObjectPath(input.expiredOccurredAt)}/${expiredEventId}.json.gz`;
  const retainedKey = `raw-events/${projectId}/${toObjectPath(input.retainedOccurredAt)}/${retainedEventId}.json.gz`;
  const body = gzipSync(Buffer.from("{}", "utf8"));

  await input.objectStore.putObject({
    key: expiredKey,
    body,
    contentType: "application/json",
    contentEncoding: "gzip"
  });
  await input.objectStore.putObject({
    key: retainedKey,
    body,
    contentType: "application/json",
    contentEncoding: "gzip"
  });

  return {
    expiredEventId,
    retainedEventId,
    expiredKey,
    retainedKey
  };
}

async function seedBundleRetentionFixture(input: {
  pool: ReturnType<typeof createIntegrationPool>;
  objectStore: ReturnType<typeof createTestObjectStore>;
  plan: "free" | "solo" | "team";
  expiredBundleAt: string;
  retainedBundleAt: string;
}): Promise<{
  expiredIncidentId: string;
  retainedIncidentId: string;
  expiredBundleKey: string;
  expiredReproductionKey: string;
  retainedBundleKey: string;
  retainedReproductionKey: string;
}> {
  const organizationId = randomUUID();
  const projectId = randomUUID();
  const serviceId = randomUUID();
  const expiredIncidentId = randomUUID();
  const retainedIncidentId = randomUUID();
  const expiredEventId = randomUUID();
  const retainedEventId = randomUUID();

  await input.pool.query(
    `
      INSERT INTO organizations (id, name, slug, plan)
      VALUES ($1, $2, $3, $4)
    `,
    [organizationId, `${input.plan} bundle org`, `${input.plan}-bundle-${organizationId.slice(0, 8)}`, input.plan]
  );

  await input.pool.query(
    `
      INSERT INTO projects (id, organization_id, name, slug, environment_default)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [projectId, organizationId, `${input.plan} bundle project`, `${input.plan}-bundle-project-${projectId.slice(0, 8)}`, "production"]
  );

  await input.pool.query(
    `
      INSERT INTO services (id, project_id, name, environment)
      VALUES ($1, $2, $3, $4)
    `,
    [serviceId, projectId, `${input.plan}-bundle-service`, "production"]
  );

  await insertBundleRetentionIncident({
    pool: input.pool,
    projectId,
    serviceId,
    incidentId: expiredIncidentId,
    eventId: expiredEventId,
    title: `${input.plan} expired bundle incident`,
    bundleAt: input.expiredBundleAt
  });

  await insertBundleRetentionIncident({
    pool: input.pool,
    projectId,
    serviceId,
    incidentId: retainedIncidentId,
    eventId: retainedEventId,
    title: `${input.plan} retained bundle incident`,
    bundleAt: input.retainedBundleAt
  });

  const body = gzipSync(Buffer.from("{}", "utf8"));
  const expiredBundleKey = buildBundleObjectKey(projectId, expiredIncidentId);
  const expiredReproductionKey = buildReproductionObjectKey(projectId, expiredIncidentId);
  const retainedBundleKey = buildBundleObjectKey(projectId, retainedIncidentId);
  const retainedReproductionKey = buildReproductionObjectKey(projectId, retainedIncidentId);

  await input.objectStore.putObject({
    key: expiredBundleKey,
    body,
    contentType: "application/json",
    contentEncoding: "gzip"
  });
  await input.objectStore.putObject({
    key: expiredReproductionKey,
    body,
    contentType: "application/json",
    contentEncoding: "gzip"
  });
  await input.objectStore.putObject({
    key: retainedBundleKey,
    body,
    contentType: "application/json",
    contentEncoding: "gzip"
  });
  await input.objectStore.putObject({
    key: retainedReproductionKey,
    body,
    contentType: "application/json",
    contentEncoding: "gzip"
  });

  return {
    expiredIncidentId,
    retainedIncidentId,
    expiredBundleKey,
    expiredReproductionKey,
    retainedBundleKey,
    retainedReproductionKey
  };
}

async function insertBundleRetentionIncident(input: {
  pool: ReturnType<typeof createIntegrationPool>;
  projectId: string;
  serviceId: string;
  incidentId: string;
  eventId: string;
  title: string;
  bundleAt: string;
}): Promise<void> {
  await input.pool.query(
    `
      INSERT INTO incidents (
        id,
        project_id,
        service_id,
        environment,
        fingerprint,
        fingerprint_version,
        title,
        severity,
        status,
        first_seen_at,
        last_seen_at,
        occurrence_count,
        matched_fields,
        bundle_generation_number,
        bundle_created_at,
        bundle_updated_at,
        bundle_source_event_id,
        bundle_source_occurred_at,
        bundle_trigger,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        'production',
        $4,
        'v1',
        $5,
        'high',
        'open',
        $6::timestamptz,
        $6::timestamptz,
        1,
        $7::text[],
        1,
        $6::timestamptz,
        $6::timestamptz,
        $8::uuid,
        $6::timestamptz,
        'occurrence_threshold',
        $6::timestamptz,
        $6::timestamptz
      )
    `,
    [
      input.incidentId,
      input.projectId,
      input.serviceId,
      `bundle_fp_${input.incidentId.slice(0, 8)}`,
      input.title,
      input.bundleAt,
      ["normalized_message"],
      input.eventId
    ]
  );

  await input.pool.query(
    `
      INSERT INTO bundle_generations (
        id,
        project_id,
        incident_id,
        bundle_type,
        generation_number,
        source_event_id,
        source_occurred_at,
        trigger,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        'failure',
        1,
        $4::uuid,
        $5::timestamptz,
        'occurrence_threshold',
        $5::timestamptz,
        $5::timestamptz
      )
    `,
    [randomUUID(), input.projectId, input.incidentId, input.eventId, input.bundleAt]
  );
}

function toObjectPath(occurredAt: string): string {
  const date = new Date(occurredAt);
  const year = date.getUTCFullYear().toString();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  return `${year}/${month}/${day}/${hour}`;
}