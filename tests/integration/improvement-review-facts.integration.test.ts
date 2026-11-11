import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { seedConsolidationProjects } from "../helpers/consolidation-projects.js";
import { readReportIdentities } from "../../packages/storage/src/report-identity-store.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
import { resetReportRunFixture } from "../helpers/report-runs.js";
import { createImprovementReviewSettingsStore } from "../../packages/storage/src/improvement-review-settings.js";
import { createImprovementReviewScheduler } from "../../packages/storage/src/improvement-review-scheduler.js";
import { createImprovementReviewStore } from "../../packages/storage/src/improvement-review-store.js";
import { processNextImprovementReview } from "../../packages/storage/src/improvement-review-processor.js";
import { upsertAnalyticsOpportunity } from "../../packages/storage/src/analytics-opportunity-recording.js";
import { createPostgresImprovementOpportunityStore } from "../../packages/storage/src/improvement-opportunity-store.js";
runIntegration("weekly review retained evidence and privacy", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  let fixture: Awaited<ReturnType<typeof resetReportRunFixture>>;
  beforeEach(async () => {
    fixture = await resetReportRunFixture(pool, db, { plan: "team" });
  });
  afterAll(async () => {
    await pool.end();
  });
  it.each(["full", "restricted"] as const)(
    "collects bounded incident, current analytics and health facts in %s mode",
    async (privacy_mode) => {
      const actor = {
        organization_id: fixture.org,
        initiator: { version: 1 as const, kind: "browser_session" as const, user_id: fixture.owner }
      };
      await pool.query(
        "INSERT INTO project_analytics_settings(project_id,enabled,updated_at) VALUES($1,true,clock_timestamp()-interval '2 days')",
        [fixture.project]
      );
      for (const [fingerprint, days] of [
        ["old-policy", 3],
        ["current-policy", 1]
      ] as const)
        await upsertAnalyticsOpportunity(db, {
          projectId: fixture.project,
          service: "web",
          environment: "production",
          kind: "journey_friction",
          severity: "high",
          confidence: 0.9,
          fingerprint,
          title: fingerprint,
          summary: "Inspect https://private.test with token=synthetic-secret-value",
          evidence: {},
          detectedAt: new Date(Date.now() - days * 86400000).toISOString()
        });
      const incident = randomUUID();
      await pool.query(
        "INSERT INTO incidents(id,project_id,fingerprint,title,severity,status,first_seen_at,last_seen_at) VALUES($1,$2,'review-source','Captured issue at https://private.test','critical','open',clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 day')",
        [incident, fixture.project]
      );
      await createPostgresImprovementOpportunityStore(db).recordIncidentPattern!({
        project_id: fixture.project,
        kind: "recurring_incident",
        service_name: "api",
        environment: "production",
        incident_id: incident,
        incident_title: "Captured issue",
        incident_occurrence_count: 8,
        incident_severity: "critical",
        source_event_id: randomUUID(),
        source_event_type: "request_event",
        occurred_at: new Date(Date.now() - 86400000).toISOString(),
        confidence: 0.9,
        threshold: 1
      });
      const check = randomUUID();
      await pool.query(
        "INSERT INTO availability_checks(id,project_id,name,url,method,interval_seconds,status,last_checked_at) VALUES($1,$2,'API check','https://example.test','GET',60,'failing',clock_timestamp()-interval '1 minute')",
        [check, fixture.project]
      );
      await pool.query(
        "INSERT INTO availability_check_daily_rollups(id,check_id,project_id,day,state,total_checks,successful_checks,failed_checks,downtime_seconds,updated_at) VALUES($1,$2,$3,(date_trunc('week',clock_timestamp())-interval '7 days')::date,'down',10,8,2,120,clock_timestamp()-interval '1 minute')",
        [randomUUID(), check, fixture.project]
      );
      await createImprovementReviewSettingsStore(db).replace({
        ...actor,
        command: {
          expected_version: 0,
          enabled: true,
          project_ids: [fixture.project],
          source_consent: true,
          privacy_mode
        }
      });
      await pool.query(
        "UPDATE improvement_review_settings SET next_due_at=clock_timestamp()-interval '1 day'"
      );
      await createImprovementReviewScheduler(db).scheduleNext();
      await processNextImprovementReview({ db, model: null });
      const store = createImprovementReviewStore(db),
        list = await store.list(actor),
        result = await store.bundle({ ...actor, id: list.items[0]!.id });
      expect(result.bundle?.facts.sources.map((source) => source.kind).sort()).toEqual([
        "analytics",
        "health",
        "improvement",
        "incident"
      ]);
      const incidentSource = result.bundle!.facts.sources.find(
        (source) => source.kind === "incident"
      )!;
      expect(
        result.bundle!.facts.sources.find((source) => source.kind === "improvement")!.related_refs
      ).toEqual([incidentSource.ref]);
      expect(result.bundle?.facts.health).toMatchObject({
        total_checks: 10,
        successful_checks: 8,
        estimated_check_downtime_seconds: 120
      });
      const source = result.bundle!.facts.sources.find((source) => source.kind === "analytics")!;
      if (privacy_mode === "full") expect(source.title).toBe("current-policy");
      else expect(source.context).toBeNull();
      const text = JSON.stringify(result.bundle);
      expect(text).not.toContain("old-policy");
      expect(text).not.toContain("private.test");
      expect(text).not.toContain("synthetic-secret-value");
      expect(result.bundle?.facts.limitations).toContain(
        "Analytics opportunity summaries predating the current analytics policy are withheld."
      );
    }
  );
  it("preserves accepted review origins through consolidation and respects the current canonical opt-out", async () => {
    await migrateStorageSchema(db);
    const f = await seedConsolidationProjects(pool, db);
    await pool.query("UPDATE users SET email_verified_at=clock_timestamp() WHERE id=$1", [
      f.userId
    ]);
    const actor = {
        organization_id: f.organizationId,
        initiator: { version: 1 as const, kind: "browser_session" as const, user_id: f.userId }
      },
      settings = createImprovementReviewSettingsStore(db);
    const selected = await settings.replace({
      ...actor,
      command: { expected_version: 0, enabled: true, project_ids: [f.source], source_consent: true }
    });
    await pool.query(
      "UPDATE improvement_review_settings SET next_due_at=clock_timestamp()-interval '1 day' WHERE organization_id=$1",
      [f.organizationId]
    );
    await createImprovementReviewScheduler(db).scheduleNext();
    await processNextImprovementReview({ db, model: null });
    const store = createImprovementReviewStore(db),
      id = (await store.list(actor)).items[0]!.id;
    f.request.service_mappings[0]!.name = "Renamed API";
    await f.consolidate();
    expect((await settings.get(actor)).scope).toEqual(selected.scope);
    expect((await store.bundle({ ...actor, id })).bundle?.facts.project_id).toBe(f.source);
    expect(await readReportIdentities(db, selected.scope)).toEqual(
      expect.arrayContaining(["System", "Renamed API"])
    );
    await pool.query(
      "UPDATE projects SET automated_improvement_bundles_enabled=false WHERE id=$1",
      [f.target]
    );
    await pool.query(
      "UPDATE improvement_review_settings SET next_due_at=clock_timestamp()-interval '1 day' WHERE organization_id=$1",
      [f.organizationId]
    );
    await createImprovementReviewScheduler(db).scheduleNext();
    expect(await settings.get(actor)).toMatchObject({ enabled: false, requires_review: true });
  });
  it("irreversibly invalidates older reviews when a newly inserted governing privacy policy is narrower", async () => {
    const actor = {
      organization_id: fixture.org,
      initiator: { version: 1 as const, kind: "browser_session" as const, user_id: fixture.owner }
    };
    await createImprovementReviewSettingsStore(db).replace({
      ...actor,
      command: {
        expected_version: 0,
        enabled: true,
        project_ids: [fixture.project],
        source_consent: true
      }
    });
    await pool.query(
      "UPDATE improvement_review_settings SET next_due_at=clock_timestamp()-interval '1 day'"
    );
    await createImprovementReviewScheduler(db).scheduleNext();
    await processNextImprovementReview({ db, model: null });
    await pool.query(
      "INSERT INTO project_analytics_settings(project_id,enabled,privacy_mode,aggregate_retention_months) VALUES($1,true,'strict',1)",
      [fixture.project]
    );
    await pool.query(
      "UPDATE project_analytics_settings SET aggregate_retention_months=12 WHERE project_id=$1",
      [fixture.project]
    );
    expect((await pool.query("SELECT id FROM improvement_reviews")).rowCount).toBe(0);
  });
  it("invalidates retained-origin reviews when canonical privacy narrows and never restores them on widening", async () => {
    await migrateStorageSchema(db);
    const f = await seedConsolidationProjects(pool, db);
    await pool.query("UPDATE users SET email_verified_at=clock_timestamp() WHERE id=$1", [
      f.userId
    ]);
    const actor = {
      organization_id: f.organizationId,
      initiator: { version: 1 as const, kind: "browser_session" as const, user_id: f.userId }
    };
    await createImprovementReviewSettingsStore(db).replace({
      ...actor,
      command: { expected_version: 0, enabled: true, project_ids: [f.source], source_consent: true }
    });
    await f.consolidate();
    await pool.query(
      "INSERT INTO project_analytics_settings(project_id,enabled,privacy_mode) VALUES($1,true,'standard') ON CONFLICT(project_id) DO UPDATE SET enabled=true,privacy_mode='standard'",
      [f.target]
    );
    await pool.query(
      "UPDATE improvement_review_settings SET next_due_at=clock_timestamp()-interval '1 day' WHERE organization_id=$1",
      [f.organizationId]
    );
    await createImprovementReviewScheduler(db).scheduleNext();
    await processNextImprovementReview({ db, model: null });
    const store = createImprovementReviewStore(db),
      id = (await store.list(actor)).items[0]!.id;
    expect((await store.bundle({ ...actor, id })).bundle?.facts.project_id).toBe(f.source);
    await pool.query(
      "UPDATE project_analytics_settings SET privacy_mode='strict' WHERE project_id=$1",
      [f.target]
    );
    await pool.query(
      "UPDATE project_analytics_settings SET privacy_mode='standard' WHERE project_id=$1",
      [f.target]
    );
    expect(
      (await pool.query("SELECT id FROM improvement_reviews WHERE id=$1", [id])).rowCount
    ).toBe(0);
    await expect(store.get({ ...actor, id })).rejects.toThrow("report_not_found");
  });
  it.each(["unicode", "redaction"])(
    "preserves Unicode and keeps useful factual reviews after %s source minimisation",
    async (kind) => {
      const actor = {
        organization_id: fixture.org,
        initiator: { version: 1 as const, kind: "browser_session" as const, user_id: fixture.owner }
      };
      const title = kind === "unicode" ? "a" + "😀".repeat(160) : "a".repeat(151) + " a@b.co";
      await pool.query(
        "INSERT INTO incidents(id,project_id,fingerprint,title,severity,status,first_seen_at,last_seen_at) VALUES($1,$2,'bounded-title',$3,'critical','open',clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 day')",
        [randomUUID(), fixture.project, title]
      );
      await createImprovementReviewSettingsStore(db).replace({
        ...actor,
        command: {
          expected_version: 0,
          enabled: true,
          project_ids: [fixture.project],
          source_consent: true,
          privacy_mode: "full"
        }
      });
      await pool.query(
        "UPDATE improvement_review_settings SET next_due_at=clock_timestamp()-interval '1 day'"
      );
      await createImprovementReviewScheduler(db).scheduleNext();
      await expect(processNextImprovementReview({ db, model: null })).resolves.toEqual({
        processed: true
      });
      const store = createImprovementReviewStore(db),
        id = (await store.list(actor)).items[0]!.id,
        source = (await store.bundle({ ...actor, id })).bundle!.facts.sources[0]!;
      expect([...source.title].length).toBeLessThanOrEqual(160);
      expect(source.title).not.toMatch(/[\uD800-\uDBFF]$/u);
      expect(source.title).not.toContain("a@b.co");
      expect(source.count).toBe(1);
    }
  );
});
