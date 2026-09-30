import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `CREATE TABLE semantic_analytics_receipt_subjects (
    project_id uuid NOT NULL,
    event_id uuid NOT NULL,
    namespace_revision bigint NOT NULL CHECK (namespace_revision BETWEEN 1 AND 9007199254740991),
    subject_kind text NOT NULL CHECK (subject_kind IN ('anonymous','user','account')),
    subject_ref text NOT NULL CHECK (subject_ref ~ '^sha256:[a-f0-9]{64}$'),
    PRIMARY KEY(project_id,event_id,subject_kind),
    FOREIGN KEY(project_id,event_id)
      REFERENCES semantic_analytics_receipts(project_id,event_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX semantic_analytics_receipt_subjects_lookup_idx
   ON semantic_analytics_receipt_subjects(
     project_id,namespace_revision,subject_kind,subject_ref,event_id)`,
  `INSERT INTO semantic_analytics_receipt_subjects(
     project_id,event_id,namespace_revision,subject_kind,subject_ref)
   SELECT receipt.project_id,receipt.event_id,receipt.namespace_revision,
     subject.subject_kind,subject.subject_ref
   FROM semantic_analytics_receipts receipt
   JOIN analytics_project_identity_contexts context
     ON context.context_id=receipt.identity_context_id
       AND context.project_id=receipt.project_id
       AND context.writer_id=receipt.identity_writer_id
       AND context.producer_epoch=receipt.identity_producer_epoch
       AND context.namespace_revision=receipt.namespace_revision
   CROSS JOIN LATERAL (VALUES
     ('anonymous',context.anonymous_id_hash),
     ('user',context.user_id_hash),
     ('account',context.account_id_hash)
   ) AS subject(subject_kind,subject_ref)
   WHERE receipt.principal='relay' AND receipt.identity_scope IS NOT NULL
     AND subject.subject_ref IS NOT NULL`
] as const;

export const SEMANTIC_ANALYTICS_RECEIPT_SUBJECT_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280019_index_semantic_receipt_subjects",
    description: "Index protected receipt subjects for bounded individual erasure ownership.",
    statements: STATEMENTS
  })
] as const;

export const SEMANTIC_ANALYTICS_RECEIPT_SUBJECT_BOOTSTRAP_STATEMENTS = STATEMENTS.slice(0, 2);
