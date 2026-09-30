import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `ALTER TABLE semantic_analytics_receipts
   DROP CONSTRAINT semantic_analytics_receipts_raw_retention_outcome_check`,
  `ALTER TABLE semantic_analytics_receipts
   ADD CONSTRAINT semantic_analytics_receipts_raw_retention_outcome_check
   CHECK (raw_retention_outcome IS NULL OR
     raw_retention_outcome IN ('job_completed','lost','erased'))`
] as const;

export const ANALYTICS_SUBJECT_ERASURE_OUTCOME_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280022_add_subject_erasure_raw_outcome",
    description: "Distinguish deliberate subject erasure from lost semantic raw evidence.",
    statements: STATEMENTS
  })
] as const;

export const ANALYTICS_SUBJECT_ERASURE_OUTCOME_BOOTSTRAP_STATEMENTS: readonly string[] = [];
