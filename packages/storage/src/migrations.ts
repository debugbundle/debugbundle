import { STORAGE_BOOTSTRAP_STATEMENTS } from "./storage-bootstrap-statements.js";

export interface Queryable {
  query<Row extends Record<string, unknown>>(
    sql: string,
    params: unknown[]
  ): Promise<{ rows: Row[] }>;
}

export const REQUIRED_API_TABLES = [
  "users",
  "sessions",
  "email_auth_challenges",
  "github_device_authorizations",
  "oauth_identities",
  "organizations",
  "organization_members",
  "projects",
  "project_members",
  "project_invites",
  "project_tokens",
  "member_tokens",
  "audit_logs",
  "probe_activations",
  "capture_policies",
  "capture_rules",
  "services",
  "deployments",
  "improvement_opportunities",
  "improvement_opportunity_events",
  "bundle_generations",
  "weekly_report_channels",
  "github_installations",
  "github_marketplace_accounts",
  "project_github_repos",
  "github_dispatch_rules",
  "github_dispatch_deliveries",
  "incidents",
  "incident_events",
  "alert_rules",
  "slack_destinations",
  "operational_email_deliveries",
  "agent_webhooks",
  "webhook_deliveries",
  "trial_lifecycle_events",
  "plan_cleanup_tasks",
  "processed_billing_events",
  "processed_github_marketplace_events"
] as const;

export const REQUIRED_WORKER_TABLES = [
  "processed_events",
  "capture_rules",
  "services",
  "deployments",
  "improvement_opportunities",
  "improvement_opportunity_events",
  "bundle_generations",
  "weekly_report_channels",
  "github_installations",
  "project_github_repos",
  "github_dispatch_rules",
  "github_dispatch_deliveries",
  "incidents",
  "incident_events",
  "alert_rules",
  "slack_destinations",
  "alert_deliveries",
  "alert_email_digests",
  "alert_email_digest_items",
  "operational_email_deliveries",
  "weekly_report_deliveries",
  "agent_webhooks",
  "webhook_deliveries",
  "trial_lifecycle_events",
] as const;

const LEGACY_SCHEMA_TABLE = "schema_migrations";

export const STORAGE_BOOTSTRAP_SQL = STORAGE_BOOTSTRAP_STATEMENTS.join(";\n\n");

function validateStorageBootstrapStatements(statements: readonly string[]): void {
  if (statements.length === 0) {
    throw new Error("storage_bootstrap_statements_empty");
  }

  const sql = statements.join("\n");
  const forbiddenChecks: Array<{ pattern: RegExp; error: string }> = [
    {
      pattern: /\b(BEGIN|COMMIT|ROLLBACK)\b/i,
      error: "storage_bootstrap_contains_transaction_sql"
    },
    { pattern: /\bALTER\s+TABLE\b/i, error: "storage_bootstrap_contains_schema_evolution_sql" },
    {
      pattern: /\bIF\s+NOT\s+EXISTS\b|\bIF\s+EXISTS\b/i,
      error: "storage_bootstrap_contains_schema_evolution_sql"
    },
    { pattern: /\bschema_migrations\b/i, error: "storage_bootstrap_contains_legacy_schema_table" },
    { pattern: /:legacy-/i, error: "storage_bootstrap_contains_legacy_row_suffix" }
  ];

  for (const statement of statements) {
    if (statement.trim().length === 0) {
      throw new Error("storage_bootstrap_statement_empty");
    }
  }

  for (const check of forbiddenChecks) {
    if (check.pattern.test(sql)) {
      throw new Error(check.error);
    }
  }
}

async function listKnownStorageTables(db: Queryable): Promise<Set<string>> {
  const expectedTables = Array.from(
    new Set([...REQUIRED_API_TABLES, ...REQUIRED_WORKER_TABLES, LEGACY_SCHEMA_TABLE])
  );
  const rows = await db.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [expectedTables]
  );

  return new Set(rows.rows.map((row) => row.table_name));
}

export async function bootstrapStorageSchema(
  db: Queryable
): Promise<{ status: "bootstrapped" | "already_bootstrapped" }> {
  validateStorageBootstrapStatements(STORAGE_BOOTSTRAP_STATEMENTS);

  const existingTables = await listKnownStorageTables(db);
  if (existingTables.has(LEGACY_SCHEMA_TABLE)) {
    throw new Error(
      "storage_bootstrap_legacy_schema_detected: schema_migrations; recreate_database_required"
    );
  }

  const requiredTables = Array.from(new Set([...REQUIRED_API_TABLES, ...REQUIRED_WORKER_TABLES]));
  const existingRequiredTables = requiredTables.filter((tableName) =>
    existingTables.has(tableName)
  );

  if (existingRequiredTables.length === requiredTables.length) {
    return { status: "already_bootstrapped" };
  }

  if (existingRequiredTables.length > 0) {
    const missingTables = requiredTables.filter((tableName) => !existingTables.has(tableName));
    throw new Error(
      `storage_bootstrap_partial_schema_detected: existing=${existingRequiredTables.sort().join(",")}; missing=${missingTables.sort().join(",")}`
    );
  }

  await db.query("BEGIN", []);

  try {
    for (const statement of STORAGE_BOOTSTRAP_STATEMENTS) {
      await db.query(statement, []);
    }

    await db.query("COMMIT", []);
    return { status: "bootstrapped" };
  } catch (error) {
    try {
      await db.query("ROLLBACK", []);
    } catch (rollbackError) {
      const bootstrapError = error instanceof Error ? error.message : String(error);
      const rollbackMessage =
        rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      throw new Error(
        `storage_bootstrap_rollback_failed: bootstrap_error=${bootstrapError}; rollback_error=${rollbackMessage}`
      );
    }

    throw new Error(
      `storage_bootstrap_failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
