import { afterAll, beforeAll, expect, it } from "vitest";
import { createOpenAiHostedToolHandlers } from "../../packages/mcp-core/src/index.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { createPostgresAnalyticsMetricsStore } from "../../packages/storage/src/analytics-metrics-store.js";
import { createPostgresAnalyticsSavedFunnelStore } from "../../packages/storage/src/analytics-saved-funnel-store.js";
import { createPostgresAnalyticsBundleGenerationStore } from "../../packages/storage/src/analytics-bundle-generation-store.js";
import { createPostgresAnalyticsFlowStore } from "../../packages/storage/src/analytics-flow-store.js";
import { createPostgresAnalyticsSettingsStore } from "../../packages/storage/src/analytics-settings-store.js";
import { createPostgresAnalyticsOpportunitySchedulerStore } from "../../packages/storage/src/analytics-opportunity-scheduler-store.js";
import { createPostgresRetentionStore } from "../../packages/storage/src/retention-store.js";
import { randomUUID } from "node:crypto";
import { createOpenAiAnalyticsOperations } from "../../apps/api/src/openai-mcp-analytics-operations.js";
import { createMetadataIncidentRead } from "../../packages/storage/src/metadata-incident-read.js";
import { createMetadataAccess } from "../../packages/storage/src/metadata-access.js";
import { flowInput } from "../fixtures/analytics-flow-report.js";
import { seedConsolidationProjects } from "../helpers/consolidation-projects.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";

