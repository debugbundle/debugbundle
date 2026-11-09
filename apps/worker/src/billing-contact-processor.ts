import Stripe from "stripe";
import { z } from "zod";
import type { Queryable } from "../../../packages/storage/src/types.js";
import { readCurrentBillingContact } from "../../../packages/storage/src/billing-contact.js";
import { syncStripeBillingContact } from "../../../packages/billing/src/stripe-billing-contact.js";

const PayloadSchema = z.object({ organization_id: z.uuid(), transfer_id: z.uuid() }).strict();
interface BillingContactQueue {
  dequeueInternal(name: string): Promise<Record<string, unknown> | null>;
}
export function createBillingContactProcessor(
  db: Queryable,
  secretKey: string | undefined
): (queue: BillingContactQueue) => Promise<{ processed: boolean }> {
  const client = secretKey?.trim()
    ? new Stripe(secretKey, {
        apiVersion: "2026-02-25.clover",
        timeout: 8000,
        maxNetworkRetries: 0
      })
    : null;
  return async (queue) => {
    // Self-hosted debugging does not require billing credentials. Leave the
    // durable intent untouched until its billing integration is configured.
    if (client === null) return { processed: false };
    const raw = await queue.dequeueInternal("sync-billing-contact");
    if (raw === null) return { processed: false };
    const payload = PayloadSchema.parse(raw);
    await syncStripeBillingContact({
      organizationId: payload.organization_id,
      client,
      readContact: (org) => readCurrentBillingContact(db, org)
    });
    return { processed: true };
  };
}
