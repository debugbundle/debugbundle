import { isSelfHostMode } from "../../shared-types/src/tier-capabilities.js";
import { randomUUID } from "node:crypto";
import type { OrganizationInvite } from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";
import { runInTransaction } from "./transaction.js";
import { canAdmitOrganizationPerson } from "./organization-person-cap.js";
import {
  OrganizationManagementError,
  type OrganizationManagementStore
} from "./organization-management-types.js";
import {
  assertManageableOrganizationRole,
  organizationRoleForEmail,
  requireOrganizationAdministrator,
  requireVerifiedUser
} from "./organization-management-shared.js";

const columns =
  "id AS invite_id,organization_id,email,role,project_access,default_project_role,project_ids,expires_at::text AS expires_at,created_at::text AS created_at";
type InviteRow = OrganizationInvite & Record<string, unknown>;

async function validateSelectedProjects(
  db: Queryable,
  organizationId: string,
  projectIds: string[]
): Promise<void> {
  if (projectIds.length === 0) return;
  const projects = await db.query<{ id: string }>(
    `SELECT id FROM projects WHERE organization_id=$1::uuid AND id=ANY($2::uuid[])
    AND id=debugbundle_canonical_project(id) ORDER BY id FOR UPDATE`,
    [organizationId, projectIds]
  );
  if (projects.rows.length !== projectIds.length)
    throw new OrganizationManagementError("invalid_project_scope");
}

export function createOrganizationInviteStore(
  db: Queryable
): Pick<
  OrganizationManagementStore,
  | "listOrganizationInvites"
  | "createOrganizationInvite"
  | "cancelOrganizationInvite"
  | "refreshOrganizationInvite"
  | "acceptOrganizationInvite"
