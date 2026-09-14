import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import { WORKER_JOB_SCHEMA_MIGRATIONS } from "../../packages/storage/src/worker-job-schema.js";
import {
  bootstrapStorageAndCreateBucket,
  createIntegrationPool,
  createQueryable,
  createS3AdminClient,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.ts";

runIntegration("worker job forward migration", () => {
  const pool = createIntegrationPool();
  const s3 = createS3AdminClient();
  afterAll(async () => {
    await pool.end();
    s3.destroy();
  });
  it("upgrades the prior schema without touching existing events and fails readiness until migrated", async () => {
    await bootstrapStorageAndCreateBucket(pool, s3);
    const db = createQueryable(pool);
    const projectId = randomUUID();
    const eventId = randomUUID();
    await seedOwnedProject({
      pool,
      projectId,
      organizationId: randomUUID(),
      organizationName: "Migration",
      organizationSlug: `migration-${projectId}`,
      projectName: "Migration",
      projectSlug: "migration"
    });
    await pool.query(
      "INSERT INTO processed_events(event_id, project_id, event_type, fingerprint, normalized_message) VALUES ($1, $2, 'backend_exception', 'f', 'error')",
      [eventId, projectId]
    );
    // Reconstruct the immediate predecessor in this disposable test database.
    await pool.query("DROP TABLE worker_jobs");
    await pool.query("DELETE FROM storage_migration_ledger WHERE id = $1", [
      WORKER_JOB_SCHEMA_MIGRATIONS[0]!.id
    ]);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow();
    const migrate = async () => {
      const client = await pool.connect();
      try {
        return await migrateStorageSchema({ query: (sql, params) => client.query(sql, params) });
      } finally {
        client.release();
      }
    };
    const migrated = await migrate();
    expect(migrated.applied).toEqual([WORKER_JOB_SCHEMA_MIGRATIONS[0]!.id]);
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect(
      (await pool.query("SELECT event_id FROM processed_events WHERE event_id = $1", [eventId]))
        .rows
    ).toHaveLength(1);
    const repeated = await migrate();
    expect(repeated.applied).toHaveLength(0);
    expect(
      (
        await pool.query("SELECT checksum FROM storage_migration_ledger WHERE id = $1", [
          WORKER_JOB_SCHEMA_MIGRATIONS[0]!.id
        ])
      ).rows[0].checksum
    ).toBe(WORKER_JOB_SCHEMA_MIGRATIONS[0]!.checksum);
    // A pre-ledger self-host database must also upgrade without losing existing data.
    await pool.query("DROP TABLE worker_jobs");
    await pool.query("DELETE FROM storage_migration_ledger");
    const legacy = await migrate();
    expect(legacy.applied).toContain(WORKER_JOB_SCHEMA_MIGRATIONS[0]!.id);
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect(
      (await pool.query("SELECT event_id FROM processed_events WHERE event_id = $1", [eventId]))
        .rows
    ).toHaveLength(1);
  });
});
