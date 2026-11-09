import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type {
  BillingSubscriptionOperation,
  BillingSubscriptionOperationStore
} from "../../../packages/storage/src/billing-subscription-operation-store.js";
import type {
  StripeBillingProvider,
  StripePriceMapping
} from "../../../packages/billing/src/stripe-subscription.js";
import {
  previewStripeOfferUpgrade,
  createStripeOfferUpgradeLink
} from "../../../packages/billing/src/stripe-offer-upgrade.js";

function fixture() {
  const now = Date.parse("2026-02-10T12:00:00Z");
  let operation: BillingSubscriptionOperation | null = null;
  const store: BillingSubscriptionOperationStore = {
    get: vi.fn(async () => operation),
    claim: vi.fn(async (input) => {
      if (operation && JSON.stringify(operation.intent) !== JSON.stringify(input.intent))
        return "billing_change_in_progress";
      operation ??= {
        id: "attempt",
        organization_id: "org",
        subscription_id: "sub",
        customer_id: "cus",
        kind: input.kind,
        intent: input.intent,
        parameters: null,
        resource_id: null,
        created_at: new Date(now).toISOString(),
        completed_at: null
      };
      return operation;
    }),
    prepare: vi.fn(async (_org, _id, parameters) => {
      operation!.parameters ??= parameters;
      return operation;
    }),
    saveResource: vi.fn(async (_org, _id, id) => {
      operation!.resource_id = id;
      return true;
    }),
    complete: vi.fn(async () => true),
    abandonUnprepared: vi.fn(async () => true),
    retireVoidedPayment: vi.fn(async () => true)
  };
  const subscription = {
    id: "sub",
    customer: "cus",
    status: "active",
    collection_method: "charge_automatically",
    latest_invoice: { id: "previous", status: "paid" },
    items: {
      data: [
        {
          id: "base",
          quantity: 1,
          price: {
            id: "team_year",
            currency: "usd",
            recurring: { interval: "year", interval_count: 1 }
          },
          current_period_start: 1769817600,
          current_period_end: 1801353600
        }
      ]
    }
  } as Stripe.Subscription;
  const invoice = {
    id: "invoice",
    customer: "cus",
    parent: { subscription_details: { subscription: "sub" } },
    billing_reason: "subscription_update",
    status: "open",
    hosted_invoice_url: "https://invoice.stripe.com/payment"
  };
  const update = vi.fn(async () => ({ ...subscription, latest_invoice: invoice }));
  const retrieve = vi.fn(async () => subscription);
  const priceMap = new Map<string, StripePriceMapping>([
    ["team_year", { plan: "team", type: "plan", interval: "year", currency: "usd" }],
    ["business_year", { plan: "business", type: "plan", interval: "year", currency: "usd" }]
  ]);
  const provider = {
    businessSalesEnabled: true,
    client: {
      subscriptions: { retrieve, update },
      invoices: {
        retrieve: vi.fn(async () => invoice),
        createPreview: vi.fn(async (input: Stripe.InvoiceCreatePreviewParams) =>
          input.preview_mode
            ? { currency: "usd", total: 58800 }
            : { currency: "usd", amount_due: 35000 }
        )
      }
    },
    webhookSecret: "test_secret",
    priceMap
  } as unknown as StripeBillingProvider;
  const input = {
    provider,
    store,
    organizationId: "org",
    subscriptionId: "sub",
    customerId: "cus",
    actorUserId: "owner",
    now,
    target: { target_plan: "business" as const, interval: "year" as const }
  };
  const preview = () => previewStripeOfferUpgrade(input);
  const confirm = (token: string, overrides = {}) =>
    createStripeOfferUpgradeLink({
      ...input,
      appBaseUrl: "https://app.debugbundle.test",
      confirmationToken: token,
      ...overrides
    });
  return {
    input,
    now,
    store,
    subscription,
    invoice,
    update,
    retrieve,
    preview,
    confirm,
    operation: () => operation
  };
}

