import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import type { AnalyticsMeasurementPlan } from "../../packages/shared-types/src/index.js";
import { stableJson } from "../../packages/event-normalizer/src/canonical-json.js";
import { createAnalyticsMeasurementPlanStore } from "../../packages/storage/src/analytics-measurement-plan-store.js";
import { createAnalyticsProjectCatalogStore } from "../../packages/storage/src/analytics-project-catalog-store.js";
import { createPostgresAnalyticsSavedFunnelStore } from "../../packages/storage/src/analytics-saved-funnel-store.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("project semantic measurement plans", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const store = createAnalyticsMeasurementPlanStore(db);
  let projectId: string;
  let ownerUserId: string;

  beforeEach(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
    projectId = randomUUID();
    ({ ownerUserId } = await seedOwnedProject({
      pool,
      organizationId: randomUUID(),
      projectId,
      organizationName: "Plan",
      organizationSlug: "plan",
      projectName: "Service",
      projectSlug: "service",
      organizationPlan: "team"
    }));
  });
  afterAll(async () => pool.end());

  const plan = (): AnalyticsMeasurementPlan => ({
    scope: { kind: "project", project_id: projectId },
    expected_revision: 0,
    idempotency_key: randomUUID(),
    enforcement: "strict",
    catalog: [
      {
        name: "signup.completed",
        revision: 1,
        description: "Confirmed signup",
        producers: ["server"],
        purpose: "business_measurement",
        success_boundary: "committed",
        properties: {},
        measurements: {},
        expected_producers: []
      }
    ],
    reports: [
      {
        kind: "goal",
        key: "signup_goal",
        revision: 1,
        display_name: "Signups",
        scope: { kind: "project", project_id: projectId },
        subject: "user",
        timezone: "UTC",
        predicate: { field: "event_name", operator: "in", values: ["signup.completed"] },
        denominator: null,
        breakdown: null
      }
    ]
  });

  async function seedSourceCatalog(): Promise<number> {
    const catalog = createAnalyticsProjectCatalogStore(db);
    const current = await catalog.read({ actorUserId: ownerUserId, projectId });
    if (current !== null) return current.catalog_revision;
    const input = {
      actorUserId: ownerUserId,
      projectId,
      expectedRevision: 0,
      idempotencyKey: randomUUID(),
      entries: plan().catalog
    };
    const preview = await catalog.preview(input);
    if (preview.kind !== "preview") throw new Error("source catalog fixture rejected");
    const applied = await catalog.apply({
      ...input,
      previewHash: preview.preview.preview_hash
    });
    if (applied.kind !== "applied") throw new Error("source catalog fixture not applied");
    return applied.catalog.catalog_revision;
  }

  async function seedStoredSpaceReportSlot(): Promise<string> {
    const spaceId = randomUUID();
    const organizationId = (
      await pool.query<{ organization_id: string }>(
        "SELECT organization_id FROM projects WHERE id=$1::uuid",
        [projectId]
      )
    ).rows[0]!.organization_id;
    const catalogRevision = await seedSourceCatalog();
    await pool.query(
      `INSERT INTO analytics_spaces(id,organization_id,display_name,mode,revision)
       VALUES($1::uuid,$2::uuid,'Stored report','portfolio',1)`,
      [spaceId, organizationId]
    );
    await pool.query(
      "INSERT INTO analytics_space_projects(project_id,space_id) VALUES($1::uuid,$2::uuid)",
      [projectId, spaceId]
    );
    const report = { ...plan().reports[0]!, scope: { kind: "space", space_id: spaceId } };
    await pool.query(
      `INSERT INTO analytics_space_plans(
         space_id,revision,space_revision,content_hash,catalog,reports,source_catalog_revisions,coverage)
       VALUES($1::uuid,1,1,$2,$3::jsonb,$4::jsonb,$5::jsonb,'[]'::jsonb)`,
      [
        spaceId,
        "a".repeat(64),
        JSON.stringify(plan().catalog),
        JSON.stringify([report]),
        JSON.stringify([{ project_id: projectId, catalog_revision: catalogRevision }])
      ]
    );
    return spaceId;
  }

  it("previews without writes, applies catalog and reports atomically, and replays safely", async () => {
    const input = plan();
    const preview = await store.preview({ actorUserId: ownerUserId, plan: input });
    expect(preview.kind).toBe("preview");
    if (preview.kind !== "preview") throw new Error("fixture plan rejected");
    expect(preview.preview).toMatchObject({
      expected_revision: 0,
      resulting_revision: 1,
      catalog_revision: 1,
      added_reports: ["signup_goal"],
      removed_reports: [],
      changed_reports: [],
      already_applied: false
    });
    expect((await pool.query("SELECT count(*) FROM analytics_project_plans")).rows[0]?.count).toBe(
      "0"
    );
    const applied = await store.apply({
      actorUserId: ownerUserId,
      plan: input,
      previewHash: preview.preview.preview_hash
    });
    expect(applied.kind).toBe("applied");
    if (applied.kind !== "applied") throw new Error("fixture apply rejected");
    expect(applied.replayed).toBe(false);
    expect(applied.plan).toMatchObject({ revision: 1, catalog_revision: 1 });
    expect(applied.plan.catalog).toEqual(input.catalog);
    expect(applied.plan.reports[0]?.available_from).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect((await store.read({ projectId, actorUserId: ownerUserId }))?.reports).toEqual(
      applied.plan.reports
    );
    expect((await store.read({ projectId, actorUserId: ownerUserId }))?.catalog).toEqual(
      input.catalog
    );
    expect(await store.read({ projectId, actorUserId: randomUUID() })).toBeNull();
    expect(await store.read({ projectId: "invalid", actorUserId: ownerUserId })).toBeNull();
    expect(
      (await store.apply({ actorUserId: ownerUserId, plan: input, previewHash: "bad" })).kind
    ).toBe("conflict");
    expect(
      await store.apply({
        actorUserId: ownerUserId,
        plan: input,
        previewHash: preview.preview.preview_hash
      })
    ).toEqual({ kind: "applied", replayed: true, plan: applied.plan });
    expect(
      (await store.preview({ actorUserId: ownerUserId, plan: { ...input, reports: [] } })).kind
    ).toBe("conflict");
    expect(
      (await pool.query("SELECT count(*) FROM analytics_project_catalogs")).rows[0]?.count
    ).toBe("1");
    expect(
      (await pool.query("SELECT count(*) FROM analytics_project_report_revisions")).rows[0]?.count
    ).toBe("1");
  });

  it("reads bounded current-revision observed producer counts without calling them verified", async () => {
    const input = plan();
    const preview = await store.preview({ actorUserId: ownerUserId, plan: input });
    if (preview.kind !== "preview") throw new Error("fixture plan rejected");
    const applied = await store.apply({
      actorUserId: ownerUserId,
      plan: input,
      previewHash: preview.preview.preview_hash
    });
    if (applied.kind !== "applied") throw new Error("fixture plan apply rejected");
    const observedAt = "2026-09-29T12:00:00.000Z";
    for (const [revision, count] of [
      [1, 2],
      [2, 7]
    ] as const) {
      await pool.query(
        `INSERT INTO semantic_analytics_catalog_observations(
           project_id,catalog_revision,event_name,event_revision,producer_kind,
           observed_on,accepted_count,first_occurred_at,last_occurred_at,last_accepted_at)
         VALUES($1::uuid,1,'signup.completed',$2,'server','2026-09-29'::date,$3,
           $4::timestamptz,$4::timestamptz,$4::timestamptz)`,
        [projectId, revision, count, observedAt]
      );
    }
    await pool.query(
      `INSERT INTO semantic_analytics_catalog_observations(
         project_id,catalog_revision,event_name,event_revision,producer_kind,
         observed_on,accepted_count,first_occurred_at,last_occurred_at,last_accepted_at)
       VALUES($1::uuid,1,'signup.completed',1,'server','2026-09-30'::date,3,
         $2::timestamptz,$2::timestamptz,$2::timestamptz)`,
      [projectId, "2026-09-30T12:00:00.000Z"]
    );
    for (const [revision, version, count] of [
      [1, "3.0.3", 2],
      [1, "3.1.0", 3],
      [2, "2.0.0", 7]
    ] as const) {
      await pool.query(
        `INSERT INTO semantic_analytics_producer_observations(
           project_id,catalog_revision,event_name,event_revision,producer_kind,sdk_name,sdk_version,
           observed_on,accepted_count,first_occurred_at,last_occurred_at,last_accepted_at)
         VALUES($1::uuid,1,'signup.completed',$2,'server','@debugbundle/sdk-node',$3,
           '2026-09-29'::date,$4,$5::timestamptz,$5::timestamptz,$5::timestamptz)`,
        [projectId, revision, version, count, observedAt]
      );
    }
    expect((await store.read({ projectId, actorUserId: ownerUserId }))?.observations).toEqual([
      {
        event_name: "signup.completed",
        event_revision: 1,
        producer_kind: "server",
        observed_count: "5",
        first_observed_on: "2026-09-29",
        last_observed_on: "2026-09-30"
      }
    ]);
    expect(
      (await store.read({ projectId, actorUserId: ownerUserId }))?.producer_observations
    ).toEqual([
      {
        event_name: "signup.completed",
        event_revision: 1,
        producer_kind: "server",
        sdk_name: "@debugbundle/sdk-node",
        sdk_version: "3.0.3",
        observed_count: "2",
        first_observed_on: "2026-09-29",
        last_observed_on: "2026-09-29"
      },
      {
        event_name: "signup.completed",
        event_revision: 1,
        producer_kind: "server",
        sdk_name: "@debugbundle/sdk-node",
        sdk_version: "3.1.0",
        observed_count: "3",
        first_observed_on: "2026-09-29",
        last_observed_on: "2026-09-29"
      }
    ]);
    expect(
      (await store.read({ projectId, actorUserId: ownerUserId }))?.producer_observations_truncated
    ).toBe(false);
    await pool.query(
      `INSERT INTO semantic_analytics_producer_observations(
         project_id,catalog_revision,event_name,event_revision,producer_kind,sdk_name,sdk_version,
         observed_on,accepted_count,first_occurred_at,last_occurred_at,last_accepted_at)
       SELECT $1::uuid,1,'signup.completed',1,'server','@debugbundle/sdk-node',
         'candidate-' || series::text,'2026-09-29'::date,1,
         $2::timestamptz,$2::timestamptz,$2::timestamptz
       FROM generate_series(1,301) AS series`,
      [projectId, observedAt]
    );
    const bounded = await store.read({ projectId, actorUserId: ownerUserId });
    expect(bounded?.producer_observations).toHaveLength(300);
    expect(bounded?.producer_observations_truncated).toBe(true);
    expect(await store.read({ projectId, actorUserId: randomUUID() })).toBeNull();
  });

  it("keeps business measurement disabled until a reviewed project-plan grant is applied", async () => {
    const first = plan();
    const firstPreview = await store.preview({ actorUserId: ownerUserId, plan: first });
    if (firstPreview.kind !== "preview") throw new Error("fixture rejected");
    const firstApply = await store.apply({
      actorUserId: ownerUserId,
      plan: first,
      previewHash: firstPreview.preview.preview_hash
    });
    if (firstApply.kind !== "applied") throw new Error("fixture rejected");
    expect(firstApply.plan).toMatchObject({ business_measurement_enabled: false });

    const granted = {
      ...first,
      expected_revision: 1,
      idempotency_key: randomUUID(),
      business_measurement_enabled: true
    };
    const preview = await store.preview({ actorUserId: ownerUserId, plan: granted });
    if (preview.kind !== "preview") throw new Error("grant preview rejected");
    expect(preview.preview).toMatchObject({ business_measurement_enabled_after: true });
    expect(
      (await store.read({ projectId, actorUserId: ownerUserId }))?.business_measurement_enabled
    ).toBe(false);
    const applied = await store.apply({
      actorUserId: ownerUserId,
      plan: granted,
      previewHash: preview.preview.preview_hash
    });
    if (applied.kind !== "applied") throw new Error("grant apply rejected");
    expect(applied.plan.business_measurement_enabled).toBe(true);
    expect(applied.plan.catalog_revision).toBe(firstApply.plan.catalog_revision);
    expect(applied.plan.reports[0]?.available_from).toBe(
      firstApply.plan.reports[0]?.available_from
    );
    expect(
      (await store.read({ projectId, actorUserId: ownerUserId }))?.business_measurement_enabled
    ).toBe(true);
    expect(
      await store.apply({
        actorUserId: ownerUserId,
        plan: first,
        previewHash: firstPreview.preview.preview_hash
      })
    ).toMatchObject({
      kind: "applied",
      replayed: true,
      plan: { business_measurement_enabled: false }
    });
    expect(
      (await store.read({ projectId, actorUserId: ownerUserId }))?.business_measurement_enabled
    ).toBe(true);
    expect(
      (
        await pool.query(
          "SELECT business_measurement_enabled FROM analytics_project_plan_revisions ORDER BY revision"
        )
      ).rows
    ).toEqual([{ business_measurement_enabled: false }, { business_measurement_enabled: true }]);
  });

  it("fails readiness without the business-purpose migration and upgrades a populated predecessor", async () => {
    const input = plan();
    const preview = await store.preview({ actorUserId: ownerUserId, plan: input });
    if (preview.kind !== "preview") throw new Error("fixture rejected");
    expect(
      (
        await store.apply({
          actorUserId: ownerUserId,
          plan: input,
          previewHash: preview.preview.preview_hash
        })
      ).kind
    ).toBe("applied");
    const legacyHash = createHash("sha256")
      .update(stableJson({ actorUserId: ownerUserId, plan: input }))
      .digest("hex");
    const legacyReviewHash = "a".repeat(64);
    await pool.query(
      "UPDATE analytics_project_plan_revisions SET mutation_hash=$1,review_hash=$2 WHERE project_id=$3",
      [legacyHash, legacyReviewHash, projectId]
    );
    await pool.query(
      "ALTER TABLE analytics_project_plan_revisions DROP COLUMN business_measurement_enabled"
    );
    await pool.query(
      "ALTER TABLE analytics_project_plans DROP COLUMN business_measurement_enabled"
    );
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202609280009_add_business_measurement_policy'"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow();
    const upgraded = await migrateStorageSchema(db);
    expect(upgraded.applied).toContain("202609280009_add_business_measurement_policy");
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect(
      (await pool.query("SELECT id FROM projects WHERE id=$1", [projectId])).rows
    ).toHaveLength(1);
    expect(
      (await pool.query("SELECT business_measurement_enabled FROM analytics_project_plans")).rows
    ).toEqual([{ business_measurement_enabled: false }]);
    expect((await store.preview({ actorUserId: ownerUserId, plan: input })).kind).toBe("preview");
    const replay = await store.apply({
      actorUserId: ownerUserId,
      plan: input,
      previewHash: legacyReviewHash
    });
    expect(replay).toMatchObject({
      kind: "applied",
      replayed: true,
      plan: { business_measurement_enabled: false }
    });
  });

  it("requires a new report revision for changed meaning and keeps its original effective time", async () => {
    const first = plan();
    const firstPreview = await store.preview({ actorUserId: ownerUserId, plan: first });
    if (firstPreview.kind !== "preview") throw new Error("fixture rejected");
    const firstApply = await store.apply({
      actorUserId: ownerUserId,
      plan: first,
      previewHash: firstPreview.preview.preview_hash
    });
    if (firstApply.kind !== "applied") throw new Error("fixture rejected");
    const changed = plan();
    changed.expected_revision = 1;
    changed.reports[0]!.display_name = "Confirmed signups";
    expect((await store.preview({ actorUserId: ownerUserId, plan: changed })).kind).toBe(
      "conflict"
    );
    changed.reports[0]!.revision = 2;
    const secondPreview = await store.preview({ actorUserId: ownerUserId, plan: changed });
    if (secondPreview.kind !== "preview") throw new Error("successor rejected");
    expect(secondPreview.preview.changed_reports).toEqual(["signup_goal"]);
    expect(secondPreview.preview.catalog_revision).toBe(1);
    const secondApply = await store.apply({
      actorUserId: ownerUserId,
      plan: changed,
      previewHash: secondPreview.preview.preview_hash
    });
    expect(secondApply.kind).toBe("applied");
    expect(
      (
        await store.apply({
          actorUserId: ownerUserId,
          plan: first,
          previewHash: firstPreview.preview.preview_hash
        })
      ).kind
    ).toBe("applied");
    const stale = plan();
    stale.expected_revision = 2;
    expect((await store.preview({ actorUserId: ownerUserId, plan: stale })).kind).toBe("conflict");
    const unchanged = plan();
    unchanged.expected_revision = 2;
    unchanged.catalog = [];
    unchanged.reports = [];
    const removal = await store.preview({ actorUserId: ownerUserId, plan: unchanged });
    expect(removal.kind).toBe("preview");
    if (removal.kind !== "preview") throw new Error("removal rejected");
    expect(removal.preview.removed_reports).toEqual(["signup_goal"]);
    expect(firstApply.plan.reports[0]!.available_from).toEqual(
      (
        await pool.query<{ available_from: Date }>(
          "SELECT available_from FROM analytics_project_report_revisions WHERE revision=1"
        )
      ).rows[0]?.available_from.toISOString()
    );
  });

  it("keeps availability for an unchanged report and requires a new revision after removal", async () => {
    const first = plan();
    const reviewed = await store.preview({ actorUserId: ownerUserId, plan: first });
    if (reviewed.kind !== "preview") throw new Error("fixture rejected");
    const applied = await store.apply({
      actorUserId: ownerUserId,
      plan: first,
      previewHash: reviewed.preview.preview_hash
    });
    if (applied.kind !== "applied") throw new Error("fixture rejected");
    const unchanged = plan();
    unchanged.expected_revision = 1;
    const next = await store.preview({ actorUserId: ownerUserId, plan: unchanged });
    if (next.kind !== "preview") throw new Error("fixture rejected");
    const second = await store.apply({
      actorUserId: ownerUserId,
      plan: unchanged,
      previewHash: next.preview.preview_hash
    });
    if (second.kind !== "applied") throw new Error("fixture rejected");
    expect(second.plan.reports[0]?.available_from).toBe(applied.plan.reports[0]?.available_from);
    const removed = plan();
    removed.expected_revision = 2;
    removed.reports = [];
    const removal = await store.preview({ actorUserId: ownerUserId, plan: removed });
    if (removal.kind !== "preview") throw new Error("fixture rejected");
    expect(
      (
        await store.apply({
          actorUserId: ownerUserId,
          plan: removed,
          previewHash: removal.preview.preview_hash
        })
      ).kind
    ).toBe("applied");
    const reused = plan();
    reused.expected_revision = 3;
    expect((await store.preview({ actorUserId: ownerUserId, plan: reused })).kind).toBe("conflict");
  });

  it("requires a new report revision when a referenced catalog event changes meaning", async () => {
    const first = plan();
    const reviewed = await store.preview({ actorUserId: ownerUserId, plan: first });
    if (reviewed.kind !== "preview") throw new Error("fixture rejected");
    const applied = await store.apply({
      actorUserId: ownerUserId,
      plan: first,
      previewHash: reviewed.preview.preview_hash
    });
    if (applied.kind !== "applied") throw new Error("fixture not applied");

    const changed = structuredClone(first);
    changed.expected_revision = 1;
    changed.idempotency_key = randomUUID();
    changed.catalog[0]!.revision = 2;
    changed.catalog[0]!.properties = { tier: { type: "boolean", required: false } };
    expect((await store.preview({ actorUserId: ownerUserId, plan: changed })).kind).toBe(
      "conflict"
    );

    changed.reports[0]!.revision = 2;
    const successor = await store.preview({ actorUserId: ownerUserId, plan: changed });
    expect(successor.kind).toBe("preview");
    if (successor.kind !== "preview") throw new Error("successor rejected");
    expect(successor.preview.changed_reports).toEqual(["signup_goal"]);
    const next = await store.apply({
      actorUserId: ownerUserId,
      plan: changed,
      previewHash: successor.preview.preview_hash
    });
    expect(next.kind).toBe("applied");
    if (next.kind !== "applied") throw new Error("successor not applied");
    expect(next.plan.reports[0]?.definition.revision).toBe(2);
  });

  it("returns the reviewed catalog snapshot on historical plan replay", async () => {
    const first = plan();
    const firstPreview = await store.preview({ actorUserId: ownerUserId, plan: first });
    if (firstPreview.kind !== "preview") throw new Error("fixture rejected");
    expect(
      (
        await store.apply({
          actorUserId: ownerUserId,
          plan: first,
          previewHash: firstPreview.preview.preview_hash
        })
      ).kind
    ).toBe("applied");
    const next = plan();
    next.expected_revision = 1;
    next.catalog[0]!.revision = 2;
    next.catalog[0]!.description = "Updated confirmed signup";
    const nextPreview = await store.preview({ actorUserId: ownerUserId, plan: next });
    if (nextPreview.kind !== "preview") throw new Error("successor rejected");
    expect(
      (
        await store.apply({
          actorUserId: ownerUserId,
          plan: next,
          previewHash: nextPreview.preview.preview_hash
        })
      ).kind
    ).toBe("applied");
    const replay = await store.apply({
      actorUserId: ownerUserId,
      plan: first,
      previewHash: firstPreview.preview.preview_hash
    });
    expect(replay.kind === "applied" ? replay.plan.catalog : null).toEqual(first.catalog);
    expect((await store.read({ projectId, actorUserId: ownerUserId }))?.catalog).toEqual(
      next.catalog
    );
  });

  it("counts active legacy funnels against the same saved-report limit", async () => {
    const input = plan();
    await pool.query(
      "UPDATE organizations SET plan='free' WHERE id=(SELECT organization_id FROM projects WHERE id=$1)",
      [projectId]
    );
    await pool.query(
      `INSERT INTO analytics_funnel_definitions(project_id,funnel_key,display_name,steps,created_by_user_id)
       VALUES($1,'legacy','Legacy','[]'::jsonb,$2)`,
      [projectId, ownerUserId]
    );
    expect((await store.preview({ actorUserId: ownerUserId, plan: input })).kind).toBe(
      "capacity_exceeded"
    );
    await pool.query(
      "UPDATE analytics_funnel_definitions SET archived_at=now() WHERE project_id=$1",
      [projectId]
    );
    expect((await store.preview({ actorUserId: ownerUserId, plan: input })).kind).toBe("preview");
  });

  it("rejects catalog declarations above the current project dimension limit", async () => {
    await pool.query(
      "INSERT INTO project_analytics_settings(project_id,max_custom_dimensions) VALUES($1,0)",
      [projectId]
    );
    const input = plan();
    input.catalog[0]!.properties = { method: { type: "enum", values: ["email"], required: false } };
    expect((await store.preview({ actorUserId: ownerUserId, plan: input })).kind).toBe(
      "capacity_exceeded"
    );
  });

  it("prevents a legacy funnel from exceeding capacity after a V2 report is active", async () => {
    await pool.query(
      "UPDATE organizations SET plan='free' WHERE id=(SELECT organization_id FROM projects WHERE id=$1)",
      [projectId]
    );
    const input = plan();
    const preview = await store.preview({ actorUserId: ownerUserId, plan: input });
    if (preview.kind !== "preview") throw new Error("fixture rejected");
    expect(
      (
        await store.apply({
          actorUserId: ownerUserId,
          plan: input,
          previewHash: preview.preview.preview_hash
        })
      ).kind
    ).toBe("applied");
    const legacy = createPostgresAnalyticsSavedFunnelStore(db);
    const organizationId = (
      await pool.query<{ organization_id: string }>(
        "SELECT organization_id FROM projects WHERE id=$1",
        [projectId]
      )
    ).rows[0]!.organization_id;
    expect(
      (
        await legacy.createSavedFunnelForProject({
          organization_id: organizationId,
          project_id: projectId,
          created_by_user_id: ownerUserId,
          definition: {
            funnel_key: "legacy",
            display_name: "Legacy",
            steps: [
              { step_key: "start", display_name: "Start" },
              { step_key: "complete", display_name: "Complete" }
            ]
          }
        })
      ).status
    ).toBe("limit_reached");
  });

  it("charges a stored space report to its source before project and legacy report creation", async () => {
    const spaceId = await seedStoredSpaceReportSlot();
    await pool.query(
      "INSERT INTO project_analytics_settings(project_id,max_saved_funnels) VALUES($1::uuid,1)",
      [projectId]
    );
    expect((await store.preview({ actorUserId: ownerUserId, plan: plan() })).kind).toBe(
      "capacity_exceeded"
    );
    const legacy = createPostgresAnalyticsSavedFunnelStore(db);
    const organizationId = (
      await pool.query<{ organization_id: string }>(
        "SELECT organization_id FROM projects WHERE id=$1::uuid",
        [projectId]
      )
    ).rows[0]!.organization_id;
    expect(
      (
        await legacy.createSavedFunnelForProject({
          organization_id: organizationId,
          project_id: projectId,
          created_by_user_id: ownerUserId,
          definition: {
            funnel_key: "legacy",
            display_name: "Legacy",
            steps: [
              { step_key: "start", display_name: "Start" },
              { step_key: "complete", display_name: "Complete" }
            ]
          }
        })
      ).status
    ).toBe("limit_reached");
    await pool.query("UPDATE analytics_spaces SET archived_at=now() WHERE id=$1::uuid", [spaceId]);
    expect((await store.preview({ actorUserId: ownerUserId, plan: plan() })).kind).toBe("preview");
  });

  it("invalidates a project-plan preview if a source space report takes a slot", async () => {
    const input = plan();
    await seedSourceCatalog();
    const reviewed = await store.preview({ actorUserId: ownerUserId, plan: input });
    if (reviewed.kind !== "preview") throw new Error("plan fixture rejected");
    await seedStoredSpaceReportSlot();
    expect(
      (
        await store.apply({
          actorUserId: ownerUserId,
          plan: input,
          previewHash: reviewed.preview.preview_hash
        })
      ).kind
    ).toBe("conflict");
  });

  it("invalidates a reviewed plan after an intervening catalog revision", async () => {
    const input = plan();
    const reviewed = await store.preview({ actorUserId: ownerUserId, plan: input });
    if (reviewed.kind !== "preview") throw new Error("fixture rejected");
    const catalog = createAnalyticsProjectCatalogStore(db);
    const change = {
      actorUserId: ownerUserId,
      projectId,
      expectedRevision: 0,
      idempotencyKey: randomUUID(),
      entries: input.catalog
    };
    const catalogReview = await catalog.preview(change);
    if (catalogReview.kind !== "preview") throw new Error("catalog fixture rejected");
    expect(
      (await catalog.apply({ ...change, previewHash: catalogReview.preview.preview_hash })).kind
    ).toBe("applied");
    expect(
      (
        await store.apply({
          actorUserId: ownerUserId,
          plan: input,
          previewHash: reviewed.preview.preview_hash
        })
      ).kind
    ).toBe("conflict");
    expect((await pool.query("SELECT count(*) FROM analytics_project_plans")).rows[0]?.count).toBe(
      "0"
    );
  });

  it("invalidates a reviewed plan when saved-report capacity changes", async () => {
    const input = plan();
    const reviewed = await store.preview({ actorUserId: ownerUserId, plan: input });
    if (reviewed.kind !== "preview") throw new Error("fixture rejected");
    await pool.query(
      "INSERT INTO project_analytics_settings(project_id,max_saved_funnels) VALUES($1,9)",
      [projectId]
    );
    expect(
      (
        await store.apply({
          actorUserId: ownerUserId,
          plan: input,
          previewHash: reviewed.preview.preview_hash
        })
      ).kind
    ).toBe("conflict");
  });

  it("rejects forged review content, stale revisions and missing migration readiness", async () => {
    const input = plan();
    const preview = await store.preview({ actorUserId: ownerUserId, plan: input });
    if (preview.kind !== "preview") throw new Error("fixture rejected");
    expect(
      (await store.apply({ actorUserId: ownerUserId, plan: input, previewHash: "bad" })).kind
    ).toBe("conflict");
    expect((await store.preview({ actorUserId: randomUUID(), plan: input })).kind).toBe(
      "forbidden"
    );
    expect(
      (
        await store.preview({
          actorUserId: ownerUserId,
          plan: { ...input, scope: { kind: "space", space_id: randomUUID() } }
        })
      ).kind
    ).toBe("invalid");
    expect((await pool.query("SELECT count(*) FROM analytics_project_plans")).rows[0]?.count).toBe(
      "0"
    );
    await pool.query("DELETE FROM storage_migration_ledger WHERE id=$1", [
      "202609280004_add_analytics_project_plans"
    ]);
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow();
  });
});
