import { createMinimalServer, buildStripeEvent } from "../helpers/stripe-webhook.js";
import { createPostgresBillingSyncStore } from "../../packages/storage/src/billing-sync-store.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { createBillingWebhookTransaction } from "../../packages/billing/src/stripe-webhook-transaction.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";

runIntegration("billing webhook atomic state and notification delivery", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  beforeAll(async () => {
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
  });
  const organizations: string[] = [];
  afterAll(async () => {
    await pool.query(
      "DELETE FROM processed_billing_events WHERE organization_id = ANY($1::uuid[])",
      [organizations]
    );
    await pool.query("DELETE FROM organizations WHERE id = ANY($1::uuid[])", [organizations]);
    await pool.end();
  });
  async function org() {
    const id = randomUUID();
    organizations.push(id);
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan,additional_capacity_units,stripe_customer_id,stripe_subscription_id,billing_state) VALUES($1::uuid,'Synthetic billing',$1::text,'solo',7,$2,$3,'active')",
      [id, `cus_${id}`, `sub_${id}`]
    );
    return id;
  }
  it("does not invent a prior billing snapshot for a removed account", async () => {
    const id = randomUUID();
    const result = await createBillingWebhookTransaction(db)(
      id,
      `evt_missing_${id}`,
      async (context) =>
        context.billingSummaryReader.getBillingSummaryForOrganization({
          organization_id: id,
          now: new Date().toISOString()
        })
    );
    expect(result).toBeNull();
  });
  it("routes different concurrent upgrade events through one persisted transition and queued email", async () => {
    const id = await org();
    const { app, stripeConfig, billingEmails } = createMinimalServer({
      billingSyncStore: createPostgresBillingSyncStore(db),
      eventTransaction: createBillingWebhookTransaction(db)
    });
    const sub = {
      id: `sub_${id}`,
      customer: `cus_${id}`,
      status: "active",
      metadata: { organization_id: id },
      items: {
        has_more: false,
        data: [
          {
            id: "si_base",
            price: { id: "price_team" },
            quantity: 1,
            current_period_start: 1792540800,
            current_period_end: 1795219200
          },
          {
            id: "si_extra",
            price: { id: "price_team_capacity" },
            quantity: 7,
            current_period_start: 1792540800,
            current_period_end: 1795219200
          }
        ]
      }
    };
    stripeConfig.client.subscriptions.retrieve.mockResolvedValue(sub as never);
    stripeConfig.client.webhooks.constructEvent.mockImplementation(
      (payload) =>
        JSON.parse(String(payload)) as ReturnType<
          typeof stripeConfig.client.webhooks.constructEvent
        >
    );
    const events = [
      { ...buildStripeEvent("customer.subscription.updated", sub), id: `evt_sub_${id}` },
      {
        ...buildStripeEvent("invoice.paid", {
          customer: `cus_${id}`,
          billing_reason: "subscription_update",
          parent: { subscription_details: { subscription: sub.id } }
        }),
        id: `evt_invoice_${id}`
      }
    ];
    const responses = await Promise.all(
      events.map((event) =>
        app.inject({
          method: "POST",
          url: "/v1/billing/stripe-webhook",
          headers: { "content-type": "application/json", "stripe-signature": "synthetic" },
          payload: JSON.stringify(event)
        })
      )
    );
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    expect(
      (await pool.query("SELECT plan FROM organizations WHERE id=$1", [id])).rows[0]?.plan
    ).toBe("team");
    expect(
      (
        await pool.query("SELECT id FROM operational_email_deliveries WHERE organization_id=$1", [
          id
        ])
      ).rows
    ).toHaveLength(1);
    expect(billingEmails.send).not.toHaveBeenCalled();
    await app.close();
  });
  it("rejects an older checkout snapshot after another billing write changed the row revision", async () => {
    const id = await org();
    const old = (
      await pool.query("SELECT xmin::text AS revision FROM organizations WHERE id=$1", [id])
    ).rows[0]!.revision;
    await pool.query("UPDATE organizations SET plan='team' WHERE id=$1", [id]);
    const applied = await createPostgresBillingSyncStore(db).updateEntitlements({
      organization_id: id,
      plan: "solo",
      additional_capacity_units: 7,
      billing_state: "active",
      stripe_customer_id: `cus_${id}`,
      stripe_subscription_id: `sub_${id}`,
      billing_period_starts_at: null,
      billing_period_ends_at: null,
      last_billing_event_id: "checkout_session:old",
      last_billing_sync_at: new Date().toISOString(),
      expected_revision: old
    });
    expect(applied).toBe(false);
    expect(
      (await pool.query("SELECT plan FROM organizations WHERE id=$1", [id])).rows[0]?.plan
    ).toBe("team");
  });
  it("serializes duplicate events and queues one email atomically using the persisted before-state", async () => {
    const id = await org();
    const run = createBillingWebhookTransaction(db);
    const event = `evt_${id}`;
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        run(id, event, async (context) => {
          const before = await context.billingSummaryReader.getBillingSummaryForOrganization({
            organization_id: id,
            now: new Date().toISOString()
          });
          expect(before?.plan).toBe("solo");
          await context.billingSyncStore.updateEntitlements({
            organization_id: id,
            stripe_customer_id: `cus_${id}`,
            stripe_subscription_id: `sub_${id}`,
            plan: "team",
            additional_capacity_units: 7,
            billing_state: "active",
            billing_period_starts_at: null,
            billing_period_ends_at: null,
            last_billing_sync_at: new Date().toISOString(),
            last_billing_event_id: event
          });
          await context.queueEmail(id, {
            subject: "Plan changed",
            text: "Team is active",
            html: "<p>Team is active</p>"
          });
          await context.billingSyncStore.markEventProcessed(
            event,
            "customer.subscription.updated",
            id
          );
          return id;
        })
      )
    );
    expect(results.filter((x) => x === "duplicate")).toHaveLength(7);
    expect(
      (
        await pool.query("SELECT plan,additional_capacity_units FROM organizations WHERE id=$1", [
          id
        ])
      ).rows[0]
    ).toMatchObject({ plan: "team", additional_capacity_units: 7 });
    expect(
      (
        await pool.query(
          "SELECT kind,payload FROM operational_email_deliveries WHERE organization_id=$1",
          [id]
        )
      ).rows
    ).toEqual([
      {
        kind: "billing_lifecycle",
        payload: { subject: "Plan changed", text: "Team is active", html: "<p>Team is active</p>" }
      }
    ]);
  });
  it("rolls back state, event receipt and notification together on failure, allowing a safe retry", async () => {
    const id = await org();
    const run = createBillingWebhookTransaction(db);
    const event = `evt_${id}`;
    await expect(
      run(id, event, async (context) => {
        await context.billingSyncStore.updateBillingState(id, "past_due", event);
        await context.queueEmail(id, {
          subject: "Payment failed",
          text: "Retry",
          html: "<p>Retry</p>"
        });
        await context.billingSyncStore.markEventProcessed(event, "invoice.payment_failed", id);
        throw new Error("simulated transaction failure");
      })
    ).rejects.toThrow("simulated transaction failure");
    expect(
      (await pool.query("SELECT billing_state FROM organizations WHERE id=$1", [id])).rows[0]
        ?.billing_state
    ).toBe("active");
    expect(
      (
        await pool.query("SELECT id FROM operational_email_deliveries WHERE organization_id=$1", [
          id
        ])
      ).rowCount
    ).toBe(0);
    expect(await run(id, event, async () => id)).toBe(id);
  });
});
