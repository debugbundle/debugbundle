import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { processNextSmartReportJob } from "../../apps/worker/src/smart-report-processor.js";
import { createReportContentStore } from "../../packages/storage/src/report-content-store.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import {
  migrateStorageSchema,
  assertStorageSchemaMigrationsApplied
} from "../../packages/storage/src/schema-migrations.js";
import { BUSINESS_TRIAL_MIGRATION } from "../../packages/storage/src/business-trial-schema.js";
import { REPORT_TRIAL_COLLECTION_MIGRATION } from "../../packages/storage/src/report-trial-collection-schema.js";
import { createPostgresBillingStore } from "../../packages/storage/src/billing-store.js";
import { createReportDefinitionStore } from "../../packages/storage/src/report-definition-store.js";
import { createReportRunAdmissionStore } from "../../packages/storage/src/report-run-admission.js";
import { reportModelProfile } from "../../packages/smart-reports/src/model-request.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
runIntegration("Business no-card trial lifecycle", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  const billing = createPostgresBillingStore(db);
  let org: string, owner: string, project: string;
  beforeEach(async () => {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
    [org, owner, project] = [randomUUID(), randomUUID(), randomUUID()];
    await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
      owner,
      `${owner}@example.test`
    ]);
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan,billing_interval,billing_allowance_anchor_at) VALUES($1::uuid,'Trial',$1::text,'free','year','2024-01-31')",
      [org]
    );
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'owner')",
      [randomUUID(), org, owner]
    );
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Trial project',$1::text)",
      [project, org, owner]
    );
  });
  afterAll(async () => {
    await pool.end();
  });
  const trial = () =>
    billing.startTrialForOrganization({
      organization_id: org,
      target_plan: "business",
      started_at: "2026-10-25T00:00:00.000Z",
      ends_at: "2026-11-24T00:00:00.000Z"
    });
  it("serialises one-time admission, exposes Business and retains the full thirty-day allowance across a calendar boundary", async () => {
    const result = await Promise.all([trial(), trial()]);
    expect(result.filter((value) => value === "trial_unavailable")).toHaveLength(1);
    expect(result.find((value) => typeof value !== "string")).toMatchObject({
      plan: "business",
      capacity_units: { included: 30, additional_purchased: 0 },
      trial: { plan: "business", active: true }
    });
    expect(
      (
        await pool.query(
          "SELECT stripe_customer_id,stripe_subscription_id,billing_interval FROM organizations WHERE id=$1",
          [org]
        )
      ).rows[0]
    ).toEqual({ stripe_customer_id: null, stripe_subscription_id: null, billing_interval: null });
    const summary = await billing.getBillingSummaryForOrganization({
      organization_id: org,
      now: "2026-11-01T00:00:00.000Z"
    });
    expect(new Date(summary!.usage_window.starts_at).toISOString()).toBe(
      "2026-10-25T00:00:00.000Z"
    );
    expect(new Date(summary!.usage_window.ends_at).toISOString()).toBe("2026-11-24T00:00:00.000Z");
    expect(
      (await pool.query("SELECT COUNT(*)::int AS n FROM referral_commission_ledger")).rows[0]?.n
    ).toBe(0);
  });
  it("shares forty admissions and the normal AI budget, then refuses generation at the deadline before cleanup", async () => {
    await trial();
    const initiator = { version: 1 as const, kind: "browser_session" as const, user_id: owner };
    const definition = await createReportDefinitionStore(db).create({
      organization_id: org,
      initiator,
      request_id: randomUUID(),
      definition: {
        name: "Trial review",
        cadence: "weekly",
        project_ids: [project],
        source_collection_consent: true,
        enabled: false
      }
    });
    const store = createReportRunAdmissionStore(db, {
      profile: reportModelProfile("gpt-6.1-terra")
    });
    const admit = () =>
      store.admit({
        organization_id: org,
        initiator,
        request_id: randomUUID(),
        definition_id: definition.id,
        expected_version: 1,
        period: {
          kind: "weekly",
          starts_at: "2026-10-26T00:00:00.000Z",
          ends_at: "2026-11-02T00:00:00.000Z",
          duration_days: 7
        },
        kind: "manual"
      });
    for (let i = 0; i < 40; i++) await admit();
    await expect(admit()).rejects.toThrow("report_quota_exhausted");
    expect(
      (
        await pool.query(
          "SELECT generations,held_nano_usd,spent_nano_usd FROM report_allowance_windows WHERE organization_id=$1",
          [org]
        )
      ).rows[0]
    ).toMatchObject({ generations: 40, held_nano_usd: "990000000", spent_nano_usd: "0" });
    await pool.query(
      "UPDATE organizations SET trial_ends_at=now()-interval '1 second' WHERE id=$1",
      [org]
    );
    await expect(admit()).rejects.toThrow("upgrade_required");
    const expired = await billing.expireTrialForOrganization({
      organization_id: org,
      now: new Date().toISOString()
    });
    expect(expired).toMatchObject({
      plan: "free",
      trial: { plan: "business", active: false, available: false }
    });
    expect(await trial()).toBe("trial_unavailable");
  });
  it("requires the additive trial-plan migration and rejects a missing ledger row", async () => {
    await pool.query("DELETE FROM storage_migration_ledger WHERE id=$1", [
      BUSINESS_TRIAL_MIGRATION.id
    ]);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "storage_schema_missing_migrations"
    );
    expect((await migrateStorageSchema(db)).applied).toEqual([BUSINESS_TRIAL_MIGRATION.id]);
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
  });
  it("fails readiness for missing trial-collection migration or a disabled deadline trigger", async () => {
    await pool.query("DELETE FROM storage_migration_ledger WHERE id=$1", [
      REPORT_TRIAL_COLLECTION_MIGRATION.id
    ]);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "storage_schema_missing_migrations"
    );
    expect((await migrateStorageSchema(db)).applied).toEqual([
      REPORT_TRIAL_COLLECTION_MIGRATION.id
    ]);
    await pool.query(
      "ALTER TABLE organizations DISABLE TRIGGER organizations_report_trial_collection_epoch"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "report_trial_collection_schema_incomplete"
    );
    await pool.query(
      "ALTER TABLE organizations ENABLE TRIGGER organizations_report_trial_collection_epoch"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
  });
  it("preserves the Owner's generated archive after trial expiry without generating another report", async () => {
    await trial();
    const initiator = { version: 1 as const, kind: "browser_session" as const, user_id: owner };
    const definition = await createReportDefinitionStore(db).create({
      organization_id: org,
      initiator,
      request_id: randomUUID(),
      definition: {
        name: "Trial archive",
        cadence: "weekly",
        project_ids: [project],
        source_collection_consent: true,
        enabled: false
      }
    });
    const run = await createReportRunAdmissionStore(db, { profile: null }).admit({
      organization_id: org,
      initiator,
      request_id: randomUUID(),
      definition_id: definition.id,
      expected_version: 1,
      period: {
        kind: "weekly",
        starts_at: "2026-10-26T00:00:00.000Z",
        ends_at: "2026-11-02T00:00:00.000Z",
        duration_days: 7
      },
      kind: "manual"
    });
    const saved = new Map<string, Buffer>(),
      objects = {
        putObject: async (input: { key: string; body: Buffer }) => {
          saved.set(input.key, input.body);
        },
        getObject: async (input: { key: string }) => {
          const value = saved.get(input.key);
          if (!value) throw new Error("missing");
          return value;
        }
      };
    await processNextSmartReportJob({ db, objects, model: null });
    const content = createReportContentStore(db, objects),
      input = { organization_id: org, id: run.id, initiator },
      before = await content.read(input);
    await pool.query(
      "UPDATE organizations SET trial_ends_at=now()-interval '1 second' WHERE id=$1",
      [org]
    );
    await billing.expireTrialForOrganization({
      organization_id: org,
      now: new Date().toISOString()
    });
    expect(await content.read(input)).toEqual(before);
    expect(
      (
        await pool.query(
          "SELECT generations,spent_nano_usd FROM report_allowance_windows WHERE organization_id=$1",
          [org]
        )
      ).rows[0]
    ).toEqual({ generations: 1, spent_nano_usd: "0" });
  });
});