runIntegration("origin-preserving consolidated analytics", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    metrics = createPostgresAnalyticsMetricsStore(db),
    funnels = createPostgresAnalyticsSavedFunnelStore(db);
  beforeAll(async () => {
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
  });
  afterAll(async () => {
    await pool.end();
  });
  const window = {
    from: "2026-11-01T00:00:00.000Z",
    to: "2026-11-03T00:00:00.000Z",
    granularity: "day" as const
  };
  it("combines additive counts with explicit origin coverage and exact mapped service filters", async () => {
    const f = await seedConsolidationProjects(pool, db);
    await f.definitions.create({ project_id: f.target, user_id: f.userId, name: "web" });
    for (const project of [f.source, f.target])
      await pool.query(
        `INSERT INTO analytics_session_rollups(project_id,service,environment,bucket_start,bucket_granularity,dimension_hash,sessions,total_pageviews,active_visitors,new_visitors) VALUES($1,'web','production',$2,'day','same-dimension',1,2,1,1)`,
        [project, window.from]
      );
    const before = await metrics.getUsageSummary({ ...window, project_id: f.source });
    expect(before.summary.sessions).toBe(1);
    expect(before.summary).not.toHaveProperty("origin_scope");
    await f.consolidate();
    const combined = await metrics.getUsageSummary({ ...window, project_id: f.target });
    expect(combined.summary).toMatchObject({
      sessions: 2,
      pageviews: 4,
      active_visitors: 2,
      origin_scope: {
        origin_project_ids: [f.source, f.target].sort(),
        unique_count_semantics: "sum_of_origin_scoped_counts"
      }
    });
    const hosted = createOpenAiHostedToolHandlers({
      operations: createOpenAiAnalyticsOperations({
        now: () => new Date(window.to),
        analyticsMetrics: metrics,
        incidentRetrieval: createMetadataIncidentRead(db),
        requireProjectAccess: async (principal, projectId) => {
          const access = await createMetadataAccess(db).resolveProjectAccessForUser!({
            user_id: principal.userId,
            project_id: projectId
          });
          if (!access) return [];
          return access.origin_project_ids ?? [projectId];
        }
      })
    });
    const result = await hosted.get_usage_summary({
      principal: {
        userId: f.userId,
        organizationId: f.organizationId,
        grantId: randomUUID(),
        scopes: ["debugbundle:analytics:read"]
      },
      input: { projectId: f.target, last: "7d", granularity: "day" }
    });
    expect(result.structuredContent).toMatchObject({
      summary: { sessions: 2, active_visitors: 2 }
    });
    expect(result.structuredContent["summary"]).not.toHaveProperty("origin_scope");
    expect(result.content.some((item) => item.text.includes("2 original project namespaces"))).toBe(
      true
    );
    expect(
      (await metrics.getUsageSummary({ ...window, project_id: f.target, service: "Site" })).summary
        .sessions
    ).toBe(1);
    expect(
      (await metrics.getUsageSummary({ ...window, project_id: f.target, service: "web" })).summary
        .sessions
    ).toBe(1);
    expect(
      (await metrics.getUsageSummary({ ...window, project_id: f.source })).summary.sessions
    ).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM analytics_session_rollups WHERE project_id=ANY($1::uuid[])",
          [[f.source, f.target]]
        )
      ).rows[0].count
    ).toBe(2);
  });
  const definition = (key: string) => ({
    funnel_key: key,
    display_name: key,
    steps: [
      { step_key: "start", display_name: "Start" },
      { step_key: "end", display_name: "End" }
    ]
  });
  it("preserves saved funnel identity and combined admission after cutover", async () => {
    const f = await seedConsolidationProjects(pool, db),
      source = {
        organization_id: f.organizationId,
        project_id: f.source,
        created_by_user_id: f.userId
      };
    const created = await funnels.createSavedFunnelForProject({
      ...source,
      definition: definition("checkout")
    });
    expect(created.status).toBe("created");
    await f.consolidate();
    const root = { ...source, project_id: f.target };
    expect(await funnels.listSavedFunnelsForProject(root)).toMatchObject([
      { project_id: f.source, funnel_key: "checkout" }
    ]);
    expect(
      await funnels.updateSavedFunnelForProject({
        ...root,
        funnel_key: "checkout",
        update: { display_name: "Updated checkout" }
      })
    ).toMatchObject({ project_id: f.source, display_name: "Updated checkout" });
    expect(
      await funnels.createSavedFunnelForProject({ ...root, definition: definition("checkout") })
    ).toEqual({ status: "funnel_key_taken" });
    expect(
      await funnels.archiveSavedFunnelForProject({ ...root, funnel_key: "checkout" })
    ).toMatchObject({ project_id: f.source, archived_at: expect.any(String) });
  });
  it("blocks ambiguous saved definition keys before cutover", async () => {
    const f = await seedConsolidationProjects(pool, db);
    for (const project_id of [f.source, f.target])
      await funnels.createSavedFunnelForProject({
        organization_id: f.organizationId,
        project_id,
        created_by_user_id: f.userId,
        definition: definition("checkout")
      });
    const preview = await f.store.preview({ user_id: f.userId, request: f.request });
    expect(preview.ready).toBe(false);
    expect(preview.blockers).toContainEqual({
      code: "definition_key_conflict",
      project_id: null,
      resource: "analytics_funnel_definitions"
    });
  });
  it("finishes an accepted analytics report at its original scope and reserves a distinct combined report", async () => {
    const f = await seedConsolidationProjects(pool, db),
      generations = createPostgresAnalyticsBundleGenerationStore(db);
    const request = {
      project_id: f.target,
      requested_by_user_id: f.userId,
      analysis_kind: "usage_summary" as const,
      analysis_spec: window
    };
    for (const project of [f.target, f.source])
      await pool.query(
        `INSERT INTO analytics_session_rollups(project_id,service,environment,bucket_start,bucket_granularity,dimension_hash,sessions,total_pageviews) VALUES($1,'web','production',$2,'day','queued-scope',1,1)`,
        [project, window.from]
      );
    const old = await generations.reserveAnalyticsBundleGeneration(request);
    await f.consolidate();
    const claimed = await generations.claimAnalyticsBundleGenerationForProject({
      project_id: f.target,
      generation_id: old.generation_id,
      claimed_at: new Date().toISOString()
    });
    expect(claimed?.scope_origin_ids).toEqual([f.target]);
    expect(
      (
        await metrics.getUsageSummary({
          ...window,
          project_id: f.target,
          origin_project_ids: claimed!.scope_origin_ids!
        })
      ).summary
    ).toMatchObject({
      sessions: 1,
      origin_scope: {
        origin_project_ids: [f.target],
        unique_count_semantics: "sum_of_origin_scoped_counts"
      }
    });
    const combined = await generations.reserveAnalyticsBundleGeneration(request);
    expect(combined.generation_id).not.toBe(old.generation_id);
    expect(combined.input_fingerprint).not.toBe(old.input_fingerprint);
    expect(
      (
        await generations.claimAnalyticsBundleGenerationForProject({
          project_id: f.target,
          generation_id: combined.generation_id,
          claimed_at: new Date().toISOString()
        })
      )?.scope_origin_ids
    ).toEqual([f.source, f.target].sort());
    expect((await generations.reserveAnalyticsBundleGeneration(request)).generation_id).toBe(
      combined.generation_id
    );
  });
  it("serves imported incident impact through both canonical and retained hosted read scopes", async () => {
    const f = await seedConsolidationProjects(pool, db),
      incident = randomUUID();
    await pool.query(
      "INSERT INTO incidents(id,project_id,environment,fingerprint,title,severity,first_seen_at,last_seen_at) VALUES($1,$2,'production','impact-scoped','Scoped impact','high',$3,$3)",
      [incident, f.source, window.from]
    );
    await pool.query(
      "INSERT INTO analytics_incident_session_links(project_id,incident_id,service,environment,bucket_start,bucket_granularity,route_key,dimension_hash,subject_hash) VALUES($1,$2,'web','production',$3,'day','/checkout','one-dimension','one-subject')",
      [f.source, incident, window.from]
    );
    await f.consolidate();
    const access = createMetadataAccess(db),
      reads = createMetadataIncidentRead(db);
    const operations = createOpenAiAnalyticsOperations({
      analyticsMetrics: metrics,
      incidentRetrieval: reads,
      now: () => new Date(window.to),
      requireProjectAccess: async (principal, projectId) => {
        const allowed = await access.resolveProjectAccessForUser!({
          project_id: projectId,
          user_id: principal.userId
        });
        if (!allowed || allowed.organization_id !== principal.organizationId)
          throw new Error("denied");
        return allowed.origin_project_ids ?? [projectId];
      }
    });
    const principal = {
      userId: f.userId,
      organizationId: f.organizationId,
      grantId: randomUUID(),
      scopes: ["debugbundle:analytics:read"]
    };
    for (const projectId of [f.source, f.target])
      expect(
        await operations.get_incident_impact({
          principal,
          input: { projectId, incidentId: incident }
        })
      ).toMatchObject({
        incident_id: incident,
        affected_sessions: 1,
        window: { project_id: projectId }
      });
  });
  it("preserves flow IDs and live contexts while denying an old target credential access to imported flows", async () => {
    const f = await seedConsolidationProjects(pool, db),
      flows = createPostgresAnalyticsFlowStore(db),
      now = "2026-11-04T12:00:00.000Z",
      context = "x".repeat(43);
    const flow = await flows.save({ project_id: f.source, definition: flowInput, now });
    await flows.start({
      project_id: f.source,
      flow_key: flow.flow_key,
      context,
      origin: flow.steps[0]!.origin,
      step_key: flow.steps[0]!.step_key,
      now
    });
    await f.consolidate();
    expect(await flows.list({ project_id: f.target })).toMatchObject([
      { id: flow.id, project_id: f.source }
    ]);
    await expect(
      flows.start({
        project_id: f.target,
        flow_key: flow.flow_key,
        origin_project_ids: [f.target],
        context: "z".repeat(43),
        origin: flow.steps[0]!.origin,
        step_key: flow.steps[0]!.step_key,
        now
      })
    ).rejects.toMatchObject({ code: "not_found" });
    expect(
      await flows.start({
        project_id: f.target,
        flow_key: flow.flow_key,
        origin_project_ids: [f.source, f.target],
        context,
        origin: flow.steps[0]!.origin,
        step_key: flow.steps[0]!.step_key,
        now
      })
    ).toEqual({ expires_at: "2026-11-04T13:00:00.000Z" });
    const edited = await flows.save({
      project_id: f.target,
      definition: { ...flowInput, display_name: "Renamed flow" },
      now
    });
    expect(edited.id).toBe(flow.id);
    expect(edited.project_id).toBe(f.source);
  });
  it("uses current canonical analytics policy for retained-origin scheduling and retention", async () => {
    const f = await seedConsolidationProjects(pool, db),
      settings = createPostgresAnalyticsSettingsStore(db),
      scheduler = createPostgresAnalyticsOpportunitySchedulerStore(db),
      retention = createPostgresRetentionStore(db),
      event = randomUUID();
    for (const project_id of [f.target, f.source])
      await settings.updateAnalyticsSettings({
        project_id,
        update: { enabled: true, raw_retention_days: 1 }
      });
    await pool.query(
      `INSERT INTO analytics_session_rollups(project_id,service,environment,bucket_start,bucket_granularity,dimension_hash,sessions,total_pageviews) VALUES($1,'web','production','2026-11-02','day','retained-policy',1,1)`,
      [f.source]
    );
    await pool.query(
      "INSERT INTO analytics_ingestion_ledger(project_id,event_id,occurred_at,dedupe_key) VALUES($1,$2::uuid,'2026-11-02',$2::text)",
      [f.source, event]
    );
    await f.consolidate();
    const window = { cursor: null, limit: 1000, occurred_at: "2026-11-04T12:00:00.000Z" };
    expect(await scheduler.listProjectsForOpportunityEvaluation(window)).toContain(f.source);
    await settings.updateAnalyticsSettings({
      project_id: f.target,
      update: { enabled: false, raw_retention_days: 7 }
    });
    expect(await scheduler.listProjectsForOpportunityEvaluation(window)).not.toContain(f.source);
    expect(
      (
        await retention.listExpiredAnalyticsRawEvents({ now: window.occurred_at, limit: 1000 })
      ).some((r) => r.project_id === f.source && r.event_id === event)
    ).toBe(false);
  });
});
