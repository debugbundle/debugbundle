/** Captured metadata can predate its first incident or environment instance.
 * Reserve exact observed names without attributing historical nullable service IDs. */
export const SERVICE_OBSERVATION_TABLES = [
  ["availability_checks", "service_name"],
  ["improvement_opportunities", "service_name"],
  ["probe_activations", "service"],
  ["evidence_context_events", "service_name"],
  ["browser_recovery_events", "service_name"],
  ["analytics_rollup_uniques", "service"],
  ["analytics_incident_correlations", "service"],
  ["analytics_incident_session_links", "service"],
  ["analytics_session_rollups", "service"],
  ["analytics_route_rollups", "service"],
  ["analytics_action_rollups", "service"],
  ["analytics_funnel_rollups", "service"],
  ["analytics_transition_rollups", "service"],
  ["analytics_journey_samples", "service"],
  ["analytics_opportunities", "service"]
] as const;

export const SERVICE_OBSERVATION_STATEMENTS = [
  `CREATE FUNCTION debugbundle_observe_service(origin_id uuid,observed_name text) RETURNS uuid
    LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
    DECLARE owning_project uuid; definition_id uuid; display_name text; suffix integer;
    BEGIN
      IF observed_name IS NULL OR observed_name='' THEN RETURN NULL; END IF;
      SELECT service_definition_id INTO definition_id FROM service_input_aliases
        WHERE origin_project_id=origin_id AND input_name=observed_name;
      IF FOUND THEN RETURN definition_id; END IF;
      owning_project:=debugbundle_canonical_project(origin_id);
      PERFORM id FROM projects WHERE id=ANY(ARRAY[origin_id,owning_project]) ORDER BY id FOR UPDATE;
      IF debugbundle_canonical_project(origin_id)<>owning_project THEN
        RAISE EXCEPTION 'service_owner_changed_retry' USING ERRCODE='40001';
      END IF;
      SELECT service_definition_id INTO definition_id FROM service_input_aliases
        WHERE origin_project_id=origin_id AND input_name=observed_name;
      IF FOUND THEN RETURN definition_id; END IF;
      display_name:=CASE WHEN owning_project<>origin_id AND length(observed_name)>120
        THEN left(observed_name,80)||'~'||md5(origin_id::text||':'||observed_name) ELSE observed_name END; suffix:=0;
      LOOP
        PERFORM 1 FROM service_project_aliases WHERE project_id=owning_project AND name=display_name;
        EXIT WHEN NOT FOUND;
        IF suffix>1000 THEN RAISE EXCEPTION 'service_alias_limit_exceeded'; END IF;
        display_name:=left(observed_name,80)||'~'||md5(origin_id::text||':'||observed_name||CASE WHEN suffix=0 THEN '' ELSE ':'||suffix::text END);
        suffix:=suffix+1;
      END LOOP;
      INSERT INTO service_definitions(id,project_id,origin_project_id,repository_default_project_id,name,input_name)
        VALUES(gen_random_uuid(),owning_project,origin_id,origin_id,display_name,observed_name)
        RETURNING id INTO definition_id;
      RETURN definition_id;
    END $$`,
  `CREATE FUNCTION register_observed_service() RETURNS trigger
    LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
    BEGIN
      IF TG_TABLE_NAME='probe_activations' AND (to_jsonb(NEW)->>TG_ARGV[0])='*' THEN RETURN NEW; END IF;
      PERFORM debugbundle_observe_service(NEW.project_id,to_jsonb(NEW)->>TG_ARGV[0]);
      RETURN NEW;
    END $$`,
  ...SERVICE_OBSERVATION_TABLES.map(
    ([table, column]) =>
      `CREATE TRIGGER ${table}_service_observation BEFORE INSERT OR UPDATE OF project_id,${column}
     ON ${table} FOR EACH ROW EXECUTE FUNCTION register_observed_service('${column}')`
  )
] as const;

export const SERVICE_OBSERVATION_BACKFILL = `INSERT INTO service_definitions
  (id,project_id,origin_project_id,repository_default_project_id,name,input_name)
  SELECT gen_random_uuid(),project_id,project_id,project_id,observed_name,observed_name FROM (
    ${SERVICE_OBSERVATION_TABLES.map(
      ([table, column]) =>
        `SELECT project_id,${column} AS observed_name FROM ${table} WHERE ${column} IS NOT NULL AND ${column}<>''${table === "probe_activations" ? " AND service<>'*'" : ""}`
    ).join(" UNION ")}
  ) observed ORDER BY project_id,observed_name COLLATE "C"
  ON CONFLICT(origin_project_id,input_name) DO NOTHING`;
