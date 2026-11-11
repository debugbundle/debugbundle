import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
import { resetReportRunFixture, reportTestCost, reportTestUsage } from "../helpers/report-runs.js";
import { reportModelProfile } from "../../packages/smart-reports/src/model-request.js";
import { lastCompletedReportPeriod } from "../../packages/smart-reports/src/report-period.js";
import { buildReviewModelRequest } from "../../packages/smart-improvements/src/model-client.js";
import { createImprovementReviewSettingsStore } from "../../packages/storage/src/improvement-review-settings.js";
import { createImprovementReviewScheduler } from "../../packages/storage/src/improvement-review-scheduler.js";
import { createImprovementReviewStore } from "../../packages/storage/src/improvement-review-store.js";
import { createPostgresImprovementOpportunityStore } from "../../packages/storage/src/improvement-opportunity-store.js";
import { processNextImprovementReview } from "../../packages/storage/src/improvement-review-processor.js";
import { collectImprovementReviewContext } from "../../packages/storage/src/improvement-review-context.js";
import { createPostgresCapturePolicyStore } from "../../packages/storage/src/capture-policy-store.js";
import { createPostgresCaptureRuleStore } from "../../packages/storage/src/capture-rule-store.js";
import {
  migrateStorageSchema,
  assertStorageSchemaMigrationsApplied
} from "../../packages/storage/src/schema-migrations.js";
import { IMPROVEMENT_REVIEW_PLANNING_MIGRATION } from "../../packages/storage/src/improvement-review-planning-schema.js";
import { ReviewArtifactSchema } from "../../packages/smart-improvements/src/review-contract.js";
import { ReviewPlanDocumentSchema } from "../../packages/smart-improvements/src/review-planning-contract.js";
import { reviewFactsFixture } from "../helpers/improvement-reviews.js";
import { reviewEvidenceDigest } from "../../packages/smart-improvements/src/review.js";
import { planReview } from "../../packages/smart-improvements/src/review-planning.js";
import { upsertAnalyticsOpportunity } from "../../packages/storage/src/analytics-opportunity-recording.js";

