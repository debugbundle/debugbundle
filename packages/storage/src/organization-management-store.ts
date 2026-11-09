import { normalizeTierName } from "../../shared-types/src/index.js";
import type { OrganizationRole } from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";
import type { OrganizationManagementStore } from "./organization-management-types.js";
import { createOrganizationPeopleStore } from "./organization-people-store.js";
import { createOrganizationInviteStore } from "./organization-invite-store.js";
import { createOrganizationOwnershipStore } from "./organization-ownership-store.js";
export * from "./organization-management-types.js";

export function createPostgresOrganizationManagementStore(
  db: Queryable
): OrganizationManagementStore {
  return {
    ...createOrganizationPeopleStore(db),
    ...createOrganizationInviteStore(db),
    ...createOrganizationOwnershipStore(db),
    async listOrganizationsForUser(userId) {
      const result = await db.query<{
        organization_id: string;
        name: string;
        plan: string;
        role: OrganizationRole;
      }>(
        `
        SELECT o.id AS organization_id,o.name,o.plan,om.role FROM organizations o
        JOIN organization_members om ON om.organization_id=o.id WHERE om.user_id=$1::uuid
          AND om.suspended_at IS NULL AND o.suspended_at IS NULL
        ORDER BY CASE om.role WHEN 'owner' THEN 0 ELSE 1 END,om.created_at,o.id LIMIT 1000`,
        [userId]
      );
      return result.rows.map((row) => ({ ...row, plan: normalizeTierName(row.plan) }));
    },
    async switchSessionOrganization(input) {
      const result = await db.query<{ id: string }>(
        `UPDATE sessions s SET organization_id=$3::uuid
        WHERE s.session_token_hash=$1 AND s.user_id=$2::uuid AND s.revoked_at IS NULL AND s.expires_at>now()
          AND EXISTS(SELECT 1 FROM organization_members om JOIN organizations o ON o.id=om.organization_id
            WHERE om.organization_id=$3::uuid AND om.user_id=s.user_id AND om.suspended_at IS NULL AND o.suspended_at IS NULL)
          AND EXISTS(SELECT 1 FROM organization_members current_member JOIN organizations current_org ON current_org.id=current_member.organization_id
            WHERE current_member.organization_id=s.organization_id AND current_member.user_id=s.user_id
              AND current_member.suspended_at IS NULL AND current_org.suspended_at IS NULL)
        RETURNING s.id`,
        [input.session_token_hash, input.user_id, input.organization_id]
      );
      return result.rows[0] !== undefined;
    }
  };
}
