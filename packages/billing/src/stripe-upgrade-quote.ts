import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type Stripe from "stripe";
import { z } from "zod";
import { readRecurringInvoice } from "./stripe-recurring-preview.js";

const options = { timeout: 8000, maxNetworkRetries: 0 } as const;
const ItemSchema = z
  .object({
    id: z.string().min(1),
    price: z.string().min(1),
    quantity: z.number().int().min(1).max(99)
  })
  .strict();
const QuoteSchema = z
  .object({
    organization_id: z.string(),
    subscription_id: z.string(),
    source: z.string(),
    items: z.array(ItemSchema).min(1).max(2),
    proration_date: z.number().int(),
    expires_at: z.number().int(),
    currency: z.string().regex(/^[a-z]{3}$/),
    amount_due: z.number().int().nonnegative(),
    tax: z.number().int(),
    monthly_total: z.number().int().nonnegative()
  })
  .strict();
type QuoteClaims = z.infer<typeof QuoteSchema>;
export interface BillingUpgradeQuote {
  confirmation_token: string;
  expires_at: string;
  currency: string;
  amount_due: number;
  tax: number;
  monthly_total: number;
  additional_capacity_units: number;
}
function source(subscription: Stripe.Subscription): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        id: subscription.id,
        customer:
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id,
        items: subscription.items.data
          .map((item) => ({
            id: item.id,
            price: item.price.id,
            quantity: item.quantity,
            start: item.current_period_start,
            end: item.current_period_end
          }))
          .sort((a, b) => a.id.localeCompare(b.id))
      })
    )
    .digest("hex");
}
function signature(secret: string, body: string): Buffer {
  // Domain separation prevents a quote signature being used as a Stripe webhook signature.
  return createHmac("sha256", secret).update(`debugbundle:billing-quote:v1:${body}`).digest();
}
export function verifyUpgradeQuote(input: {
  token: string;
  secret: string;
  organizationId: string;
  subscription: Stripe.Subscription;
  now?: number;
}): QuoteClaims | null {
  try {
    if (input.token.length > 8192 || !input.secret) return null;
    const parts = input.token.split(".");
    if (parts.length !== 2) return null;
    const body = parts[0]!;
    const received = Buffer.from(parts[1]!, "base64url");
    const expected = signature(input.secret, body);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    const claims = QuoteSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    const now = Math.floor((input.now ?? Date.now()) / 1000);
    return claims.organization_id === input.organizationId &&
      claims.subscription_id === input.subscription.id &&
      claims.source === source(input.subscription) &&
      claims.expires_at > now &&
      claims.proration_date <= now + 60 &&
      claims.expires_at - claims.proration_date === 600
      ? claims
      : null;
  } catch {
    return null;
  }
}
export async function readUpgradeAmounts(input: {
  client: Stripe;
  subscriptionId: string;
  items: Stripe.SubscriptionUpdateParams.Item[];
  prorationDate: number;
  recurringPreviewMode?: "next";
}): Promise<{ currency: string; amount_due: number; tax: number; monthly_total: number }> {
  const current = await input.client.invoices.createPreview(
    {
      subscription: input.subscriptionId,
      subscription_details: {
        items: input.items,
        proration_behavior: "always_invoice",
        proration_date: input.prorationDate
      }
    },
    options
  );
  const recurring = await readRecurringInvoice(
    input.client,
    input.subscriptionId,
    input.items,
    input.recurringPreviewMode
  );
  if (
    [current, recurring].some(
      (invoice) => invoice.automatic_tax?.status && invoice.automatic_tax.status !== "complete"
    ) ||
    current.currency !== recurring.currency
  )
    throw new Error("billing_quote_unavailable");
  return {
    currency: current.currency,
    amount_due: current.amount_due,
    tax: (current.total_taxes ?? []).reduce((sum, tax) => sum + tax.amount, 0),
    monthly_total: recurring.total
  };
}
export async function createUpgradeQuote(input: {
  client: Stripe;
  secret: string;
  organizationId: string;
  subscription: Stripe.Subscription;
  items: Stripe.SubscriptionUpdateParams.Item[];
  additionalCapacityUnits: number;
  now?: number;
}): Promise<BillingUpgradeQuote> {
  if (!input.secret) throw new Error("billing_quote_unavailable");
  const prorationDate = Math.floor((input.now ?? Date.now()) / 1000);
  const claims = QuoteSchema.parse({
    organization_id: input.organizationId,
    subscription_id: input.subscription.id,
    source: source(input.subscription),
    items: input.items,
    proration_date: prorationDate,
    expires_at: prorationDate + 600,
    ...(await readUpgradeAmounts({
      client: input.client,
      subscriptionId: input.subscription.id,
      items: input.items,
      prorationDate,
      ...(input.subscription.schedule ? { recurringPreviewMode: "next" as const } : {})
    }))
  });
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return {
    confirmation_token: `${body}.${signature(input.secret, body).toString("base64url")}`,
    expires_at: new Date(claims.expires_at * 1000).toISOString(),
    currency: claims.currency,
    amount_due: claims.amount_due,
    tax: claims.tax,
    monthly_total: claims.monthly_total,
    additional_capacity_units: input.additionalCapacityUnits
  };
}
