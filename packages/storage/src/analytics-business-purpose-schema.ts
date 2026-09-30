import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `ALTER TABLE analytics_project_plans
   ADD COLUMN IF NOT EXISTS business_measurement_enabled boolean NOT NULL DEFAULT false`,
  `ALTER TABLE analytics_project_plan_revisions
   ADD COLUMN IF NOT EXISTS business_measurement_enabled boolean NOT NULL DEFAULT false`
] as const;

export const ANALYTICS_BUSINESS_PURPOSE_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280009_add_business_measurement_policy",
    description:
      "Require an explicit reviewed project-plan grant for semantic business measurement.",
    statements: STATEMENTS
  })
] as const;
