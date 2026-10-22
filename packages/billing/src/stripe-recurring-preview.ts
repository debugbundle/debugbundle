import type Stripe from "stripe";

/** A next-invoice preview is a monthly estimate only if all lines are recurring. */
export async function readRecurringInvoice(
  client: Stripe,
  subscriptionId: string,
  items: Stripe.SubscriptionUpdateParams.Item[],
  mode?: "next"
): Promise<Stripe.Invoice> {
  const invoice = await client.invoices.createPreview(
    {
      subscription: subscriptionId,
      preview_mode: mode ?? "recurring",
      subscription_details: { items, proration_behavior: "none" }
    },
    { timeout: 8000, maxNetworkRetries: 0 }
  );
  // Stripe rejects recurring-estimate mode for attached schedules. For a
  // validated, already applied final phase, require complete recurring lines
  // before treating a next-invoice preview as the new monthly total.
  if (
    mode === "next" &&
    (invoice.lines.has_more ||
      invoice.lines.data.length !== items.length ||
      !items.every((item) =>
        invoice.lines.data.some((line) => {
          const price = line.pricing?.price_details?.price;
          return (
            line.parent?.type === "subscription_item_details" &&
            !line.parent.subscription_item_details?.proration &&
            (typeof price === "string" ? price : price?.id) === item.price &&
            line.quantity === item.quantity
          );
        })
      ))
  )
    throw new Error("billing_recurring_quote_unavailable");
  if (invoice.automatic_tax?.status && invoice.automatic_tax.status !== "complete")
    throw new Error("billing_quote_unavailable");
  return invoice;
}
