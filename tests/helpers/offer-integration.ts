import { randomUUID } from "node:crypto";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import type { Queryable } from "../../packages/storage/src/types.js";
import type { OfferPolicy } from "../../packages/referrals/src/programme-policy.js";
export const offerIntegrationPolicy: OfferPolicy = {
  kind: "referral",
  discount_basis_points: 2000,
  eligible_plans: ["solo", "team", "business"],
  eligible_intervals: ["month", "year"],
  commission_basis_points: 5000,
  commission_months: 12,
  claims_start_at: "2026-11-01T00:00:00.000Z",
  claims_end_at: null,
  redeem_by: null,
  max_claims: null,
  allow_early_purchase_grants: false,
  terms_version: "referrals-v2"
};
/** Only the dedicated tmpfs database or the existing explicitly isolated CI
 * database may be reset. RUN_INTEGRATION alone is deliberately insufficient. */
export async function resetOfferIntegrationSchema(db: Queryable): Promise<void> {
  if (
    !["postgres", "127.0.0.1", "localhost"].includes(process.env["DB_HOST"] ?? "") ||
    (process.env["REFERRAL_DISPOSABLE_DATABASE"] !== "1" &&
      process.env["PROJECT_SERVICE_DB_COVERAGE"] !== "isolated")
  )
    throw new Error(
      "offer_integration_requires_disposable_database_use_make_referral_programmes_integration"
    );
  await db.query("DROP SCHEMA public CASCADE", []);
  await db.query("CREATE SCHEMA public", []);
  await bootstrapStorageSchema(db);
  await migrateStorageSchema(db);
}
export async function createOfferTestUser(db: Queryable, verified = true): Promise<string> {
  const id = randomUUID();
  await db.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,$3)", [
    id,
    `${id}@example.test`,
    verified ? new Date().toISOString() : null
  ]);
  return id;
}
export async function createOfferTestAccount(db: Queryable, userId: string): Promise<string> {
  const id = randomUUID();
  await db.query(
    "INSERT INTO organizations(id,name,slug,plan) VALUES($1::uuid,'Offer prospect',$1::text,'free')",
    [id]
  );
  await db.query(
    "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'owner')",
    [randomUUID(), id, userId]
  );
  return id;
}

export async function createOfferTestProgramme(
  store: import("../../packages/storage/src/offer-programme-store.js").OfferProgrammeStore,
  operator: string,
  policy: OfferPolicy = offerIntegrationPolicy
): Promise<import("../../packages/referrals/src/programme-policy.js").ProgrammeVersion> {
  const draft = await store.createDraft({
    actor_user_id: operator,
    name: "Launch referrals",
    public_description: "20% off your first invoice",
    policy
  });
  await store.bindProvider({
    actor_user_id: operator,
    version_id: draft.version_id,
    coupon_id: `coupon_${draft.version_id}`,
    livemode: false
  });
  return store.setState({
    actor_user_id: operator,
    version_id: draft.version_id,
    expected_state: "draft",
    state: "active",
    acknowledge_unlimited: true
  });
}
