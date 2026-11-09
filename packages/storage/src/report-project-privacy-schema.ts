/** Analytics policy narrows a mixed report as a whole. Capture presets and
 * sampling controls govern future capture; changing them does not erase an
 * already generated archive. Financial uncertainty survives privacy deletion. */
export const REPORT_PROJECT_PRIVACY_BOOTSTRAP = [
  `CREATE OR REPLACE FUNCTION debugbundle_invalidate_project_report_privacy() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE project uuid; organization uuid; affected uuid[];
  BEGIN
    IF NOT (
      (COALESCE(OLD.enabled,false) AND NOT COALESCE(NEW.enabled,false))
      OR (COALESCE(OLD.privacy_mode,'strict')<>'strict' AND COALESCE(NEW.privacy_mode,'strict')='strict')
      OR (COALESCE(OLD.privacy_mode,'strict')='custom' AND COALESCE(NEW.privacy_mode,'strict')='standard')
      OR (NOT COALESCE(OLD.consent_required,false) AND COALESCE(NEW.consent_required,false))
      OR (COALESCE(NEW.aggregate_retention_months,12)<COALESCE(OLD.aggregate_retention_months,12))
    ) THEN RETURN NULL; END IF;
    project:=COALESCE(NEW.project_id,OLD.project_id);
    SELECT organization_id INTO organization FROM projects WHERE id=project;
    IF organization IS NULL THEN RETURN NULL; END IF;
    PERFORM id FROM organizations WHERE id=organization FOR UPDATE;
    SELECT array_agg(id) INTO affected FROM (
      SELECT r.id FROM report_runs r WHERE r.organization_id=organization AND r.privacy_invalidated_at IS NULL
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.accepted_scope) view
        WHERE debugbundle_canonical_project((view->>'project_id')::uuid)=project
        OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(view->'origin_project_ids') origin
          WHERE debugbundle_canonical_project(origin::uuid)=project))
      ORDER BY r.id FOR UPDATE
    ) locked;
    IF affected IS NULL THEN RETURN NULL; END IF;
    UPDATE report_allowance_windows w SET held_nano_usd=w.held_nano_usd-r.held,generations=w.generations-r.generations
    FROM(SELECT organization_id,window_starts_at,COALESCE(sum(ai_reserved_nano_usd) FILTER(WHERE paid_attempts=0),0) AS held,
      count(*) FILTER(WHERE paid_attempts=0 AND generation_counted AND facts_object_key IS NULL)::int AS generations
      FROM report_runs WHERE id=ANY(affected) GROUP BY organization_id,window_starts_at) r
    WHERE w.organization_id=r.organization_id AND w.starts_at=r.window_starts_at;
    UPDATE worker_jobs SET status='skipped',payload=NULL,lease_token=NULL,lease_expires_at=NULL,last_error_code='report_privacy_changed',updated_at=clock_timestamp()
      WHERE id IN(SELECT processing_job_id FROM report_runs WHERE id=ANY(affected) UNION ALL SELECT pdf_job_id FROM report_runs WHERE id=ANY(affected)) AND status IN ('pending','running');
    UPDATE report_artifact_objects SET state='deleting',cleanup_after_at=GREATEST(clock_timestamp()+interval '2 minutes',write_deadline_at+interval '2 minutes') WHERE run_id=ANY(affected);
    UPDATE report_model_attempts SET narrative_json=NULL,state=CASE WHEN state='sending' THEN 'uncertain' ELSE state END WHERE run_id=ANY(affected);
    UPDATE report_runs SET privacy_invalidated_at=clock_timestamp(),status='paused_access',lease_token=NULL,lease_expires_at=NULL,
      ai_reserved_nano_usd=CASE WHEN paid_attempts=0 THEN 0 ELSE ai_reserved_nano_usd END,
      ai_status=CASE WHEN paid_attempts>0 AND ai_status='pending' THEN 'uncertain' ELSE ai_status END,
      generation_counted=CASE WHEN paid_attempts=0 AND facts_object_key IS NULL THEN false ELSE generation_counted END,updated_at=clock_timestamp()
      WHERE id=ANY(affected);
    RETURN NULL;
  END $$`,
  `CREATE TRIGGER project_analytics_settings_report_privacy_guard AFTER INSERT OR UPDATE OR DELETE ON project_analytics_settings FOR EACH ROW EXECUTE FUNCTION debugbundle_invalidate_project_report_privacy()`
] as const;
export const REPORT_PROJECT_PRIVACY_READY_SQL = `EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='project_analytics_settings_report_privacy_guard'
 AND tgtype=29 AND tgenabled='O' AND tgrelid=to_regclass('public.project_analytics_settings') AND tgfoid=to_regprocedure('public.debugbundle_invalidate_project_report_privacy()'))`;
