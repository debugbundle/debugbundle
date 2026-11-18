import { afterAll, beforeAll, expect, it } from "vitest";
import { Pool } from "pg";
import type { FastifyInstance } from "fastify";
import { createReferralPublicReview } from "../../scripts/referral-public-review.js";
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
