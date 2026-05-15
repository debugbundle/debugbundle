import { createHash } from "node:crypto";

import type { Queryable } from "./migrations.js";

export interface StorageSchemaMigration {
  id: string;
  description: string;
  statements: readonly string[];
  checksum: string;
}

export interface StorageMigrationResult {
  applied: string[];
  already_applied: string[];
}

const STORAGE_MIGRATION_LEDGER_TABLE = "storage_migration_ledger";

function computeMigrationChecksum(input: {
  id: string;
  description: string;
  statements: readonly string[];
}): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

function defineStorageSchemaMigration(input: {
  id: string;
  description: string;
  statements: readonly string[];
}): StorageSchemaMigration {
  return {
    ...input,
    checksum: computeMigrationChecksum(input)
  };
}

export const STORAGE_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202605050001_add_auth_suspension_columns",
    description: "Add organization and membership suspension timestamps used by auth gates.",
    statements: [
      "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS suspended_at timestamptz",
      "ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS suspended_at timestamptz"
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605120001_add_github_device_authorizations",
    description: "Add persisted GitHub CLI bootstrap state for device-flow login.",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS github_device_authorizations (
          id uuid PRIMARY KEY,
          device_code text NOT NULL UNIQUE,
          user_code text NOT NULL,
          verification_uri text NOT NULL,
          interval_seconds integer NOT NULL,
          expires_at timestamptz NOT NULL,
          accepted_terms_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          completed_at timestamptz,
          claimed_at timestamptz,
          terminal_error text,
          user_id uuid REFERENCES users(id) ON DELETE SET NULL,
          organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS github_device_authorizations_user_code_idx
        ON github_device_authorizations (user_code, created_at DESC)
      `,
      `
        CREATE INDEX IF NOT EXISTS github_device_authorizations_expires_at_idx
        ON github_device_authorizations (expires_at)
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605130001_allow_synthetic_webhook_test_deliveries_without_incident_fk",
    description: "Allow webhook test deliveries to persist without requiring a backing incidents row.",
    statements: [
      "ALTER TABLE webhook_deliveries ALTER COLUMN incident_id DROP NOT NULL"
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605130002_add_slack_destinations",
    description: "Add reusable encrypted Slack alert destinations scoped to organizations.",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS slack_destinations (
          id uuid PRIMARY KEY,
          organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          slack_team_id text NOT NULL,
          slack_team_name text,
          slack_channel_id text NOT NULL,
          slack_channel_name text,
          webhook_url_ciphertext text NOT NULL,
          installed_by_member_id uuid REFERENCES users(id) ON DELETE SET NULL,
          is_active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (organization_id, slack_team_id, slack_channel_id)
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS slack_destinations_org_active_idx
        ON slack_destinations (organization_id, is_active, created_at)
      `
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605140001_add_capture_policy_immediate_client_error_statuses",
    description: "Add nullable immediate client error status overrides to capture policies.",
    statements: [
      "ALTER TABLE capture_policies ADD COLUMN IF NOT EXISTS immediate_client_error_statuses jsonb"
    ]
  }),
  defineStorageSchemaMigration({
    id: "202605150001_add_user_avatar_columns",
    description: "Add cached user avatar metadata for GitHub and Gravatar profile images.",
    statements: [
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_source text",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_object_key text",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_content_type text",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_updated_at timestamptz"
    ]
  })
] as const;

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
    const applied: string[] = [];
    const alreadyApplied: string[] = [];

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

      await db.query(
        `
          INSERT INTO ${STORAGE_MIGRATION_LEDGER_TABLE} (id, description, checksum, applied_at)
          VALUES ($1, $2, $3, now())
        `,
        [migration.id, migration.description, migration.checksum]
      );
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
      const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      throw new Error(
        `storage_migration_rollback_failed: migration_error=${migrationError}; rollback_error=${rollbackMessage}`
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

  if (ledgerResult.rows[0]?.relation_name === null || ledgerResult.rows[0]?.relation_name === undefined) {
    throw new Error(`storage_schema_missing_migrations: ${STORAGE_SCHEMA_MIGRATIONS.map((migration) => migration.id).join(",")}`);
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
