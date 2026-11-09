import { expect, it, vi } from "vitest";
import { syncStripeBillingContact } from "../../../packages/billing/src/stripe-billing-contact.js";

const contact = { owner_user_id: "owner", customer_id: "cus_test", email: "owner@example.test" };
function setup() {
  return {
    organizationId: "organization",
    readContact: vi.fn().mockResolvedValue(contact),
    client: { customers: { update: vi.fn().mockResolvedValue({}) } }
  };
}
it("syncs only the current contact on the existing customer with a stable retry key", async () => {
  const input = setup();
  await syncStripeBillingContact(input);
  await syncStripeBillingContact(input);
  expect(input.client.customers.update).toHaveBeenCalledTimes(2);
  expect(input.client.customers.update.mock.calls[0]).toEqual(
    input.client.customers.update.mock.calls[1]
  );
  expect(input.client.customers.update.mock.calls[0]).toEqual([
    "cus_test",
    { email: "owner@example.test" },
    {
      idempotencyKey: expect.stringMatching(/^billing-contact:[a-f0-9]{64}$/),
      timeout: 8000,
      maxNetworkRetries: 0
    }
  ]);
});
it("reads the live Owner again after provider acknowledgement and retries a raced transfer", async () => {
  const input = setup();
  const next = { ...contact, owner_user_id: "next", email: "next@example.test" };
  input.readContact.mockResolvedValueOnce(contact).mockResolvedValue(next);
  await expect(syncStripeBillingContact(input)).rejects.toThrow("billing_contact_changed");
  await syncStripeBillingContact(input);
  expect(input.client.customers.update.mock.calls[1]?.[1]).toEqual({ email: next.email });
  expect(input.client.customers.update.mock.calls[0]?.[2]).not.toEqual(
    input.client.customers.update.mock.calls[1]?.[2]
  );
});
it("leaves uncertain provider failures retryable without creating customers or subscriptions", async () => {
  const input = setup();
  input.client.customers.update.mockRejectedValueOnce(new Error("response_lost"));
  await expect(syncStripeBillingContact(input)).rejects.toThrow("response_lost");
  await syncStripeBillingContact(input);
  expect(input.client.customers.update.mock.calls[0]).toEqual(
    input.client.customers.update.mock.calls[1]
  );
});
it("does not contact the provider for an organisation without a linked customer", async () => {
  const input = setup();
  input.readContact.mockResolvedValue(null);
  await syncStripeBillingContact(input);
  expect(input.client.customers.update).not.toHaveBeenCalled();
});
