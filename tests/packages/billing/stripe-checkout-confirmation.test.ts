import { describe, expect, it, vi } from "vitest";
import { confirmStripeCheckout } from "../../../packages/billing/src/stripe-checkout-confirmation.js";

function fixture() {
  const sub = {
    id: "sub_test",
    customer: "cus_test",
    status: "active",
    metadata: { organization_id: "org_test" },
    items: { has_more: false, data: [{ id: "si_base", price: { id: "price_solo" }, quantity: 1 }] }
  };
  const session = {
    id: "cs_test",
    status: "complete",
    mode: "subscription",
    payment_status: "paid",
    customer: "cus_test",
    client_reference_id: "org_test",
    subscription: { ...sub, status: "canceled" }
  };
  const retrieve = vi.fn(async () => sub);
  const updateEntitlements = vi.fn(async () => true);
  const row = {
    revision: "123",
    stripe_subscription_id: "sub_test",
    stripe_customer_id: "cus_test",
    billing_state: "active"
  };
  const input = {
    organizationId: "org_test",
    sessionId: "cs_test",
    now: "2026-10-22T07:00:00Z",
    db: { query: vi.fn(async () => ({ rows: [row] })) } as never,
    store: { updateEntitlements } as never,
    provider: {
      client: {
        checkout: { sessions: { retrieve: vi.fn(async () => session) } },
        subscriptions: { retrieve }
      },
      priceMap: new Map([["price_solo", { plan: "solo", type: "plan" }]])
    } as never
  };
  return { input, sub, session, retrieve, row, updateEntitlements };
}
describe("checkout return reconciliation", () => {
  it("reads current subscription independently and conditionally applies its snapshot", async () => {
    const f = fixture();
    expect(await confirmStripeCheckout(f.input)).toBe("confirmed");
    expect(f.retrieve).toHaveBeenCalledWith("sub_test", expect.anything(), {
      timeout: 8000,
      maxNetworkRetries: 0
    });
    expect(f.updateEntitlements).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "solo", expected_revision: "123" })
    );
  });
  it.each([
    "wrong_customer",
    "wrong_metadata",
    "terminal",
    "incomplete",
    "unpaid_checkout",
    "wrong_mode",
    "superseded"
  ])("rejects %s without changing paid entitlements", async (reason) => {
    const f = fixture();
    if (reason === "wrong_customer") f.sub.customer = "cus_other";
    if (reason === "wrong_metadata") f.sub.metadata.organization_id = "org_other";
    if (reason === "terminal") f.sub.status = "canceled";
    if (reason === "incomplete") f.sub.status = "incomplete";
    if (reason === "unpaid_checkout") f.session.payment_status = "unpaid";
    if (reason === "wrong_mode") f.session.mode = "payment";
    if (reason === "superseded") f.row.stripe_subscription_id = "sub_new";
    expect(await confirmStripeCheckout(f.input)).not.toBe("confirmed");
    expect(f.updateEntitlements).not.toHaveBeenCalled();
  });
  it("does not report confirmation when a newer webhook won the database revision race", async () => {
    const f = fixture();
    f.updateEntitlements.mockResolvedValue(false);
    expect(await confirmStripeCheckout(f.input)).toBe("checkout_not_complete");
  });
});

it("requires live terminal proof before atomically replacing an ended subscription", async () => {
  const f = fixture();
  f.row.stripe_subscription_id = "sub_old";
  f.row.billing_state = "canceled";
  f.retrieve.mockImplementation(async (...args: unknown[]) =>
    args[0] === "sub_old" ? { ...f.sub, id: "sub_old", status: "canceled" } : f.sub
  );
  expect(await confirmStripeCheckout(f.input)).toBe("confirmed");
  expect(f.updateEntitlements).toHaveBeenCalledWith(
    expect.objectContaining({ expected_revision: "123", replace_from_subscription_id: "sub_old" })
  );
});
it("will not replace a paused subscription merely because the cached state says canceled", async () => {
  const f = fixture();
  f.row.stripe_subscription_id = "sub_old";
  f.row.billing_state = "canceled";
  f.retrieve.mockImplementation(async (...args: unknown[]) =>
    args[0] === "sub_old" ? { ...f.sub, id: "sub_old", status: "paused" } : f.sub
  );
  expect(await confirmStripeCheckout(f.input)).toBe("checkout_not_complete");
  expect(f.updateEntitlements).not.toHaveBeenCalled();
});
