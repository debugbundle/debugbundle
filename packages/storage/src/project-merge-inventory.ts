import type { Queryable } from "./types.js";
import { PROJECT_SCOPED_RULE_TABLES } from "./project-rule-scope-schema.js";

/** Every table needs an explicit disposition before consolidation can use it. */
export const PROJECT_MERGE_TABLE_DISPOSITIONS = {
  operation_journal: [
    "project_merge_operations",
    "project_merge_participants",
    "project_legacy_bindings"
  ],
  canonical_owner: ["projects", "service_definitions"],
  service_lineage: ["service_input_aliases", "service_project_aliases"],
  scoped_credentials: ["project_tokens", "agent_tokens"],
  current_access: ["project_members", "project_invites"],
  compatible_policy: ["capture_policies", "project_analytics_settings", "notification_preferences"],
  repository_context: ["project_github_repos"],
  equivalent_schedule: ["weekly_report_channels", "weekly_report_channel_aliases"],
  fixed_public_selection: [
    "public_status_pages",
    "public_status_page_projects",
    "public_status_page_checks"
  ],
  retained_origin: [
    "services",
    "incidents",
    "incident_events",
    "deployments",
    "bundle_generations",
    "improvement_opportunities",
    "improvement_opportunity_events",
    "processed_events",
    "browser_recovery_events",
    "evidence_context_events",
    "evidence_ingestion_receipts",
    "agent_webhooks",
    "webhook_deliveries",
    "alert_rules",
    "alert_deliveries",
    "alert_delivery_members",
    "alert_email_digests",
    "alert_email_digest_items",
    "capture_rules",
    "probe_activations",
    "github_dispatch_rules",
    "github_dispatch_deliveries",
    "weekly_report_deliveries",
    "notification_daily_batches",
    "notification_daily_items",
    "notification_daily_allowance_usage",
    "operational_email_deliveries",
    "worker_jobs",
    "project_usage_counters",
    "plan_cleanup_tasks",
    "availability_checks",
    "availability_check_results",
    "availability_check_daily_rollups",
    "analytics_action_rollups",
    "analytics_bundle_generations",
    "analytics_flow_definitions",
    "analytics_flow_handoffs",
    "analytics_flow_rollups",
    "analytics_flow_runs",
    "analytics_funnel_definitions",
    "analytics_funnel_rollups",
    "analytics_incident_correlations",
    "analytics_incident_session_links",
    "analytics_ingestion_ledger",
    "analytics_journey_samples",
    "analytics_opportunities",
    "analytics_rollup_uniques",
    "analytics_route_rollups",
    "analytics_session_rollups",
    "analytics_transition_rollups",
    "analytics_visitor_first_seen"
  ],
  unchanged_account: [
    "account_analytics_accounts",
    "account_deletion_challenges",
    "account_metric_events",
    "account_metric_periods",
    "account_payment_provider_events",
    "account_payment_retention_records",
    "analytics_usage_claims",
    "analytics_usage_counters",
    "audit_logs",
    "billing_checkout_attempts",
    "billing_subscription_operations",
    "email_auth_challenges",
    "github_device_authorizations",
    "github_installations",
    "github_marketplace_accounts",
    "ingestion_rejection_diagnostic_periods",
    "member_tokens",
    "oauth_authorization_codes",
    "oauth_authorization_grants",
    "oauth_identities",
    "oauth_provider_artifacts",
    "oauth_refresh_tokens",
    "org_usage_counters",
    "organization_members",
    "organizations",
    "processed_billing_events",
    "processed_github_marketplace_events",
    "sessions",
    "slack_destinations",
    "trial_lifecycle_events",
    "users",
    "storage_migration_ledger"
  ]
} as const;

