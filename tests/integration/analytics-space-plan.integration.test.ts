import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { createAnalyticsProjectCatalogStore } from "../../packages/storage/src/analytics-project-catalog-store.js";
import { createAnalyticsSpacePlanStore } from "../../packages/storage/src/analytics-space-plan-store.js";
import { createAnalyticsSpaceStore } from "../../packages/storage/src/analytics-space-store.js";
import { recordPortfolioSemanticFunnelFactsInTransaction } from "../../packages/storage/src/semantic-analytics-portfolio-projection.js";
import { readPortfolioSemanticFunnelReport } from "../../packages/storage/src/semantic-analytics-portfolio-funnel-report.js";
import { createPostgresRetentionStore } from "../../packages/storage/src/retention-store.js";
import { SemanticAnalyticsEventSchema } from "../../packages/shared-types/src/index.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import { analyticsSpacePlanFixture } from "../helpers/analytics-plan-fixtures.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

function portfolioFunnelDefinition(spaceId: string) {
  return {
    kind: "ordered_funnel" as const,
    key: "signup_funnel",
    revision: 1,
    display_name: "Signup funnel",
    scope: { kind: "space" as const, space_id: spaceId },
    subject: "user" as const,
    timezone: "UTC",
    conversion_window_seconds: 3600,
    breakdown: null,
    steps: [
      {
        key: "start",
        predicate: {
          field: "event_name" as const,
          operator: "in" as const,
          values: ["signup.completed"]
        }
      },
      {
        key: "finish",
        predicate: {
          field: "event_name" as const,
          operator: "in" as const,
          values: ["signup.completed"]
        }
      }
    ]
  };
}

