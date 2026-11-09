import { randomUUID } from "node:crypto";
import type { OrganizationPerson } from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";
import { runInTransaction } from "./transaction.js";
import {
  OrganizationManagementError,
  type OrganizationManagementStore
} from "./organization-management-types.js";
import {
  assertManageableOrganizationRole,
  requireOrganizationAdministrator,
  revokeOrganizationCredentials
} from "./organization-management-shared.js";

export function createOrganizationPeopleStore(
  db: Queryable
): Pick<
  OrganizationManagementStore,
  "listOrganizationPeople" | "updateOrganizationPerson" | "removeOrganizationPerson"
> {
  return {
    async listOrganizationPeople(input) {
      await requireOrganizationAdministrator(db, input, false);
      const result = await db.query<OrganizationPerson & Record<string, unknown>>(
        `
        WITH people AS (
          SELECT user_id FROM organization_members WHERE organization_id=$1::uuid
          UNION SELECT pm.user_id FROM project_members pm JOIN projects p ON p.id=pm.project_id WHERE p.organization_id=$1::uuid
          UNION SELECT owner_user_id FROM projects WHERE organization_id=$1::uuid AND owner_user_id IS NOT NULL
        ) SELECT u.id AS user_id,u.email,om.role,COALESCE(om.project_access,'selected') AS project_access,
          COALESCE(om.default_project_role,'member') AS default_project_role,
          om.suspended_at::text AS suspended_at,om.grants_paused_at::text AS grants_paused_at,
          (SELECT COUNT(*)::integer FROM project_members pm JOIN projects p ON p.id=pm.project_id
            WHERE pm.user_id=u.id AND p.organization_id=$1::uuid) AS direct_project_count
        FROM people JOIN users u ON u.id=people.user_id
        LEFT JOIN organization_members om ON om.organization_id=$1::uuid AND om.user_id=u.id
        ORDER BY CASE om.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,lower(u.email),u.id
        LIMIT 1000`,
        [input.organization_id]
      );
      return result.rows;
    },
    async updateOrganizationPerson(input) {
      await runInTransaction(db, async (tx) => {
        const actorRole = await requireOrganizationAdministrator(tx, input, true);
        const target = await tx.query<{ role: string | null; grants_paused_at: string | null }>(
          `
          SELECT om.role,om.grants_paused_at::text AS grants_paused_at FROM users u LEFT JOIN organization_members om
            ON om.user_id=u.id AND om.organization_id=$1::uuid
          WHERE u.id=$2::uuid AND (om.id IS NOT NULL OR EXISTS(
            SELECT 1 FROM project_members pm JOIN projects p ON p.id=pm.project_id
            WHERE pm.user_id=u.id AND p.organization_id=$1::uuid))`,
          [input.organization_id, input.user_id]
        );
        const row = target.rows[0];
        if (row === undefined) throw new OrganizationManagementError("not_found");
        assertManageableOrganizationRole(actorRole, row.role, input.changes.role);
        const changes = input.changes;
        const reviewGrants =
          changes.role !== undefined ||
          changes.project_access !== undefined ||
          changes.default_project_role !== undefined;
        if (reviewGrants && row.grants_paused_at !== null && actorRole !== "owner")
          throw new OrganizationManagementError("forbidden");
        await tx.query(
          `INSERT INTO organization_members(id,organization_id,user_id,role,project_access,default_project_role,suspended_at)
          VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $7::boolean THEN now() END)
          ON CONFLICT(organization_id,user_id) DO UPDATE SET
            role=COALESCE($8,organization_members.role),project_access=COALESCE($9,organization_members.project_access),
            default_project_role=COALESCE($10,organization_members.default_project_role),
            suspended_at=CASE WHEN $7::boolean IS NULL THEN organization_members.suspended_at WHEN $7 THEN COALESCE(organization_members.suspended_at,now()) END,
            grants_paused_at=CASE WHEN $11::boolean THEN NULL ELSE organization_members.grants_paused_at END`,
          [
            randomUUID(),
            input.organization_id,
            input.user_id,
            changes.role ?? "member",
            changes.project_access ?? "selected",
            changes.default_project_role ?? "member",
            changes.suspended ?? null,
            changes.role ?? null,
            changes.project_access ?? null,
            changes.default_project_role ?? null,
            reviewGrants
          ]
        );
        if (changes.suspended === true)
          await revokeOrganizationCredentials(tx, input.organization_id, input.user_id);
      });
    },
    async removeOrganizationPerson(input) {
      await runInTransaction(db, async (tx) => {
        const actorRole = await requireOrganizationAdministrator(tx, input, true);
        const target = await tx.query<{
          role: string | null;
          email: string;
          owns_project: boolean;
        }>(
          `
          SELECT om.role,u.email,EXISTS(SELECT 1 FROM projects p WHERE p.organization_id=$1::uuid AND p.owner_user_id=u.id) AS owns_project
          FROM users u LEFT JOIN organization_members om ON om.user_id=u.id AND om.organization_id=$1::uuid
          WHERE u.id=$2::uuid AND (om.id IS NOT NULL OR EXISTS(SELECT 1 FROM project_members pm
            JOIN projects p ON p.id=pm.project_id WHERE pm.user_id=u.id AND p.organization_id=$1::uuid))`,
          [input.organization_id, input.user_id]
        );
        const row = target.rows[0];
        if (row === undefined) throw new OrganizationManagementError("not_found");
        assertManageableOrganizationRole(actorRole, row.role);
        if (row.owns_project) throw new OrganizationManagementError("forbidden");
        // Acquire the complete ordered project fence before touching retained-origin configuration.
        await tx.query(
          `SELECT debugbundle_assert_project_scope_write(id) FROM projects
          WHERE organization_id=$1::uuid AND id=debugbundle_canonical_project(id) ORDER BY id`,
          [input.organization_id]
        );
        await tx.query(
          "DELETE FROM organization_members WHERE organization_id=$1::uuid AND user_id=$2::uuid",
          [input.organization_id, input.user_id]
        );
        await tx.query(
          "SELECT set_config('debugbundle.organization_removal_org',$1,true),set_config('debugbundle.organization_removal_user',$2,true)",
          [input.organization_id, input.user_id]
        );
        for (const table of ["github_dispatch_rules", "agent_webhooks", "alert_rules"] as const) {
          await tx.query(
            `DELETE FROM ${table} rules USING projects p WHERE p.id=rules.project_id AND p.organization_id=$1::uuid AND rules.created_by_user_id=$2::uuid`,
            [input.organization_id, input.user_id]
          );
        }
        await tx.query(
          "DELETE FROM project_members pm USING projects p WHERE p.id=pm.project_id AND p.organization_id=$1::uuid AND pm.user_id=$2::uuid",
          [input.organization_id, input.user_id]
        );
        await tx.query(
          `UPDATE project_invites invites SET canceled_at=now() FROM projects p
          WHERE p.id=invites.project_id AND p.organization_id=$1::uuid AND (lower(trim(invites.email))=lower(trim($2)) OR invites.invited_by_user_id=$3::uuid)
            AND invites.accepted_at IS NULL AND invites.canceled_at IS NULL`,
          [input.organization_id, row.email, input.user_id]
        );
        await tx.query(
          `UPDATE organization_invites SET canceled_at=now() WHERE organization_id=$1::uuid
          AND (lower(trim(email))=lower(trim($2)) OR invited_by_user_id=$3::uuid) AND accepted_at IS NULL AND canceled_at IS NULL`,
          [input.organization_id, row.email, input.user_id]
        );
        await tx.query(
          `UPDATE organization_ownership_transfers SET canceled_at=now() WHERE organization_id=$1::uuid
          AND (requested_by_user_id=$2::uuid OR recipient_user_id=$2::uuid) AND accepted_at IS NULL AND canceled_at IS NULL`,
          [input.organization_id, input.user_id]
        );
        await revokeOrganizationCredentials(tx, input.organization_id, input.user_id);
      });
    }
  };
}
