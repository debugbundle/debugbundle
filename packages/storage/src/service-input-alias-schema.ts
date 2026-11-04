export const SERVICE_INPUT_ALIAS_TABLE = `CREATE TABLE service_input_aliases (
  origin_project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  input_name text NOT NULL,
  service_definition_id uuid NOT NULL REFERENCES service_definitions(id) ON DELETE CASCADE,
  PRIMARY KEY(origin_project_id,input_name)
)`;

export const SERVICE_PROJECT_ALIAS_TABLE = `CREATE TABLE service_project_aliases (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  service_definition_id uuid NOT NULL REFERENCES service_definitions(id) ON DELETE CASCADE,
  is_current boolean NOT NULL DEFAULT true,
  PRIMARY KEY(project_id,name)
)`;

// Keep every deployed name reserved within its original namespace. Renaming a
// logical service cannot strand an older SDK or attach it to a different service.
export const SERVICE_INPUT_ALIAS_STATEMENTS = [
  "CREATE INDEX service_input_aliases_definition_idx ON service_input_aliases(service_definition_id)",
  "CREATE INDEX service_project_aliases_definition_idx ON service_project_aliases(service_definition_id)",
  "CREATE UNIQUE INDEX service_project_aliases_current_idx ON service_project_aliases(project_id,service_definition_id) WHERE is_current",
  `CREATE FUNCTION register_service_input_aliases() RETURNS trigger
    LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
    DECLARE alias_name text; alias_id uuid; alias_count integer; view_name text; suffix integer;
    BEGIN
      IF TG_OP='UPDATE' AND (OLD.origin_project_id<>NEW.origin_project_id OR OLD.input_name<>NEW.input_name) THEN
        RAISE EXCEPTION 'service_lineage_immutable';
      END IF;
      FOREACH alias_name IN ARRAY ARRAY[NEW.input_name,NEW.name] LOOP
        SELECT count(*) INTO alias_count FROM service_input_aliases WHERE service_definition_id=NEW.id;
        PERFORM 1 FROM service_input_aliases WHERE origin_project_id=NEW.origin_project_id AND input_name=alias_name;
        IF NOT FOUND AND alias_count>=1000 THEN RAISE EXCEPTION 'service_alias_limit_exceeded'; END IF;
        INSERT INTO service_input_aliases(origin_project_id,input_name,service_definition_id)
        VALUES(NEW.origin_project_id,alias_name,NEW.id)
        ON CONFLICT(origin_project_id,input_name) DO UPDATE SET service_definition_id=EXCLUDED.service_definition_id
          WHERE service_input_aliases.service_definition_id=EXCLUDED.service_definition_id
        RETURNING service_definition_id INTO alias_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'service_name_conflict'; END IF;
      END LOOP;
      UPDATE service_project_aliases SET is_current=false WHERE project_id=NEW.project_id AND service_definition_id=NEW.id AND name<>NEW.name;
      INSERT INTO service_project_aliases(project_id,name,service_definition_id)
      VALUES(NEW.project_id,NEW.name,NEW.id)
      ON CONFLICT(project_id,name) DO UPDATE SET is_current=true
        WHERE service_project_aliases.service_definition_id=EXCLUDED.service_definition_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'service_name_conflict'; END IF;
      IF NEW.origin_project_id<>NEW.project_id THEN
        PERFORM 1 FROM service_project_aliases WHERE project_id=NEW.origin_project_id AND service_definition_id=NEW.id;
        IF NOT FOUND THEN
          view_name:=NEW.input_name; suffix:=0;
          LOOP
            PERFORM 1 FROM service_project_aliases WHERE project_id=NEW.origin_project_id AND name=view_name;
            EXIT WHEN NOT FOUND;
            suffix:=suffix+1;
            IF suffix>1000 THEN RAISE EXCEPTION 'service_alias_limit_exceeded'; END IF;
            view_name:=left(NEW.input_name,80) || '~' || md5(NEW.origin_project_id::text || ':' || NEW.input_name || ':' || suffix::text);
          END LOOP;
          INSERT INTO service_project_aliases(project_id,name,service_definition_id) VALUES(NEW.origin_project_id,view_name,NEW.id);
        END IF;
      END IF;
      IF NEW.name<>NEW.input_name THEN
        UPDATE projects SET capture_rules_require_server=true WHERE id=NEW.project_id AND NOT capture_rules_require_server;
      END IF;
      RETURN NEW;
    END $$`,
  `CREATE TRIGGER service_definition_aliases AFTER INSERT OR UPDATE OF project_id,name,input_name,origin_project_id
    ON service_definitions FOR EACH ROW EXECUTE FUNCTION register_service_input_aliases()`,
  `CREATE FUNCTION debugbundle_service_input_name(origin_id uuid,service_name text) RETURNS text
    LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
      SELECT COALESCE((SELECT d.input_name FROM service_input_aliases a
        JOIN service_definitions d ON d.id=a.service_definition_id
        WHERE a.origin_project_id=$1 AND a.input_name=$2),$2)
    $$`,
  `CREATE FUNCTION debugbundle_service_input_names(origin_id uuid,service_name text) RETURNS text[]
    LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
      SELECT COALESCE((SELECT array_agg(a.input_name ORDER BY a.input_name COLLATE "C")
        FROM service_input_aliases a WHERE a.service_definition_id=(SELECT service_definition_id
          FROM service_input_aliases WHERE origin_project_id=$1 AND input_name=$2)),ARRAY[$2])
    $$`
] as const;
