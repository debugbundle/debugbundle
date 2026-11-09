import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { createReferralStore } from "../../packages/storage/src/referral-store.js";
import { createReferralReconciliationStore } from "../../packages/storage/src/referral-reconciliation-store.js";
import { createReferralLedgerStore } from "../../packages/storage/src/referral-ledger-store.js";
import { createReferralBenefitStore } from "../../packages/storage/src/referral-benefit-store.js";
import { processNextReferralReceiptJob } from "../../apps/worker/src/referral-receipt-processor.js";
import { REFERRAL_TERMS_VERSION } from "../../packages/referrals/src/referral-contracts.js";
import type { ReferralReceiptSnapshot } from "../../packages/referrals/src/referral-ledger-contracts.js";
import type { StripeBillingProvider } from "../../packages/billing/src/stripe-subscription.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
runIntegration("verified referral receipt scope and retained identities", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    secret = "referral-reconciliation-test-secret-at-least-thirty-two";
  const refs = createReferralStore(db, { identityHashSecret: secret }),
    events = createReferralReconciliationStore(db, { identityHashSecret: secret }),
    ledger = createReferralLedgerStore(db);
  let org: string, owner: string, partner: string, attribution: string, hash: string, code: string;
  async function account(): Promise<string> {
    const id = randomUUID();
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan) VALUES($1::uuid,'Prospect',$1::text,'free')",
      [id]
    );
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'owner')",
      [randomUUID(), id, owner]
    );
    return id;
  }
  beforeEach(async () => {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
    owner = randomUUID();
    partner = randomUUID();
    for (const id of [owner, partner])
      await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
        id,
        `${id}@example.test`
      ]);
    org = await account();
    const joined = await refs.joinProgram({
      user_id: partner,
      terms_version: REFERRAL_TERMS_VERSION
    });
    partner = joined.partner_id;
    code = joined.code;
    attribution = (
      await refs.saveAttribution({
        organization_id: org,
        actor_user_id: owner,
        code,
        source: "manual",
        explicit_correction: false,
        provider_customer_id_checked: null,
        provider_previously_paid: false
      })
    ).referral_id;
    hash = String(
      (
        await pool.query("SELECT owner_identity_hash FROM referral_attributions WHERE id=$1", [
          attribution
        ])
      ).rows[0].owner_identity_hash
    );
  });
  afterAll(async () => {
    await pool.end();
  });
  const snapshot = (organization = org): ReferralReceiptSnapshot => ({
    organization_external_id: organization,
    owner_identity_hash: hash,
    provider_customer_id: "cus_early",
    observed_at: new Date().toISOString(),
    invoices: [
      {
        invoice_id: "in_one",
        currency: "usd",
        lines: [
          {
            id: "il_base",
            kind: "plan",
            plan: "business",
            net_amount_minor: 5310,
            tax_amount_minor: 0,
            service_starts_at: "2026-11-01T00:00:00.000Z",
            service_ends_at: "2026-12-01T00:00:00.000Z"
          }
        ],
        payments: [
          {
            payment_id: "pay_one",
            cash_minor: 5310,
            collected_at: "2026-11-01T00:00:00.000Z",
            provider_available_at: "2026-11-03T00:00:00.000Z"
          }
        ],
        refunds: [],
        disputed: false
      }
    ]
  });
  async function capture() {
    await events.capture({
      event_id: "evt_early",
      event_type: "invoice.paid",
      resource_type: "invoice",
      resource_id: "in_one",
      provider_customer_id: "cus_early",
      livemode: false,
      provider_created_at: "2026-11-01T00:00:01.000Z"
    });
  }
  const resource = async () => ({
    provider_customer_id: "cus_early",
    organization_external_id: org,
    subscription_related: true
  });
  it.each([false, true])(
    "recovers verified subscription metadata before local customer linking; deleted=%s",
    async (deleted) => {
      if (deleted) await pool.query("DELETE FROM organizations WHERE id=$1", [org]);
      await capture();
      expect(await events.get("evt_early")).toMatchObject({
        organization_external_id: null,
        status: "pending"
      });
      await processNextReferralReceiptJob({
        db,
        store: events,
        provider: {} as StripeBillingProvider,
        readResourceContext: resource,
        readSnapshot: async () => snapshot()
      });
      expect(await events.get("evt_early")).toMatchObject({
        organization_external_id: org,
        owner_identity_hash: hash,
        status: "completed"
      });
      expect(await ledger.balance(partner, "2026-12-10T00:00:00.000Z")).toMatchObject({
        available_minor: 2655
      });
      if (!deleted)
        expect(
          (await pool.query("SELECT stripe_customer_id FROM organizations WHERE id=$1", [org]))
            .rows[0].stripe_customer_id
        ).toBeNull();
    }
  );
  it("refuses verified metadata that conflicts with a different cached customer", async () => {
    await pool.query("UPDATE organizations SET stripe_customer_id='cus_other' WHERE id=$1", [org]);
    await capture();
    const read = vi.fn();
    await expect(
      processNextReferralReceiptJob({
        db,
        store: events,
        provider: {} as StripeBillingProvider,
        readResourceContext: resource,
        readSnapshot: read
      })
    ).rejects.toThrow("referral_reconciliation_unavailable");
    expect(read).not.toHaveBeenCalled();
    expect((await pool.query("SELECT * FROM referral_commission_ledger")).rows).toHaveLength(0);
    expect(await events.get("evt_early")).toMatchObject({ status: "pending" });
  });
  it("completes a verified unrelated payment without fabricating customer or commission records", async () => {
    await capture();
    const read = vi.fn();
    await processNextReferralReceiptJob({
      db,
      store: events,
      provider: {} as StripeBillingProvider,
      readResourceContext: async () => ({
        provider_customer_id: "cus_early",
        organization_external_id: null,
        subscription_related: false
      }),
      readSnapshot: read
    });
    expect(read).not.toHaveBeenCalled();
    expect(await events.get("evt_early")).toMatchObject({
      status: "completed",
      organization_external_id: null
    });
    expect((await pool.query("SELECT * FROM billing_customer_history")).rows).toHaveLength(0);
  });
  it("does not let a stale unrelated-resource worker release the retained financial hold", async () => {
    await capture();
    await expect(
      processNextReferralReceiptJob({
        db,
        store: events,
        provider: {} as StripeBillingProvider,
        readResourceContext: async () => {
          await pool.query(
            "UPDATE worker_jobs SET lease_token=$1 WHERE job_name='reconcile-referral-receipts'",
            [randomUUID()]
          );
          return {
            provider_customer_id: "cus_early",
            organization_external_id: null,
            subscription_related: false
          };
        }
      })
    ).rejects.toThrow("referral_reconciliation_unavailable");
    expect(await events.get("evt_early")).toMatchObject({ status: "pending" });
  });
  it("does not start another commission period in a pre-attributed second workspace", async () => {
    const other = await account();
    const second = (
      await refs.saveAttribution({
        organization_id: other,
        actor_user_id: owner,
        code,
        source: "manual",
        explicit_correction: false,
        provider_customer_id_checked: null,
        provider_previously_paid: false
      })
    ).referral_id;
    await createReferralBenefitStore(db).reserveCheckout({
      organization_id: org,
      actor_user_id: owner,
      attribution_id: attribution,
      checkout_attempt_id: randomUUID(),
      coupon_id: "coupon_referral"
    });
    await pool.query("UPDATE organizations SET stripe_customer_id='cus_early' WHERE id=$1", [
      other
    ]);
    await ledger.reconcile(snapshot(other));
    expect(
      (
        await pool.query("SELECT status FROM referral_commission_periods WHERE attribution_id=$1", [
          second
        ])
      ).rows[0].status
    ).toBe("ineligible");
    expect((await pool.query("SELECT * FROM referral_commission_ledger")).rows).toHaveLength(0);
  });
});