export type ProjectMergeTableDisposition = keyof typeof PROJECT_MERGE_TABLE_DISPOSITIONS;
export interface ProjectMergeDependency {
  table: string;
  disposition: ProjectMergeTableDisposition | null;
  project_columns: string[];
}
export interface ProjectMergeInventory {
  complete: boolean;
  dependencies: ProjectMergeDependency[];
  blockers: string[];
  object_prefixes: readonly string[];
}
const originTables = new Set<string>([
  ...PROJECT_MERGE_TABLE_DISPOSITIONS.scoped_credentials,
  ...PROJECT_MERGE_TABLE_DISPOSITIONS.current_access,
  ...PROJECT_MERGE_TABLE_DISPOSITIONS.compatible_policy,
  ...PROJECT_MERGE_TABLE_DISPOSITIONS.repository_context,
  ...PROJECT_MERGE_TABLE_DISPOSITIONS.equivalent_schedule,
  ...PROJECT_MERGE_TABLE_DISPOSITIONS.fixed_public_selection,
  ...PROJECT_MERGE_TABLE_DISPOSITIONS.retained_origin
]);

// Immutable object keys retain their original project namespace. Canonical
// deletion/retention must enumerate all origins before touching these prefixes.
export const PROJECT_MERGE_OBJECT_PREFIXES = [
  "raw-events",
  "bundles",
  "improvement-bundles",
  "reproductions",
  "analytics-events",
  "analytics-journeys",
  "analytics-bundles"
] as const;

export async function inspectProjectMergeInventory(db: Queryable): Promise<ProjectMergeInventory> {
  const columns = await db.query<{ table_name: string; project_columns: string[] }>(
    `SELECT t.relname::text AS table_name,COALESCE(array_agg(a.attname::text ORDER BY a.attname::text)
      FILTER (WHERE a.attname ~ '(^|_)project_id(_text)?$' OR EXISTS (
        SELECT 1 FROM pg_constraint fk WHERE fk.conrelid=t.oid AND fk.contype='f'
          AND fk.confrelid='projects'::regclass AND a.attnum=ANY(fk.conkey)
      )),ARRAY[]::text[]) AS project_columns
     FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
     JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped
     WHERE n.nspname='public' AND t.relkind IN ('r','p','v','m')
     GROUP BY t.oid,t.relname ORDER BY t.relname`,
    []
  );
  const dispositions = new Map<string, ProjectMergeTableDisposition>();
  for (const [disposition, tables] of Object.entries(PROJECT_MERGE_TABLE_DISPOSITIONS)) {
    for (const table of tables)
      dispositions.set(table, disposition as ProjectMergeTableDisposition);
  }
  const blockers: string[] = [];
  const dependencies = columns.rows.map((row): ProjectMergeDependency => {
    const disposition = dispositions.get(row.table_name) ?? null;
    if (disposition === null) blockers.push(`unclassified_table:${row.table_name}`);
    for (const column of row.project_columns) {
      const known =
        (row.table_name === "service_project_aliases" && column === "project_id") ||
        (row.table_name === "service_input_aliases" && column === "origin_project_id") ||
        (row.table_name === "project_merge_operations" && column === "target_project_id") ||
        (row.table_name === "project_merge_participants" && column === "project_id") ||
        (row.table_name === "project_legacy_bindings" &&
          ["legacy_project_id", "canonical_project_id"].includes(column)) ||
        (column === "project_id" && originTables.has(row.table_name)) ||
        ((PROJECT_SCOPED_RULE_TABLES as readonly string[]).includes(row.table_name) &&
          column === "filter_project_id") ||
        (row.table_name === "public_status_pages" && column === "anchor_project_id") ||
        (row.table_name === "service_definitions" &&
          ["project_id", "origin_project_id", "repository_default_project_id"].includes(column)) ||
        (row.table_name === "ingestion_rejection_diagnostic_periods" &&
          column === "project_id_text");
      if (!known) blockers.push(`unclassified_project_column:${row.table_name}.${column}`);
    }
    return { table: row.table_name, disposition, project_columns: row.project_columns };
  });
  for (const table of dispositions.keys()) {
    if (!dependencies.some((entry) => entry.table === table))
      blockers.push(`missing_table:${table}`);
  }
  return {
    complete: blockers.length === 0,
    dependencies,
    blockers: blockers.sort(),
    object_prefixes: PROJECT_MERGE_OBJECT_PREFIXES
  };
}