describe("reserved interval-aware upgrades", () => {
  it("previews without payment and applies the same subscription only after exact confirmation", async () => {
    const f = fixture();
    const result = await f.preview();
    if (typeof result === "string" || !("quote" in result)) throw new Error("quote_missing");
    expect(f.update).not.toHaveBeenCalled();
    expect(await f.confirm(result.quote.confirmation_token)).toEqual({
      url: "https://invoice.stripe.com/payment"
    });
    expect(f.update).toHaveBeenCalledWith(
      "sub",
      expect.objectContaining({
        items: [{ id: "base", price: "business_year", quantity: 1 }],
        payment_behavior: "pending_if_incomplete",
        proration_behavior: "always_invoice"
      }),
      { timeout: 8000, maxNetworkRetries: 0, idempotencyKey: "billing-subscription:attempt:update" }
    );
    expect(f.store.complete).not.toHaveBeenCalled();
  });
  it("preserves and replays the exact prepared command after a lost provider response", async () => {
    const f = fixture();
    const result = await f.preview();
    if (typeof result === "string" || !("quote" in result)) throw new Error("quote_missing");
    f.update.mockRejectedValueOnce(new Error("response_lost"));
    expect(await f.confirm(result.quote.confirmation_token)).toBe("billing_service_error");
    const command = structuredClone(f.operation()!.parameters);
    f.input.provider.businessSalesEnabled = false;
    expect(await f.confirm(result.quote.confirmation_token, { now: f.now + 700000 })).toEqual({
      url: "https://invoice.stripe.com/payment"
    });
    expect(f.operation()!.parameters).toEqual(command);
    expect(f.update.mock.calls[1]).toEqual(f.update.mock.calls[0]);
  });
  it("rejects stale unprepared confirmation and an actor substitution without a provider write", async () => {
    const f = fixture();
    const result = await f.preview();
    if (typeof result === "string" || !("quote" in result)) throw new Error("quote_missing");
    expect(await f.confirm(result.quote.confirmation_token, { now: f.now + 600000 })).toBe(
      "upgrade_confirmation_required"
    );
    expect(await f.confirm(result.quote.confirmation_token, { actorUserId: "other_owner" })).toBe(
      "upgrade_confirmation_required"
    );
    expect(f.update).not.toHaveBeenCalled();
    expect(f.store.claim).not.toHaveBeenCalled();
  });
  it("retains an uncertain command after the idempotent replay deadline", async () => {
    const f = fixture();
    const result = await f.preview();
    if (typeof result === "string" || !("quote" in result)) throw new Error("quote_missing");
    f.update.mockRejectedValueOnce(new Error("response_lost"));
    await f.confirm(result.quote.confirmation_token);
    expect(await f.confirm(result.quote.confirmation_token, { now: f.now + 24 * 3600000 })).toBe(
      "checkout_in_progress"
    );
    expect(f.update).toHaveBeenCalledTimes(1);
    expect(f.store.complete).not.toHaveBeenCalled();
  });
});
it("blocks a new Business upgrade when reports are unavailable without losing an existing paid plan", async () => {
  const f = fixture();
  f.input.provider.businessSalesEnabled = false;
  expect(await f.preview()).toBe("checkout_not_allowed");
  expect(f.store.claim).not.toHaveBeenCalled();
  expect(f.update).not.toHaveBeenCalled();
  expect(f.subscription.items.data[0]?.price.id).toBe("team_year");
});
it("rechecks the launch gate when confirming a Business quote without consuming its reservation", async () => {
  const f = fixture(),
    preview = await f.preview();
  if (typeof preview === "string" || !("quote" in preview)) throw new Error("quote_missing");
  f.input.provider.businessSalesEnabled = false;
  expect(await f.confirm(preview.quote.confirmation_token)).toBe("checkout_not_allowed");
  expect(f.store.claim).not.toHaveBeenCalled();
  expect(f.update).not.toHaveBeenCalled();
});