runIntegration("weekly improvement planning and compatibility", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  let fixture: Awaited<ReturnType<typeof resetReportRunFixture>>;
  beforeEach(async () => {
    fixture = await resetReportRunFixture(pool, db, { plan: "team" });
  });
  afterAll(async () => {
    await pool.end();
  });
  const actor = () => ({
    organization_id: fixture.org,
    initiator: { version: 1 as const, kind: "browser_session" as const, user_id: fixture.owner }
  });
  async function schedule() {
    await createImprovementReviewSettingsStore(db).replace({
      ...actor(),
      command: {
        expected_version: 0,
        enabled: true,
        project_ids: [fixture.project],
        source_consent: true,
        privacy_mode: "restricted"
      }
    });
    await pool.query(
      "UPDATE improvement_review_settings SET next_due_at=clock_timestamp()-interval '1 day'"
    );
    await createImprovementReviewScheduler(db).scheduleNext();
    return (await pool.query<{ id: string }>("SELECT id FROM improvement_reviews")).rows[0]!.id;
  }
  async function warning() {
    const store = createPostgresImprovementOpportunityStore(db),
      event = randomUUID(),
      now = new Date().toISOString();
    const opportunity = await store.recordWarningHotspot({
      project_id: fixture.project,
      service_name: "api",
      environment: "production",
      normalized_message: "Expected retry needs verification",
      source_event_id: event,
      occurred_at: now,
      severity: "low",
      confidence: 0.8,
      threshold: 1
    });
    await store.reserveImprovementBundleGeneration({
      opportunity_id: opportunity!.opportunity_id,
      event_id: event,
      occurred_at: now,
      trigger: "occurrence_threshold"
    });
  }
  it("freezes review evidence and useful noise plans with zero model calls, preserving existing exports", async () => {
    await warning();
    await createPostgresCapturePolicyStore(db).createDefaultCapturePolicy(fixture.project, "team");
    const id = await schedule();
    await processNextImprovementReview({ db, model: null });
    const store = createImprovementReviewStore(db),
      result = await store.plan({ ...actor(), id });
    const bundle = ReviewPlanDocumentSchema.parse(result.bundle);
    expect(bundle.context!.configuration.coverage).toBe("complete");
    expect(bundle.context!.configuration.origins[0]).toMatchObject({
      preset: "balanced",
      logs: "warning"
    });
    expect(bundle.plans[0]).toMatchObject({ action: "review_noise" });
    expect(bundle.plans[0]!.controls.map((c) => c.control)).toContain("capture_rules");
    const old = await store.bundle({ ...actor(), id });
    expect(ReviewArtifactSchema.parse(old.bundle).schema_version).toBe("improvement_review.v1");
    expect(old.bundle).not.toHaveProperty("context");
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM improvement_review_attempts")).rows[0]!.n
    ).toBe(0);
    const stored = (await pool.query("SELECT facts_digest,review_context FROM improvement_reviews"))
      .rows[0]!;
    expect(stored.facts_digest).toBe(reviewEvidenceDigest(bundle.facts));
    expect(stored.review_context.context).toEqual(bundle.context);
    expect(stored.review_context.digest).toMatch(/^[a-f0-9]{64}$/);
    await pool.query(
      "UPDATE improvement_reviews SET review_context=jsonb_set(review_context,'{digest}',to_jsonb($2::text)) WHERE id=$1",
      [id, "0".repeat(64)]
    );
    await expect(store.plan({ ...actor(), id })).rejects.toThrow("review_context_integrity_failed");
  });

  it("binds a qualified attempt once and preserves AI investigations in the existing export", async () => {
    await warning();
    const id = await schedule();
    const run = vi.fn(async (before: () => Promise<void>) => {
      await before();
      return {
        state: "succeeded" as const,
        usage: reportTestUsage,
        cost_nano_usd: reportTestCost,
        provider_response_id: "resp_review_fixture",
        guidance: {
          version: 1 as const,
          investigations: [
            {
              title: "Inspect the warning evidence",
              hypothesis: null,
              checks: ["Confirm expected behaviour and check for user impact."],
              evidence_refs: ["e1"]
            }
          ]
        }
      };
    });
    const prepare = vi.fn(async () => ({
      profile: reportModelProfile("gpt-6.1-terra"),
      maximum_nano_usd: 24750000,
      input_tokens: 100,
      request_hash: "a".repeat(64),
      run
    }));
    await processNextImprovementReview({ db, model: { prepare } });
    await processNextImprovementReview({ db, model: { prepare } });
    expect(run).toHaveBeenCalledOnce();
    const store = createImprovementReviewStore(db),
      canonical = await store.plan({ ...actor(), id });
    expect(canonical.bundle?.analysis).toBe("available");
    expect((await store.bundle({ ...actor(), id })).bundle?.guidance).toEqual(
      canonical.bundle?.guidance
    );
    expect(
      (await pool.query("SELECT generations,spent_nano_usd FROM improvement_review_usage")).rows[0]
    ).toMatchObject({ generations: 1, spent_nano_usd: String(reportTestCost) });
    await createImprovementReviewSettingsStore(db).replace({
      ...actor(),
      command: { expected_version: 1, enabled: false, project_ids: [], source_consent: false }
    });
    expect(
      (
        await pool.query("SELECT review_context,artifact FROM improvement_reviews WHERE id=$1", [
          id
        ])
      ).rows
    ).toEqual([]);
    expect(
      (await pool.query("SELECT review_id,validated_guidance FROM improvement_review_attempts"))
        .rows[0]
    ).toMatchObject({ review_id: null, validated_guidance: null });
    expect(
      (await pool.query("SELECT generations,spent_nano_usd FROM improvement_review_usage")).rows[0]
    ).toMatchObject({ generations: 1, spent_nano_usd: String(reportTestCost) });
  });
  it("collects scoped rule/delivery facts without destinations or matchers and suggests the existing controls", async () => {
    const incident = randomUUID(),
      alert = randomUUID(),
      rule = randomUUID(),
      period = lastCompletedReportPeriod("weekly", new Date().toISOString());
    await pool.query(
      "INSERT INTO incidents(id,project_id,fingerprint,title,severity,status,first_seen_at,last_seen_at) VALUES($1,$2,'config-noise','Resource failure needs verification','medium','open',$3,$3)",
      [incident, fixture.project, period.starts_at]
    );
    await createPostgresCapturePolicyStore(db).createDefaultCapturePolicy(fixture.project, "team");
    await createPostgresCaptureRuleStore(db).createCaptureRule({
      id: rule,
      project_id: fixture.project,
      name: "Private rule",
      description: "https://private.test",
      action: "sample",
      sample_rate: 0.5,
      matcher: { event_types: ["frontend_exception"] },
      created_from_incident_id: incident
    });
    await pool.query("UPDATE capture_rules SET hit_count=5,last_matched_at=$2 WHERE id=$1", [
      rule,
      period.starts_at
    ]);
    await pool.query(
      "INSERT INTO alert_rules(id,project_id,created_by_user_id,channel,condition_type,cooldown_seconds,config) VALUES($1,$2,$3,'webhook','new_incident',0,$4::jsonb)",
      [
        alert,
        fixture.project,
        fixture.owner,
        JSON.stringify({ target_url: "https://private.test/secret", cooldown_scope: "incident" })
      ]
    );
    for (let i = 0; i < 2; i++)
      await pool.query(
        "INSERT INTO alert_deliveries(id,alert_id,project_id,incident_id,condition_type,dedupe_key,channel,status,payload,created_at,updated_at,delivered_at) VALUES($1,$2,$3,$4,'new_incident',$5,'webhook','delivered','{}'::jsonb,$6,$6,$6)",
        [randomUUID(), alert, fixture.project, incident, `fixture-${i}`, period.starts_at]
      );
    const id = await schedule();
    await processNextImprovementReview({ db, model: null });
    const bundle = ReviewPlanDocumentSchema.parse(
      (await createImprovementReviewStore(db).plan({ ...actor(), id })).bundle
    );
    expect(bundle.context!.configuration.rules[0]).toMatchObject({
      action: "sample",
      lifetime_hits: 5,
      source_refs: ["e1"]
    });
    expect(bundle.context!.configuration.alerts[0]).toMatchObject({
      delivered_rows: 2,
      repeated_source_refs: ["e1"],
      source_refs: ["e1"]
    });
    expect(bundle.plans[0]!.controls.map((c) => c.control)).toEqual(
      expect.arrayContaining(["capture_rules", "capture_policy", "alert_delivery"])
    );
    const request = buildReviewModelRequest(bundle.facts, bundle.context!).body;
    expect(request).not.toContain("private.test");
    expect(request).not.toContain("Private rule");
    expect(request).not.toContain(rule);
    expect(request).not.toContain(alert);
    await pool.query(
      `INSERT INTO alert_deliveries(id,alert_id,project_id,incident_id,condition_type,dedupe_key,channel,status,payload,created_at,updated_at,delivered_at)
       SELECT gen_random_uuid(),$1,$2,$3,'new_incident','overflow-'||n,'webhook','delivered','{}'::jsonb,$4,$4,$4 FROM generate_series(1,101) n`,
      [alert, fixture.project, incident, period.starts_at]
    );
    const bounded = await collectImprovementReviewContext(db, bundle.facts, [fixture.project]);
    expect(bounded.configuration.coverage).toBe("partial");
    expect(bounded.configuration.alerts[0]).toMatchObject({
      delivered_rows: null,
      repeated_source_refs: ["e1"]
    });
    // Reading current configuration never rewrites the retained review.
    expect((await createImprovementReviewStore(db).plan({ ...actor(), id })).bundle).toEqual(
      bundle
    );
  });
  it("detects repeated delivery across scoped rules without conflating distinct incidents or foreign scopes", async () => {
    const incidents = Array.from({ length: 4 }, () => randomUUID()),
      alerts = Array.from({ length: 3 }, () => randomUUID()),
      foreign = randomUUID(),
      operation = randomUUID(),
      facts = reviewFactsFixture();
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Unaccepted origin',$1::text)",
      [foreign, fixture.org, fixture.owner]
    );
    await pool.query(
      "INSERT INTO project_merge_operations(id,organization_id,actor_user_id,target_project_id,idempotency_key,request,plan_digest,state) VALUES($1::uuid,$2,$3,$4,$1::text,'{}',$5,'completed')",
      [operation, fixture.org, fixture.owner, fixture.project, "a".repeat(64)]
    );
    await pool.query(
      "INSERT INTO project_legacy_bindings(legacy_project_id,canonical_project_id,scope_origin_ids,operation_id) VALUES($1,$2,ARRAY[$1::uuid],$3)",
      [foreign, fixture.project, operation]
    );
    facts.project_id = fixture.project;
    facts.period = lastCompletedReportPeriod("weekly", new Date().toISOString());
    facts.sources = incidents.map((id, i) => ({
      ...facts.sources[0]!,
      ref: `e${i + 1}`,
      source_id: id,
      origin_project_id: fixture.project
    }));
    for (const incident of incidents)
      await pool.query(
        "INSERT INTO incidents(id,project_id,fingerprint,title,severity,status,first_seen_at,last_seen_at) VALUES($1::uuid,$2,$1::text,'Observed failure','critical','open',$3,$3)",
        [incident, fixture.project, facts.period.starts_at]
      );
    for (const [i, alert] of alerts.entries())
      await pool.query(
        "INSERT INTO alert_rules(id,project_id,created_by_user_id,channel,condition_type,cooldown_seconds,scope_origin_ids,config) VALUES($1,$2,$3,'webhook','new_incident',0,$4::uuid[],'{}'::jsonb)",
        [
          alert,
          fixture.project,
          fixture.owner,
          i === 2 ? [fixture.project, foreign] : [fixture.project]
        ]
      );
    // Same incident across two in-scope rules; distinct incidents; and a pair
    // whose second delivery belongs to a rule spanning an unaccepted origin.
    for (const [alertIndex, incidentIndex] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 2],
      [0, 3],
      [2, 3]
    ])
      await pool.query(
        "INSERT INTO alert_deliveries(id,alert_id,project_id,incident_id,condition_type,dedupe_key,channel,status,payload,created_at,updated_at,delivered_at) VALUES($1::uuid,$2,$3,$4,'new_incident',$1::text,'webhook','delivered','{}'::jsonb,$5,$5,$5)",
        [
          randomUUID(),
          alerts[alertIndex!],
          fixture.project,
          incidents[incidentIndex!],
          facts.period.starts_at
        ]
      );
    facts.cutoff_at = new Date().toISOString();
    const context = await collectImprovementReviewContext(db, facts, [fixture.project]);
    expect(context.configuration.alerts.filter((a) => a.delivered_rows !== null)).toHaveLength(2);
    expect(context.configuration.alerts.flatMap((a) => a.repeated_source_refs)).toEqual([
      "e1",
      "e1"
    ]);
    expect(
      planReview(facts, context)
        .filter((p) => p.controls.some((c) => c.control === "alert_delivery"))
        .map((p) => p.source_refs)
    ).toEqual([["e1"]]);
    expect(JSON.stringify(context)).not.toContain(foreign);
  });
  it("never imports a foreign project's config or secret rule text", async () => {
    const foreign = randomUUID();
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Foreign',$1::text)",
      [foreign, fixture.org, fixture.owner]
    );
    await createPostgresCapturePolicyStore(db).upsertCapturePolicy({
      project_id: foreign,
      preset: "investigative"
    });
    await createPostgresCaptureRuleStore(db).createCaptureRule({
      id: randomUUID(),
      project_id: fixture.project,
      name: "HiddenRule owner@example.test",
      description: "https://private.test/secret",
      action: "demote",
      matcher: { event_types: ["log_event"] }
    });
    const facts = reviewFactsFixture();
    facts.project_id = fixture.project;
    facts.sources = [];
    facts.cutoff_at = new Date().toISOString();
    const context = await collectImprovementReviewContext(db, facts, [fixture.project]);
    expect(context.configuration.origins.map((o) => o.origin_project_id)).toEqual([
      fixture.project
    ]);
    expect(JSON.stringify(context)).not.toContain(foreign);
    expect(JSON.stringify(context)).not.toContain("HiddenRule");
    expect(JSON.stringify(context)).not.toContain("private.test");
    expect(context.configuration.rules).toHaveLength(1);
    expect(context.configuration.coverage).toBe("unavailable");
  });
  it("reads allowlisted numeric analytics with actual windows and leaves unknown baselines as snapshots", async () => {
    const facts = reviewFactsFixture();
    facts.project_id = fixture.project;
    await upsertAnalyticsOpportunity(db, {
      projectId: fixture.project,
      service: "web",
      environment: "production",
      kind: "route_health",
      severity: "medium",
      confidence: 0.8,
      fingerprint: "windowed-analytics",
      title: "Route exit signal",
      summary: "Inspect comparable evidence",
      evidence: {
        analysis_window: { from: facts.period.starts_at, to: facts.period.ends_at },
        current_sessions: 40,
        current_exits: 20,
        baseline_sessions: 50,
        baseline_exits: 5,
        dropoff_rate: 2,
        event_count: "secret@example.test",
        raw: "private narrative"
      },
      detectedAt: facts.period.ends_at
    });
    const row = (
      await pool.query<{ id: string }>(
        "SELECT id FROM analytics_opportunities WHERE fingerprint='windowed-analytics'"
      )
    ).rows[0]!;
    facts.sources = [
      {
        ...facts.sources[0]!,
        kind: "analytics",
        origin_project_id: fixture.project,
        source_id: row.id
      }
    ];
    // Post-cutoff metadata is unknown. Materialise a retained observation at
    // the fixed fixture date for the positive case, without racing wall clocks.
    expect(
      (await collectImprovementReviewContext(db, facts, [fixture.project])).signals[0]!.detector
    ).toBe("unknown");
    await pool.query("UPDATE analytics_opportunities SET updated_at=$2 WHERE id=$1", [
      row.id,
      facts.period.ends_at
    ]);
    const context = await collectImprovementReviewContext(db, facts, [fixture.project]);
    expect(context.signals[0]).toMatchObject({
      detector: "route_exit",
      window: { starts_at: facts.period.starts_at, ends_at: facts.period.ends_at }
    });
    expect(context.signals[0]!.measurements).toEqual(
      expect.arrayContaining([
        { key: "current_sessions", value: 40, unit: "count", basis: "period" },
        { key: "baseline_sessions", value: 50, unit: "count", basis: "snapshot" }
      ])
    );
    expect(context.signals[0]!.measurements.map((m) => m.key)).not.toContain("dropoff_rate");
    expect(JSON.stringify(context)).not.toContain("secret@example.test");
    expect(JSON.stringify(context)).not.toContain("private narrative");
    await pool.query(
      "UPDATE analytics_opportunities SET evidence=evidence-'analysis_window',updated_at=$2 WHERE id=$1",
      [row.id, facts.period.ends_at]
    );
    const unknown = await collectImprovementReviewContext(db, facts, [fixture.project]);
    expect(unknown.signals[0]!.window).toBeNull();
    expect(unknown.signals[0]!.measurements.every((m) => m.basis === "snapshot")).toBe(true);
  });
  it("upgrades the released schema without changing prior checksums and fails closed before migration", async () => {
    await migrateStorageSchema(db);
    const before = (
      await pool.query(
        "SELECT id,checksum FROM storage_migration_ledger WHERE id<>$1 ORDER BY id",
        [IMPROVEMENT_REVIEW_PLANNING_MIGRATION.id]
      )
    ).rows;
    // This database is owned by this disposable integration fixture only.
    await pool.query("DELETE FROM storage_migration_ledger WHERE id=$1", [
      IMPROVEMENT_REVIEW_PLANNING_MIGRATION.id
    ]);
    await pool.query("ALTER TABLE improvement_reviews DROP COLUMN review_context");
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "storage_schema_missing_migrations"
    );
    await migrateStorageSchema(db);
    expect(
      (
        await pool.query(
          "SELECT id,checksum FROM storage_migration_ledger WHERE id<>$1 ORDER BY id",
          [IMPROVEMENT_REVIEW_PLANNING_MIGRATION.id]
        )
      ).rows
    ).toEqual(before);
    await assertStorageSchemaMigrationsApplied(db);
    const constraint = (
      await pool.query<{ definition: string }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='improvement_reviews'::regclass AND conname='improvement_reviews_context_size_check'"
      )
    ).rows[0]!.definition;
    await pool.query(
      "ALTER TABLE improvement_reviews DROP CONSTRAINT improvement_reviews_context_size_check"
    );
    try {
      await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
        "improvement_review_planning_schema_incomplete"
      );
    } finally {
      await pool.query(
        `ALTER TABLE improvement_reviews ADD CONSTRAINT improvement_reviews_context_size_check ${constraint}`
      );
    }
  });
});
