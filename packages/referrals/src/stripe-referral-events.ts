import type Stripe from "stripe";
import { z } from "zod";
import {
  ReferralReconciliationEventSchema,
  type ReferralReconciliationEvent
} from "./referral-reconciliation.js";

const ObjectSchema = z.object({
  id: z.string().min(1).max(255),
  customer: z
    .union([z.string().min(1).max(255), z.object({ id: z.string().min(1).max(255) })])
    .nullish(),
  livemode: z.boolean().optional()
});
/** Called only after raw-body signature verification. Retain resource identity,
 * never descriptions, invoice payloads, emails, payment details or metadata. */
export function referralEventFromStripe(event: Stripe.Event): ReferralReconciliationEvent | null {
  let resource: ReferralReconciliationEvent["resource_type"];
  if (event.type.startsWith("charge.dispute.")) resource = "dispute";
  else if (event.type.startsWith("refund.") || event.type === "charge.refund.updated")
    resource = "refund";
  else if (["charge.refunded", "charge.captured", "charge.succeeded"].includes(event.type))
    resource = "charge";
  else if (event.type.startsWith("credit_note.")) resource = "credit_note";
  else if (event.type === "invoice_payment.paid") resource = "invoice_payment";
  else if (event.type.startsWith("invoice.") && event.type !== "invoice.upcoming")
    resource = "invoice";
  else if (
    ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)
  )
    resource = "checkout_session";
  else return null;
  try {
    const object = ObjectSchema.parse(event.data.object);
    if (object.livemode !== undefined && object.livemode !== event.livemode)
      throw new Error("mode_mismatch");
    const created = z.number().int().safe().positive().parse(event.created);
    return ReferralReconciliationEventSchema.parse({
      event_id: event.id,
      event_type: event.type,
      resource_type: resource,
      resource_id: object.id,
      provider_customer_id:
        typeof object.customer === "string" ? object.customer : (object.customer?.id ?? null),
      livemode: event.livemode,
      provider_created_at: new Date(created * 1000).toISOString()
    });
  } catch {
    throw new Error("referral_event_unverified");
  }
}
