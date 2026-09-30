import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `ALTER TABLE semantic_analytics_receipts
   DROP CONSTRAINT semantic_analytics_receipts_identity_context_check,
   ADD CONSTRAINT semantic_analytics_receipts_identity_context_check CHECK (
     (identity_context_id IS NULL AND identity_writer_id IS NULL)
     OR (identity_context_id IS NOT NULL AND identity_writer_id IS NOT NULL
         AND principal='relay' AND identity_scope IS NOT NULL)
     OR (identity_context_id IS NULL AND identity_writer_id IS NOT NULL
         AND identity_producer_epoch IS NULL AND principal='server_writer'
         AND identity_verification='server_namespace' AND identity_scope IS NOT NULL)
   )`
] as const;

export const SEMANTIC_ANALYTICS_SERVER_IDENTITY_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280025_bind_semantic_server_identity_writer",
    description: "Retain the authenticated server writer for namespace-bound subject facts.",
    statements: STATEMENTS
  })
] as const;
