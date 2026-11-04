// Existing rows retain NULL meaning exactly their original namespace. Only an
// intentional new credential captures the current canonical scope, once.
export const PROJECT_CREDENTIAL_SCOPE_STATEMENTS = [
  `CREATE FUNCTION snapshot_project_credential_scope() RETURNS trigger
    LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
    DECLARE current_root uuid; current_origins uuid[];
    BEGIN
      IF TG_OP='UPDATE' THEN
        IF NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.scope_origin_ids IS DISTINCT FROM OLD.scope_origin_ids THEN
          RAISE EXCEPTION 'credential_scope_immutable';
        END IF;
        RETURN NEW;
      END IF;
      PERFORM debugbundle_assert_canonical_project_write(NEW.project_id);
      current_root:=debugbundle_canonical_project(NEW.project_id);
      IF current_root<>NEW.project_id THEN RAISE EXCEPTION 'project_consolidated'; END IF;
      current_origins:=debugbundle_project_origins(NEW.project_id);
      IF cardinality(current_origins)>1000 THEN RAISE EXCEPTION 'credential_scope_invalid'; END IF;
      IF NEW.scope_origin_ids IS NULL THEN NEW.scope_origin_ids:=current_origins; END IF;
      IF cardinality(NEW.scope_origin_ids) NOT BETWEEN 1 AND 1000 OR NOT NEW.scope_origin_ids <@ current_origins OR
        cardinality(NEW.scope_origin_ids)<>(SELECT count(DISTINCT origin_id) FROM unnest(NEW.scope_origin_ids) origin_id) THEN
        RAISE EXCEPTION 'credential_scope_invalid';
      END IF;
      RETURN NEW;
    END $$`,
  `CREATE TRIGGER project_token_scope_snapshot BEFORE INSERT OR UPDATE OF project_id,scope_origin_ids
    ON project_tokens FOR EACH ROW EXECUTE FUNCTION snapshot_project_credential_scope()`,
  `CREATE TRIGGER agent_token_scope_snapshot BEFORE INSERT OR UPDATE OF project_id,scope_origin_ids
    ON agent_tokens FOR EACH ROW EXECUTE FUNCTION snapshot_project_credential_scope()`
] as const;
