import { createHmac, timingSafeEqual } from "node:crypto";
import type Stripe from "stripe";
import { z } from "zod";
import {
  BillingOfferQuoteSchema,
  classifyBillingOfferChange,
  type BillingOfferSelection,
  type BillingOfferQuote
} from "../../shared-types/src/index.js";
import { buildStripeOfferItems, readStripeSubscriptionOffer } from "./stripe-price-catalog.js";
import type { StripeBillingProvider } from "./stripe-subscription.js";
import { planChangeSource } from "./stripe-plan-change-quote.js";
import { readRecurringInvoice } from "./stripe-recurring-preview.js";
import { resolveStripeSubscriptionBillingPeriod } from "./stripe-billing-period.js";

const ClaimsSchema = BillingOfferQuoteSchema.omit({
  confirmation_token: true,
  resume_required: true
})
  .extend({
    organization_id: z.string().min(1),
    actor_user_id: z.string().min(1),
    subscription_id: z.string().min(1),
    source: z.string().length(64),
    operation_revision: z.string().nullable(),
    proration_date: z.number().int().nonnegative(),
    items: z
      .array(
        z
          .object({
            id: z.string().min(1),
            price: z.string().min(1),
            quantity: z.number().int().min(1).max(99)
          })
          .strict()
      )
      .min(1)
      .max(2)
  })
  .strict();
export type StripeOfferQuoteClaims = z.infer<typeof ClaimsSchema>;
export function publicStripeOfferQuote(
  claims: StripeOfferQuoteClaims,
  token: string
): BillingOfferQuote {
  return BillingOfferQuoteSchema.strip().parse({ ...claims, confirmation_token: token });
}
const signature = (secret: string, body: string): Buffer =>
  createHmac("sha256", secret).update(`debugbundle:billing-offer:v1:${body}`).digest();

export function stripeOfferChangeAction(
  provider: StripeBillingProvider,
  subscription: Stripe.Subscription,
  target: BillingOfferSelection
): "upgrade" | "renewal" | null {
  const current = readStripeSubscriptionOffer(subscription, provider.priceMap);
  return classifyBillingOfferChange(current, target);
}

export async function readStripeOfferAmounts(input: {
  client: Stripe;
  subscriptionId: string;
  items: Stripe.SubscriptionUpdateParams.Item[];
  prorationDate: number;
  action: "upgrade" | "renewal";
  recurringPreviewMode?: "next";
}): Promise<{ currency: "usd"; amount_due: number; tax: number; recurring_total: number }> {
  const recurring = await readRecurringInvoice(
    input.client,
    input.subscriptionId,
    input.items,
    input.recurringPreviewMode
  );
  const current =
    input.action === "renewal"
      ? null
      : await input.client.invoices.createPreview(
          {
            subscription: input.subscriptionId,
            subscription_details: {
              items: input.items,
              proration_behavior: "always_invoice",
              proration_date: input.prorationDate
            }
          },
          { timeout: 8000, maxNetworkRetries: 0 }
        );
  if (
    recurring.currency !== "usd" ||
    (current &&
      (current.currency !== "usd" ||
        (current.automatic_tax?.status && current.automatic_tax.status !== "complete")))
  )
    throw new Error("billing_quote_unavailable");
  return {
    currency: "usd",
    amount_due: current?.amount_due ?? 0,
    tax: ((current ?? recurring).total_taxes ?? []).reduce((sum, tax) => sum + tax.amount, 0),
    recurring_total: recurring.total
  };
}

export async function createStripeOfferQuote(input: {
  provider: StripeBillingProvider;
  subscription: Stripe.Subscription;
  organizationId: string;
  actorUserId: string;
  target: BillingOfferSelection;
  operationRevision: string | null;
  now: number;
}): Promise<BillingOfferQuote> {
  const action = stripeOfferChangeAction(input.provider, input.subscription, input.target);
  const items = buildStripeOfferItems(input.subscription, input.provider.priceMap, {
    plan: input.target.target_plan,
    interval: input.target.interval,
    currency: "usd"
  });
  if (!action || !items || !input.provider.webhookSecret)
    throw new Error("billing_offer_not_available");
  const current = readStripeSubscriptionOffer(input.subscription, input.provider.priceMap);
  const prorationDate = Math.floor(input.now / 1000);
  const period = resolveStripeSubscriptionBillingPeriod(input.subscription);
  if (!period.ends_at || Date.parse(period.ends_at) <= input.now)
    throw new Error("billing_period_unavailable");
  const claims = ClaimsSchema.parse({
    ...input.target,
    action,
    organization_id: input.organizationId,
    actor_user_id: input.actorUserId,
    subscription_id: input.subscription.id,
    source: planChangeSource(input.subscription),
    operation_revision: input.operationRevision,
    proration_date: prorationDate,
    items,
    expires_at: new Date((prorationDate + 600) * 1000).toISOString(),
    effective_at:
      action === "upgrade" ? new Date(prorationDate * 1000).toISOString() : period.ends_at,
    additional_capacity_units: current.additional_capacity_units,
    ...(await readStripeOfferAmounts({
      client: input.provider.client,
      subscriptionId: input.subscription.id,
      items,
      prorationDate,
      action,
      ...(input.subscription.schedule ? { recurringPreviewMode: "next" as const } : {})
    }))
  });
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return publicStripeOfferQuote(
    claims,
    `${body}.${signature(input.provider.webhookSecret, body).toString("base64url")}`
  );
}

export function verifyStripeOfferQuote(input: {
  token: string;
  secret: string;
  organizationId: string;
  actorUserId: string;
  subscription: Stripe.Subscription;
  now: number;
}): StripeOfferQuoteClaims | null {
  try {
    if (!input.secret || input.token.length > 8192) return null;
    const [body, mac, extra] = input.token.split(".");
    if (!body || !mac || extra !== undefined) return null;
    const received = Buffer.from(mac, "base64url"),
      expected = signature(input.secret, body);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    const claims = ClaimsSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    return claims.organization_id === input.organizationId &&
      claims.actor_user_id === input.actorUserId &&
      claims.subscription_id === input.subscription.id &&
      claims.source === planChangeSource(input.subscription) &&
      Date.parse(claims.expires_at) > input.now &&
      Date.parse(claims.expires_at) === (claims.proration_date + 600) * 1000 &&
      claims.proration_date * 1000 <= input.now + 60000
      ? claims
      : null;
  } catch {
    return null;
  }
}
