import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";

// This is independent of the original attempt bootstrap: changing that input
// would change the checksum of the already released run-admission migration.
// Freeze this SQL catalogue as well: future codes need a new forward constraint
// migration, never a changed checksum derived from an evolving runtime allowlist.
export const REPORT_MODEL_DIAGNOSTIC_COLUMN = `diagnostic_code text CONSTRAINT report_model_attempts_diagnostic_code_check CHECK(diagnostic_code IS NULL OR (diagnostic_code IN (
 'report_output_incomplete','report_model_refused','report_unexpected_model_output',
 'report_invalid_model_message','report_invalid_json','report_invalid_narrative',
 'report_untrusted_link','report_numeric_prose','report_unsafe_prose','report_unknown_reference',
 'report_claim_not_supported','report_priority_not_supported','report_priority_missing',
 'report_coverage_missing','report_usage_unavailable','report_provider_outcome_unknown',
 'report_unexpected_billing_profile','report_usage_out_of_bounds','report_diagnostic_unavailable'
 ) OR diagnostic_code ~ '^report_provider_http_[1-5][0-9]{2}$'))`;
const readySql = `EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_model_attempts' AND column_name='diagnostic_code' AND data_type='text' AND is_nullable='YES')
 AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.report_model_attempts') AND conname='report_model_attempts_diagnostic_code_check' AND contype='c' AND convalidated)`;
export const REPORT_MODEL_DIAGNOSTIC_MIGRATION = defineStorageSchemaMigration({
  id: "202611090001_add_report_model_diagnostics",
  description:
    "Retain allowlisted operator diagnostics independently of immutable report model receipts.",
  statements: [
    `ALTER TABLE report_model_attempts ADD COLUMN ${REPORT_MODEL_DIAGNOSTIC_COLUMN}`,
    `DO $$ BEGIN IF NOT (${readySql}) THEN RAISE EXCEPTION 'report_model_diagnostic_schema_incomplete'; END IF; END $$`
  ]
});
export async function reportModelDiagnosticSchemaAvailable(db: Queryable): Promise<boolean> {
  return (
    (await db.query<{ available: boolean }>(`SELECT (${readySql}) AS available`, [])).rows[0]
      ?.available === true
  );
}
