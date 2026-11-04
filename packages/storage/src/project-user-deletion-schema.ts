/** Narrow exception for real PostgreSQL FK actions after a locked user deletion.
 * Ordinary application writes, live users and unrelated rows keep normal guards. */
export const PROJECT_USER_DELETION_STATEMENTS = [
  `CREATE FUNCTION debugbundle_allow_user_cascade(relation_id oid,scope_id uuid,old_row jsonb,new_row jsonb,operation text) RETURNS boolean
 LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
 DECLARE user_id uuid; columns text[];
 BEGIN
   user_id:=NULLIF(current_setting('debugbundle.account_deletion_user',true),'')::uuid;
   IF user_id IS NULL OR pg_trigger_depth()<2 OR NOT COALESCE(scope_id=ANY(NULLIF(current_setting('debugbundle.account_deletion_projects',true),'')::uuid[]),false)
     OR EXISTS(SELECT 1 FROM users WHERE id=user_id) THEN RETURN false; END IF;
   IF operation='DELETE' THEN
     RETURN EXISTS(SELECT 1 FROM pg_constraint fk JOIN pg_attribute col ON col.attrelid=fk.conrelid AND col.attnum=fk.conkey[1]
       WHERE fk.conrelid=relation_id AND fk.contype='f' AND fk.confrelid='public.users'::regclass AND fk.confdeltype='c'
         AND cardinality(fk.conkey)=1 AND old_row->>col.attname=user_id::text);
   ELSIF operation='UPDATE' THEN
     SELECT array_agg(col.attname::text) INTO columns FROM pg_constraint fk JOIN pg_attribute col ON col.attrelid=fk.conrelid AND col.attnum=fk.conkey[1]
       WHERE fk.conrelid=relation_id AND fk.contype='f' AND fk.confrelid='public.users'::regclass AND fk.confdeltype='n'
         AND cardinality(fk.conkey)=1 AND old_row->>col.attname=user_id::text AND new_row->col.attname='null'::jsonb;
     RETURN COALESCE(cardinality(columns)>0 AND (new_row-columns-'updated_at')=(old_row-columns-'updated_at'),false);
   END IF;
   RETURN false;
 END $$`
] as const;
