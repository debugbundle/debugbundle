export const PROJECT_HEALTH_COLUMNS = [
  "ALTER TABLE availability_checks ADD COLUMN service_definition_id uuid REFERENCES service_definitions(id) ON DELETE RESTRICT"
] as const;
export const PROJECT_HEALTH_BACKFILL = `UPDATE availability_checks c SET service_definition_id=a.service_definition_id
  FROM service_input_aliases a WHERE a.origin_project_id=c.project_id AND a.input_name=c.service_name`;
export const PROJECT_HEALTH_STATEMENTS = [
  `CREATE FUNCTION link_health_check_service() RETURNS trigger
    LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
    BEGIN
      PERFORM debugbundle_assert_project_scope_write(NEW.project_id);
      IF TG_OP='UPDATE' AND NEW.project_id<>OLD.project_id THEN RAISE EXCEPTION 'health_check_origin_immutable'; END IF;
      IF TG_OP='UPDATE' AND NEW.service_name IS DISTINCT FROM OLD.service_name AND NEW.service_definition_id IS NOT DISTINCT FROM OLD.service_definition_id
        THEN NEW.service_definition_id:=NULL; END IF;
      IF NEW.service_name IS NULL THEN NEW.service_definition_id:=NULL; RETURN NEW; END IF;
      IF NEW.service_definition_id IS NULL THEN NEW.service_definition_id:=debugbundle_observe_service(NEW.project_id,NEW.service_name); END IF;
      PERFORM 1 FROM service_input_aliases a JOIN service_definitions d ON d.id=a.service_definition_id
        WHERE a.origin_project_id=NEW.project_id AND a.input_name=NEW.service_name AND d.id=NEW.service_definition_id AND d.origin_project_id=NEW.project_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'health_check_service_scope_invalid'; END IF;
      RETURN NEW;
    END $$`,
  `CREATE TRIGGER availability_checks_service_definition BEFORE INSERT OR UPDATE OF project_id,service_name,service_definition_id ON availability_checks
    FOR EACH ROW EXECUTE FUNCTION link_health_check_service()`
] as const;
