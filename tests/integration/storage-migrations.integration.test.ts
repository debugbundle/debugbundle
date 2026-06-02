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
    expect(actualIndexes.has("processed_github_marketplace_events_pkey")).toBe(true);
    expect(actualIndexes.has("organizations_stripe_customer_id_key")).toBe(true);
    expect(actualIndexes.has("github_marketplace_accounts_installation_idx")).toBe(true);

    const webhookIncidentColumnResult = await db.query<{ is_nullable: "YES" | "NO" }>(
      `
        SELECT is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'webhook_deliveries'
          AND column_name = 'incident_id'
      `,
      []
    );
    expect(webhookIncidentColumnResult.rows[0]?.is_nullable).toBe("YES");

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

  it("seeds the migration ledger for a current bootstrap schema instead of replaying historical migrations", async (): Promise<void> => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");

    await bootstrapStorageSchema(createQueryable(pool));

    const migrated = await migrateStorageSchema(createQueryable(pool));

    expect(migrated.applied).toEqual([]);
    expect(migrated.already_applied).toEqual(STORAGE_SCHEMA_MIGRATIONS.map((migration) => migration.id));
    await expect(assertStorageSchemaMigrationsApplied(createQueryable(pool))).resolves.toBeUndefined();
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

  it("migrates an existing schema missing creator ownership and incident bundle tracking columns", async (): Promise<void> => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");

    await bootstrapStorageSchema(createQueryable(pool));

    await pool.query("ALTER TABLE incidents DROP COLUMN bundle_source_occurred_at");
    await pool.query("ALTER TABLE incidents DROP COLUMN bundle_trigger");
    await pool.query("ALTER TABLE alert_rules DROP CONSTRAINT alert_rules_created_by_user_id_fkey");
    await pool.query("ALTER TABLE alert_rules DROP COLUMN created_by_user_id");
    await pool.query("ALTER TABLE agent_webhooks DROP CONSTRAINT agent_webhooks_created_by_user_id_fkey");
    await pool.query("ALTER TABLE agent_webhooks DROP COLUMN created_by_user_id");
    await pool.query("ALTER TABLE github_dispatch_rules DROP CONSTRAINT github_dispatch_rules_created_by_user_id_fkey");
    await pool.query("ALTER TABLE github_dispatch_rules DROP COLUMN created_by_user_id");

    const migrated = await migrateStorageSchema(createQueryable(pool));
    expect(migrated.applied).toEqual(STORAGE_SCHEMA_MIGRATIONS.map((migration) => migration.id));

    const columnResult = await pool.query<{
      table_name: string;
      column_name: string;
      is_nullable: "YES" | "NO";
    }>(
      `
        SELECT table_name, column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            (table_name = 'incidents' AND column_name IN ('bundle_source_occurred_at', 'bundle_trigger'))
            OR (table_name = 'alert_rules' AND column_name = 'created_by_user_id')
            OR (table_name = 'agent_webhooks' AND column_name = 'created_by_user_id')
            OR (table_name = 'github_dispatch_rules' AND column_name = 'created_by_user_id')
          )
        ORDER BY table_name ASC, column_name ASC
      `
    );

    expect(columnResult.rows).toEqual([
      { table_name: "agent_webhooks", column_name: "created_by_user_id", is_nullable: "NO" },
      { table_name: "alert_rules", column_name: "created_by_user_id", is_nullable: "NO" },
      { table_name: "github_dispatch_rules", column_name: "created_by_user_id", is_nullable: "NO" },
      { table_name: "incidents", column_name: "bundle_source_occurred_at", is_nullable: "YES" },
      { table_name: "incidents", column_name: "bundle_trigger", is_nullable: "YES" }
    ]);

    const constraintResult = await pool.query<{ conname: string }>(
      `
        SELECT conname
        FROM pg_constraint
        WHERE conname = ANY($1::text[])
        ORDER BY conname ASC
      `,
      [[
        "alert_rules_created_by_user_id_fkey",
        "agent_webhooks_created_by_user_id_fkey",
        "github_dispatch_rules_created_by_user_id_fkey"
      ]]
    );

    expect(constraintResult.rows).toEqual([
      { conname: "agent_webhooks_created_by_user_id_fkey" },
      { conname: "alert_rules_created_by_user_id_fkey" },
      { conname: "github_dispatch_rules_created_by_user_id_fkey" }
    ]);
  });
});
