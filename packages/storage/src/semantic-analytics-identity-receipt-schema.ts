import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `ALTER TABLE semantic_analytics_receipts
   ADD COLUMN identity_context_id uuid,
   ADD COLUMN identity_writer_id uuid,
   ADD CONSTRAINT semantic_analytics_receipts_identity_context_check CHECK (
     (identity_context_id IS NULL AND identity_writer_id IS NULL)
     OR (identity_context_id IS NOT NULL AND identity_writer_id IS NOT NULL
         AND principal='relay' AND identity_scope IS NOT NULL)
   )`,
  `CREATE INDEX semantic_analytics_receipts_identity_context_idx
   ON semantic_analytics_receipts(project_id,identity_context_id)
   WHERE identity_context_id IS NOT NULL`
] as const;

export const SEMANTIC_ANALYTICS_IDENTITY_RECEIPT_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280017_add_semantic_identity_receipt_provenance",
    description: "Retain immutable relay context and writer IDs beyond context expiry.",
    statements: STATEMENTS
  })
] as const;

export const SEMANTIC_ANALYTICS_IDENTITY_RECEIPT_BOOTSTRAP_STATEMENTS = STATEMENTS.slice(1);
