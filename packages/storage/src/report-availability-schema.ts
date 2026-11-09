import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";
export const REPORT_AVAILABILITY_TABLES = [
  "report_availability_days",
  "report_collection_coverage"
] as const;
export const REPORT_AVAILABILITY_BOOTSTRAP = [
  `CREATE TABLE report_availability_days (
 project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,check_id uuid NOT NULL,day date NOT NULL,
 total_checks integer NOT NULL CHECK(total_checks>=0),successful_checks integer NOT NULL CHECK(successful_checks BETWEEN 0 AND total_checks),
 failed_checks integer NOT NULL CHECK(failed_checks BETWEEN 0 AND total_checks),degraded_checks integer NOT NULL CHECK(degraded_checks BETWEEN 0 AND total_checks),
 downtime_seconds integer NOT NULL CHECK(downtime_seconds>=0),first_checked_at timestamptz,last_checked_at timestamptz,
 source_updated_at timestamptz NOT NULL,PRIMARY KEY(project_id,day,check_id))`,
  `CREATE INDEX report_availability_days_expiry_idx ON report_availability_days(day,project_id,check_id)`,
  `CREATE TABLE report_collection_coverage (
 definition_id uuid NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,project_id uuid NOT NULL,collected_from timestamptz NOT NULL,
 PRIMARY KEY(definition_id,project_id))`,
  `CREATE INDEX report_collection_coverage_origin_idx ON report_collection_coverage(project_id,definition_id)`,
  `CREATE OR REPLACE FUNCTION debugbundle_report_collection_scope() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
 IF NOT NEW.enabled OR NEW.paused_at IS NOT NULL OR NEW.requires_owner_review
   OR NOT EXISTS(SELECT 1 FROM organizations WHERE id=NEW.organization_id AND suspended_at IS NULL) THEN
   DELETE FROM report_collection_coverage WHERE definition_id=NEW.id;RETURN NULL;
 END IF;
 DELETE FROM report_collection_coverage c WHERE c.definition_id=NEW.id AND NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(NEW.accepted_scope) v CROSS JOIN LATERAL jsonb_array_elements_text(v->'origin_project_ids') o
   WHERE o.value::uuid=c.project_id);
 INSERT INTO report_source_coverage(project_id,lifecycle_started_at)
   SELECT DISTINCT o.value::uuid,statement_timestamp() FROM jsonb_array_elements(NEW.accepted_scope) v
   CROSS JOIN LATERAL jsonb_array_elements_text(v->'origin_project_ids') o
   WHERE NOT EXISTS(SELECT 1 FROM report_collection_coverage active WHERE active.project_id=o.value::uuid)
   ON CONFLICT(project_id) DO UPDATE SET lifecycle_started_at=EXCLUDED.lifecycle_started_at;
 INSERT INTO report_collection_coverage(definition_id,project_id,collected_from)
   SELECT DISTINCT NEW.id,o.value::uuid,statement_timestamp() FROM jsonb_array_elements(NEW.accepted_scope) v
   CROSS JOIN LATERAL jsonb_array_elements_text(v->'origin_project_ids') o ON CONFLICT DO NOTHING;
 RETURN NULL;
 END $$`,
  `CREATE TRIGGER report_definitions_collection_scope AFTER INSERT OR UPDATE OF enabled,paused_at,requires_owner_review,accepted_scope ON report_definitions
 FOR EACH ROW EXECUTE FUNCTION debugbundle_report_collection_scope()`,
  `CREATE OR REPLACE FUNCTION debugbundle_report_collection_suspension() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
 IF OLD.suspended_at IS DISTINCT FROM NEW.suspended_at THEN
   UPDATE report_definitions SET enabled=enabled WHERE organization_id=NEW.id;
 END IF;RETURN NULL;
 END $$`,
  `CREATE TRIGGER organizations_report_collection_suspension AFTER UPDATE OF suspended_at ON organizations FOR EACH ROW EXECUTE FUNCTION debugbundle_report_collection_suspension()`,
  `CREATE OR REPLACE FUNCTION debugbundle_capture_report_availability() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
 IF NOT (EXISTS(SELECT 1 FROM report_collection_coverage WHERE project_id=NEW.project_id)) THEN RETURN NULL; END IF;
 INSERT INTO report_availability_days(project_id,check_id,day,total_checks,successful_checks,failed_checks,degraded_checks,downtime_seconds,first_checked_at,last_checked_at,source_updated_at)
 VALUES(NEW.project_id,NEW.check_id,NEW.day,NEW.total_checks,NEW.successful_checks,NEW.failed_checks,NEW.degraded_checks,NEW.downtime_seconds,NEW.first_checked_at,NEW.last_checked_at,NEW.updated_at)
 ON CONFLICT(project_id,day,check_id) DO UPDATE SET total_checks=EXCLUDED.total_checks,successful_checks=EXCLUDED.successful_checks,
 failed_checks=EXCLUDED.failed_checks,degraded_checks=EXCLUDED.degraded_checks,downtime_seconds=EXCLUDED.downtime_seconds,
 first_checked_at=EXCLUDED.first_checked_at,last_checked_at=EXCLUDED.last_checked_at,source_updated_at=EXCLUDED.source_updated_at
 WHERE EXCLUDED.source_updated_at>=report_availability_days.source_updated_at;
 RETURN NULL;END $$`,
  `CREATE TRIGGER availability_rollups_report_capture AFTER INSERT OR UPDATE ON availability_check_daily_rollups FOR EACH ROW EXECUTE FUNCTION debugbundle_capture_report_availability()`,
  // Existing definitions start an honest new collection epoch. Backfill stays a
  // bounded separate operation and never moves this watermark backwards.
  `INSERT INTO report_collection_coverage(definition_id,project_id,collected_from)
 SELECT DISTINCT d.id,o.value::uuid,statement_timestamp() FROM report_definitions d JOIN organizations org ON org.id=d.organization_id
 CROSS JOIN LATERAL jsonb_array_elements(d.accepted_scope) v CROSS JOIN LATERAL jsonb_array_elements_text(v->'origin_project_ids') o
 WHERE d.enabled AND d.paused_at IS NULL AND NOT d.requires_owner_review AND org.suspended_at IS NULL ON CONFLICT DO NOTHING`,
  `INSERT INTO report_source_coverage(project_id,lifecycle_started_at)
    SELECT project_id,min(collected_from) FROM report_collection_coverage GROUP BY project_id ON CONFLICT DO NOTHING`
] as const;
const readySql = `SELECT to_regclass('public.report_availability_days') IS NOT NULL AND to_regclass('public.report_collection_coverage') IS NOT NULL
 AND (SELECT count(*)=14 FROM information_schema.columns WHERE table_schema='public' AND
 ((table_name='report_availability_days' AND column_name=ANY(ARRAY['project_id','check_id','day','total_checks','successful_checks','failed_checks','degraded_checks','downtime_seconds','first_checked_at','last_checked_at','source_updated_at']))
 OR (table_name='report_collection_coverage' AND column_name=ANY(ARRAY['definition_id','project_id','collected_from']))))
 AND to_regclass('public.report_availability_days_expiry_idx') IS NOT NULL AND to_regclass('public.report_collection_coverage_origin_idx') IS NOT NULL
 AND (SELECT count(*)=3 FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND
 ((tgname='report_definitions_collection_scope' AND tgtype=21 AND tgrelid=to_regclass('public.report_definitions') AND tgfoid=to_regprocedure('public.debugbundle_report_collection_scope()'))
 OR (tgname='organizations_report_collection_suspension' AND tgtype=17 AND tgrelid=to_regclass('public.organizations') AND tgfoid=to_regprocedure('public.debugbundle_report_collection_suspension()'))
 OR (tgname='availability_rollups_report_capture' AND tgtype=21 AND tgrelid=to_regclass('public.availability_check_daily_rollups') AND tgfoid=to_regprocedure('public.debugbundle_capture_report_availability()'))))`;
export const REPORT_AVAILABILITY_MIGRATION = defineStorageSchemaMigration({
  id: "202611070012_add_report_availability_history",
  description:
    "Preserve bounded report-enabled numeric availability history with honest collection epochs.",
  statements: [
    ...REPORT_AVAILABILITY_BOOTSTRAP.map((sql) =>
      sql.startsWith("CREATE TRIGGER")
        ? `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='${sql.split(" ")[2]}') THEN ${sql}; END IF; END $$`
        : sql
            .replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")
            .replace(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ")
    ),
    `DO $$ BEGIN IF NOT (${readySql}) THEN RAISE EXCEPTION 'report_availability_schema_incomplete'; END IF; END $$`
  ]
});
export async function reportAvailabilitySchemaAvailable(db: Queryable): Promise<boolean> {
  return (
    (await db.query<{ available: boolean }>(`SELECT (${readySql}) AS available`, [])).rows[0]
      ?.available === true
  );
}
