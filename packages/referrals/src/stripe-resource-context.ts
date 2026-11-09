import type Stripe from "stripe";
import { z } from "zod";
import type { ReferralReconciliationEvent } from "./referral-reconciliation.js";
import { readStripeReconciliationCustomer } from "./stripe-reconciliation-customer.js";
import { createStripeReferralReadBudget } from "./stripe-cash-receipts.js";
const id = z.string().min(1).max(255);
const identifier = (value: unknown): string =>
  id.parse(typeof value === "object" && value !== null && "id" in value ? value.id : value);
const Resource = z.object({
  id,
  livemode: z.boolean().optional(),
  customer: z.unknown().optional(),
  invoice: z.unknown().optional(),
  charge: z.unknown().optional(),
  payment_intent: z.unknown().optional(),
  subscription: z.unknown().optional(),
  mode: z.string().optional(),
  parent: z
    .object({ subscription_details: z.object({ subscription: z.unknown() }).nullable().optional() })
    .nullable()
    .optional()
});
export interface StripeReferralResourceContext {
  provider_customer_id: string;
  organization_external_id: string | null;
  subscription_related: boolean;
}
/** Provider-only context, never browser/webhook metadata inference. A complete
 * PaymentIntent allocation list can prove an unrelated payment. Unsupported or
 * truncated allocations stay held rather than releasing a possible obligation. */
export async function readStripeReferralResourceContext(
  client: Stripe,
  event: ReferralReconciliationEvent
): Promise<StripeReferralResourceContext> {
  try {
    const customer = await readStripeReconciliationCustomer(client, event),
      next = createStripeReferralReadBudget(15000, 300),
      organizations = new Set<string>();
    let related = false;
    const check = (raw: unknown, expected: string): z.infer<typeof Resource> => {
      const resource = Resource.parse(raw);
      if (
        resource.id !== expected ||
        (resource.livemode !== undefined && resource.livemode !== event.livemode) ||
        (resource.customer !== undefined && identifier(resource.customer) !== customer)
      )
        throw new Error("identity_mismatch");
      return resource;
    };
    async function subscription(subscriptionId: string): Promise<void> {
      related = true;
      const sub = await client.subscriptions.retrieve(subscriptionId, {}, next());
      if (
        sub.id !== subscriptionId ||
        identifier(sub.customer) !== customer ||
        sub.livemode !== event.livemode
      )
        throw new Error("subscription_mismatch");
      const org = z.uuid().safeParse(sub.metadata["organization_id"]);
      if (org.success) organizations.add(org.data);
    }
    async function invoice(invoiceId: string): Promise<void> {
      const source = check(await client.invoices.retrieve(invoiceId, {}, next()), invoiceId),
        sub = source.parent?.subscription_details?.subscription;
      if (sub) await subscription(identifier(sub));
    }
    async function charge(chargeId: string): Promise<void> {
      const source = check(await client.charges.retrieve(chargeId, {}, next()), chargeId);
      if (!source.payment_intent) {
        related = true;
        return;
      }
      const paymentIntent = identifier(source.payment_intent),
        page = await client.invoicePayments.list(
          { payment: { type: "payment_intent", payment_intent: paymentIntent }, limit: 100 },
          next()
        );
      if (page.has_more || page.data.length > 100) throw new Error("allocation_incomplete");
      const seen = new Set<string>();
      for (const payment of page.data) {
        if (
          seen.has(payment.id) ||
          payment.livemode !== event.livemode ||
          payment.payment.type !== "payment_intent" ||
          identifier(payment.payment.payment_intent) !== paymentIntent
        )
          throw new Error("allocation_mismatch");
        seen.add(payment.id);
        await invoice(identifier(payment.invoice));
      }
    }
    switch (event.resource_type) {
      case "invoice":
        await invoice(event.resource_id);
        break;
      case "invoice_payment": {
        const source = check(
          await client.invoicePayments.retrieve(event.resource_id, {}, next()),
          event.resource_id
        );
        await invoice(identifier(source.invoice));
        break;
      }
      case "credit_note": {
        const source = check(
          await client.creditNotes.retrieve(event.resource_id, {}, next()),
          event.resource_id
        );
        await invoice(identifier(source.invoice));
        break;
      }
      case "checkout_session": {
        const source = check(
          await client.checkout.sessions.retrieve(event.resource_id, {}, next()),
          event.resource_id
        );
        if (source.mode === "subscription" && source.subscription)
          await subscription(identifier(source.subscription));
        else if (source.mode !== "payment" && source.mode !== "setup") related = true;
        break;
      }
      case "charge":
        await charge(event.resource_id);
        break;
      case "refund":
      case "dispute": {
        const source = check(
          event.resource_type === "refund"
            ? await client.refunds.retrieve(event.resource_id, {}, next())
            : await client.disputes.retrieve(event.resource_id, {}, next()),
          event.resource_id
        );
        await charge(identifier(source.charge));
        break;
      }
    }
    if (organizations.size > 1) throw new Error("organization_conflict");
    return {
      provider_customer_id: customer,
      organization_external_id: [...organizations][0] ?? null,
      subscription_related: related
    };
  } catch {
    throw new Error("referral_resource_context_unverified");
  }
}
