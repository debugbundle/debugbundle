import { describe, expect, it } from "vitest";
import { buildStripeEvent, createMinimalServer } from "../../helpers/stripe-webhook.js";

function subscription(plan = "team") {
  return {
    id: "sub_existing",
    customer: "cus_existing",
    status: "active",
    metadata: { organization_id: "org_test" },
    pending_update: null,
    items: {
      data: [
        {
          id: "si_base",
          price: { id: `price_${plan}` },
          quantity: 1,
          current_period_start: 1792600000,
          current_period_end: 1795278400
        },
        { id: "si_capacity", price: { id: `price_${plan}_capacity` }, quantity: 7 }
      ]
    },
    latest_invoice: null
  };
}
async function send(
  f: ReturnType<typeof createMinimalServer>,
  event: ReturnType<typeof buildStripeEvent>
) {
  f.stripeConfig.client.webhooks.constructEvent.mockReturnValue(event as never);
  const response = await f.app.inject({
    method: "POST",
    url: "/v1/billing/stripe-webhook",
    payload: Buffer.from(JSON.stringify(event)),
    headers: { "content-type": "application/json", "stripe-signature": "valid_sig" }
  });
  expect(response.statusCode).toBe(200);
}

describe("upgrade webhook ordering and failure isolation", () => {
  it.each([true, false])(
    "reads current Team state when delayed Solo events arrive (invoice first: %s)",
    async (invoiceFirst) => {
      const f = createMinimalServer();
      f.billingSyncStore.resolveOrganizationByStripeCustomerId.mockResolvedValue("org_test");
      let savedPlan = "solo";
      f.billingSummaryReader.getBillingSummaryForOrganization.mockImplementation(async () => ({
        plan: savedPlan as "solo" | "team",
        active_projects: 1,
        capacity_units: { total: 10, additional_purchased: 7 }
      }));
      f.billingSyncStore.updateEntitlements.mockImplementation(async (snapshot) => {
        savedPlan = snapshot.plan;
      });
      f.stripeConfig.client.subscriptions.retrieve.mockResolvedValue(subscription() as never);
      const stale = buildStripeEvent("customer.subscription.updated", subscription("solo"));
      stale.id = "evt_old_solo";
      const paid = buildStripeEvent("invoice.paid", {
        id: "in_upgrade",
        customer: "cus_existing",
        billing_reason: "subscription_update",
        parent: { subscription_details: { subscription: "sub_existing" } }
      });
      paid.id = "evt_upgrade_paid";
      for (const event of invoiceFirst ? [paid, stale] : [stale, paid]) await send(f, event);
      expect(f.billingSyncStore.updateEntitlements).toHaveBeenCalledTimes(2);
      for (const [snapshot] of f.billingSyncStore.updateEntitlements.mock.calls)
        expect(snapshot).toMatchObject({
          plan: "team",
          additional_capacity_units: 7,
          billing_state: "active",
          stripe_subscription_id: "sub_existing"
        });
      expect(f.billingEmails.send).toHaveBeenCalledTimes(1);
      expect(f.billingEmails.send.mock.calls[0]?.[0].subject).toContain("plan changed to team");
      await f.app.close();
    }
  );
  it.each([true, false])(
    "applies a scheduled Solo transition once despite delayed Team events (invoice first: %s)",
    async (invoiceFirst) => {
      const f = createMinimalServer();
      f.billingSyncStore.resolveOrganizationByStripeCustomerId.mockResolvedValue("org_test");
      let savedPlan: "solo" | "team" = "team";
      f.billingSummaryReader.getBillingSummaryForOrganization.mockImplementation(async () => ({
        plan: savedPlan,
        active_projects: 1,
        capacity_units: { total: savedPlan === "team" ? 22 : 10, additional_purchased: 7 }
      }));
      f.billingSyncStore.updateEntitlements.mockImplementation(async (snapshot) => {
        savedPlan = snapshot.plan as "solo" | "team";
      });
      // Scheduling itself must leave the current Team items authoritative.
      f.stripeConfig.client.subscriptions.retrieve.mockResolvedValue({
        ...subscription("team"),
        schedule: "sched_test"
      } as never);
      await send(f, buildStripeEvent("customer.subscription.updated", subscription("team")));
      expect(savedPlan).toBe("team");
      f.billingEmails.send.mockClear();
      f.stripeConfig.client.subscriptions.retrieve.mockResolvedValue(subscription("solo") as never);
      const stale = {
        ...buildStripeEvent("customer.subscription.updated", subscription("team")),
        id: "evt_stale_team"
      };
      const renewal = {
        ...buildStripeEvent("invoice.paid", {
          id: "in_solo_renewal",
          customer: "cus_existing",
          billing_reason: "subscription_cycle",
          parent: { subscription_details: { subscription: "sub_existing" } }
        }),
        id: "evt_solo_renewal"
      };
      for (const event of invoiceFirst ? [renewal, stale] : [stale, renewal]) await send(f, event);
      expect(savedPlan).toBe("solo");
      expect(f.billingSyncStore.updateEntitlements).toHaveBeenLastCalledWith(
        expect.objectContaining({
          plan: "solo",
          additional_capacity_units: 7,
          stripe_subscription_id: "sub_existing"
        })
      );
      expect(
        f.billingEmails.send.mock.calls.filter(([email]) =>
          email.subject.includes("plan changed to solo")
        )
      ).toHaveLength(1);
      await f.app.close();
    }
  );
  it("does not put the paid Solo plan into dunning when only its pending upgrade payment fails", async () => {
    const f = createMinimalServer();
    f.billingSyncStore.resolveOrganizationByStripeCustomerId.mockResolvedValue("org_test");
    f.stripeConfig.client.subscriptions.retrieve.mockResolvedValue({
      ...subscription("solo"),
      pending_update: { expires_at: 1792700000 }
    } as never);
    await send(
      f,
      buildStripeEvent("invoice.payment_failed", {
        id: "in_upgrade",
        customer: "cus_existing",
        billing_reason: "subscription_update",
        parent: { subscription_details: { subscription: "sub_existing" } },
        attempt_count: 3,
        next_payment_attempt: null
      })
    );
    expect(f.billingSyncStore.updateBillingState).not.toHaveBeenCalled();
    expect(f.billingSyncStore.updateEntitlements).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: "solo",
        billing_state: "active",
        additional_capacity_units: 7
      })
    );
    expect(f.billingEmails.send).not.toHaveBeenCalled();
    await f.app.close();
  });
  it("does not send cancellation mail for an old subscription after resubscription", async () => {
    const f = createMinimalServer();
    f.billingSyncStore.revokeEntitlements.mockResolvedValue(false);
    await send(
      f,
      buildStripeEvent("customer.subscription.deleted", {
        ...subscription("solo"),
        id: "sub_old",
        status: "canceled"
      })
    );
    expect(f.billingSyncStore.revokeEntitlements).toHaveBeenCalledWith(
      "org_test",
      expect.any(String),
      "sub_old"
    );
    expect(f.billingEmails.send).not.toHaveBeenCalled();
    await f.app.close();
  });
});
