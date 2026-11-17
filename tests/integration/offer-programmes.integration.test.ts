import {
  resetOfferIntegrationSchema,
  createOfferTestProgramme,
  createOfferTestUser,
  createOfferTestAccount,
  offerIntegrationPolicy
} from "../helpers/offer-integration.js";
import { createLegacyOfferAdapter } from "../../packages/storage/src/legacy-offer-adapter.js";
import { createOfferSignupProcessor } from "../../apps/worker/src/offer-signup-processor.js";
import type { StripeBillingProvider } from "../../packages/billing/src/stripe-subscription.js";
import { mockedObject } from "../helpers/vitest.js";
import { pruneOfferTransientState } from "../../packages/storage/src/offer-transient-retention.js";
import { createBusinessAccountExportStore } from "../../packages/storage/src/business-account-export.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import {
  assertStorageSchemaMigrationsApplied,
  STORAGE_SCHEMA_MIGRATIONS
} from "../../packages/storage/src/schema-migrations.js";
import { createOfferProgrammeStore } from "../../packages/storage/src/offer-programme-store.js";
import {
  offerProgrammeSchemaAvailable,
  OFFER_PROGRAMME_MIGRATION
} from "../../packages/storage/src/offer-programme-schema.js";
import { createReferralStore } from "../../packages/storage/src/referral-store.js";
import { REFERRAL_TERMS_VERSION } from "../../packages/referrals/src/referral-contracts.js";
import { createReferralLedgerStore } from "../../packages/storage/src/referral-ledger-store.js";
import { createPostgresBillingCheckoutStore } from "../../packages/storage/src/billing-checkout-store.js";
import { createOfferBenefitStore } from "../../packages/storage/src/offer-benefit-store.js";
import { reconcileOfferInvoiceBenefits } from "../../packages/storage/src/offer-benefit-reconciliation.js";
import { runInTransaction } from "../../packages/storage/src/transaction.js";
import type { OfferPolicy } from "../../packages/referrals/src/programme-policy.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";

