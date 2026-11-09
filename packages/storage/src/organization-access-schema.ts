import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./migrations.js";

export const PROJECT_ACTOR_ROLE_STATEMENT = `CREATE OR REPLACE FUNCTION debugbundle_project_actor_role(
    requested_id uuid, actor_id uuid, allow_inherited boolean, selfhost_access boolean) RETURNS text
  LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
    SELECT CASE
      WHEN p.owner_user_id=$2 THEN 'owner'
      WHEN o.plan='business' AND $3 AND om.role='owner' THEN 'owner'
      WHEN (o.plan IN ('team','business') OR $4) AND (
        pm.role='admin' OR (o.plan='business' AND $3 AND om.role='admin' AND om.grants_paused_at IS NULL)) THEN 'admin'
      WHEN (o.plan IN ('team','business') OR $4) AND (
        pm.role='member' OR (o.plan='business' AND $3 AND om.project_access='all' AND om.grants_paused_at IS NULL
          AND om.default_project_role='member')) THEN 'member'
      WHEN (o.plan IN ('team','business') OR $4) AND (
        pm.role='viewer' OR (o.plan='business' AND $3 AND om.project_access='all' AND om.grants_paused_at IS NULL
          AND om.default_project_role='viewer')) THEN 'viewer'
      ELSE NULL END
    FROM projects p JOIN organizations o ON o.id=p.organization_id
    LEFT JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$2
    LEFT JOIN organization_members om ON om.organization_id=o.id AND om.user_id=$2
    WHERE p.id=debugbundle_canonical_project($1) AND o.suspended_at IS NULL
      AND om.suspended_at IS NULL
  $$`;

export const ORGANIZATION_RULE_ACTOR_STATEMENT = `CREATE OR REPLACE FUNCTION debugbundle_rule_actor_allowed(
    requested_id uuid,actor_id uuid,creator_id uuid,selfhost_access boolean) RETURNS boolean
  LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
    SELECT EXISTS(SELECT 1 FROM projects p JOIN organizations o ON o.id=p.organization_id
      WHERE p.id=debugbundle_canonical_project($1) AND o.suspended_at IS NULL AND (
        $2 IS NULL OR
        debugbundle_project_actor_role(p.id,$2,true,$4) IN ('owner','admin') OR (
          debugbundle_project_actor_role(p.id,$2,true,$4)='member' AND ($3 IS NULL OR $3=$2))))
  $$`;

export const ORGANIZATION_ACCESS_MIGRATION = defineStorageSchemaMigration({
  id: "202611070003_add_organization_project_grants",
  description:
    "Add explicit Business inherited grants and fixed Viewer-aware transactional authorization.",
  statements: [
    "ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS project_access text NOT NULL DEFAULT 'selected' CHECK (project_access IN ('selected','all'))",
    "ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS default_project_role text NOT NULL DEFAULT 'member' CHECK (default_project_role IN ('member','viewer'))",
    "ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS grants_paused_at timestamptz",
    PROJECT_ACTOR_ROLE_STATEMENT,
    ORGANIZATION_RULE_ACTOR_STATEMENT
  ]
});

export async function organizationAccessSchemaAvailable(db: Queryable): Promise<boolean> {
  const result = await db.query<{ available: boolean }>(
    `SELECT (SELECT COUNT(*)=3 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='organization_members' AND column_name IN ('project_access','default_project_role','grants_paused_at'))
      AND to_regprocedure('debugbundle_project_actor_role(uuid,uuid,boolean,boolean)') IS NOT NULL AS available`,
    []
  );
  return result.rows[0]?.available === true;
}
