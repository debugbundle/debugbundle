import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createBillingManagement } from "../../apps/api/src/billing-management.js";
import type { StripeConfig } from "../../apps/api/src/stripe-config.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import { createPostgresBillingCheckoutStore } from "../../packages/storage/src/billing-checkout-store.js";
import { createPostgresBillingSyncStore } from "../../packages/storage/src/billing-sync-store.js";
import { createPostgresBillingSubscriptionOperationStore } from "../../packages/storage/src/billing-subscription-operation-store.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";

runIntegration("billing checkout coordination on PostgreSQL", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  beforeAll(async () => {
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
  });
  afterAll(async () => {
    await pool.end();
  });
  async function org() {
    const id = randomUUID();
    await pool.query("INSERT INTO organizations (id,name,slug) VALUES ($1,'Test checkout',$2)", [
      id,
      id
    ]);
    // Existing coordination cases represent an eligible first purchase.
    await pool.query(
      "UPDATE organizations SET trial_plan='solo',trial_started_at=now()-interval '8 days' WHERE id=$1",
      [id]
    );
    return id;
  }
  const parameters = (customer: string | null, expiresAt: number) => ({
    customer,
    expires_at: expiresAt,
    mode: "subscription"
  });
  it("locks direct and early trial purchases without losing an ambiguous reservation", async () => {
    const id = await org();
    const store = createPostgresBillingCheckoutStore(db);
    const request = { organization_id: id, target_plan: "solo" as const, parameters };
    const attempt = await store.claim(request);
    expect(typeof attempt).not.toBe("string");
    for (const trialStart of [
      null,
      new Date().toISOString(),
      new Date(Date.now() + 86400000).toISOString()
    ]) {
      await pool.query("UPDATE organizations SET trial_started_at=$2 WHERE id=$1", [
        id,
        trialStart
      ]);
      expect(await store.claim(request)).toBe("paid_purchase_locked");
      expect(await store.claim({ ...request, target_plan: "team" })).toBe("paid_purchase_locked");
      expect(
        (
          await pool.query("SELECT id FROM billing_checkout_attempts WHERE organization_id=$1", [
            id
          ])
        ).rows
      ).toEqual([{ id: typeof attempt === "string" ? "invalid" : attempt.id }]);
    }
    await pool.query(
      "UPDATE organizations SET trial_started_at=now()-interval '7 days' WHERE id=$1",
      [id]
    );
    expect(await store.claim(request)).toEqual(attempt);
    const directId = await org();
    await pool.query("UPDATE organizations SET trial_started_at=NULL WHERE id=$1", [directId]);
    const direct = { ...request, organization_id: directId };
    expect(await Promise.all(Array.from({ length: 12 }, () => store.claim(direct)))).toEqual(
      Array(12).fill("paid_purchase_locked")
    );
    expect(
      (
        await pool.query("SELECT id FROM billing_checkout_attempts WHERE organization_id=$1", [
          directId
        ])
      ).rows
    ).toEqual([]);
  });

  it("uses a durable paid invoice receipt rather than a customer or an unpaid subscription as paid history", async () => {
    const id = await org();
    const store = createPostgresBillingCheckoutStore(db);
    const request = { organization_id: id, target_plan: "solo" as const, parameters };
    await pool.query(
      "UPDATE organizations SET trial_started_at=NULL, stripe_customer_id='cus_unpaid',stripe_subscription_id='sub_unpaid',billing_state='canceled' WHERE id=$1",
      [id]
    );
    expect(await store.claim({ ...request, confirmed_ended_subscription_id: "sub_unpaid" })).toBe(
      "paid_purchase_locked"
    );
    const otherId = await org();
    await pool.query(
      "INSERT INTO processed_billing_events(event_id,event_type,organization_id,processed_at) VALUES($1,'invoice.paid',$2,now())",
      [`evt_paid_${otherId}`, otherId]
    );
    expect(await store.claim({ ...request, confirmed_ended_subscription_id: "sub_unpaid" })).toBe(
      "paid_purchase_locked"
    );
    await pool.query(
      "INSERT INTO processed_billing_events(event_id,event_type,organization_id,processed_at) VALUES($1,'invoice.paid',$2,now())",
      [`evt_paid_${id}`, id]
    );
    expect(
      typeof (await store.claim({ ...request, confirmed_ended_subscription_id: "sub_unpaid" }))
    ).not.toBe("string");
  });
  it("serializes concurrent processes into one durable attempt and isolates organisations", async () => {
    const id = await org();
    const input = { organization_id: id, target_plan: "solo" as const, parameters };
    const stores = [createPostgresBillingCheckoutStore(db), createPostgresBillingCheckoutStore(db)];
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => stores[i % 2]!.claim(input))
    );
    const first = results[0];
    if (typeof first === "string" || !first) throw new Error("missing attempt");
    expect(results.every((x) => typeof x !== "string" && x?.id === first.id)).toBe(true);
    const other = await stores[0]!.claim({ ...input, organization_id: await org() });
    expect(other).not.toEqual(first);
    expect(await stores[0]!.claim({ ...input, target_plan: "team" })).toBe("checkout_in_progress");
    expect(await stores[0]!.saveSession(id, first.id, "cs_test_current")).toBe(true);
    expect(await stores[0]!.retireExpired(id, first.id, "cs_test_other")).toBe(false);
    expect(await stores[0]!.retireExpired(id, first.id, "cs_test_current")).toBe(true);
    const replacement = await stores[1]!.claim(input);
    expect(replacement).not.toEqual(first);
    expect(await stores[0]!.saveSession(id, first.id, "cs_test_stale")).toBe(false);
  });
  it("rechecks suspension and active subscription inside the locked claim", async () => {
    const id = await org();
    const store = createPostgresBillingCheckoutStore(db);
    expect(
      await store.claim({ organization_id: randomUUID(), target_plan: "solo", parameters })
    ).toBe("checkout_not_allowed");
    await pool.query("UPDATE organizations SET suspended_at=now() WHERE id=$1", [id]);
    expect(await store.claim({ organization_id: id, target_plan: "solo", parameters })).toBe(
      "checkout_not_allowed"
    );
    await pool.query(
      "UPDATE organizations SET suspended_at=NULL,stripe_subscription_id='sub_existing',billing_state='active' WHERE id=$1",
      [id]
    );
    expect(await store.claim({ organization_id: id, target_plan: "team", parameters })).toBe(
      "checkout_not_allowed"
    );
  });
  it("preserves the normal resubscription path after a subscription ends", async () => {
    const id = await org();
    const store = createPostgresBillingCheckoutStore(db);
    const first = await store.claim({ organization_id: id, target_plan: "solo", parameters });
    if (typeof first === "string") throw new Error("Missing original checkout");
    await store.saveSession(id, first.id, "cs_original_complete");
    await pool.query(
      "UPDATE organizations SET stripe_subscription_id='sub_ended',billing_state='active',plan='solo' WHERE id=$1",
      [id]
    );
    await createPostgresBillingSyncStore(db).revokeEntitlements(id, "evt_ended");
    expect(await store.claim({ organization_id: id, target_plan: "solo", parameters })).toBe(
      "checkout_not_allowed"
    );
    expect(await store.retireEndedSubscription(id, first.id, "cs_wrong", "sub_ended")).toBe(false);
    expect(
      await store.retireEndedSubscription(id, first.id, "cs_original_complete", "sub_ended")
    ).toBe(true);
    const next = await store.claim({
      organization_id: id,
      target_plan: "solo",
      parameters,
      confirmed_ended_subscription_id: "sub_ended"
    });
    expect(typeof next).not.toBe("string");
    expect(next).not.toEqual(first);
  });
  async function paidOrg() {
    const id = await org();
    await pool.query(
      "UPDATE organizations SET plan='solo',billing_state='active',stripe_customer_id=$3,stripe_subscription_id=$2 WHERE id=$1",
      [id, `sub_${id}`, `cus_${id}`]
    );
    return id;
  }
  it("fences cancellation from an old subscription after a replacement has been linked", async () => {
    const id = await paidOrg();
    const store = createPostgresBillingSubscriptionOperationStore(db);
    await store.claim({ organization_id: id, kind: "upgrade", intent: { target_plan: "team" } });
    await pool.query(
      "UPDATE organizations SET stripe_subscription_id='sub_replacement' WHERE id=$1",
      [id]
    );
    const sync = createPostgresBillingSyncStore(db);
    await sync.linkStripeCustomer(id, `cus_${id}`, "sub_obsolete");
    expect(
      await sync.updateEntitlements({
        organization_id: id,
        plan: "team",
        additional_capacity_units: 99,
        billing_state: "active",
        stripe_customer_id: `cus_${id}`,
        stripe_subscription_id: `sub_${id}`,
        billing_period_starts_at: null,
        billing_period_ends_at: null,
        last_billing_sync_at: new Date().toISOString(),
        last_billing_event_id: "evt_old_update"
      })
    ).toBe(false);
    expect(await sync.revokeEntitlements(id, "evt_old_deleted", `sub_${id}`)).toBe(false);
    expect(
      (await pool.query("SELECT plan,stripe_subscription_id FROM organizations WHERE id=$1", [id]))
        .rows[0]
    ).toEqual({ plan: "solo", stripe_subscription_id: "sub_replacement" });
    expect(
      (
        await pool.query(
          "SELECT id FROM billing_subscription_operations WHERE organization_id=$1",
          [id]
        )
      ).rows
    ).toHaveLength(1);
  });
  it.each(["paused", "canceled"])(
    "requires provider-terminal proof before resubscription when the cached state is canceled (%s)",
    async (status) => {
      const id = await paidOrg();
      await pool.query(
        "UPDATE organizations SET plan='free',billing_state='canceled' WHERE id=$1",
        [id]
      );
      const create = vi.fn(async () => ({
        id: `cs_${id}`,
        client_reference_id: id,
        status: "open",
        url: "https://checkout.stripe.com/c/synthetic"
      }));
      const stripeConfig = {
        client: {
          subscriptions: { retrieve: vi.fn(async () => ({ id: `sub_${id}`, status })) },
          checkout: { sessions: { create } }
        },
        soloPriceId: "price_solo",
        teamPriceId: "price_team"
      } as unknown as StripeConfig;
      const service = createBillingManagement({
        db,
        stripeConfig,
        billingStore: {} as never,
        billingSyncStore: {} as never,
        billingLinks: { createCheckoutUrl: () => null, createPortalUrl: () => null }
      }).billingManagement;
      const result = await service.createCheckoutLink({
        organization_id: id,
        billing_email: "owner@example.test",
        current_plan: "free",
        target_plan: "solo"
      });
      if (status === "paused") {
        expect(result).toBe("checkout_not_allowed");
        expect(create).not.toHaveBeenCalled();
      } else {
        expect(result).toEqual({ url: "https://checkout.stripe.com/c/synthetic" });
        expect(create).toHaveBeenCalledTimes(1);
      }
    }
  );
  it("does not erase a new ambiguous checkout when a terminal subscription event is delivered again", async () => {
    const id = await paidOrg();
    const sync = createPostgresBillingSyncStore(db);
    await sync.revokeEntitlements(id, "evt_terminal_first", `sub_${id}`);
    const store = createPostgresBillingCheckoutStore(db);
    const request = {
      organization_id: id,
      target_plan: "solo" as const,
      parameters,
      confirmed_ended_subscription_id: `sub_${id}`
    };
    const attempt = await store.claim(request);
    await sync.revokeEntitlements(id, "evt_terminal_late", `sub_${id}`);
    expect(await store.claim(request)).toEqual(attempt);
  });
  it("reserves one durable subscription mutation across workers and fences competing capacity changes", async () => {
    const id = await paidOrg();
    const stores = [
      createPostgresBillingSubscriptionOperationStore(db),
      createPostgresBillingSubscriptionOperationStore(db)
    ];
    const request = {
      organization_id: id,
      kind: "upgrade" as const,
      intent: { target_plan: "team" }
    };
    const attempts = await Promise.all(
      Array.from({ length: 12 }, (_, i) => stores[i % 2]!.claim(request))
    );
    const first = attempts[0];
    if (!first || typeof first === "string") throw new Error("Missing upgrade reservation");
    expect(attempts.every((x) => typeof x !== "string" && x.id === first.id)).toBe(true);
    expect(
      await stores[0]!.claim({
        organization_id: id,
        kind: "capacity_increase",
        intent: { target: 8 }
      })
    ).toBe("billing_change_in_progress");
    const prepared = await stores[0]!.prepare(id, first.id, {
      items: [{ id: "si_existing", quantity: 7 }]
    });
    expect((await stores[1]!.prepare(id, first.id, { items: [] }))?.parameters).toEqual(
      prepared?.parameters
    );
    expect(await stores[0]!.saveResource(id, first.id, "in_test_upgrade")).toBe(true);
    expect(await stores[0]!.saveResource(id, first.id, "in_other")).toBe(false);
    expect(await stores[0]!.abandonUnprepared(id, first.id)).toBe(false);
    expect(await stores[0]!.complete(id, first.id)).toBe(true);
    const next = await stores[1]!.claim({
      organization_id: id,
      kind: "capacity_increase",
      intent: { target: 8 }
    });
    expect(typeof next).not.toBe("string");
    expect(next).not.toEqual(first);
    expect(await stores[0]!.saveResource(id, first.id, "in_stale")).toBe(false);
    expect(await stores[0]!.complete(id, first.id)).toBe(false);
    expect(await stores[0]!.prepare(id, first.id, {})).toBeNull();
    expect(await stores[0]!.retireVoidedPayment(id, first.id, "in_test_upgrade")).toBe(false);
  });
  it("allows the same intent again only after its previous operation completed", async () => {
    const id = await paidOrg();
    const store = createPostgresBillingSubscriptionOperationStore(db);
    const request = {
      organization_id: id,
      kind: "upgrade" as const,
      intent: { target_plan: "team" }
    };
    const first = await store.claim(request);
    if (typeof first === "string") throw new Error("missing reservation");
    expect(await store.get(id)).toMatchObject({ id: first.id });
    await store.complete(id, first.id);
    const next = await store.claim(request);
    expect(typeof next).not.toBe("string");
    expect(next).not.toMatchObject({ id: first.id });
  });
  it("expands plan-change kinds without changing an existing pending reservation", async () => {
    const id = await paidOrg();
    const store = createPostgresBillingSubscriptionOperationStore(db);
    const original = await store.claim({
      organization_id: id,
      kind: "capacity_schedule",
      intent: { target: 2 }
    });
    if (typeof original === "string") throw new Error(original);
    await pool.query(
      "ALTER TABLE billing_subscription_operations DROP CONSTRAINT billing_subscription_operations_kind_check"
    );
    await pool.query(
      "ALTER TABLE billing_subscription_operations ADD CONSTRAINT billing_subscription_operations_kind_check CHECK (kind IN ('upgrade','capacity_increase','capacity_schedule','capacity_cancel'))"
    );
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202610220004_add_billing_plan_change_operations'"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "202610220004_add_billing_plan_change_operations"
    );
    expect((await migrateStorageSchema(db)).applied).toContain(
      "202610220004_add_billing_plan_change_operations"
    );
    expect(await store.get(id)).toMatchObject({ id: original.id, kind: "capacity_schedule" });
    await store.complete(id, original.id);
    for (const kind of ["plan_schedule", "plan_cancel"] as const) {
      const op = await store.claim({ organization_id: id, kind, intent: { target_plan: "solo" } });
      if (typeof op === "string") throw new Error(op);
      expect(op.kind).toBe(kind);
      await store.complete(id, op.id);
    }
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect((await migrateStorageSchema(db)).applied).toEqual([]);
  });
  it("fails readiness until billing notification migration is recorded", async () => {
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202610220003_add_billing_lifecycle_notifications'"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "202610220003_add_billing_lifecycle_notifications"
    );
    expect((await migrateStorageSchema(db)).applied).toContain(
      "202610220003_add_billing_lifecycle_notifications"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
  });
  it("blocks paid plan changes during a capacity mutation and rechecks account eligibility", async () => {
    const id = await paidOrg();
    const store = createPostgresBillingSubscriptionOperationStore(db);
    const request = {
      organization_id: id,
      kind: "capacity_schedule" as const,
      intent: { target: 2 }
    };
    const first = await store.claim(request);
    if (typeof first === "string") throw new Error("Missing capacity reservation");
    expect(
      await store.claim({ organization_id: id, kind: "upgrade", intent: { target_plan: "team" } })
    ).toBe("billing_change_in_progress");
    expect(await store.abandonUnprepared(id, first.id)).toBe(true);
    const upgrade = await store.claim({
      organization_id: id,
      kind: "upgrade",
      intent: { target_plan: "team" }
    });
    if (typeof upgrade === "string") throw new Error("Missing upgrade reservation");
    await pool.query("UPDATE organizations SET suspended_at=now() WHERE id=$1", [id]);
    expect(
      await store.claim({ organization_id: id, kind: "upgrade", intent: { target_plan: "team" } })
    ).toBe("no_active_subscription");
    expect(await store.prepare(id, upgrade.id, {})).toBeNull();
    expect(await store.claim({ ...request, organization_id: randomUUID() })).toBe(
      "no_active_subscription"
    );
  });
  it("retains old ambiguous subscription mutations regardless of age and retires only a matched void invoice", async () => {
    const id = await paidOrg();
    const store = createPostgresBillingSubscriptionOperationStore(db);
    const request = {
      organization_id: id,
      kind: "upgrade" as const,
      intent: { target_plan: "team" }
    };
    const first = await store.claim(request);
    if (typeof first === "string") throw new Error("Missing upgrade reservation");
    await pool.query(
      "UPDATE billing_subscription_operations SET created_at=now()-interval '7 days' WHERE organization_id=$1",
      [id]
    );
    expect(await store.claim(request)).toMatchObject({ id: first.id });
    expect(await store.retireVoidedPayment(id, first.id, "in_wrong")).toBe(false);
    await store.saveResource(id, first.id, "in_void");
    expect(await store.retireVoidedPayment(id, first.id, "in_void")).toBe(true);
    expect(await store.get(id)).toMatchObject({ id: first.id, completed_at: expect.any(String) });
    expect(await store.claim(request)).not.toMatchObject({ id: first.id });
  });
  it("atomically fences confirmations after intervening or abandoned operations", async () => {
    const id = await paidOrg();
    const stores = [
      createPostgresBillingSubscriptionOperationStore(db),
      createPostgresBillingSubscriptionOperationStore(db)
    ];
    const request = {
      organization_id: id,
      kind: "plan_schedule" as const,
      intent: { quote_hash: "first" },
      expected_operation_id: null
    };
    const first = await stores[0]!.claim(request);
    if (typeof first === "string") throw new Error(first);
    expect(await stores[1]!.claim(request)).toMatchObject({ id: first.id });
    expect(await stores[0]!.abandonUnprepared(id, first.id)).toBe(true);
    expect(await stores[0]!.get(id)).toMatchObject({
      id: first.id,
      completed_at: expect.any(String)
    });
    expect(await stores[1]!.claim(request)).toBe("billing_change_in_progress");
    const races = await Promise.all(
      stores.map((store, index) =>
        store.claim({
          ...request,
          expected_operation_id: first.id,
          intent: { quote_hash: `new-${index}` }
        })
      )
    );
    expect(races.filter((value) => typeof value === "string")).toEqual([
      "billing_change_in_progress"
    ]);
    const winner = races.find((value) => typeof value !== "string")!;
    if (typeof winner === "string") throw new Error(winner);
    await stores[0]!.complete(id, winner.id);
    expect(await stores[1]!.claim({ ...request, expected_operation_id: first.id })).toBe(
      "billing_change_in_progress"
    );
    expect(
      await stores[1]!.claim({
        ...request,
        organization_id: await paidOrg(),
        expected_operation_id: first.id
      })
    ).toBe("billing_change_in_progress");
  });
  it("runs concurrent paid upgrade requests through the real API dependency and persistent store without a second subscription", async () => {
    const id = await paidOrg();
    const invoice = {
      id: `in_${id}`,
      customer: `cus_${id}`,
      status: "open",
      billing_reason: "subscription_update",
      parent: { subscription_details: { subscription: `sub_${id}` } },
      hosted_invoice_url: "https://invoice.stripe.com/i/synthetic"
    };
    const subscription = {
      id: `sub_${id}`,
      customer: `cus_${id}`,
      metadata: { organization_id: id },
      status: "active",
      collection_method: "charge_automatically",
      cancel_at_period_end: false,
      cancel_at: null,
      schedule: null,
      pending_update: null as unknown,
      items: {
        has_more: false,
        data: [
          { id: "si_base", price: { id: "price_solo" }, quantity: 1 },
          { id: "si_extra", price: { id: "price_solo_capacity" }, quantity: 7 }
        ]
      },
      latest_invoice: { id: "in_original", status: "paid" } as unknown
    };
    const requests = new Map<string, unknown>();
    const checkoutCreate = vi.fn();
    const update = vi.fn(
      async (_id: string, parameters: unknown, options: { idempotencyKey: string }) => {
        if (!requests.has(options.idempotencyKey)) requests.set(options.idempotencyKey, parameters);
        expect(parameters).toEqual(requests.get(options.idempotencyKey));
        subscription.pending_update = { expires_at: Math.floor(Date.now() / 1000) + 3600 };
        subscription.latest_invoice = invoice;
        return structuredClone(subscription);
      }
    );
    const stripeConfig = {
      client: {
        subscriptions: { retrieve: vi.fn(async () => structuredClone(subscription)), update },
        invoices: {
          retrieve: vi.fn(async () => structuredClone(invoice)),
          createPreview: vi.fn(async () => ({
            currency: "usd",
            amount_due: 700,
            total: 700,
            total_taxes: []
          }))
        },
        checkout: { sessions: { create: checkoutCreate } }
      },
      soloPriceId: "price_solo",
      teamPriceId: "price_team",
      webhookSecret: "synthetic_quote_secret",
      soloExtraCapacityPriceId: "price_solo_capacity",
      teamExtraCapacityPriceId: "price_team_capacity"
    } as unknown as StripeConfig;
    const service = () =>
      createBillingManagement({
        db,
        stripeConfig,
        billingStore: {} as never,
        billingSyncStore: {} as never,
        billingLinks: { createCheckoutUrl: () => null, createPortalUrl: () => null },
        appBaseUrl: "https://app.debugbundle.test"
      }).billingManagement;
    const preview = await service().previewUpgrade!({ organization_id: id });
    if (typeof preview === "string" || !("quote" in preview)) throw new Error("Missing preview");
    const request = {
      confirmation_token: preview.quote.confirmation_token,
      organization_id: id,
      billing_email: "owner@example.test",
      current_plan: "solo" as const,
      target_plan: "team" as const
    };
    const results = await Promise.all(
      Array.from({ length: 12 }, () => service().createCheckoutLink(request))
    );
    expect(
      results.every((x) => typeof x === "object" && x?.url === invoice.hosted_invoice_url)
    ).toBe(true);
    expect(requests.size).toBe(1);
    expect(checkoutCreate).not.toHaveBeenCalled();
    expect(
      (await pool.query("SELECT plan FROM organizations WHERE id=$1", [id])).rows[0]?.plan
    ).toBe("solo");
    expect(
      await createPostgresBillingSubscriptionOperationStore(db).claim({
        organization_id: id,
        kind: "capacity_increase",
        intent: { target: 8 }
      })
    ).toBe("billing_change_in_progress");
    subscription.items.data[0]!.price.id = "price_team";
    subscription.items.data[1]!.price.id = "price_team_capacity";
    subscription.pending_update = null;
    invoice.status = "paid";
    subscription.latest_invoice = invoice;
    expect(await service().createCheckoutLink(request)).toEqual({
      url: "https://app.debugbundle.test/billing?checkout=success"
    });
    expect(requests.size).toBe(1);
  });
  it("migrates the predecessor schema without losing account data and fails readiness while the migration is missing", async () => {
    const id = await org();
    await pool.query("DROP TABLE billing_checkout_attempts");
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202610220001_add_billing_checkout_attempts'"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "202610220001_add_billing_checkout_attempts"
    );
    const result = await migrateStorageSchema(db);
    expect(result.applied).toContain("202610220001_add_billing_checkout_attempts");
    expect((await pool.query("SELECT id FROM organizations WHERE id=$1", [id])).rows).toHaveLength(
      1
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect((await migrateStorageSchema(db)).applied).toEqual([]);
  });
  it("fails readiness without the subscription-operation migration and applies it before runtime", async () => {
    const id = await paidOrg();
    await pool.query("DROP TABLE billing_subscription_operations");
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id IN ('202610220002_add_billing_subscription_operations','202610220004_add_billing_plan_change_operations')"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "202610220002_add_billing_subscription_operations"
    );
    expect((await migrateStorageSchema(db)).applied).toContain(
      "202610220002_add_billing_subscription_operations"
    );
    expect(
      (await pool.query("SELECT plan FROM organizations WHERE id=$1", [id])).rows[0]?.plan
    ).toBe("solo");
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect((await migrateStorageSchema(db)).applied).toEqual([]);
  });
  it("upgrades an installed pre-ledger predecessor while preserving its paid account snapshot", async () => {
    const id = await org();
    await pool.query(
      "UPDATE organizations SET plan='solo',billing_state='active',stripe_subscription_id='sub_preserved' WHERE id=$1",
      [id]
    );
    await pool.query("DROP TABLE billing_checkout_attempts");
    await pool.query("DROP TABLE billing_subscription_operations");
    await pool.query("DROP TABLE storage_migration_ledger");
    await migrateStorageSchema(db);
    expect(
      (
        await pool.query(
          "SELECT plan,billing_state,stripe_subscription_id FROM organizations WHERE id=$1",
          [id]
        )
      ).rows
    ).toEqual([{ plan: "solo", billing_state: "active", stripe_subscription_id: "sub_preserved" }]);
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect((await migrateStorageSchema(db)).applied).toEqual([]);
  });
});
