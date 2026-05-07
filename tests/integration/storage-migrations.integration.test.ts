import { afterAll, expect, it } from "vitest";

import {
  bootstrapStorageSchema,
  REQUIRED_API_TABLES,
  REQUIRED_WORKER_TABLES
} from "../../packages/storage/src/migrations.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema,
  STORAGE_SCHEMA_MIGRATIONS
} from "../../packages/storage/src/schema-migrations.js";
import {
  createIntegrationPool,
  createQueryable,
  createS3AdminClient,
  runIntegration,
  bootstrapStorageAndCreateBucket
} from "../helpers/integration-setup.ts";

runIntegration("storage bootstrap integration", () => {
  const pool = createIntegrationPool();
  const s3Admin = createS3AdminClient();

  afterAll(async (): Promise<void> => {
    await pool.end();
  });

  it("bootstraps an empty public schema with required tables, indexes, and critical foreign keys", async (): Promise<void> => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");

    await bootstrapStorageAndCreateBucket(pool, s3Admin);

    const db = createQueryable(pool);
    const secondBootstrap = await bootstrapStorageSchema(db);
    expect(secondBootstrap).toEqual({ status: "already_bootstrapped" });
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();

    const legacyTableResult = await db.query<{ relation_name: string | null }>(
      "SELECT to_regclass('public.schema_migrations')::text AS relation_name",
      []
    );
    expect(legacyTableResult.rows[0]?.relation_name ?? null).toBeNull();

    const tableResult = await db.query<{ table_name: string }>(
      `
        SELECT tablename AS table_name
        FROM pg_tables
        WHERE schemaname = 'public'
      `,
      []
    );
    const actualTables = new Set(tableResult.rows.map((row) => row.table_name));
    const requiredTables = new Set([...REQUIRED_API_TABLES, ...REQUIRED_WORKER_TABLES]);

    for (const tableName of requiredTables) {
      expect(actualTables.has(tableName)).toBe(true);
    }

    const indexResult = await db.query<{ index_name: string }>(
      `
        SELECT indexname AS index_name
        FROM pg_indexes
        WHERE schemaname = 'public'
      `,
      []
    );
    const actualIndexes = new Set(indexResult.rows.map((row) => row.index_name));

    expect(actualIndexes.has("project_tokens_token_hash_key")).toBe(true);
    expect(actualIndexes.has("incident_events_incident_occurred_event_idx")).toBe(true);
    expect(actualIndexes.has("webhook_deliveries_status_next_attempt_idx")).toBe(true);
    expect(actualIndexes.has("github_dispatch_deliveries_status_next_attempt_idx")).toBe(true);
    expect(actualIndexes.has("sessions_token_hash_idx")).toBe(true);
    expect(actualIndexes.has("alert_deliveries_project_status_idx")).toBe(true);
    expect(actualIndexes.has("org_usage_counters_pkey")).toBe(true);
    expect(actualIndexes.has("processed_billing_events_pkey")).toBe(true);
    expect(actualIndexes.has("organizations_stripe_customer_id_key")).toBe(true);

    const constraintResult = await db.query<{ conname: string; confdeltype: string }>(
      `
        SELECT conname, confdeltype
        FROM pg_constraint
        WHERE contype = 'f'
          AND conname = ANY($1::text[])
      `,
      [[
        "organization_members_organization_id_fkey",
        "organization_members_user_id_fkey",
        "projects_organization_id_fkey",
        "project_tokens_project_id_fkey",
        "incidents_project_id_fkey",
        "incidents_service_id_fkey",
        "bundle_generations_project_id_fkey",
        "bundle_generations_incident_id_fkey",
        "webhook_deliveries_webhook_id_fkey",
        "alert_deliveries_alert_id_fkey",
        "project_github_repos_installation_id_fkey",
        "org_usage_counters_organization_id_fkey"
      ]]
    );
    const deleteBehaviorByConstraint = new Map(
      constraintResult.rows.map((row) => [row.conname, row.confdeltype])
    );

    expect(deleteBehaviorByConstraint.get("organization_members_organization_id_fkey")).toBe("c");
    expect(deleteBehaviorByConstraint.get("organization_members_user_id_fkey")).toBe("c");
    expect(deleteBehaviorByConstraint.get("projects_organization_id_fkey")).toBe("n");
    expect(deleteBehaviorByConstraint.get("project_tokens_project_id_fkey")).toBe("c");
    expect(deleteBehaviorByConstraint.get("incidents_project_id_fkey")).toBe("c");
    expect(deleteBehaviorByConstraint.get("incidents_service_id_fkey")).toBe("n");
    expect(deleteBehaviorByConstraint.get("bundle_generations_project_id_fkey")).toBe("c");
    expect(deleteBehaviorByConstraint.get("bundle_generations_incident_id_fkey")).toBe("c");
    expect(deleteBehaviorByConstraint.get("webhook_deliveries_webhook_id_fkey")).toBe("c");
    expect(deleteBehaviorByConstraint.get("alert_deliveries_alert_id_fkey")).toBe("c");
    expect(deleteBehaviorByConstraint.get("project_github_repos_installation_id_fkey")).toBe("c");
    expect(deleteBehaviorByConstraint.get("org_usage_counters_organization_id_fkey")).toBe("c");
  });

  it("migrates an existing schema missing required auth suspension columns", async (): Promise<void> => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");

    await bootstrapStorageSchema(createQueryable(pool));
    await pool.query("ALTER TABLE organization_members DROP COLUMN suspended_at");
    await pool.query("ALTER TABLE organizations DROP COLUMN suspended_at");

    const bootstrapBeforeMigration = await bootstrapStorageSchema(createQueryable(pool));
    expect(bootstrapBeforeMigration).toEqual({ status: "already_bootstrapped" });

    const migrated = await migrateStorageSchema(createQueryable(pool));
    expect(migrated.applied).toEqual(STORAGE_SCHEMA_MIGRATIONS.map((migration) => migration.id));

    const columnResult = await pool.query<{ table_name: string; column_name: string }>(
      `
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('organization_members', 'organizations')
          AND column_name = 'suspended_at'
        ORDER BY table_name ASC
      `
    );
    expect(columnResult.rows).toEqual([
      { table_name: "organization_members", column_name: "suspended_at" },
      { table_name: "organizations", column_name: "suspended_at" }
    ]);

    const secondMigration = await migrateStorageSchema(createQueryable(pool));
    expect(secondMigration.applied).toEqual([]);
    expect(secondMigration.already_applied).toEqual(STORAGE_SCHEMA_MIGRATIONS.map((migration) => migration.id));
    await expect(assertStorageSchemaMigrationsApplied(createQueryable(pool))).resolves.toBeUndefined();
  });
});