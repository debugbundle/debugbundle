import { describe, expect, it, vi } from "vitest";

import {
  REQUIRED_API_TABLES,
  REQUIRED_WORKER_TABLES
} from "../../../packages/storage/src/migrations.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema,
  seedStorageMigrationLedgerForCurrentSchema,
  STORAGE_SCHEMA_MIGRATIONS
} from "../../../packages/storage/src/schema-migrations.js";
import { LEGACY_PLAN_CLEANUP_TASKS_MIGRATION_CHECKSUM } from "../../../packages/storage/src/schema-migration-compatibility.js";
import type { Queryable } from "../../../packages/storage/src/migrations.js";

const ALL_REQUIRED_TABLES = Array.from(
  new Set([...REQUIRED_API_TABLES, ...REQUIRED_WORKER_TABLES])
);

describe("storage schema migrations", () => {
  it("should replace the provisional saved-funnel default with tier capacity", (): void => {
    const migration = STORAGE_SCHEMA_MIGRATIONS.find(
      (entry) => entry.id === "202607130001_expand_default_saved_funnel_capacity"
    );

    expect(migration).toBeDefined();
    expect(migration?.statements.join("\n")).toContain(
      "ALTER COLUMN max_saved_funnels SET DEFAULT 10"
    );
    expect(migration?.statements.join("\n")).toContain("WHEN 'team' THEN 50");
    expect(migration?.statements.join("\n")).toContain("WHEN 'solo' THEN 10");
    expect(migration?.statements.join("\n")).toContain("settings.max_saved_funnels = 3");
  });

  it("should expand existing Free projects to the preview funnel capacity", (): void => {
    const migration = STORAGE_SCHEMA_MIGRATIONS.find(
      (entry) => entry.id === "202607140001_enable_free_analytics_preview"
    );

    expect(migration).toBeDefined();
    expect(migration?.statements.join("\n")).toContain("organizations.plan = 'free'");
    expect(migration?.statements.join("\n")).toContain("max_saved_funnels = 1");
    expect(migration?.statements.join("\n")).toContain("settings.max_saved_funnels = 0");
  });

  it("should expand default custom-dimension capacity by tier", (): void => {
    const migration = STORAGE_SCHEMA_MIGRATIONS.find(
      (entry) => entry.id === "202607140002_expand_custom_dimension_capacity"
    );

    expect(migration).toBeDefined();
    expect(migration?.statements.join("\n")).toContain(
      "ALTER COLUMN max_custom_dimensions SET DEFAULT 3"
    );
    expect(migration?.statements.join("\n")).toContain("WHEN 'team' THEN 8");
    expect(migration?.statements.join("\n")).toContain("WHEN 'solo' THEN 3");
    expect(migration?.statements.join("\n")).toContain("ELSE 1");
    expect(migration?.statements.join("\n")).toContain("settings.max_custom_dimensions = 0");
  });

  it("should add bounded hourly analytics retention with tier defaults", (): void => {
    const migration = STORAGE_SCHEMA_MIGRATIONS.find(
      (entry) => entry.id === "202607160002_add_analytics_hourly_retention"
    );

    expect(migration).toBeDefined();
    expect(migration?.statements.join("\n")).toContain("hourly_retention_days");
    expect(migration?.statements.join("\n")).toContain("WHEN 'team' THEN 90");
    expect(migration?.statements.join("\n")).toContain("WHEN 'solo' THEN 30");
    expect(migration?.statements.join("\n")).toContain("ELSE 7");
  });

  it("should apply pending migrations once and persist checksums", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValue({ rows: [] });

    const result = await migrateStorageSchema({ query } as Queryable);

    expect(result.applied).toEqual(STORAGE_SCHEMA_MIGRATIONS.map((migration) => migration.id));
    expect(query).toHaveBeenCalledWith("BEGIN", []);
    expect(query).toHaveBeenCalledWith("COMMIT", []);
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining(
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS suspended_at timestamptz"
      )
    );
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS slack_destinations")
    );
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining(
        "ALTER TABLE github_dispatch_deliveries ADD COLUMN IF NOT EXISTS rule_name text"
      )
    );
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS plan_cleanup_tasks")
    );
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS project_usage_counters")
    );
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS account_analytics_accounts")
    );
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS account_payment_retention_records")
    );
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS ingestion_rejection_diagnostic_periods")
    );
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining("UPDATE project_invites")
    );
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS availability_checks")
    );
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS availability_check_daily_rollups")
    );
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining("ALTER TABLE projects ADD COLUMN IF NOT EXISTS color_tag text")
    );
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining(
        "ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS severity_lifecycle_scope text"
      )
    );
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS project_analytics_settings")
    );
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS analytics_rollup_uniques")
    );
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS analytics_bundle_generations")
    );
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining("ADD COLUMN IF NOT EXISTS analytics_journey_samples")
    );
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining("ADD COLUMN IF NOT EXISTS has_artifact")
    );
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining("ADD COLUMN IF NOT EXISTS correlation_session_hash")
    );
  });

  it("should skip already-applied migrations with matching checksums", async (): Promise<void> => {
    const appliedRows = STORAGE_SCHEMA_MIGRATIONS.map((migration) => ({
      id: migration.id,
      checksum: migration.checksum
    }));
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: appliedRows })
      .mockResolvedValue({ rows: [] });

    const result = await migrateStorageSchema({ query } as Queryable);

    expect(result.applied).toEqual([]);
    expect(result.already_applied).toEqual(
      STORAGE_SCHEMA_MIGRATIONS.map((migration) => migration.id)
    );
    expect(query.mock.calls.map((call) => String(call[0]))).not.toContain(
      "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS suspended_at timestamptz"
    );
  });

  it("should fail closed when an applied migration checksum changes", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: STORAGE_SCHEMA_MIGRATIONS[0]?.id, checksum: "wrong" }]
      });

    await expect(migrateStorageSchema({ query } as Queryable)).rejects.toThrow(
      "storage_migration_checksum_mismatch"
    );
    expect(query).toHaveBeenCalledWith("ROLLBACK", []);
  });

  it("should repair the known compatible legacy checksum for plan cleanup tasks", async (): Promise<void> => {
    const migration = STORAGE_SCHEMA_MIGRATIONS.find(
      (entry) => entry.id === "202606050002_add_durable_plan_cleanup_tasks"
    );
    expect(migration).toBeDefined();

    const query = vi.fn(
      async (sql: string): Promise<{ rows: Record<string, unknown>[]; rowCount?: number }> => {
        const sqlText = String(sql);

        if (sqlText.includes("SELECT id, checksum")) {
          return {
            rows: STORAGE_SCHEMA_MIGRATIONS.map((entry) => ({
              id: entry.id,
              checksum:
                entry.id === migration?.id
                  ? LEGACY_PLAN_CLEANUP_TASKS_MIGRATION_CHECKSUM
                  : entry.checksum
            }))
          };
        }

        if (
          sqlText.includes("FROM information_schema.columns") &&
          sqlText.includes("table_name = 'plan_cleanup_tasks'")
        ) {
          return {
            rows: [
              { column_name: "id", is_nullable: "NO", column_default: null },
              { column_name: "organization_id", is_nullable: "NO", column_default: null },
              { column_name: "project_id", is_nullable: "NO", column_default: null },
              { column_name: "cleanup_type", is_nullable: "NO", column_default: null },
              { column_name: "attempt_count", is_nullable: "NO", column_default: "0" },
              { column_name: "last_error", is_nullable: "YES", column_default: null },
              { column_name: "next_attempt_at", is_nullable: "NO", column_default: "now()" },
              { column_name: "completed_at", is_nullable: "YES", column_default: null },
              { column_name: "created_at", is_nullable: "NO", column_default: "now()" },
              { column_name: "updated_at", is_nullable: "NO", column_default: "now()" }
            ]
          };
        }

        if (sqlText.includes("FROM pg_indexes")) {
          return {
            rows: [
              {
                index_name: "plan_cleanup_tasks_pending_idx",
                index_definition:
                  "CREATE INDEX plan_cleanup_tasks_pending_idx ON public.plan_cleanup_tasks USING btree (completed_at, next_attempt_at, created_at)"
              },
              {
                index_name: "plan_cleanup_tasks_project_id_cleanup_type_key",
                index_definition:
                  "CREATE UNIQUE INDEX plan_cleanup_tasks_project_id_cleanup_type_key ON public.plan_cleanup_tasks USING btree (project_id, cleanup_type)"
              }
            ]
          };
        }

        return { rows: [] };
      }
    );

    const result = await migrateStorageSchema({ query } as Queryable);

    expect(result.applied).toEqual([]);
    expect(result.already_applied).toEqual(STORAGE_SCHEMA_MIGRATIONS.map((entry) => entry.id));
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining("UPDATE storage_migration_ledger")
    );
  });

  it("should assert all required migrations are applied before runtimes start", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ relation_name: "storage_migration_ledger" }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(assertStorageSchemaMigrationsApplied({ query } as Queryable)).rejects.toThrow(
      "storage_schema_missing_migrations"
    );
  });

  it("should fail closed when the migration ledger is missing or has a checksum mismatch", async (): Promise<void> => {
    const missingLedgerQuery = vi.fn().mockResolvedValueOnce({ rows: [{ relation_name: null }] });
    const checksumMismatchQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ relation_name: "storage_migration_ledger" }] })
      .mockResolvedValueOnce({
        rows: [{ id: STORAGE_SCHEMA_MIGRATIONS[0]?.id, checksum: "wrong" }]
      });

    await expect(
      assertStorageSchemaMigrationsApplied({ query: missingLedgerQuery } as Queryable)
    ).rejects.toThrow("storage_schema_missing_migrations");
    await expect(
      assertStorageSchemaMigrationsApplied({ query: checksumMismatchQuery } as Queryable)
    ).rejects.toThrow("storage_migration_checksum_mismatch");
  });

  it("should seed the migration ledger instead of replaying history for a current bootstrap schema", async (): Promise<void> => {
    const currentSchemaColumns = [
      { table_name: "agent_webhooks", column_name: "created_by_user_id" },
      { table_name: "alert_rules", column_name: "created_by_user_id" },
      { table_name: "alert_rules", column_name: "cooldown_seconds" },
      { table_name: "alert_rules", column_name: "severity_lifecycle_scope" },
      { table_name: "capture_policies", column_name: "immediate_client_error_statuses" },
      { table_name: "capture_policies", column_name: "immediate_client_error_path_rules" },
      { table_name: "github_dispatch_rules", column_name: "created_by_user_id" },
      { table_name: "github_dispatch_deliveries", column_name: "rule_name" },
      { table_name: "github_dispatch_deliveries", column_name: "target_fingerprint" },
      { table_name: "incidents", column_name: "bundle_source_occurred_at" },
      { table_name: "incidents", column_name: "bundle_trigger" },
      { table_name: "organization_members", column_name: "suspended_at" },
      { table_name: "organizations", column_name: "suspended_at" },
      { table_name: "organizations", column_name: "trial_plan" },
      { table_name: "account_analytics_accounts", column_name: "metrics_collection_started_at" },
      { table_name: "account_payment_retention_records", column_name: "provider" },
      { table_name: "analytics_bundle_generations", column_name: "input_fingerprint" },
      { table_name: "analytics_journey_samples", column_name: "correlation_session_hash" },
      { table_name: "analytics_journey_samples", column_name: "has_artifact" },
      { table_name: "analytics_usage_counters", column_name: "analytics_events" },
      { table_name: "analytics_usage_counters", column_name: "analytics_journey_samples" },
      { table_name: "plan_cleanup_tasks", column_name: "cleanup_type" },
      { table_name: "project_analytics_settings", column_name: "enabled" },
      { table_name: "project_analytics_settings", column_name: "hourly_retention_days" },
      { table_name: "project_usage_counters", column_name: "updated_at" },
      { table_name: "project_tokens", column_name: "allowed_origins" },
      { table_name: "projects", column_name: "color_tag" },
      { table_name: "projects", column_name: "improvement_bundle_sensitivity" },
      { table_name: "sessions", column_name: "auth_method" },
      { table_name: "trial_lifecycle_events", column_name: "dedupe_key" },
      { table_name: "users", column_name: "avatar_source" }
    ];
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: ALL_REQUIRED_TABLES.map((table_name) => ({ table_name }))
      })
      .mockResolvedValueOnce({
        rows: currentSchemaColumns
      })
      .mockResolvedValue({ rows: [] });

    const result = await migrateStorageSchema({ query } as Queryable);

    expect(result.applied).toEqual([]);
    expect(result.already_applied).toEqual(
      STORAGE_SCHEMA_MIGRATIONS.map((migration) => migration.id)
    );
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining(
        "ALTER TABLE github_dispatch_deliveries RENAME COLUMN incident_fingerprint TO target_fingerprint"
      ),
      []
    );
  });

  it("should rollback and surface rollback failures during migration application", async (): Promise<void> => {
    const rollbackQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("statement_failed"))
      .mockResolvedValueOnce({ rows: [] });
    const rollbackFailureQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("statement_failed"))
      .mockRejectedValueOnce(new Error("rollback_failed"));

    await expect(migrateStorageSchema({ query: rollbackQuery } as Queryable)).rejects.toThrow(
      "statement_failed"
    );
    expect(rollbackQuery).toHaveBeenCalledWith("ROLLBACK", []);

    await expect(
      migrateStorageSchema({ query: rollbackFailureQuery } as Queryable)
    ).rejects.toThrow("storage_migration_rollback_failed");
  });

  it("should reject invalid migration metadata before touching the database", async (): Promise<void> => {
    const originalMigrations = STORAGE_SCHEMA_MIGRATIONS.slice();
    const mutatedMigrations = STORAGE_SCHEMA_MIGRATIONS as unknown as Array<{
      id: string;
      description: string;
      statements: readonly string[];
      checksum: string;
    }>;

    mutatedMigrations.splice(
      0,
      mutatedMigrations.length,
      {
        ...originalMigrations[0]!,
        id: "invalid-id"
      },
      {
        ...originalMigrations[1]!,
        statements: ["   "]
      }
    );

    try {
      await expect(migrateStorageSchema({ query: vi.fn() } as Queryable)).rejects.toThrow(
        "storage_migration_invalid_id"
      );

      mutatedMigrations.splice(0, mutatedMigrations.length, {
        ...originalMigrations[0]!,
        statements: []
      });
      await expect(
        assertStorageSchemaMigrationsApplied({ query: vi.fn() } as Queryable)
      ).rejects.toThrow("storage_migration_empty");

      mutatedMigrations.splice(
        0,
        mutatedMigrations.length,
        originalMigrations[1]!,
        originalMigrations[0]!
      );
      await expect(
        assertStorageSchemaMigrationsApplied({ query: vi.fn() } as Queryable)
      ).rejects.toThrow("storage_migration_order_invalid");
    } finally {
      mutatedMigrations.splice(0, mutatedMigrations.length, ...originalMigrations);
    }
  });

  it("should leave the ledger empty when the schema is not at the current baseline", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ table_name: "capture_rules" }]
      })
      .mockResolvedValue({ rows: [] });

    const status = await seedStorageMigrationLedgerForCurrentSchema({ query } as Queryable);

    expect(status).toBe("not_current_schema");
  });
});
