import {
  PROJECT_RULE_SCOPE_COLUMNS,
  PROJECT_RULE_SCOPE_STATEMENTS,
  CAPTURE_RULE_SERVICE_BACKFILL
} from "./project-rule-scope-schema.js";
import {
  AUTOMATION_SERVICE_BACKFILL,
  AUTOMATION_SERVICE_STATEMENTS
} from "./project-automation-service-schema.js";
import {
  PROJECT_PROBE_COLUMNS,
  PROJECT_PROBE_GUARD_STATEMENTS,
  PROJECT_PROBE_BACKFILL
} from "./project-probe-schema.js";
import {
  SERVICE_OBSERVATION_STATEMENTS,
  SERVICE_OBSERVATION_BACKFILL
} from "./service-observation-schema.js";
import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import {
  PROJECT_ANALYTICS_STATEMENTS,
  PROJECT_ANALYTICS_COLUMNS
} from "./project-analytics-schema.js";
import { PROJECT_CREDENTIAL_SCOPE_STATEMENTS } from "./project-credential-scope-schema.js";
import { PROJECT_CONFIGURATION_GUARD_STATEMENTS } from "./project-configuration-guard-schema.js";
import { PROJECT_WEEKLY_REPORT_MIGRATION } from "./project-weekly-report-schema.js";
import {
  PROJECT_HEALTH_COLUMNS,
  PROJECT_HEALTH_BACKFILL,
  PROJECT_HEALTH_STATEMENTS
} from "./project-health-schema.js";

export const PROJECT_CONSOLIDATION_BOOTSTRAP_STATEMENTS = [
  `CREATE TABLE project_merge_operations (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 128),
    request jsonb NOT NULL CHECK(jsonb_typeof(request)='object'),
    plan_digest text NOT NULL CHECK(plan_digest ~ '^[a-f0-9]{64}$'),
    state text NOT NULL CHECK(state IN ('queued','checking','applying','verifying','completed','cancelled','failed_before_commit','verification_failed_after_commit')),
    receipt jsonb CHECK(receipt IS NULL OR jsonb_typeof(receipt)='object'),
    manifest jsonb CHECK(manifest IS NULL OR jsonb_typeof(manifest)='object'),
    error_code text,
    lease_token uuid, lease_expires_at timestamptz,
    committed_at timestamptz, verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(actor_user_id,idempotency_key)
  )`,
  `CREATE TABLE project_merge_participants (
    project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    operation_id uuid NOT NULL REFERENCES project_merge_operations(id) ON DELETE CASCADE
  )`,
  "CREATE INDEX project_merge_participants_operation_idx ON project_merge_participants(operation_id)",
  `CREATE TABLE project_legacy_bindings (
    legacy_project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    canonical_project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scope_origin_ids uuid[] NOT NULL CHECK(cardinality(scope_origin_ids) BETWEEN 1 AND 1000 AND legacy_project_id=ANY(scope_origin_ids)),
    operation_id uuid NOT NULL REFERENCES project_merge_operations(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK(legacy_project_id<>canonical_project_id)
  )`,
  "CREATE INDEX project_legacy_bindings_canonical_idx ON project_legacy_bindings(canonical_project_id)",
  `CREATE FUNCTION debugbundle_canonical_project(project_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
      SELECT COALESCE((SELECT canonical_project_id FROM project_legacy_bindings WHERE legacy_project_id=$1),$1)
    $$`,
  `CREATE FUNCTION debugbundle_project_origins(project_id uuid) RETURNS uuid[]
    LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
      SELECT COALESCE((SELECT scope_origin_ids FROM project_legacy_bindings WHERE legacy_project_id=$1),
        ARRAY(SELECT origin_id FROM (SELECT $1 AS origin_id UNION
          SELECT legacy_project_id FROM project_legacy_bindings WHERE canonical_project_id=$1) origins ORDER BY origin_id))
    $$`,
  `CREATE FUNCTION debugbundle_project_scope_contains(requested_project_id uuid,origin_project_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
      SELECT $2=ANY(debugbundle_project_origins($1))
    $$`,
  `CREATE FUNCTION guard_project_binding() RETURNS trigger
    LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
    DECLARE expected_owner uuid; expected_organization uuid; scope_count integer;
    BEGIN
      PERFORM id FROM projects WHERE id=ANY(ARRAY[NEW.legacy_project_id,NEW.canonical_project_id]) ORDER BY id FOR UPDATE;
      PERFORM 1 FROM project_legacy_bindings WHERE legacy_project_id=NEW.canonical_project_id;
      IF FOUND THEN
        RAISE EXCEPTION 'project_binding_target_is_alias';
      END IF;
      SELECT owner_user_id,organization_id INTO expected_owner,expected_organization FROM projects WHERE id=NEW.canonical_project_id;
      SELECT count(DISTINCT id) INTO scope_count FROM projects WHERE id=ANY(NEW.scope_origin_ids)
        AND owner_user_id=expected_owner AND organization_id=expected_organization;
      IF expected_owner IS NULL OR scope_count<>cardinality(NEW.scope_origin_ids) THEN
        RAISE EXCEPTION 'project_binding_scope_mismatch';
      END IF;
      UPDATE projects SET capture_rules_require_server=true WHERE id=NEW.canonical_project_id AND NOT capture_rules_require_server;
      RETURN NEW;
    END $$`,
  `CREATE TRIGGER project_binding_guard BEFORE INSERT OR UPDATE ON project_legacy_bindings
    FOR EACH ROW EXECUTE FUNCTION guard_project_binding()`,
  `CREATE FUNCTION guard_project_origin_deletion() RETURNS trigger
    LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
    BEGIN
      IF OLD.id=ANY(NULLIF(current_setting('debugbundle.project_deletion_origins',true),'')::uuid[]) THEN RETURN OLD; END IF;
      PERFORM 1 FROM project_legacy_bindings WHERE legacy_project_id=OLD.id;
      IF FOUND THEN
        RAISE EXCEPTION 'project_consolidated';
      END IF;
      PERFORM 1 FROM project_legacy_bindings WHERE canonical_project_id=OLD.id;
      IF FOUND THEN
        RAISE EXCEPTION 'project_has_origins';
      END IF;
      RETURN OLD;
    END $$`,
  `CREATE TRIGGER project_origin_deletion_guard BEFORE DELETE ON projects
    FOR EACH ROW EXECUTE FUNCTION guard_project_origin_deletion()`
] as const;

