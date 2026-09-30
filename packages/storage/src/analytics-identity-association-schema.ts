import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `CREATE TABLE analytics_project_identity_associations (
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    context_id uuid NOT NULL,
    writer_id uuid NOT NULL,
    namespace_revision bigint NOT NULL CHECK (namespace_revision BETWEEN 1 AND 9007199254740991),
    producer_epoch uuid NOT NULL,
    anonymous_id_hash text NOT NULL CHECK (anonymous_id_hash ~ '^sha256:[a-f0-9]{64}$'),
    user_id_hash text NOT NULL CHECK (user_id_hash ~ '^sha256:[a-f0-9]{64}$'),
    account_id_hash text CHECK (account_id_hash IS NULL OR account_id_hash ~ '^sha256:[a-f0-9]{64}$'),
    associated_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL CHECK (expires_at=associated_at+interval '90 days'),
    PRIMARY KEY(project_id,context_id)
  )`,
  `CREATE INDEX analytics_project_identity_associations_user_idx
   ON analytics_project_identity_associations(
     project_id,namespace_revision,user_id_hash,anonymous_id_hash)`,
  `CREATE INDEX analytics_project_identity_associations_account_idx
   ON analytics_project_identity_associations(
     project_id,namespace_revision,account_id_hash,anonymous_id_hash)
   WHERE account_id_hash IS NOT NULL`,
  `CREATE INDEX analytics_project_identity_associations_expiry_idx
   ON analytics_project_identity_associations(expires_at,project_id,context_id)`,
  `INSERT INTO analytics_project_identity_associations(
     project_id,context_id,writer_id,namespace_revision,producer_epoch,
     anonymous_id_hash,user_id_hash,account_id_hash,associated_at,expires_at)
   SELECT project_id,context_id,writer_id,namespace_revision,producer_epoch,
     anonymous_id_hash,user_id_hash,account_id_hash,
     associated_at,associated_at+interval '90 days'
   FROM analytics_project_identity_contexts
   WHERE associated_at IS NOT NULL AND user_id_hash IS NOT NULL
     AND associated_at+interval '90 days'>now()`
] as const;

export const ANALYTICS_IDENTITY_ASSOCIATION_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280020_retain_analytics_identity_associations",
    description: "Retain protected anonymous-to-known erasure links after context expiry.",
    statements: STATEMENTS
  })
] as const;

export const ANALYTICS_IDENTITY_ASSOCIATION_BOOTSTRAP_STATEMENTS = STATEMENTS.slice(0, 4);
