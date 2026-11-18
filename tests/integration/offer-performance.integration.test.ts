import { randomUUID } from "node:crypto";
import { processNextReferralReceiptJob } from "../../apps/worker/src/referral-receipt-processor.js";
import { createReferralReconciliationStore } from "../../packages/storage/src/referral-reconciliation-store.js";
import type { StripeBillingProvider } from "../../packages/billing/src/stripe-subscription.js";
import { mockedObject } from "../helpers/vitest.js";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { createOfferProgrammeStore } from "../../packages/storage/src/offer-programme-store.js";
import { offerProgrammeSchemaAvailable } from "../../packages/storage/src/offer-programme-schema.js";
import { recordOfferPerformance } from "../../packages/storage/src/offer-performance-store.js";
import { createReferralLedgerStore } from "../../packages/storage/src/referral-ledger-store.js";
import type { ReferralReceiptSnapshot } from "../../packages/referrals/src/referral-ledger-contracts.js";
import { runInTransaction } from "../../packages/storage/src/transaction.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
import {
  resetOfferIntegrationSchema,
  createOfferTestAccount,
  createOfferTestUser,
  createOfferTestProgramme
} from "../helpers/offer-integration.js";
runIntegration("verified offer cohort performance", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    store = createOfferProgrammeStore(db, {
      identityHashSecret: "offer-performance-secret-thirty-two-characters-long"
    });
  let org: string, owner: string, version: string, identity: string;
  const window = () => ({
    from: new Date(Date.now() - 86400000).toISOString(),
    to: new Date(Date.now() + 86400000).toISOString()
  });
  beforeEach(async () => {
    await resetOfferIntegrationSchema(db);
    const operator = await createOfferTestUser(db),
      creator = await createOfferTestUser(db);
    owner = await createOfferTestUser(db);
    org = await createOfferTestAccount(db, owner);
    const v = await createOfferTestProgramme(store, operator);
    version = v.version_id;
    await store.creators.join({
      user_id: creator,
      version_id: version,
      terms_version: v.policy.terms_version
    });
    await store.creators.claimCode({ user_id: creator, code: "REPORT20" });
    await store.claims.apply({
      organization_id: org,
      actor_user_id: owner,
      code: "REPORT20",
      source: "manual",
      explicit_correction: false,
      provider_customer_id_checked: null,
      provider_previously_paid: false
    });
    await db.query("UPDATE organizations SET stripe_customer_id='cus_report' WHERE id=$1", [org]);
    identity = String(
      (
        await db.query("SELECT owner_identity_hash FROM offer_claims WHERE organization_id=$1", [
          org
        ])
      ).rows[0]!["owner_identity_hash"]
    );
  });
  afterAll(async () => pool.end());
  const snapshot = (observed: string, refunded = 0): ReferralReceiptSnapshot => ({
    organization_external_id: org,
    owner_identity_hash: identity,
    provider_customer_id: "cus_report",
    observed_at: observed,
    invoices: [
      {
        invoice_id: "in_report",
        currency: "usd",
        lines: [
          {
            id: "base",
            plan: "team",
            kind: "plan",
            net_amount_minor: 1600,
            tax_amount_minor: 160,
            service_starts_at: "2026-11-01T00:00:00.000Z",
            service_ends_at: "2026-12-01T00:00:00.000Z"
          },
          {
            id: "capacity",
            plan: "team",
            kind: "extra_capacity",
            net_amount_minor: 400,
            tax_amount_minor: 40,
            service_starts_at: "2026-11-01T00:00:00.000Z",
            service_ends_at: "2026-12-01T00:00:00.000Z"
          }
        ],
        payments: [
          {
            payment_id: "pay_report",
            cash_minor: 2200,
            collected_at: "2026-11-02T00:00:00.000Z",
            provider_available_at: "2026-11-04T00:00:00.000Z"
          }
        ],
        refunds: refunded ? [{ id: "refund", cash_minor: refunded }] : [],
        disputed: false,
        base_discount_minor: 400
      }
    ]
  });
  it("reports current cash, discounts and ledger reversals with explicit observation coverage", async () => {
    expect(await store.performance(window())).toMatchObject({
      claims: 1,
      unreconciled_claims: 1,
      reconciled_claims: 0,
      discount_coverage_complete: false
    });
    const record = async (facts: ReferralReceiptSnapshot) =>
      runInTransaction(db, async (tx) => {
        await createReferralLedgerStore(tx).reconcile(facts);
        await recordOfferPerformance(tx, facts);
      });
    await record(snapshot("2026-11-16T00:00:00.000Z"));
    expect(await store.performance({ ...window(), version_id: version })).toMatchObject({
      claims: 1,
      paid_conversions: 1,
      reconciled_claims: 1,
      unreconciled_claims: 0,
      base_cash_collected_minor: 1600,
      base_cash_retained_minor: 1600,
      base_discount_minor: 400,
      commission_net_minor: 800,
      discount_coverage_complete: true
    });
    await record(snapshot("2026-11-17T00:00:00.000Z", 1100));
    await recordOfferPerformance(db, snapshot("2026-11-16T00:00:00.000Z"));
    const report = await store.performance(window());
    expect(report).toMatchObject({
      base_cash_retained_minor: 800,
      base_cash_reversed_minor: 800,
      commission_net_minor: 400,
      commission_reversed_minor: 400,
      commission_paid_minor: 0,
      latest_observation: "2026-11-17T00:00:00.000Z"
    });
    expect(JSON.stringify(report)).not.toMatch(
      /cus_report|owner_identity_hash|example.test|in_report/
    );
  });
  it.each(["current", "deleted", "stale"])(
    "fences offer recovery and its reporting projection with the receipt lease: %s",
    async (mode) => {
      const claim = String(
          (await db.query("SELECT id FROM offer_claims WHERE organization_external_id=$1", [org]))
            .rows[0]!["id"]
        ),
        coupon = `coupon_${version}`;
      await db.query("UPDATE offer_claims SET checkout_attempt_id=$2,coupon_id=$3 WHERE id=$1", [
        claim,
        randomUUID(),
        coupon
      ]);
      const events = createReferralReconciliationStore(db, {
        identityHashSecret: "offer-performance-secret-thirty-two-characters-long"
      });
      await events.capture({
        event_id: "evt_offer_recovery",
        event_type: "invoice.created",
        resource_type: "invoice",
        resource_id: "in_offer_draft",
        provider_customer_id: "cus_report",
        livemode: false,
        provider_created_at: "2026-11-16T00:00:00.000Z"
      });
      if (mode === "deleted") await db.query("DELETE FROM organizations WHERE id=$1", [org]);
      const facts: ReferralReceiptSnapshot = {
        ...snapshot("2026-11-16T00:00:00.000Z"),
        invoices: [],
        offer_benefit_invoices: [
          {
            invoice_id: "in_offer_draft",
            subscription_id: "sub_report",
            claim_id: claim,
            version_id: version,
            finalized: false,
            created_at: "2026-11-16T00:00:00.000Z",
            finalized_at: null,
            amount_due_minor: 1600,
            base_net_minor: 1600,
            applied_coupon_ids: [],
            verified_base_coupon_ids: []
          }
        ]
      };
      const restore = vi
        .fn<
          NonNullable<Parameters<typeof processNextReferralReceiptJob>[0]["restoreOfferBenefit"]>
        >()
        .mockResolvedValue("applied");
      const operation = () =>
        processNextReferralReceiptJob({
          db,
          store: events,
          provider: mockedObject<StripeBillingProvider>({}),
          restoreOfferBenefit: restore,
          readResourceContext: async () => ({
            provider_customer_id: "cus_report",
            organization_external_id: org,
            subscription_related: true
          }),
          readSnapshot: async () => {
            if (mode === "stale")
              await db.query(
                "UPDATE worker_jobs SET lease_token=$1 WHERE job_name='reconcile-referral-receipts'",
                [randomUUID()]
              );
            return facts;
          }
        });
      if (mode === "stale") {
        await expect(operation()).rejects.toThrow("referral_reconciliation_unavailable");
        expect(restore).not.toHaveBeenCalled();
        expect(
          (await db.query("SELECT performance FROM offer_claims WHERE id=$1", [claim])).rows[0]![
            "performance"
          ]
        ).toBeNull();
        expect(await events.get("evt_offer_recovery")).toMatchObject({ status: "pending" });
      } else {
        expect(await operation()).toEqual({ processed: true });
        expect(restore).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            claim_id: claim,
            invoice_id: "in_offer_draft",
            coupon_id: coupon
          })
        );
        expect(
          (
            await db.query(
              "SELECT recovery_completed_at,performance FROM offer_claims WHERE id=$1",
              [claim]
            )
          ).rows[0]
        ).toMatchObject({
          recovery_completed_at: expect.anything(),
          performance: { base_cash_retained_minor: 0 }
        });
        expect(await events.get("evt_offer_recovery")).toMatchObject({ status: "completed" });
      }
    }
  );
  it("rejects a named unique index protecting the wrong financial column", async () => {
    await db.query(
      "ALTER TABLE offer_claims DROP CONSTRAINT offer_claims_owner_identity_hash_key",
      []
    );
    await db.query(
      "CREATE UNIQUE INDEX offer_claims_owner_identity_hash_key ON offer_claims(id)",
      []
    );
    expect(await offerProgrammeSchemaAvailable(db)).toBe(false);
  });
  it("fails closed on identity mismatch and reports unobserved discounts explicitly", async () => {
    await expect(
      recordOfferPerformance(db, {
        ...snapshot("2026-11-16T00:00:00.000Z"),
        owner_identity_hash: "a".repeat(64)
      })
    ).rejects.toThrow("offer_performance_binding_mismatch");
    const facts = snapshot("2026-11-16T00:00:00.000Z");
    delete facts.invoices[0]!.base_discount_minor;
    await recordOfferPerformance(db, facts);
    expect(await store.performance(window())).toMatchObject({
      discount_coverage_complete: false,
      base_discount_minor: 0
    });
    await expect(
      store.performance({ from: "2025-01-01T00:00:00.000Z", to: "2027-01-01T00:00:00.000Z" })
    ).rejects.toThrow();
  });
});
