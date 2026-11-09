import { createHash } from "node:crypto";

export interface BillingContactSnapshot {
  owner_user_id: string;
  customer_id: string;
  email: string;
}
interface BillingContactClient {
  customers: {
    update(
      id: string,
      params: { email: string },
      options: { idempotencyKey: string; timeout: number; maxNetworkRetries: number }
    ): Promise<unknown>;
  };
}
function contactIdentity(organizationId: string, contact: BillingContactSnapshot): string {
  return createHash("sha256")
    .update(
      JSON.stringify([organizationId, contact.owner_user_id, contact.customer_id, contact.email])
    )
    .digest("hex");
}
/** Runs after the ownership transaction commits. A race or uncertain write stays
 * retryable; each retry resolves today's Owner and retains the existing customer. */
export async function syncStripeBillingContact(input: {
  organizationId: string;
  readContact(organizationId: string): Promise<BillingContactSnapshot | null>;
  client: BillingContactClient;
}): Promise<void> {
  const contact = await input.readContact(input.organizationId);
  if (contact === null) return;
  const identity = contactIdentity(input.organizationId, contact);
  await input.client.customers.update(
    contact.customer_id,
    { email: contact.email },
    {
      idempotencyKey: `billing-contact:${identity}`,
      timeout: 8000,
      maxNetworkRetries: 0
    }
  );
  const current = await input.readContact(input.organizationId);
  if (current !== null && contactIdentity(input.organizationId, current) !== identity)
    throw new Error("billing_contact_changed");
}
