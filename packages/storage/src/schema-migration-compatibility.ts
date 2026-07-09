import { REQUIRED_API_TABLES, REQUIRED_WORKER_TABLES, type Queryable } from "./migrations.js";

const CURRENT_SCHEMA_SENTINEL_COLUMNS = [
  { table_name: "agent_webhooks", column_name: "created_by_user_id" },
  { table_name: "alert_rules", column_name: "created_by_user_id" },
  { table_name: "alert_rules", column_name: "cooldown_seconds" },
  { table_name: "alert_rules", column_name: "severity_lifecycle_scope" },
  { table_name: "account_analytics_accounts", column_name: "metrics_collection_started_at" },
  { table_name: "account_payment_retention_records", column_name: "provider" },
  { table_name: "analytics_bundle_generations", column_name: "input_fingerprint" },
  { table_name: "analytics_usage_counters", column_name: "analytics_events" },
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
  { table_name: "project_tokens", column_name: "allowed_origins" },
  { table_name: "projects", column_name: "color_tag" },
  { table_name: "projects", column_name: "improvement_bundle_sensitivity" },
  { table_name: "plan_cleanup_tasks", column_name: "cleanup_type" },
  { table_name: "project_analytics_settings", column_name: "enabled" },
  { table_name: "project_usage_counters", column_name: "updated_at" },
  { table_name: "sessions", column_name: "auth_method" },
  { table_name: "trial_lifecycle_events", column_name: "dedupe_key" },
  { table_name: "users", column_name: "avatar_source" }
] as const;

const PLAN_CLEANUP_TASKS_MIGRATION_ID = "202606050002_add_durable_plan_cleanup_tasks";
export const LEGACY_PLAN_CLEANUP_TASKS_MIGRATION_CHECKSUM =
  "29ef315ff519db45c371a289981d99a0e297e8386e21f4c64eff46ddc522a3a9";

async function listRequiredStorageTables(db: Queryable): Promise<Set<string>> {
  const requiredTables = Array.from(new Set([...REQUIRED_API_TABLES, ...REQUIRED_WORKER_TABLES]));
  const rows = await db.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [requiredTables]
  );

  return new Set(rows.rows.map((row) => row.table_name));
}

async function listCurrentSchemaSentinelColumns(db: Queryable): Promise<Set<string>> {
  const tableNames = Array.from(
    new Set(
      CURRENT_SCHEMA_SENTINEL_COLUMNS.map((column) => column.table_name).concat(
        "github_dispatch_deliveries"
      )
    )
  );
  const rows = await db.query<{ table_name: string; column_name: string }>(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [tableNames]
  );

  return new Set(rows.rows.map((row) => `${row.table_name}.${row.column_name}`));
}

export async function isCurrentStorageSchemaBaseline(db: Queryable): Promise<boolean> {
  const requiredTables = await listRequiredStorageTables(db);
  const expectedRequiredTables = new Set([...REQUIRED_API_TABLES, ...REQUIRED_WORKER_TABLES]);

  for (const tableName of expectedRequiredTables) {
    if (!requiredTables.has(tableName)) {
      return false;
    }
  }

  const sentinelColumns = await listCurrentSchemaSentinelColumns(db);
  for (const sentinel of CURRENT_SCHEMA_SENTINEL_COLUMNS) {
    if (!sentinelColumns.has(`${sentinel.table_name}.${sentinel.column_name}`)) {
      return false;
    }
  }

  if (sentinelColumns.has("github_dispatch_deliveries.incident_fingerprint")) {
    return false;
  }

  return true;
}

export async function ensureLegacyGitHubDispatchFingerprintCompatibility(
  db: Queryable,
  appliedChecksums: Map<string, string>
): Promise<void> {
  if (appliedChecksums.size > 0) {
    return;
  }

  const rows = await db.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'github_dispatch_deliveries'
        AND column_name IN ('incident_fingerprint', 'target_fingerprint')
    `,
    []
  );

  const columns = new Set(rows.rows.map((row) => row.column_name));
  if (!columns.has("target_fingerprint") || columns.has("incident_fingerprint")) {
    return;
  }

  await db.query(
    "ALTER TABLE github_dispatch_deliveries RENAME COLUMN target_fingerprint TO incident_fingerprint",
    []
  );
}

async function verifyPlanCleanupTasksShape(db: Queryable): Promise<boolean> {
  const columnRows = await db.query<{
    column_name: string;
    is_nullable: "YES" | "NO";
    column_default: string | null;
  }>(
    `
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'plan_cleanup_tasks'
    `,
    []
  );

  const columns = new Map(columnRows.rows.map((row) => [row.column_name, row]));
  const expectedColumns = [
    { name: "id", is_nullable: "NO", default_fragment: null },
    { name: "organization_id", is_nullable: "NO", default_fragment: null },
    { name: "project_id", is_nullable: "NO", default_fragment: null },
    { name: "cleanup_type", is_nullable: "NO", default_fragment: null },
    { name: "attempt_count", is_nullable: "NO", default_fragment: "0" },
    { name: "last_error", is_nullable: "YES", default_fragment: null },
    { name: "next_attempt_at", is_nullable: "NO", default_fragment: "now()" },
    { name: "completed_at", is_nullable: "YES", default_fragment: null },
    { name: "created_at", is_nullable: "NO", default_fragment: "now()" },
    { name: "updated_at", is_nullable: "NO", default_fragment: "now()" }
  ] as const;

  for (const expectedColumn of expectedColumns) {
    const actualColumn = columns.get(expectedColumn.name);
    if (actualColumn === undefined || actualColumn.is_nullable !== expectedColumn.is_nullable) {
      return false;
    }

    if (
      expectedColumn.default_fragment !== null &&
      !(actualColumn.column_default ?? "").includes(expectedColumn.default_fragment)
    ) {
      return false;
    }
  }

  const indexRows = await db.query<{ index_name: string; index_definition: string }>(
    `
      SELECT indexname AS index_name, indexdef AS index_definition
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'plan_cleanup_tasks'
    `,
    []
  );
  const indexNames = new Set(indexRows.rows.map((row) => row.index_name));
  const hasUniqueProjectCleanupIndex = indexRows.rows.some(
    (row) =>
      row.index_definition.includes("UNIQUE INDEX") &&
      row.index_definition.includes("(project_id, cleanup_type)")
  );

  return indexNames.has("plan_cleanup_tasks_pending_idx") && hasUniqueProjectCleanupIndex;
}

export async function repairKnownCompatibleMigrationChecksums(input: {
  db: Queryable;
  ledgerTableName: string;
  appliedChecksums: Map<string, string>;
  migrations: readonly {
    id: string;
    description: string;
    checksum: string;
  }[];
}): Promise<void> {
  const migration = input.migrations.find(
    (candidate) => candidate.id === PLAN_CLEANUP_TASKS_MIGRATION_ID
  );
  if (migration === undefined) {
    return;
  }

  const appliedChecksum = input.appliedChecksums.get(migration.id);
  if (
    appliedChecksum === undefined ||
    appliedChecksum === migration.checksum ||
    appliedChecksum !== LEGACY_PLAN_CLEANUP_TASKS_MIGRATION_CHECKSUM
  ) {
    return;
  }

  if (!(await verifyPlanCleanupTasksShape(input.db))) {
    return;
  }

  await input.db.query(
    `
      UPDATE ${input.ledgerTableName}
      SET checksum = $2, description = $3
      WHERE id = $1
    `,
    [migration.id, migration.checksum, migration.description]
  );
  input.appliedChecksums.set(migration.id, migration.checksum);
}
