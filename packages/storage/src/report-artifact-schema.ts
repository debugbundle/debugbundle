export const REPORT_ARTIFACT_BOOTSTRAP = [
  `CREATE TABLE report_artifact_objects (
  object_key text PRIMARY KEY,organization_id uuid NOT NULL,definition_id uuid NOT NULL,run_id uuid NOT NULL,
  artifact_kind text NOT NULL CHECK(artifact_kind IN ('facts','ready','pdf')),sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'allocated' CHECK(state IN ('allocated','attached','deleting')),
  writer_lease_token uuid NOT NULL,write_deadline_at timestamptz NOT NULL,cleanup_after_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(object_key='smart-reports/'||organization_id::text||'/'||definition_id::text||'/'||run_id::text||'/'||artifact_kind||'-'||sha256||CASE WHEN artifact_kind='pdf' THEN '.pdf' ELSE '.json' END))`,
  `CREATE INDEX report_artifact_objects_cleanup_idx ON report_artifact_objects(cleanup_after_at,object_key)`,
  `CREATE INDEX report_artifact_objects_run_idx ON report_artifact_objects(run_id,object_key)`,
  `CREATE OR REPLACE FUNCTION debugbundle_invalidate_report_privacy() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF OLD.privacy_mode='full' AND (NEW.privacy_mode<>'full' OR NOT NEW.source_collection_consent) THEN
   PERFORM id FROM organizations WHERE id=NEW.organization_id FOR UPDATE;
   UPDATE worker_jobs SET status='skipped',payload=NULL,lease_token=NULL,lease_expires_at=NULL,last_error_code='report_privacy_changed',updated_at=clock_timestamp()
     WHERE id IN(SELECT pdf_job_id FROM report_runs WHERE definition_id=NEW.id AND privacy_mode='full' AND privacy_invalidated_at IS NULL) AND status IN ('pending','running');
   UPDATE report_allowance_windows w SET held_nano_usd=w.held_nano_usd-r.held,generations=w.generations-r.generations
   FROM(SELECT organization_id,window_starts_at,COALESCE(sum(ai_reserved_nano_usd) FILTER(WHERE paid_attempts=0),0) AS held,
     count(*) FILTER(WHERE paid_attempts=0 AND generation_counted AND facts_object_key IS NULL)::int AS generations
     FROM report_runs WHERE definition_id=NEW.id AND privacy_mode='full' AND privacy_invalidated_at IS NULL GROUP BY organization_id,window_starts_at) r
   WHERE w.organization_id=r.organization_id AND w.starts_at=r.window_starts_at;
   UPDATE report_artifact_objects SET state='deleting',cleanup_after_at=GREATEST(clock_timestamp()+interval '2 minutes',write_deadline_at+interval '2 minutes')
     WHERE run_id IN(SELECT id FROM report_runs WHERE definition_id=NEW.id AND privacy_mode='full' AND privacy_invalidated_at IS NULL);
   UPDATE report_model_attempts SET narrative_json=NULL WHERE narrative_json IS NOT NULL AND run_id IN(SELECT id FROM report_runs WHERE definition_id=NEW.id AND privacy_mode='full');
   UPDATE report_runs SET privacy_invalidated_at=clock_timestamp(),status='paused_access',lease_token=NULL,lease_expires_at=NULL,
     ai_reserved_nano_usd=CASE WHEN paid_attempts=0 THEN 0 ELSE ai_reserved_nano_usd END,
     generation_counted=CASE WHEN paid_attempts=0 AND facts_object_key IS NULL THEN false ELSE generation_counted END,updated_at=clock_timestamp()
     WHERE definition_id=NEW.id AND privacy_mode='full' AND privacy_invalidated_at IS NULL;
  END IF;RETURN NULL;
 END $$`,
  `CREATE TRIGGER report_definitions_privacy_guard AFTER UPDATE OF privacy_mode,source_collection_consent ON report_definitions FOR EACH ROW EXECUTE FUNCTION debugbundle_invalidate_report_privacy()`
] as const;
export const REPORT_ARTIFACT_READY_SQL = `to_regclass('public.report_artifact_objects') IS NOT NULL
 AND (SELECT count(*)=12 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_artifact_objects' AND column_name=ANY(ARRAY['object_key','organization_id','definition_id','run_id','artifact_kind','sha256','state','writer_lease_token','write_deadline_at','cleanup_after_at','expires_at','created_at']))
 AND to_regclass('public.report_artifact_objects_cleanup_idx') IS NOT NULL AND to_regclass('public.report_artifact_objects_run_idx') IS NOT NULL
 AND EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='report_definitions_privacy_guard' AND tgtype=17 AND tgenabled='O' AND tgrelid=to_regclass('public.report_definitions') AND tgfoid=to_regprocedure('public.debugbundle_invalidate_report_privacy()'))`;
