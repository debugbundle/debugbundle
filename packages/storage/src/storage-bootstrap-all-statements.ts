import { SELFHOST_PROJECT_ACTOR_ROLE_STATEMENT } from "./selfhost-organization-access-schema.js";
import { REPORT_IDENTITY_BOOTSTRAP } from "./report-identity-schema.js";
import { IMPROVEMENT_REVIEW_BOOTSTRAP } from "./improvement-review-schema.js";
import { IMPROVEMENT_REVIEW_PLANNING_COLUMNS } from "./improvement-review-planning-schema.js";
import {
  REPORT_PRODUCT_MODE_COLUMN,
  REPORT_PRODUCT_GUARD,
  REPORT_PRODUCT_RUN_CONSTRAINT
} from "./report-product-schema.js";
import { REPORT_TRIAL_COLLECTION_BOOTSTRAP } from "./report-trial-collection-schema.js";
import { REFERRAL_BENEFIT_BOOTSTRAP } from "./referral-benefit-schema.js";
import { REPORT_HEALTH_BOOTSTRAP } from "./report-health-schema.js";
import { REPORT_COLLECTOR_BOOTSTRAP } from "./report-collector-schema.js";
import { REPORT_RUN_BOOTSTRAP } from "./report-run-schema.js";
import { REPORT_MODEL_DIAGNOSTIC_COLUMN } from "./report-model-diagnostic-schema.js";
import { REPORT_EMAIL_BOOTSTRAP } from "./report-email-schema.js";
import { REPORT_AVAILABILITY_BOOTSTRAP } from "./report-availability-schema.js";
import { REPORT_SOURCE_TEXT_BOOTSTRAP } from "./report-source-text-schema.js";
import { REPORT_DEFINITION_BOOTSTRAP } from "./report-definition-schema.js";
import { REPORT_LIFECYCLE_BOOTSTRAP } from "./report-lifecycle-schema.js";
import { REFERRAL_RECONCILIATION_BOOTSTRAP } from "./referral-reconciliation-schema.js";
import { REFERRAL_LEDGER_BOOTSTRAP } from "./referral-ledger-schema.js";
import { REFERRAL_BOOTSTRAP } from "./referral-schema.js";
import { ORGANIZATION_MANAGEMENT_BOOTSTRAP } from "./organization-management-schema.js";
import { PROJECT_JOB_AUTHORITY_BOOTSTRAP } from "./project-job-authority-schema.js";
import { ORGANIZATION_CONFIGURATION_GUARD_STATEMENT } from "./organization-configuration-schema.js";
import {
  PROJECT_ACTOR_ROLE_STATEMENT,
  ORGANIZATION_RULE_ACTOR_STATEMENT
} from "./organization-access-schema.js";
import { PROJECT_RULE_SCOPE_STATEMENTS } from "./project-rule-scope-schema.js";
import { PROJECT_ANALYTICS_STATEMENTS } from "./project-analytics-schema.js";
import { PROJECT_WEEKLY_REPORT_BOOTSTRAP } from "./project-weekly-report-schema.js";
import { PROJECT_HEALTH_STATEMENTS } from "./project-health-schema.js";
import { AUTOMATION_SERVICE_STATEMENTS } from "./project-automation-service-schema.js";
import { PROJECT_PROBE_GUARD_STATEMENTS } from "./project-probe-schema.js";
import { SERVICE_OBSERVATION_STATEMENTS } from "./service-observation-schema.js";
import { NOTIFICATION_BOOTSTRAP_STATEMENTS } from "./notification-schema.js";
import { PROJECT_CONSOLIDATION_BOOTSTRAP_STATEMENTS } from "./project-consolidation-schema.js";
import { PROJECT_CREDENTIAL_SCOPE_STATEMENTS } from "./project-credential-scope-schema.js";
import { PROJECT_CONFIGURATION_GUARD_STATEMENTS } from "./project-configuration-guard-schema.js";
import { EVIDENCE_CONTEXT_BOOTSTRAP_STATEMENTS } from "./evidence-context-schema.js";
import { BILLING_CHECKOUT_BOOTSTRAP_STATEMENTS } from "./billing-checkout-schema.js";
import { BILLING_SUBSCRIPTION_OPERATION_BOOTSTRAP_STATEMENTS } from "./billing-subscription-operation-schema.js";
import { PUBLIC_STATUS_BOOTSTRAP_STATEMENTS } from "./public-status-schema.js";
import { ANALYTICS_FLOW_BOOTSTRAP_STATEMENTS } from "./analytics-flow-schema.js";
import { BROWSER_RECOVERY_BOOTSTRAP_STATEMENTS } from "./browser-recovery-schema.js";
import { AVAILABILITY_CHECK_BOOTSTRAP_STATEMENTS } from "./availability-check-bootstrap-statements.js";
import { ANALYTICS_BOOTSTRAP_STATEMENTS } from "./analytics-bootstrap-statements.js";
import { WORKER_JOB_BOOTSTRAP_STATEMENTS } from "./worker-job-schema.js";
import { OPENAI_OAUTH_BOOTSTRAP_STATEMENTS } from "./openai-oauth-bootstrap-statements.js";
import { STORAGE_BOOTSTRAP_STATEMENTS as CORE_STORAGE_BOOTSTRAP_STATEMENTS } from "./storage-bootstrap-statements.js";

