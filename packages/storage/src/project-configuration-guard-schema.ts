import { PROJECT_SCOPED_RULE_TABLES } from "./project-rule-scope-schema.js";
import { PROJECT_USER_DELETION_STATEMENTS } from "./project-user-deletion-schema.js";
const configurationRuntimeColumns: Record<string, string> = {
  capture_policies: "updated_at",
  project_analytics_settings: "updated_at",
  notification_preferences: "updated_at",
  project_members: "updated_at",
  project_invites: "updated_at",
  project_github_repos: "updated_at",
  capture_rules: "updated_at,hit_count,last_matched_at",
  alert_rules: "updated_at",
  agent_webhooks: "updated_at",
  github_dispatch_rules: "updated_at",
  weekly_report_channels: "updated_at",
  analytics_funnel_definitions: "updated_at",
  analytics_flow_definitions: "updated_at",
  availability_checks:
    "updated_at,status,consecutive_failures,consecutive_successes,linked_incident_id,last_checked_at,next_check_at,claimed_at,last_result_status,last_result_http_status,last_result_error_kind,last_result_error_message,last_result_duration_ms"
};

export const PROJECT_CONFIGURATION_GUARD_STATEMENTS = [
  ...PROJECT_USER_DELETION_STATEMENTS,
  "CREATE INDEX project_merge_operations_target_verified_idx ON project_merge_operations(target_project_id,verified_at DESC) WHERE verified_at IS NOT NULL",
  `CREATE FUNCTION debugbundle_assert_project_scope_current(requested_id uuid) RETURNS void
    LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
    DECLARE root_id uuid;
    BEGIN
      root_id:=debugbundle_canonical_project(requested_id);
      PERFORM 1 FROM project_merge_participants WHERE project_merge_participants.project_id=ANY(ARRAY[requested_id,root_id]);
      IF FOUND THEN RAISE EXCEPTION 'project_merge_in_progress' USING ERRCODE='40001'; END IF;
      PERFORM 1 FROM project_merge_operations WHERE target_project_id=root_id AND verified_at>statement_timestamp();
      IF FOUND THEN RAISE EXCEPTION 'project_scope_changed_retry' USING ERRCODE='40001'; END IF;
    END $$`,
  `CREATE FUNCTION debugbundle_assert_project_scope_write(requested_id uuid) RETURNS void
    LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
    DECLARE root_id uuid;
    BEGIN
      IF requested_id IS NULL THEN RETURN; END IF;
      root_id:=debugbundle_canonical_project(requested_id);
      BEGIN
        PERFORM id FROM projects WHERE id=ANY(debugbundle_project_origins(root_id)) ORDER BY id FOR UPDATE NOWAIT;
      EXCEPTION WHEN lock_not_available THEN
        RAISE EXCEPTION 'project_merge_in_progress' USING ERRCODE='40001';
      END;
      PERFORM debugbundle_assert_project_scope_current(requested_id);
    END $$`,
  `CREATE FUNCTION debugbundle_assert_canonical_project_write(requested_id uuid) RETURNS void
    LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
    DECLARE root_id uuid; prior_lock_timeout text;
    BEGIN
      root_id:=debugbundle_canonical_project(requested_id);
      PERFORM debugbundle_assert_project_scope_current(requested_id);
      -- Management entry points acquire the complete ordered fence before any
      -- resource row lock. Ordinary edits serialize; trigger-only fences below
      -- stay NOWAIT to prevent inversion with a merge holding project locks.
      prior_lock_timeout:=current_setting('lock_timeout');
      IF prior_lock_timeout::interval=interval '0' OR prior_lock_timeout::interval>interval '1 second' THEN
        PERFORM set_config('lock_timeout','1s',true);
      END IF;
      BEGIN
        PERFORM id FROM projects WHERE id=ANY(debugbundle_project_origins(root_id)) ORDER BY id FOR UPDATE;
      EXCEPTION WHEN lock_not_available THEN
        PERFORM set_config('lock_timeout',prior_lock_timeout,true);
        RAISE EXCEPTION 'project_configuration_busy' USING ERRCODE='40001';
      WHEN OTHERS THEN
        PERFORM set_config('lock_timeout',prior_lock_timeout,true);
        RAISE;
      END;
      PERFORM set_config('lock_timeout',prior_lock_timeout,true);
      PERFORM debugbundle_assert_project_scope_write(requested_id);
      root_id:=debugbundle_canonical_project(requested_id);
      IF root_id<>requested_id THEN RAISE EXCEPTION 'project_consolidated' USING DETAIL=root_id::text; END IF;
    END $$`,
  `CREATE FUNCTION guard_project_configuration() RETURNS trigger
    LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
    DECLARE scope_id uuid; row_value jsonb; ignored text[];
    BEGIN
      ignored:=string_to_array(TG_ARGV[1],',');
      IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ignored)=(to_jsonb(OLD)-ignored) THEN RETURN NEW; END IF;
      IF TG_OP='DELETE' THEN row_value:=to_jsonb(OLD); ELSE row_value:=to_jsonb(NEW); END IF;
      scope_id:=(row_value->>TG_ARGV[0])::uuid;
      -- Account-wide installation removal is fenced by its organization lock.
      -- Only its real FK cascade may clear retained bindings; direct deletes
      -- still need the explicit origin-scoped management context.
      IF TG_OP='DELETE' AND TG_TABLE_NAME='project_github_repos' AND pg_trigger_depth()>=2 AND
        NOT EXISTS(SELECT 1 FROM github_installations WHERE id=(row_value->>'installation_id')::uuid) THEN
        RETURN OLD;
      END IF;
      IF TG_OP IN ('UPDATE','DELETE') AND debugbundle_allow_user_cascade(TG_RELID,scope_id,to_jsonb(OLD),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(NEW) ELSE NULL END,TG_OP) THEN
        IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
      END IF;
      IF TG_OP='DELETE' AND scope_id=ANY(NULLIF(current_setting('debugbundle.project_deletion_origins',true),'')::uuid[]) THEN RETURN OLD; END IF;
      IF TG_ARGV[2]='origin' AND NULLIF(current_setting('debugbundle.project_rule_write_context',true),'')::uuid=debugbundle_canonical_project(scope_id) THEN
        PERFORM debugbundle_assert_project_scope_write(scope_id);
      ELSE
        PERFORM debugbundle_assert_project_scope_write(scope_id);
        IF debugbundle_canonical_project(scope_id)<>scope_id THEN
          RAISE EXCEPTION 'project_consolidated' USING DETAIL=debugbundle_canonical_project(scope_id)::text;
        END IF;
      END IF;
      IF TG_OP='UPDATE' AND TG_TABLE_NAME='projects' AND
         ((to_jsonb(OLD)->'owner_user_id') IS DISTINCT FROM (to_jsonb(NEW)->'owner_user_id') OR (to_jsonb(OLD)->'organization_id') IS DISTINCT FROM (to_jsonb(NEW)->'organization_id')) THEN
        PERFORM 1 FROM project_legacy_bindings WHERE canonical_project_id=scope_id;
        IF FOUND THEN RAISE EXCEPTION 'project_has_origins'; END IF;
      END IF;
      IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END $$`,
  ...Object.entries(configurationRuntimeColumns).map(
    ([table, columns]) =>
      `CREATE TRIGGER ${table}_consolidation_guard BEFORE INSERT OR UPDATE OR DELETE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION guard_project_configuration('project_id','${columns}','${(PROJECT_SCOPED_RULE_TABLES as readonly string[]).includes(table) || ["availability_checks", "analytics_funnel_definitions", "analytics_flow_definitions", "project_github_repos"].includes(table) ? "origin" : "canonical"}')`
  ),
  `CREATE TRIGGER projects_consolidation_guard BEFORE UPDATE OF organization_id,owner_user_id,name,slug,environment_default,color_tag,
      automated_improvement_bundles_enabled,improvement_bundle_sensitivity ON projects
    FOR EACH ROW EXECUTE FUNCTION guard_project_configuration('id','updated_at')`
] as const;
