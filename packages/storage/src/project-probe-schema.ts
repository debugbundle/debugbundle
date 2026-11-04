export const PROJECT_PROBE_COLUMNS = [
  "ALTER TABLE probe_activations ADD COLUMN IF NOT EXISTS trigger_token_hash text",
  "ALTER TABLE probe_activations ADD COLUMN scope_origin_ids uuid[]",
  "ALTER TABLE probe_activations ADD COLUMN service_definition_id uuid REFERENCES service_definitions(id) ON DELETE RESTRICT"
] as const;

export const PROJECT_PROBE_GUARD_STATEMENTS = [
  `CREATE FUNCTION guard_project_probe_scope() RETURNS trigger
    LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
    DECLARE root_id uuid;
    BEGIN
      PERFORM debugbundle_assert_project_scope_write(NEW.project_id);
      IF TG_OP='UPDATE' THEN
        IF (to_jsonb(NEW)-'deactivated_at') IS DISTINCT FROM (to_jsonb(OLD)-'deactivated_at') THEN
          RAISE EXCEPTION 'probe_scope_immutable';
        END IF;
        RETURN NEW;
      END IF;
      root_id:=debugbundle_canonical_project(NEW.project_id);
      PERFORM 1 FROM probe_activations WHERE project_id=ANY(debugbundle_project_origins(root_id))
        AND deactivated_at IS NULL AND expires_at>now() OFFSET 4 LIMIT 1;
      IF FOUND THEN RAISE EXCEPTION 'concurrent_activation_limit'; END IF;
      IF NEW.scope_origin_ids IS NULL THEN NEW.scope_origin_ids:=ARRAY[NEW.project_id]; END IF;
      IF cardinality(NEW.scope_origin_ids) NOT BETWEEN 1 AND 1000 OR
        NOT NEW.scope_origin_ids <@ debugbundle_project_origins(root_id) OR
        cardinality(NEW.scope_origin_ids)<>(SELECT count(DISTINCT origin_id) FROM unnest(NEW.scope_origin_ids) origin_id) THEN
        RAISE EXCEPTION 'probe_scope_invalid';
      END IF;
      IF NEW.service<>'*' THEN
        IF NEW.service_definition_id IS NULL THEN
          NEW.service_definition_id:=debugbundle_observe_service(NEW.project_id,NEW.service);
        END IF;
        PERFORM 1 FROM service_definitions WHERE id=NEW.service_definition_id AND
          origin_project_id=NEW.project_id AND input_name=NEW.service AND NEW.scope_origin_ids=ARRAY[NEW.project_id];
        IF NOT FOUND THEN RAISE EXCEPTION 'probe_scope_invalid'; END IF;
      ELSIF NEW.service_definition_id IS NOT NULL THEN RAISE EXCEPTION 'probe_scope_invalid'; END IF;
      RETURN NEW;
    END $$`,
  `CREATE TRIGGER probe_activations_scope_guard BEFORE INSERT OR UPDATE ON probe_activations
    FOR EACH ROW EXECUTE FUNCTION guard_project_probe_scope()`
] as const;

// Old activations, including wildcards, keep precisely their original namespace.
export const PROJECT_PROBE_BACKFILL = `UPDATE probe_activations p SET service_definition_id=a.service_definition_id
  FROM service_input_aliases a WHERE a.origin_project_id=p.project_id AND a.input_name=p.service AND p.service<>'*'`;
