import { afterAll, beforeEach, expect, it } from "vitest";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
import {
  resetOfferIntegrationSchema,
  createOfferTestUser,
  offerIntegrationPolicy
} from "../helpers/offer-integration.js";
import { createOfferProgrammeStore } from "../../packages/storage/src/offer-programme-store.js";
import { OFFER_PUBLICATION_MIGRATION } from "../../packages/storage/src/offer-publication-migration.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import { defaultPromotionCode } from "../../packages/referrals/src/programme-lifecycle.js";

runIntegration("installed promotion publication upgrade", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  const store = createOfferProgrammeStore(db, {
    identityHashSecret: "publication-integration-identity-secret-at-least-32"
  });
  let operator: string;
  beforeEach(async () => {
    await resetOfferIntegrationSchema(db);
    operator = await createOfferTestUser(db);
    await db.query("DELETE FROM storage_migration_ledger WHERE id=$1", [
      OFFER_PUBLICATION_MIGRATION.id
    ]);
  });
  afterAll(async () => {
    await pool.end();
  });
  const draft = (programmeId?: string) =>
    store.createDraft({
      actor_user_id: operator,
      ...(programmeId ? { programme_id: programmeId } : {}),
      name: "Existing promotion",
      public_description: "Already approved offer",
      policy: { ...offerIntegrationPolicy, kind: "promotion", commission_basis_points: 0 }
    });
  const oldActivation = async (version: Awaited<ReturnType<typeof draft>>) => {
    await store.bindProvider({
      actor_user_id: operator,
      version_id: version.version_id,
      coupon_id: `coupon_${version.version_id}`,
      livemode: false
    });
    await db.query("UPDATE offer_programme_versions SET state='active' WHERE id=$1", [
      version.version_id
    ]);
    await db.query("UPDATE offer_programmes SET current_version_id=$2 WHERE id=$1", [
      version.programme_id,
      version.version_id
    ]);
  };
  it.each(["existing ledger", "missing ledger"])(
    "repairs installed publication with %s, preserves provider bindings and is idempotent",
    async (ledger) => {
      const original = await draft();
      await oldActivation(original);
      const revised = await draft(original.programme_id);
      await oldActivation(revised);
      const blocked = await draft();
      await store.createPromotionCode({
        actor_user_id: operator,
        version_id: blocked.version_id,
        code: "BLOCKED20"
      });
      await oldActivation(blocked);
      await db.query("UPDATE offer_codes SET blocked=true WHERE version_id=$1", [
        blocked.version_id
      ]);
      const bindings = (
        await db.query("SELECT * FROM offer_provider_bindings ORDER BY version_id", [])
      ).rows;
      if (ledger === "missing ledger") await db.query("DELETE FROM storage_migration_ledger", []);
      await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
        "storage_schema_missing_migrations"
      );
      expect((await migrateStorageSchema(db)).applied).toEqual([OFFER_PUBLICATION_MIGRATION.id]);
      await assertStorageSchemaMigrationsApplied(db);
      expect((await store.getVersion(original.version_id)).state).toBe("ended");
      expect((await store.getVersion(revised.version_id)).policy).toEqual(revised.policy);
      expect(await store.publicPromotion()).toMatchObject({
        code: defaultPromotionCode(revised.version_id),
        version: { version_id: revised.version_id },
        available: true
      });
      expect(
        (
          await db.query("SELECT code,blocked FROM offer_codes WHERE version_id=$1", [
            blocked.version_id
          ])
        ).rows
      ).toEqual([{ code: "BLOCKED20", blocked: true }]);
      expect(
        (await db.query("SELECT * FROM offer_provider_bindings ORDER BY version_id", [])).rows
      ).toEqual(bindings);
      const codes = (await db.query("SELECT * FROM offer_codes ORDER BY id", [])).rows;
      expect((await migrateStorageSchema(db)).applied).toEqual([]);
      expect((await db.query("SELECT * FROM offer_codes ORDER BY id", [])).rows).toEqual(codes);
    }
  );
  it("rolls back the publication repair on a reserved-code collision rather than changing ownership", async () => {
    const existing = await draft(),
      target = await draft();
    await store.createPromotionCode({
      actor_user_id: operator,
      version_id: existing.version_id,
      code: defaultPromotionCode(target.version_id)
    });
    await oldActivation(target);
    await expect(migrateStorageSchema(db)).rejects.toThrow();
    expect(
      (
        await db.query("SELECT version_id FROM offer_codes WHERE code=$1", [
          defaultPromotionCode(target.version_id)
        ])
      ).rows
    ).toEqual([{ version_id: existing.version_id }]);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "storage_schema_missing_migrations"
    );
  });
  it.each(["future", "expired", "capped", "blocked"])(
    "hides a %s promotion from the anonymous banner",
    async (reason) => {
      const version = await store.createDraft({
        actor_user_id: operator,
        name: "Availability",
        public_description: "Availability check",
        policy: {
          ...offerIntegrationPolicy,
          kind: "promotion",
          commission_basis_points: 0,
          claims_start_at:
            reason === "future" ? "2099-01-01T00:00:00.000Z" : "2020-01-01T00:00:00.000Z",
          claims_end_at: reason === "expired" ? "2021-01-01T00:00:00.000Z" : null,
          max_claims: 1
        }
      });
      await store.bindProvider({
        actor_user_id: operator,
        version_id: version.version_id,
        coupon_id: "availability_coupon",
        livemode: false
      });
      await store.setState({
        actor_user_id: operator,
        version_id: version.version_id,
        expected_state: "draft",
        state: "scheduled",
        acknowledge_unlimited: false
      });
      if (reason === "capped")
        await db.query("UPDATE offer_programme_versions SET claims_count=1 WHERE id=$1", [
          version.version_id
        ]);
      if (reason === "blocked") {
        await db.query("UPDATE offer_codes SET blocked=true WHERE version_id=$1", [
          version.version_id
        ]);
        await store.setState({
          actor_user_id: operator,
          version_id: version.version_id,
          expected_state: "scheduled",
          state: "paused",
          acknowledge_unlimited: false
        });
        await store.setState({
          actor_user_id: operator,
          version_id: version.version_id,
          expected_state: "paused",
          state: "active",
          acknowledge_unlimited: false
        });
        expect(
          (await db.query("SELECT code FROM offer_codes WHERE version_id=$1", [version.version_id]))
            .rows
        ).toHaveLength(1);
      }
      expect(await store.publicPromotion()).toBeNull();
    }
  );
  it("serialises competing revision activations so exactly one revision remains live", async () => {
    const first = await draft(),
      second = await draft(first.programme_id);
    for (const version of [first, second])
      await store.bindProvider({
        actor_user_id: operator,
        version_id: version.version_id,
        coupon_id: `coupon_${version.version_id}`,
        livemode: false
      });
    await Promise.all(
      [first, second].map((version) =>
        store.setState({
          actor_user_id: operator,
          version_id: version.version_id,
          expected_state: "draft",
          state: "active",
          acknowledge_unlimited: true
        })
      )
    );
    const states = await Promise.all([first, second].map((v) => store.getVersion(v.version_id)));
    expect(states.filter((v) => v.state === "active")).toHaveLength(1);
    expect(states.filter((v) => v.state === "ended")).toHaveLength(1);
    expect(await store.publicPromotion()).toMatchObject({
      version: { version_id: states.find((v) => v.state === "active")!.version_id }
    });
  });
});
