import type Stripe from "stripe";
import { z } from "zod";
import {
  createStripeReferralReadBudget,
  hasStripePaidSubscriptionHistory
} from "./stripe-cash-receipts.js";

/** A missing live customer link is not proof of a new customer after account
 * recreation. Check retained provider customers for this verified identity,
 * with one shared bounded read budget. No financial identity is returned. */
export async function readStripeCustomerPaymentHistory(
  client: Stripe,
  raw: { customer_id: string | null; verified_email: string }
): Promise<boolean> {
  const input = z
    .object({
      customer_id: z.string().min(1).max(255).nullable(),
      verified_email: z.string().trim().toLowerCase().pipe(z.email())
    })
    .strict()
    .parse(raw);
  const nextRead = createStripeReferralReadBudget();
  if (
    input.customer_id !== null &&
    (await hasStripePaidSubscriptionHistory(client, input.customer_id, nextRead))
  )
    return true;
  const matches = await client.customers.list(
    { email: input.verified_email, limit: 100 },
    nextRead()
  );
  const seen = new Set<string>();
  for (const customer of matches.data) {
    if (
      !customer.id ||
      seen.has(customer.id) ||
      customer.email?.trim().toLowerCase() !== input.verified_email
    )
      throw new Error("referral_customer_unverified");
    seen.add(customer.id);
    if (
      customer.id !== input.customer_id &&
      (await hasStripePaidSubscriptionHistory(client, customer.id, nextRead))
    )
      return true;
  }
  if (matches.has_more) throw new Error("referral_history_incomplete");
  return false;
}
