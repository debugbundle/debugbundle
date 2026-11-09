import type { Queryable } from "./types.js";
import { billingOwnerIdSql } from "./billing-owner.js";

/** No email addresses or customer identifiers are persisted in the job payload. */
export async function readCurrentBillingContact(
  db: Queryable,
  organizationId: string
): Promise<{
  owner_user_id: string;
  customer_id: string;
  email: string;
} | null> {
  const result = await db.query<{
    customer_id: string | null;
    owner_user_id: string | null;
    email: string | null;
  }>(
    `SELECT organizations.stripe_customer_id AS customer_id, ${billingOwnerIdSql()} AS owner_user_id, u.email
     FROM organizations LEFT JOIN users u ON u.id::text=${billingOwnerIdSql()}
     WHERE organizations.id=$1::uuid`,
    [organizationId]
  );
  const row = result.rows[0];
  if (!row || row.customer_id === null) return null;
  if (row.owner_user_id === null || row.email === null)
    throw new Error("billing_contact_owner_unavailable");
  return { customer_id: row.customer_id, owner_user_id: row.owner_user_id, email: row.email };
}
