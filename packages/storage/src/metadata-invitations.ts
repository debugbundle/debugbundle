import { randomUUID } from "node:crypto";
import { getTierCapabilities, type TierName } from "../../shared-types/src/index.js";
import type {
  CreateProjectInviteResult,
  PostgresMetadataStore,
  ProjectInviteRecord,
  ProjectMemberRecord,
  Queryable
} from "./types.js";
import { mapProjectMemberRow, mapProjectInviteRow } from "./metadata-project-shared.js";

export function createMetadataInvitations(
  db: Queryable
): Pick<
  PostgresMetadataStore,
  "createInviteForProject" | "cancelInviteForProject" | "acceptProjectInviteForUser"
> {
  return {
    async createInviteForProject(input: {
      project_id: string;
      user_id: string;
      email: string;
      role: "admin" | "member";
      invited_by_user_id: string;
      invite_token_hash: string;
      expires_at: string;
    }): Promise<CreateProjectInviteResult | null> {
      const scopeResult = await db.query<
        {
          owner_plan: TierName;
          actor_role: "owner" | "admin" | "member" | null;
          actor_membership_type: "owner" | "collaborator";
        } & Record<string, unknown>
      >(
        `
          SELECT
            COALESCE(org.plan, 'free') AS owner_plan,
            CASE
              WHEN p.owner_user_id = $2::uuid THEN 'owner'
              ELSE actor_membership.role
            END AS actor_role,
            CASE
              WHEN p.owner_user_id = $2::uuid THEN 'owner'
              ELSE 'collaborator'
            END AS actor_membership_type
          FROM projects p
          JOIN organizations org ON org.id = p.organization_id
          LEFT JOIN project_members actor_membership
            ON actor_membership.project_id = p.id
           AND actor_membership.user_id = $2::uuid
          WHERE p.id = $1::uuid
            AND (p.owner_user_id = $2::uuid OR actor_membership.user_id IS NOT NULL)
          LIMIT 1
        `,
        [input.project_id, input.user_id]
      );

      const scope = scopeResult.rows[0];
      if (scope === undefined || (scope.actor_role !== "owner" && scope.actor_role !== "admin")) {
        return null;
      }

      if (!getTierCapabilities(scope.owner_plan).member_invites) {
        return {
          kind: "upgrade_required",
          owner_plan: scope.owner_plan
        };
      }

      const collaboratorCountResult = await db.query<{ collaborator_count: string }>(
        `
          SELECT COUNT(*)::text AS collaborator_count
          FROM project_members
          WHERE project_id = $1::uuid
        `,
        [input.project_id]
      );

      if (Number(collaboratorCountResult.rows[0]?.collaborator_count ?? "0") >= 1000) {
        return {
          kind: "collaborator_limit_reached",
          owner_plan: scope.owner_plan
        };
      }

      const normalizedEmail = input.email.trim().toLowerCase();
      const existingMemberResult = await db.query<{ user_id: string }>(
        `
          SELECT p.owner_user_id AS user_id
          FROM projects p
          JOIN users owner_user ON owner_user.id = p.owner_user_id
          WHERE p.id = $1::uuid
            AND lower(owner_user.email) = $2

          UNION

          SELECT pm.user_id
          FROM project_members pm
          JOIN users member_user ON member_user.id = pm.user_id
          WHERE pm.project_id = $1::uuid
            AND lower(member_user.email) = $2
          LIMIT 1
        `,
        [input.project_id, normalizedEmail]
      );

      if (existingMemberResult.rows[0] !== undefined) {
        return {
          kind: "member_exists",
          owner_plan: scope.owner_plan
        };
      }

      await db.query(
        `
          UPDATE project_invites
          SET canceled_at = now()
          WHERE project_id = $1::uuid
            AND lower(email) = $2
            AND accepted_at IS NULL
            AND canceled_at IS NULL
            AND expires_at <= now()
        `,
        [input.project_id, normalizedEmail]
      );

      try {
        const result = await db.query<ProjectInviteRecord & Record<string, unknown>>(
          `
            INSERT INTO project_invites (
              id,
              project_id,
              email,
              role,
              invited_by_user_id,
              invite_token_hash,
              expires_at,
              created_at
            )
            VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6, $7::timestamptz, now())
            RETURNING
              id AS invite_id,
              project_id,
              email,
              role,
              invited_by_user_id,
              accepted_at::text AS accepted_at,
              canceled_at::text AS canceled_at,
              expires_at::text AS expires_at,
              created_at::text AS created_at
          `,
          [
            randomUUID(),
            input.project_id,
            normalizedEmail,
            input.role,
            input.invited_by_user_id,
            input.invite_token_hash,
            input.expires_at
          ]
        );

        const invite = result.rows[0];
        if (invite === undefined) {
          throw new Error("project_invite_insert_failed");
        }

        return {
          kind: "created",
          owner_plan: scope.owner_plan,
          invite: mapProjectInviteRow(invite)
        };
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23505" &&
          "constraint" in error &&
          error.constraint === "project_invites_pending_project_email_key"
        ) {
          return {
            kind: "invite_exists",
            owner_plan: scope.owner_plan
          };
        }

        throw error;
      }
    },

    async cancelInviteForProject(input: {
      project_id: string;
      user_id: string;
      invite_id: string;
    }): Promise<ProjectInviteRecord | null> {
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
        [input.project_id, input.user_id]
      );

      const scope = scopeResult.rows[0];
      if (scope === undefined || (scope.actor_role !== "owner" && scope.actor_role !== "admin")) {
        return null;
      }

      const result = await db.query<ProjectInviteRecord & Record<string, unknown>>(
        `
          UPDATE project_invites
          SET canceled_at = now()
          WHERE project_id = $1::uuid
            AND id = $2::uuid
            AND accepted_at IS NULL
            AND canceled_at IS NULL
          RETURNING
            id AS invite_id,
            project_id,
            email,
            role,
            invited_by_user_id,
            accepted_at::text AS accepted_at,
            canceled_at::text AS canceled_at,
            expires_at::text AS expires_at,
            created_at::text AS created_at
        `,
        [input.project_id, input.invite_id]
      );

      const invite = result.rows[0];
      return invite === undefined ? null : mapProjectInviteRow(invite);
    },

    async acceptProjectInviteForUser(input: {
      invite_token_hash: string;
      user_id: string;
      email: string;
      accepted_at: string;
    }) {
      const inviteResult = await db.query<
        {
          invite_id: string;
          project_id: string;
          email: string;
          role: "admin" | "member";
          owner_plan: TierName;
        } & Record<string, unknown>
      >(
        `
          SELECT
            invites.id AS invite_id,
            invites.project_id,
            invites.email,
            invites.role,
            COALESCE(o.plan, 'free') AS owner_plan
          FROM project_invites invites
          JOIN projects p ON p.id = invites.project_id
          JOIN organizations o ON o.id = p.organization_id
          WHERE invites.invite_token_hash = $1
            AND invites.accepted_at IS NULL
            AND invites.canceled_at IS NULL
            AND invites.expires_at > $2::timestamptz
          LIMIT 1
        `,
        [input.invite_token_hash, input.accepted_at]
      );

      const invite = inviteResult.rows[0];
      if (invite === undefined) {
        return { kind: "invalid_token" } as const;
      }

      if (invite.email.trim().toLowerCase() !== input.email.trim().toLowerCase()) {
        return { kind: "email_mismatch" } as const;
      }

      const ownerCapabilities = getTierCapabilities(invite.owner_plan);
      if (!ownerCapabilities.member_invites || !ownerCapabilities.shared_dashboards) {
        return { kind: "shared_access_suspended" } as const;
      }

      const existingMembershipResult = await db.query<
        ProjectMemberRecord & Record<string, unknown>
      >(
        `
          SELECT
            pm.user_id,
            member_user.email,
            pm.role,
            'collaborator' AS membership_type,
            pm.created_at::text AS created_at
          FROM project_members pm
          JOIN users member_user ON member_user.id = pm.user_id
          WHERE pm.project_id = $1::uuid
            AND pm.user_id = $2::uuid
          LIMIT 1
        `,
        [invite.project_id, input.user_id]
      );

      const existingMembership = existingMembershipResult.rows[0];
      if (existingMembership !== undefined) {
        await db.query(
          `
            UPDATE project_invites
            SET accepted_at = $2::timestamptz
            WHERE id = $1::uuid
              AND accepted_at IS NULL
          `,
          [invite.invite_id, input.accepted_at]
        );

        return {
          kind: "accepted",
          membership: {
            ...mapProjectMemberRow(existingMembership),
            project_id: invite.project_id
          }
        } as const;
      }

      const createdMembershipResult = await db.query<ProjectMemberRecord & Record<string, unknown>>(
        `
          INSERT INTO project_members (id, project_id, user_id, role, invited_by_user_id, created_at, updated_at)
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4, NULL, $5::timestamptz, $5::timestamptz)
          ON CONFLICT (project_id, user_id) DO NOTHING
          RETURNING
            user_id,
            (
              SELECT u.email
              FROM users u
              WHERE u.id = project_members.user_id
            ) AS email,
            role,
            'collaborator' AS membership_type,
            created_at::text AS created_at
        `,
        [randomUUID(), invite.project_id, input.user_id, invite.role, input.accepted_at]
      );

      const membership = createdMembershipResult.rows[0];
      if (membership === undefined) {
        return { kind: "invalid_token" } as const;
      }

      await db.query(
        `
          UPDATE project_invites
          SET accepted_at = $2::timestamptz
          WHERE id = $1::uuid
            AND accepted_at IS NULL
        `,
        [invite.invite_id, input.accepted_at]
      );

      return {
        kind: "accepted",
        membership: {
          ...mapProjectMemberRow(membership),
          project_id: invite.project_id
        }
      } as const;
    }
  };
}