runIntegration("versioned offer programmes and permanent creator codes", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  const secret = "offer-integration-identity-secret-at-least-32-characters";
  const store = createOfferProgrammeStore(db, { identityHashSecret: secret });
  const legacy = createReferralStore(db, { identityHashSecret: secret });
  let operator: string, creator: string, owner: string, org: string;
  const policy = offerIntegrationPolicy;
  const user = (verified = true): Promise<string> => createOfferTestUser(db, verified);
  const account = (id: string): Promise<string> => createOfferTestAccount(db, id);
  const programme = (
    changes: Partial<OfferPolicy> = {}
  ): Promise<import("../../packages/referrals/src/programme-policy.js").ProgrammeVersion> =>
    createOfferTestProgramme(store, operator, { ...policy, ...changes });
  async function enrolled(code = "CREATOR20", changes: Partial<OfferPolicy> = {}) {
    const v = await programme(changes);
    await store.creators.join({
      user_id: creator,
      version_id: v.version_id,
      terms_version: v.policy.terms_version
    });
    return store.creators.claimCode({ user_id: creator, code });
  }
  const claim = (code: string, changes: Record<string, unknown> = {}) =>
    store.claims.apply({
      organization_id: org,
      actor_user_id: owner,
      code,
      source: "manual",
      explicit_correction: false,
      provider_customer_id_checked: null,
      provider_previously_paid: false,
      ...changes
    });
  beforeEach(async () => {
    await resetOfferIntegrationSchema(db);
    operator = await user();
    creator = await user();
    owner = await user();
    org = await account(owner);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("requires the forward migration and exact enabled guards without changing installed checksums", async () => {
    expect(await offerProgrammeSchemaAvailable(db)).toBe(true);
    await assertStorageSchemaMigrationsApplied(db);
    const checksums = (
      await pool.query("SELECT id,checksum FROM storage_migration_ledger ORDER BY id")
    ).rows;
    expect(checksums).toHaveLength(STORAGE_SCHEMA_MIGRATIONS.length);
    expect(checksums.find((r) => r.id === OFFER_PROGRAMME_MIGRATION.id)?.checksum).toBe(
      OFFER_PROGRAMME_MIGRATION.checksum
    );
    await pool.query("ALTER TABLE offer_codes DISABLE TRIGGER offer_codes_immutable");
    expect(await offerProgrammeSchemaAvailable(db)).toBe(false);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "offer_programme_schema_incomplete"
    );
  });
  it("fails readiness when a financial column is missing even with an intact migration ledger", async () => {
    await pool.query("ALTER TABLE offer_claims DROP COLUMN slot_released");
    expect(await offerProgrammeSchemaAvailable(db)).toBe(false);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "offer_programme_schema_incomplete"
    );
  });
  it("fails readiness when the immutable guard body has been replaced", async () => {
    await pool.query(
      "CREATE OR REPLACE FUNCTION protect_offer_immutable_records() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$"
    );
    expect(await offerProgrammeSchemaAvailable(db)).toBe(false);
  });
  it("never activates drafts implicitly and freezes published policy and provider references", async () => {
    const draft = await store.createDraft({
      actor_user_id: operator,
      name: "Draft",
      public_description: "Terms",
      policy
    });
    expect(draft.state).toBe("draft");
    await expect(
      store.setState({
        actor_user_id: operator,
        version_id: draft.version_id,
        expected_state: "draft",
        state: "active",
        acknowledge_unlimited: true
      })
    ).rejects.toMatchObject({ code: "programme_unavailable" });
    await expect(
      pool.query("UPDATE offer_programme_versions SET policy='{}' WHERE id=$1", [draft.version_id])
    ).rejects.toThrow("offer_version_immutable");
    const active = await programme();
    await expect(
      store.bindProvider({
        actor_user_id: operator,
        version_id: active.version_id,
        coupon_id: "replacement",
        livemode: false
      })
    ).rejects.toMatchObject({ code: "programme_not_draft" });
  });
  it.each([9990, 9999])(
    "refuses activation when a %i basis-point discount rounds an eligible invoice to zero",
    async (discount_basis_points) => {
      await expect(programme({ discount_basis_points })).rejects.toMatchObject({
        code: "programme_discount_invalid"
      });
      expect(await store.list({ limit: 100, public_only: true })).toEqual([]);
      expect((await store.list({ limit: 100 }))[0]?.state).toBe("draft");
    }
  );
  it("previews and applies the original legacy agreement until the creator explicitly accepts a new one", async () => {
    const old = await legacy.joinProgram({
      user_id: creator,
      terms_version: REFERRAL_TERMS_VERSION
    });
    const adapter = createLegacyOfferAdapter({
      db,
      secret,
      enabled: true,
      secure: true,
      readEligibility: async () => ({
        provider_customer_id_checked: null,
        provider_previously_paid: false
      })
    });
    expect(await adapter.preview(old.code)).toMatchObject({
      version: {
        legacy_terms_version: REFERRAL_TERMS_VERSION,
        policy: { discount_basis_points: 1000, eligible_plans: ["business"] }
      }
    });
    await adapter.attribute(
      { organization_id: org, actor_user_id: owner },
      old.code,
      false,
      "manual"
    );
    expect(await adapter.customer({ organization_id: org, actor_user_id: owner })).toMatchObject({
      attribution: { partner_code: old.code },
      discount_eligible: true
    });
    const version = await programme();
    await store.creators.join({
      user_id: creator,
      version_id: version.version_id,
      terms_version: version.policy.terms_version
    });
    expect(await adapter.preview(old.code)).toBeNull();
    expect(await store.preview(old.code)).toMatchObject({
      version: { policy: { discount_basis_points: 2000 } }
    });
  });
  it("preserves original legacy commission terms when a holiday offer replaces only its discount", async () => {
    const old = await legacy.joinProgram({
      user_id: creator,
      terms_version: REFERRAL_TERMS_VERSION
    });
    await legacy.saveAttribution({
      organization_id: org,
      actor_user_id: owner,
      code: old.code,
      source: "manual",
      explicit_correction: false,
      provider_customer_id_checked: null,
      provider_previously_paid: false
    });
    const promotion = await programme({
      kind: "promotion",
      discount_basis_points: 3000,
      commission_basis_points: 0
    });
    await store.createPromotionCode({
      actor_user_id: operator,
      version_id: promotion.version_id,
      code: "LEGACY-HOLIDAY"
    });
    const saved = await claim("LEGACY-HOLIDAY", { explicit_correction: true });
    expect(saved).toMatchObject({
      code: "LEGACY-HOLIDAY",
      referral_code: old.code,
      version: { policy: { discount_basis_points: 3000 } }
    });
    expect(
      (
        await pool.query(
          "SELECT referral_version_id,attribution_id FROM offer_claims WHERE id=$1",
          [saved.claim_id]
        )
      ).rows[0]?.referral_version_id
    ).toBeNull();
    await pool.query(
      "UPDATE organizations SET stripe_customer_id='cus_legacy_holiday' WHERE id=$1",
      [org]
    );
    const identity = (
      await pool.query(
        "SELECT owner_identity_hash FROM referral_attributions WHERE organization_id=$1",
        [org]
      )
    ).rows[0]!.owner_identity_hash;
    const result = await createReferralLedgerStore(db).reconcile({
      organization_external_id: org,
      owner_identity_hash: identity,
      provider_customer_id: "cus_legacy_holiday",
      observed_at: "2026-11-16T00:00:00.000Z",
      invoices: [
        {
          invoice_id: "in_legacy_holiday",
          currency: "usd",
          lines: [
            {
              id: "base",
              plan: "business",
              kind: "plan",
              net_amount_minor: 4130,
              tax_amount_minor: 0,
              service_starts_at: "2026-11-16T00:00:00.000Z",
              service_ends_at: "2026-12-16T00:00:00.000Z"
            }
          ],
          payments: [
            {
              payment_id: "payment_legacy_holiday",
              cash_minor: 4130,
              collected_at: "2026-11-16T00:00:00.000Z",
              provider_available_at: "2026-11-18T00:00:00.000Z"
            }
          ],
          refunds: [],
          disputed: false
        }
      ]
    });
    expect(result.adjustment_minor).toBe(2065);
  });
  it("reserves exactly one case-insensitive creator alias under races without replacing legacy identity", async () => {
    const old = await legacy.joinProgram({
      user_id: creator,
      terms_version: REFERRAL_TERMS_VERSION
    });
    const v = await programme();
    await store.creators.join({
      user_id: creator,
      version_id: v.version_id,
      terms_version: policy.terms_version
    });
    const second = await user();
    await store.creators.join({
      user_id: second,
      version_id: v.version_id,
      terms_version: policy.terms_version
    });
    const result = await Promise.allSettled([
      store.creators.claimCode({ user_id: creator, code: "owen20" }),
      store.creators.claimCode({ user_id: second, code: "OWEN20" })
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await legacy.getPartner({ user_id: creator }))?.partner_id).toBe(old.partner_id);
    expect(
      (await pool.query("SELECT code FROM offer_codes WHERE code='OWEN20'")).rows
    ).toHaveLength(1);
  });
  it("retains aliases after creator deletion and refuses transfers and speculative second aliases", async () => {
    const p = await enrolled();
    await expect(
      store.creators.claimCode({ user_id: creator, code: "SECOND20" })
    ).rejects.toMatchObject({ code: "creator_code_already_claimed" });
    await pool.query("DELETE FROM users WHERE id=$1", [creator]);
    expect(await store.preview("CREATOR20")).toBeNull();
    await expect(
      pool.query("UPDATE offer_codes SET partner_id=$2 WHERE code=$1", [p.code, randomUUID()])
    ).rejects.toThrow();
    expect(
      (await pool.query("SELECT code FROM offer_codes WHERE code=$1", [p.code])).rows
    ).toHaveLength(1);
  });
  it("supports audited operator alias correction without redirecting an existing code to another creator", async () => {
    const first = await enrolled();
    const corrected = await store.creators.correctCode({
      reason: "Creator requested a spelling correction",
      operator_user_id: operator,
      partner_id: first.partner_id,
      code: "CREATOR-NEW"
    });
    expect(corrected.code).toBe("CREATOR-NEW");
    expect(await store.preview(first.code)).toMatchObject({ code: first.code, available: true });
    expect((await store.preview(corrected.code))?.version.version_id).toBe(
      first.version.version_id
    );
  });
  it("prevents the legacy attribution endpoint from contradicting a saved versioned claim", async () => {
    const original = await enrolled();
    const saved = await claim(original.code);
    const another = await user();
    const other = await legacy.joinProgram({
      user_id: another,
      terms_version: REFERRAL_TERMS_VERSION
    });
    await expect(
      legacy.saveAttribution({
        organization_id: org,
        actor_user_id: owner,
        code: other.code,
        source: "manual",
        explicit_correction: true,
        provider_customer_id_checked: null,
        provider_previously_paid: false
      })
    ).rejects.toMatchObject({ code: "attribution_frozen" });
    expect(await store.claims.read({ organization_id: org, actor_user_id: owner })).toMatchObject({
      claim_id: saved.claim_id,
      referral_code: original.code
    });
  });
  it("saves a cookie-free offer through trial expiry, programme pause and duplicate application", async () => {
    const p = await enrolled();
    const saved = await claim(p.code);
    expect(saved).toMatchObject({
      code: p.code,
      status: "saved",
      redeem_by: null,
      version: { policy: { discount_basis_points: 2000 } }
    });
    await pool.query(
      "UPDATE organizations SET plan='free',billing_state='trial_expired',trial_plan='team',trial_started_at=now()-interval '40 days',trial_ends_at=now()-interval '10 days' WHERE id=$1",
      [org]
    );
    await store.setState({
      actor_user_id: operator,
      version_id: p.version.version_id,
      expected_state: "active",
      state: "paused",
      acknowledge_unlimited: true
    });
    expect(await store.claims.read({ organization_id: org, actor_user_id: owner })).toEqual(saved);
    expect(await claim(p.code)).toEqual(saved);
    expect(await store.preview(p.code)).toMatchObject({ available: false });
  });
  it("prevents self-referral, prior payment, wrong ownership and cross-workspace benefit reuse", async () => {
    const p = await enrolled();
    await expect(claim(p.code, { actor_user_id: creator })).rejects.toThrow();
    await expect(claim(p.code, { provider_previously_paid: true })).rejects.toMatchObject({
      code: "offer_ineligible"
    });
    await claim(p.code);
    const otherOrg = await account(owner);
    await expect(claim(p.code, { organization_id: otherOrg })).rejects.toMatchObject({
      code: "offer_ineligible"
    });
  });
  it("blocks abusive aliases only for new claims and preserves code ownership and saved promises", async () => {
    const creator = await enrolled();
    const actor = { organization_id: org, actor_user_id: owner };
    const saved = await store.claims.apply({
      ...actor,
      code: creator.code,
      source: "manual",
      explicit_correction: false,
      provider_customer_id_checked: null,
      provider_previously_paid: false
    });
    await store.creators.setCodeBlocked({
      operator_user_id: operator,
      code: creator.code,
      blocked: true,
      reason: "Reported impersonation pending review"
    });
    expect(await store.preview(creator.code)).toBeNull();
    expect(await store.claims.read(actor)).toMatchObject({
      claim_id: saved.claim_id,
      status: "saved"
    });
    const action = (await pool.query("SELECT action,reason FROM offer_code_actions")).rows[0];
    expect(action).toEqual({ action: "block", reason: "Reported impersonation pending review" });
    await expect(pool.query("UPDATE offer_code_actions SET reason='erased'")).rejects.toThrow();
    await store.creators.setCodeBlocked({
      operator_user_id: operator,
      code: creator.code,
      blocked: false,
      reason: "Review completed"
    });
    expect(await store.preview(creator.code)).toMatchObject({
      code: creator.code,
      available: true
    });
  });
  it("recovers a durable signup offer after a provider outage and worker restart", async () => {
    const creator = await enrolled();
    await pool.query(
      "INSERT INTO offer_signup_intents(id,organization_id,user_id,code,expires_at) VALUES($1,$2,$3,$4,now()+interval '30 days')",
      [randomUUID(), org, owner, creator.code]
    );
    const customers = vi
      .fn()
      .mockRejectedValueOnce(new Error("provider_unavailable"))
      .mockResolvedValue({ data: [], has_more: false });
    const provider = mockedObject<StripeBillingProvider>({
      client: { customers: { list: customers } },
      priceMap: new Map()
    });
    const input = { db, provider, secret, enabled: true };
    expect(await createOfferSignupProcessor(input)!()).toEqual({ processed: true });
    expect((await pool.query("SELECT status,attempts FROM offer_signup_intents")).rows[0]).toEqual({
      status: "pending",
      attempts: 1
    });
    expect(await store.claims.read({ organization_id: org, actor_user_id: owner })).toBeNull();
    await pool.query("UPDATE offer_signup_intents SET next_attempt_at=now()-interval '1 second'");
    expect(await createOfferSignupProcessor(input)!()).toEqual({ processed: true });
    expect((await pool.query("SELECT status,attempts FROM offer_signup_intents")).rows[0]).toEqual({
      status: "completed",
      attempts: 2
    });
    expect(await store.claims.read({ organization_id: org, actor_user_id: owner })).toMatchObject({
      code: creator.code,
      status: "saved"
    });
    expect(createOfferSignupProcessor({ ...input, enabled: false })).toBeNull();
  });
  it("prunes expired delegation hashes and terminal signup intents in bounded batches without touching claims", async () => {
    const creator = await enrolled();
    const saved = await claim(creator.code);
    await pool.query(
      "INSERT INTO offer_operator_delegations(proof_hash,user_id,member_token_id,session_id,actions,expires_at) VALUES($1,$3,$4,$5,'[\"read\"]',now()-interval '1 minute'),($2,$3,$4,$5,'[\"read\"]',now()+interval '15 minutes')",
      ["a".repeat(64), "b".repeat(64), operator, randomUUID(), randomUUID()]
    );
    await pool.query(
      "INSERT INTO offer_signup_intents(id,organization_id,user_id,code,expires_at) VALUES($1,$2,$3,$4,now()-interval '60 days')",
      [randomUUID(), org, owner, creator.code]
    );
    const input = { now: new Date().toISOString(), limit: 1 };
    expect(await pruneOfferTransientState(db, input)).toBe(1);
    expect((await pool.query("SELECT proof_hash FROM offer_operator_delegations")).rows).toEqual([
      { proof_hash: "b".repeat(64) }
    ]);
    expect(await pruneOfferTransientState(db, input)).toBe(1);
    expect((await pool.query("SELECT status FROM offer_signup_intents")).rows).toEqual([
      { status: "expired" }
    ]);
    expect(await pruneOfferTransientState(db, input)).toBe(1);
    expect((await pool.query("SELECT id FROM offer_signup_intents")).rows).toHaveLength(0);
    expect(await store.claims.read({ organization_id: org, actor_user_id: owner })).toMatchObject({
      claim_id: saved.claim_id,
      status: "saved"
    });
  });
  it("exports only the selected Owner's public offer data without financial identity or provider evidence", async () => {
    const creator = await enrolled();
    await claim(creator.code);
    const exporter = createBusinessAccountExportStore(db);
    const page = await exporter.read({
      organization_id: org,
      user_id: owner,
      query: { section: "customer_offers", limit: 1 }
    });
    expect(page?.items).toHaveLength(1);
    expect(page?.items[0]).toMatchObject({
      code: creator.code,
      checkout_reserved: false,
      used: false,
      policy: { discount_basis_points: 2000 }
    });
    expect(JSON.stringify(page)).not.toMatch(
      /owner_identity_hash|coupon_id|provider_customer_id|proof_hash|operator_user_id/
    );
    expect(
      await exporter.read({
        organization_id: org,
        user_id: operator,
        query: { section: "customer_offers", limit: 1 }
      })
    ).toBeNull();
  });
  it("preserves the referring partner when explicitly replacing the discount with a holiday campaign", async () => {
    const p = await enrolled();
    const first = await claim(p.code);
    const promo = await programme({
      kind: "promotion",
      commission_basis_points: 0,
      discount_basis_points: 3000
    });
    await store.createPromotionCode({
      actor_user_id: operator,
      version_id: promo.version_id,
      code: "HOLIDAY30"
    });
    await expect(claim("HOLIDAY30")).rejects.toMatchObject({
      code: "offer_change_requires_confirmation"
    });
    const changed = await claim("HOLIDAY30", { explicit_correction: true });
    expect(changed).toMatchObject({
      claim_id: first.claim_id,
      code: "HOLIDAY30",
      referral_code: p.code,
      version: { policy: { discount_basis_points: 3000 } }
    });
    expect(
      (await pool.query("SELECT * FROM offer_claim_history WHERE claim_id=$1", [first.claim_id]))
        .rows
    ).toHaveLength(2);
  });
  it("serialises a limited programme before promising more benefits than its cap", async () => {
    const p = await enrolled("LIMITED20", { max_claims: 1 });
    const anotherOwner = await user(),
      anotherOrg = await account(anotherOwner);
    const result = await Promise.allSettled([
      claim(p.code),
      claim(p.code, { actor_user_id: anotherOwner, organization_id: anotherOrg })
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(result.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "programme_claim_limit" }
    });
  });
  it("allows explicit pre-checkout offer removal and reapplication while releasing the unused claim slot once", async () => {
    const p = await enrolled("REMOVE20", { max_claims: 1 });
    const saved = await claim(p.code);
    const actor = { organization_id: org, actor_user_id: owner };
    await store.claims.remove(actor);
    await store.claims.remove(actor);
    expect((await store.getVersion(saved.version.version_id)).claims_count).toBe(0);
    expect(await store.claims.read(actor)).toMatchObject({
      status: "revoked",
      referral_code: p.code
    });
    expect(await claim(p.code, { explicit_correction: true })).toMatchObject({
      claim_id: saved.claim_id,
      status: "saved"
    });
    expect((await store.getVersion(saved.version.version_id)).claims_count).toBe(1);
  });
  it.each(
    (["solo", "team", "business"] as const).flatMap((plan) =>
      [5000, 7500, 10000].map((rate) => ({ plan, rate }))
    )
  )(
    "settles $plan cash at the frozen $rate basis-point commission using the existing ledger",
    async ({ plan, rate }) => {
      const p = await enrolled("CREATOR20", { commission_basis_points: rate });
      await claim(p.code);
      await store.createDraft({
        actor_user_id: operator,
        programme_id: p.version.programme_id,
        name: "Later terms",
        public_description: "Applies to future agreements only",
        policy: { ...policy, commission_basis_points: 1000 }
      });
      await pool.query("UPDATE organizations SET stripe_customer_id='cus_programme' WHERE id=$1", [
        org
      ]);
      const attribution = (
        await pool.query(
          "SELECT owner_identity_hash FROM referral_attributions WHERE organization_id=$1",
          [org]
        )
      ).rows[0]!;
      const snapshot = {
        organization_external_id: org,
        owner_identity_hash: attribution.owner_identity_hash,
        provider_customer_id: "cus_programme",
        observed_at: "2026-11-16T00:00:00.000Z",
        invoices: [
          {
            invoice_id: "in_programme",
            currency: "usd" as const,
            lines: [
              {
                id: "line_base",
                plan,
                kind: "plan" as const,
                net_amount_minor: 400,
                tax_amount_minor: 0,
                service_starts_at: "2026-11-16T00:00:00.000Z",
                service_ends_at: "2026-12-16T00:00:00.000Z"
              }
            ],
            payments: [
              {
                payment_id: "payment_programme",
                cash_minor: 400,
                collected_at: "2026-11-16T00:00:00.000Z",
                provider_available_at: "2026-11-18T00:00:00.000Z"
              }
            ],
            refunds: [],
            disputed: false
          }
        ]
      };
      const ledger = createReferralLedgerStore(db);
      const expected = (400 * rate) / 10000;
      expect(await ledger.reconcile(snapshot)).toMatchObject({ adjustment_minor: expected });
      expect(await ledger.reconcile(snapshot)).toMatchObject({
        status: "duplicate",
        adjustment_minor: 0
      });
      expect(await ledger.balance(p.partner_id, "2026-12-20T00:00:00.000Z")).toMatchObject({
        available_minor: expected
      });
      const refunded = {
        ...snapshot,
        observed_at: "2026-11-17T00:00:00.000Z",
        invoices: snapshot.invoices.map((invoice) => ({
          ...invoice,
          refunds: [{ id: "re_programme", cash_minor: 100 }]
        }))
      };
      expect(await ledger.reconcile(refunded)).toMatchObject({ adjustment_minor: -rate / 100 });
      expect(await ledger.reconcile(refunded)).toMatchObject({
        status: "duplicate",
        adjustment_minor: 0
      });
      expect(await ledger.balance(p.partner_id, "2026-12-20T00:00:00.000Z")).toMatchObject({
        available_minor: (300 * rate) / 10000
      });
    }
  );
  it("requires the selected offer at Checkout, freezes it and reuses its exact reservation", async () => {
    const p = await enrolled();
    const saved = await claim(p.code);
    await pool.query(
      "UPDATE organizations SET trial_plan='solo',trial_started_at=now()-interval '8 days',trial_ends_at=now()+interval '22 days' WHERE id=$1",
      [org]
    );
    const checkout = createPostgresBillingCheckoutStore(db);
    const expected_offer = {
      claim_id: saved.claim_id,
      version_id: saved.version.version_id,
      expires_at: new Date(Date.now() + 300_000).toISOString()
    };
    const parameters = (
      _customer: string | null,
      _expires: number,
      _referral?: unknown,
      offer?: { coupon_id: string }
    ) => ({
      line_items: [{ price: "price_solo", quantity: 1 }],
      ...(offer ? { discounts: [{ coupon: offer.coupon_id }], allow_promotion_codes: false } : {})
    });
    expect(
      await checkout.claim({
        organization_id: org,
        expected_owner_user_id: owner,
        target_plan: "solo",
        expected_offer,
        parameters
      })
    ).toBe("offer_coupon_required");
    const context = await createOfferBenefitStore(db).context({
      organization_id: org,
      actor_user_id: owner
    });
    expect(context).toMatchObject({
      required: true,
      discount_eligible: true,
      claim_id: saved.claim_id
    });
    const offer = {
      claim_id: saved.claim_id,
      version_id: saved.version.version_id,
      attribution_id: (
        await pool.query("SELECT id FROM referral_attributions WHERE organization_id=$1", [org])
      ).rows[0]!.id as string,
      coupon_id: context!.coupon_id!,
      provider_customer_id_checked: null,
      verified_owner_email_checked: `${owner}@example.test`
    };
    const request = {
      organization_id: org,
      expected_owner_user_id: owner,
      target_plan: "solo" as const,
      expected_offer,
      offer_coupon: offer,
      parameters
    };
    const attempt = await checkout.claim(request);
    expect(attempt).toMatchObject({
      parameters: { discounts: [{ coupon: offer.coupon_id }], allow_promotion_codes: false }
    });
    expect(await checkout.claim(request)).toEqual(attempt);
    expect(await store.claims.read({ organization_id: org, actor_user_id: owner })).toMatchObject({
      status: "reserved"
    });
  });
  it("requires a subject-bound operator grant to admit an early first purchase", async () => {
    const p = await enrolled("EARLY20", { allow_early_purchase_grants: true });
    const saved = await claim(p.code);
    await pool.query(
      "UPDATE organizations SET trial_plan='team',trial_started_at=now(),trial_ends_at=now()+interval '30 days' WHERE id=$1",
      [org]
    );
    const checkout = createPostgresBillingCheckoutStore(db);
    const request = {
      organization_id: org,
      expected_owner_user_id: owner,
      target_plan: "team" as const,
      expected_offer: {
        claim_id: saved.claim_id,
        version_id: saved.version.version_id,
        expires_at: new Date(Date.now() + 300_000).toISOString()
      },
      parameters: () => ({})
    };
    expect(await checkout.claim(request)).toBe("paid_purchase_locked");
    const benefits = createOfferBenefitStore(db);
    const grant = await benefits.grantEarlyPurchase({
      claim_id: saved.claim_id,
      operator_user_id: operator,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      reason: "Verified early purchase"
    });
    expect(await checkout.claim(request)).toBe("offer_coupon_required");
    await benefits.revokeEarlyPurchase(grant.grant_id);
    expect(await checkout.claim(request)).toBe("paid_purchase_locked");
  });
  it("keeps zero bills pending, retains one draft intent and consumes the first discounted failed invoice", async () => {
    const p = await enrolled();
    const saved = await claim(p.code);
    const a = (
      await pool.query(
        "SELECT id,owner_identity_hash FROM referral_attributions WHERE organization_id=$1",
        [org]
      )
    ).rows[0]!;
    const coupon = `coupon_${p.version.version_id}`;
    await pool.query("UPDATE organizations SET stripe_customer_id='cus_offer' WHERE id=$1", [org]);
    await pool.query("UPDATE offer_claims SET checkout_attempt_id=$2,coupon_id=$3 WHERE id=$1", [
      saved.claim_id,
      randomUUID(),
      coupon
    ]);
    const invoice = {
      invoice_id: "in_offer",
      subscription_id: "sub_offer",
      claim_id: saved.claim_id,
      version_id: saved.version.version_id,
      finalized: true,
      created_at: "2026-11-16T00:00:00.000Z",
      finalized_at: "2026-11-16T00:00:00.000Z" as string | null,
      amount_due_minor: 0,
      base_net_minor: 0,
      applied_coupon_ids: [coupon],
      verified_base_coupon_ids: [coupon]
    };
    const snapshot = {
      organization_external_id: org,
      owner_identity_hash: a.owner_identity_hash as string,
      provider_customer_id: "cus_offer",
      observed_at: "2026-11-16T00:00:00.000Z",
      invoices: [],
      offer_benefit_invoices: [invoice]
    };
    const reconcile = () =>
      runInTransaction(db, (tx) => reconcileOfferInvoiceBenefits(tx, snapshot, false));
    expect(await reconcile()).toBeNull();
    expect((await store.claims.read({ organization_id: org, actor_user_id: owner }))?.status).toBe(
      "reserved"
    );
    Object.assign(invoice, {
      finalized: false,
      finalized_at: null,
      amount_due_minor: 400,
      base_net_minor: 400
    });
    const recovery = await reconcile();
    expect(recovery).toMatchObject({ invoice_id: "in_offer", claim_id: saved.claim_id });
    expect(await reconcile()).toEqual(recovery);
    invoice.finalized = true;
    invoice.finalized_at = "2026-11-16T00:00:00.000Z";
    invoice.verified_base_coupon_ids = [];
    await expect(reconcile()).rejects.toThrow("offer_invoice_discount_unverified");
    invoice.verified_base_coupon_ids = [coupon];
    expect(await reconcile()).toBeNull();
    expect((await store.claims.read({ organization_id: org, actor_user_id: owner }))?.status).toBe(
      "used"
    );
    expect(await reconcile()).toBeNull();
    invoice.invoice_id = "in_second";
    await expect(reconcile()).rejects.toThrow("offer_invoice_benefit_reused");
  });
});
