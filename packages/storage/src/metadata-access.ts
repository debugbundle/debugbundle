import { type TierName } from "../../shared-types/src/index.js";
import {
  resolveMemberTokenAndRecordUsage,
  resolveProjectTokenAndRecordUsage
} from "./token-usage-store.js";
import type {
  PostgresMetadataStore,
  ProjectAccessRecord,
  ProjectInviteRecord,
  ProjectMemberRecord,
  Queryable,
  ResolveMemberResult,
  ResolveProjectResult
} from "./types.js";
import {
  mapProjectMemberRow,
  applyProjectAccessSuspension,
  mapProjectInviteRow
} from "./metadata-project-shared.js";

export function createMetadataAccess(
  db: Queryable
): Pick<
  PostgresMetadataStore,
  | "resolveProjectByTokenHash"
  | "resolveMemberByTokenHash"
  | "resolveProjectAccessForUser"
  | "listMembersForProject"
  | "listPendingInvitesForProject"
> {
  return {
    async resolveProjectByTokenHash(tokenHash: string): Promise<ResolveProjectResult | null> {
      return resolveProjectTokenAndRecordUsage(db, tokenHash);
    },

    async resolveMemberByTokenHash(tokenHash: string): Promise<ResolveMemberResult | null> {
      return resolveMemberTokenAndRecordUsage(db, tokenHash);
    },

    async resolveProjectAccessForUser(input): Promise<ProjectAccessRecord | null> {
      const result = await db.query<ProjectAccessRecord & Record<string, unknown>>(
        `
          SELECT
            p.id AS project_id,
            p.name AS project_name,
            p.color_tag AS project_color_tag,
            p.organization_id,
            p.owner_user_id,
            owner_user.email AS owner_email,
            CASE
              WHEN p.owner_user_id = $1::uuid THEN 'owned'
              ELSE 'shared'
            END AS relationship,
            CASE
              WHEN p.owner_user_id <> $1::uuid THEN 'shared_with_you'
              WHEN EXISTS (
                SELECT 1
                FROM project_members shared_members
                WHERE shared_members.project_id = p.id
              )
                OR EXISTS (
                  SELECT 1
                  FROM project_invites pending_invites
                  WHERE pending_invites.project_id = p.id
                    AND pending_invites.accepted_at IS NULL
                    AND pending_invites.canceled_at IS NULL
                    AND pending_invites.expires_at > now()
                )
                THEN 'shared_by_you'
              ELSE 'private'
            END AS sharing_state,
            CASE
              WHEN p.owner_user_id = $1::uuid THEN 'owner'
              ELSE pm.role
            END AS effective_role,
            COALESCE(org.plan, 'free') AS organization_plan
          FROM projects p
          JOIN organizations org ON org.id = p.organization_id
          JOIN users owner_user ON owner_user.id = p.owner_user_id
          LEFT JOIN project_members pm
            ON pm.project_id = p.id
           AND pm.user_id = $1::uuid
          WHERE p.id = $2::uuid
            AND (p.owner_user_id = $1::uuid OR pm.user_id IS NOT NULL)
          LIMIT 1
        `,
        [input.user_id, input.project_id]
      );

      const access = result.rows[0] ?? null;
      return access === null ? null : applyProjectAccessSuspension(access);
    },

    async listMembersForProject(input: {
      project_id: string;
      user_id: string;
    }): Promise<{ owner_plan: TierName; members: ProjectMemberRecord[] } | null> {
      const access = await db.query<{ owner_plan: TierName } & Record<string, unknown>>(
        `
          SELECT COALESCE(org.plan, 'free') AS owner_plan
          FROM projects p
          JOIN organizations org ON org.id = p.organization_id
          LEFT JOIN project_members actor_membership
            ON actor_membership.project_id = p.id
           AND actor_membership.user_id = $2::uuid
          WHERE p.id = $1::uuid
            AND (
              p.owner_user_id = $2::uuid
              OR actor_membership.user_id IS NOT NULL
            )
          LIMIT 1
        `,
        [input.project_id, input.user_id]
      );

      const scope = access.rows[0];
      if (scope === undefined) {
        return null;
      }

      const membersResult = await db.query<ProjectMemberRecord & Record<string, unknown>>(
        `
          SELECT
            p.owner_user_id AS user_id,
            owner_user.email,
            'owner' AS role,
            'owner' AS membership_type,
            owner_user.avatar_object_key,
            p.created_at::text AS created_at
          FROM projects p
          JOIN users owner_user ON owner_user.id = p.owner_user_id
          WHERE p.id = $1::uuid

          UNION ALL

          SELECT
            pm.user_id,
            member_user.email,
            pm.role,
            'collaborator' AS membership_type,
            member_user.avatar_object_key,
            pm.created_at::text AS created_at
          FROM project_members pm
          JOIN users member_user ON member_user.id = pm.user_id
          WHERE pm.project_id = $1::uuid

          ORDER BY membership_type ASC, created_at ASC, user_id ASC
        `,
        [input.project_id]
      );

      return {
        owner_plan: scope.owner_plan,
        members: membersResult.rows.map(mapProjectMemberRow)
      };
    },

    async listPendingInvitesForProject(input: {
      project_id: string;
      user_id: string;
      now: string;
    }): Promise<ProjectInviteRecord[] | null> {
      const access = await db.query<{ project_id: string }>(
        `
          SELECT p.id AS project_id
          FROM projects p
          LEFT JOIN project_members actor_membership
            ON actor_membership.project_id = p.id
           AND actor_membership.user_id = $2::uuid
          WHERE p.id = $1::uuid
            AND (
              p.owner_user_id = $2::uuid
              OR actor_membership.role = 'admin'
            )
          LIMIT 1
        `,
        [input.project_id, input.user_id]
      );

      if (access.rows[0] === undefined) {
        return null;
      }

      const invitesResult = await db.query<ProjectInviteRecord & Record<string, unknown>>(
        `
          SELECT
            id AS invite_id,
            project_id,
            email,
            role,
            invited_by_user_id,
            accepted_at::text AS accepted_at,
            canceled_at::text AS canceled_at,
            expires_at::text AS expires_at,
            created_at::text AS created_at
          FROM project_invites
          WHERE project_id = $1::uuid
            AND accepted_at IS NULL
            AND canceled_at IS NULL
            AND expires_at > $2::timestamptz
          ORDER BY created_at DESC, id DESC
        `,
        [input.project_id, input.now]
      );

      return invitesResult.rows.map(mapProjectInviteRow);
    }
  };
}
