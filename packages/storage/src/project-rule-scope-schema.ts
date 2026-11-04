/** Rule ownership/payload IDs remain original; scope and filter-name context are
 * explicit so a later edit never silently reinterprets an older rule. */
export const PROJECT_SCOPED_RULE_TABLES = [
  "capture_rules",
  "alert_rules",
  "agent_webhooks",
  "github_dispatch_rules"
] as const;
export const PROJECT_RULE_SCOPE_COLUMNS = PROJECT_SCOPED_RULE_TABLES.flatMap((table) => [
  `ALTER TABLE ${table} ADD COLUMN scope_origin_ids uuid[]`,
  `ALTER TABLE ${table} ADD COLUMN filter_project_id uuid REFERENCES projects(id) ON DELETE CASCADE`
]);

export const PROJECT_RULE_SCOPE_STATEMENTS = [
  `CREATE FUNCTION debugbundle_rule_actor_allowed(requested_id uuid,actor_id uuid,creator_id uuid,selfhost_access boolean) RETURNS boolean
    LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
      SELECT EXISTS(SELECT 1 FROM projects p JOIN organizations o ON o.id=p.organization_id
        WHERE p.id=debugbundle_canonical_project($1) AND o.suspended_at IS NULL AND
        ($2 IS NULL OR p.owner_user_id=$2 OR ((o.plan='team' OR $4) AND EXISTS(
          SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$2
            AND ($3 IS NULL OR $3=$2 OR pm.role='admin')))))
    $$`,
  `CREATE FUNCTION debugbundle_begin_project_rule_write(requested_id uuid) RETURNS boolean
    LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
    BEGIN
      PERFORM debugbundle_assert_canonical_project_write(requested_id);
      PERFORM set_config('debugbundle.project_rule_write_context',requested_id::text,true);
      RETURN true;
    END $$`,
  `CREATE FUNCTION snapshot_project_rule_scope() RETURNS trigger
    LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
    DECLARE root_id uuid; at_limit boolean;
    BEGIN
      PERFORM debugbundle_assert_project_scope_write(NEW.project_id);
      root_id:=debugbundle_canonical_project(NEW.project_id);
      IF TG_OP='UPDATE' AND NEW.project_id<>OLD.project_id THEN RAISE EXCEPTION 'rule_origin_immutable'; END IF;
      IF TG_OP='INSERT' THEN
        IF NEW.scope_origin_ids IS NULL THEN NEW.scope_origin_ids:=debugbundle_project_origins(NEW.project_id); END IF;
        IF NEW.filter_project_id IS NULL THEN NEW.filter_project_id:=NEW.project_id; END IF;
        PERFORM 1 FROM project_legacy_bindings WHERE canonical_project_id=root_id;
        IF FOUND THEN
          EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE project_id=ANY(debugbundle_project_origins($1)) OFFSET 4999 LIMIT 1)',TG_TABLE_NAME) INTO at_limit USING root_id;
          IF at_limit THEN RAISE EXCEPTION 'configuration_limit_exceeded'; END IF;
        END IF;
      END IF;
      IF (TG_OP='INSERT' OR NEW.scope_origin_ids IS DISTINCT FROM OLD.scope_origin_ids) AND
        (NEW.scope_origin_ids IS NULL OR cardinality(NEW.scope_origin_ids) NOT BETWEEN 1 AND 1000 OR
          NOT NEW.scope_origin_ids <@ debugbundle_project_origins(root_id) OR
          cardinality(NEW.scope_origin_ids)<>(SELECT count(DISTINCT origin_id) FROM unnest(NEW.scope_origin_ids) origin_id)) THEN
        RAISE EXCEPTION 'rule_scope_invalid';
      END IF;
      IF debugbundle_canonical_project(COALESCE(NEW.filter_project_id,NEW.project_id))<>root_id THEN
        RAISE EXCEPTION 'rule_filter_scope_invalid';
      END IF;
      RETURN NEW;
    END $$`,
  ...PROJECT_SCOPED_RULE_TABLES.map(
    (table) => `CREATE TRIGGER ${table}_scope_snapshot
    BEFORE INSERT OR UPDATE OF project_id,scope_origin_ids,filter_project_id ON ${table}
    FOR EACH ROW EXECUTE FUNCTION snapshot_project_rule_scope()`
  ),
  `CREATE FUNCTION debugbundle_rule_service_names(view_id uuid,origin_id uuid,names jsonb) RETURNS text[]
    LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
      SELECT CASE WHEN $3 IS NULL THEN NULL ELSE ARRAY(
        SELECT name FROM (
          SELECT inputs.input_name AS name FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof($3)='array' THEN $3 ELSE '[]'::jsonb END) requested(name)
          JOIN service_project_aliases views ON views.project_id=$1 AND views.name=requested.name
          JOIN service_definitions d ON d.id=views.service_definition_id AND d.origin_project_id=$2
          JOIN service_input_aliases inputs ON inputs.service_definition_id=d.id
          UNION SELECT requested.name FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof($3)='array' THEN $3 ELSE '[]'::jsonb END) requested(name)
            WHERE $1=$2 AND NOT EXISTS(SELECT 1 FROM service_project_aliases views WHERE views.project_id=$1 AND views.name=requested.name)
        ) resolved ORDER BY name COLLATE "C"
      ) END
    $$`,
  `CREATE FUNCTION debugbundle_rule_view_matcher(view_id uuid,filter_id uuid,matcher jsonb) RETURNS jsonb
    LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
      SELECT CASE WHEN $1<>debugbundle_canonical_project($1) OR jsonb_typeof($3->'services') IS DISTINCT FROM 'array' THEN $3
        ELSE jsonb_set($3,'{services}',COALESCE((SELECT jsonb_agg(name ORDER BY name COLLATE "C") FROM (
          SELECT DISTINCT COALESCE(current_view.name,requested.name) AS name
          FROM jsonb_array_elements_text($3->'services') requested(name)
          LEFT JOIN service_project_aliases original_view ON original_view.project_id=$2 AND original_view.name=requested.name
          LEFT JOIN service_project_aliases current_view ON current_view.project_id=$1
            AND current_view.service_definition_id=original_view.service_definition_id AND current_view.is_current
        ) names),'[]'::jsonb)) END
    $$`,
  `CREATE FUNCTION debugbundle_rule_view_names(view_id uuid,filter_id uuid,names jsonb) RETURNS text[]
    LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
      SELECT ARRAY(SELECT jsonb_array_elements_text(debugbundle_rule_view_matcher($1,$2,jsonb_build_object('services',COALESCE($3,'[]'::jsonb)))->'services'))
    $$`,
  `CREATE FUNCTION debugbundle_rule_view_filters(view_id uuid,filter_id uuid,filters jsonb) RETURNS jsonb
    LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
      SELECT CASE WHEN jsonb_typeof($3->'service')='array'
        THEN jsonb_set($3,'{service}',to_jsonb(debugbundle_rule_view_names($1,$2,$3->'service'))) ELSE $3 END
    $$`,
  `CREATE FUNCTION register_capture_rule_services() RETURNS trigger
    LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
    DECLARE view_id uuid; service_name text;
    BEGIN
      PERFORM debugbundle_assert_project_scope_write(NEW.project_id);
      view_id:=COALESCE(NEW.filter_project_id,NEW.project_id);
      FOR service_name IN SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(NEW.matcher->'services')='array' THEN NEW.matcher->'services' ELSE '[]'::jsonb END) LOOP
        PERFORM 1 FROM service_project_aliases WHERE project_id=view_id AND name=service_name;
        IF NOT FOUND THEN PERFORM debugbundle_observe_service(view_id,service_name); END IF;
      END LOOP;
      RETURN NEW;
    END $$`,
  `CREATE TRIGGER capture_rules_configured_services BEFORE INSERT OR UPDATE OF matcher,project_id,filter_project_id
    ON capture_rules FOR EACH ROW EXECUTE FUNCTION register_capture_rule_services()`
] as const;

export const CAPTURE_RULE_SERVICE_BACKFILL = `INSERT INTO service_definitions
  (id,project_id,origin_project_id,repository_default_project_id,name,input_name)
  SELECT gen_random_uuid(),project_id,project_id,project_id,name,name FROM (
    SELECT DISTINCT r.project_id,n.name FROM capture_rules r CROSS JOIN LATERAL
      jsonb_array_elements_text(CASE WHEN jsonb_typeof(r.matcher->'services')='array' THEN r.matcher->'services' ELSE '[]'::jsonb END) n(name)
    WHERE n.name<>''
  ) configured ORDER BY project_id,name COLLATE "C" ON CONFLICT(origin_project_id,input_name) DO NOTHING`;
