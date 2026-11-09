import { createPostgresBillingCheckoutStore } from "../../packages/storage/src/billing-checkout-store.js";
import { processNextReferralReceiptJob } from "../../apps/worker/src/referral-receipt-processor.js";
import { createReferralReconciliationStore } from "../../packages/storage/src/referral-reconciliation-store.js";
import type { StripeBillingProvider } from "../../packages/billing/src/stripe-subscription.js";
import type { ReferralReceiptSnapshot } from "../../packages/referrals/src/referral-ledger-contracts.js";
import { vi } from "vitest";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { createReferralStore } from "../../packages/storage/src/referral-store.js";
import { createReferralBenefitStore } from "../../packages/storage/src/referral-benefit-store.js";
import { REFERRAL_TERMS_VERSION } from "../../packages/referrals/src/referral-contracts.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
runIntegration("reserved first eligible referral invoice", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    benefits = createReferralBenefitStore(db);
  let org: string, owner: string, attribution: string, attempt: string;
  beforeEach(async () => {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
    org = randomUUID();
    owner = randomUUID();
    attempt = randomUUID();
    const partner = randomUUID();
    for (const user of [owner, partner])
      await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
        user,
        `${user}@example.test`
      ]);
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan,stripe_customer_id) VALUES($1::uuid,'Prospect',$1::text,'free','cus_one')",
      [org]
    );
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'owner')",
      [randomUUID(), org, owner]
    );
    const refs = createReferralStore(db, {
      identityHashSecret: "dedicated-referral-benefit-test-secret-thirty-two"
    });
    const joined = await refs.joinProgram({
      user_id: partner,
      terms_version: REFERRAL_TERMS_VERSION
    });
    attribution = (
      await refs.saveAttribution({
        organization_id: org,
        actor_user_id: owner,
        code: joined.code,
        source: "manual",
        explicit_correction: false,
        provider_customer_id_checked: "cus_one",
        provider_previously_paid: false
      })
    ).referral_id;
  });
  afterAll(async () => {
    await pool.end();
  });
  const reserve = () =>
    benefits.reserveCheckout({
      organization_id: org,
      attribution_id: attribution,
      checkout_attempt_id: attempt,
      coupon_id: "coupon_referral",
      actor_user_id: owner
    });
  it("rejects an introductory benefit in another workspace even before the first invoice is paid", async () => {
    await reserve();
    const second = randomUUID();
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan) VALUES($1::uuid,'Second',$1::text,'free')",
      [second]
    );
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'owner')",
      [randomUUID(), second, owner]
    );
    const code = (
      await pool.query(
        "SELECT p.code FROM referral_partners p JOIN referral_attributions a ON a.partner_id=p.id WHERE a.id=$1",
        [attribution]
      )
    ).rows[0].code as string;
    await expect(
      createReferralStore(db, {
        identityHashSecret: "dedicated-referral-benefit-test-secret-thirty-two"
      }).saveAttribution({
        organization_id: second,
        actor_user_id: owner,
        code,
        source: "manual",
        explicit_correction: false,
        provider_customer_id_checked: null,
        provider_previously_paid: false
      })
    ).rejects.toMatchObject({ code: "ineligible_customer" });
  });
  it("rechecks durable paid identity history when a previously saved attribution starts checkout", async () => {
    const hash = (
      await pool.query("SELECT owner_identity_hash FROM referral_attributions WHERE id=$1", [
        attribution
      ])
    ).rows[0].owner_identity_hash as string;
    await pool.query(
      "INSERT INTO billing_customer_history(organization_external_id,owner_identity_hash,first_cash_at,provider_invoice_id,provider_payment_id) VALUES($1,$2,now(),'in_paid_elsewhere','pay_elsewhere')",
      [randomUUID(), hash]
    );
    expect(
      await benefits.checkoutContext({ organization_id: org, actor_user_id: owner })
    ).toMatchObject({ discount_eligible: false });
    expect(await reserve()).toBeNull();
  });
  const observe = (invoice_id = "in_first", amount_due_minor = 5310) =>
    benefits.observeInvoice({
      organization_external_id: org,
      provider_customer_id: "cus_one",
      provider_subscription_id: "sub_one",
      invoice: {
        invoice_id,
        finalized: true,
        trial: false,
        amount_due_minor,
        business_base_net_minor: amount_due_minor,
        expected_discount_applied: true
      }
    });
  async function receiptFixture(zero = false) {
    await reserve();
    const hash = String(
      (
        await pool.query("SELECT owner_identity_hash FROM referral_attributions WHERE id=$1", [
          attribution
        ])
      ).rows[0].owner_identity_hash
    );
    const snapshot: ReferralReceiptSnapshot = {
      organization_external_id: org,
      owner_identity_hash: hash,
      provider_customer_id: "cus_one",
      observed_at: new Date().toISOString(),
      invoices: [],
      benefit_invoices: [
        {
          invoice_id: zero ? "in_zero" : "in_first",
          subscription_id: "sub_one",
          attribution_id: attribution,
          finalized: true,
          created_at: "2026-11-01T00:00:00.000Z",
          finalized_at: "2026-11-01T00:00:01.000Z",
          amount_due_minor: zero ? 0 : 5310,
          business_base_net_minor: zero ? 0 : 5310,
          applied_coupon_ids: ["coupon_referral"],
          ten_percent_base_coupon_ids: zero ? [] : ["coupon_referral"]
        }
      ]
    };
    if (zero)
      snapshot.benefit_invoices!.push({
        ...snapshot.benefit_invoices![0]!,
        invoice_id: "in_draft",
        finalized: false,
        created_at: "2026-12-01T00:00:00.000Z",
        finalized_at: null,
        amount_due_minor: 5900,
        business_base_net_minor: 5900,
        applied_coupon_ids: [],
        ten_percent_base_coupon_ids: []
      });
    const store = createReferralReconciliationStore(db, {
      identityHashSecret: "dedicated-referral-benefit-test-secret-thirty-two"
    });
    await store.capture({
      event_id: "evt_benefit",
      event_type: "invoice.finalized",
      resource_type: "invoice",
      resource_id: snapshot.benefit_invoices![0]!.invoice_id,
      provider_customer_id: "cus_one",
      livemode: false,
      provider_created_at: "2026-11-01T00:00:02.000Z"
    });
    const provider = {} as StripeBillingProvider;
    return { snapshot, store, provider };
  }
  it("consumes the eligible failed invoice through the actual durable receipt worker without collected cash", async () => {
    const f = await receiptFixture();
    await processNextReferralReceiptJob({
      db,
      store: f.store,
      provider: f.provider,
      readCustomer: async () => "cus_one",
      readSnapshot: async () => f.snapshot
    });
    expect(
      (await benefits.checkoutContext({ organization_id: org, actor_user_id: owner }))
        ?.eligible_invoice_id
    ).toBe("in_first");
    expect((await pool.query("SELECT * FROM referral_commission_ledger")).rows).toHaveLength(0);
    expect(await f.store.get("evt_benefit")).toMatchObject({ status: "completed" });
  });
  it("persists the next eligible draft recovery after a zero invoice before external I/O and reuses it after an uncertain response", async () => {
    const f = await receiptFixture(true);
    const restore = vi
      .fn()
      .mockImplementationOnce(async () => {
        expect(
          (
            await pool.query(
              "SELECT recovery_invoice_id FROM referral_invoice_benefits FOR UPDATE NOWAIT"
            )
          ).rows[0].recovery_invoice_id
        ).toBe("in_draft");
        throw new Error("provider_ack_lost");
      })
      .mockResolvedValue("already_applied");
    const input = {
      db,
      store: f.store,
      provider: f.provider,
      readCustomer: async () => "cus_one",
      readSnapshot: async () => f.snapshot,
      restoreBenefit: restore
    };
    await expect(processNextReferralReceiptJob(input)).rejects.toThrow(
      "referral_reconciliation_unavailable"
    );
    const pending = (
      await pool.query(
        "SELECT recovery_invoice_id,recovery_requested_at,recovery_completed_at,eligible_invoice_id FROM referral_invoice_benefits"
      )
    ).rows[0];
    expect(pending).toMatchObject({
      recovery_invoice_id: "in_draft",
      recovery_completed_at: null,
      eligible_invoice_id: null
    });
    await pool.query(
      "UPDATE worker_jobs SET available_at=now()-interval '1 second' WHERE job_name='reconcile-referral-receipts'"
    );
    await processNextReferralReceiptJob(input);
    expect(restore).toHaveBeenCalledTimes(2);
    expect(restore.mock.calls[0]?.[1]).toEqual(restore.mock.calls[1]?.[1]);
    expect(
      (
        await pool.query(
          "SELECT recovery_requested_at,recovery_completed_at,eligible_invoice_id FROM referral_invoice_benefits"
        )
      ).rows[0]
    ).toMatchObject({
      recovery_requested_at: pending.recovery_requested_at,
      recovery_completed_at: expect.any(Date),
      eligible_invoice_id: null
    });
    expect(await f.store.get("evt_benefit")).toMatchObject({ status: "completed" });
  });
  it("does not consume or restore a coupon on a zero/trial invoice alone", async () => {
    const f = await receiptFixture(true);
    f.snapshot.benefit_invoices!.pop();
    const restore = vi.fn();
    await processNextReferralReceiptJob({
      db,
      store: f.store,
      provider: f.provider,
      readCustomer: async () => "cus_one",
      readSnapshot: async () => f.snapshot,
      restoreBenefit: restore
    });
    expect(restore).not.toHaveBeenCalled();
    expect(
      (
        await pool.query(
          "SELECT recovery_invoice_id,eligible_invoice_id FROM referral_invoice_benefits"
        )
      ).rows[0]
    ).toMatchObject({ recovery_invoice_id: null, eligible_invoice_id: null });
  });
  it("holds a positive first invoice without its verified discount instead of consuming a different offer", async () => {
    const f = await receiptFixture();
    f.snapshot.benefit_invoices![0]!.ten_percent_base_coupon_ids = [];
    await expect(
      processNextReferralReceiptJob({
        db,
        store: f.store,
        provider: f.provider,
        readCustomer: async () => "cus_one",
        readSnapshot: async () => f.snapshot
      })
    ).rejects.toThrow("referral_reconciliation_unavailable");
    expect(
      (await benefits.checkoutContext({ organization_id: org, actor_user_id: owner }))
        ?.eligible_invoice_id
    ).toBeNull();
    expect(await f.store.get("evt_benefit")).toMatchObject({ status: "pending" });
  });
  it("freezes one checkout and attribution atomically and reuses the same reservation", async () => {
    const first = await reserve();
    expect(first).toMatchObject({ coupon_id: "coupon_referral", attribution_id: attribution });
    expect(await reserve()).toEqual(first);
    expect(
      (
        await pool.query(
          "SELECT reserved_checkout_attempt_id FROM referral_attributions WHERE id=$1",
          [attribution]
        )
      ).rows[0]?.reserved_checkout_attempt_id
    ).toBe(attempt);
  });
  it("consumes only the first eligible invoice and preserves its discount on retries", async () => {
    await reserve();
    expect(await observe()).toMatchObject({ action: "reserve_invoice", invoice_id: "in_first" });
    expect(await observe()).toMatchObject({ action: "same_invoice", invoice_id: "in_first" });
    expect(await observe("in_next")).toMatchObject({
      action: "already_reserved",
      invoice_id: "in_first"
    });
    expect(
      await benefits.checkoutContext({ organization_id: org, actor_user_id: owner })
    ).toMatchObject({ eligible_invoice_id: "in_first" });
  });
  it("keeps a zero invoice pending without consuming the base benefit", async () => {
    await reserve();
    expect(await observe("in_zero", 0)).toEqual({ action: "keep_pending" });
    expect(
      await benefits.checkoutContext({ organization_id: org, actor_user_id: owner })
    ).toMatchObject({ eligible_invoice_id: null });
  });
  it("retains the identity-level used marker through account deletion", async () => {
    await reserve();
    await observe();
    await pool.query("DELETE FROM organizations WHERE id=$1", [org]);
    const rows = (
      await pool.query(
        "SELECT eligible_invoice_id FROM referral_invoice_benefits WHERE attribution_id=$1",
        [attribution]
      )
    ).rows;
    expect(rows).toEqual([{ eligible_invoice_id: "in_first" }]);
  });
  it("fails closed for owner loss, changed attribution or foreign provider customer", async () => {
    await expect(
      benefits.reserveCheckout({
        organization_id: org,
        attribution_id: randomUUID(),
        checkout_attempt_id: attempt,
        coupon_id: "coupon_referral",
        actor_user_id: owner
      })
    ).rejects.toThrow("referral_benefit_context_changed");
    await reserve();
    await expect(
      benefits.observeInvoice({
        organization_external_id: org,
        provider_customer_id: "cus_foreign",
        provider_subscription_id: "sub_one",
        invoice: {
          invoice_id: "in_foreign",
          finalized: true,
          trial: false,
          amount_due_minor: 5310,
          business_base_net_minor: 5310,
          expected_discount_applied: true
        }
      })
    ).rejects.toThrow("referral_benefit_customer_mismatch");
    await pool.query(
      "UPDATE organization_members SET role='member' WHERE organization_id=$1 AND user_id=$2",
      [org, owner]
    );
    await expect(reserve()).rejects.toThrow("referral_benefit_forbidden");
  });
  it("commits the exact coupon request, attribution and checkout marker together", async () => {
    await pool.query(
      "UPDATE organizations SET trial_plan='solo',trial_started_at=now()-interval '8 days' WHERE id=$1",
      [org]
    );
    const checkout = createPostgresBillingCheckoutStore(db),
      request = {
        organization_id: org,
        target_plan: "business" as const,
        expected_owner_user_id: owner,
        parameters: (
          _customer: string | null,
          _expires: number,
          referral?: { coupon_id: string }
        ) => ({
          mode: "subscription",
          allow_promotion_codes: !referral,
          ...(referral ? { discounts: [{ coupon: referral.coupon_id }] } : {})
        })
      };
    expect(await checkout.claim(request)).toBe("referral_coupon_required");
    expect((await pool.query("SELECT * FROM referral_invoice_benefits")).rows).toHaveLength(0);
    const accepted = await checkout.claim({
      ...request,
      referral_coupon: {
        attribution_id: attribution,
        coupon_id: "coupon_referral",
        provider_customer_id_checked: "cus_one",
        verified_owner_email_checked: `${owner}@example.test`
      }
    });
    if (typeof accepted === "string") throw new Error(accepted);
    expect(accepted.parameters).toMatchObject({
      allow_promotion_codes: false,
      discounts: [{ coupon: "coupon_referral" }]
    });
    expect(
      (await benefits.checkoutContext({ organization_id: org, actor_user_id: owner }))
        ?.checkout_attempt_id
    ).toBe(accepted.id);
    expect(await checkout.claim(request)).toEqual(accepted);
  });
  it("refuses a callback that omits the promised discount without freezing an orphan reservation", async () => {
    await pool.query(
      "UPDATE organizations SET trial_plan='solo',trial_started_at=now()-interval '8 days' WHERE id=$1",
      [org]
    );
    const checkout = createPostgresBillingCheckoutStore(db);
    expect(
      await checkout.claim({
        organization_id: org,
        target_plan: "business",
        expected_owner_user_id: owner,
        referral_coupon: {
          attribution_id: attribution,
          coupon_id: "coupon_referral",
          provider_customer_id_checked: "cus_one",
          verified_owner_email_checked: `${owner}@example.test`
        },
        parameters: () => ({ allow_promotion_codes: true })
      })
    ).toBe("checkout_not_allowed");
    expect((await pool.query("SELECT * FROM referral_invoice_benefits")).rows).toHaveLength(0);
    expect((await pool.query("SELECT * FROM billing_checkout_attempts")).rows).toHaveLength(0);
    expect(
      (
        await pool.query(
          "SELECT reserved_checkout_attempt_id FROM referral_attributions WHERE id=$1",
          [attribution]
        )
      ).rows[0]?.reserved_checkout_attempt_id
    ).toBeNull();
  });
  it("releases an unconsumed benefit atomically when a verified expired checkout is retired", async () => {
    await pool.query(
      "UPDATE organizations SET trial_plan='solo',trial_started_at=now()-interval '8 days' WHERE id=$1",
      [org]
    );
    const checkout = createPostgresBillingCheckoutStore(db),
      request = {
        organization_id: org,
        target_plan: "business" as const,
        expected_owner_user_id: owner,
        referral_coupon: {
          attribution_id: attribution,
          coupon_id: "coupon_referral",
          provider_customer_id_checked: "cus_one",
          verified_owner_email_checked: `${owner}@example.test`
        },
        parameters: () => ({
          allow_promotion_codes: false,
          discounts: [{ coupon: "coupon_referral" }]
        })
      };
    const first = await checkout.claim(request);
    if (typeof first === "string") throw new Error(first);
    await checkout.saveSession(org, first.id, "cs_expired");
    expect(await checkout.retireExpired(org, first.id, "cs_expired")).toBe(true);
    expect(
      (await benefits.checkoutContext({ organization_id: org, actor_user_id: owner }))
        ?.checkout_attempt_id
    ).toBeNull();
    const replacement = await checkout.claim(request);
    if (typeof replacement === "string") throw new Error(replacement);
    expect(replacement.id).not.toBe(first.id);
    expect(
      (await benefits.checkoutContext({ organization_id: org, actor_user_id: owner }))
        ?.checkout_attempt_id
    ).toBe(replacement.id);
  });
});
