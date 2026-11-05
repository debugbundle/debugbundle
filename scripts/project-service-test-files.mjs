// Only these database-only rehearsals run in the unit qualification container.
// General integration tests also require Redis/S3 and retain their separate lane.
export const PROJECT_SERVICE_TEST_FILES = [
  "tests/integration/alert-scope-projection.integration.test.ts",
  "tests/integration/project-merge-interfaces.integration.test.ts",
  "tests/integration/project-services.integration.test.ts",
  "tests/integration/project-origin-scopes.integration.test.ts",
  "tests/integration/project-merge-operations.integration.test.ts",
  "tests/integration/project-consolidated-reads.integration.test.ts",
  "tests/integration/project-probe-scopes.integration.test.ts",
  "tests/integration/project-capture-rule-scopes.integration.test.ts",
  "tests/integration/project-automation-scopes.integration.test.ts",
  "tests/integration/project-notification-scopes.integration.test.ts",
  "tests/integration/project-weekly-report-scopes.integration.test.ts",
  "tests/integration/project-health-scopes.integration.test.ts",
  "tests/integration/project-lifecycle-scopes.integration.test.ts",
  "tests/integration/project-analytics-scopes.integration.test.ts"
];
