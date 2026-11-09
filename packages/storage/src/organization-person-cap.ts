import type { Queryable } from "./types.js";

export const ORGANIZATION_PERSON_LIMIT = 1000;

/** Call inside the invitation transaction. The organisation row serialises
 * admission across project and organisation invitations/acceptances. Suspended
 * memberships retain a place; one normalised email reserves only one place. */
export async function canAdmitOrganizationPerson(
  db: Queryable,
  organizationId: string,
  email: string
): Promise<boolean> {
  const locked = await db.query<{ id: string }>(
    "SELECT id FROM organizations WHERE id=$1::uuid AND suspended_at IS NULL FOR UPDATE",
    [organizationId]
  );
  if (locked.rows[0] === undefined) return false;
  const result = await db.query<{ people: number }>(
    organizationAdmissionCountSql("$1::uuid", "$2::text"),
    [organizationId, email]
  );
  return (result.rows[0]?.people ?? ORGANIZATION_PERSON_LIMIT + 1) <= ORGANIZATION_PERSON_LIMIT;
}

/** Expressions and aliases are repository constants, never request text. */
export function organizationAdmissionCountSql(
  organizationSql: string,
  emailSql: string,
  countAlias: "people" | "collaborator_count" = "people"
): string {
  return `
    SELECT COUNT(*)::integer AS ${countAlias} FROM (
      SELECT lower(trim(u.email)) AS email FROM organization_members om JOIN users u ON u.id=om.user_id
        WHERE om.organization_id=${organizationSql}
      UNION SELECT lower(trim(u.email)) FROM projects p JOIN users u ON u.id=p.owner_user_id
        WHERE p.organization_id=${organizationSql}
      UNION SELECT lower(trim(u.email)) FROM projects p JOIN project_members pm ON pm.project_id=p.id
        JOIN users u ON u.id=pm.user_id WHERE p.organization_id=${organizationSql}
      UNION SELECT lower(trim(pi.email)) FROM project_invites pi JOIN projects p ON p.id=pi.project_id
        WHERE p.organization_id=${organizationSql} AND pi.accepted_at IS NULL AND pi.canceled_at IS NULL AND pi.expires_at>now()
      UNION SELECT lower(trim(email)) FROM organization_invites WHERE organization_id=${organizationSql}
        AND accepted_at IS NULL AND canceled_at IS NULL AND expires_at>now()
      UNION SELECT lower(trim(${emailSql}))
    ) people`;
}
