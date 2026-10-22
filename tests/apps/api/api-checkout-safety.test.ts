import { describe, expect, it, vi } from "vitest";
import type { StripeConfig } from "../../../apps/api/src/stripe-config.js";
import { createStripeCheckoutLink } from "../../../apps/api/src/stripe-checkout.js";
import type {
  BillingCheckoutAttempt,
  BillingCheckoutStore
} from "../../../packages/storage/src/billing-checkout-store.js";

function setup() {
  let attempt: BillingCheckoutAttempt | null = null;
  const store: BillingCheckoutStore = {
    claim: vi.fn(async (input: Parameters<BillingCheckoutStore["claim"]>[0]) => {
      attempt ??= {
        id: "attempt-1",
        organization_id: input.organization_id,
        target_plan: input.target_plan,
        stripe_session_id: null,
        parameters: input.parameters(null, 1800003600)
      };
      return attempt;
    }),
    saveSession: vi.fn(async (_org, _id, sessionId) => {
      if (attempt) attempt.stripe_session_id = sessionId;
      return true;
    }),
    retireExpired: vi.fn(async () => {
      attempt = null;
      return true;
    }),
    retireEndedSubscription: vi.fn(async () => {
      attempt = null;
      return true;
    })
  };
  const session = {
    id: "cs_test_123",
    status: "open",
    url: "https://checkout.stripe.test/123",
    client_reference_id: "org_123"
  };
  const create = vi.fn().mockResolvedValue(session);
  const retrieve = vi.fn().mockResolvedValue(session);
  const stripe = {
    soloPriceId: "price_solo",
    teamPriceId: "price_team",
    client: { checkout: { sessions: { create, retrieve } } }
  } as unknown as StripeConfig;
  const input = {
    organization_id: "org_123",
    billing_email: "owner@example.com",
    target_plan: "solo" as const,
    current_plan: "free" as const
  };
  const run = () =>
    createStripeCheckoutLink({ stripe, store, appBaseUrl: "https://app.debugbundle.test", input });
  return {
    run,
    create,
    retrieve,
    store,
    session,
    input: input as typeof input & { confirmed_ended_subscription_id?: string }
  };
}

