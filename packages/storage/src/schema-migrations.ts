import {
  SELFHOST_ORGANIZATION_ACCESS_MIGRATION,
  selfhostOrganizationAccessSchemaAvailable
} from "./selfhost-organization-access-schema.js";
import {
  REPORT_IDENTITY_MIGRATION,
  reportIdentitySchemaAvailable
} from "./report-identity-schema.js";
import {
  IMPROVEMENT_REVIEW_MIGRATION,
  improvementReviewSchemaAvailable
} from "./improvement-review-schema.js";
import { REPORT_PRODUCT_MIGRATION, reportProductSchemaAvailable } from "./report-product-schema.js";
import {
  REPORT_TRIAL_COLLECTION_MIGRATION,
  reportTrialCollectionSchemaAvailable
} from "./report-trial-collection-schema.js";
import { BUSINESS_TRIAL_MIGRATION, businessTrialSchemaAvailable } from "./business-trial-schema.js";
import {
  REFERRAL_BENEFIT_MIGRATION,
  referralBenefitSchemaAvailable
} from "./referral-benefit-schema.js";
import { REPORT_HEALTH_MIGRATION, reportHealthSchemaAvailable } from "./report-health-schema.js";
import {
  REPORT_COLLECTOR_MIGRATION,
  reportCollectorSchemaAvailable
} from "./report-collector-schema.js";
import { REPORT_RUN_MIGRATION, reportRunSchemaAvailable } from "./report-run-schema.js";
import {
  REPORT_MODEL_DIAGNOSTIC_MIGRATION,
  reportModelDiagnosticSchemaAvailable
} from "./report-model-diagnostic-schema.js";
import { REPORT_EMAIL_MIGRATION, reportEmailSchemaAvailable } from "./report-email-schema.js";
import {
  REPORT_AVAILABILITY_MIGRATION,
  reportAvailabilitySchemaAvailable
} from "./report-availability-schema.js";
import {
  REPORT_SOURCE_TEXT_MIGRATION,
  reportSourceTextSchemaAvailable
} from "./report-source-text-schema.js";
import {
  REPORT_DEFINITION_MIGRATION,
  reportDefinitionSchemaAvailable
} from "./report-definition-schema.js";
import {
  REPORT_LIFECYCLE_MIGRATION,
  reportLifecycleSchemaAvailable
} from "./report-lifecycle-schema.js";
import {
  REFERRAL_RECONCILIATION_MIGRATION,
  referralReconciliationSchemaAvailable
} from "./referral-reconciliation-schema.js";
import {
  REFERRAL_LEDGER_MIGRATION,
  referralLedgerSchemaAvailable
} from "./referral-ledger-schema.js";
import { REFERRAL_MIGRATION, referralSchemaAvailable } from "./referral-schema.js";
import {
  ORGANIZATION_MANAGEMENT_MIGRATION,
  organizationManagementSchemaAvailable
} from "./organization-management-schema.js";
import {
  PROJECT_JOB_AUTHORITY_MIGRATION,
  projectJobAuthoritySchemaAvailable
} from "./project-job-authority-schema.js";
import {
  ORGANIZATION_ACCESS_MIGRATION,
  organizationAccessSchemaAvailable
} from "./organization-access-schema.js";
import {
  MEMBER_TOKEN_POLICY_MIGRATION,
  memberTokenPolicySchemaAvailable
} from "./member-token-policy-schema.js";
import {
  BUSINESS_BILLING_MIGRATION,
  businessBillingSchemaAvailable
} from "./business-billing-schema.js";
import { BILLING_PLAN_CHANGE_MIGRATION } from "./billing-plan-change-schema.js";
import { SERVICE_DEFINITION_MIGRATION } from "./service-definition-schema.js";
import { PROJECT_CONSOLIDATION_MIGRATION } from "./project-consolidation-schema.js";
import { projectServiceSchemaAvailable } from "./project-service-schema-check.js";
import { EVIDENCE_CONTEXT_MIGRATIONS } from "./evidence-context-schema.js";
import { NOTIFICATION_SCHEMA_MIGRATIONS } from "./notification-schema.js";
import { BILLING_CHECKOUT_MIGRATION } from "./billing-checkout-schema.js";
import { BILLING_SUBSCRIPTION_OPERATION_MIGRATION } from "./billing-subscription-operation-schema.js";
import { BILLING_NOTIFICATION_MIGRATION } from "./billing-notification-schema.js";
import { PUBLIC_STATUS_SCHEMA_MIGRATIONS } from "./public-status-schema.js";
import { ANALYTICS_FLOW_SCHEMA_MIGRATIONS } from "./analytics-flow-schema.js";
import { BROWSER_RECOVERY_MIGRATIONS } from "./browser-recovery-schema.js";
import { type Queryable } from "./migrations.js";
import {
  ensureLegacyGitHubDispatchFingerprintCompatibility,
  isCurrentStorageSchemaBaseline,
  repairKnownCompatibleMigrationChecksums
} from "./schema-migration-compatibility.js";
import { AVAILABILITY_CHECK_STORAGE_SCHEMA_MIGRATIONS } from "./availability-check-schema-migrations.js";
import { ANALYTICS_STORAGE_SCHEMA_MIGRATIONS } from "./analytics-schema-migrations.js";
import { OPENAI_OAUTH_STORAGE_SCHEMA_MIGRATIONS } from "./openai-oauth-schema-migrations.js";
import { WORKER_JOB_SCHEMA_MIGRATIONS } from "./worker-job-schema.js";
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
  SERVICE_DEFINITION_MIGRATION,
  PROJECT_CONSOLIDATION_MIGRATION,
  ...EVIDENCE_CONTEXT_MIGRATIONS,
  ...BASE_STORAGE_SCHEMA_MIGRATIONS,
  ...BROWSER_RECOVERY_MIGRATIONS,
  ...AVAILABILITY_CHECK_STORAGE_SCHEMA_MIGRATIONS,
  ...ANALYTICS_STORAGE_SCHEMA_MIGRATIONS,
  ...OPENAI_OAUTH_STORAGE_SCHEMA_MIGRATIONS,
  ...WORKER_JOB_SCHEMA_MIGRATIONS,
  ...ANALYTICS_FLOW_SCHEMA_MIGRATIONS,
  ...PUBLIC_STATUS_SCHEMA_MIGRATIONS,
  ...NOTIFICATION_SCHEMA_MIGRATIONS,
  BILLING_CHECKOUT_MIGRATION,
  BILLING_SUBSCRIPTION_OPERATION_MIGRATION,
  BILLING_NOTIFICATION_MIGRATION,
  BILLING_PLAN_CHANGE_MIGRATION,
  BUSINESS_BILLING_MIGRATION,
  MEMBER_TOKEN_POLICY_MIGRATION,
  ORGANIZATION_ACCESS_MIGRATION,
  ORGANIZATION_MANAGEMENT_MIGRATION,
  PROJECT_JOB_AUTHORITY_MIGRATION,
  REFERRAL_MIGRATION,
  REFERRAL_LEDGER_MIGRATION,
  REFERRAL_RECONCILIATION_MIGRATION,
  REPORT_LIFECYCLE_MIGRATION,
  REPORT_DEFINITION_MIGRATION,
  REPORT_SOURCE_TEXT_MIGRATION,
  REPORT_AVAILABILITY_MIGRATION,
  REPORT_RUN_MIGRATION,
  REPORT_EMAIL_MIGRATION,
  REPORT_COLLECTOR_MIGRATION,
  REPORT_HEALTH_MIGRATION,
  REFERRAL_BENEFIT_MIGRATION,
  BUSINESS_TRIAL_MIGRATION,
  REPORT_TRIAL_COLLECTION_MIGRATION,
  SELFHOST_ORGANIZATION_ACCESS_MIGRATION,
  REPORT_MODEL_DIAGNOSTIC_MIGRATION,
  REPORT_IDENTITY_MIGRATION,
  REPORT_PRODUCT_MIGRATION,
  IMPROVEMENT_REVIEW_MIGRATION
].sort((left, right) => left.id.localeCompare(right.id));

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

  const businessReady = await businessBillingSchemaAvailable(db);
  const tokenPolicyReady = await memberTokenPolicySchemaAvailable(db);
  const orgAccessReady = await organizationAccessSchemaAvailable(db);
  const orgManagementReady = await organizationManagementSchemaAvailable(db);
  const projectAuthorityReady = await projectJobAuthoritySchemaAvailable(db);
  const referralsReady = await referralSchemaAvailable(db);
  const referralLedgerReady = await referralLedgerSchemaAvailable(db);
  const referralReconciliationReady = await referralReconciliationSchemaAvailable(db);
  const reportLifecycleReady = await reportLifecycleSchemaAvailable(db);
  const reportDefinitionReady = await reportDefinitionSchemaAvailable(db);
  const reportSourceTextReady = await reportSourceTextSchemaAvailable(db);
  const reportAvailabilityReady = await reportAvailabilitySchemaAvailable(db);
  const reportRunReady = await reportRunSchemaAvailable(db);
  const referralBenefitReady = await referralBenefitSchemaAvailable(db);
  const reportHealthReady = await reportHealthSchemaAvailable(db);
  const reportCollectorReady = await reportCollectorSchemaAvailable(db);
  const reportEmailReady = await reportEmailSchemaAvailable(db);
  const businessTrialReady = await businessTrialSchemaAvailable(db);
  const selfhostOrganizationAccessReady = await selfhostOrganizationAccessSchemaAvailable(db);
  const reportTrialCollectionReady = await reportTrialCollectionSchemaAvailable(db);
  const reportModelDiagnosticReady = await reportModelDiagnosticSchemaAvailable(db);
  const reportIdentityReady = await reportIdentitySchemaAvailable(db);
  const reportProductReady = await reportProductSchemaAvailable(db);
  const improvementReviewReady = await improvementReviewSchemaAvailable(db);
  const verifiedBaseline = STORAGE_SCHEMA_MIGRATIONS.filter(
    (migration) =>
      (migration.id !== REPORT_IDENTITY_MIGRATION.id || reportIdentityReady) &&
      (migration.id !== REPORT_PRODUCT_MIGRATION.id || reportProductReady) &&
      (migration.id !== IMPROVEMENT_REVIEW_MIGRATION.id || improvementReviewReady) &&
      (migration.id !== BUSINESS_BILLING_MIGRATION.id || businessReady) &&
      (migration.id !== MEMBER_TOKEN_POLICY_MIGRATION.id || tokenPolicyReady) &&
      (migration.id !== ORGANIZATION_ACCESS_MIGRATION.id || orgAccessReady) &&
      (migration.id !== ORGANIZATION_MANAGEMENT_MIGRATION.id || orgManagementReady) &&
      (migration.id !== PROJECT_JOB_AUTHORITY_MIGRATION.id || projectAuthorityReady) &&
      (migration.id !== REFERRAL_MIGRATION.id || referralsReady) &&
      (migration.id !== REFERRAL_LEDGER_MIGRATION.id || referralLedgerReady) &&
      (migration.id !== REFERRAL_RECONCILIATION_MIGRATION.id || referralReconciliationReady) &&
      (migration.id !== REPORT_LIFECYCLE_MIGRATION.id || reportLifecycleReady) &&
      (migration.id !== REPORT_DEFINITION_MIGRATION.id || reportDefinitionReady) &&
      (migration.id !== REPORT_SOURCE_TEXT_MIGRATION.id || reportSourceTextReady) &&
      (migration.id !== REPORT_AVAILABILITY_MIGRATION.id || reportAvailabilityReady) &&
      (migration.id !== REPORT_RUN_MIGRATION.id || reportRunReady) &&
      (migration.id !== REPORT_EMAIL_MIGRATION.id || reportEmailReady) &&
      (migration.id !== REPORT_COLLECTOR_MIGRATION.id || reportCollectorReady) &&
      (migration.id !== REPORT_HEALTH_MIGRATION.id || reportHealthReady) &&
      (migration.id !== REFERRAL_BENEFIT_MIGRATION.id || referralBenefitReady) &&
      (migration.id !== BUSINESS_TRIAL_MIGRATION.id || businessTrialReady) &&
      (migration.id !== REPORT_TRIAL_COLLECTION_MIGRATION.id || reportTrialCollectionReady) &&
      (migration.id !== REPORT_MODEL_DIAGNOSTIC_MIGRATION.id || reportModelDiagnosticReady) &&
      (migration.id !== SELFHOST_ORGANIZATION_ACCESS_MIGRATION.id ||
        selfhostOrganizationAccessReady)
  );
  await recordAppliedMigrations(db, verifiedBaseline);
  appliedChecksums.clear();
  for (const migration of verifiedBaseline) {
    appliedChecksums.set(migration.id, migration.checksum);
  }
  return verifiedBaseline.length === STORAGE_SCHEMA_MIGRATIONS.length
    ? "seeded_current_schema"
    : "already_present";
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
  if (!(await projectServiceSchemaAvailable(db)))
    throw new Error("project_service_schema_incomplete");
  if (!(await referralSchemaAvailable(db))) throw new Error("referral_schema_incomplete");
  if (!(await referralLedgerSchemaAvailable(db)))
    throw new Error("referral_ledger_schema_incomplete");
  if (!(await referralReconciliationSchemaAvailable(db)))
    throw new Error("referral_reconciliation_schema_incomplete");
  if (!(await reportLifecycleSchemaAvailable(db)))
    throw new Error("report_lifecycle_schema_incomplete");
  if (!(await reportDefinitionSchemaAvailable(db)))
    throw new Error("report_definition_schema_incomplete");
  if (!(await reportSourceTextSchemaAvailable(db)))
    throw new Error("report_source_text_schema_incomplete");
  if (!(await reportAvailabilitySchemaAvailable(db)))
    throw new Error("report_availability_schema_incomplete");
  if (!(await reportRunSchemaAvailable(db))) throw new Error("report_run_schema_incomplete");
  if (!(await reportModelDiagnosticSchemaAvailable(db)))
    throw new Error("report_model_diagnostic_schema_incomplete");
  if (!(await reportIdentitySchemaAvailable(db)))
    throw new Error("report_identity_schema_incomplete");
  if (!(await reportProductSchemaAvailable(db)))
    throw new Error("report_product_schema_incomplete");
  if (!(await improvementReviewSchemaAvailable(db)))
    throw new Error("improvement_review_schema_incomplete");
  if (!(await referralBenefitSchemaAvailable(db)))
    throw new Error("referral_benefit_schema_incomplete");
  if (!(await reportHealthSchemaAvailable(db))) throw new Error("report_health_schema_incomplete");
  if (!(await reportCollectorSchemaAvailable(db)))
    throw new Error("report_collector_schema_incomplete");
  if (!(await reportEmailSchemaAvailable(db))) throw new Error("report_email_schema_incomplete");
  if (!(await businessTrialSchemaAvailable(db)))
    throw new Error("business_trial_schema_incomplete");
  if (!(await reportTrialCollectionSchemaAvailable(db)))
    throw new Error("report_trial_collection_schema_incomplete");
  if (!(await selfhostOrganizationAccessSchemaAvailable(db)))
    throw new Error("selfhost_organization_access_schema_incomplete");
}
