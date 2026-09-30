import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

// Existing candidate receipts predate an occurrence column. Their acceptance time is a
// conservative backfill anchor: it cannot expire their raw object before acceptance.
const STATEMENTS = [
  `ALTER TABLE semantic_analytics_receipts ADD COLUMN occurred_at timestamptz`,
  `UPDATE semantic_analytics_receipts SET occurred_at=accepted_at WHERE occurred_at IS NULL`,
  `ALTER TABLE semantic_analytics_receipts ALTER COLUMN occurred_at SET NOT NULL`,
  `ALTER TABLE semantic_analytics_receipts ADD COLUMN raw_status text NOT NULL DEFAULT 'active'
    CHECK (raw_status IN ('active','deleting','deleted'))`,
  `ALTER TABLE semantic_analytics_receipts ADD COLUMN raw_retention_outcome text
    CHECK (raw_retention_outcome IS NULL OR raw_retention_outcome IN ('job_completed','lost'))`,
  `ALTER TABLE semantic_analytics_receipts ADD COLUMN raw_deleted_at timestamptz`,
  `ALTER TABLE semantic_analytics_receipts ADD COLUMN raw_delete_retry_at timestamptz`,
  `ALTER TABLE semantic_analytics_receipts ADD CONSTRAINT semantic_analytics_receipts_raw_state_check
    CHECK ((raw_status='active' AND raw_retention_outcome IS NULL AND raw_deleted_at IS NULL AND raw_delete_retry_at IS NULL)
      OR (raw_status='deleting' AND raw_retention_outcome IS NOT NULL AND raw_deleted_at IS NULL)
      OR (raw_status='deleted' AND raw_retention_outcome IS NOT NULL AND raw_deleted_at IS NOT NULL AND raw_delete_retry_at IS NULL))`,
  `CREATE INDEX semantic_analytics_receipts_raw_retention_idx
    ON semantic_analytics_receipts(accepted_at,project_id,event_id)
    WHERE raw_status='active'`,
  `CREATE INDEX semantic_analytics_receipts_raw_deleting_idx
    ON semantic_analytics_receipts(accepted_at,project_id,event_id)
    WHERE raw_status='deleting'`,
  `CREATE INDEX semantic_analytics_receipts_prune_idx
    ON semantic_analytics_receipts(expires_at,project_id,event_id)
    WHERE raw_status='deleted'`
] as const;

export const SEMANTIC_ANALYTICS_RAW_RETENTION_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280010_add_semantic_raw_retention_state",
    description: "Track accepted semantic raw-object expiry separately from transport receipts.",
    statements: STATEMENTS
  })
] as const;

export const SEMANTIC_ANALYTICS_RAW_RETENTION_BOOTSTRAP_STATEMENTS = STATEMENTS.slice(-3);
