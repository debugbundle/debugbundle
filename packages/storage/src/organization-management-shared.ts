import { isSelfHostMode } from "../../shared-types/src/tier-capabilities.js";
import type { Queryable } from "./types.js";
import {
  OrganizationManagementError,
  type OrganizationActor
} from "./organization-management-types.js";

export async function requireOrganizationAdministrator(
  db: Queryable,
  input: OrganizationActor,
  lock: boolean
): Promise<"owner" | "admin"> {
  const result = await db.query<{ role: string; plan: string; grants_paused_at: string | null }>(
    `
    SELECT om.role,o.plan,om.grants_paused_at FROM organizations o
    JOIN organization_members om ON om.organization_id=o.id AND om.user_id=$2::uuid
    WHERE o.id=$1::uuid AND o.suspended_at IS NULL AND om.suspended_at IS NULL
    ${lock ? "FOR UPDATE OF o" : ""}`,
    [input.organization_id, input.actor_user_id]
  );
  const row = result.rows[0];
  if (
    row === undefined ||
    (row.role !== "owner" &&
      !(
        row.role === "admin" &&
        input.include_organization_grants === true &&
        row.grants_paused_at === null
      ))
  )
    throw new OrganizationManagementError("forbidden");
  if (row.plan !== "business" && !isSelfHostMode())
    throw new OrganizationManagementError("upgrade_required");
  return row.role;
}

export function assertManageableOrganizationRole(
  actorRole: "owner" | "admin",
  targetRole: string | null,
  requestedRole?: string
): void {
  if (
    targetRole === "owner" ||
    (actorRole === "admin" && (targetRole === "admin" || requestedRole === "admin"))
  )
    throw new OrganizationManagementError("forbidden");
}

export async function organizationRoleForEmail(
  db: Queryable,
  organizationId: string,
  email: string
): Promise<string | null> {
  const result = await db.query<{ role: string }>(
    `SELECT om.role FROM organization_members om JOIN users u ON u.id=om.user_id
    WHERE om.organization_id=$1::uuid AND lower(trim(u.email))=lower(trim($2))`,
    [organizationId, email]
  );
  return result.rows[0]?.role ?? null;
}

export async function requireVerifiedUser(
  db: Queryable,
  userId: string
): Promise<{ email: string }> {
  const result = await db.query<{ email: string }>(
    "SELECT email FROM users WHERE id=$1::uuid AND email_verified_at IS NOT NULL",
    [userId]
  );
  const user = result.rows[0];
  if (user === undefined) throw new OrganizationManagementError("email_verification_required");
  return user;
}

export async function revokeOrganizationCredentials(
  db: Queryable,
  organizationId: string,
  userId: string
): Promise<void> {
  await db.query(
    "UPDATE member_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE organization_id=$1::uuid AND user_id=$2::uuid",
    [organizationId, userId]
  );
  await db.query(
    "UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE organization_id=$1::uuid AND user_id=$2::uuid",
    [organizationId, userId]
  );
  await db.query(
    "UPDATE agent_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE organization_id=$1::uuid AND issuer_user_id=$2::uuid",
    [organizationId, userId]
  );
  await db.query(
    "UPDATE oauth_authorization_grants SET revoked_at=COALESCE(revoked_at,now()),revocation_reason='membership_removed',updated_at=now() WHERE organization_id=$1::uuid AND user_id=$2::uuid",
    [organizationId, userId]
  );
}
