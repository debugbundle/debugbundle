import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";

export const SELFHOST_PROJECT_ACTOR_ROLE_STATEMENT = `CREATE OR REPLACE FUNCTION debugbundle_project_actor_role(
    requested_id uuid, actor_id uuid, allow_inherited boolean, selfhost_access boolean) RETURNS text
  LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
    SELECT CASE
      WHEN p.owner_user_id=$2 THEN 'owner'
      WHEN (o.plan='business' OR $4) AND $3 AND om.role='owner' THEN 'owner'
      WHEN (o.plan IN ('team','business') OR $4) AND (
        pm.role='admin' OR ((o.plan='business' OR $4) AND $3 AND om.role='admin' AND om.grants_paused_at IS NULL)) THEN 'admin'
      WHEN (o.plan IN ('team','business') OR $4) AND (
        pm.role='member' OR ((o.plan='business' OR $4) AND $3 AND om.project_access='all' AND om.grants_paused_at IS NULL
          AND om.default_project_role='member')) THEN 'member'
      WHEN (o.plan IN ('team','business') OR $4) AND (
        pm.role='viewer' OR ((o.plan='business' OR $4) AND $3 AND om.project_access='all' AND om.grants_paused_at IS NULL
          AND om.default_project_role='viewer')) THEN 'viewer'
      ELSE NULL END
    FROM projects p JOIN organizations o ON o.id=p.organization_id
    LEFT JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$2
    LEFT JOIN organization_members om ON om.organization_id=o.id AND om.user_id=$2
    WHERE p.id=debugbundle_canonical_project($1) AND o.suspended_at IS NULL
      AND om.suspended_at IS NULL
  $$`;
const readySql =
  "position('(o.plan=''business'' OR $4)' in pg_get_functiondef(to_regprocedure('public.debugbundle_project_actor_role(uuid,uuid,boolean,boolean)')))>0";
export const SELFHOST_ORGANIZATION_ACCESS_MIGRATION = defineStorageSchemaMigration({
  id: "202611080003_unlock_selfhost_organization_access",
  description:
    "Unlock self-hosted organisation features while retaining explicit inherited authority and suspension checks.",
  statements: [
    SELFHOST_PROJECT_ACTOR_ROLE_STATEMENT,
    `DO $$ BEGIN IF NOT (${readySql}) THEN RAISE EXCEPTION 'selfhost_organization_access_schema_incomplete'; END IF; END $$`
  ]
});
export async function selfhostOrganizationAccessSchemaAvailable(db: Queryable): Promise<boolean> {
  return (
    (await db.query<{ available: boolean }>(`SELECT (${readySql}) AS available`, [])).rows[0]
      ?.available === true
  );
}
