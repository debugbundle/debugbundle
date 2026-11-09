import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import { WORKER_JOB_SCHEMA_MIGRATIONS } from "../../packages/storage/src/worker-job-schema.js";
import {
  restoreStoragePredecessor,
  POST_PREDECESSOR_MIGRATION_IDS
} from "../helpers/storage-predecessor.js";
import {
  removeEvidenceSchemaFromLegacyFixture,
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.ts";

runIntegration("worker job forward migration", () => {
  const pool = createIntegrationPool();
  afterAll(async () => {
    await pool.end();
  });
  it.each([true, false])(
    "upgrades the prior schema without touching existing events, ledger=%s",
    async (ledger) => {
      await restoreStoragePredecessor(pool, ledger);
      const db = createQueryable(pool),
        projectId = randomUUID(),
        eventId = randomUUID();
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
      await pool.query("DROP TABLE worker_jobs");
      if (ledger)
        await pool.query("DELETE FROM storage_migration_ledger WHERE id=$1", [
          WORKER_JOB_SCHEMA_MIGRATIONS[0]!.id
        ]);
      else await removeEvidenceSchemaFromLegacyFixture(pool);
      await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow();
      const migrated = await migrateStorageSchema(db);
      if (ledger)
        expect(migrated.applied).toEqual([
          WORKER_JOB_SCHEMA_MIGRATIONS[0]!.id,
          ...POST_PREDECESSOR_MIGRATION_IDS
        ]);
      else expect(migrated.applied).toContain(WORKER_JOB_SCHEMA_MIGRATIONS[0]!.id);
      await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
      expect(
        (await pool.query("SELECT event_id FROM processed_events WHERE event_id=$1", [eventId]))
          .rows
      ).toEqual([{ event_id: eventId }]);
      expect((await migrateStorageSchema(db)).applied).toHaveLength(0);
      expect(
        (
          await pool.query("SELECT checksum FROM storage_migration_ledger WHERE id=$1", [
            WORKER_JOB_SCHEMA_MIGRATIONS[0]!.id
          ])
        ).rows[0].checksum
      ).toBe(WORKER_JOB_SCHEMA_MIGRATIONS[0]!.checksum);
    }
  );
});
