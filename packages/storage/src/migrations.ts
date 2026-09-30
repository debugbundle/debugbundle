import { STORAGE_BOOTSTRAP_STATEMENTS } from "./storage-bootstrap-all-statements.js";

export interface Queryable {
  query<Row extends Record<string, unknown>>(
    sql: string,
    params: unknown[]
  ): Promise<{ rows: Row[] }>;
}

export const REQUIRED_API_TABLES = [
  "analytics_space_identity_namespace_mutations",
  "analytics_project_identity_namespaces",
  "analytics_project_identity_namespace_mutations",
  "analytics_project_identity_contexts",
  "analytics_project_identity_associations",
  "analytics_project_subject_erasures",
  "analytics_project_identity_revocations",
  "analytics_project_identity_epoch_revocations",
  "semantic_analytics_receipt_subjects",
  "semantic_analytics_funnel_facts",
  "semantic_analytics_portfolio_funnel_facts",
  "analytics_space_report_revisions",
  "project_object_erasure_tasks",
  "semantic_analytics_loss_days",
  "analytics_spaces",
  "analytics_space_projects",
  "analytics_space_revisions",
  "analytics_writer_state",
  "analytics_writers",
  "analytics_writer_mutations",
  "analytics_project_catalogs",
  "analytics_project_catalog_revisions",
  "analytics_project_catalog_entry_revisions",
  "analytics_project_plans",
  "analytics_project_plan_revisions",
  "analytics_project_report_revisions",
  "analytics_space_plans",
  "analytics_space_plan_revisions",
  "semantic_analytics_receipts",
  "semantic_analytics_operations",
  "semantic_analytics_pending_objects",
  "semantic_analytics_catalog_observations",
  "semantic_analytics_producer_observations",
  "semantic_analytics_orphan_sweep_state",
  "users",
  "sessions",
  "email_auth_challenges",
  "account_deletion_challenges",
  "github_device_authorizations",
  "oauth_identities",
  "oauth_authorization_grants",
  "oauth_authorization_codes",
  "oauth_refresh_tokens",
  "oauth_provider_artifacts",
  "organizations",
  "organization_members",
  "projects",
  "project_members",
  "project_invites",
  "project_tokens",
  "member_tokens",
  "agent_tokens",
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
  "browser_recovery_events",
  "alert_rules",
  "alert_delivery_members",
  "slack_destinations",
  "operational_email_deliveries",
  "project_usage_counters",
  "account_analytics_accounts",
  "account_metric_periods",
  "account_metric_events",
  "ingestion_rejection_diagnostic_periods",
  "account_payment_retention_records",
  "account_payment_provider_events",
  "agent_webhooks",
  "webhook_deliveries",
  "trial_lifecycle_events",
  "plan_cleanup_tasks",
  "processed_billing_events",
  "processed_github_marketplace_events",
  "availability_checks",
  "availability_check_results",
  "availability_check_daily_rollups",
  "project_analytics_settings",
  "analytics_ingestion_ledger",
  "analytics_usage_counters",
  "analytics_rollup_uniques",
  "analytics_session_rollups",
  "analytics_route_rollups",
  "analytics_action_rollups",
  "analytics_funnel_definitions",
  "analytics_funnel_rollups",
  "analytics_transition_rollups",
  "analytics_journey_samples",
  "analytics_opportunities",
  "analytics_bundle_generations",
  "analytics_incident_correlations",
  "analytics_incident_session_links"
] as const;

export const REQUIRED_WORKER_TABLES = [
  "analytics_space_identity_namespace_mutations",
  "analytics_project_identity_namespaces",
  "analytics_project_identity_namespace_mutations",
  "analytics_project_identity_contexts",
  "analytics_project_identity_associations",
  "analytics_project_subject_erasures",
  "analytics_project_identity_revocations",
  "analytics_project_identity_epoch_revocations",
  "semantic_analytics_receipt_subjects",
  "semantic_analytics_funnel_facts",
  "semantic_analytics_portfolio_funnel_facts",
  "analytics_space_report_revisions",
  "project_object_erasure_tasks",
  "semantic_analytics_loss_days",
  "analytics_spaces",
  "analytics_space_projects",
  "analytics_space_revisions",
  "analytics_writer_state",
  "analytics_writers",
  "analytics_writer_mutations",
  "analytics_project_catalogs",
  "analytics_project_catalog_revisions",
  "analytics_project_catalog_entry_revisions",
  "analytics_project_plans",
  "analytics_project_plan_revisions",
  "analytics_project_report_revisions",
  "analytics_space_plans",
  "analytics_space_plan_revisions",
  "semantic_analytics_receipts",
  "semantic_analytics_operations",
  "semantic_analytics_pending_objects",
  "semantic_analytics_catalog_observations",
  "semantic_analytics_producer_observations",
  "semantic_analytics_orphan_sweep_state",
  "worker_jobs",
  "processed_events",
  "organizations",
  "oauth_authorization_grants",
  "oauth_authorization_codes",
  "oauth_refresh_tokens",
  "oauth_provider_artifacts",
  "projects",
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
  "browser_recovery_events",
  "alert_rules",
  "slack_destinations",
  "alert_deliveries",
  "alert_delivery_members",
  "alert_email_digests",
  "alert_email_digest_items",
  "operational_email_deliveries",
  "weekly_report_deliveries",
  "agent_webhooks",
  "webhook_deliveries",
  "trial_lifecycle_events",
  "account_analytics_accounts",
  "account_metric_periods",
  "account_metric_events",
  "ingestion_rejection_diagnostic_periods",
  "availability_checks",
  "availability_check_results",
  "availability_check_daily_rollups",
  "project_analytics_settings",
  "analytics_ingestion_ledger",
  "analytics_usage_counters",
  "analytics_rollup_uniques",
  "analytics_session_rollups",
  "analytics_route_rollups",
  "analytics_action_rollups",
  "analytics_funnel_definitions",
  "analytics_funnel_rollups",
  "analytics_transition_rollups",
  "analytics_journey_samples",
  "analytics_opportunities",
  "analytics_bundle_generations",
  "analytics_incident_correlations",
  "analytics_incident_session_links"
] as const;

const LEGACY_SCHEMA_TABLE = "schema_migrations";

export const STORAGE_BOOTSTRAP_SQL = STORAGE_BOOTSTRAP_STATEMENTS.join(";\n\n");

export function validateStorageBootstrapStatements(statements: readonly string[]): void {
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
    // A PL/pgSQL BEGIN inside a newly created trigger function is a code block,
    // not a transaction. Keep checking its surrounding statement for COMMIT etc.
    const checkedSql =
      check.error === "storage_bootstrap_contains_transaction_sql"
        ? statements
            .map((statement) =>
              /^\s*CREATE FUNCTION\b/i.test(statement)
                ? statement.replace(/\$\$[\s\S]*?\$\$/g, "")
                : statement
            )
            .join("\n")
        : sql;
    if (check.pattern.test(checkedSql)) {
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

/** Compose may run this preparatory step on upgrades; only the migrator changes existing schemas. */
export async function prepareStorageBootstrap(
  db: Queryable
): Promise<{ status: "bootstrapped" | "already_bootstrapped" | "existing_schema" }> {
  const tables = await listKnownStorageTables(db);
  const complete = [...REQUIRED_API_TABLES, ...REQUIRED_WORKER_TABLES].every((table) =>
    tables.has(table)
  );
  if (!complete && ["users", "organizations", "projects"].every((table) => tables.has(table)))
    return { status: "existing_schema" };
  return bootstrapStorageSchema(db);
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
