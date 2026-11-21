import { afterAll, beforeAll, expect, it } from "vitest";
import { Pool } from "pg";
import type { FastifyInstance } from "fastify";
import { ReferralVisitReceiptSchema } from "../../packages/referrals/src/referral-visit-contract.js";
import { createReferralPublicReview } from "../../scripts/referral-public-review.js";
import { readReferralAnalytics } from "../../packages/storage/src/referral-analytics-store.js";
import { pruneOfferTransientState } from "../../packages/storage/src/offer-transient-retention.js";
import { REFERRAL_VISIT_MIGRATION } from "../../packages/storage/src/referral-visit-schema.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  dbHost,
  dbPort,
  dbUser,
  dbPassword
} from "../helpers/integration-setup.js";

runIntegration("isolated public referral review", () => {
  const owner = createIntegrationPool();
  let pool: Pool;
  let app: FastifyInstance | undefined;
  beforeAll(async () => {
    if (
      !["postgres", "localhost", "127.0.0.1"].includes(dbHost) ||
      (process.env["REFERRAL_DISPOSABLE_DATABASE"] !== "1" &&
        process.env["PROJECT_SERVICE_DB_COVERAGE"] !== "isolated")
    )
      throw new Error("referral_review_test_requires_isolated_database");
    await owner.query("CREATE DATABASE debugbundle_referral_review");
    pool = new Pool({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
      database: "debugbundle_referral_review"
    });
    app = await createReferralPublicReview(createQueryable(pool));
  });
  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await owner.end();
  });
  it("refuses an everyday database before creating synthetic records", async () => {
    await expect(createReferralPublicReview(createQueryable(owner))).rejects.toThrow(
      "referral_review_database_required"
    );
  });
  it("loads clearly labelled agreed terms through the production public API and exact CORS boundary", async () => {
    const result = await app!.inject({
      url: "/v2/offers/programmes?limit=100",
      headers: { origin: "http://localhost:5292" }
    });
    expect(result.statusCode).toBe(200);
    expect(result.headers["access-control-allow-origin"]).toBe("http://localhost:5292");
    expect(result.headers["access-control-allow-credentials"]).toBe("true");
    expect(result.json()).toMatchObject({
      programmes: [
        {
          name: "Local review referral programme",
          policy: {
            discount_basis_points: 2000,
            commission_basis_points: 5000,
            commission_months: 12,
            eligible_plans: ["solo", "team", "business"],
            terms_version: "local-review-only"
          }
        }
      ]
    });
    expect((await app!.inject({ url: "/v2/offers/context" })).json()).toEqual({ offer: null });
  });
  it("previews a manual code with the actual host cookie without granting account authority", async () => {
    const result = await app!.inject({
      method: "POST",
      url: "/v2/offers/pending",
      headers: { origin: "http://localhost:5292" },
      payload: { code: "review20" }
    });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({ offer: { code: "REVIEW20", available: true } });
    const cookies = [result.headers["set-cookie"]].flat();
    const cookie = String(cookies.at(-1)).split(";")[0]!;
    expect(String(cookies.at(-1))).toContain("HttpOnly");
    expect(
      (await app!.inject({ url: "/v2/offers/context", headers: { cookie } })).json()
    ).toMatchObject({ offer: { code: "REVIEW20", available: true } });
    expect(
      (
        await app!.inject({
          method: "POST",
          url: "/v2/offers/customer",
          headers: { authorization: "Bearer invalid" },
          payload: {}
        })
      ).statusCode
    ).toBe(401);
    expect((await app!.inject({ url: "/v2/offers/operator/programmes" })).statusCode).toBe(404);
  });
  it("counts confirmed visits once and excludes bot, unfenced, and unrelated activity", async () => {
    const url = "/v2/offers/visit/REVIEW20";
    const origin = "http://localhost:5292";
    const landed = await app!.inject({ url });
    expect(landed.headers.location).toBe(`${origin}/?referral_visit=REVIEW20`);
    expect(
      (await app!.inject({ url, headers: { "sec-purpose": "prefetch" } })).headers.location
    ).toBe(`${origin}/`);
    expect((await pool.query("SELECT receipt_id FROM referral_link_visits")).rowCount).toBe(0);

    const capture = {
      method: "POST" as const,
      url: "/v2/offers/visit-receipts",
      payload: { code: "REVIEW20" },
      headers: { origin }
    };
    const preflight = await app!.inject({
      method: "OPTIONS",
      url: capture.url,
      headers: {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type"
      }
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe(origin);
    expect(
      (await app!.inject({ ...capture, headers: { origin: "https://elsewhere.invalid" } }))
        .statusCode
    ).toBe(403);
    expect((await app!.inject({ ...capture, payload: { code: "UNKNOWN20" } })).json()).toEqual({
      visit: null
    });
    const { receipt } = ReferralVisitReceiptSchema.parse(
      (await app!.inject(capture)).json<{ visit: unknown }>().visit
    );
    expect(
      (await app!.inject({ ...capture, payload: { code: "REVIEW20", receipt } })).json().visit
        .receipt
    ).toBe(receipt);

    const confirm = {
      method: "POST" as const,
      url: "/v2/offers/visits",
      payload: { receipt },
      headers: { origin }
    };
    expect(
      (await app!.inject({ ...confirm, headers: { origin, "user-agent": "Googlebot" } })).json()
    ).toEqual({ recorded: false });
    const recorded = await Promise.all([app!.inject(confirm), app!.inject(confirm)]);
    expect(
      recorded.map((response) => response.json<{ recorded: boolean }>().recorded).sort()
    ).toEqual([false, true]);
    const stored = await pool.query<Record<string, unknown>>("SELECT * FROM referral_link_visits");
    expect(stored.rows).toHaveLength(1);
    expect(Object.keys(stored.rows[0]!)).toEqual(["receipt_id", "code_id", "visited_at"]);
    const users = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE email IN ('creator@referral-review.invalid','operator@referral-review.invalid') ORDER BY email"
    );
    const now = new Date(Date.now() + 1_000).toISOString();
    const data = await readReferralAnalytics(createQueryable(pool), users.rows[0]!.id, "7", now);
    expect(data?.totals).toMatchObject({
      visits: 1,
      referred_accounts: 0,
      first_paid_referrals: 0
    });
    expect(data?.daily[0]?.visits).toBeNull();
    expect(data?.daily.at(-1)?.visits).toBe(1);
    expect(
      await readReferralAnalytics(createQueryable(pool), users.rows[1]!.id, "7", now)
    ).toBeNull();
    const expiry = new Date(Date.now() + 91 * 86_400_000).toISOString();
    expect(await pruneOfferTransientState(createQueryable(pool), { now: expiry, limit: 1 })).toBe(
      1
    );
    expect((await pool.query("SELECT receipt_id FROM referral_link_visits")).rowCount).toBe(0);
  });

  it("requires the visit migration on an installed database before runtime readiness", async () => {
    const db = createQueryable(pool);
    await db.query("DROP TABLE referral_link_visits", []);
    await db.query("DELETE FROM storage_migration_ledger WHERE id=$1", [
      REFERRAL_VISIT_MIGRATION.id
    ]);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      REFERRAL_VISIT_MIGRATION.id
    );
    expect((await migrateStorageSchema(db)).applied).toEqual([REFERRAL_VISIT_MIGRATION.id]);
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
  });
  it.each([
    [
      "receipt primary key",
      "ALTER TABLE referral_link_visits DROP CONSTRAINT referral_link_visits_pkey; CREATE INDEX referral_link_visits_pkey ON referral_link_visits(receipt_id)"
    ],
    [
      "creator code reference",
      "ALTER TABLE referral_link_visits DROP CONSTRAINT referral_link_visits_code_id_fkey"
    ]
  ])("rejects a damaged %s before serving requests", async (_constraint, damage) => {
    const db = createQueryable(pool);
    await expect(
      db.transaction!(async (tx) => {
        await tx.query(damage, []);
        await assertStorageSchemaMigrationsApplied(tx);
      })
    ).rejects.toThrow("referral_visit_schema_incomplete");
  });

  it("restarts idempotently without adding another programme", async () => {
    const restarted = await createReferralPublicReview(createQueryable(pool));
    try {
      const data = (await restarted.inject({ url: "/v2/offers/programmes" })).json<{
        programmes: unknown[];
      }>();
      expect(data.programmes).toHaveLength(1);
    } finally {
      await restarted.close();
    }
  });
});
