import { REPORT_COLLECTOR_MIGRATION } from "../../packages/storage/src/report-collector-schema.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { createReportDefinitionStore } from "../../packages/storage/src/report-definition-store.js";
import { REPORT_DEFINITION_MIGRATION } from "../../packages/storage/src/report-definition-schema.js";
import { REPORT_SOURCE_TEXT_MIGRATION } from "../../packages/storage/src/report-source-text-schema.js";
import { REPORT_AVAILABILITY_MIGRATION } from "../../packages/storage/src/report-availability-schema.js";
import { REPORT_RUN_MIGRATION } from "../../packages/storage/src/report-run-schema.js";
import { REPORT_EMAIL_MIGRATION } from "../../packages/storage/src/report-email-schema.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
runIntegration("organisation report definitions", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    store = createReportDefinitionStore(db);
  let org: string, project: string, owner: string, admin: string;
  const actor = (user_id: string) => ({
    version: 1 as const,
    kind: "browser_session" as const,
    user_id
  });
  const definition = () => ({
    name: "Monthly review",
    cadence: "monthly" as const,
    project_ids: [project],
    recipient_user_ids: [],
    schedule: { time: "09:00", timezone: "UTC" },
    enabled: true,
    source_collection_consent: true
  });
  const create = (request_id = randomUUID(), name = "Monthly review") =>
    store.create({
      organization_id: org,
      initiator: actor(admin),
      request_id,
      definition: { ...definition(), name }
    });
  beforeEach(async () => {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    [org, project, owner, admin] = Array.from({ length: 4 }, () => randomUUID()) as [
      string,
      string,
      string,
      string
    ];
    for (const user of [owner, admin])
      await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
        user,
        `${user}@example.test`
      ]);
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan,additional_capacity_units) VALUES($1::uuid,'Reports',$1::text,'business',99)",
      [org]
    );
    for (const user of [owner, admin])
      await pool.query(
        "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,$4)",
        [randomUUID(), org, user, user === owner ? "owner" : "member"]
      );
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Project',$1::text)",
      [project, org, owner]
    );
    await pool.query(
      "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'admin')",
      [randomUUID(), project, admin]
    );
  });
  afterAll(async () => {
    await pool.end();
  });
  it("saves explicit full scope/consent and recovers a lost acknowledgement without creating another schedule", async () => {
    const request = randomUUID(),
      saved = await create(request);
    expect(saved).toMatchObject({
      organization_id: org,
      name: "Monthly review",
      version: 1,
      privacy_mode: "full",
      source_collection_consent: true,
      scope: [{ project_id: project, origin_project_ids: [project] }]
    });
    expect(saved.next_due_at).not.toBeNull();
    expect(saved.next_period_ends_at).not.toBeNull();
    expect((await create(request)).id).toBe(saved.id);
    await expect(create(request, "Different command")).rejects.toThrow("report_request_conflict");
    expect((await pool.query("SELECT * FROM report_definitions")).rows).toHaveLength(1);
  });
  it("serialises the five-definition organisation cap without multiplying it by capacity", async () => {
    for (let index = 0; index < 4; index++) await create(randomUUID(), `Report ${index}`);
    const outcomes = await Promise.allSettled([
      create(randomUUID(), "Fifth"),
      create(randomUUID(), "Sixth")
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect((await pool.query("SELECT * FROM report_definitions")).rows).toHaveLength(5);
  });
  it("fences stale edits and validates current project authority before a replacement", async () => {
    const saved = await create();
    await expect(
      store.replace({
        organization_id: org,
        initiator: actor(admin),
        id: saved.id,
        definition: { ...definition(), expected_version: 2 }
      })
    ).rejects.toThrow("report_version_conflict");
    const updated = await store.replace({
      organization_id: org,
      initiator: actor(admin),
      id: saved.id,
      definition: { ...definition(), name: "Updated", expected_version: 1 }
    });
    expect(updated).toMatchObject({ version: 2, name: "Updated" });
    await pool.query("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2", [
      project,
      admin
    ]);
    await expect(
      store.replace({
        organization_id: org,
        initiator: actor(admin),
        id: saved.id,
        definition: { ...definition(), expected_version: 2 }
      })
    ).rejects.toThrow("forbidden");
    expect(
      await store.get({ organization_id: org, initiator: actor(admin), id: saved.id })
    ).toBeNull();
  });
  it("pauses on plan loss and requires explicit Owner review after re-upgrade", async () => {
    const saved = await create();
    await pool.query("UPDATE organizations SET plan='team' WHERE id=$1", [org]);
    await pool.query("UPDATE organizations SET plan='business' WHERE id=$1", [org]);
    const paused = await store.get({ organization_id: org, initiator: actor(owner), id: saved.id });
    expect(paused).toMatchObject({ requires_owner_review: true, pause_reason: "plan_lost" });
    await expect(
      store.replace({
        organization_id: org,
        initiator: actor(admin),
        id: saved.id,
        definition: {
          ...definition(),
          expected_version: paused!.version,
          resume_after_review: true
        }
      })
    ).rejects.toThrow("forbidden");
    const resumed = await store.replace({
      organization_id: org,
      initiator: actor(owner),
      id: saved.id,
      definition: { ...definition(), expected_version: paused!.version, resume_after_review: true }
    });
    expect(resumed).toMatchObject({ requires_owner_review: false, pause_reason: null });
  });
  it("rejects new hosted definitions outside Business and a mismatched expected workspace", async () => {
    await expect(
      store.create({
        organization_id: org,
        initiator: actor(admin),
        request_id: randomUUID(),
        definition: { ...definition(), expected_organization_id: randomUUID() }
      })
    ).rejects.toThrow("organization_context_changed");
    await pool.query("UPDATE organizations SET plan='team' WHERE id=$1", [org]);
    await expect(create()).rejects.toThrow("upgrade_required");
  });
  it.each(["deletion", "transfer"])(
    "removes dependent definition data on project %s without changing other workspaces",
    async (action) => {
      await create();
      if (action === "deletion") await pool.query("DELETE FROM projects WHERE id=$1", [project]);
      else {
        const destination = randomUUID();
        await pool.query(
          "INSERT INTO organizations(id,name,slug,plan) VALUES($1::uuid,'Destination',$1::text,'business')",
          [destination]
        );
        await pool.query("UPDATE projects SET organization_id=$2 WHERE id=$1", [
          project,
          destination
        ]);
      }
      expect((await pool.query("SELECT * FROM report_definitions")).rows).toHaveLength(0);
      expect(
        (await pool.query("SELECT id FROM organizations WHERE id=$1", [org])).rows
      ).toHaveLength(1);
    }
  );
  it("keeps legacy weekly delivery unchanged and requires an explicit overlap choice", async () => {
    const channel = randomUUID();
    await pool.query(
      `INSERT INTO weekly_report_channels(id,project_id,channel,config,schedule_day_of_week,schedule_hour_of_day,schedule_timezone,is_enabled)
      VALUES($1,$2,'email','{}',1,9,'UTC',true)`,
      [channel, project]
    );
    const weekly = { ...definition(), cadence: "weekly" as const };
    await expect(
      store.create({
        organization_id: org,
        initiator: actor(admin),
        request_id: randomUUID(),
        definition: weekly
      })
    ).rejects.toThrow("weekly_overlap_confirmation_required");
    await store.create({
      organization_id: org,
      initiator: actor(admin),
      request_id: randomUUID(),
      definition: { ...weekly, weekly_overlap: "keep_existing" }
    });
    expect(
      (
        await pool.query<{ is_enabled: boolean }>(
          "SELECT is_enabled FROM weekly_report_channels WHERE id=$1",
          [channel]
        )
      ).rows[0]?.is_enabled
    ).toBe(true);
  });
  it("refuses recipients without verified whole-scope access and rechecks that access on edit", async () => {
    const recipient = randomUUID();
    await pool.query("INSERT INTO users(id,email) VALUES($1,$2)", [
      recipient,
      `${recipient}@example.test`
    ]);
    const request = {
      organization_id: org,
      initiator: actor(admin),
      request_id: randomUUID(),
      definition: { ...definition(), recipient_user_ids: [recipient] }
    };
    await expect(store.create(request)).rejects.toThrow("invalid_report_recipient");
    await pool.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [recipient]);
    await expect(store.create(request)).rejects.toThrow("invalid_report_recipient");
    await pool.query(
      "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'viewer')",
      [randomUUID(), project, recipient]
    );
    const saved = await store.create(request);
    await pool.query("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2", [
      project,
      recipient
    ]);
    await expect(
      store.replace({
        ...request,
        id: saved.id,
        definition: { ...request.definition, expected_version: 1 }
      })
    ).rejects.toThrow("invalid_report_recipient");
  });
  it("permits retained reads and version-fenced removal after downgrade", async () => {
    const saved = await create();
    await pool.query("UPDATE organizations SET plan='team' WHERE id=$1", [org]);
    const rows = await store.list({ organization_id: org, initiator: actor(admin) });
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("initiating_authority");
    await expect(
      store.remove({
        organization_id: org,
        initiator: actor(admin),
        id: saved.id,
        expected_version: 1
      })
    ).rejects.toThrow("report_version_conflict");
    expect(
      await store.remove({
        organization_id: org,
        initiator: actor(admin),
        id: saved.id,
        expected_version: rows[0]!.version
      })
    ).toBe(true);
    expect(
      await store.get({ organization_id: org, initiator: actor(admin), id: saved.id })
    ).toBeNull();
  });
  it("uses the forward migration and rejects a disabled safety trigger even with a matching ledger", async () => {
    await migrateStorageSchema(db);
    await pool.query("DROP TRIGGER organizations_report_plan_guard ON organizations");
    await pool.query("DROP TRIGGER projects_report_delete_guard ON projects");
    await pool.query(
      "DROP FUNCTION debugbundle_pause_report_definitions(),debugbundle_delete_source_report_definitions()"
    );
    await pool.query(
      "DROP TABLE report_collection_progress,report_email_deliveries,report_runs,report_collection_coverage,report_source_text,report_definitions"
    );
    await pool.query("DELETE FROM storage_migration_ledger WHERE id=ANY($1::text[])", [
      [
        REPORT_DEFINITION_MIGRATION.id,
        REPORT_SOURCE_TEXT_MIGRATION.id,
        REPORT_AVAILABILITY_MIGRATION.id,
        REPORT_RUN_MIGRATION.id,
        REPORT_EMAIL_MIGRATION.id,
        REPORT_COLLECTOR_MIGRATION.id
      ]
    ]);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "storage_schema_missing_migrations"
    );
    expect((await migrateStorageSchema(db)).applied).toEqual([
      REPORT_DEFINITION_MIGRATION.id,
      REPORT_SOURCE_TEXT_MIGRATION.id,
      REPORT_AVAILABILITY_MIGRATION.id,
      REPORT_RUN_MIGRATION.id,
      REPORT_EMAIL_MIGRATION.id,
      REPORT_COLLECTOR_MIGRATION.id
    ]);
    await create();
    expect((await migrateStorageSchema(db)).applied).toEqual([]);
    await pool.query("ALTER TABLE organizations DISABLE TRIGGER organizations_report_plan_guard");
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "report_definition_schema_incomplete"
    );
  });
});
