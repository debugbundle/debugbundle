import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import Stripe from "stripe";
import { createStripeConfig } from "../apps/api/src/stripe-config.js";
import { previewStripeSubscriptionUpgrade } from "../packages/billing/src/stripe-upgrade-preview.js";
import { createStripeSubscriptionUpgradeLink } from "../packages/billing/src/stripe-subscription-upgrade.js";
import { runStripeCapacityOperation } from "../packages/billing/src/stripe-capacity-operations.js";
import {
  loadStripeBillingSubscriptionState,
  projectBillingSummary
} from "../packages/billing/src/stripe-capacity.js";
import type { BillingSummaryRecord } from "../packages/storage/src/index.js";
import { createStripePlanChangeService } from "../packages/billing/src/stripe-plan-change.js";
import { createMemoryBillingSubscriptionOperationStore } from "../tests/helpers/billing-subscription-operations.js";

// Explicit opt-in, a test-only key and account/balance readback precede writes.
// This runner creates its own fixtures and cleans up only its recorded objects.
const key = process.env["STRIPE_TEST_KEY"] ?? "";
assert.equal(process.env["RUN_STRIPE_TEST"], "1");
if (!/^(sk|rk)_test_/.test(key)) throw new Error("A test-only Stripe credential is required");
const client = new Stripe(key, {
  apiVersion: "2026-02-25.clover",
  timeout: 15000,
  maxNetworkRetries: 2
});
const run = randomUUID();
const receipt = {
  run,
  started_at: new Date().toISOString(),
  hosted_browser: process.env["STRIPE_TEST_HOSTED"] === "1",
  checks: [] as string[],
  objects: [] as Array<{ type: string; id: string }>,
  cleanup_errors: [] as string[],
  error: null as string | null
};
const save = () =>
  writeFileSync(`.local-notes/stripe-test-${run}.json`, JSON.stringify(receipt, null, 2) + "\n", {
    mode: 0o600
  });
