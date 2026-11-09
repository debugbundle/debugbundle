import type { Pool } from "pg";
import predecessor from "../fixtures/project-service-predecessor.json" with { type: "json" };

export const PROJECT_SERVICE_MIGRATION_IDS = [
  "202611030001_add_service_definitions",
  "202611030002_add_project_consolidation"
];

// The immutable predecessor predates both project consolidation and Business.
export const POST_PREDECESSOR_MIGRATION_IDS = [
  ...PROJECT_SERVICE_MIGRATION_IDS,
  "202611070001_add_business_billing_foundation",
  "202611070002_add_member_token_scope_policy",
  "202611070003_add_organization_project_grants",
  "202611070004_add_organization_management",
  "202611070005_bind_project_job_initiators",
  "202611070006_add_referral_attribution",
  "202611070007_add_referral_commission_ledger",
  "202611070008_add_referral_reconciliation_outbox",
  "202611070009_add_report_lifecycle_facts",
  "202611070010_add_smart_report_definitions",
  "202611070011_add_report_source_text",
  "202611070012_add_report_availability_history",
  "202611070013_add_report_run_admission",
  "202611070014_add_report_email_delivery",
  "202611070015_add_report_collection_progress",
  "202611070016_add_report_health_recovery_facts",
  "202611070017_add_referral_invoice_benefit",
  "202611080001_add_business_trial_plan",
  "202611080002_guard_report_trial_collection",
  "202611080003_unlock_selfhost_organization_access"
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
