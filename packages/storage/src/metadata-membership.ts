import type {
  LeaveProjectMembershipResult,
  PostgresMetadataStore,
  ProjectMemberRecord,
  Queryable,
  RemoveProjectMemberResult,
  UpdateProjectMemberRoleResult
} from "./types.js";
import { mapProjectMemberRow } from "./metadata-project-shared.js";
import { deleteProjectMemberOwnedAutomation } from "./metadata-shared.js";

export function createMetadataMembership(
  db: Queryable
): Pick<
  PostgresMetadataStore,
  "updateProjectMemberRole" | "removeProjectMember" | "leaveProjectMembership"
> {
  return {
    async updateProjectMemberRole(input: {
      project_id: string;
      actor_user_id: string;
      user_id: string;
      role: "admin" | "member";
    }): Promise<UpdateProjectMemberRoleResult | null> {
      const scopeResult = await db.query<
        { actor_role: "owner" | "admin" | "member" | null } & Record<string, unknown>
      >(
        `
          SELECT
            CASE
              WHEN p.owner_user_id = $2::uuid THEN 'owner'
              ELSE actor_membership.role
            END AS actor_role
          FROM projects p
          LEFT JOIN project_members actor_membership
            ON actor_membership.project_id = p.id
           AND actor_membership.user_id = $2::uuid
          WHERE p.id = $1::uuid
            AND (p.owner_user_id = $2::uuid OR actor_membership.user_id IS NOT NULL)
          LIMIT 1
        `,
        [input.project_id, input.actor_user_id]
      );

      const scope = scopeResult.rows[0];
      if (scope === undefined || (scope.actor_role !== "owner" && scope.actor_role !== "admin")) {
        return null;
      }

      const ownerResult = await db.query<{
        owner_user_id: string;
        owner_email: string;
        created_at: string;
      }>(
        `
          SELECT
            p.owner_user_id,
            owner_user.email AS owner_email,
            p.created_at::text AS created_at
          FROM projects p
          JOIN users owner_user ON owner_user.id = p.owner_user_id
          WHERE p.id = $1::uuid
          LIMIT 1
        `,
        [input.project_id]
      );

      const owner = ownerResult.rows[0];
      if (owner !== undefined && owner.owner_user_id === input.user_id) {
        return {
          kind: "owner_role_change_forbidden",
          member: {
            user_id: owner.owner_user_id,
            email: owner.owner_email,
            role: "owner",
            membership_type: "owner",
            created_at: owner.created_at
          }
        };
      }

      const updatedMemberResult = await db.query<ProjectMemberRecord & Record<string, unknown>>(
        `
          UPDATE project_members pm
          SET role = $3, updated_at = now()
          FROM users member_user
          WHERE pm.project_id = $1::uuid
            AND pm.user_id = $2::uuid
            AND member_user.id = pm.user_id
          RETURNING
            pm.user_id,
            member_user.email,
            pm.role,
            'collaborator' AS membership_type,
            pm.created_at::text AS created_at
        `,
        [input.project_id, input.user_id, input.role]
      );

      const member = updatedMemberResult.rows[0];
      if (member === undefined) {
        return null;
      }

      return {
        kind: "updated",
        member: mapProjectMemberRow(member)
      };
    },

    async removeProjectMember(input: {
      project_id: string;
      actor_user_id: string;
      user_id: string;
    }): Promise<RemoveProjectMemberResult | null> {
      const scopeResult = await db.query<
        { actor_role: "owner" | "admin" | "member" | null } & Record<string, unknown>
      >(
        `
          SELECT
            CASE
              WHEN p.owner_user_id = $2::uuid THEN 'owner'
              ELSE actor_membership.role
            END AS actor_role
          FROM projects p
          LEFT JOIN project_members actor_membership
            ON actor_membership.project_id = p.id
           AND actor_membership.user_id = $2::uuid
          WHERE p.id = $1::uuid
            AND (p.owner_user_id = $2::uuid OR actor_membership.user_id IS NOT NULL)
          LIMIT 1
        `,
        [input.project_id, input.actor_user_id]
      );

      const scope = scopeResult.rows[0];
      if (scope === undefined || (scope.actor_role !== "owner" && scope.actor_role !== "admin")) {
        return null;
      }

      const ownerResult = await db.query<{
        owner_user_id: string;
        owner_email: string;
        created_at: string;
      }>(
        `
          SELECT
            p.owner_user_id,
            owner_user.email AS owner_email,
            p.created_at::text AS created_at
          FROM projects p
          JOIN users owner_user ON owner_user.id = p.owner_user_id
          WHERE p.id = $1::uuid
          LIMIT 1
        `,
        [input.project_id]
      );

      const owner = ownerResult.rows[0];
      if (owner !== undefined && owner.owner_user_id === input.user_id) {
        return {
          kind: "owner_removal_forbidden",
          member: {
            user_id: owner.owner_user_id,
            email: owner.owner_email,
            role: "owner",
            membership_type: "owner",
            created_at: owner.created_at
          }
        };
      }

      const deletedMemberResult = await db.query<ProjectMemberRecord & Record<string, unknown>>(
        `
          DELETE FROM project_members pm
          USING users member_user
          WHERE pm.project_id = $1::uuid
            AND pm.user_id = $2::uuid
            AND member_user.id = pm.user_id
          RETURNING
            pm.user_id,
            member_user.email,
            pm.role,
            'collaborator' AS membership_type,
            pm.created_at::text AS created_at
        `,
        [input.project_id, input.user_id]
      );

      const member = deletedMemberResult.rows[0];
      if (member === undefined) {
        return null;
      }

      await deleteProjectMemberOwnedAutomation(db, {
        project_id: input.project_id,
        user_id: input.user_id
      });

      return {
        kind: "removed",
        member: mapProjectMemberRow(member)
      };
    },

    async leaveProjectMembership(input: {
      project_id: string;
      user_id: string;
    }): Promise<LeaveProjectMembershipResult | null> {
      const ownerResult = await db.query<{
        owner_user_id: string;
        owner_email: string;
        created_at: string;
      }>(
        `
          SELECT
            p.owner_user_id,
            owner_user.email AS owner_email,
            p.created_at::text AS created_at
          FROM projects p
          JOIN users owner_user ON owner_user.id = p.owner_user_id
          LEFT JOIN project_members actor_membership
            ON actor_membership.project_id = p.id
           AND actor_membership.user_id = $2::uuid
          WHERE p.id = $1::uuid
            AND (p.owner_user_id = $2::uuid OR actor_membership.user_id IS NOT NULL)
          LIMIT 1
        `,
        [input.project_id, input.user_id]
      );

      const owner = ownerResult.rows[0];
      if (owner === undefined) {
        return null;
      }

      if (owner.owner_user_id === input.user_id) {
        return {
          kind: "owner_leave_forbidden",
          member: {
            user_id: owner.owner_user_id,
            email: owner.owner_email,
            role: "owner",
            membership_type: "owner",
            created_at: owner.created_at
          }
        };
      }

      const deletedMemberResult = await db.query<ProjectMemberRecord & Record<string, unknown>>(
        `
          DELETE FROM project_members pm
          USING users member_user
          WHERE pm.project_id = $1::uuid
            AND pm.user_id = $2::uuid
            AND member_user.id = pm.user_id
          RETURNING
            pm.user_id,
            member_user.email,
            pm.role,
            'collaborator' AS membership_type,
            pm.created_at::text AS created_at
        `,
        [input.project_id, input.user_id]
      );

      const member = deletedMemberResult.rows[0];
      if (member === undefined) {
        return null;
      }

      await deleteProjectMemberOwnedAutomation(db, {
        project_id: input.project_id,
        user_id: input.user_id
      });

      return {
        kind: "left",
        member: mapProjectMemberRow(member)
      };
    }
  };
}