export const PROJECT_CONSOLIDATION_MIGRATION = defineStorageSchemaMigration({
  id: "202611030002_add_project_consolidation",
  description:
    "Add durable checked consolidation journals and flattened legacy project scope bindings.",
  statements: [
    ...PROJECT_CONSOLIDATION_BOOTSTRAP_STATEMENTS,
    "ALTER TABLE project_tokens ADD COLUMN scope_origin_ids uuid[]",
    "ALTER TABLE agent_tokens ADD COLUMN scope_origin_ids uuid[]",
    ...PROJECT_PROBE_COLUMNS,
    ...PROJECT_RULE_SCOPE_COLUMNS,
    ...PROJECT_HEALTH_COLUMNS,
    ...PROJECT_CONFIGURATION_GUARD_STATEMENTS,
    ...PROJECT_ANALYTICS_COLUMNS,
    ...PROJECT_ANALYTICS_STATEMENTS,
    ...PROJECT_WEEKLY_REPORT_MIGRATION,
    ...PROJECT_CREDENTIAL_SCOPE_STATEMENTS,
    ...SERVICE_OBSERVATION_STATEMENTS,
    SERVICE_OBSERVATION_BACKFILL,
    PROJECT_HEALTH_BACKFILL,
    ...PROJECT_HEALTH_STATEMENTS,
    PROJECT_PROBE_BACKFILL,
    ...PROJECT_PROBE_GUARD_STATEMENTS,
    CAPTURE_RULE_SERVICE_BACKFILL,
    AUTOMATION_SERVICE_BACKFILL,
    ...PROJECT_RULE_SCOPE_STATEMENTS,
    ...AUTOMATION_SERVICE_STATEMENTS
  ]
});
