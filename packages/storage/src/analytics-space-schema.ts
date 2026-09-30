import { defineStorageSchemaMigration } from "./schema-migration-definition.js";

const ANALYTICS_SPACE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS analytics_spaces (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
    mode text NOT NULL CHECK (mode IN ('portfolio', 'connected')),
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    namespace_revision bigint CHECK (namespace_revision BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz,
    UNIQUE (id, organization_id)
  )`,
  `CREATE INDEX IF NOT EXISTS analytics_spaces_organization_idx ON analytics_spaces(organization_id, id)`,
  `CREATE TABLE IF NOT EXISTS analytics_space_projects (
    project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    space_id uuid NOT NULL REFERENCES analytics_spaces(id) ON DELETE CASCADE,
    joined_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS analytics_space_projects_space_idx ON analytics_space_projects(space_id, project_id)`,
  `CREATE TABLE IF NOT EXISTS analytics_space_revisions (
    space_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    mutation_scope text NOT NULL,
    idempotency_key uuid NOT NULL,
    mutation_hash text CHECK (mutation_hash ~ '^[a-f0-9]{64}$'),
    display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
    mode text NOT NULL CHECK (mode IN ('portfolio', 'connected')),
    archived boolean NOT NULL DEFAULT false,
    project_ids uuid[] NOT NULL CHECK (cardinality(project_ids) BETWEEN 1 AND 20 OR (archived AND cardinality(project_ids) = 0)),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (space_id, revision),
    UNIQUE (organization_id, actor_user_id, mutation_scope, idempotency_key),
    FOREIGN KEY (space_id, organization_id) REFERENCES analytics_spaces(id, organization_id) ON DELETE CASCADE
  )`,
  `CREATE OR REPLACE FUNCTION analytics_space_validate_project() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE project_org uuid; space_org uuid; is_archived boolean; member_count integer;
    BEGIN
      SELECT organization_id INTO project_org FROM projects WHERE id = NEW.project_id FOR KEY SHARE;
      SELECT organization_id, archived_at IS NOT NULL INTO space_org, is_archived
        FROM analytics_spaces WHERE id = NEW.space_id FOR UPDATE;
      IF project_org IS NULL OR space_org IS NULL OR project_org <> space_org THEN
        RAISE EXCEPTION 'space_project_organization_mismatch' USING ERRCODE = '23514';
      END IF;
      IF is_archived THEN RAISE EXCEPTION 'space_archived' USING ERRCODE = '23514'; END IF;
      SELECT count(*) INTO member_count FROM analytics_space_projects WHERE space_id = NEW.space_id AND project_id <> NEW.project_id;
      IF member_count >= 20 THEN RAISE EXCEPTION 'space_membership_capacity' USING ERRCODE = '23514'; END IF;
      RETURN NEW;
    END $$`,
  `DROP TRIGGER IF EXISTS analytics_space_project_validate ON analytics_space_projects`,
  `CREATE TRIGGER analytics_space_project_validate BEFORE INSERT OR UPDATE ON analytics_space_projects
    FOR EACH ROW EXECUTE FUNCTION analytics_space_validate_project()`,
  `CREATE OR REPLACE FUNCTION analytics_space_fence_project_delete() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE linked_space uuid; remaining uuid[]; updated analytics_spaces%ROWTYPE;
    BEGIN
      SELECT space_id INTO linked_space FROM analytics_space_projects WHERE project_id = OLD.id;
      IF linked_space IS NULL THEN RETURN OLD; END IF;
      PERFORM id FROM analytics_spaces WHERE id = linked_space FOR UPDATE;
      SELECT COALESCE(array_agg(project_id ORDER BY project_id), '{}'::uuid[]) INTO remaining
        FROM analytics_space_projects WHERE space_id = linked_space AND project_id <> OLD.id;
      UPDATE analytics_spaces SET revision = revision + 1, updated_at = now(),
        archived_at = CASE WHEN cardinality(remaining) = 0 THEN now() ELSE archived_at END
        WHERE id = linked_space RETURNING * INTO updated;
      IF NOT FOUND THEN RETURN OLD; END IF;
      INSERT INTO analytics_space_revisions(space_id,organization_id,revision,actor_user_id,mutation_scope,
        idempotency_key,mutation_hash,display_name,mode,archived,project_ids)
        VALUES(updated.id,updated.organization_id,updated.revision,NULL,'project_delete',gen_random_uuid(),NULL,
          updated.display_name,updated.mode,updated.archived_at IS NOT NULL,remaining);
      RETURN OLD;
    END $$`,
  `DROP TRIGGER IF EXISTS analytics_space_project_deleted ON projects`,
  `CREATE TRIGGER analytics_space_project_deleted BEFORE DELETE ON projects
    FOR EACH ROW EXECUTE FUNCTION analytics_space_fence_project_delete()`,
  `CREATE OR REPLACE FUNCTION analytics_space_guard_project_owner() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.organization_id IS DISTINCT FROM OLD.organization_id AND EXISTS (
        SELECT 1 FROM analytics_space_projects sp JOIN analytics_spaces s ON s.id=sp.space_id
        WHERE sp.project_id=OLD.id AND s.organization_id IS DISTINCT FROM NEW.organization_id
      ) THEN RAISE EXCEPTION 'space_project_organization_mismatch' USING ERRCODE = '23514'; END IF;
      RETURN NEW;
    END $$`,
  `DROP TRIGGER IF EXISTS analytics_space_project_organization ON projects`,
  `CREATE TRIGGER analytics_space_project_organization BEFORE UPDATE OF organization_id ON projects
    FOR EACH ROW EXECUTE FUNCTION analytics_space_guard_project_owner()`
] as const;

export const ANALYTICS_SPACE_STORAGE_SCHEMA_MIGRATIONS = [
  defineStorageSchemaMigration({
    id: "202609280001_add_analytics_spaces",
    description:
      "Add same-organization analytics spaces, exclusive membership, audited revisions and project-deletion fences.",
    statements: ANALYTICS_SPACE_SCHEMA_STATEMENTS
  })
] as const;

// Bootstrap creates an empty schema; it must never conditionally upgrade existing objects.
export const ANALYTICS_SPACE_BOOTSTRAP_STATEMENTS = ANALYTICS_SPACE_SCHEMA_STATEMENTS.filter(
  (statement) => !statement.startsWith("DROP TRIGGER")
).map((statement) =>
  statement
    .replaceAll(" IF NOT EXISTS", "")
    .replace("CREATE OR REPLACE FUNCTION", "CREATE FUNCTION")
    .replace(
      "namespace_revision bigint CHECK (namespace_revision BETWEEN 1 AND 9007199254740991),",
      `namespace_revision bigint CHECK (namespace_revision BETWEEN 1 AND 9007199254740991),
    namespace_source_project_ids uuid[],
    namespace_key_fingerprint text,
    namespace_activated_at timestamptz,
    namespace_revoked_at timestamptz,`
    )
    .replace(
      "created_at timestamptz NOT NULL DEFAULT now(),\n    updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz,",
      () => `created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz,
    CONSTRAINT analytics_spaces_identity_namespace_check CHECK (
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
    ),`
    )
);
