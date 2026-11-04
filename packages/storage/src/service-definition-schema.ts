import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import {
  SERVICE_INPUT_ALIAS_TABLE,
  SERVICE_PROJECT_ALIAS_TABLE,
  SERVICE_INPUT_ALIAS_STATEMENTS
} from "./service-input-alias-schema.js";

export const SERVICE_DEFINITION_TABLE = `CREATE TABLE service_definitions (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  origin_project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  repository_default_project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  input_name text NOT NULL,
  description text CHECK (length(description) <= 2000),
  repository_url text CHECK (length(repository_url) <= 2000),
  repository_root text CHECK (length(repository_root) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, name),
  UNIQUE(origin_project_id, input_name)
)`;

// Installed predecessors insert environment-specific services without knowing the
// logical catalogue. The database owns this additive link for every writer.
export const SERVICE_DEFINITION_LINK_STATEMENTS = [
  `CREATE FUNCTION link_service_definition() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
  DECLARE owning_project uuid;
  BEGIN
    SELECT debugbundle_canonical_project(NEW.project_id) INTO owning_project;
    PERFORM id FROM projects WHERE id=ANY(ARRAY[NEW.project_id,owning_project]) ORDER BY id FOR UPDATE;
    IF debugbundle_canonical_project(NEW.project_id)<>owning_project THEN
      RAISE EXCEPTION 'service_owner_changed_retry' USING ERRCODE='40001';
    END IF;
    IF NEW.service_definition_id IS NULL THEN
      SELECT service_definition_id INTO NEW.service_definition_id FROM service_input_aliases
      WHERE origin_project_id=NEW.project_id AND input_name=NEW.name;
    END IF;
    IF NEW.service_definition_id IS NULL THEN
      NEW.service_definition_id:=debugbundle_observe_service(NEW.project_id,NEW.name);
    END IF;
    PERFORM 1 FROM service_definitions WHERE id=NEW.service_definition_id AND project_id=owning_project AND origin_project_id=NEW.project_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'service_definition_scope_mismatch'; END IF;
    SELECT input_name INTO NEW.name FROM service_definitions WHERE id=NEW.service_definition_id;
    RETURN NEW;
  END $$`,
  `CREATE TRIGGER service_definition_link BEFORE INSERT OR UPDATE OF project_id,name,service_definition_id
   ON services FOR EACH ROW EXECUTE FUNCTION link_service_definition()`
] as const;

export const SERVICE_DEFINITION_MIGRATION = defineStorageSchemaMigration({
  id: "202611030001_add_service_definitions",
  description:
    "Add stable logical services and repository metadata while preserving environment-specific service IDs.",
  statements: [
    "ALTER TABLE projects ADD COLUMN capture_rules_require_server boolean NOT NULL DEFAULT false",
    SERVICE_DEFINITION_TABLE,
    SERVICE_INPUT_ALIAS_TABLE,
    SERVICE_PROJECT_ALIAS_TABLE,
    `INSERT INTO service_definitions(id,project_id,origin_project_id,repository_default_project_id,name,input_name)
     SELECT gen_random_uuid(),project_id,project_id,project_id,name,name
     FROM services GROUP BY project_id,name`,
    `INSERT INTO service_input_aliases(origin_project_id,input_name,service_definition_id)
     SELECT origin_project_id,input_name,id FROM service_definitions`,
    `INSERT INTO service_project_aliases(project_id,name,service_definition_id)
     SELECT project_id,name,id FROM service_definitions`,
    ...SERVICE_INPUT_ALIAS_STATEMENTS,
    "ALTER TABLE services ADD COLUMN service_definition_id uuid REFERENCES service_definitions(id) ON DELETE RESTRICT",
    `UPDATE services s SET service_definition_id=d.id FROM service_definitions d
     WHERE d.project_id=s.project_id AND d.name=s.name`,
    "ALTER TABLE services ALTER COLUMN service_definition_id SET NOT NULL",
    "ALTER TABLE services ADD CONSTRAINT services_definition_environment_key UNIQUE(service_definition_id,environment)",
    "CREATE INDEX services_definition_idx ON services(service_definition_id)",
    ...SERVICE_DEFINITION_LINK_STATEMENTS
  ]
});