> {
  return {
    async listOrganizationInvites(input) {
      await requireOrganizationAdministrator(db, input, false);
      const result = await db.query<InviteRow>(
        `SELECT ${columns} FROM organization_invites
        WHERE organization_id=$1::uuid AND accepted_at IS NULL AND canceled_at IS NULL AND expires_at>now()
        ORDER BY created_at DESC,id DESC LIMIT 1000`,
        [input.organization_id]
      );
      return result.rows;
    },
    async createOrganizationInvite(input) {
      return runInTransaction(db, async (tx) => {
        if (
          input.project_ids.length > 0 &&
          (input.role !== "member" || input.project_access !== "selected")
        )
          throw new OrganizationManagementError("invalid_project_scope");
        const actorRole = await requireOrganizationAdministrator(tx, input, true);
        assertManageableOrganizationRole(actorRole, null, input.role);
        await requireVerifiedUser(tx, input.actor_user_id);
        const email = input.email.trim().toLowerCase();
        assertManageableOrganizationRole(
          actorRole,
          await organizationRoleForEmail(tx, input.organization_id, email),
          input.role
        );
        if (!(await canAdmitOrganizationPerson(tx, input.organization_id, email)))
          throw new OrganizationManagementError("people_limit_reached");
        await validateSelectedProjects(tx, input.organization_id, input.project_ids);
        await tx.query(
          `UPDATE organization_invites SET canceled_at=now() WHERE organization_id=$1::uuid
          AND lower(trim(email))=$2 AND accepted_at IS NULL AND canceled_at IS NULL AND expires_at<=now()`,
          [input.organization_id, email]
        );
        const pending = await tx.query<{ id: string }>(
          `SELECT id FROM organization_invites WHERE organization_id=$1::uuid
          AND lower(trim(email))=$2 AND accepted_at IS NULL AND canceled_at IS NULL`,
          [input.organization_id, email]
        );
        if (pending.rows[0] !== undefined) throw new OrganizationManagementError("invite_exists");
        const result = await tx.query<InviteRow>(
          `INSERT INTO organization_invites(id,organization_id,email,role,project_access,default_project_role,project_ids,invited_by_user_id,invite_token_hash,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$7::uuid[],$8,$9,$10::timestamptz) RETURNING ${columns}`,
          [
            randomUUID(),
            input.organization_id,
            email,
            input.role,
            input.role === "admin" ? "all" : input.project_access,
            input.default_project_role,
            input.project_ids,
            input.actor_user_id,
            input.invite_token_hash,
            input.expires_at
          ]
        );
        const invite = result.rows[0];
        if (invite === undefined) throw new Error("organization_invite_insert_failed");
        return invite;
      });
    },
    async cancelOrganizationInvite(input) {
      return runInTransaction(db, async (tx) => {
        const actorRole = await requireOrganizationAdministrator(tx, input, true);
        const target = await tx.query<{ role: string }>(
          "SELECT role FROM organization_invites WHERE organization_id=$1::uuid AND id=$2::uuid AND accepted_at IS NULL AND canceled_at IS NULL",
          [input.organization_id, input.invite_id]
        );
        if (target.rows[0] === undefined) return false;
        assertManageableOrganizationRole(actorRole, target.rows[0].role);
        const result = await tx.query<{ id: string }>(
          "UPDATE organization_invites SET canceled_at=now() WHERE organization_id=$1::uuid AND id=$2::uuid AND accepted_at IS NULL AND canceled_at IS NULL RETURNING id",
          [input.organization_id, input.invite_id]
        );
        return result.rows[0] !== undefined;
      });
    },
    async refreshOrganizationInvite(input) {
      return runInTransaction(db, async (tx) => {
        const actorRole = await requireOrganizationAdministrator(tx, input, true);
        await requireVerifiedUser(tx, input.actor_user_id);
        const current = await tx.query<InviteRow>(
          `SELECT ${columns} FROM organization_invites
          WHERE id=$1::uuid AND organization_id=$2::uuid AND accepted_at IS NULL AND canceled_at IS NULL FOR UPDATE`,
          [input.invite_id, input.organization_id]
        );
        const invite = current.rows[0];
        if (invite === undefined) throw new OrganizationManagementError("not_found");
        await validateSelectedProjects(tx, input.organization_id, invite.project_ids);
        assertManageableOrganizationRole(
          actorRole,
          await organizationRoleForEmail(tx, input.organization_id, invite.email),
          invite.role
        );
        if (!(await canAdmitOrganizationPerson(tx, input.organization_id, invite.email)))
          throw new OrganizationManagementError("people_limit_reached");
        const result = await tx.query<InviteRow>(
          `UPDATE organization_invites SET invite_token_hash=$3,expires_at=$4::timestamptz,invited_by_user_id=$5::uuid
          WHERE id=$1::uuid AND organization_id=$2::uuid RETURNING ${columns}`,
          [
            input.invite_id,
            input.organization_id,
            input.invite_token_hash,
            input.expires_at,
            input.actor_user_id
          ]
        );
        return result.rows[0]!;
      });
    },
    async acceptOrganizationInvite(input) {
      return runInTransaction(db, async (tx) => {
        const user = await requireVerifiedUser(tx, input.user_id);
        // Lock the billing organisation before any project fence, consistently
        // with project invitations and organisation management.
        const scope = await tx.query<{ organization_id: string }>(
          `SELECT o.id AS organization_id FROM organizations o JOIN organization_invites i ON i.organization_id=o.id
          WHERE i.invite_token_hash=$1 AND (o.plan='business' OR ${isSelfHostMode() ? "true" : "false"}) AND o.suspended_at IS NULL FOR UPDATE OF o`,
          [input.invite_token_hash]
        );
        const org = scope.rows[0]?.organization_id;
        if (org === undefined) throw new OrganizationManagementError("invalid_invite");
        const result = await tx.query<InviteRow & { invited_by_user_id: string | null }>(
          `SELECT ${columns},invited_by_user_id FROM organization_invites
          WHERE invite_token_hash=$1 AND accepted_at IS NULL AND canceled_at IS NULL AND expires_at>$2::timestamptz FOR UPDATE`,
          [input.invite_token_hash, input.now]
        );
        const invite = result.rows[0];
        if (
          invite === undefined ||
          invite.email.trim().toLowerCase() !== user.email.trim().toLowerCase() ||
          invite.invited_by_user_id === null
        )
          throw new OrganizationManagementError("invalid_invite");
        const inviterRole = await requireOrganizationAdministrator(
          tx,
          {
            organization_id: org,
            actor_user_id: invite.invited_by_user_id,
            include_organization_grants: true
          },
          false
        );
        assertManageableOrganizationRole(inviterRole, null, invite.role);
        if (!(await canAdmitOrganizationPerson(tx, org, user.email)))
          throw new OrganizationManagementError("people_limit_reached");
        const prior = await tx.query<{
          role: string;
          suspended_at: string | null;
          grants_paused_at: string | null;
        }>(
          "SELECT role,suspended_at,grants_paused_at FROM organization_members WHERE organization_id=$1::uuid AND user_id=$2::uuid",
          [org, input.user_id]
        );
        if (prior.rows[0]?.suspended_at != null || prior.rows[0]?.grants_paused_at != null)
          throw new OrganizationManagementError("invalid_invite");
        // Accepting another invitation never silently replaces retained grants,
        // reactivates a suspended member, or appoints an existing peer admin.
        if (prior.rows[0] === undefined)
          await tx.query(
            `INSERT INTO organization_members(id,organization_id,user_id,role,project_access,default_project_role)
          VALUES($1,$2,$3,$4,$5,$6)`,
            [
              randomUUID(),
              org,
              input.user_id,
              invite.role,
              invite.project_access,
              invite.default_project_role
            ]
          );
        for (const projectId of [...invite.project_ids].sort()) {
          await tx.query("SELECT debugbundle_begin_project_rule_write($1::uuid)", [projectId]);
          const project = await tx.query<{ id: string }>(
            "SELECT id FROM projects WHERE id=$1::uuid AND organization_id=$2::uuid",
            [projectId, org]
          );
          if (project.rows[0] === undefined)
            throw new OrganizationManagementError("invalid_project_scope");
          await tx.query(
            `INSERT INTO project_members(id,project_id,user_id,role,invited_by_user_id)
            VALUES($1,$2,$3,$4,$5) ON CONFLICT(project_id,user_id) DO NOTHING`,
            [
              randomUUID(),
              projectId,
              input.user_id,
              invite.default_project_role,
              invite.invited_by_user_id
            ]
          );
        }
        await tx.query(
          "UPDATE organization_invites SET accepted_at=$2::timestamptz WHERE id=$1::uuid",
          [invite.invite_id, input.now]
        );
        return { organization_id: org };
      });
    }
  };
}
