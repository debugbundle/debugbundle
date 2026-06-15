import { type Queryable } from "./migrations.js";
import {
  ensureLegacyGitHubDispatchFingerprintCompatibility,
  isCurrentStorageSchemaBaseline,
  repairKnownCompatibleMigrationChecksums
} from "./schema-migration-compatibility.js";
import { AVAILABILITY_CHECK_STORAGE_SCHEMA_MIGRATIONS } from "./availability-check-schema-migrations.js";
import {
  STORAGE_SCHEMA_MIGRATIONS as BASE_STORAGE_SCHEMA_MIGRATIONS,
  type StorageSchemaMigration
} from "./schema-migrations-catalog.js";

export interface StorageMigrationResult {
  applied: string[];
  already_applied: string[];
}

type StorageMigrationLedgerReconcileStatus =
  | "already_present"
  | "seeded_current_schema"
  | "not_current_schema";

const STORAGE_MIGRATION_LEDGER_TABLE = "storage_migration_ledger";

export const STORAGE_SCHEMA_MIGRATIONS: readonly StorageSchemaMigration[] = [
  ...BASE_STORAGE_SCHEMA_MIGRATIONS,
  ...AVAILABILITY_CHECK_STORAGE_SCHEMA_MIGRATIONS
];

function validateStorageSchemaMigrations(migrations: readonly StorageSchemaMigration[]): void {
  const ids = new Set<string>();
  let previousId = "";

  for (const migration of migrations) {
    if (!/^\d{12}_[a-z0-9_]+$/.test(migration.id)) {
      throw new Error(`storage_migration_invalid_id: ${migration.id}`);
    }

    if (ids.has(migration.id)) {
      throw new Error(`storage_migration_duplicate_id: ${migration.id}`);
    }

    if (previousId.length > 0 && migration.id <= previousId) {
      throw new Error(`storage_migration_order_invalid: ${migration.id}`);
    }

    if (migration.statements.length === 0) {
      throw new Error(`storage_migration_empty: ${migration.id}`);
    }

    for (const statement of migration.statements) {
      if (statement.trim().length === 0) {
        throw new Error(`storage_migration_statement_empty: ${migration.id}`);
      }
    }

    ids.add(migration.id);
    previousId = migration.id;
  }
}

async function recordAppliedMigrations(
  db: Queryable,
  migrations: readonly StorageSchemaMigration[]
): Promise<void> {
  for (const migration of migrations) {
    await db.query(
      `
        INSERT INTO ${STORAGE_MIGRATION_LEDGER_TABLE} (id, description, checksum, applied_at)
        VALUES ($1, $2, $3, now())
      `,
      [migration.id, migration.description, migration.checksum]
    );
  }
}

async function reconcileMigrationLedgerInTransaction(
  db: Queryable,
  appliedChecksums: Map<string, string>
): Promise<StorageMigrationLedgerReconcileStatus> {
  if (appliedChecksums.size > 0) {
    return "already_present";
  }

  if (!(await isCurrentStorageSchemaBaseline(db))) {
    return "not_current_schema";
  }

  await recordAppliedMigrations(db, STORAGE_SCHEMA_MIGRATIONS);
  appliedChecksums.clear();
  for (const migration of STORAGE_SCHEMA_MIGRATIONS) {
    appliedChecksums.set(migration.id, migration.checksum);
  }
  return "seeded_current_schema";
}

async function ensureMigrationLedger(db: Queryable): Promise<void> {
  await db.query(
    `
      CREATE TABLE IF NOT EXISTS ${STORAGE_MIGRATION_LEDGER_TABLE} (
        id text PRIMARY KEY,
        description text NOT NULL,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `,
    []
  );
}

async function readAppliedMigrations(db: Queryable): Promise<Map<string, string>> {
  const rows = await db.query<{ id: string; checksum: string }>(
    `
      SELECT id, checksum
      FROM ${STORAGE_MIGRATION_LEDGER_TABLE}
      WHERE id = ANY($1::text[])
      ORDER BY id ASC
    `,
    [STORAGE_SCHEMA_MIGRATIONS.map((migration) => migration.id)]
  );

  return new Map(rows.rows.map((row) => [row.id, row.checksum]));
}

