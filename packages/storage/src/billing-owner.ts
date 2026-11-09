import type { Queryable } from "./types.js";

/** Billing and transfer require one current, unsuspended organisation Owner. */
export function billingOwnerIdSql(): string {
  return `(SELECT CASE WHEN COUNT(*)=1 THEN MIN(owner.user_id::text) ELSE NULL END
    FROM organization_members owner WHERE owner.organization_id=organizations.id
      AND owner.role='owner' AND owner.suspended_at IS NULL)`;
}
/** Call after taking the organisation lock, as a separate statement so a wait
 * for an ownership transfer cannot retain the statement's old MVCC snapshot. */
export async function isCurrentBillingOwner(
  db: Queryable,
  organizationId: string,
  userId: string
): Promise<boolean> {
  const result = await db.query<{ allowed: boolean }>(
    `SELECT ${billingOwnerIdSql()}=$2::text AS allowed FROM organizations WHERE id=$1`,
    [organizationId, userId]
  );
  return result.rows[0]?.allowed === true;
}