runIntegration("space semantic measurement plan declarations", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const spaces = createAnalyticsSpaceStore(db);
  const catalogs = createAnalyticsProjectCatalogStore(db);
  const plans = createAnalyticsSpacePlanStore(db);
  let organizationId: string;
  let ownerUserId: string;
  let sourceA: string;
  let sourceB: string;
  let spaceId: string;

  beforeEach(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
    organizationId = randomUUID();
    sourceA = randomUUID();
    sourceB = randomUUID();
    ({ ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId: sourceA,
      organizationName: "Growth",
      organizationSlug: "growth",
      projectName: "Site",
      projectSlug: "site",
      organizationPlan: "team"
    }));
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug,environment_default) VALUES($1,$2,$3,'App','app','test')",
      [sourceB, organizationId, ownerUserId]
    );
    const change = {
      actorUserId: ownerUserId,
      spaceId: null,
      change: {
        action: "save" as const,
        mutation: {
          organization_id: organizationId,
          display_name: "Growth",
          mode: "portfolio" as const,
          expected_revision: 0,
          idempotency_key: randomUUID(),
          project_ids: [sourceA, sourceB]
        }
      }
    };
    const preview = await spaces.preview(change);
    if (preview.kind !== "preview") throw new Error("space fixture preview rejected");
    const applied = await spaces.apply({ ...change, previewHash: preview.preview.preview_hash });
    if (applied.kind !== "applied") throw new Error("space fixture apply rejected");
    spaceId = applied.space.id;
    const event = analyticsSpacePlanFixture(spaceId).catalog[0]!;
    for (const projectId of [sourceA, sourceB]) {
      const input = {
        actorUserId: ownerUserId,
        projectId,
        expectedRevision: 0,
        idempotencyKey: randomUUID(),
        entries: [event]
      };
      const catalogPreview = await catalogs.preview(input);
      if (catalogPreview.kind !== "preview") throw new Error("catalog fixture rejected");
      const catalogApplied = await catalogs.apply({
        ...input,
        previewHash: catalogPreview.preview.preview_hash
      });
      if (catalogApplied.kind !== "applied") throw new Error("catalog fixture rejected");
    }
  });
  afterAll(async () => pool.end());

  it("reviews and saves a complete source catalog snapshot without activating reports", async () => {
    const plan = { ...analyticsSpacePlanFixture(spaceId), reports: [] };
    const preview = await plans.preview({ actorUserId: ownerUserId, plan });
    expect(preview.kind).toBe("preview");
    if (preview.kind !== "preview") throw new Error("plan preview rejected");
    expect(preview.preview).toMatchObject({
      space_id: spaceId,
      expected_revision: 0,
      resulting_revision: 1,
      space_revision: 1,
      source_catalog_revisions: [
        { project_id: sourceA, catalog_revision: 1 },
        { project_id: sourceB, catalog_revision: 1 }
      ].sort((a, b) => a.project_id.localeCompare(b.project_id))
    });
    expect((await pool.query("SELECT count(*) FROM analytics_space_plans")).rows[0]?.count).toBe(
      "0"
    );
    const applied = await plans.apply({
      actorUserId: ownerUserId,
      plan,
      previewHash: preview.preview.preview_hash
    });
    expect(applied.kind).toBe("applied");
    if (applied.kind !== "applied") throw new Error("plan apply rejected");
    expect(applied.plan.catalog).toEqual(plan.catalog);
    expect(applied.plan.reports).toEqual([]);
    expect(applied.plan.coverage[0]?.project_ids).toEqual([sourceA, sourceB].sort());
    expect(await plans.read({ actorUserId: ownerUserId, spaceId })).toEqual(applied.plan);
    expect(await plans.read({ actorUserId: randomUUID(), spaceId })).toBeNull();
    expect(
      await plans.apply({
        actorUserId: ownerUserId,
        plan,
        previewHash: preview.preview.preview_hash
      })
    ).toEqual({ kind: "applied", replayed: true, plan: applied.plan });
    expect(
      await plans.apply({
        actorUserId: ownerUserId,
        plan: {
          ...plan,
          scope: { kind: "space", space_id: spaceId.toUpperCase() },
          idempotency_key: plan.idempotency_key.toUpperCase()
        },
        previewHash: preview.preview.preview_hash
      })
    ).toEqual({ kind: "applied", replayed: true, plan: applied.plan });
    const changedSource = {
      actorUserId: ownerUserId,
      projectId: sourceB,
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
      entries: [{ ...plan.catalog[0]!, revision: 2, description: "Updated source catalog" }]
    };
    const sourcePreview = await catalogs.preview(changedSource);
    if (sourcePreview.kind !== "preview") throw new Error("source update rejected");
    expect(
      (
        await catalogs.apply({
          ...changedSource,
          previewHash: sourcePreview.preview.preview_hash
        })
      ).kind
    ).toBe("applied");
    expect(await plans.read({ actorUserId: ownerUserId, spaceId })).toBeNull();
  });

  it("saves a portfolio report prospectively with immutable definition revisions", async () => {
    const base = analyticsSpacePlanFixture(spaceId);
    const definition = portfolioFunnelDefinition(spaceId);
    const plan = { ...base, reports: [definition] };
    const preview = await plans.preview({ actorUserId: ownerUserId, plan });
    expect(preview.kind).toBe("preview");
    if (preview.kind !== "preview") throw new Error("portfolio report preview rejected");
    const applied = await plans.apply({
      actorUserId: ownerUserId,
      plan,
      previewHash: preview.preview.preview_hash
    });
    expect(applied.kind).toBe("applied");
    if (applied.kind !== "applied") throw new Error("portfolio report apply rejected");
    expect(applied.plan.reports[0]).toMatchObject({
      definition,
      available_from: expect.stringMatching(/^\d{4}-\d\d-\d\dT/)
    });
    expect(await plans.read({ actorUserId: ownerUserId, spaceId })).toEqual(applied.plan);
    expect(
      (await pool.query("SELECT count(*) FROM analytics_space_report_revisions")).rows[0]?.count
    ).toBe("1");
    const acceptedAt = new Date(
      Date.parse(applied.plan.reports[0]!.available_from) + 1
    ).toISOString();
    const event = SemanticAnalyticsEventSchema.parse({
      schema_version: "2026-09-analytics-02",
      event_type: "analytics_event",
      event_id: randomUUID(),
      occurred_at: acceptedAt,
      sdk_name: "@debugbundle/sdk-node",
      sdk_version: "3.1.0-rc.1",
      service: { name: "api", runtime: "node", framework: null, environment: "test" },
      producer: { kind: "server", stream_id: null, sequence: null },
      operation_id: `sha256:${"a".repeat(64)}`,
      correlation: {
        session_id: null,
        anonymous_id_hash: null,
        user_id_hash: `sha256:${"b".repeat(64)}`,
        account_id_hash: null,
        namespace_revision: 1,
        trace_id: null,
        deploy_id: null
      },
      payload: {
        kind: "semantic",
        name: "signup.completed",
        event_revision: 1,
        purpose: "business_measurement",
        privacy: { mode: "custom", consent_granted: false },
        route: null,
        previous_route: null,
        screen: null,
        session: null,
        acquisition: null,
        client: null,
        properties: {},
        measurements: {},
        money: null,
        financial: null
      }
    });
    const verified = {
      event,
      provenance: {
        principal: "server_writer" as const,
        authority: "server_authoritative" as const,
        scope: { kind: "project" as const, project_id: sourceA },
        scope_revision: 1,
        catalog_revision: 1,
        identity_scope: { kind: "project" as const, project_id: sourceA },
        identity_verification: "server_namespace" as const,
        identity_context_id: null,
        identity_writer_id: randomUUID(),
        identity_producer_epoch: null,
        accepted_at: acceptedAt
      }
    };
    await db.transaction!(async (tx) =>
      recordPortfolioSemanticFunnelFactsInTransaction(tx, sourceA, verified)
    );
    const otherEvent = { ...event, event_id: randomUUID() };
    await db.transaction!(async (tx) =>
      recordPortfolioSemanticFunnelFactsInTransaction(tx, sourceB, {
        event: otherEvent,
        provenance: {
          ...verified.provenance,
          scope: { kind: "project", project_id: sourceB },
          identity_scope: { kind: "project", project_id: sourceB }
        }
      })
    );
    const facts = (
      await pool.query<{
        space_id: string;
        project_id: string;
        source_entry_revision: string;
        fact: unknown;
      }>(
        "SELECT space_id,project_id,source_entry_revision,fact FROM semantic_analytics_portfolio_funnel_facts"
      )
    ).rows;
    expect(facts).toHaveLength(2);
    expect(facts.find((row) => row.project_id === sourceA)).toMatchObject({
      space_id: spaceId,
      project_id: sourceA,
      source_entry_revision: "1",
      fact: { origin_project_id: sourceA, scope: { kind: "space", space_id: spaceId } }
    });
    const subjects = facts.map((row) => (row.fact as { subject_key: string }).subject_key);
    expect(new Set(subjects).size).toBe(2);
    await expect(
      db.transaction!(async (tx) =>
        recordPortfolioSemanticFunnelFactsInTransaction(tx, sourceA, {
          ...verified,
          event: {
            ...event,
            event_id: randomUUID(),
            payload: { ...event.payload, event_revision: 2 }
          }
        })
      )
    ).rejects.toThrow("semantic_portfolio_source_entry_mismatch");
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_portfolio_funnel_facts")).rows[0]
        ?.count
    ).toBe("2");
    const comparison = await readPortfolioSemanticFunnelReport(db, {
      actorUserId: ownerUserId,
      spaceId,
      reportKey: definition.key,
      from: acceptedAt,
      to: new Date().toISOString()
    });
    expect(comparison.kind).toBe("report");
    if (comparison.kind !== "report") throw new Error("portfolio report read rejected");
    expect(comparison.sources.map((source) => source.project_id)).toEqual(
      [sourceA, sourceB].sort()
    );
    expect(comparison.sources.every((source) => source.kind === "report")).toBe(true);
    for (const source of comparison.sources) {
      if (source.kind !== "report") continue;
      expect(source.evidence).toMatchObject({
        excluded_events: "1",
        source_coverage: "unverified"
      });
      expect(source.report).toMatchObject({ status: "available", quality: "partial" });
    }
    expect(
      (
        await readPortfolioSemanticFunnelReport(db, {
          actorUserId: randomUUID(),
          spaceId,
          reportKey: definition.key,
          from: acceptedAt,
          to: new Date().toISOString()
        })
      ).kind
    ).toBe("forbidden");
    const reused = {
      ...plan,
      expected_revision: 1,
      idempotency_key: randomUUID(),
      reports: [{ ...definition, display_name: "Changed without a revision" }]
    };
    expect((await plans.preview({ actorUserId: ownerUserId, plan: reused })).kind).toBe("conflict");
    const replacement = { ...reused, reports: [{ ...reused.reports[0]!, revision: 2 }] };
    const replacementPreview = await plans.preview({ actorUserId: ownerUserId, plan: replacement });
    expect(replacementPreview.kind).toBe("preview");
    if (replacementPreview.kind !== "preview") throw new Error("replacement preview rejected");
    const replaced = await plans.apply({
      actorUserId: ownerUserId,
      plan: replacement,
      previewHash: replacementPreview.preview.preview_hash
    });
    expect(replaced.kind).toBe("applied");
    if (replaced.kind !== "applied") throw new Error("replacement apply rejected");
    expect(replaced.plan.reports[0]?.definition.revision).toBe(2);
    expect(
      (await pool.query("SELECT revision FROM analytics_space_report_revisions ORDER BY revision"))
        .rows
    ).toEqual([{ revision: "1" }, { revision: "2" }]);
    await createPostgresRetentionStore(db).pruneExpiredAnalyticsRollups({
      now: new Date(Date.parse(acceptedAt) + 91 * 86_400_000).toISOString(),
      limit: 100
    });
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_portfolio_funnel_facts")).rows[0]
        ?.count
    ).toBe("0");
    const changedSource = {
      actorUserId: ownerUserId,
      projectId: sourceB,
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
      entries: [{ ...base.catalog[0]!, revision: 2, description: "Updated producer notes" }]
    };
    const sourcePreview = await catalogs.preview(changedSource);
    if (sourcePreview.kind !== "preview") throw new Error("source preview rejected");
    expect(
      (
        await catalogs.apply({
          ...changedSource,
          previewHash: sourcePreview.preview.preview_hash
        })
      ).kind
    ).toBe("applied");
    expect(
      (
        await readPortfolioSemanticFunnelReport(db, {
          actorUserId: ownerUserId,
          spaceId,
          reportKey: definition.key,
          from: replaced.plan.reports[0]!.available_from,
          to: new Date().toISOString()
        })
      ).kind
    ).toBe("forbidden");
  });

  it("keeps a partially instrumented source in the comparison as a catalog gap", async () => {
    const base = analyticsSpacePlanFixture(spaceId);
    const other = { ...base.catalog[0]!, name: "other.completed" };
    const sourceChange = {
      actorUserId: ownerUserId,
      projectId: sourceB,
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
      entries: [other]
    };
    const sourcePreview = await catalogs.preview(sourceChange);
    if (sourcePreview.kind !== "preview") throw new Error("source catalog preview rejected");
    expect(
      (
        await catalogs.apply({
          ...sourceChange,
          previewHash: sourcePreview.preview.preview_hash
        })
      ).kind
    ).toBe("applied");
    const definition = portfolioFunnelDefinition(spaceId);
    const plan = { ...base, catalog: [base.catalog[0]!, other], reports: [definition] };
    const preview = await plans.preview({ actorUserId: ownerUserId, plan });
    if (preview.kind !== "preview") throw new Error("portfolio plan preview rejected");
    const applied = await plans.apply({
      actorUserId: ownerUserId,
      plan,
      previewHash: preview.preview.preview_hash
    });
    if (applied.kind !== "applied") throw new Error("portfolio plan apply rejected");
    const comparison = await readPortfolioSemanticFunnelReport(db, {
      actorUserId: ownerUserId,
      spaceId,
      reportKey: definition.key,
      from: applied.plan.reports[0]!.available_from,
      to: new Date().toISOString()
    });
    if (comparison.kind !== "report") throw new Error("portfolio report read rejected");
    expect(comparison.sources.find((source) => source.project_id === sourceA)?.kind).toBe("report");
    expect(comparison.sources.find((source) => source.project_id === sourceB)).toEqual({
      kind: "catalog_gap",
      project_id: sourceB,
      missing_steps: ["start", "finish"]
    });
  });

  it("fences reviewed source revisions, membership changes and unapproved report modes", async () => {
    const plan = { ...analyticsSpacePlanFixture(spaceId), reports: [] };
    expect(
      (await plans.preview({ actorUserId: ownerUserId, plan: analyticsSpacePlanFixture(spaceId) }))
        .kind
    ).toBe("mode_unavailable");
    const preview = await plans.preview({ actorUserId: ownerUserId, plan });
    if (preview.kind !== "preview") throw new Error("plan preview rejected");
    const current = await catalogs.read({ actorUserId: ownerUserId, projectId: sourceB });
    if (current === null) throw new Error("catalog fixture missing");
    const update = {
      actorUserId: ownerUserId,
      projectId: sourceB,
      expectedRevision: current.revision,
      idempotencyKey: randomUUID(),
      entries: [{ ...current.entries[0]!, revision: 2, description: "Updated documentation" }]
    };
    const catalogPreview = await catalogs.preview(update);
    if (catalogPreview.kind !== "preview") throw new Error("catalog update rejected");
    expect(
      (await catalogs.apply({ ...update, previewHash: catalogPreview.preview.preview_hash })).kind
    ).toBe("applied");
    expect(
      (
        await plans.apply({
          actorUserId: ownerUserId,
          plan,
          previewHash: preview.preview.preview_hash
        })
      ).kind
    ).toBe("conflict");
    const refreshed = await plans.preview({ actorUserId: ownerUserId, plan });
    if (refreshed.kind !== "preview") throw new Error("refresh rejected");
    const change = {
      actorUserId: ownerUserId,
      spaceId,
      change: {
        action: "save" as const,
        mutation: {
          organization_id: organizationId,
          display_name: "Growth",
          mode: "portfolio" as const,
          expected_revision: 1,
          idempotency_key: randomUUID(),
          project_ids: [sourceA]
        }
      }
    };
    const spacePreview = await spaces.preview(change);
    if (spacePreview.kind !== "preview") throw new Error("space update rejected");
    expect(
      (await spaces.apply({ ...change, previewHash: spacePreview.preview.preview_hash })).kind
    ).toBe("applied");
    expect(
      (
        await plans.apply({
          actorUserId: ownerUserId,
          plan,
          previewHash: refreshed.preview.preview_hash
        })
      ).kind
    ).toBe("conflict");
    expect((await pool.query("SELECT count(*) FROM analytics_space_plans")).rows[0]?.count).toBe(
      "0"
    );
  });

  it("serializes concurrent revisions and rechecks current authority on every read", async () => {
    const first = { ...analyticsSpacePlanFixture(spaceId), reports: [] };
    const second = { ...first, idempotency_key: randomUUID() };
    const firstPreview = await plans.preview({ actorUserId: ownerUserId, plan: first });
    const secondPreview = await plans.preview({ actorUserId: ownerUserId, plan: second });
    if (firstPreview.kind !== "preview" || secondPreview.kind !== "preview")
      throw new Error("plan preview rejected");
    const outcomes = await Promise.all([
      plans.apply({
        actorUserId: ownerUserId,
        plan: first,
        previewHash: firstPreview.preview.preview_hash
      }),
      plans.apply({
        actorUserId: ownerUserId,
        plan: second,
        previewHash: secondPreview.preview.preview_hash
      })
    ]);
    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(["applied", "conflict"]);
    const applied = outcomes.find((outcome) => outcome.kind === "applied");
    if (applied?.kind !== "applied") throw new Error("no plan applied");
    expect(
      (
        await plans.preview({
          actorUserId: ownerUserId,
          plan: { ...first, catalog: [] }
        })
      ).kind
    ).toBe("conflict");
    expect(await plans.read({ actorUserId: ownerUserId, spaceId })).toEqual(applied.plan);
    await pool.query("UPDATE organization_members SET suspended_at=now() WHERE user_id=$1", [
      ownerUserId
    ]);
    expect(await plans.read({ actorUserId: ownerUserId, spaceId })).toBeNull();
    expect((await plans.preview({ actorUserId: ownerUserId, plan: first })).kind).toBe("forbidden");
  });

  it("keeps connected report activation closed until trusted identity authority exists", async () => {
    const change = {
      actorUserId: ownerUserId,
      spaceId,
      change: {
        action: "save" as const,
        mutation: {
          organization_id: organizationId,
          display_name: "Growth",
          mode: "connected" as const,
          expected_revision: 1,
          idempotency_key: randomUUID(),
          project_ids: [sourceA, sourceB]
        }
      }
    };
    const preview = await spaces.preview(change);
    if (preview.kind !== "preview") throw new Error("connected space preview rejected");
    expect(
      (await spaces.apply({ ...change, previewHash: preview.preview.preview_hash })).kind
    ).toBe("applied");
    expect(
      (
        await plans.preview({
          actorUserId: ownerUserId,
          plan: analyticsSpacePlanFixture(spaceId)
        })
      ).kind
    ).toBe("mode_unavailable");
  });

  it("checks each linked source's lower saved-report allowance before report activation", async () => {
    await pool.query(
      "INSERT INTO project_analytics_settings(project_id,max_saved_funnels) VALUES($1::uuid,0)",
      [sourceB]
    );
    const reportPlan = analyticsSpacePlanFixture(spaceId);
    expect((await plans.preview({ actorUserId: ownerUserId, plan: reportPlan })).kind).toBe(
      "capacity_exceeded"
    );
    expect((await pool.query("SELECT count(*) FROM analytics_space_plans")).rows[0]?.count).toBe(
      "0"
    );
    await pool.query(
      "UPDATE project_analytics_settings SET max_saved_funnels=1 WHERE project_id=$1",
      [sourceB]
    );
    expect((await plans.preview({ actorUserId: ownerUserId, plan: reportPlan })).kind).toBe(
      "mode_unavailable"
    );
    await pool.query(
      `INSERT INTO analytics_space_plans(
         space_id,revision,space_revision,content_hash,catalog,reports,source_catalog_revisions,coverage)
       VALUES($1::uuid,1,1,$2,$3::jsonb,$4::jsonb,$5::jsonb,'[]'::jsonb)`,
      [
        spaceId,
        "a".repeat(64),
        JSON.stringify(reportPlan.catalog),
        JSON.stringify(
          reportPlan.reports.map((definition) => ({
            definition,
            available_from: "2026-09-28T00:00:00.000Z"
          }))
        ),
        JSON.stringify(
          [sourceA, sourceB].sort().map((project_id) => ({
            project_id,
            catalog_revision: 1
          }))
        )
      ]
    );
    expect(
      (
        await plans.preview({
          actorUserId: ownerUserId,
          plan: {
            ...reportPlan,
            expected_revision: 1,
            idempotency_key: randomUUID()
          }
        })
      ).kind
    ).toBe("mode_unavailable");
  });

  it("does not bypass the current shared-dashboard tier for an administered source", async () => {
    const otherOwner = randomUUID();
    await pool.query("INSERT INTO users(id,email) VALUES($1,'source-owner@example.test')", [
      otherOwner
    ]);
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'member')",
      [randomUUID(), organizationId, otherOwner]
    );
    await pool.query("UPDATE projects SET owner_user_id=$1 WHERE id=$2", [otherOwner, sourceB]);
    await pool.query(
      "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'admin')",
      [randomUUID(), sourceB, ownerUserId]
    );
    const plan = { ...analyticsSpacePlanFixture(spaceId), reports: [] };
    expect((await plans.preview({ actorUserId: ownerUserId, plan })).kind).toBe("preview");
    await pool.query("UPDATE organizations SET plan='free' WHERE id=$1", [organizationId]);
    expect((await plans.preview({ actorUserId: ownerUserId, plan })).kind).toBe("forbidden");
  });

  it("rejects conflicting same-name source meaning without creating plan state", async () => {
    const plan = { ...analyticsSpacePlanFixture(spaceId), reports: [] };
    const incompatible = {
      actorUserId: ownerUserId,
      projectId: sourceB,
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
      entries: [
        {
          ...plan.catalog[0]!,
          revision: 2,
          properties: { tier: { type: "boolean" as const, required: false } }
        }
      ]
    };
    const preview = await catalogs.preview(incompatible);
    if (preview.kind !== "preview") throw new Error("incompatible catalog rejected");
    expect(
      (
        await catalogs.apply({
          ...incompatible,
          previewHash: preview.preview.preview_hash
        })
      ).kind
    ).toBe("applied");
    expect((await plans.preview({ actorUserId: ownerUserId, plan })).kind).toBe("conflict");
    expect((await pool.query("SELECT count(*) FROM analytics_space_plans")).rows[0]?.count).toBe(
      "0"
    );
  });

  it("returns bounded failures for malformed identifiers before PostgreSQL casts", async () => {
    const plan = { ...analyticsSpacePlanFixture(spaceId), reports: [] };
    expect((await plans.preview({ actorUserId: "malformed", plan })).kind).toBe("invalid");
    expect(
      (
        await plans.preview({
          actorUserId: ownerUserId,
          plan: { ...plan, scope: { kind: "space", space_id: "malformed" } }
        })
      ).kind
    ).toBe("invalid");
    expect(await plans.read({ actorUserId: ownerUserId, spaceId: "malformed" })).toBeNull();
  });

  it("requires the forward migration before runtime can consume space plans", async () => {
    const ids = (
      await pool.query<{ id: string }>("SELECT id FROM storage_migration_ledger ORDER BY id")
    ).rows.map((row) => row.id);
    expect(ids).toContain("202609280005_add_analytics_space_plans");
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202609280005_add_analytics_space_plans'"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow();
  });

  it("upgrades a populated zero-report plan before report definitions can be stored", async () => {
    const plan = { ...analyticsSpacePlanFixture(spaceId), reports: [] };
    const preview = await plans.preview({ actorUserId: ownerUserId, plan });
    if (preview.kind !== "preview") throw new Error("plan fixture rejected");
    expect(
      (
        await plans.apply({
          actorUserId: ownerUserId,
          plan,
          previewHash: preview.preview.preview_hash
        })
      ).kind
    ).toBe("applied");
    await pool.query("DROP TABLE semantic_analytics_portfolio_funnel_facts");
    await pool.query("DROP TABLE analytics_space_report_revisions");
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id IN ('202609280023_add_analytics_space_report_revisions','202609280024_add_semantic_portfolio_funnel_facts')"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow();
    expect((await migrateStorageSchema(db)).applied).toEqual([
      "202609280023_add_analytics_space_report_revisions",
      "202609280024_add_semantic_portfolio_funnel_facts"
    ]);
    expect((await plans.read({ actorUserId: ownerUserId, spaceId }))?.reports).toEqual([]);
    expect(
      (await pool.query("SELECT count(*) FROM analytics_space_report_revisions")).rows[0]?.count
    ).toBe("0");
  });

  it("upgrades a populated predecessor without rewriting linked projects or catalogs", async () => {
    await pool.query("DROP TABLE semantic_analytics_portfolio_funnel_facts");
    await pool.query("DROP TABLE analytics_space_report_revisions");
    await pool.query("DROP TABLE analytics_space_plan_revisions");
    await pool.query("DROP TABLE analytics_space_plans");
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id IN ('202609280005_add_analytics_space_plans','202609280023_add_analytics_space_report_revisions','202609280024_add_semantic_portfolio_funnel_facts')"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow();
    expect((await migrateStorageSchema(db)).applied).toEqual([
      "202609280005_add_analytics_space_plans",
      "202609280023_add_analytics_space_report_revisions",
      "202609280024_add_semantic_portfolio_funnel_facts"
    ]);
    expect((await pool.query("SELECT count(*) FROM projects")).rows[0]?.count).toBe("2");
    expect(
      (await pool.query("SELECT count(*) FROM analytics_project_catalogs")).rows[0]?.count
    ).toBe("2");
    expect(
      (
        await plans.preview({
          actorUserId: ownerUserId,
          plan: { ...analyticsSpacePlanFixture(spaceId), reports: [] }
        })
      ).kind
    ).toBe("preview");
  });
});
