import type { Pool } from "pg";

/** Synthetic predecessor fixtures start from current empty bootstrap and replay forward migrations. */
export async function removeCurrentOnlySemanticSchemaForPredecessorReplay(
  pool: Pool
): Promise<void> {
  await pool.query("DROP TRIGGER project_object_erasure_enqueue ON projects");
  await pool.query("DROP FUNCTION record_project_object_erasure_task()");
  await pool.query("DROP TABLE project_object_erasure_tasks");
  await pool.query("DROP TABLE semantic_analytics_loss_days");
  await pool.query("DROP TABLE semantic_analytics_funnel_facts");
  await pool.query("DROP TABLE semantic_analytics_portfolio_funnel_facts");
  await pool.query("DROP TABLE analytics_project_identity_revocations");
  await pool.query("DROP TABLE analytics_project_identity_epoch_revocations");
  await pool.query("DROP TABLE semantic_analytics_receipt_subjects");
  await pool.query("DROP TABLE analytics_project_identity_associations");
  await pool.query("DROP TABLE analytics_project_subject_erasures");
  await pool.query("DROP TABLE analytics_project_identity_contexts");
  await pool.query("DROP TABLE analytics_project_identity_namespace_mutations");
  await pool.query("DROP TABLE analytics_project_identity_namespaces");
  await pool.query("DROP TABLE analytics_space_identity_namespace_mutations");
  await pool.query(
    `ALTER TABLE analytics_spaces
     DROP CONSTRAINT analytics_spaces_identity_namespace_check,
     DROP COLUMN namespace_source_project_ids,
     DROP COLUMN namespace_key_fingerprint,
     DROP COLUMN namespace_activated_at,
     DROP COLUMN namespace_revoked_at`
  );
  await pool.query(
    `ALTER TABLE semantic_analytics_receipts
     DROP CONSTRAINT semantic_analytics_receipts_raw_state_check,
     DROP CONSTRAINT semantic_analytics_receipts_identity_context_check,
     DROP CONSTRAINT semantic_analytics_receipts_identity_epoch_check,
     DROP COLUMN identity_context_id,
     DROP COLUMN identity_writer_id,
     DROP COLUMN identity_producer_epoch,
     DROP COLUMN raw_delete_retry_at,
     DROP COLUMN raw_deleted_at,
     DROP COLUMN raw_retention_outcome,
     DROP COLUMN raw_status,
     DROP COLUMN occurred_at`
  );
}
