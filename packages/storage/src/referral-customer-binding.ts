import type { Queryable } from "./types.js";
/** Early provider receipts may precede local entitlement linking. Only a frozen
 * retained event can supply that missing link; a different cached customer is
 * always rejected. Account deletion keeps the existing retained-finance path. */
export async function referralCustomerBindingMatches(
  db: Queryable,
  organization: string,
  customer: string
): Promise<boolean> {
  const live = (
    await db.query<{ stripe_customer_id: string | null }>(
      "SELECT stripe_customer_id FROM organizations WHERE id=$1 FOR SHARE",
      [organization]
    )
  ).rows[0];
  if (!live) return true;
  if (live.stripe_customer_id !== null) return live.stripe_customer_id === customer;
  return (
    (
      await db.query(
        "SELECT event_id FROM referral_reconciliation_events WHERE organization_external_id=$1 AND provider_customer_id=$2 LIMIT 1",
        [organization, customer]
      )
    ).rows.length === 1
  );
}
