/** Read-time names never join privacy identities across historical projects. */
export const PROJECT_ANALYTICS_COLUMNS = [
  "analytics_funnel_definitions",
  "analytics_bundle_generations"
].map((table) => `ALTER TABLE ${table} ADD COLUMN scope_origin_ids uuid[]`);
export const PROJECT_ANALYTICS_STATEMENTS = [
  `CREATE FUNCTION debugbundle_service_matches(view_id uuid,origin_id uuid,captured_name text,selected_name text) RETURNS boolean
 LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT selected_name IS NULL OR EXISTS(SELECT 1 FROM service_input_aliases input JOIN service_project_aliases view
   ON view.service_definition_id=input.service_definition_id
   WHERE input.origin_project_id=origin_id AND input.input_name=captured_name AND view.project_id=view_id AND view.name=selected_name)
 OR (captured_name=selected_name AND NOT EXISTS(SELECT 1 FROM service_input_aliases input WHERE input.origin_project_id=origin_id AND input.input_name=captured_name))
 $$`,
  `CREATE FUNCTION snapshot_analytics_resource_scope() RETURNS trigger
 LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
 BEGIN
   IF TG_OP='INSERT' THEN
     PERFORM debugbundle_assert_project_scope_write(NEW.project_id);
     IF NEW.scope_origin_ids IS NULL THEN NEW.scope_origin_ids:=debugbundle_project_origins(NEW.project_id); END IF;
     IF NEW.scope_origin_ids<>debugbundle_project_origins(NEW.project_id) THEN RAISE EXCEPTION 'analytics_scope_invalid'; END IF;
   ELSIF NEW.project_id<>OLD.project_id OR NEW.scope_origin_ids IS DISTINCT FROM OLD.scope_origin_ids THEN
     RAISE EXCEPTION 'analytics_scope_immutable';
   END IF;
   RETURN NEW;
 END $$`,
  ...["analytics_funnel_definitions", "analytics_bundle_generations"].map(
    (table) =>
      `CREATE TRIGGER ${table}_scope_snapshot BEFORE INSERT OR UPDATE OF project_id,scope_origin_ids ON ${table} FOR EACH ROW EXECUTE FUNCTION snapshot_analytics_resource_scope()`
  )
] as const;
