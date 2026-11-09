import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { resetReportRunFixture } from "../helpers/report-runs.js";
import { createBusinessAccountExportStore } from "../../packages/storage/src/business-account-export.js";
import { createAccountDeletionStore } from "../../packages/storage/src/account-deletion-store.js";
import { createWorkerJobStore } from "../../packages/storage/src/worker-job-store.js";
import { createReferralStore } from "../../packages/storage/src/referral-store.js";
import { createReferralBenefitStore } from "../../packages/storage/src/referral-benefit-store.js";
import { REFERRAL_TERMS_VERSION } from "../../packages/referrals/src/referral-contracts.js";
import { createReferralLedgerStore } from "../../packages/storage/src/referral-ledger-store.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
runIntegration("bounded Business account export", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    exports = createBusinessAccountExportStore(db);
  let f: Awaited<ReturnType<typeof resetReportRunFixture>>;
  beforeEach(async () => {
    f = await resetReportRunFixture(pool, db);
  });
  afterAll(async () => {
    await pool.end();
  });
  const read = (section: Parameters<typeof exports.read>[0]["query"]["section"], cursor?: string) =>
    exports.read({
      organization_id: f.org,
      user_id: f.owner,
      query: { section, limit: 1, ...(cursor ? { cursor } : {}) }
    });
  it("exports definitions and paged runs through the current actual reader without internal keys or model receipts", async () => {
    const first = await f.admit();
    const second = await f.admit();
    await pool.query(
      "UPDATE report_runs SET created_at=CASE WHEN id=$1 THEN '2026-11-01T00:00:00.000123Z'::timestamptz ELSE '2026-11-01T00:00:00.000456Z'::timestamptz END WHERE id=ANY($2::uuid[])",
      [first.id, [first.id, second.id]]
    );
    expect((await read("report_definitions"))?.items).toHaveLength(1);
    const page = await read("report_runs");
    expect(page?.items).toHaveLength(1);
    expect(page?.next_cursor).toEqual(expect.any(String));
    const next = await read("report_runs", page!.next_cursor!);
    expect(next?.items).toHaveLength(1);
    expect(next?.next_cursor).toBeNull();
    expect(new Set([...page!.items, ...next!.items].map((r) => r["id"]))).toEqual(
      new Set([first.id, second.id])
    );
    expect(JSON.stringify(page)).not.toMatch(
      /object_key|ai_profile|initiating_authority|lease_token|provider_response_id/
    );
    await expect(read("report_lifecycle", page!.next_cursor!)).rejects.toThrow(
      "invalid_account_export_cursor"
    );
  });
  it("bounds numeric lifecycle pages, respects twelve-month retention and excludes another account", async () => {
    for (let i = 0; i < 3; i++)
      await pool.query(
        "INSERT INTO report_lifecycle_facts(project_id,source_type,source_id,transition,to_status,severity,occurred_at) VALUES($1,'incident',$2,'resolved','resolved','high',now())",
        [f.project, randomUUID()]
      );
    await pool.query(
      "INSERT INTO report_lifecycle_facts(project_id,source_type,source_id,transition,to_status,severity,occurred_at) VALUES($1,'incident',$2,'resolved','resolved','high',now()-interval '13 months')",
      [f.project, randomUUID()]
    );
    const ids = new Set<string>();
    let cursor: string | undefined;
    for (let i = 0; i < 4; i++) {
      const page = await read("report_lifecycle", cursor);
      expect(page!.items.length).toBeLessThanOrEqual(1);
      for (const row of page!.items) {
        expect(row["project_id"]).toBe(f.project);
        ids.add(String(row["id"]));
      }
      if (!page!.next_cursor) break;
      cursor = page!.next_cursor;
    }
    expect(ids.size).toBe(3);
    await pool.query("UPDATE organization_members SET suspended_at=now() WHERE user_id=$1", [
      f.owner
    ]);
    expect(await read("report_lifecycle")).toBeNull();
  });
  it("requires the current Owner even when an administrator can read the selected project", async () => {
    await pool.query("UPDATE organization_members SET role='admin' WHERE user_id=$1", [f.owner]);
    expect(await read("report_runs")).toBeNull();
  });
  it("does not expose a different user's personal referral identity or accounting", async () => {
    const stranger = randomUUID();
    await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
      stranger,
      `${stranger}@example.test`
    ]);
    await pool.query(
      "INSERT INTO referral_partners(id,user_id,code,terms_version,identity_hash,commission_basis_points) VALUES($1,$2,'FOREIGNABC','test',$3,5000)",
      [randomUUID(), stranger, "a".repeat(64)]
    );
    expect((await read("referral_partner"))?.items).toEqual([]);
  });
  it("pages microsecond health observations without repeating a row and preserves coverage", async () => {
    for (const at of ["2026-11-01T00:00:00.000123Z", "2026-11-01T00:00:00.000456Z"])
      await pool.query(
        "INSERT INTO report_health_recoveries(project_id,result_id,check_id,occurred_at) VALUES($1,$2,$3,$4)",
        [f.project, randomUUID(), randomUUID(), at]
      );
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() - 5000);
    try {
      const first = await read("report_health"),
        second = await read("report_health", first!.next_cursor!);
      expect(first!.items).toHaveLength(1);
      expect(first!.next_cursor).not.toBeNull();
      expect(second!.items).toHaveLength(1);
      expect(first!.items[0]!["result_id"]).not.toBe(second!.items[0]!["result_id"]);
      expect(second!.next_cursor).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it("pages retained availability, coverage and closed delivery metadata", async () => {
    const run = await f.admit();
    for (let i = 0; i < 2; i++) {
      await pool.query(
        "INSERT INTO report_availability_days(project_id,check_id,day,total_checks,successful_checks,failed_checks,degraded_checks,downtime_seconds,source_updated_at) VALUES($1,$2,current_date,6,5,1,0,60,now())",
        [f.project, randomUUID()]
      );
      await pool.query(
        "INSERT INTO report_email_deliveries(id,organization_id,run_id,recipient_user_id,expected_ready_sha256,provider_message_id,send_deadline_at,expires_at,created_at) VALUES($1,$2,$3,$4,$5,'private_provider_receipt',now()+interval '1 hour',now()+interval '1 day',$6)",
        [
          randomUUID(),
          f.org,
          i === 0 ? run.id : (await f.admit()).id,
          f.owner,
          "a".repeat(64),
          i === 0 ? "2026-11-01T00:00:00.000123Z" : "2026-11-01T00:00:00.000456Z"
        ]
      );
    }
    for (const section of ["report_availability", "report_deliveries"] as const) {
      const first = await read(section),
        second = await read(section, first!.next_cursor!);
      expect(first!.items).toHaveLength(1);
      expect(second!.items).toHaveLength(1);
      expect(second!.next_cursor).toBeNull();
      expect(first!.items[0]).not.toEqual(second!.items[0]);
      expect(JSON.stringify([first, second])).not.toMatch(
        /private_provider_receipt|provider_message_id|attempt_id|job_id|ready_sha256/
      );
    }
    expect((await read("report_coverage"))!.items).toEqual([
      expect.objectContaining({ project_id: f.project, lifecycle_started_at: expect.any(String) })
    ]);
  });
  it("exports the actual partner's finances without protected customer/provider identities", async () => {
    const otherUser = randomUUID(),
      otherOrg = randomUUID();
    await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
      otherUser,
      `${otherUser}@example.test`
    ]);
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan) VALUES($1::uuid,'Private client',$1::text,'free')",
      [otherOrg]
    );
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'owner')",
      [randomUUID(), otherOrg, otherUser]
    );
    const refs = createReferralStore(db, {
        identityHashSecret: "account-export-financial-test-secret-thirty-two"
      }),
      partner = await refs.joinProgram({ user_id: f.owner, terms_version: REFERRAL_TERMS_VERSION });
    const attributed = await refs.saveAttribution({
      organization_id: otherOrg,
      actor_user_id: otherUser,
      code: partner.code,
      source: "manual",
      explicit_correction: false,
      provider_customer_id_checked: null,
      provider_previously_paid: false
    });
    await pool.query(
      "UPDATE organizations SET stripe_customer_id='cus_private_client' WHERE id=$1",
      [otherOrg]
    );
    const hash = String(
      (
        await pool.query("SELECT owner_identity_hash FROM referral_attributions WHERE id=$1", [
          attributed.referral_id
        ])
      ).rows[0].owner_identity_hash
    );
    const ledger = createReferralLedgerStore(db);
    await ledger.reconcile({
      organization_external_id: otherOrg,
      owner_identity_hash: hash,
      provider_customer_id: "cus_private_client",
      observed_at: new Date().toISOString(),
      invoices: [
        {
          invoice_id: "in_private_client",
          currency: "usd",
          lines: [
            {
              id: "il_private",
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
              payment_id: "pay_private",
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
    const personal = await read("referral_partner"),
      commissions = await read("referral_commissions");
    expect(personal!.items[0]).toMatchObject({
      partner_id: partner.partner_id,
      balance: { pending_minor: 2655 }
    });
    expect(commissions!.items[0]).toMatchObject({
      client_id: attributed.referral_id,
      amount_minor: "2655"
    });
    expect(JSON.stringify([personal, commissions])).not.toMatch(
      /cus_private_client|in_private_client|pay_private|owner_identity_hash|identity_hash|Private client/
    );
    expect(JSON.stringify([personal, commissions])).not.toContain(hash);
    expect(JSON.stringify([personal, commissions])).not.toContain(otherOrg);
    expect((await read("referral_payouts"))!.items).toEqual([]);
    expect((await read("customer_referral"))!.items).toEqual([]);
  });
  it("removes report data and stops pending mail through actual account deletion while retaining the minimum financial marker", async () => {
    const run = await f.admit(),
      partnerUser = randomUUID();
    await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
      partnerUser,
      `${partnerUser}@example.test`
    ]);
    const refs = createReferralStore(db, {
        identityHashSecret: "account-export-lifecycle-test-secret-thirty-two"
      }),
      partner = await refs.joinProgram({
        user_id: partnerUser,
        terms_version: REFERRAL_TERMS_VERSION
      });
    const attribution = await refs.saveAttribution({
      organization_id: f.org,
      actor_user_id: f.owner,
      code: partner.code,
      source: "manual",
      explicit_correction: false,
      provider_customer_id_checked: null,
      provider_previously_paid: false
    });
    await createReferralBenefitStore(db).reserveCheckout({
      organization_id: f.org,
      actor_user_id: f.owner,
      attribution_id: attribution.referral_id,
      checkout_attempt_id: randomUUID(),
      coupon_id: "coupon_retained"
    });
    await pool.query(
      "INSERT INTO report_health_recoveries(project_id,result_id,check_id,occurred_at) VALUES($1,$2,$3,now())",
      [f.project, randomUUID(), randomUUID()]
    );
    await pool.query(
      "INSERT INTO report_lifecycle_facts(project_id,source_type,source_id,transition,to_status,severity,occurred_at) VALUES($1,'incident',$2,'resolved','resolved','high',now())",
      [f.project, randomUUID()]
    );
    const delivery = randomUUID(),
      job = await createWorkerJobStore(db).enqueue("deliver-smart-report-email", {
        delivery_id: delivery
      });
    await pool.query(
      "INSERT INTO report_email_deliveries(id,organization_id,run_id,recipient_user_id,job_id,expected_ready_sha256,send_deadline_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '1 hour',now()+interval '1 day')",
      [delivery, f.org, run.id, f.owner, job, "a".repeat(64)]
    );
    const deleted = await createAccountDeletionStore(db).deleteAccountForOrganization({
      organization_id: f.org,
      user_id: f.owner,
      deleted_at: new Date().toISOString()
    });
    expect(deleted).toMatchObject({ organization_id: f.org, user_deleted: true });
    for (const table of [
      "report_definitions",
      "report_runs",
      "report_collection_coverage",
      "report_lifecycle_facts",
      "report_health_recoveries",
      "report_email_deliveries"
    ]) {
      expect((await pool.query(`SELECT * FROM ${table}`)).rows).toHaveLength(0);
    }
    expect(
      (await pool.query("SELECT status,payload FROM worker_jobs WHERE id=$1", [job])).rows[0]
    ).toMatchObject({ status: "skipped", payload: null });
    expect(
      (
        await pool.query("SELECT organization_id FROM referral_attributions WHERE id=$1", [
          attribution.referral_id
        ])
      ).rows[0].organization_id
    ).toBeNull();
    expect(
      (await pool.query("SELECT owner_identity_hash,coupon_id FROM referral_invoice_benefits"))
        .rows[0]
    ).toMatchObject({
      owner_identity_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      coupon_id: "coupon_retained"
    });
    expect(await read("report_runs")).toBeNull();
  });
});
