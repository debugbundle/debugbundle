import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type Stripe from "stripe";
import {
  BillingPlanChangeQuoteSchema,
  type BillingPlanChangeQuote
} from "../../billing-client/src/plan-change.js";
import { readRecurringInvoice } from "./stripe-recurring-preview.js";
import { preservedPhaseSettings, preservedItemSettings } from "./stripe-schedule-safety.js";

const ClaimsSchema = BillingPlanChangeQuoteSchema.omit({ confirmation_token: true })
  .extend({
    organization_id: z.string(),
    subscription_id: z.string(),
    source: z.string(),
    operation_revision: z.string().nullable()
  })
  .strict();
function signature(secret: string, body: string): Buffer {
  return createHmac("sha256", secret).update(`debugbundle:plan-change:v1:${body}`).digest();
}
export function planChangeSource(subscription: Stripe.Subscription): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        id: subscription.id,
        customer:
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id,
        settings: preservedPhaseSettings(subscription),
        items: subscription.items.data
          .map((item) => ({
            id: item.id,
            price: item.price.id,
            quantity: item.quantity,
            start: item.current_period_start,
            end: item.current_period_end,
            ...preservedItemSettings(item)
          }))
          .sort((a, b) => a.id.localeCompare(b.id))
      })
    )
    .digest("hex");
}
export async function readPlanChangeAmounts(
  client: Stripe,
  subscriptionId: string,
  items: Stripe.SubscriptionUpdateParams.Item[],
  mode?: "next"
): Promise<{ currency: string; monthly_total: number; tax: number }> {
  const invoice = await readRecurringInvoice(client, subscriptionId, items, mode);
  return {
    currency: invoice.currency,
    monthly_total: invoice.total,
    tax: (invoice.total_taxes ?? []).reduce((sum, tax) => sum + tax.amount, 0)
  };
}
export async function createPlanChangeQuote(input: {
  client: Stripe;
  secret: string;
  organizationId: string;
  subscription: Stripe.Subscription;
  items: Stripe.SubscriptionUpdateParams.Item[];
  quantity: number;
  effectiveAt: number;
  operationRevision: string | null;
  now: number;
}): Promise<BillingPlanChangeQuote> {
  if (!input.secret) throw new Error("billing_quote_unavailable");
  const claims = ClaimsSchema.parse({
    organization_id: input.organizationId,
    subscription_id: input.subscription.id,
    source: planChangeSource(input.subscription),
    operation_revision: input.operationRevision,
    expires_at: new Date(input.now + 600_000).toISOString(),
    effective_at: new Date(input.effectiveAt * 1000).toISOString(),
    target_plan: "solo",
    additional_capacity_units: input.quantity,
    amount_due: 0,
    ...(await readPlanChangeAmounts(
      input.client,
      input.subscription.id,
      input.items,
      input.subscription.schedule ? "next" : undefined
    ))
  });
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const quote = BillingPlanChangeQuoteSchema.omit({ confirmation_token: true })
    .strip()
    .parse(claims);
  return {
    ...quote,
    confirmation_token: `${body}.${signature(input.secret, body).toString("base64url")}`
  };
}
export function verifyPlanChangeQuote(input: {
  token: string;
  secret: string;
  organizationId: string;
  subscription: Stripe.Subscription;
  now: number;
}): { quote: BillingPlanChangeQuote; operationRevision: string | null } | null {
  try {
    if (!input.secret || input.token.length > 8192) return null;
    const [body, mac, extra] = input.token.split(".");
    if (!body || !mac || extra !== undefined) return null;
    const received = Buffer.from(mac, "base64url"),
      expected = signature(input.secret, body);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    const claims = ClaimsSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    const expires = Date.parse(claims.expires_at);
    if (
      claims.organization_id !== input.organizationId ||
      claims.subscription_id !== input.subscription.id ||
      claims.source !== planChangeSource(input.subscription) ||
      expires <= input.now ||
      expires > input.now + 600_000
    )
      return null;
    const quote = BillingPlanChangeQuoteSchema.parse({
      ...Object.fromEntries(
        Object.entries(claims).filter(
          ([key]) =>
            !["organization_id", "subscription_id", "source", "operation_revision"].includes(key)
        )
      ),
      confirmation_token: input.token
    });
    return { quote, operationRevision: claims.operation_revision };
  } catch {
    return null;
  }
}
