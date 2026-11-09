import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";

export const REPORT_DEFINITION_TABLES = ["report_definitions"] as const;
export const REPORT_DEFINITION_BOOTSTRAP = [
  `CREATE TABLE report_definitions (
    id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    initiating_authority jsonb NOT NULL CHECK(jsonb_typeof(initiating_authority)='object'),
    creation_request_id uuid NOT NULL, creation_digest text NOT NULL CHECK(creation_digest ~ '^[a-f0-9]{64}$'),
    name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
    cadence text NOT NULL CHECK(cadence IN ('daily','weekly','monthly')),
    privacy_mode text NOT NULL CHECK(privacy_mode IN ('full','restricted')),
    source_collection_consent boolean NOT NULL,
    accepted_scope jsonb NOT NULL CHECK(jsonb_typeof(accepted_scope)='array' AND jsonb_array_length(accepted_scope) BETWEEN 1 AND 10),
    recipient_user_ids uuid[] NOT NULL CHECK(cardinality(recipient_user_ids)<=10),
    schedule jsonb CHECK(schedule IS NULL OR jsonb_typeof(schedule)='object'),
    enabled boolean NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0),
    next_due_at timestamptz, next_period_ends_at timestamptz,
    requires_owner_review boolean NOT NULL DEFAULT false,
    pause_reason text CHECK(pause_reason IN ('plan_lost','creator_access_lost','scope_unavailable')),
    paused_at timestamptz,
    weekly_overlap text CHECK(weekly_overlap='keep_existing'),
    created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(organization_id,creation_request_id),
    CHECK(privacy_mode='restricted' OR source_collection_consent),
    CHECK(NOT enabled OR schedule IS NOT NULL),
    CHECK((next_due_at IS NULL)=(next_period_ends_at IS NULL)),
    CHECK((paused_at IS NULL)=(pause_reason IS NULL)),
    CHECK(NOT requires_owner_review OR pause_reason='plan_lost')
  )`,
  `CREATE INDEX report_definitions_organization_idx ON report_definitions(organization_id,created_at,id)`,
  `CREATE INDEX report_definitions_due_idx ON report_definitions(next_due_at,id) WHERE enabled AND paused_at IS NULL AND NOT requires_owner_review`,
  `CREATE INDEX report_definitions_scope_idx ON report_definitions USING gin(accepted_scope jsonb_path_ops)`,
  `CREATE OR REPLACE FUNCTION debugbundle_pause_report_definitions() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF OLD.plan='business' AND NEW.plan<>'business' THEN
      UPDATE report_definitions SET requires_owner_review=true,pause_reason='plan_lost',paused_at=statement_timestamp(),
        version=version+1,updated_at=statement_timestamp() WHERE organization_id=NEW.id;
    END IF;
    RETURN NULL;
  END $$`,
  `CREATE TRIGGER organizations_report_plan_guard AFTER UPDATE OF plan ON organizations FOR EACH ROW EXECUTE FUNCTION debugbundle_pause_report_definitions()`,
  // Explicit source deletion invalidates the entire mixed-scope definition.
  // Never shrink its JSON scope and retain a narrative under a different promise.
  `CREATE OR REPLACE FUNCTION debugbundle_delete_source_report_definitions() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP='UPDATE' AND OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id THEN RETURN NEW; END IF;
    PERFORM id FROM organizations WHERE id=OLD.organization_id FOR UPDATE;
    IF to_regclass('public.report_runs') IS NOT NULL THEN
      DELETE FROM report_runs WHERE accepted_scope @> jsonb_build_array(jsonb_build_object('project_id',OLD.id::text))
        OR accepted_scope @> jsonb_build_array(jsonb_build_object('origin_project_ids',jsonb_build_array(OLD.id::text)));
    END IF;
    DELETE FROM report_definitions WHERE accepted_scope @> jsonb_build_array(jsonb_build_object('project_id',OLD.id::text))
      OR accepted_scope @> jsonb_build_array(jsonb_build_object('origin_project_ids',jsonb_build_array(OLD.id::text)));
    IF TG_OP='UPDATE' THEN RETURN NEW; END IF;RETURN OLD;
  END $$`,
  `CREATE TRIGGER projects_report_delete_guard BEFORE DELETE OR UPDATE OF organization_id ON projects FOR EACH ROW EXECUTE FUNCTION debugbundle_delete_source_report_definitions()`
] as const;
const readySql = `SELECT to_regclass('public.report_definitions') IS NOT NULL
  AND (SELECT count(*)=23 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_definitions' AND column_name=ANY(ARRAY['id','organization_id','created_by_user_id','initiating_authority','creation_request_id','creation_digest','name','cadence','privacy_mode','source_collection_consent','accepted_scope','recipient_user_ids','schedule','enabled','version','next_due_at','next_period_ends_at','requires_owner_review','pause_reason','paused_at','weekly_overlap','created_at','updated_at']))
  AND to_regclass('public.report_definitions_organization_idx') IS NOT NULL AND to_regclass('public.report_definitions_due_idx') IS NOT NULL AND to_regclass('public.report_definitions_scope_idx') IS NOT NULL
  AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.report_definitions') AND conname='report_definitions_organization_id_creation_request_id_key' AND contype='u')
  AND EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='organizations_report_plan_guard' AND tgenabled='O' AND tgtype=17 AND tgrelid=to_regclass('public.organizations') AND tgfoid=to_regprocedure('public.debugbundle_pause_report_definitions()'))
  AND EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='projects_report_delete_guard' AND tgenabled='O' AND tgtype=27 AND tgrelid=to_regclass('public.projects') AND tgfoid=to_regprocedure('public.debugbundle_delete_source_report_definitions()'))`;
export const REPORT_DEFINITION_MIGRATION = defineStorageSchemaMigration({
  id: "202611070010_add_smart_report_definitions",
  description:
    "Persist explicitly scoped report definitions with version, downgrade-review and deletion fences.",
  statements: [
    ...REPORT_DEFINITION_BOOTSTRAP.map((sql) =>
      sql.startsWith("CREATE TRIGGER")
        ? `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='${sql.split(" ")[2]}') THEN ${sql}; END IF; END $$`
        : sql
            .replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")
            .replace(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ")
    ),
    `DO $$ BEGIN IF NOT (${readySql}) THEN RAISE EXCEPTION 'report_definition_schema_incomplete'; END IF; END $$`
  ]
});
export async function reportDefinitionSchemaAvailable(db: Queryable): Promise<boolean> {
  return (
    (await db.query<{ available: boolean }>(`SELECT (${readySql}) AS available`, [])).rows[0]
      ?.available === true
  );
}
