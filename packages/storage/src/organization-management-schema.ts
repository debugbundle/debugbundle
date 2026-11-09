import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./migrations.js";
import { ORGANIZATION_CONFIGURATION_GUARD_STATEMENT } from "./organization-configuration-schema.js";

export const ORGANIZATION_MANAGEMENT_TABLES = [
  "organization_invites",
  "organization_ownership_transfers"
] as const;
export const ORGANIZATION_MANAGEMENT_BOOTSTRAP = [
  `CREATE TABLE organization_invites (
    id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email text NOT NULL, role text NOT NULL CHECK(role IN ('admin','member')),
    project_access text NOT NULL CHECK(project_access IN ('selected','all')),
    default_project_role text NOT NULL CHECK(default_project_role IN ('member','viewer')),
    project_ids uuid[] NOT NULL DEFAULT '{}' CHECK(cardinality(project_ids)<=100),
    CHECK ((role='member' AND project_access='selected') OR cardinality(project_ids)=0),
    invited_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    invite_token_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL, accepted_at timestamptz, canceled_at timestamptz,
    CHECK(expires_at>created_at)
  )`,
  `CREATE UNIQUE INDEX organization_invites_pending_email_key
    ON organization_invites(organization_id,lower(trim(email))) WHERE accepted_at IS NULL AND canceled_at IS NULL`,
  `CREATE TABLE organization_ownership_transfers (
    id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    requested_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    accept_token_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL, accepted_at timestamptz, canceled_at timestamptz,
    CHECK(requested_by_user_id<>recipient_user_id), CHECK(expires_at>created_at)
  )`,
  `CREATE UNIQUE INDEX organization_ownership_transfers_pending_key
    ON organization_ownership_transfers(organization_id) WHERE accepted_at IS NULL AND canceled_at IS NULL`,
  `CREATE INDEX organization_invites_retention_idx ON organization_invites((COALESCE(accepted_at,canceled_at,expires_at)))`,
  `CREATE INDEX organization_ownership_transfers_retention_idx ON organization_ownership_transfers((COALESCE(accepted_at,canceled_at,expires_at)))`
] as const;

export const ORGANIZATION_MANAGEMENT_MIGRATION = defineStorageSchemaMigration({
  id: "202611070004_add_organization_management",
  description:
    "Add accepted organization invitations and ownership transfer requests without rewriting memberships.",
  statements: [
    ...ORGANIZATION_MANAGEMENT_BOOTSTRAP.map((statement) =>
      statement
        .replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")
        .replace(/^CREATE UNIQUE INDEX /, "CREATE UNIQUE INDEX IF NOT EXISTS ")
        .replace(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ")
    ),
    ORGANIZATION_CONFIGURATION_GUARD_STATEMENT
  ]
});

export async function organizationManagementSchemaAvailable(db: Queryable): Promise<boolean> {
  const result = await db.query<{ available: boolean }>(
    `SELECT
    to_regclass('public.organization_invites') IS NOT NULL AND
    to_regclass('public.organization_ownership_transfers') IS NOT NULL AND EXISTS(
      SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('guard_project_configuration()')
        AND prosrc LIKE '%debugbundle.organization_owner_transfer%'
        AND prosrc LIKE '%debugbundle.organization_removal_org%')
    AND to_regclass('public.organization_invites_pending_email_key') IS NOT NULL
    AND to_regclass('public.organization_ownership_transfers_pending_key') IS NOT NULL
    AND to_regclass('public.organization_invites_retention_idx') IS NOT NULL
    AND to_regclass('public.organization_ownership_transfers_retention_idx') IS NOT NULL AS available`,
    []
  );
  return result.rows[0]?.available === true;
}
