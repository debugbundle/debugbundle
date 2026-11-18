import { afterAll, beforeEach, expect, it, vi } from "vitest";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
import {
  resetOfferIntegrationSchema,
  createOfferTestProgramme
} from "../helpers/offer-integration.js";
import { creatorEmailFixture } from "../helpers/creator-email-integration.js";
import {
  createCreatorEmailStore,
  scheduleCreatorDigests
} from "../../packages/storage/src/creator-email-store.js";
import { deliverCreatorEmail } from "../../packages/referrals/src/creator-email-delivery.js";
import { ReportEmailTransportError } from "../../packages/email/src/ses-transport.js";
import {
  creatorEmailSchemaAvailable,
  CREATOR_EMAIL_MIGRATION
} from "../../packages/storage/src/creator-email-schema.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";

runIntegration("creator referral emails", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  let f: Awaited<ReturnType<typeof creatorEmailFixture>>;
  beforeEach(async () => {
    await resetOfferIntegrationSchema(db);
    f = await creatorEmailFixture(db);
  });
  afterAll(async () => pool.end());
  const rows = async (kind?: string) =>
    (
      await db.query(
        "SELECT * FROM referral_creator_email_deliveries WHERE ($1::text IS NULL OR kind=$1) ORDER BY created_at,id",
        [kind ?? null]
      )
    ).rows;
  function delivery(send = vi.fn().mockResolvedValue({ provider_message_id: "mail_fixture" })) {
    const store = createCreatorEmailStore(db);
    return {
      store,
      send,
      process: () =>
        deliverCreatorEmail({
          store,
          transport: { send },
          appBaseUrl: "https://app.example.test",
          publicBaseUrl: "https://example.test"
        })
    };
  }
  it("atomically confirms one accepted revision despite concurrent duplicate joins", async () => {
    const input = {
      user_id: f.creator,
      version_id: f.version.version_id,
      terms_version: f.version.policy.terms_version
    };
    await Promise.all([f.programmes.creators.join(input), f.programmes.creators.join(input)]);
    expect(await rows("joined")).toHaveLength(1);
    await expect(
      f.programmes.creators.join({ ...input, terms_version: "wrong" })
    ).rejects.toBeDefined();
    expect(await rows()).toHaveLength(1);
    expect((await rows())[0]!["payload"]).toMatchObject({
      kind: "joined",
      name: f.version.name,
      commission_basis_points: 5000
    });
  });
  it("celebrates once per programme, not per customer, retry or renewal", async () => {
    const a = await f.purchase(),
      b = await f.purchase();
    await Promise.all([f.settle(a), f.settle(b)]);
    await f.settle(a);
    const renewal = structuredClone(a.invoices[0]!);
    renewal.invoice_id = "in_renewal";
    renewal.payments[0]!.payment_id = "pay_renewal";
    renewal.payments[0]!.collected_at = new Date(
      Date.parse(a.observed_at) + 86400000
    ).toISOString();
    await f.settle({
      ...a,
      observed_at: renewal.payments[0]!.collected_at,
      invoices: [...a.invoices, renewal]
    });
    expect(await rows("first_purchase")).toHaveLength(1);
    expect((await db.query("SELECT * FROM referral_creator_email_events", [])).rows).toHaveLength(
      2
    );
  });
  it("confirms a newly accepted revision without resetting the programme's celebration", async () => {
    await f.settle(await f.purchase());
    const revision = await f.programmes.createDraft({
      actor_user_id: f.operator,
      programme_id: f.version.programme_id,
      name: "Revised creators",
      public_description: "New terms",
      policy: { ...f.version.policy, terms_version: "new-terms" }
    });
    await f.programmes.bindProvider({
      actor_user_id: f.operator,
      version_id: revision.version_id,
      coupon_id: "coupon_revision",
      livemode: false
    });
    const active = await f.programmes.setState({
      actor_user_id: f.operator,
      version_id: revision.version_id,
      expected_state: "draft",
      state: "active",
      acknowledge_unlimited: true
    });
    await f.settle(await f.purchase(active));
    expect(await rows("joined")).toHaveLength(2);
    expect(await rows("first_purchase")).toHaveLength(1);
    expect(
      (
        await db.query(
          "SELECT * FROM referral_creator_email_events WHERE NOT first_in_programme",
          []
        )
      ).rows
    ).toHaveLength(1);
  });
  it("does not celebrate zero-cash, fully refunded, disputed or pre-rollout purchases", async () => {
    for (const kind of ["zero", "refund", "dispute", "old"]) {
      const s = await f.purchase();
      const invoice = s.invoices[0]!;
      if (kind === "zero") invoice.payments = [];
      if (kind === "refund") invoice.refunds = [{ id: "re_full", cash_minor: 1520 }];
      if (kind === "dispute") invoice.disputed = true;
      if (kind === "old") invoice.payments[0]!.collected_at = "2026-01-01T00:00:00.000Z";
      await f.settle(s);
    }
    expect(await rows("first_purchase")).toEqual([]);
  });
  it("combines subsequent new customers across programmes in one UTC digest and stays quiet otherwise", async () => {
    await f.settle(await f.purchase());
    await f.settle(await f.purchase());
    const second = await createOfferTestProgramme(f.programmes, f.operator);
    await f.settle(await f.purchase(second));
    await f.settle(await f.purchase(second));
    expect(await rows("first_purchase")).toHaveLength(2);
    expect(await scheduleCreatorDigests(db)).toBe(0);
    await db.query(
      "UPDATE referral_creator_email_events SET created_at=(date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-interval '12 hours' WHERE NOT first_in_programme",
      []
    );
    await db.query(
      "UPDATE referral_creator_email_state SET digest_window_end=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' WHERE id",
      []
    );
    await Promise.all([scheduleCreatorDigests(db), scheduleCreatorDigests(db)]);
    const digests = await rows("daily_digest");
    expect(digests).toHaveLength(1);
    expect(digests[0]!["payload"]).toMatchObject({
      total_referrals: 2,
      total_commission_minor: 1520,
      sections: expect.any(Array)
    });
    expect((digests[0]!["payload"] as { sections: unknown[] }).sections).toHaveLength(2);
    await scheduleCreatorDigests(db);
    expect(await rows("daily_digest")).toHaveLength(1);
  });
  it("seals digest windows only after event writers commit", async () => {
    await f.settle(await f.purchase());
    await f.settle(await f.purchase());
    await db.query(
      "UPDATE referral_creator_email_state SET digest_window_end=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' WHERE id",
      []
    );
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query("SELECT id FROM referral_creator_email_state WHERE id FOR SHARE");
      await connection.query(
        "UPDATE referral_creator_email_events SET created_at=(date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-interval '12 hours' WHERE NOT first_in_programme"
      );
      expect(await scheduleCreatorDigests(db)).toBe(0);
      await connection.query("COMMIT");
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
    }
    expect(await scheduleCreatorDigests(db)).toBe(1);
    expect(await rows("daily_digest")).toHaveLength(1);
  });
  it("suppresses a delayed digest when no referral remains inside the last 24 hours", async () => {
    await f.settle(await f.purchase());
    await f.settle(await f.purchase());
    await db.query(
      "UPDATE referral_creator_email_events SET created_at=(date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-interval '24 hours' WHERE NOT first_in_programme",
      []
    );
    await db.query(
      "UPDATE referral_creator_email_state SET digest_window_end=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' WHERE id",
      []
    );
    await scheduleCreatorDigests(db);
    await db.query(
      "UPDATE referral_creator_email_deliveries SET status='sent',sent_at=clock_timestamp() WHERE kind<>'daily_digest'",
      []
    );
    const d = delivery();
    await d.process();
    expect(d.send).not.toHaveBeenCalled();
    expect((await rows("daily_digest"))[0]!["reason"]).toBe("no_recent_referrals");
  });
  it("delivers a recent daily summary to the creator once with its programme section", async () => {
    await f.settle(await f.purchase());
    await f.settle(await f.purchase());
    // Keep the event inside the closed window independently of Postgres's
    // microseconds and the JavaScript window boundary's millisecond precision.
    await db.query(
      "UPDATE referral_creator_email_events SET created_at=clock_timestamp()-interval '1 minute' WHERE NOT first_in_programme",
      []
    );
    await db.query(
      "UPDATE referral_creator_email_state SET digest_window_end=clock_timestamp() WHERE id",
      []
    );
    expect(await scheduleCreatorDigests(db)).toBe(1);
    await db.query(
      "UPDATE referral_creator_email_deliveries SET status='sent',sent_at=clock_timestamp() WHERE kind<>'daily_digest'",
      []
    );
    const d = delivery();
    await d.process();
    await d.process();
    expect(d.send).toHaveBeenCalledOnce();
    expect(d.send.mock.calls[0]![0]).toMatchObject({
      to: [`${f.creator}@example.test`],
      subject: "Your referral day: 1 new paying customer"
    });
    expect(d.send.mock.calls[0]![0].text).toContain(f.version.name);
    expect(d.send.mock.calls[0]![0].text).toContain("$7.60");
    expect((await rows("daily_digest"))[0]!["status"]).toBe("sent");
  });
  it("bounds known-rejection retries without silently reopening failed mail", async () => {
    const d = delivery(vi.fn().mockRejectedValue(new ReportEmailTransportError("rejected")));
    for (let i = 0; i < 5; i++) {
      await db.query(
        "UPDATE referral_creator_email_deliveries SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE status='queued'",
        []
      );
      await d.process();
    }
    await d.process();
    expect(d.send).toHaveBeenCalledTimes(5);
    expect((await rows())[0]!["status"]).toBe("failed");
  });
  it("sends to the verified creator, once, outside database transactions", async () => {
    const d = delivery();
    await Promise.all([d.process(), d.process()]);
    expect(d.send).toHaveBeenCalledOnce();
    expect(d.send.mock.calls[0]![0].to).toEqual([`${f.creator}@example.test`]);
    expect((await rows())[0]!["status"]).toBe("sent");
  });
  it("reclaims preparation before sending but rejects the stale claim token", async () => {
    const store = createCreatorEmailStore(db),
      old = await store.claim();
    expect(old).not.toBeNull();
    await db.query(
      "UPDATE referral_creator_email_deliveries SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
      [old!.id]
    );
    const current = await store.claim();
    expect(current!.token).not.toBe(old!.token);
    expect(await store.start(old!)).toBeNull();
    expect(await store.start(current!)).toBe(`${f.creator}@example.test`);
    await store.finish(current!, { state: "sent", provider_message_id: "mail_fenced" });
    await store.finish(old!, { state: "uncertain" });
    expect((await rows())[0]!["status"]).toBe("sent");
  });
  it("expires stale mail and rejects malformed persisted payloads without sending", async () => {
    const d = delivery();
    await db.query("UPDATE referral_creator_email_deliveries SET payload='{}'::jsonb", []);
    await d.process();
    expect(d.send).not.toHaveBeenCalled();
    expect((await rows())[0]!["status"]).toBe("failed");
    const v = await createOfferTestProgramme(f.programmes, f.operator);
    await f.programmes.creators.join({
      user_id: f.creator,
      version_id: v.version_id,
      terms_version: v.policy.terms_version
    });
    await db.query(
      "UPDATE referral_creator_email_deliveries SET created_at=clock_timestamp()-interval '8 days' WHERE status='queued'",
      []
    );
    await d.process();
    expect(d.send).not.toHaveBeenCalled();
    expect((await rows()).some((r) => r["reason"] === "notification_expired")).toBe(true);
  });
  it("excludes provider identifiers, payloads and another creator from personal mail exports", async () => {
    const { readOfferAccountExport } =
      await import("../../packages/storage/src/offer-account-export.js");
    const { createOfferTestAccount } = await import("../helpers/offer-integration.js");
    const org = await createOfferTestAccount(db, f.creator);
    const output = await readOfferAccountExport(db, {
      section: "creator_email_history",
      user_id: f.creator,
      organization_id: org,
      as_of: new Date(Date.now() + 60000).toISOString(),
      after: null,
      limit: 100
    });
    expect(output.items).toHaveLength(1);
    expect(JSON.stringify(output)).not.toMatch(
      /provider_message_id|dedupe_key|payload|recipient|OWEN20|MAIL20/
    );
    const other = await readOfferAccountExport(db, {
      section: "creator_email_history",
      user_id: f.operator,
      organization_id: org,
      as_of: new Date().toISOString(),
      after: null,
      limit: 100
    });
    expect(other.items).toEqual([]);
  });
  it("retries explicit provider rejection, but holds an ambiguous acknowledgement", async () => {
    const d = delivery(
      vi
        .fn()
        .mockRejectedValueOnce(new ReportEmailTransportError("rejected"))
        .mockResolvedValue({ provider_message_id: "mail_retry" })
    );
    await d.process();
    expect((await rows())[0]!["status"]).toBe("queued");
    await db.query(
      "UPDATE referral_creator_email_deliveries SET next_attempt_at=clock_timestamp()-interval '1 second'",
      []
    );
    await d.process();
    expect(d.send).toHaveBeenCalledTimes(2);
    expect((await rows())[0]!["status"]).toBe("sent");
    const v = await createOfferTestProgramme(f.programmes, f.operator);
    await f.programmes.creators.join({
      user_id: f.creator,
      version_id: v.version_id,
      terms_version: v.policy.terms_version
    });
    const uncertain = delivery(
      vi.fn().mockRejectedValue(new ReportEmailTransportError("uncertain"))
    );
    await uncertain.process();
    await uncertain.process();
    expect(uncertain.send).toHaveBeenCalledOnce();
    expect((await rows()).some((r) => r["status"] === "uncertain")).toBe(true);
  });
  it("rejects invalid rendering configuration before any provider send", async () => {
    const d = delivery();
    await deliverCreatorEmail({
      store: d.store,
      transport: { send: d.send },
      appBaseUrl: "javascript:invalid",
      publicBaseUrl: "https://example.test"
    });
    expect(d.send).not.toHaveBeenCalled();
    expect((await rows())[0]!["reason"]).toBe("rejected");
  });
  it("never resends after provider acceptance followed by lost persistence", async () => {
    const d = delivery();
    vi.spyOn(d.store, "finish").mockRejectedValueOnce(new Error("lost DB ack"));
    await expect(d.process()).rejects.toThrow("lost DB ack");
    await db.query(
      "UPDATE referral_creator_email_deliveries SET lease_until=clock_timestamp()-interval '1 second' WHERE status='sending'",
      []
    );
    await d.process();
    expect(d.send).toHaveBeenCalledOnce();
    expect((await rows())[0]!["status"]).toBe("uncertain");
  });
  it.each(["unverified", "unlinked"])("suppresses delivery for an %s creator", async (kind) => {
    const d = delivery();
    if (kind === "unverified")
      await db.query("UPDATE users SET email_verified_at=NULL WHERE id=$1", [f.creator]);
    else await db.query("UPDATE referral_partners SET user_id=NULL WHERE id=$1", [f.partner]);
    await d.process();
    expect(d.send).not.toHaveBeenCalled();
    expect((await rows())[0]!["status"]).toBe("skipped");
  });
  it("uses a real installed migration and rejects missing required schema", async () => {
    expect(await creatorEmailSchemaAvailable(db)).toBe(true);
    await db.query(
      "DROP TABLE referral_creator_email_events,referral_creator_email_deliveries,referral_creator_email_state",
      []
    );
    await db.query("DELETE FROM storage_migration_ledger WHERE id=$1", [
      CREATOR_EMAIL_MIGRATION.id
    ]);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(/missing_migrations/);
    expect((await migrateStorageSchema(db)).applied).toContain(CREATOR_EMAIL_MIGRATION.id);
    await assertStorageSchemaMigrationsApplied(db);
    await db.query("DROP INDEX referral_creator_email_first_idx", []);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "creator_email_schema_incomplete"
    );
  });
});
