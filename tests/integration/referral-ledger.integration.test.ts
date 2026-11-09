import { processNextReferralReceiptJob } from "../../apps/worker/src/referral-receipt-processor.js";
import type { StripeBillingProvider } from "../../packages/billing/src/stripe-subscription.js";
import { mockedObject } from "../helpers/vitest.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { assertStorageSchemaMigrationsApplied } from "../../packages/storage/src/schema-migrations.js";
import {
  REFERRAL_LEDGER_MIGRATION,
  referralLedgerSchemaAvailable
} from "../../packages/storage/src/referral-ledger-schema.js";
import { createReferralReconciliationStore } from "../../packages/storage/src/referral-reconciliation-store.js";
import { createWorkerJobStore } from "../../packages/storage/src/worker-job-store.js";
import { createReferralLedgerStore } from "../../packages/storage/src/referral-ledger-store.js";
import { createReferralStore } from "../../packages/storage/src/referral-store.js";
import { REFERRAL_TERMS_VERSION } from "../../packages/referrals/src/referral-contracts.js";
import type { ReferralReceiptSnapshot } from "../../packages/referrals/src/referral-ledger-contracts.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";

runIntegration("immutable referral commissions and manual payout claims", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  const referrals = createReferralStore(db, {
    identityHashSecret: "dedicated-referral-test-secret-at-least-thirty-two"
  });
  const ledger = createReferralLedgerStore(db);
  let org: string,
    partner: string,
    owner: string,
    referral: string,
    hash: string,
    partnerUser: string,
    partnerCode: string;
  function snapshot(overrides: Partial<ReferralReceiptSnapshot> = {}): ReferralReceiptSnapshot {
    return {
      organization_external_id: org,
      owner_identity_hash: hash,
      provider_customer_id: "cus_one",
      observed_at: "2026-12-10T00:00:00.000Z",
      invoices: [
        {
          invoice_id: "in_first",
          currency: "usd",
          lines: [
            {
              id: "il_base",
              plan: "business",
              kind: "plan",
              net_amount_minor: 5310,
              tax_amount_minor: 0,
              service_starts_at: "2026-11-01T00:00:00.000Z",
              service_ends_at: "2026-12-01T00:00:00.000Z"
            }
          ],
          payments: [
            {
              payment_id: "inpay_first",
              cash_minor: 5310,
              collected_at: "2026-11-01T00:00:00.000Z",
              provider_available_at: "2026-11-03T00:00:00.000Z"
            }
          ],
          refunds: [],
          disputed: false
        }
      ],
      ...overrides
    };
  }
  beforeEach(async () => {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
    owner = randomUUID();
    partner = randomUUID();
    org = randomUUID();
    for (const user of [owner, partner])
      await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
        user,
        `${user}@example.test`
      ]);
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan) VALUES($1::uuid,'Prospect',$1::text,'free')",
      [org]
    );
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'owner')",
      [randomUUID(), org, owner]
    );
    const p = await referrals.joinProgram({
      user_id: partner,
      terms_version: REFERRAL_TERMS_VERSION
    });
    partnerUser = partner;
    partnerCode = p.code;
    const a = await referrals.saveAttribution({
      organization_id: org,
      actor_user_id: owner,
      code: p.code,
      source: "manual",
      explicit_correction: false,
      provider_customer_id_checked: null,
      provider_previously_paid: false
    });
    partner = p.partner_id;
    referral = a.referral_id;
    hash = (
      await pool.query("SELECT owner_identity_hash FROM referral_attributions WHERE id=$1", [
        referral
      ])
    ).rows[0].owner_identity_hash as string;
    await pool.query("UPDATE organizations SET stripe_customer_id='cus_one' WHERE id=$1", [org]);
  });
  afterAll(async () => {
    await pool.end();
  });
  it("deduplicates a complete provider snapshot and enforces immutable receipts and ledger entries", async () => {
    expect(await ledger.reconcile(snapshot())).toMatchObject({
      status: "recorded",
      adjustment_minor: 2655
    });
    expect(await ledger.reconcile(snapshot())).toMatchObject({
      status: "duplicate",
      adjustment_minor: 0
    });
    expect(await ledger.balance(partner, "2026-11-15T00:00:00.000Z")).toMatchObject({
      pending_minor: 2655,
      available_minor: 0
    });
    expect(await ledger.balance(partner, "2026-12-01T00:00:00.000Z")).toMatchObject({
      available_minor: 2655
    });
    for (const table of ["referral_receipt_snapshots", "referral_commission_ledger"]) {
      await expect(pool.query(`DELETE FROM ${table}`)).rejects.toThrow(
        "referral_financial_record_immutable"
      );
    }
    expect(
      (
        await pool.query(
          "SELECT provider_invoice_id FROM billing_customer_history WHERE organization_external_id=$1",
          [org]
        )
      ).rows[0]
    ).toEqual({ provider_invoice_id: "in_first" });
  });
  it("derives partner-visible client status and bounded operator balances from the persisted ledger", async () => {
    await ledger.reconcile(snapshot());
    expect(
      await ledger.listPartnerBalances({ now: "2026-12-10T00:00:00.000Z", limit: 25 })
    ).toEqual([
      {
        partner_id: partner,
        code: partnerCode,
        balance: {
          currency: "usd",
          pending_minor: 0,
          available_minor: 2655,
          claimed_minor: 0,
          paid_minor: 0
        }
      }
    ]);
    const clients = await referrals.listPartnerClients({ user_id: partnerUser, limit: 25 });
    expect(clients[0]?.status).toBe(
      Date.now() < Date.parse("2027-11-01T00:00:00.000Z")
        ? "commission_period_active"
        : "commission_period_ended"
    );
  });
  it("uses canonical collection chronology instead of array or webhook order and preserves the original window", async () => {
    const early = snapshot().invoices[0]!;
    const later = {
      ...early,
      invoice_id: "in_later",
      lines: [
        {
          ...early.lines[0]!,
          id: "il_later",
          service_starts_at: "2026-12-01T00:00:00.000Z",
          service_ends_at: "2027-01-01T00:00:00.000Z"
        }
      ],
      payments: [
        {
          ...early.payments[0]!,
          payment_id: "inpay_later",
          collected_at: "2026-12-01T00:00:00.000Z"
        }
      ]
    };
    await ledger.reconcile(snapshot({ invoices: [later, early] }));
    expect(
      (
        await pool.query(
          "SELECT first_paid_service_starts_at::text FROM referral_commission_periods WHERE attribution_id=$1",
          [referral]
        )
      ).rows[0]?.first_paid_service_starts_at
    ).toContain("2026-11-01");
    const yearTwo = {
      ...later,
      invoice_id: "in_year_two",
      lines: [
        {
          ...later.lines[0]!,
          id: "il_year_two",
          service_starts_at: "2027-11-01T00:00:00.000Z",
          service_ends_at: "2027-12-01T00:00:00.000Z"
        }
      ],
      payments: [
        {
          ...later.payments[0]!,
          payment_id: "inpay_year_two",
          collected_at: "2027-11-01T00:00:00.000Z"
        }
      ]
    };
    expect(
      await ledger.reconcile(
        snapshot({ observed_at: "2027-12-10T00:00:00.000Z", invoices: [yearTwo, later, early] })
      )
    ).toMatchObject({ adjustment_minor: 0 });
  });
  it("posts cumulative refund adjustments and retains post-payout negative offsets", async () => {
    await ledger.reconcile(snapshot());
    const batch = await ledger.claim({
      partner_id: partner,
      claim_id: randomUUID(),
      operator_user_id: owner,
      now: "2026-12-10T00:00:00.000Z"
    });
    await ledger.recordPayment({
      batch_id: batch.batch_id,
      external_reference: "manual-bank-transfer-001",
      operator_user_id: owner,
      now: "2026-12-10T00:01:00.000Z"
    });
    const invoice = snapshot().invoices[0]!;
    const updated = snapshot({
      observed_at: "2026-12-11T00:00:00.000Z",
      invoices: [{ ...invoice, refunds: [{ id: "re_full", cash_minor: 5310 }] }]
    });
    expect(await ledger.reconcile(updated)).toMatchObject({ adjustment_minor: -2655 });
    expect(await ledger.balance(partner, "2026-12-12T00:00:00.000Z")).toMatchObject({
      available_minor: -2655,
      paid_minor: 2655
    });
    expect(await ledger.reconcile(updated)).toMatchObject({ adjustment_minor: 0 });
  });
  it("atomically claims one partner/currency balance and keeps uncertain payments claimed", async () => {
    await ledger.reconcile(snapshot());
    const input = { partner_id: partner, operator_user_id: owner, now: "2026-12-10T00:00:00.000Z" };
    const attempts = await Promise.allSettled([
      ledger.claim({ ...input, claim_id: randomUUID() }),
      ledger.claim({ ...input, claim_id: randomUUID() })
    ]);
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const batch = (
      attempts.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<
        Awaited<ReturnType<typeof ledger.claim>>
      >
    ).value;
    expect(await ledger.claim({ ...input, claim_id: batch.batch_id })).toEqual(batch);
    await ledger.markUncertain({
      batch_id: batch.batch_id,
      operator_user_id: owner,
      now: input.now
    });
    await expect(ledger.claim({ ...input, claim_id: randomUUID() })).rejects.toThrow(
      "payout_already_claimed"
    );
    expect(await ledger.balance(partner, input.now)).toMatchObject({
      available_minor: 0,
      claimed_minor: 2655
    });
    expect(
      await ledger.recordPayment({
        batch_id: batch.batch_id,
        external_reference: "external-confirmed-reference",
        operator_user_id: owner,
        now: input.now
      })
    ).toMatchObject({ status: "paid" });
    expect(
      await ledger.recordPayment({
        batch_id: batch.batch_id,
        external_reference: "external-confirmed-reference",
        operator_user_id: owner,
        now: input.now
      })
    ).toMatchObject({ status: "paid" });
    await expect(
      ledger.recordPayment({
        batch_id: batch.batch_id,
        external_reference: "different-reference",
        operator_user_id: owner,
        now: input.now
      })
    ).rejects.toThrow("payout_reference_conflict");
  });
  it("holds disputed earnings and restores them once after a verified resolution", async () => {
    const invoice = snapshot().invoices[0]!;
    await ledger.reconcile(snapshot({ invoices: [{ ...invoice, disputed: true }] }));
    expect(await ledger.balance(partner, "2026-12-10T00:00:00.000Z")).toMatchObject({
      pending_minor: 2655,
      available_minor: 0
    });
    await expect(
      ledger.claim({
        partner_id: partner,
        claim_id: randomUUID(),
        operator_user_id: owner,
        now: "2026-12-10T00:00:00.000Z"
      })
    ).rejects.toThrow("no_available_commission");
    await ledger.reconcile(snapshot({ observed_at: "2026-12-11T00:00:00.000Z" }));
    expect(await ledger.balance(partner, "2026-12-12T00:00:00.000Z")).toMatchObject({
      available_minor: 2655
    });
    expect((await pool.query("SELECT * FROM referral_commission_ledger")).rows).toHaveLength(1);
  });
  it("holds an unverified credit allocation separately from a bank dispute", async () => {
    const invoice = snapshot().invoices[0]!;
    await ledger.reconcile(
      snapshot({ invoices: [{ ...invoice, reconciliation_hold: "credit_allocation_unverified" }] })
    );
    expect(await ledger.balance(partner, "2026-12-10T00:00:00.000Z")).toMatchObject({
      pending_minor: 2655,
      available_minor: 0
    });
    await expect(
      ledger.claim({
        partner_id: partner,
        claim_id: randomUUID(),
        operator_user_id: owner,
        now: "2026-12-10T00:00:00.000Z"
      })
    ).rejects.toThrow("no_available_commission");
    await ledger.reconcile(snapshot({ observed_at: "2026-12-11T00:00:00.000Z" }));
    expect(await ledger.balance(partner, "2026-12-12T00:00:00.000Z")).toMatchObject({
      pending_minor: 0,
      available_minor: 2655
    });
    expect((await pool.query("SELECT * FROM referral_commission_ledger")).rows).toHaveLength(1);
  });
  it("retains financial reconciliation work, freezes identity and holds payouts until completion", async () => {
    await ledger.reconcile(snapshot());
    const receipts = createReferralReconciliationStore(db, {
      identityHashSecret: "dedicated-referral-test-secret-at-least-thirty-two"
    });
    const event = {
      event_id: "evt_refund",
      event_type: "charge.refunded",
      resource_type: "charge" as const,
      resource_id: "ch_one",
      provider_customer_id: "cus_one",
      livemode: false,
      provider_created_at: "2026-12-10T00:00:00.000Z"
    };
    await receipts.capture(event);
    await receipts.capture(event);
    expect((await pool.query("SELECT * FROM referral_reconciliation_events")).rows).toHaveLength(1);
    expect(
      (await pool.query("SELECT * FROM worker_jobs WHERE job_name='reconcile-referral-receipts'"))
        .rows
    ).toHaveLength(1);
    expect(await ledger.balance(partner, "2026-12-12T00:00:00.000Z")).toMatchObject({
      pending_minor: 2655,
      available_minor: 0
    });
    await pool.query("DELETE FROM organizations WHERE id=$1", [org]);
    const retained = await receipts.get("evt_refund");
    expect(retained).toMatchObject({
      organization_external_id: org,
      owner_identity_hash: hash,
      status: "pending"
    });
    expect(JSON.stringify(retained)).not.toContain("@example.test");
    await expect(
      pool.query(
        "UPDATE referral_reconciliation_events SET resource_id='ch_other' WHERE event_id='evt_refund'"
      )
    ).rejects.toThrow("referral_reconciliation_identity_immutable");
    await expect(
      pool.query("DELETE FROM referral_reconciliation_events WHERE event_id='evt_refund'")
    ).rejects.toThrow("referral_reconciliation_identity_immutable");
    await receipts.complete("evt_refund");
    expect(await ledger.balance(partner, "2026-12-12T00:00:00.000Z")).toMatchObject({
      available_minor: 2655
    });
  });
  it("retains failed financial intent after ordinary worker payload expiry and dispatches a new fenced attempt", async () => {
    const receipts = createReferralReconciliationStore(db, {
      identityHashSecret: "dedicated-referral-test-secret-at-least-thirty-two"
    });
    await receipts.capture({
      event_id: "evt_expiry",
      event_type: "invoice.paid",
      resource_type: "invoice",
      resource_id: "in_first",
      provider_customer_id: "cus_one",
      livemode: false,
      provider_created_at: "2026-12-10T00:00:00.000Z"
    });
    await pool.query(
      "UPDATE worker_jobs SET status='failed',payload=NULL,expires_at=now()-interval '1 second' WHERE job_name='reconcile-referral-receipts'"
    );
    await createWorkerJobStore(db).maintain();
    expect(await receipts.dispatchNext()).toBe(true);
    expect(await createWorkerJobStore(db).claim("reconcile-referral-receipts")).not.toBeNull();
    expect(await receipts.get("evt_expiry")).toMatchObject({
      status: "pending",
      organization_external_id: org
    });
  });
  it("does not let an unresolved financial event with unknown customer scope release payouts", async () => {
    await ledger.reconcile(snapshot());
    const receipts = createReferralReconciliationStore(db, {
      identityHashSecret: "dedicated-referral-test-secret-at-least-thirty-two"
    });
    await receipts.capture({
      event_id: "evt_dispute",
      event_type: "charge.dispute.created",
      resource_type: "dispute",
      resource_id: "dp_one",
      provider_customer_id: null,
      livemode: false,
      provider_created_at: "2026-12-10T00:00:00.000Z"
    });
    await expect(
      ledger.claim({
        partner_id: partner,
        claim_id: randomUUID(),
        operator_user_id: owner,
        now: "2026-12-12T00:00:00.000Z"
      })
    ).rejects.toThrow("no_available_commission");
  });
  it("commits the receipt, retained handoff and job together after provider reads", async () => {
    const store = createReferralReconciliationStore(db, {
      identityHashSecret: "dedicated-referral-test-secret-at-least-thirty-two"
    });
    await store.capture({
      event_id: "evt_async",
      event_type: "invoice.paid",
      resource_type: "invoice",
      resource_id: "in_first",
      provider_customer_id: "cus_one",
      livemode: false,
      provider_created_at: "2026-12-10T00:00:00.000Z"
    });
    const result = await processNextReferralReceiptJob({
      db,
      store,
      provider: mockedObject<StripeBillingProvider>({}),
      readCustomer: async () => "cus_one",
      readSnapshot: async () => {
        expect(
          (
            await pool.query(
              "SELECT status FROM worker_jobs WHERE job_name='reconcile-referral-receipts'"
            )
          ).rows[0]?.status
        ).toBe("running");
        return snapshot();
      }
    });
    expect(result.processed).toBe(true);
    expect(await store.get("evt_async")).toMatchObject({ status: "completed" });
    expect(
      (
        await pool.query(
          "SELECT status,payload FROM worker_jobs WHERE job_name='reconcile-referral-receipts'"
        )
      ).rows[0]
    ).toMatchObject({ status: "completed", payload: null });
    expect(await ledger.balance(partner, "2026-12-12T00:00:00.000Z")).toMatchObject({
      available_minor: 2655
    });
  });
  it("fences a stale financial worker after a read and preserves its retained source for recovery", async () => {
    const store = createReferralReconciliationStore(db, {
      identityHashSecret: "dedicated-referral-test-secret-at-least-thirty-two"
    });
    await store.capture({
      event_id: "evt_stale",
      event_type: "invoice.paid",
      resource_type: "invoice",
      resource_id: "in_first",
      provider_customer_id: "cus_one",
      livemode: false,
      provider_created_at: "2026-12-10T00:00:00.000Z"
    });
    await expect(
      processNextReferralReceiptJob({
        db,
        store,
        provider: mockedObject<StripeBillingProvider>({}),
        readCustomer: async () => "cus_one",
        readSnapshot: async () => {
          await pool.query(
            "UPDATE worker_jobs SET lease_token=$1 WHERE job_name='reconcile-referral-receipts'",
            [randomUUID()]
          );
          return snapshot();
        }
      })
    ).rejects.toThrow("referral_reconciliation_unavailable");
    expect((await pool.query("SELECT * FROM referral_commission_ledger")).rows).toHaveLength(0);
    expect(await store.get("evt_stale")).toMatchObject({ status: "pending" });
    await pool.query(
      "UPDATE worker_jobs SET lease_expires_at=now()-interval '1 second' WHERE job_name='reconcile-referral-receipts'"
    );
    await processNextReferralReceiptJob({
      db,
      store,
      provider: mockedObject<StripeBillingProvider>({}),
      readCustomer: async () => "cus_one",
      readSnapshot: async () => snapshot()
    });
    expect(await store.get("evt_stale")).toMatchObject({ status: "completed" });
  });
  it("refuses financial runtime when the retained-source guard is missing despite a complete migration ledger", async () => {
    await pool.query(
      "DROP TRIGGER referral_reconciliation_events_guard ON referral_reconciliation_events"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "referral_reconciliation_schema_incomplete"
    );
  });
  it("keeps financial obligations when the customer and partner identities are deleted", async () => {
    await ledger.reconcile(snapshot());
    await pool.query("DELETE FROM organizations WHERE id=$1", [org]);
    await pool.query("DELETE FROM users WHERE id=$1", [owner]);
    await pool.query(
      "DELETE FROM users WHERE id=(SELECT user_id FROM referral_partners WHERE id=$1)",
      [partner]
    );
    expect(await ledger.balance(partner, "2026-12-10T00:00:00.000Z")).toMatchObject({
      available_minor: 2655
    });
    expect(
      (await pool.query("SELECT count(*)::int AS count FROM billing_customer_history")).rows[0]
        ?.count
    ).toBe(1);
  });
  it("prevents rewriting a claimed amount or a paid external reference in storage", async () => {
    await ledger.reconcile(snapshot());
    const batch = await ledger.claim({
      partner_id: partner,
      claim_id: randomUUID(),
      operator_user_id: owner,
      now: "2026-12-10T00:00:00.000Z"
    });
    await expect(
      pool.query("UPDATE referral_payout_batches SET amount_minor=1 WHERE id=$1", [batch.batch_id])
    ).rejects.toThrow("referral_financial_record_immutable");
    await ledger.recordPayment({
      batch_id: batch.batch_id,
      operator_user_id: owner,
      now: "2026-12-10T00:01:00.000Z",
      external_reference: "confirmed-transfer"
    });
    await expect(
      pool.query("UPDATE referral_payout_batches SET external_reference='replaced' WHERE id=$1", [
        batch.batch_id
      ])
    ).rejects.toThrow("referral_financial_record_immutable");
    await expect(
      pool.query("DELETE FROM referral_payout_batches WHERE id=$1", [batch.batch_id])
    ).rejects.toThrow("referral_financial_record_immutable");
  });
  it("freezes the original service period even against direct storage updates", async () => {
    await ledger.reconcile(snapshot());
    await expect(
      pool.query(
        "UPDATE referral_commission_periods SET first_paid_service_starts_at='2027-01-01' WHERE attribution_id=$1",
        [referral]
      )
    ).rejects.toThrow("referral_financial_record_immutable");
  });
  it("refuses partially present ledger structures even with migration receipts", async () => {
    await pool.query("ALTER TABLE referral_invoice_balances DROP COLUMN payout_held");
    expect(await referralLedgerSchemaAvailable(db)).toBe(false);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "referral_ledger_schema_incomplete"
    );
    const queryable = createQueryable(pool);
    await expect(
      queryable.transaction!(async (tx) => {
        for (const sql of REFERRAL_LEDGER_MIGRATION.statements) await tx.query(sql, []);
      })
    ).rejects.toThrow("referral_ledger_schema_incomplete");
  });
  it.each([
    ["solo", "plan"],
    ["team", "plan"],
    ["solo", "extra_capacity"],
    ["team", "extra_capacity"]
  ] as const)(
    "never converts prior paid %s %s cash into a new Business referral",
    async (plan, kind) => {
      const base = snapshot().invoices[0]!;
      const first = {
        ...base,
        lines: [{ ...base.lines[0]!, plan, kind, net_amount_minor: 1900 }],
        payments: [{ ...base.payments[0]!, cash_minor: 1900 }]
      };
      const business = {
        ...base,
        invoice_id: "in_business",
        lines: [
          {
            ...base.lines[0]!,
            id: "il_business",
            service_starts_at: "2026-12-01T00:00:00.000Z",
            service_ends_at: "2027-01-01T00:00:00.000Z"
          }
        ],
        payments: [
          {
            ...base.payments[0]!,
            payment_id: "inpay_business",
            collected_at: "2026-12-01T00:00:00.000Z"
          }
        ]
      };
      expect(await ledger.reconcile(snapshot({ invoices: [business, first] }))).toMatchObject({
        adjustment_minor: 0
      });
      expect(await ledger.balance(partner, "2027-01-01T00:00:00.000Z")).toMatchObject({
        available_minor: 0,
        pending_minor: 0
      });
    }
  );
  it("does not start or consume the Business referral period with capacity-only cash", async () => {
    const base = snapshot().invoices[0]!;
    const capacity = {
      ...base,
      invoice_id: "in_capacity",
      lines: [
        {
          ...base.lines[0]!,
          id: "il_capacity",
          kind: "extra_capacity" as const,
          net_amount_minor: 299,
          service_starts_at: "2026-10-01T00:00:00.000Z",
          service_ends_at: "2026-11-01T00:00:00.000Z"
        }
      ],
      payments: [
        {
          ...base.payments[0]!,
          payment_id: "inpay_capacity",
          cash_minor: 299,
          collected_at: "2026-10-01T00:00:00.000Z",
          provider_available_at: "2026-10-03T00:00:00.000Z"
        }
      ]
    };
    expect(
      await ledger.reconcile(
        snapshot({ invoices: [capacity], observed_at: "2026-10-10T00:00:00.000Z" })
      )
    ).toMatchObject({ status: "recorded", adjustment_minor: 0 });
    expect(
      (
        await pool.query("SELECT * FROM referral_commission_periods WHERE attribution_id=$1", [
          referral
        ])
      ).rows
    ).toHaveLength(0);
    expect(await ledger.reconcile(snapshot({ invoices: [capacity, base] }))).toMatchObject({
      adjustment_minor: 2655
    });
    expect(
      (
        await pool.query(
          "SELECT first_payment_id,status FROM referral_commission_periods WHERE attribution_id=$1",
          [referral]
        )
      ).rows[0]
    ).toEqual({ first_payment_id: "inpay_first", status: "eligible" });
    expect(
      (
        await pool.query(
          "SELECT provider_invoice_id FROM billing_customer_history WHERE organization_external_id=$1",
          [org]
        )
      ).rows[0]
    ).toEqual({ provider_invoice_id: "in_capacity" });
  });
  it("retains owed financial events and frozen identities while the enrolment secret is missing", async () => {
    const receipts = createReferralReconciliationStore(db, {});
    await receipts.capture({
      event_id: "evt_no_secret",
      event_type: "invoice.paid",
      resource_type: "invoice",
      resource_id: "in_first",
      provider_customer_id: "cus_one",
      livemode: false,
      provider_created_at: "2026-12-10T00:00:00.000Z"
    });
    expect(await receipts.get("evt_no_secret")).toMatchObject({
      organization_external_id: org,
      owner_identity_hash: hash,
      status: "pending"
    });
    expect(
      (await pool.query("SELECT id FROM worker_jobs WHERE job_name='reconcile-referral-receipts'"))
        .rows
    ).toHaveLength(1);
    await pool.query("DELETE FROM organizations WHERE id=$1", [org]);
    expect(await receipts.resolveCustomer("cus_one")).toMatchObject({
      organization_external_id: org,
      owner_identity_hash: hash
    });
  });
  it("does not begin financial capture for an unconfigured programme with no retained attributions or earnings", async () => {
    await pool.query("DELETE FROM referral_attributions WHERE id=$1", [referral]);
    const receipts = createReferralReconciliationStore(db, {});
    await receipts.capture({
      event_id: "evt_unused",
      event_type: "invoice.paid",
      resource_type: "invoice",
      resource_id: "in_first",
      provider_customer_id: "cus_one",
      livemode: false,
      provider_created_at: "2026-12-10T00:00:00.000Z"
    });
    expect(await receipts.get("evt_unused")).toBeNull();
    expect(
      (await pool.query("SELECT id FROM worker_jobs WHERE job_name='reconcile-referral-receipts'"))
        .rows
    ).toHaveLength(0);
  });
});
