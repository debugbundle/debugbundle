import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { createOfferProgrammeStore } from "../../packages/storage/src/offer-programme-store.js";
import {
  reconcileOfferInvoiceBenefits,
  completeOfferBenefitRecovery
} from "../../packages/storage/src/offer-benefit-reconciliation.js";
import { reconcileReferralInvoiceBenefits } from "../../packages/storage/src/referral-benefit-reconciliation.js";
import { completeReferralBenefitRecovery } from "../../packages/storage/src/referral-benefit-recovery-store.js";
import { createReferralStore } from "../../packages/storage/src/referral-store.js";
import { createReferralBenefitStore } from "../../packages/storage/src/referral-benefit-store.js";
import { REFERRAL_TERMS_VERSION } from "../../packages/referrals/src/referral-contracts.js";
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
runIntegration("zero-invoice recovery retirement", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    options = {
      identityHashSecret: "offer-recovery-retirement-secret-at-least-thirty-two-characters"
    },
    store = createOfferProgrammeStore(db, options),
    legacy = createReferralStore(db, options);
  let operator: string, owner: string, org: string, creator: string;
  beforeEach(async () => {
    await resetOfferIntegrationSchema(db);
    operator = await createOfferTestUser(db);
    owner = await createOfferTestUser(db);
    org = await createOfferTestAccount(db, owner);
    creator = await createOfferTestUser(db);
  });
  afterAll(async () => pool.end());
  const zeroFacts = (identity: string): ReferralReceiptSnapshot => ({
    organization_external_id: org,
    owner_identity_hash: identity,
    provider_customer_id: "cus_recovery",
    observed_at: "2026-11-17T00:00:00.000Z",
    invoices: [
      {
        invoice_id: "in_zero",
        currency: "usd",
        lines: [
          {
            id: "line_zero",
            plan: "business",
            kind: "plan",
            net_amount_minor: 0,
            tax_amount_minor: 0,
            service_starts_at: "2026-11-16T00:00:00.000Z",
            service_ends_at: "2026-12-16T00:00:00.000Z"
          }
        ],
        payments: [],
        refunds: [],
        disputed: false
      }
    ]
  });
  it.each([false, true])(
    "keeps a versioned benefit pending after its recovered invoice finalises at zero; acknowledgement=%s",
    async (acknowledged) => {
      const version = await createOfferTestProgramme(store, operator);
      await store.creators.join({
        user_id: creator,
        version_id: version.version_id,
        terms_version: version.policy.terms_version
      });
      const profile = await store.creators.claimCode({ user_id: creator, code: "RECOVERY20" });
      const saved = await store.claims.apply({
        organization_id: org,
        actor_user_id: owner,
        code: profile.code,
        source: "manual",
        explicit_correction: false,
        provider_customer_id_checked: null,
        provider_previously_paid: false
      });
      await db.query("UPDATE organizations SET stripe_customer_id='cus_recovery' WHERE id=$1", [
        org
      ]);
      await db.query(
        "UPDATE offer_claims SET checkout_attempt_id=$2,coupon_id='coupon_recovery' WHERE id=$1",
        [saved.claim_id, randomUUID()]
      );
      const identity = String(
        (
          await db.query("SELECT owner_identity_hash FROM offer_claims WHERE id=$1", [
            saved.claim_id
          ])
        ).rows[0]!["owner_identity_hash"]
      );
      const first = {
        invoice_id: "in_zero",
        subscription_id: "sub_recovery",
        claim_id: saved.claim_id,
        version_id: version.version_id,
        finalized: false,
        created_at: "2026-11-16T00:00:00.000Z",
        finalized_at: null as string | null,
        amount_due_minor: 400,
        base_net_minor: 400,
        applied_coupon_ids: [] as string[],
        verified_base_coupon_ids: [] as string[]
      };
      const facts: ReferralReceiptSnapshot = {
        ...zeroFacts(identity),
        invoices: [],
        offer_benefit_invoices: [first]
      };
      const reconcile = () =>
        runInTransaction(db, (tx) => reconcileOfferInvoiceBenefits(tx, facts, false));
      expect(await reconcile()).toMatchObject({ invoice_id: "in_zero" });
      if (acknowledged) await completeOfferBenefitRecovery(db, saved.claim_id, "in_zero");
      first.finalized = true;
      first.finalized_at = "2026-11-16T00:00:00.000Z";
      first.amount_due_minor = 0;
      first.base_net_minor = 0;
      facts.invoices = zeroFacts(identity).invoices;
      const next = {
        ...first,
        invoice_id: "in_next",
        created_at: "2026-11-17T00:00:00.000Z",
        finalized: false,
        finalized_at: null,
        amount_due_minor: 400,
        base_net_minor: 400
      };
      facts.offer_benefit_invoices!.push(next);
      expect(await reconcile()).toMatchObject({ invoice_id: "in_next", claim_id: saved.claim_id });
      expect(await reconcile()).toMatchObject({ invoice_id: "in_next" });
      const retirement = (
        await db.query(
          "SELECT kind,claim_id,provider_invoice_id FROM referral_benefit_recovery_retirements",
          []
        )
      ).rows;
      expect(retirement).toEqual([
        { kind: "offer", claim_id: saved.claim_id, provider_invoice_id: "in_zero" }
      ]);
      await expect(
        db.query("UPDATE referral_benefit_recovery_retirements SET amount_due_minor=1", [])
      ).rejects.toThrow("offer_record_immutable");
      facts.offer_benefit_invoices![1] = {
        ...next,
        finalized: true,
        finalized_at: "2026-11-17T00:00:00.000Z",
        applied_coupon_ids: ["coupon_recovery"],
        verified_base_coupon_ids: ["coupon_recovery"]
      };
      facts.invoices.push({
        ...zeroFacts(identity).invoices[0]!,
        invoice_id: "in_next",
        lines: [
          { ...zeroFacts(identity).invoices[0]!.lines[0]!, id: "positive", net_amount_minor: 400 }
        ]
      });
      expect(await reconcile()).toBeNull();
      await completeOfferBenefitRecovery(db, saved.claim_id, "in_next");
      await expect(
        db.query(
          "UPDATE offer_claims SET recovery_completed_at=now()+interval '1 hour' WHERE id=$1",
          [saved.claim_id]
        )
      ).rejects.toThrow("offer_invoice_immutable");
      expect(
        (await store.claims.read({ organization_id: org, actor_user_id: owner }))!.status
      ).toBe("used");
    }
  );
  it.each([false, true])(
    "preserves legacy recovery after a provider-confirmed zero invoice; acknowledgement=%s",
    async (acknowledged) => {
      const partner = await legacy.joinProgram({
          user_id: creator,
          terms_version: REFERRAL_TERMS_VERSION
        }),
        attr = await legacy.saveAttribution({
          organization_id: org,
          actor_user_id: owner,
          code: partner.code,
          source: "manual",
          explicit_correction: false,
          provider_customer_id_checked: null,
          provider_previously_paid: false
        });
      await createReferralBenefitStore(db).reserveCheckout({
        organization_id: org,
        actor_user_id: owner,
        attribution_id: attr.referral_id,
        checkout_attempt_id: randomUUID(),
        coupon_id: "coupon_legacy"
      });
      await db.query("UPDATE organizations SET stripe_customer_id='cus_recovery' WHERE id=$1", [
        org
      ]);
      const identity = String(
        (
          await db.query("SELECT owner_identity_hash FROM referral_attributions WHERE id=$1", [
            attr.referral_id
          ])
        ).rows[0]!["owner_identity_hash"]
      );
      const first = {
        invoice_id: "in_zero",
        subscription_id: "sub_recovery",
        attribution_id: attr.referral_id,
        finalized: false,
        created_at: "2026-11-16T00:00:00.000Z",
        finalized_at: null as string | null,
        amount_due_minor: 5310,
        business_base_net_minor: 5310,
        applied_coupon_ids: [] as string[],
        ten_percent_base_coupon_ids: [] as string[]
      };
      const facts: ReferralReceiptSnapshot = {
        ...zeroFacts(identity),
        invoices: [],
        benefit_invoices: [first]
      };
      const reconcile = () =>
        runInTransaction(db, (tx) => reconcileReferralInvoiceBenefits(tx, facts, false));
      expect(await reconcile()).toMatchObject({ invoice_id: "in_zero" });
      if (acknowledged) await completeReferralBenefitRecovery(db, org, "in_zero");
      first.finalized = true;
      first.finalized_at = "2026-11-16T00:00:00.000Z";
      first.amount_due_minor = 0;
      first.business_base_net_minor = 0;
      facts.invoices = zeroFacts(identity).invoices;
      facts.benefit_invoices!.push({
        ...first,
        invoice_id: "in_next",
        created_at: "2026-11-17T00:00:00.000Z",
        finalized: false,
        finalized_at: null,
        amount_due_minor: 5310,
        business_base_net_minor: 5310
      });
      expect(await reconcile()).toMatchObject({ invoice_id: "in_next" });
      expect(
        (await db.query("SELECT kind FROM referral_benefit_recovery_retirements", [])).rows
      ).toEqual([{ kind: "legacy" }]);
    }
  );
});
