import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
import {
  resetOfferIntegrationSchema,
  createOfferTestUser,
  createOfferTestAccount,
  createOfferTestProgramme
} from "../helpers/offer-integration.js";
import { createOfferProgrammeStore } from "../../packages/storage/src/offer-programme-store.js";
import { createPayoutPreferenceStore } from "../../packages/storage/src/payout-preference-store.js";
import { payoutPreferenceSchemaAvailable } from "../../packages/storage/src/payout-preference-schema.js";
import { createReferralLedgerStore } from "../../packages/storage/src/referral-ledger-store.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import { readOfferAccountExport } from "../../packages/storage/src/offer-account-export.js";
import type { ReferralReceiptSnapshot } from "../../packages/referrals/src/referral-ledger-contracts.js";

runIntegration("encrypted creator payout preferences", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  const encryptionKey = Buffer.alloc(32, 19).toString("base64url");
  const store = createPayoutPreferenceStore({ db, encryptionKey });
  const ledger = createReferralLedgerStore(db, { payoutEncryptionKey: encryptionKey });
  const now = "2026-12-10T00:00:00.000Z";
  const programmes = createOfferProgrammeStore(db, {
    identityHashSecret: "payout-preference-test-identity-secret-thirty-two"
  });
  let creator: string, other: string, programmeId: string;
  const details = {
    method: "iban",
    holder: "Private Recipient",
    country: "MT",
    currency: "gbp",
    destination: "DE89370400440532013000"
  };
  beforeEach(async () => {
    await resetOfferIntegrationSchema(db);
    creator = await createOfferTestUser(db);
    other = await createOfferTestUser(db);
    const programme = await createOfferTestProgramme(programmes, other);
    programmeId = programme.programme_id;
    await programmes.creators.join({
      user_id: creator,
      version_id: programme.version_id,
      terms_version: programme.policy.terms_version
    });
  });
  afterAll(async () => pool.end());
  async function earning() {
    const owner = await createOfferTestUser(db),
      org = await createOfferTestAccount(db, owner);
    const profile = await programmes.creators.read(creator);
    await programmes.creators.claimCode({ user_id: creator, code: "PAYMENT20" });
    await programmes.claims.apply({
      organization_id: org,
      actor_user_id: owner,
      code: "PAYMENT20",
      source: "manual",
      explicit_correction: false,
      provider_customer_id_checked: null,
      provider_previously_paid: false
    });
    await db.query("UPDATE organizations SET stripe_customer_id=$2 WHERE id=$1", [
      org,
      `cus_${org}`
    ]);
    const row = (
      await db.query("SELECT owner_identity_hash FROM offer_claims WHERE organization_id=$1", [org])
    ).rows[0]!;
    const facts: ReferralReceiptSnapshot = {
      organization_external_id: org,
      owner_identity_hash: String(row["owner_identity_hash"]),
      provider_customer_id: `cus_${org}`,
      observed_at: "2026-11-16T00:00:00.000Z",
      invoices: [
        {
          invoice_id: `in_${org}`,
          currency: "usd",
          lines: [
            {
              id: "base",
              plan: "team",
              kind: "plan",
              net_amount_minor: 10000,
              tax_amount_minor: 0,
              service_starts_at: "2026-11-01T00:00:00.000Z",
              service_ends_at: "2026-12-01T00:00:00.000Z"
            }
          ],
          payments: [
            {
              payment_id: `pay_${org}`,
              cash_minor: 10000,
              collected_at: "2026-11-02T00:00:00.000Z",
              provider_available_at: "2026-11-04T00:00:00.000Z"
            }
          ],
          refunds: [],
          disputed: false,
          base_discount_minor: 0
        }
      ]
    };
    await ledger.reconcile(facts);
    return { facts, partner: profile!.partner_id, org };
  }
  async function preference() {
    return store.save(creator, { programme_id: programmeId, expected_revision: null, details });
  }
  it("requires the forward schema and saves only encrypted destinations with masked owner reads", async () => {
    expect(await payoutPreferenceSchemaAvailable(db)).toBe(true);
    const saved = await store.save(creator, {
      programme_id: programmeId,
      expected_revision: null,
      details
    });
    expect(saved).toMatchObject({ currency: "gbp", masked_destination: "••••3000" });
    expect(JSON.stringify(await store.list(creator))).not.toContain("Private Recipient");
    expect(JSON.stringify(await store.list(creator))).not.toContain(details.destination);
    const row = (await db.query("SELECT * FROM referral_payout_preferences", [])).rows[0]!;
    expect(JSON.stringify(row)).not.toContain("Private Recipient");
    expect(JSON.stringify(row)).not.toContain(details.destination);
    expect(String(row["encrypted_details"])).toMatch(/^encv1\./);
    expect(await store.list(other)).toEqual([]);
    await expect(
      store.save(other, { programme_id: programmeId, expected_revision: null, details })
    ).rejects.toMatchObject({ code: "payout_programme_not_owned" });
  });
  it("fences concurrent edits and keeps preferences on programme revisions", async () => {
    const first = await store.save(creator, {
      programme_id: programmeId,
      expected_revision: null,
      details
    });
    const edits = await Promise.allSettled(
      ["eur", "cad"].map((currency) =>
        store.save(creator, {
          programme_id: programmeId,
          expected_revision: first.revision,
          details: { ...details, currency }
        })
      )
    );
    expect(edits.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(edits.filter((result) => result.status === "rejected")).toHaveLength(1);
    const profile = (await store.list(creator))[0]!;
    const current = await programmes.creators.read(creator);
    const draft = await programmes.createDraft({
      actor_user_id: other,
      programme_id: programmeId,
      name: "Revised agreement",
      public_description: "Retain payment setup",
      policy: current!.version.policy
    });
    await programmes.bindProvider({
      actor_user_id: other,
      version_id: draft.version_id,
      coupon_id: "new_test_coupon",
      livemode: false
    });
    await programmes.setState({
      actor_user_id: other,
      version_id: draft.version_id,
      expected_state: "draft",
      state: "active",
      acknowledge_unlimited: true
    });
    await programmes.creators.join({
      user_id: creator,
      version_id: draft.version_id,
      terms_version: draft.policy.terms_version
    });
    expect(await store.list(creator)).toEqual([{ ...profile, name: "Revised agreement" }]);
  });
  it("fails closed without an encryption key and refuses unowned programme IDs", async () => {
    await expect(
      createPayoutPreferenceStore({ db }).save(creator, {
        programme_id: programmeId,
        expected_revision: null,
        details
      })
    ).rejects.toMatchObject({ code: "payout_preferences_unavailable" });
    await expect(
      store.save(creator, { programme_id: randomUUID(), expected_revision: null, details })
    ).rejects.toMatchObject({ code: "payout_programme_not_owned" });
  });
  it("freezes exact instructions atomically, retries idempotently and preserves them after future edits", async () => {
    const earned = await earning(),
      saved = await preference();
    const request = {
      partner_id: earned.partner,
      programme_id: programmeId,
      preference_revision: saved.revision,
      claim_id: randomUUID(),
      operator_user_id: other,
      now
    };
    expect(await store.balances(earned.partner, now)).toMatchObject([
      { available_minor: 5000, preference: saved }
    ]);
    const attempts = await Promise.all([ledger.claim(request), ledger.claim(request)]);
    expect(attempts[0]).toEqual(attempts[1]);
    expect(attempts[0]).toMatchObject({ amount_minor: 5000, status: "claimed" });
    await store.save(creator, {
      programme_id: programmeId,
      expected_revision: saved.revision,
      details: {
        method: "wise",
        holder: "Updated Recipient",
        country: "CA",
        currency: "cad",
        destination: "@updated"
      }
    });
    expect(await store.instructions(request.claim_id)).toMatchObject({ details });
    expect(await ledger.claim(request)).toEqual(attempts[0]);
    await expect(ledger.claim({ ...request, preference_revision: randomUUID() })).rejects.toThrow(
      "payout_claim_conflict"
    );
    await expect(ledger.claim({ ...request, claim_id: randomUUID() })).rejects.toThrow(
      "payout_already_claimed"
    );
    await expect(
      db.query("UPDATE referral_payout_instructions SET currency='eur' WHERE batch_id=$1", [
        request.claim_id
      ])
    ).rejects.toThrow("referral_payout_instructions_immutable");
    await expect(
      db.query("DELETE FROM referral_payout_instructions WHERE batch_id=$1", [request.claim_id])
    ).rejects.toThrow("referral_payout_instructions_immutable");
    const exported = await readOfferAccountExport(db, {
      section: "creator_payout_instruction_history",
      user_id: creator,
      organization_id: earned.org,
      as_of: "2027-01-01T00:00:00.000Z",
      after: null,
      limit: 10
    });
    expect(exported.items).toHaveLength(1);
    expect(JSON.stringify(exported)).not.toMatch(/Private Recipient|DE893704|encv1/);
    await ledger.markUncertain({ batch_id: request.claim_id, operator_user_id: other, now });
    await ledger.recordPayment({
      batch_id: request.claim_id,
      operator_user_id: other,
      now,
      external_reference: "manual-verified-001"
    });
    expect(await store.instructions(request.claim_id)).toMatchObject({ details });
    await expect(store.instructions(randomUUID())).rejects.toMatchObject({
      code: "payout_not_found"
    });
  });
  it("rolls back a prepare for missing, stale, damaged or wrongly encrypted preferences and retains holds", async () => {
    const earned = await earning(),
      base = {
        partner_id: earned.partner,
        programme_id: programmeId,
        claim_id: randomUUID(),
        operator_user_id: other,
        now
      };
    await expect(
      ledger.claim({ ...base, preference_revision: randomUUID() })
    ).rejects.toMatchObject({ code: "payout_preferences_required" });
    const saved = await preference();
    await expect(
      ledger.claim({ ...base, preference_revision: randomUUID() })
    ).rejects.toMatchObject({ code: "payout_preferences_changed" });
    const request = { ...base, preference_revision: saved.revision };
    await expect(createReferralLedgerStore(db).claim(request)).rejects.toMatchObject({
      code: "payout_preferences_unavailable"
    });
    await expect(
      createReferralLedgerStore(db, {
        payoutEncryptionKey: Buffer.alloc(32, 21).toString("base64url")
      }).claim(request)
    ).rejects.toThrow();
    await db.query("UPDATE referral_payout_preferences SET currency='eur'", []);
    await expect(ledger.claim(request)).rejects.toMatchObject({
      code: "payout_instructions_unavailable"
    });
    expect((await db.query("SELECT * FROM referral_payout_batches", [])).rows).toHaveLength(0);
    await db.query("UPDATE referral_payout_preferences SET currency='gbp'", []);
    await ledger.reconcile({
      ...earned.facts,
      observed_at: "2026-11-17T00:00:00.000Z",
      invoices: earned.facts.invoices.map((i) => ({ ...i, disputed: true }))
    });
    expect(await store.balances(earned.partner, now)).toMatchObject([{ available_minor: 0 }]);
    await expect(ledger.claim(request)).rejects.toThrow("no_available_commission");
    await expect(
      ledger.claim({
        partner_id: earned.partner,
        claim_id: randomUUID(),
        operator_user_id: other,
        now
      })
    ).rejects.toThrow("no_available_commission");
  });
  it("offsets another programme's refund without mixing positive earnings and fences older writers", async () => {
    const first = await earning(),
      saved = await preference();
    const paid = await ledger.claim({
      partner_id: first.partner,
      programme_id: programmeId,
      preference_revision: saved.revision,
      claim_id: randomUUID(),
      operator_user_id: other,
      now
    });
    await ledger.recordPayment({
      batch_id: paid.batch_id,
      operator_user_id: other,
      now,
      external_reference: "first-programme-manual"
    });
    await ledger.reconcile({
      ...first.facts,
      observed_at: "2026-11-17T00:00:00.000Z",
      invoices: first.facts.invoices.map((i) => ({
        ...i,
        refunds: [{ id: "refund", cash_minor: 4000 }]
      }))
    });
    const second = await createOfferTestProgramme(programmes, other);
    await programmes.creators.join({
      user_id: creator,
      version_id: second.version_id,
      terms_version: second.policy.terms_version
    });
    const secondEarning = await earning();
    const secondPreference = await store.save(creator, {
      programme_id: second.programme_id,
      expected_revision: null,
      details
    });
    expect(await store.balances(first.partner, now)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ programme_id: second.programme_id, available_minor: 3000 })
      ])
    );
    await expect(
      ledger.claim({
        partner_id: first.partner,
        claim_id: randomUUID(),
        operator_user_id: other,
        now
      })
    ).rejects.toThrow("no_available_commission");
    const batch = await ledger.claim({
      partner_id: first.partner,
      programme_id: second.programme_id,
      preference_revision: secondPreference.revision,
      claim_id: randomUUID(),
      operator_user_id: other,
      now
    });
    expect(batch.amount_minor).toBe(3000);
    expect(
      (
        await db.query(
          "SELECT l.amount_minor::text AS amount FROM referral_payout_entries e JOIN referral_commission_ledger l ON l.id=e.ledger_entry_id WHERE e.batch_id=$1 ORDER BY l.amount_minor",
          [batch.batch_id]
        )
      ).rows
    ).toEqual([{ amount: "-2000" }, { amount: "5000" }]);
    // Simulate an old writer trying to add a new programme credit to a batch without a snapshot.
    await ledger.recordPayment({
      batch_id: batch.batch_id,
      operator_user_id: other,
      now,
      external_reference: "second-programme-manual"
    });
    const third = await earning();
    const oldBatch = randomUUID();
    await db.query(
      "INSERT INTO referral_payout_batches(id,partner_id,currency,amount_minor,status,claimed_by,updated_by,claimed_at) VALUES($1,$2,'usd',5000,'claimed',$3,$3,$4)",
      [oldBatch, first.partner, other, now]
    );
    await expect(
      db.query(
        "INSERT INTO referral_payout_entries(batch_id,ledger_entry_id) SELECT $1,id FROM referral_commission_ledger WHERE invoice_id=$2",
        [oldBatch, third.facts.invoices[0]!.invoice_id]
      )
    ).rejects.toThrow("referral_payout_programme_snapshot_required");
    expect(await store.instructions(oldBatch)).toBeNull();
    expect(secondEarning.partner).toBe(first.partner);
  });
  it("fails readiness on missing guards and upgrades an installed schema without changing older checksums", async () => {
    const before = (
      await db.query("SELECT id,checksum FROM storage_migration_ledger ORDER BY id", [])
    ).rows;
    await assertStorageSchemaMigrationsApplied(db);
    await db.query(
      "ALTER TABLE referral_payout_entries DISABLE TRIGGER referral_payout_programme_guard",
      []
    );
    expect(await payoutPreferenceSchemaAvailable(db)).toBe(false);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow();
    await db.query(
      "ALTER TABLE referral_payout_entries ENABLE TRIGGER referral_payout_programme_guard",
      []
    );
    // Only the test-owned disposable database is changed to reproduce an installed pre-upgrade schema.
    await db.query(
      "DROP TRIGGER referral_payout_programme_guard ON referral_payout_entries; DROP TABLE referral_payout_instructions; DROP TABLE referral_payout_preferences; DROP FUNCTION guard_referral_payout_programme(); DROP FUNCTION preserve_referral_payout_instructions(); DELETE FROM storage_migration_ledger WHERE id='202611160002_add_referral_payout_preferences'",
      []
    );
    const existing = await createOfferTestUser(db);
    expect(await payoutPreferenceSchemaAvailable(db)).toBe(false);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow();
    expect((await migrateStorageSchema(db)).applied).toEqual([
      "202611160002_add_referral_payout_preferences"
    ]);
    expect(
      (await db.query("SELECT id,checksum FROM storage_migration_ledger ORDER BY id", [])).rows
    ).toEqual(before);
    expect((await db.query("SELECT id FROM users WHERE id=$1", [existing])).rows).toHaveLength(1);
    await assertStorageSchemaMigrationsApplied(db);
  });
});
