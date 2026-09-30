import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const STATEMENTS = [
  `ALTER TABLE analytics_spaces
   ADD COLUMN namespace_source_project_ids uuid[],
   ADD COLUMN namespace_key_fingerprint text,
   ADD COLUMN namespace_activated_at timestamptz,
   ADD COLUMN namespace_revoked_at timestamptz,
   ADD CONSTRAINT analytics_spaces_identity_namespace_check CHECK (
     (namespace_revision IS NULL AND namespace_source_project_ids IS NULL
       AND namespace_key_fingerprint IS NULL AND namespace_activated_at IS NULL
       AND namespace_revoked_at IS NULL)
     OR (namespace_revision IS NOT NULL AND namespace_source_project_ids IS NOT NULL
       AND cardinality(namespace_source_project_ids) BETWEEN 1 AND 20
       AND array_position(namespace_source_project_ids,NULL) IS NULL
       AND namespace_key_fingerprint IS NOT NULL
       AND namespace_key_fingerprint ~ '^sha256:[a-f0-9]{64}$'
       AND namespace_activated_at IS NOT NULL
       AND (namespace_revoked_at IS NULL OR namespace_revoked_at>=namespace_activated_at))
   )`,
  `CREATE TABLE analytics_space_identity_namespace_mutations (
     space_id uuid NOT NULL REFERENCES analytics_spaces(id) ON DELETE CASCADE,
     actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     idempotency_key uuid NOT NULL,
     mutation_hash text NOT NULL CHECK (mutation_hash ~ '^[a-f0-9]{64}$'),
     result jsonb NOT NULL CHECK (jsonb_typeof(result)='object' AND octet_length(result::text)<=4096),
     applied_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY(space_id,actor_user_id,idempotency_key)
   )`
] as const;

export const ANALYTICS_SPACE_IDENTITY_NAMESPACE_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280026_bind_analytics_space_identity_namespace",
    description: "Bind connected-space identity key fingerprint and source membership snapshot.",
    statements: STATEMENTS
  })
] as const;

export const ANALYTICS_SPACE_IDENTITY_NAMESPACE_BOOTSTRAP_STATEMENTS = STATEMENTS.filter(
  (statement) => !statement.startsWith("ALTER TABLE")
);
