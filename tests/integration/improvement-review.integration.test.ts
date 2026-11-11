import { createImprovementReviewAllowance } from "../../packages/storage/src/improvement-review-allowance.js";
import { createSmartReportProcessor } from "../../apps/worker/src/smart-report-runtime.js";
import { createBusinessAccountExportStore } from "../../packages/storage/src/business-account-export.js";
import { createImprovementReviewExecutionStore } from "../../packages/storage/src/improvement-review-execution.js";
import { createWorkerJobStore } from "../../packages/storage/src/worker-job-store.js";
import type {
  PreparedReviewAttempt,
  ReviewModelClient
} from "../../packages/smart-improvements/src/model-client.js";
import { reviewFactsFixture } from "../helpers/improvement-reviews.js";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { resetReportRunFixture, reportTestUsage, reportTestCost } from "../helpers/report-runs.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
import { createImprovementReviewSettingsStore } from "../../packages/storage/src/improvement-review-settings.js";
import { createImprovementReviewScheduler } from "../../packages/storage/src/improvement-review-scheduler.js";
import { createImprovementReviewStore } from "../../packages/storage/src/improvement-review-store.js";
import { processNextImprovementReview } from "../../apps/worker/src/improvement-review-processor.js";
import { createImprovementReviewAttemptStore } from "../../packages/storage/src/improvement-review-attempts.js";
import { reportModelProfile } from "../../packages/smart-reports/src/model-request.js";
import { createPostgresImprovementOpportunityStore } from "../../packages/storage/src/improvement-opportunity-store.js";
import { maintainImprovementReviews } from "../../packages/storage/src/improvement-review-retention.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";

