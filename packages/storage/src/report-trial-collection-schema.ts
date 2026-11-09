import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";

// Forward amendments retain the original migration bodies and their checksums.
// Numeric triggers must stop at the trial deadline without waiting for cleanup.
export const REPORT_TRIAL_COLLECTION_BOOTSTRAP = [
  `CREATE OR REPLACE FUNCTION debugbundle_report_trial_active(organization uuid) RETURNS boolean LANGUAGE sql AS $$
 SELECT EXISTS(SELECT 1 FROM organizations WHERE id=organization
 AND (billing_state IS DISTINCT FROM 'trialing' OR trial_ends_at>clock_timestamp()))
$$`,
  `CREATE OR REPLACE FUNCTION debugbundle_record_report_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE source_kind text; action text; happened timestamptz; before_state text;
  BEGIN
    -- Old application workers may still be running between additive migrations.
    IF to_regclass('public.report_collection_coverage') IS NULL THEN RETURN NULL; END IF;
    IF NOT (EXISTS(SELECT 1 FROM report_collection_coverage c
      JOIN report_definitions d ON d.id=c.definition_id JOIN organizations o ON o.id=d.organization_id
      WHERE c.project_id=NEW.project_id AND d.enabled AND d.paused_at IS NULL AND NOT d.requires_owner_review AND o.suspended_at IS NULL AND debugbundle_report_trial_active(o.id))) THEN RETURN NULL; END IF;
    source_kind:=CASE WHEN TG_TABLE_NAME='incidents' THEN 'incident' ELSE 'improvement' END;
    IF TG_OP='INSERT' THEN
      action:=CASE WHEN NEW.status='open' THEN 'opened' ELSE 'observed' END;
      IF source_kind='incident' THEN happened:=NEW.first_seen_at; ELSE happened:=NEW.first_detected_at; END IF;
      before_state:=NULL;
    ELSE
      IF (OLD.status,OLD.severity) IS NOT DISTINCT FROM (NEW.status,NEW.severity) THEN RETURN NULL; END IF;
      before_state:=CASE WHEN OLD.status IN ('open','resolved','regressed','snoozed') THEN OLD.status ELSE 'other' END;
      IF OLD.status IS NOT DISTINCT FROM NEW.status THEN action:='severity_changed';
      ELSIF NEW.status='resolved' THEN action:='resolved';
      ELSIF NEW.status='regressed' THEN action:='regressed';
      ELSIF NEW.status='snoozed' THEN action:='snoozed';
      ELSIF NEW.status='open' AND OLD.status IN ('resolved','regressed') THEN action:='reopened';
      ELSIF NEW.status='open' THEN action:='restored';
      ELSE action:='state_changed'; END IF;
      happened:=statement_timestamp();
      IF action='resolved' THEN happened:=COALESCE(NEW.resolved_at,happened); END IF;
      IF source_kind='incident' AND action='regressed' THEN happened:=COALESCE(NEW.regressed_at,happened); END IF;
    END IF;
    INSERT INTO report_source_coverage(project_id,lifecycle_started_at)
      SELECT p.id,statement_timestamp() FROM projects p WHERE p.id=NEW.project_id ON CONFLICT(project_id) DO NOTHING;
    INSERT INTO report_lifecycle_facts(project_id,source_type,source_id,service_id,transition,from_status,to_status,severity,occurred_at)
      VALUES(NEW.project_id,source_kind,NEW.id,NEW.service_id,action,before_state,
        CASE WHEN NEW.status IN ('open','resolved','regressed','snoozed') THEN NEW.status ELSE 'other' END,
        CASE WHEN NEW.severity IN ('low','medium','high','critical') THEN NEW.severity ELSE 'unknown' END,happened);
    RETURN NULL;
  END $$`,
  `CREATE OR REPLACE FUNCTION debugbundle_capture_report_availability() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
 IF NOT (EXISTS(SELECT 1 FROM report_collection_coverage c JOIN report_definitions d ON d.id=c.definition_id WHERE c.project_id=NEW.project_id AND debugbundle_report_trial_active(d.organization_id))) THEN RETURN NULL; END IF;
 INSERT INTO report_availability_days(project_id,check_id,day,total_checks,successful_checks,failed_checks,degraded_checks,downtime_seconds,first_checked_at,last_checked_at,source_updated_at)
 VALUES(NEW.project_id,NEW.check_id,NEW.day,NEW.total_checks,NEW.successful_checks,NEW.failed_checks,NEW.degraded_checks,NEW.downtime_seconds,NEW.first_checked_at,NEW.last_checked_at,NEW.updated_at)
 ON CONFLICT(project_id,day,check_id) DO UPDATE SET total_checks=EXCLUDED.total_checks,successful_checks=EXCLUDED.successful_checks,
 failed_checks=EXCLUDED.failed_checks,degraded_checks=EXCLUDED.degraded_checks,downtime_seconds=EXCLUDED.downtime_seconds,
 first_checked_at=EXCLUDED.first_checked_at,last_checked_at=EXCLUDED.last_checked_at,source_updated_at=EXCLUDED.source_updated_at
 WHERE EXCLUDED.source_updated_at>=report_availability_days.source_updated_at;
 RETURN NULL;END $$`,
  `CREATE OR REPLACE FUNCTION debugbundle_report_collection_scope() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
 IF NOT NEW.enabled OR NEW.paused_at IS NOT NULL OR NEW.requires_owner_review
   OR NOT EXISTS(SELECT 1 FROM organizations WHERE id=NEW.organization_id AND suspended_at IS NULL AND debugbundle_report_trial_active(id)) THEN
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
  `CREATE OR REPLACE FUNCTION debugbundle_report_trial_collection_epoch() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
 IF OLD.billing_state='trialing' AND OLD.trial_ends_at<=clock_timestamp() THEN
   DELETE FROM report_collection_coverage c USING report_definitions d
   WHERE c.definition_id=d.id AND d.organization_id=NEW.id;
   UPDATE report_definitions SET enabled=enabled WHERE organization_id=NEW.id;
 END IF;
 RETURN NULL;
 END $$`,
  `CREATE TRIGGER organizations_report_trial_collection_epoch AFTER UPDATE OF billing_state,trial_ends_at ON organizations FOR EACH ROW EXECUTE FUNCTION debugbundle_report_trial_collection_epoch()`
] as const;
const readySql = `to_regprocedure('public.debugbundle_report_trial_active(uuid)') IS NOT NULL
 AND position('debugbundle_report_trial_active' in pg_get_functiondef(to_regprocedure('public.debugbundle_record_report_lifecycle()')))>0
 AND position('debugbundle_report_trial_active' in pg_get_functiondef(to_regprocedure('public.debugbundle_capture_report_availability()')))>0
 AND position('debugbundle_report_trial_active' in pg_get_functiondef(to_regprocedure('public.debugbundle_report_collection_scope()')))>0
 AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='organizations_report_trial_collection_epoch' AND tgrelid=to_regclass('public.organizations') AND tgfoid=to_regprocedure('public.debugbundle_report_trial_collection_epoch()') AND NOT tgisinternal AND tgenabled='O' AND tgtype=17)`;
export const REPORT_TRIAL_COLLECTION_MIGRATION = defineStorageSchemaMigration({
  id: "202611080002_guard_report_trial_collection",
  description:
    "Stop report history at the trial deadline and restart honest coverage after a delayed paid conversion.",
  statements: [
    ...REPORT_TRIAL_COLLECTION_BOOTSTRAP.map((sql) =>
      sql.startsWith("CREATE TRIGGER")
        ? `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='organizations_report_trial_collection_epoch') THEN ${sql}; END IF; END $$`
        : sql
    ),
    `DO $$ BEGIN IF NOT (${readySql}) THEN RAISE EXCEPTION 'report_trial_collection_schema_incomplete'; END IF; END $$`
  ]
});
export async function reportTrialCollectionSchemaAvailable(db: Queryable): Promise<boolean> {
  return (
    (await db.query<{ available: boolean }>(`SELECT (${readySql}) AS available`, [])).rows[0]
      ?.available === true
  );
}