export const STORAGE_BOOTSTRAP_STATEMENTS = [
  ...CORE_STORAGE_BOOTSTRAP_STATEMENTS,
  ...ORGANIZATION_MANAGEMENT_BOOTSTRAP,
  ...REFERRAL_BOOTSTRAP,
  ...REFERRAL_LEDGER_BOOTSTRAP,
  ...REFERRAL_RECONCILIATION_BOOTSTRAP,
  ...REPORT_LIFECYCLE_BOOTSTRAP,
  ...REPORT_DEFINITION_BOOTSTRAP.map((statement) =>
    statement.replace(
      "CREATE TABLE report_definitions (",
      `CREATE TABLE report_definitions (${REPORT_PRODUCT_MODE_COLUMN},`
    )
  ),
  ...REPORT_SOURCE_TEXT_BOOTSTRAP,
  ...EVIDENCE_CONTEXT_BOOTSTRAP_STATEMENTS,
  ...BROWSER_RECOVERY_BOOTSTRAP_STATEMENTS,
  ...OPENAI_OAUTH_BOOTSTRAP_STATEMENTS,
  ...AVAILABILITY_CHECK_BOOTSTRAP_STATEMENTS,
  ...REPORT_AVAILABILITY_BOOTSTRAP,
  ...ANALYTICS_BOOTSTRAP_STATEMENTS.map((statement) =>
    statement.replace(
      "CREATE TABLE analytics_bundle_generations (",
      "CREATE TABLE analytics_bundle_generations ( initiating_authority jsonb CHECK (initiating_authority IS NULL OR jsonb_typeof(initiating_authority)='object'),"
    )
  ),
  ...WORKER_JOB_BOOTSTRAP_STATEMENTS,
  ...ANALYTICS_FLOW_BOOTSTRAP_STATEMENTS,
  ...PUBLIC_STATUS_BOOTSTRAP_STATEMENTS,
  ...NOTIFICATION_BOOTSTRAP_STATEMENTS,
  ...BILLING_CHECKOUT_BOOTSTRAP_STATEMENTS,
  ...BILLING_SUBSCRIPTION_OPERATION_BOOTSTRAP_STATEMENTS,
  ...PROJECT_CONSOLIDATION_BOOTSTRAP_STATEMENTS,
  ...PROJECT_CONFIGURATION_GUARD_STATEMENTS,
  ...PROJECT_ANALYTICS_STATEMENTS,
  ...PROJECT_WEEKLY_REPORT_BOOTSTRAP,
  ...PROJECT_CREDENTIAL_SCOPE_STATEMENTS,
  ...SERVICE_OBSERVATION_STATEMENTS,
  ...PROJECT_HEALTH_STATEMENTS,
  ...PROJECT_PROBE_GUARD_STATEMENTS,
  ...PROJECT_RULE_SCOPE_STATEMENTS.map((statement) =>
    statement.replace("o.plan='team'", "o.plan IN ('team','business')")
  ),
  ...AUTOMATION_SERVICE_STATEMENTS,
  PROJECT_ACTOR_ROLE_STATEMENT,
  ORGANIZATION_RULE_ACTOR_STATEMENT,
  ORGANIZATION_CONFIGURATION_GUARD_STATEMENT,
  ...PROJECT_JOB_AUTHORITY_BOOTSTRAP,
  ...REPORT_RUN_BOOTSTRAP.map((statement) =>
    statement
      .replace(
        "CREATE TABLE report_model_attempts (",
        () => `CREATE TABLE report_model_attempts (${REPORT_MODEL_DIAGNOSTIC_COLUMN},`
      )
      .replace(
        "CREATE TABLE report_runs (",
        `CREATE TABLE report_runs (${REPORT_PRODUCT_MODE_COLUMN},${REPORT_PRODUCT_RUN_CONSTRAINT},email_scheduled_at timestamptz,`
      )
  ),
  ...REPORT_EMAIL_BOOTSTRAP,
  ...REPORT_IDENTITY_BOOTSTRAP,
  ...REPORT_COLLECTOR_BOOTSTRAP,
  ...REPORT_HEALTH_BOOTSTRAP,
  ...REFERRAL_BENEFIT_BOOTSTRAP,
  ...REPORT_TRIAL_COLLECTION_BOOTSTRAP,
  REPORT_PRODUCT_GUARD,
  ...IMPROVEMENT_REVIEW_BOOTSTRAP.map((statement) =>
    statement.replace(
      "CREATE TABLE improvement_reviews (",
      `CREATE TABLE improvement_reviews (${IMPROVEMENT_REVIEW_PLANNING_COLUMNS},`
    )
  ),
  SELFHOST_PROJECT_ACTOR_ROLE_STATEMENT
] as const;