const record = <T extends { id: string; livemode?: boolean }>(type: string, value: T): T => {
  assert.notEqual(value.livemode, true);
  receipt.objects.push({ type, id: value.id });
  save();
  return value;
};
const check = (name: string) => {
  receipt.checks.push(name);
  save();
  console.log(`PASS ${name}`);
};
const request = (label: string) => ({ idempotencyKey: `debugbundle-local-test:${run}:${label}` });
const metadata = { debugbundle_billing_test: run };
try {
  const account = await client.accounts.retrieve(null);
  assert.equal(account.id, process.env["STRIPE_TEST_ACCOUNT"]);
  assert.equal((await client.balance.retrieve()).livemode, false);
  check("Expected DebugBundle account and test mode verified");
  const product = record(
    "product",
    await client.products.create(
      { name: `DebugBundle local billing test ${run}`, metadata },
      request("product")
    )
  );
  const prices: Record<string, string> = {};
  for (const [name, amount] of [
    ["solo", 499],
    ["team", 1900],
    ["solo_extra", 99],
    ["team_extra", 199]
  ] as const) {
    prices[name] = record(
      "price",
      await client.prices.create(
        {
          product: product.id,
          currency: "usd",
          unit_amount: amount,
          recurring: { interval: "month" },
          tax_behavior: "exclusive",
          metadata
        },
        request(name)
      )
    ).id;
  }
  const provider = createStripeConfig({
    STRIPE_SECRET_KEY: key,
    STRIPE_WEBHOOK_SECRET: `local_quote_${run}`,
    STRIPE_SOLO_PRICE_ID: prices["solo"],
    STRIPE_TEAM_PRICE_ID: prices["team"],
    STRIPE_SOLO_EXTRA_CAPACITY_PRICE_ID: prices["solo_extra"],
    STRIPE_TEAM_EXTRA_CAPACITY_PRICE_ID: prices["team_extra"]
  });
  assert.ok(provider);
  const previewInvoice = provider.client.invoices.createPreview.bind(provider.client.invoices);
  provider.client.invoices.createPreview = async (params, options) => {
    try {
      return await previewInvoice(params, options);
    } catch (error) {
      console.error(
        `Provider preview failed: ${error instanceof Stripe.errors.StripeError ? error.message : "unknown provider error"}`
      );
      throw error;
    }
  };
  const tax = record(
    "tax_rate",
    await client.taxRates.create(
      { display_name: "Local test tax", percentage: 20, inclusive: false, metadata },
      request("tax")
    )
  );
  const coupon = record(
    "coupon",
    await client.coupons.create(
      { percent_off: 25, duration: "forever", metadata },
      request("coupon")
    )
  );
  const scenarios =
    process.env["STRIPE_TEST_HOSTED"] === "1"
      ? (["authentication"] as const)
      : (["paid", "declined", "authentication"] as const);
  for (const scenario of scenarios) {
    const organizationId = randomUUID();
    let providerNow = Date.now();
    const clock =
      scenario === "paid"
        ? record(
            "test_clock",
            await client.testHelpers.testClocks.create(
              { frozen_time: Math.floor(providerNow / 1000), name: `DebugBundle local ${run}` },
              request("clock")
            )
          )
        : null;
    const customer = record(
      "customer",
      await client.customers.create(
        {
          name: `DebugBundle synthetic ${scenario}`,
          ...(clock ? { test_clock: clock.id } : {}),
          metadata: { ...metadata, organization_id: organizationId }
        },
        request(`${scenario}:customer`)
      )
    );
    const card = await client.paymentMethods.attach(
      "pm_card_visa",
      { customer: customer.id },
      request(`${scenario}:card`)
    );
    assert.equal(card.livemode, false);
    const quantity = scenario === "paid" ? 7 : 0;
    const subscription = record(
      "subscription",
      await client.subscriptions.create(
        {
          customer: customer.id,
          default_payment_method: card.id,
          items: [
            { price: prices["solo"]!, quantity: 1 },
            ...(quantity ? [{ price: prices["solo_extra"]!, quantity }] : [])
          ],
          metadata: { ...metadata, organization_id: organizationId },
          payment_behavior: "error_if_incomplete",
          ...(scenario === "paid"
            ? { default_tax_rates: [tax.id], discounts: [{ coupon: coupon.id }] }
            : {}),
          expand: ["latest_invoice"]
        },
        request(`${scenario}:subscription`)
      )
    );
    assert.equal(subscription.status, "active");
    if (scenario !== "paid") {
      const failureCard = await client.paymentMethods.attach(
        scenario === "declined" ? "pm_card_chargeCustomerFail" : "pm_card_authenticationRequired",
        { customer: customer.id },
        request(`${scenario}:failure-card`)
      );
      await client.subscriptions.update(
        subscription.id,
        { default_payment_method: failureCard.id },
        request(`${scenario}:payment-method`)
      );
    }
    const store = createMemoryBillingSubscriptionOperationStore(
      subscription.id,
      customer.id,
      randomUUID(),
      () => providerNow
    );
    if (!clock) providerNow = Date.now();
    const preview = await previewStripeSubscriptionUpgrade({
      provider,
      store,
      organizationId,
      subscriptionId: subscription.id,
      customerId: customer.id,
      now: providerNow
    });
    assert.ok(
      typeof preview === "object" && "quote" in preview,
      `Upgrade preview failed: ${typeof preview === "string" ? preview : "no quote"}`
    );
    const upgrade = (): ReturnType<typeof createStripeSubscriptionUpgradeLink> =>
      createStripeSubscriptionUpgradeLink({
        provider,
        store,
        organizationId,
        appBaseUrl: "http://localhost:5173",
        now: providerNow,
        confirmationToken: preview.quote.confirmation_token
      });
    const result = await upgrade();
    assert.ok(
      result && typeof result === "object",
      `Upgrade failed: ${typeof result === "string" ? result : "unexpected result"}`
    );
    const current = await client.subscriptions.retrieve(subscription.id, {
      expand: ["latest_invoice"]
    });
    const invoice = current.latest_invoice as Stripe.Invoice;
    assert.equal(invoice.billing_reason, "subscription_update");
    const savedInvoice = (await store.get(organizationId))?.resource_id;
    const repeated = await upgrade();
    assert.ok(typeof repeated === "object");
    // Stripe can refresh the signed hosted URL on each read. Invoice identity,
    // not byte equality of that expiring link, proves payment reuse.
    if (scenario === "paid") assert.deepEqual(repeated, result);
    else assert.equal((await store.get(organizationId))?.resource_id, savedInvoice);
    assert.equal(
      (await client.invoices.list({ customer: customer.id, limit: 100 })).data.filter(
        (value) => value.billing_reason === "subscription_update"
      ).length,
      1
    );
    if (scenario === "paid") {
      assert.equal(invoice.status, "paid");
      assert.ok(current.items.data.some((item) => item.price.id === prices["team"]));
      assert.equal(
        current.items.data.find((item) => item.price.id === prices["team_extra"])?.quantity,
        quantity
      );
      assert.equal(invoice.amount_due, preview.quote.amount_due);
      const change = createStripePlanChangeService({
        provider,
        store,
        organizationId,
        subscriptionId: subscription.id,
        customerId: customer.id,
        now: () => providerNow
      });
      const quote = await change.preview();
      assert.ok(
        typeof quote === "object",
        `Downgrade preview failed: ${typeof quote === "string" ? quote : "unexpected result"}`
      );
      const scheduled = await change.schedule(quote.quote.confirmation_token);
      assert.ok(
        typeof scheduled === "object" && scheduled.pending_change,
        `Schedule failed: ${typeof scheduled === "string" ? scheduled : "unexpected result"}`
      );
      record("schedule", { id: scheduled.pending_change.schedule_id, livemode: false });
      assert.equal(scheduled.pending_change.additional_capacity_units, quantity);
      const schedule = await client.subscriptionSchedules.retrieve(
        scheduled.pending_change.schedule_id
      );
      assert.equal(
        schedule.phases[1]?.items.find((item) => item.price === prices["solo_extra"])?.quantity,
        quantity
      );
      assert.equal(
        (await client.subscriptions.retrieve(subscription.id)).items.data[0]?.price.id,
        prices["team"]
      );
      assert.deepEqual(await change.cancel(schedule.id), { pending_change: null });
      assert.equal((await client.subscriptions.retrieve(subscription.id)).status, "active");
      check(
        "Paid same-subscription upgrade, exact quoted proration, tax/discount, retained capacity and schedule/cancel"
      );
      assert.ok(clock);
      const renewalQuote = await change.preview();
      assert.ok(typeof renewalQuote === "object");
      const renewalSchedule = await change.schedule(renewalQuote.quote.confirmation_token);
      assert.ok(typeof renewalSchedule === "object" && renewalSchedule.pending_change);
      record("schedule", { id: renewalSchedule.pending_change.schedule_id });
      providerNow = Date.parse(renewalSchedule.pending_change.effective_at) + 7200_000;
      await client.testHelpers.testClocks.advance(
        clock.id,
        { frozen_time: Math.floor(providerNow / 1000) },
        request("advance")
      );
      let ready = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        if ((await client.testHelpers.testClocks.retrieve(clock.id)).status === "ready") {
          ready = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      assert.ok(ready, "Test clock did not become ready");
      let renewed = await client.subscriptions.retrieve(subscription.id, {
        expand: ["latest_invoice"]
      });
      if ((renewed.latest_invoice as Stripe.Invoice).status !== "paid") {
        providerNow += 7200_000;
        await client.testHelpers.testClocks.advance(
          clock.id,
          { frozen_time: Math.floor(providerNow / 1000) },
          request("advance-finalization")
        );
        for (let attempt = 0; attempt < 60; attempt++) {
          if ((await client.testHelpers.testClocks.retrieve(clock.id)).status === "ready") break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        renewed = await client.subscriptions.retrieve(subscription.id, {
          expand: ["latest_invoice"]
        });
      }
      assert.equal(
        (renewed.latest_invoice as Stripe.Invoice).status,
        "paid",
        "Renewal must be paid before the next upgrade"
      );
      assert.ok(renewed.items.data.some((item) => item.price.id === prices["solo"]));
      assert.equal(
        renewed.items.data.find((item) => item.price.id === prices["solo_extra"])?.quantity,
        quantity
      );
      assert.deepEqual(await change.getStatus(), { pending_change: null });
      const nextQuote = await previewStripeSubscriptionUpgrade({
        provider,
        store,
        organizationId,
        subscriptionId: subscription.id,
        customerId: customer.id,
        now: providerNow
      });
      if (typeof nextQuote === "string") {
        const scheduledState = await client.subscriptionSchedules.retrieve(
          renewalSchedule.pending_change.schedule_id
        );
        console.log(
          JSON.stringify({
            next_quote_error: nextQuote,
            subscription_status: renewed.status,
            invoice_status: (renewed.latest_invoice as Stripe.Invoice).status,
            schedule_status: scheduledState.status,
            phase_count: scheduledState.phases.length,
            phase_dates: scheduledState.phases.map((p) => [p.start_date, p.end_date]),
            current_phase: scheduledState.current_phase
          })
        );
      }
      assert.ok(
        typeof nextQuote === "object" && "quote" in nextQuote,
        "Upgrade after scheduled renewal was blocked"
      );
      const upgradedAgain = await createStripeSubscriptionUpgradeLink({
        provider,
        store,
        organizationId,
        appBaseUrl: "http://localhost:5173",
        confirmationToken: nextQuote.quote.confirmation_token,
        now: providerNow
      });
      assert.ok(
        typeof upgradedAgain === "object" && upgradedAgain.url.includes("checkout=success")
      );
      const final = await client.subscriptions.retrieve(subscription.id);
      assert.equal(final.schedule, null);
      assert.ok(final.items.data.some((item) => item.price.id === prices["team"]));
      check(
        "Stripe test-clock renewal applies Solo once, retains capacity, and permits a later upgrade on the same subscription"
      );

      const metric = () => ({ used: 0, limit: 0 });
      const baseline = {
        organization_id: organizationId,
        plan: "team",
        billing_state: "active",
        stripe_customer_id: customer.id,
        active_projects: 0,
        usage_window: {
          starts_at: new Date(providerNow).toISOString(),
          ends_at: new Date(providerNow + 86400000).toISOString()
        },
        capacity_units: {
          included: 15,
          additional_purchased: quantity,
          total: 15 + quantity,
          pending_reduction: null
        },
        trial: {
          available: false,
          active: false,
          plan: null,
          started_at: null,
          ends_at: null,
          used_at: null,
          converted_at: null,
          expired_at: null,
          days_remaining: null
        },
        allowances: {
          monthly_bundle_requests: metric(),
          monthly_raw_ingested_events: metric(),
          retained_bundle_cap: metric(),
          monthly_remote_activations: metric(),
          monthly_alert_deliveries: metric(),
          monthly_webhook_deliveries: metric()
        }
      } as BillingSummaryRecord;
      const capacity = async (
        kind: "capacity_increase" | "capacity_schedule" | "capacity_cancel",
        target?: number
      ): ReturnType<typeof runStripeCapacityOperation> =>
        runStripeCapacityOperation({
          provider,
          store,
          organizationId,
          kind,
          ...(target === undefined ? {} : { target }),
          now: providerNow,
          loadContext: async () => {
            const stripeState = await loadStripeBillingSubscriptionState({
              stripeConfig: provider,
              subscriptionId: subscription.id,
              fallbackPlan: "team",
              fallbackEffectiveAt: new Date(providerNow).toISOString()
            });
            return {
              stripeState,
              summary: projectBillingSummary({
                summary: baseline,
                plan: stripeState.plan,
                additionalPurchased: stripeState.additionalPurchased,
                pendingReduction: stripeState.pendingReduction
              })
            };
          }
        });
      const added = await capacity("capacity_increase", quantity + 1);
      assert.ok(
        typeof added === "object" &&
          "capacity_units" in added &&
          added.capacity_units.additional_purchased === quantity + 1,
        `Capacity payment failed: ${typeof added === "string" ? added : "unexpected state"}`
      );
      const reduction = await capacity("capacity_schedule", quantity);
      assert.ok(
        typeof reduction === "object" &&
          "capacity_units" in reduction &&
          reduction.capacity_units.pending_reduction?.additional_purchased === quantity,
        `Capacity schedule failed: ${typeof reduction === "string" ? reduction : "unexpected state"}`
      );
      const afterReduction = await client.subscriptions.retrieve(subscription.id);
      assert.ok(typeof afterReduction.schedule === "string");
      record("schedule", { id: afterReduction.schedule });
      assert.equal(
        afterReduction.items.data.find((item) => item.price.id === prices["team_extra"])?.quantity,
        quantity + 1
      );
      const kept = await capacity("capacity_cancel");
      assert.ok(
        typeof kept === "object" &&
          "capacity_units" in kept &&
          kept.capacity_units.pending_reduction === null,
        `Capacity cancellation failed: ${typeof kept === "string" ? kept : "unexpected state"}`
      );
      const unchanged = await client.subscriptions.retrieve(subscription.id);
      assert.equal(unchanged.schedule, null);
      assert.equal(
        unchanged.items.data.find((item) => item.price.id === prices["team_extra"])?.quantity,
        quantity + 1
      );
      check(
        "Capacity increase pays before entitlement; reduction waits until renewal; cancelling it preserves current capacity"
      );
    } else {
      assert.equal(invoice.status, "open");
      assert.ok(current.pending_update);
      assert.ok(current.items.data.some((item) => item.price.id === prices["solo"]));
      assert.match(result.url, /^https:\/\/invoice\.stripe\.com\//);
      const payments = await client.invoicePayments.list({ invoice: invoice.id, limit: 10 });
      const paymentId = payments.data.find((payment) => payment.payment.type === "payment_intent")
        ?.payment.payment_intent;
      assert.ok(typeof paymentId === "string");
      const intent = await client.paymentIntents.retrieve(paymentId);
      assert.equal(
        intent.status,
        scenario === "authentication" ? "requires_action" : "requires_payment_method"
      );
      if (process.env["STRIPE_TEST_HOSTED"] === "1") {
        console.log(`HOSTED_TEST_URL ${result.url}`);
        let paid = false;
        for (let attempt = 0; attempt < 240; attempt++) {
          if ((await client.invoices.retrieve(invoice.id)).status === "paid") {
            paid = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        assert.ok(paid, "Hosted authentication did not complete within the disposable test window");
        assert.equal((await client.paymentIntents.retrieve(paymentId)).status, "succeeded");
        check("Hosted browser authentication completed and paid the original invoice");
      } else {
        await client.subscriptions.update(
          subscription.id,
          { default_payment_method: card.id },
          request(`${scenario}:restore-card`)
        );
        await client.invoices.pay(
          invoice.id,
          { payment_method: card.id },
          request(`${scenario}:recover`)
        );
      }
      const recovered = await upgrade();
      assert.ok(typeof recovered === "object" && recovered.url.includes("checkout=success"));
      assert.ok(
        (await client.subscriptions.retrieve(subscription.id)).items.data.some(
          (item) => item.price.id === prices["team"]
        )
      );
      check(
        `${scenario}: Solo retained, one invoice across retries, hosted URL and same-invoice payment recovery`
      );
    }
    assert.equal(
      (await client.subscriptions.list({ customer: customer.id, status: "all", limit: 100 })).data
        .length,
      1
    );
  }
} catch (error) {
  // Provider error codes/messages contain no credentials; receipts stay ignored.
  receipt.error = error instanceof Error ? error.message : "unknown_error";
  save();
  console.error(`FAIL ${receipt.error}`);
  process.exitCode = 1;
} finally {
  // IDs come only from this process's successful create responses. Never list
  // account-wide objects and delete by age/name or touch existing subscriptions.
  for (const object of [...receipt.objects].reverse()) {
    try {
      if (object.type === "schedule") {
        const schedule = await client.subscriptionSchedules.retrieve(object.id);
        if (schedule.status === "active" || schedule.status === "not_started")
          await client.subscriptionSchedules.release(object.id);
      } else if (object.type === "subscription") {
        const sub = await client.subscriptions.retrieve(object.id);
        assert.equal(sub.livemode, false);
        assert.equal(sub.metadata["debugbundle_billing_test"], run);
        if (sub.status !== "canceled")
          await client.subscriptions.cancel(object.id, { prorate: false, invoice_now: false });
      } else if (object.type === "customer") await client.customers.del(object.id);
      else if (object.type === "test_clock") await client.testHelpers.testClocks.del(object.id);
      else if (object.type === "coupon") await client.coupons.del(object.id);
      else if (object.type === "tax_rate")
        await client.taxRates.update(object.id, { active: false });
      else if (object.type === "price") await client.prices.update(object.id, { active: false });
      else if (object.type === "product")
        await client.products.update(object.id, { active: false });
    } catch {
      receipt.cleanup_errors.push(`${object.type}:${object.id}`);
      process.exitCode = 1;
    }
    save();
  }
  console.log(
    `Test receipt saved; ${receipt.checks.length} checks, ${receipt.cleanup_errors.length} cleanup errors. ${process.env["STRIPE_TEST_HOSTED"] === "1" ? "Hosted browser result is recorded above." : "Hosted browser challenge completion is a separate gate."}`
  );
}