export async function migrateStorageSchema(db: Queryable): Promise<StorageMigrationResult> {
  validateStorageSchemaMigrations(STORAGE_SCHEMA_MIGRATIONS);

  await db.query("BEGIN", []);

  try {
    await ensureMigrationLedger(db);
    const appliedChecksums = await readAppliedMigrations(db);
    const ledgerStatus = await reconcileMigrationLedgerInTransaction(db, appliedChecksums);
    const applied: string[] = [];
    const alreadyApplied: string[] = [];

    if (ledgerStatus === "seeded_current_schema") {
      await db.query("COMMIT", []);

      return {
        applied,
        already_applied: STORAGE_SCHEMA_MIGRATIONS.map((migration) => migration.id)
      };
    }

    await ensureLegacyGitHubDispatchFingerprintCompatibility(db, appliedChecksums);
    await repairKnownCompatibleMigrationChecksums({
      db,
      ledgerTableName: STORAGE_MIGRATION_LEDGER_TABLE,
      appliedChecksums,
      migrations: STORAGE_SCHEMA_MIGRATIONS
    });

    for (const migration of STORAGE_SCHEMA_MIGRATIONS) {
      const appliedChecksum = appliedChecksums.get(migration.id);
      if (appliedChecksum !== undefined) {
        if (appliedChecksum !== migration.checksum) {
          throw new Error(`storage_migration_checksum_mismatch: ${migration.id}`);
        }

        alreadyApplied.push(migration.id);
        continue;
      }

      for (const statement of migration.statements) {
        await db.query(statement, []);
      }

      await recordAppliedMigrations(db, [migration]);
      applied.push(migration.id);
    }

    await db.query("COMMIT", []);

    return {
      applied,
      already_applied: alreadyApplied
    };
  } catch (error) {
    try {
      await db.query("ROLLBACK", []);
    } catch (rollbackError) {
      const migrationError = error instanceof Error ? error.message : String(error);
      const rollbackMessage =
        rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      throw new Error(
        `storage_migration_rollback_failed: migration_error=${migrationError}; rollback_error=${rollbackMessage}`
      );
    }

    throw error;
  }
}

export async function seedStorageMigrationLedgerForCurrentSchema(
  db: Queryable
): Promise<StorageMigrationLedgerReconcileStatus> {
  validateStorageSchemaMigrations(STORAGE_SCHEMA_MIGRATIONS);

  await db.query("BEGIN", []);

  try {
    await ensureMigrationLedger(db);
    const appliedChecksums = await readAppliedMigrations(db);
    const status = await reconcileMigrationLedgerInTransaction(db, appliedChecksums);
    await db.query("COMMIT", []);
    return status;
  } catch (error) {
    try {
      await db.query("ROLLBACK", []);
    } catch (rollbackError) {
      const reconcileError = error instanceof Error ? error.message : String(error);
      const rollbackMessage =
        rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      throw new Error(
        `storage_migration_ledger_reconcile_rollback_failed: reconcile_error=${reconcileError}; rollback_error=${rollbackMessage}`
      );
    }

    throw error;
  }
}

export async function assertStorageSchemaMigrationsApplied(db: Queryable): Promise<void> {
  validateStorageSchemaMigrations(STORAGE_SCHEMA_MIGRATIONS);

  const ledgerResult = await db.query<{ relation_name: string | null }>(
    `SELECT to_regclass('public.${STORAGE_MIGRATION_LEDGER_TABLE}')::text AS relation_name`,
    []
  );

  if (
    ledgerResult.rows[0]?.relation_name === null ||
    ledgerResult.rows[0]?.relation_name === undefined
  ) {
    throw new Error(
      `storage_schema_missing_migrations: ${STORAGE_SCHEMA_MIGRATIONS.map((migration) => migration.id).join(",")}`
    );
  }

  const appliedChecksums = await readAppliedMigrations(db);
  const missing: string[] = [];

  for (const migration of STORAGE_SCHEMA_MIGRATIONS) {
    const appliedChecksum = appliedChecksums.get(migration.id);
    if (appliedChecksum === undefined) {
      missing.push(migration.id);
      continue;
    }

    if (appliedChecksum !== migration.checksum) {
      throw new Error(`storage_migration_checksum_mismatch: ${migration.id}`);
    }
  }

  if (missing.length > 0) {
    throw new Error(`storage_schema_missing_migrations: ${missing.join(",")}`);
  }
}
