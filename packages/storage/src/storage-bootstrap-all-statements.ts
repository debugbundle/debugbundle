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
  ...EVIDENCE_CONTEXT_BOOTSTRAP_STATEMENTS,
  ...BROWSER_RECOVERY_BOOTSTRAP_STATEMENTS,
  ...OPENAI_OAUTH_BOOTSTRAP_STATEMENTS,
  ...AVAILABILITY_CHECK_BOOTSTRAP_STATEMENTS,
  ...ANALYTICS_BOOTSTRAP_STATEMENTS,
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
  ...PROJECT_RULE_SCOPE_STATEMENTS,
  ...AUTOMATION_SERVICE_STATEMENTS
] as const;
