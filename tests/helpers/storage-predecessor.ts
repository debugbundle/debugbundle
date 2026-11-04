import type { Pool } from "pg";
import predecessor from "../fixtures/project-service-predecessor.json" with { type: "json" };

export const PROJECT_SERVICE_MIGRATION_IDS = [
  "202611030001_add_service_definitions",
  "202611030002_add_project_consolidation"
];

/** Historical migration fixtures must start before the candidate, rather than
 * dropping old tables while retaining newer triggers and migration checksums.
 * Only call inside the disposable integration database. */
export async function restoreStoragePredecessor(pool: Pool, ledger = true): Promise<void> {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  for (const statement of predecessor.bootstrap) await pool.query(statement);
  if (!ledger) return;
  await pool.query(
    "CREATE TABLE storage_migration_ledger(id text PRIMARY KEY,description text NOT NULL,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())"
  );
  for (const migration of predecessor.migrations)
    await pool.query(
      "INSERT INTO storage_migration_ledger(id,description,checksum) VALUES($1,$2,$3)",
      [migration.id, migration.description, migration.checksum]
    );
}
