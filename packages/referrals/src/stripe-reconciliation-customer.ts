import type Stripe from "stripe";
import { z } from "zod";
import {
  ReferralReconciliationEventSchema,
  type ReferralReconciliationEvent
} from "./referral-reconciliation.js";
import { createStripeReferralReadBudget } from "./stripe-cash-receipts.js";
const idSchema = z.union([
  z.string().min(1).max(255),
  z.object({ id: z.string().min(1).max(255) })
]);
function id(raw: unknown): string {
  const value = idSchema.parse(raw);
  return typeof value === "string" ? value : value.id;
}
const ResourceSchema = z.object({
  id: z.string(),
  livemode: z.boolean().optional(),
  customer: z.unknown().optional(),
  charge: z.unknown().optional(),
  invoice: z.unknown().optional()
});

/** Validate the actual triggering resource even when the signed event supplied
 * a customer. Refund/dispute identities resolve through their charge; the read
 * budget is shared across that whole traversal. No provider writes occur. */
export async function readStripeReconciliationCustomer(
  client: Stripe,
  raw: ReferralReconciliationEvent
): Promise<string> {
  try {
    const input = ReferralReconciliationEventSchema.parse(raw),
      next = createStripeReferralReadBudget();
    const check = (
      value: unknown,
      expected: string,
      requireMode = true
    ): z.infer<typeof ResourceSchema> => {
      const result = ResourceSchema.parse(value);
      if (
        result.id !== expected ||
        ((requireMode || result.livemode !== undefined) && result.livemode !== input.livemode)
      )
        throw new Error("resource_identity_mismatch");
      return result;
    };
    let customer: string;
    switch (input.resource_type) {
      case "invoice":
        customer = id(
          check(await client.invoices.retrieve(input.resource_id, {}, next()), input.resource_id)
            .customer
        );
        break;
      case "charge":
        customer = id(
          check(await client.charges.retrieve(input.resource_id, {}, next()), input.resource_id)
            .customer
        );
        break;
      case "credit_note":
        customer = id(
          check(await client.creditNotes.retrieve(input.resource_id, {}, next()), input.resource_id)
            .customer
        );
        break;
      case "checkout_session":
        customer = id(
          check(
            await client.checkout.sessions.retrieve(input.resource_id, {}, next()),
            input.resource_id
          ).customer
        );
        break;
      case "invoice_payment": {
        const payment = check(
          await client.invoicePayments.retrieve(input.resource_id, {}, next()),
          input.resource_id
        );
        const invoice = id(payment.invoice);
        customer = id(check(await client.invoices.retrieve(invoice, {}, next()), invoice).customer);
        break;
      }
      case "refund":
      case "dispute": {
        const value = check(
          input.resource_type === "refund"
            ? await client.refunds.retrieve(input.resource_id, {}, next())
            : await client.disputes.retrieve(input.resource_id, {}, next()),
          input.resource_id,
          false
        );
        const charge = id(value.charge);
        customer = id(check(await client.charges.retrieve(charge, {}, next()), charge).customer);
        break;
      }
    }
    if (input.provider_customer_id !== null && customer !== input.provider_customer_id)
      throw new Error("customer_mismatch");
    return customer;
  } catch {
    throw new Error("referral_resource_unverified");
  }
}
