import type { Queryable } from "./types.js";
import type { StripeBillingProvider } from "../../billing/src/stripe-subscription.js";
import { ReferralError } from "../../referrals/src/referral-contracts.js";
import { readStripeCustomerPaymentHistory } from "../../referrals/src/stripe-customer-eligibility.js";
export function createReferralEligibilityReader(
  db: Queryable,
  stripeConfig?: Pick<StripeBillingProvider, "client">
): (actor: {
  organization_id: string;
  actor_user_id: string;
}) => Promise<{ provider_customer_id_checked: string | null; provider_previously_paid: boolean }> {
  return async (actor: { organization_id: string; actor_user_id: string }) => {
    const row = (
      await db.query<{ stripe_customer_id: string | null; email: string }>(
        `SELECT o.stripe_customer_id,u.email FROM organizations o
        JOIN organization_members m ON m.organization_id=o.id AND m.role='owner' AND m.user_id=$2::uuid
        JOIN users u ON u.id=m.user_id AND u.email_verified_at IS NOT NULL
        WHERE o.id=$1::uuid AND o.suspended_at IS NULL`,
        [actor.organization_id, actor.actor_user_id]
      )
    ).rows[0];
    if (!row) throw new ReferralError("forbidden");
    if (row.stripe_customer_id && !stripeConfig) throw new ReferralError("program_unavailable");
    return {
      provider_customer_id_checked: row.stripe_customer_id,
      provider_previously_paid:
        stripeConfig !== undefined
          ? await readStripeCustomerPaymentHistory(stripeConfig.client, {
              customer_id: row.stripe_customer_id,
              verified_email: row.email
            })
          : false
    };
  };
}