describe("safe Stripe Checkout creation", () => {
  it("keeps an old unsaved attempt reserved after the provider replay window", async () => {
    const f = setup();
    vi.mocked(f.store.claim).mockResolvedValue({
      id: "uncertain_attempt",
      organization_id: "org_123",
      target_plan: "solo",
      stripe_session_id: null,
      parameters: { expires_at: Math.floor(Date.now() / 1000) - 23 * 3600 }
    });
    expect(await f.run()).toBe("checkout_in_progress");
    expect(f.create).not.toHaveBeenCalled();
    expect(f.store.retireExpired).not.toHaveBeenCalled();
  });
  it("replaces a completed reservation only after its exact subscription is confirmed terminal", async () => {
    const f = setup();
    await f.run();
    f.input.confirmed_ended_subscription_id = "sub_ended";
    f.retrieve.mockResolvedValue({
      ...f.session,
      status: "complete",
      subscription: "sub_ended",
      url: null
    });
    expect(await f.run()).toEqual({ url: f.session.url });
    expect(f.store.retireEndedSubscription).toHaveBeenCalledWith(
      "org_123",
      "attempt-1",
      "cs_test_123",
      "sub_ended"
    );
    expect(f.create).toHaveBeenCalledTimes(2);
    const other = setup();
    await other.run();
    other.input.confirmed_ended_subscription_id = "sub_other";
    other.retrieve.mockResolvedValue({
      ...other.session,
      status: "complete",
      subscription: "sub_ended"
    });
    expect(await other.run()).toBe("checkout_in_progress");
    expect(other.store.retireEndedSubscription).not.toHaveBeenCalled();
  });
  it("reconciles an expired saved session before changing its target plan", async () => {
    const f = setup();
    vi.mocked(f.store.claim).mockResolvedValueOnce({
      id: "old_attempt",
      organization_id: "org_123",
      target_plan: "team",
      stripe_session_id: "cs_old",
      parameters: {}
    });
    f.retrieve.mockResolvedValue({ ...f.session, id: "cs_old", status: "expired", url: null });
    expect(await f.run()).toEqual({ url: f.session.url });
    expect(f.store.retireExpired).toHaveBeenCalledWith("org_123", "old_attempt", "cs_old");
    expect(f.create).toHaveBeenCalledTimes(1);
  });
  it("does not return another plan's open session or replay an unsaved different-plan attempt", async () => {
    const f = setup();
    const old = {
      id: "old_attempt",
      organization_id: "org_123",
      target_plan: "team" as const,
      stripe_session_id: "cs_old",
      parameters: {}
    };
    vi.mocked(f.store.claim).mockResolvedValue(old);
    expect(await f.run()).toBe("checkout_in_progress");
    vi.mocked(f.store.claim).mockResolvedValue({ ...old, stripe_session_id: null });
    expect(await f.run()).toBe("checkout_in_progress");
    expect(f.create).not.toHaveBeenCalled();
  });
  it("returns a provider error for a session without a usable hosted URL", async () => {
    const f = setup();
    f.create.mockResolvedValue({ ...f.session, url: null });
    expect(await f.run()).toBe("billing_service_error");
  });
  it("reuses the same open checkout and requests 3DS with a fixed expiry", async () => {
    const f = setup();
    expect(await f.run()).toEqual({ url: f.session.url });
    expect(await f.run()).toEqual({ url: f.session.url });
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.retrieve).toHaveBeenCalledWith(
      "cs_test_123",
      {},
      { timeout: 8_000, maxNetworkRetries: 0 }
    );
    expect(f.create).toHaveBeenCalledWith(
      expect.objectContaining({
        expires_at: 1800003600,
        payment_method_options: { card: { request_three_d_secure: "any" } },
        metadata: { organization_id: "org_123" },
        customer_email: "owner@example.com"
      }),
      { timeout: 8_000, maxNetworkRetries: 0, idempotencyKey: "billing-checkout:attempt-1" }
    );
  });
  it("replays identical persisted parameters and idempotency after an uncertain Stripe response", async () => {
    const f = setup();
    f.create.mockRejectedValueOnce(new Error("timeout after request"));
    expect(await f.run()).toBe("billing_service_error");
    expect(await f.run()).toEqual({ url: f.session.url });
    expect(f.create.mock.calls[1]).toEqual(f.create.mock.calls[0]);
  });
  it("does not return a new payment page for a completed checkout awaiting webhook reconciliation", async () => {
    const f = setup();
    await f.run();
    f.retrieve.mockResolvedValue({ ...f.session, status: "complete", url: null });
    expect(await f.run()).toBe("checkout_in_progress");
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.store.retireExpired).not.toHaveBeenCalled();
  });
  it("fails closed for another organisation's session or a failed persistence write", async () => {
    const f = setup();
    await f.run();
    f.retrieve.mockResolvedValue({ ...f.session, client_reference_id: "other_org" });
    expect(await f.run()).toBe("billing_service_error");
    const second = setup();
    vi.mocked(second.store.saveSession).mockResolvedValue(false);
    expect(await second.run()).toBe("billing_service_error");
  });
  it("preserves an in-flight plan choice and rejects suspended or already subscribed accounts", async () => {
    const f = setup();
    vi.mocked(f.store.claim).mockResolvedValue("checkout_in_progress");
    expect(await f.run()).toBe("checkout_in_progress");
    vi.mocked(f.store.claim).mockResolvedValue("checkout_not_allowed");
    expect(await f.run()).toBe("checkout_not_allowed");
    vi.mocked(f.store.claim).mockResolvedValue("paid_purchase_locked");
    expect(await f.run()).toBe("paid_purchase_locked");
    expect(f.create).not.toHaveBeenCalled();
    expect(f.retrieve).not.toHaveBeenCalled();
    expect(f.store.retireExpired).not.toHaveBeenCalled();
  });
  it("retires only a Stripe-confirmed expired attempt before replacing it", async () => {
    const f = setup();
    await f.run();
    f.retrieve.mockResolvedValue({ ...f.session, status: "expired", url: null });
    expect(await f.run()).toEqual({ url: f.session.url });
    expect(f.store.retireExpired).toHaveBeenCalledWith("org_123", "attempt-1", "cs_test_123");
    expect(f.create).toHaveBeenCalledTimes(2);
  });
});
