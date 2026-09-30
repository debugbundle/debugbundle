import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `CREATE TABLE analytics_project_identity_epoch_revocations (
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    writer_id uuid NOT NULL,
    producer_epoch uuid NOT NULL,
    revoked_at timestamptz NOT NULL,
    PRIMARY KEY(project_id,writer_id,producer_epoch)
  )`,
  `INSERT INTO analytics_project_identity_epoch_revocations(
     project_id,writer_id,producer_epoch,revoked_at)
   SELECT project_id,writer_id,producer_epoch,min(revoked_at)
   FROM analytics_project_identity_revocations
   GROUP BY project_id,writer_id,producer_epoch`,
  `ALTER TABLE semantic_analytics_receipts ADD COLUMN identity_producer_epoch uuid`,
  `UPDATE semantic_analytics_receipts receipt
   SET identity_producer_epoch=source.producer_epoch
   FROM (
     SELECT context_id,project_id,writer_id,producer_epoch
     FROM analytics_project_identity_contexts
     UNION
     SELECT context_id,project_id,writer_id,producer_epoch
     FROM analytics_project_identity_revocations
   ) source
   WHERE receipt.project_id=source.project_id
     AND receipt.identity_context_id=source.context_id
     AND receipt.identity_writer_id=source.writer_id`,
  `ALTER TABLE semantic_analytics_receipts
   ADD CONSTRAINT semantic_analytics_receipts_identity_epoch_check CHECK (
     identity_producer_epoch IS NULL OR
     (identity_context_id IS NOT NULL AND identity_writer_id IS NOT NULL)
   )`
] as const;

export const ANALYTICS_IDENTITY_EPOCH_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280018_fence_analytics_identity_producer_epochs",
    description: "Fence revoked relay producer epochs and retain receipt epoch provenance.",
    statements: STATEMENTS
  })
] as const;

export const ANALYTICS_IDENTITY_EPOCH_BOOTSTRAP_STATEMENTS = STATEMENTS.slice(0, 1);