runIntegration("consented weekly improvement reviews", () => {
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
  async function enable() {
    await createImprovementReviewSettingsStore(db).replace({
      ...actor(),
      command: {
        expected_version: 0,
        enabled: true,
        project_ids: [fixture.project],
        source_consent: true
      }
    });
  }
  async function schedule() {
    await pool.query(
      "UPDATE improvement_review_settings SET next_due_at=clock_timestamp()-interval '45 days'"
    );
    await createImprovementReviewScheduler(db).scheduleNext();
    return (
      await pool.query<{ id: string }>(
        "SELECT id FROM improvement_reviews ORDER BY created_at DESC LIMIT 1"
      )
    ).rows[0]!.id;
  }
  async function evidence() {
    const store = createPostgresImprovementOpportunityStore(db),
      source = randomUUID(),
      at = new Date().toISOString();
    const result = await store.recordWarningHotspot({
      project_id: fixture.project,
      service_name: "worker",
      environment: "production",
      normalized_message: "Captured retry pattern",
      source_event_id: source,
      occurred_at: at,
      severity: "high",
      confidence: 0.9,
      threshold: 1
    });
    if (!result) throw new Error("missing_qualified_opportunity");
    await store.reserveImprovementBundleGeneration({
      opportunity_id: result.opportunity_id,
      event_id: source,
      occurred_at: at,
      trigger: "occurrence_threshold"
    });
    expect(
      await store.listImprovementsForOrganization({
        organization_id: fixture.org,
        project_id: fixture.project,
        status: "open",
        limit: 7
      })
    ).toHaveLength(1);
  }
  function model(state: "succeeded" | "rejected" | "uncertain" = "succeeded") {
    const paid = vi.fn<PreparedReviewAttempt["run"]>(async (before: () => Promise<void>) => {
      await before();
      return state === "uncertain"
        ? { state, maximum_nano_usd: 24750000 }
        : {
            state,
            usage: reportTestUsage,
            cost_nano_usd: reportTestCost,
            provider_response_id: "resp_review_fixture",
            guidance:
              state === "rejected"
                ? null
                : {
                    version: 1,
                    investigations: [
                      {
                        title: "Investigate the warning",
                        hypothesis: null,
                        checks: ["Inspect the captured pattern and verify its cause."],
                        evidence_refs: ["e1"]
                      }
                    ]
                  }
          };
    });
    const prepare = vi.fn<ReviewModelClient["prepare"]>().mockResolvedValue({
      profile: reportModelProfile("gpt-6.1-terra"),
      maximum_nano_usd: 24750000,
      input_tokens: 100,
      request_hash: "c".repeat(64),
      run: paid
    });
    return { prepare, paid };
  }
  it("requires consent and owner authority, defaults existing customers off, and catches up only the latest completed week", async () => {
    const settings = createImprovementReviewSettingsStore(db);
    expect(await settings.get(actor())).toMatchObject({ version: 0, enabled: false, scope: [] });
    await expect(
      settings.replace({
        ...actor(),
        command: {
          expected_version: 0,
          enabled: true,
          project_ids: [fixture.project],
          source_consent: false
        }
      })
    ).rejects.toThrow();
    await enable();
    const request = model();
    const id = await schedule();
    await createImprovementReviewScheduler(db).scheduleNext();
    expect((await pool.query("SELECT * FROM improvement_reviews")).rowCount).toBe(1);
    await processNextImprovementReview({ db, model: request });
    expect((await createImprovementReviewStore(db).get({ ...actor(), id })).status).toBe("no_data");
    expect(request.prepare).not.toHaveBeenCalled();
    expect((await pool.query("SELECT * FROM improvement_review_usage")).rowCount).toBe(0);
    expect(
      (
        await pool.query(
          "SELECT next_due_at>clock_timestamp() AS future FROM improvement_review_settings"
        )
      ).rows[0]?.future
    ).toBe(true);
  });
  it.each(["succeeded", "rejected", "uncertain"] as const)(
    "settles %s once in its own budget and never retries a paid result",
    async (state) => {
      await enable();
      await evidence();
      const id = await schedule(),
        request = model(state);
      expect(await processNextImprovementReview({ db, model: request })).toEqual({
        processed: true
      });
      const result = await createImprovementReviewStore(db).bundle({ ...actor(), id });
      expect(result.bundle?.facts.sources.length).toBeGreaterThan(0);
      expect(result.bundle?.analysis).toBe(state === "succeeded" ? "available" : "unavailable");
      await processNextImprovementReview({ db, model: request });
      expect(request.prepare).toHaveBeenCalledOnce();
      expect(request.paid).toHaveBeenCalledOnce();
      expect((await pool.query("SELECT * FROM report_model_attempts")).rowCount).toBe(0);
      expect((await pool.query("SELECT * FROM report_allowance_windows")).rowCount).toBe(0);
      expect(await createImprovementReviewAllowance(db)(actor())).toMatchObject({
        limit: 25,
        used: 1,
        remaining: 24
      });
      const usage = (
        await pool.query(
          "SELECT generations,held_nano_usd,spent_nano_usd FROM improvement_review_usage"
        )
      ).rows[0];
      expect(usage).toEqual({
        generations: 1,
        held_nano_usd: state === "uncertain" ? "24750000" : "0",
        spent_nano_usd: state === "uncertain" ? "0" : String(reportTestCost)
      });
    }
  );
  it("keeps paid uncertainty held after consent deletion and rejects access through another workspace", async () => {
    await enable();
    await evidence();
    const id = await schedule();
    await processNextImprovementReview({ db, model: model("uncertain") });
    const store = createImprovementReviewStore(db);
    await expect(store.get({ ...actor(), organization_id: randomUUID(), id })).rejects.toThrow(
      "report_not_found"
    );
    await createImprovementReviewSettingsStore(db).replace({
      ...actor(),
      command: { expected_version: 1, enabled: false, project_ids: [], source_consent: false }
    });
    expect((await pool.query("SELECT * FROM improvement_reviews")).rowCount).toBe(0);
    expect(
      (await pool.query("SELECT state,review_id FROM improvement_review_attempts")).rows[0]
    ).toEqual({ state: "uncertain", review_id: null });
    expect(
      (await pool.query("SELECT held_nano_usd FROM improvement_review_usage")).rows[0]
        ?.held_nano_usd
    ).toBe("24750000");
  });
  it("releases a definitely unpaid reservation after preflight failure", async () => {
    await enable();
    await evidence();
    await schedule();
    const request = model();
    request.prepare.mockImplementation(async () => {
      throw new Error("preflight_down");
    });
    await processNextImprovementReview({ db, model: request });
    expect(
      (await pool.query("SELECT generations,held_nano_usd FROM improvement_review_usage")).rows[0]
    ).toEqual({ generations: 0, held_nano_usd: "0" });
  });
  it("preserves immutable receipts on duplicate settlement and deletes expired derived evidence", async () => {
    await enable();
    await evidence();
    const id = await schedule(),
      request = model();
    await processNextImprovementReview({ db, model: request });
    const receipt = (await pool.query("SELECT * FROM improvement_review_attempts")).rows[0]!;
    const before = receipt.outcome_sha256;
    await createImprovementReviewAttemptStore(db).settle(String(receipt.id), {
      state: "succeeded",
      usage: reportTestUsage,
      cost_nano_usd: reportTestCost,
      provider_response_id: "resp_review_fixture",
      guidance: null
    });
    expect(
      (await pool.query("SELECT outcome_sha256 FROM improvement_review_attempts")).rows[0]
        ?.outcome_sha256
    ).toBe(before);
    await pool.query(
      "UPDATE improvement_reviews SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [id]
    );
    await maintainImprovementReviews(db);
    expect((await pool.query("SELECT * FROM improvement_reviews")).rowCount).toBe(0);
    expect(
      (await pool.query("SELECT validated_guidance FROM improvement_review_attempts")).rows[0]
        ?.validated_guidance
    ).toBeNull();
  });
  it("serialises conflicting settings versions and never adds future projects", async () => {
    const store = createImprovementReviewSettingsStore(db);
    const command = {
      expected_version: 0,
      enabled: true,
      project_ids: [fixture.project],
      source_consent: true
    };
    const outcomes = await Promise.allSettled([
      store.replace({ ...actor(), command }),
      store.replace({ ...actor(), command })
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1,$2,$3,'Future','future')",
      [randomUUID(), fixture.org, fixture.owner]
    );
    await schedule();
    expect((await pool.query("SELECT project_id FROM improvement_reviews")).rows).toEqual([
      { project_id: fixture.project }
    ]);
  });
  it.each(["generation", "budget"])(
    "returns factual evidence without a provider call at the %s ceiling",
    async (ceiling) => {
      await enable();
      await evidence();
      const id = await schedule();
      const execution = createImprovementReviewExecutionStore(db),
        claim = (await execution.claimNext())!;
      await execution.bind(claim);
      await execution.facts(claim);
      await execution.reserve(claim);
      await pool.query(
        "UPDATE improvement_review_usage SET generations=$1,held_nano_usd=0,spent_nano_usd=$2",
        [ceiling === "generation" ? 25 : 0, ceiling === "budget" ? 750000000 : 0]
      );
      await pool.query(
        "UPDATE improvement_reviews SET generation_counted=false,ai_reserved_nano_usd=0"
      );
      await createWorkerJobStore(db).fail(claim);
      await pool.query("UPDATE worker_jobs SET available_at=clock_timestamp() WHERE id=$1", [
        claim.id
      ]);
      const request = model();
      await processNextImprovementReview({ db, model: request });
      expect((await createImprovementReviewStore(db).get({ ...actor(), id })).status).toBe(
        "skipped_quota"
      );
      expect(
        (await createImprovementReviewStore(db).bundle({ ...actor(), id })).bundle?.priorities
      ).toHaveLength(1);
      expect(request.prepare).not.toHaveBeenCalled();
    }
  );
  it("recovers a sending intent after a worker loss without a second paid attempt", async () => {
    await enable();
    await evidence();
    const id = await schedule();
    const execution = createImprovementReviewExecutionStore(db),
      claim = (await execution.claimNext())!;
    await execution.bind(claim);
    await execution.facts(claim);
    await execution.reserve(claim);
    const prepared = await model().prepare({ facts: reviewFactsFixture(), identities: [] });
    await createImprovementReviewAttemptStore(db).begin(claim, prepared);
    await pool.query(
      "UPDATE worker_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [claim.id]
    );
    const request = model();
    await processNextImprovementReview({ db, model: request });
    expect(request.prepare).not.toHaveBeenCalled();
    expect(await createImprovementReviewStore(db).get({ ...actor(), id })).toMatchObject({
      status: "factual_only",
      reason: "model_uncertain"
    });
    expect((await pool.query("SELECT state FROM improvement_review_attempts")).rows).toEqual([
      { state: "uncertain" }
    ]);
    expect(
      (await pool.query("SELECT held_nano_usd FROM improvement_review_usage")).rows[0]
        ?.held_nano_usd
    ).toBe("24750000");
    const attempts = createImprovementReviewAttemptStore(db),
      receipt = (await attempts.read(id))!;
    await attempts.settle(String(receipt["id"]), await model().paid(async () => {}));
    expect(
      (await pool.query("SELECT held_nano_usd,spent_nano_usd FROM improvement_review_usage"))
        .rows[0]
    ).toEqual({ held_nano_usd: "0", spent_nano_usd: String(reportTestCost) });
    expect(
      (await createImprovementReviewStore(db).bundle({ ...actor(), id })).bundle?.analysis
    ).toBe("unavailable");
  });
  it("keeps a known paid receipt when consent disappears while the provider is responding", async () => {
    await enable();
    await evidence();
    await schedule();
    const request = model();
    request.paid.mockImplementationOnce(async (before) => {
      await before();
      await createImprovementReviewSettingsStore(db).replace({
        ...actor(),
        command: { expected_version: 1, enabled: false, project_ids: [], source_consent: false }
      });
      return {
        state: "succeeded",
        usage: reportTestUsage,
        cost_nano_usd: reportTestCost,
        provider_response_id: "resp_review_fixture",
        guidance: { version: 1, investigations: [] }
      };
    });
    await expect(processNextImprovementReview({ db, model: request })).rejects.toThrow(
      "improvement_review_unavailable"
    );
    expect((await pool.query("SELECT * FROM improvement_reviews")).rowCount).toBe(0);
    expect(
      (
        await pool.query(
          "SELECT state,review_id,validated_guidance FROM improvement_review_attempts"
        )
      ).rows[0]
    ).toEqual({ state: "rejected", review_id: null, validated_guidance: null });
    expect(
      (await pool.query("SELECT held_nano_usd,spent_nano_usd FROM improvement_review_usage"))
        .rows[0]
    ).toEqual({ held_nano_usd: "0", spent_nano_usd: String(reportTestCost) });
    expect(request.paid).toHaveBeenCalledOnce();
  });
  it("pauses work on project opt-out and tier loss, while retaining authorised archive reads", async () => {
    await enable();
    await evidence();
    const id = await schedule();
    await processNextImprovementReview({ db, model: null });
    await pool.query("UPDATE organizations SET plan='solo' WHERE id=$1", [fixture.org]);
    expect(await createImprovementReviewSettingsStore(db).get(actor())).toMatchObject({
      enabled: false,
      requires_review: true
    });
    expect(
      (await createImprovementReviewStore(db).bundle({ ...actor(), id })).bundle
    ).not.toBeNull();
    await pool.query("UPDATE organizations SET plan='team' WHERE id=$1", [fixture.org]);
    expect((await createImprovementReviewSettingsStore(db).get(actor())).enabled).toBe(false);
    await pool.query(
      "UPDATE projects SET automated_improvement_bundles_enabled=false WHERE id=$1",
      [fixture.project]
    );
    await expect(
      createImprovementReviewSettingsStore(db).replace({
        ...actor(),
        command: {
          expected_version: 2,
          enabled: true,
          project_ids: [fixture.project],
          source_consent: true
        }
      })
    ).rejects.toThrow("forbidden");
  });
  it("irreversibly removes derived content when analytics privacy narrows, even after it widens again", async () => {
    await pool.query(
      "INSERT INTO project_analytics_settings(project_id,enabled,privacy_mode) VALUES($1,true,'standard')",
      [fixture.project]
    );
    await enable();
    await evidence();
    const id = await schedule();
    await processNextImprovementReview({ db, model: null });
    await pool.query(
      "UPDATE project_analytics_settings SET privacy_mode='strict' WHERE project_id=$1",
      [fixture.project]
    );
    await pool.query(
      "UPDATE project_analytics_settings SET privacy_mode='standard' WHERE project_id=$1",
      [fixture.project]
    );
    await expect(createImprovementReviewStore(db).get({ ...actor(), id })).rejects.toThrow(
      "report_not_found"
    );
    expect((await pool.query("SELECT * FROM improvement_reviews")).rowCount).toBe(0);
  });
  it("exports bounded safe metadata and authenticated artifact links, excluding paid receipts and identities", async () => {
    await enable();
    await evidence();
    const id = await schedule();
    await processNextImprovementReview({ db, model: null });
    const store = createBusinessAccountExportStore(db),
      base = { organization_id: fixture.org, user_id: fixture.owner };
    const page = await store.read({ ...base, query: { section: "improvement_reviews", limit: 1 } });
    expect(page?.items[0]).toMatchObject({
      id,
      bundle_url: `/v1/organizations/${fixture.org}/improvements/reviews/${id}/bundle`
    });
    for (const key of [
      "identities",
      "initiating_authority",
      "ai_reserved_nano_usd",
      "request_sha256"
    ])
      expect(page?.items[0]).not.toHaveProperty(key);
    expect(
      (await store.read({ ...base, query: { section: "improvement_review_settings" } }))?.items
    ).toHaveLength(1);
  });
  it("recovers settled validated guidance and serialises duplicate paid admission", async () => {
    await enable();
    await evidence();
    const id = await schedule(),
      execution = createImprovementReviewExecutionStore(db),
      attempts = createImprovementReviewAttemptStore(db),
      claim = (await execution.claimNext())!;
    await execution.bind(claim);
    await execution.facts(claim);
    await execution.reserve(claim);
    const prepared = await model().prepare({ facts: reviewFactsFixture(), identities: [] });
    const outcomes = await Promise.allSettled([
      attempts.begin(claim, prepared),
      attempts.begin(claim, prepared)
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const receipt = (await attempts.read(id))!;
    await attempts.settle(String(receipt["id"]), {
      state: "succeeded",
      usage: reportTestUsage,
      cost_nano_usd: reportTestCost,
      provider_response_id: "resp_review_fixture",
      guidance: {
        version: 1,
        investigations: [
          {
            title: "Inspect the failure",
            hypothesis: null,
            checks: ["Reproduce the observed path."],
            evidence_refs: ["e1"]
          }
        ]
      }
    });
    await pool.query(
      "UPDATE worker_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [claim.id]
    );
    const request = model();
    await processNextImprovementReview({ db, model: request });
    expect(request.prepare).not.toHaveBeenCalled();
    expect(
      (await createImprovementReviewStore(db).bundle({ ...actor(), id })).bundle?.analysis
    ).toBe("available");
    expect((await attempts.read(id))?.["validated_guidance"]).toBeNull();
  });
  it("keeps unchanged unresolved priorities visible without buying another narrative", async () => {
    await enable();
    await evidence();
    const old = await schedule(),
      request = model();
    await processNextImprovementReview({ db, model: request });
    const bundle = (await createImprovementReviewStore(db).bundle({ ...actor(), id: old })).bundle!;
    for (const key of ["starts_at", "ends_at"] as const)
      bundle.facts.period[key] = new Date(
        Date.parse(bundle.facts.period[key]) - 7 * 86400000
      ).toISOString();
    bundle.facts.cutoff_at = new Date(
      Date.parse(bundle.facts.cutoff_at) - 7 * 86400000
    ).toISOString();
    await pool.query(
      "UPDATE improvement_reviews SET period_starts_at=$2,period_ends_at=$3,cutoff_at=$4,facts=$5::jsonb,artifact=$6::jsonb,artifact_sha256=$7 WHERE id=$1",
      [
        old,
        bundle.facts.period.starts_at,
        bundle.facts.period.ends_at,
        bundle.facts.cutoff_at,
        JSON.stringify(bundle.facts),
        JSON.stringify(bundle),
        createHash("sha256").update(JSON.stringify(bundle)).digest("hex")
      ]
    );
    const id = await schedule();
    await processNextImprovementReview({ db, model: request });
    expect(id).not.toBe(old);
    expect((await createImprovementReviewStore(db).get({ ...actor(), id })).status).toBe(
      "no_change"
    );
    expect(request.paid).toHaveBeenCalledOnce();
    expect(
      (await createImprovementReviewStore(db).bundle({ ...actor(), id })).bundle?.priorities
    ).toHaveLength(1);
    await pool.query(
      "UPDATE improvement_reviews SET created_at=date_trunc('second',statement_timestamp())+CASE WHEN id=$1::uuid THEN interval '123 microseconds' ELSE interval '456 microseconds' END WHERE organization_id=$2",
      [old, fixture.org]
    );
    const store = createImprovementReviewStore(db),
      first = await store.list({ ...actor(), limit: 1 }),
      next = await store.list({ ...actor(), limit: 1, cursor: first.next_cursor! });
    expect(first.items[0]?.id).toBe(id);
    expect(next.items[0]?.id).toBe(old);
    await expect(store.list({ ...actor(), cursor: "YQ" })).rejects.toThrow();
  });
  it("uses the fixed trial billing window and stops at the exact deadline before cleanup", async () => {
    await pool.query(
      "UPDATE organizations SET billing_state='trialing',trial_plan='team',trial_started_at=clock_timestamp()-interval '10 days',trial_ends_at=clock_timestamp()+interval '20 days',billing_interval='month',billing_period_starts_at=clock_timestamp()-interval '10 days',billing_period_ends_at=clock_timestamp()+interval '20 days' WHERE id=$1",
      [fixture.org]
    );
    await enable();
    await evidence();
    await schedule();
    const request = model();
    await processNextImprovementReview({ db, model: request });
    expect(
      (
        await pool.query(
          "SELECT u.starts_at=date_trunc('milliseconds',o.billing_period_starts_at) AND u.ends_at=date_trunc('milliseconds',o.billing_period_ends_at) AS fixed FROM improvement_review_usage u JOIN organizations o ON o.id=u.organization_id"
        )
      ).rows[0]?.fixed
    ).toBe(true);
    await pool.query(
      "UPDATE organizations SET trial_ends_at=clock_timestamp()-interval '1 microsecond' WHERE id=$1",
      [fixture.org]
    );
    await expect(
      createImprovementReviewSettingsStore(db).replace({
        ...actor(),
        command: {
          expected_version: 1,
          enabled: true,
          project_ids: [fixture.project],
          source_consent: true
        }
      })
    ).rejects.toThrow("upgrade_required");
    expect(request.paid).toHaveBeenCalledOnce();
  });
  it("checks the actual saved actor before work and cascades account deletion through private buffers", async () => {
    await enable();
    await evidence();
    const id = await schedule(),
      request = model();
    await pool.query(
      "UPDATE organization_members SET suspended_at=clock_timestamp() WHERE organization_id=$1 AND user_id=$2",
      [fixture.org, fixture.owner]
    );
    await expect(processNextImprovementReview({ db, model: request })).rejects.toThrow(
      "improvement_review_unavailable"
    );
    expect(
      (await pool.query("SELECT status FROM improvement_reviews WHERE id=$1", [id])).rows[0]?.status
    ).toBe("paused_access");
    expect(request.prepare).not.toHaveBeenCalled();
    await pool.query("DELETE FROM organizations WHERE id=$1", [fixture.org]);
    for (const table of [
      "improvement_review_settings",
      "improvement_reviews",
      "improvement_review_usage",
      "improvement_review_attempts"
    ])
      expect((await pool.query(`SELECT * FROM ${table}`)).rowCount).toBe(0);
  });
  it.each(["deletion", "transfer"])(
    "requires fresh selection after source project %s without stranding settings",
    async (action) => {
      await enable();
      await evidence();
      const id = await schedule();
      await processNextImprovementReview({ db, model: model("uncertain") });
      if (action === "deletion")
        await pool.query("DELETE FROM projects WHERE id=$1", [fixture.project]);
      else {
        const destination = randomUUID();
        await pool.query(
          "INSERT INTO organizations(id,name,slug,plan) VALUES($1::uuid,'Destination',$1::text,'team')",
          [destination]
        );
        await pool.query("UPDATE projects SET organization_id=$2 WHERE id=$1", [
          fixture.project,
          destination
        ]);
      }
      const store = createImprovementReviewSettingsStore(db);
      expect(await store.get(actor())).toMatchObject({
        version: 2,
        enabled: false,
        scope: [],
        source_consent: false,
        requires_review: true
      });
      await expect(createImprovementReviewStore(db).get({ ...actor(), id })).rejects.toThrow(
        "report_not_found"
      );
      expect(
        (await pool.query("SELECT held_nano_usd FROM improvement_review_usage")).rows[0]
          ?.held_nano_usd
      ).toBe("24750000");
      const project = randomUUID();
      await pool.query(
        "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1,$2,$3,'Replacement','replacement')",
        [project, fixture.org, fixture.owner]
      );
      expect(
        await store.replace({
          ...actor(),
          command: {
            expected_version: 2,
            enabled: true,
            project_ids: [project],
            source_consent: true
          }
        })
      ).toMatchObject({ version: 3, enabled: true, requires_review: false });
    }
  );
  it("rejects configuration by a project-authorised administrator who is not the workspace Owner", async () => {
    await enable();
    await pool.query(
      "UPDATE organization_members SET role='admin' WHERE organization_id=$1 AND user_id=$2",
      [fixture.org, fixture.owner]
    );
    await expect(
      createImprovementReviewSettingsStore(db).replace({
        ...actor(),
        command: {
          expected_version: 1,
          enabled: false,
          project_ids: [fixture.project],
          source_consent: true
        }
      })
    ).rejects.toThrow("forbidden");
  });
  it("runs factual reviews in the existing serial lane independently of the report switch", async () => {
    await enable();
    await schedule();
    const objects = {
      putObject: vi.fn(async () => {}),
      getObject: vi.fn(async () => Buffer.alloc(0)),
      deleteObject: vi.fn(async () => {})
    };
    expect(await createSmartReportProcessor({ db, objects, env: {}, emailSend: null })()).toEqual({
      processed: false
    });
    const pass = createSmartReportProcessor({
      db,
      objects,
      env: { SMART_IMPROVEMENTS_ENABLED: "true" },
      emailSend: null
    });
    expect(await pass()).toEqual({ processed: true });
    expect(await pass()).toEqual({ processed: false });
    expect((await pool.query("SELECT status FROM improvement_reviews")).rows[0]?.status).toBe(
      "no_data"
    );
    expect(objects.putObject).not.toHaveBeenCalled();
    expect(objects.getObject).not.toHaveBeenCalled();
  });
  it("requires its ordered forward migration and preserves every earlier ledger checksum", async () => {
    await migrateStorageSchema(db);
    const old = (
      await pool.query(
        "SELECT id,checksum FROM storage_migration_ledger WHERE id<>'202611100003_add_weekly_improvement_reviews' ORDER BY id"
      )
    ).rows;
    await pool.query(
      "DROP TABLE improvement_review_attempts,improvement_reviews,improvement_review_usage,improvement_review_settings"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "improvement_review_schema_incomplete"
    );
    await pool.query(
      "DROP TRIGGER project_analytics_review_privacy_guard ON project_analytics_settings"
    );
    await pool.query("DROP TRIGGER projects_improvement_reviews_guard ON projects");
    await pool.query("DROP TRIGGER organizations_improvement_reviews_guard ON organizations");
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202611100003_add_weekly_improvement_reviews'"
    );
    await migrateStorageSchema(db);
    await assertStorageSchemaMigrationsApplied(db);
    expect(
      (
        await pool.query(
          "SELECT id,checksum FROM storage_migration_ledger WHERE id<>'202611100003_add_weekly_improvement_reviews' ORDER BY id"
        )
      ).rows
    ).toEqual(old);
  });
});
