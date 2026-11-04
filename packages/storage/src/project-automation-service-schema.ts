export const AUTOMATION_SERVICE_BACKFILL = `INSERT INTO service_definitions
  (id,project_id,origin_project_id,repository_default_project_id,name,input_name)
  SELECT gen_random_uuid(),project_id,project_id,project_id,name,name FROM (
    SELECT DISTINCT project_id,n.name FROM agent_webhooks r CROSS JOIN LATERAL
      jsonb_array_elements_text(CASE WHEN jsonb_typeof(r.filters->'service')='array' THEN r.filters->'service' ELSE '[]'::jsonb END) n(name)
    UNION SELECT DISTINCT project_id,unnest(services) AS name FROM github_dispatch_rules
  ) configured WHERE name<>'' ORDER BY project_id,name COLLATE "C"
  ON CONFLICT(origin_project_id,input_name) DO NOTHING`;

export const AUTOMATION_SERVICE_STATEMENTS = [
  `CREATE FUNCTION register_automation_rule_services() RETURNS trigger
    LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
    DECLARE view_id uuid; service_name text; names jsonb; row_value jsonb;
    BEGIN
      PERFORM debugbundle_assert_project_scope_write(NEW.project_id);
      view_id:=COALESCE(NEW.filter_project_id,NEW.project_id);
      row_value:=to_jsonb(NEW);
      names:=CASE WHEN TG_TABLE_NAME='agent_webhooks' THEN row_value->'filters'->'service' ELSE row_value->'services' END;
      FOR service_name IN SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(names)='array' THEN names ELSE '[]'::jsonb END) LOOP
        PERFORM 1 FROM service_project_aliases WHERE project_id=view_id AND name=service_name;
        IF NOT FOUND THEN PERFORM debugbundle_observe_service(view_id,service_name); END IF;
      END LOOP;
      RETURN NEW;
    END $$`,
  `CREATE TRIGGER agent_webhooks_configured_services BEFORE INSERT OR UPDATE OF filters,project_id,filter_project_id
    ON agent_webhooks FOR EACH ROW EXECUTE FUNCTION register_automation_rule_services()`,
  `CREATE TRIGGER github_dispatch_rules_configured_services BEFORE INSERT OR UPDATE OF services,project_id,filter_project_id
    ON github_dispatch_rules FOR EACH ROW EXECUTE FUNCTION register_automation_rule_services()`
] as const;
