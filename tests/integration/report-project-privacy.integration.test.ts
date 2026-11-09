import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { resetReportRunFixture } from "../helpers/report-runs.js";
import { createReportRunExecutionStore } from "../../packages/storage/src/report-run-execution.js";
import { createReportModelAttemptStore } from "../../packages/storage/src/report-model-attempt-store.js";
import {
  createReportArtifactStore,
  reportArtifactDigest
} from "../../packages/storage/src/report-artifact-store.js";
import { reportModelProfile } from "../../packages/smart-reports/src/model-request.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
runIntegration("project privacy fences for saved reports", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  let fixture: Awaited<ReturnType<typeof resetReportRunFixture>>;
  beforeEach(async () => {
    fixture = await resetReportRunFixture(pool, db);
    await pool.query(
      "INSERT INTO project_analytics_settings(project_id,enabled,privacy_mode,consent_required,aggregate_retention_months) VALUES($1,true,'standard',false,12)",
      [fixture.project]
    );
  });
  afterAll(async () => {
    await pool.end();
  });
  it("atomically invalidates a mixed report on stricter privacy and refunds only definitely unstarted work", async () => {
    const run = await fixture.admit(),
      execution = createReportRunExecutionStore(db),
      claim = await execution.claimNext();
    await execution.bind(claim!);
    await pool.query(
      "UPDATE project_analytics_settings SET privacy_mode='strict' WHERE project_id=$1",
      [fixture.project]
    );
    expect(
      (
        await pool.query(
          "SELECT status,privacy_invalidated_at,ai_reserved_nano_usd,generation_counted FROM report_runs WHERE id=$1",
          [run.id]
        )
      ).rows[0]
    ).toMatchObject({
      status: "paused_access",
      privacy_invalidated_at: expect.any(Date),
      ai_reserved_nano_usd: "0",
      generation_counted: false
    });
    expect(
      (await pool.query("SELECT generations,held_nano_usd FROM report_allowance_windows")).rows[0]
    ).toMatchObject({ generations: 0, held_nano_usd: "0" });
    expect(
      (await pool.query("SELECT status FROM worker_jobs WHERE id=$1", [claim!.id])).rows[0]?.status
    ).toBe("skipped");
    await pool.query(
      "UPDATE project_analytics_settings SET privacy_mode='standard' WHERE project_id=$1",
      [fixture.project]
    );
    await expect(execution.check(claim!)).rejects.toThrow();
    expect(
      (await pool.query("SELECT privacy_invalidated_at FROM report_runs WHERE id=$1", [run.id]))
        .rows[0]?.privacy_invalidated_at
    ).toBeInstanceOf(Date);
  });
  it("retains unknown paid holds, clears response buffers and schedules owned private objects for cleanup", async () => {
    const run = await fixture.admit(),
      execution = createReportRunExecutionStore(db),
      claim = await execution.claimNext();
    await execution.bind(claim!);
    const body = Buffer.from("{}");
    await createReportArtifactStore(db).persist(
      claim!,
      { kind: "facts", body, expires_at: new Date(Date.now() + 90 * 86400000).toISOString() },
      { putObject: async () => {} }
    );
    await createReportModelAttemptStore(db).begin(claim!, {
      attempt_id: randomUUID(),
      request_sha256: "a".repeat(64),
      facts_sha256: reportArtifactDigest(body),
      profile: reportModelProfile("gpt-6.1-terra"),
      input_tokens: 100
    });
    await pool.query(
      "UPDATE project_analytics_settings SET consent_required=true WHERE project_id=$1",
      [fixture.project]
    );
    expect(
      (await pool.query("SELECT held_nano_usd,generations FROM report_allowance_windows")).rows[0]
    ).toMatchObject({ held_nano_usd: "24750000", generations: 1 });
    expect(
      (
        await pool.query("SELECT state,narrative_json FROM report_model_attempts WHERE run_id=$1", [
          run.id
        ])
      ).rows[0]
    ).toMatchObject({ state: "uncertain", narrative_json: null });
    expect(
      (await pool.query("SELECT state FROM report_artifact_objects WHERE run_id=$1", [run.id])).rows
    ).toEqual([{ state: "deleting" }]);
  });
  it("ignores unrelated capture/sampling edits and more permissive policies, but honours shorter aggregate retention and disabling", async () => {
    const first = await fixture.admit();
    await pool.query(
      "UPDATE project_analytics_settings SET journey_sample_rate=0.5,capture_actions=true WHERE project_id=$1",
      [fixture.project]
    );
    expect(
      (await pool.query("SELECT privacy_invalidated_at FROM report_runs WHERE id=$1", [first.id]))
        .rows[0]?.privacy_invalidated_at
    ).toBeNull();
    await pool.query(
      "UPDATE project_analytics_settings SET aggregate_retention_months=6 WHERE project_id=$1",
      [fixture.project]
    );
    expect(
      (await pool.query("SELECT privacy_invalidated_at FROM report_runs WHERE id=$1", [first.id]))
        .rows[0]?.privacy_invalidated_at
    ).toBeInstanceOf(Date);
    const second = await fixture.admit();
    await pool.query(
      "UPDATE project_analytics_settings SET aggregate_retention_months=12 WHERE project_id=$1",
      [fixture.project]
    );
    expect(
      (await pool.query("SELECT privacy_invalidated_at FROM report_runs WHERE id=$1", [second.id]))
        .rows[0]?.privacy_invalidated_at
    ).toBeNull();
    await pool.query("DELETE FROM project_analytics_settings WHERE project_id=$1", [
      fixture.project
    ]);
    expect(
      (await pool.query("SELECT privacy_invalidated_at FROM report_runs WHERE id=$1", [second.id]))
        .rows[0]?.privacy_invalidated_at
    ).toBeInstanceOf(Date);
    expect(
      (
        await pool.query(
          "SELECT id FROM worker_jobs WHERE status='pending' AND job_name='generate-smart-report'"
        )
      ).rows
    ).toHaveLength(0);
  });
  it("does not affect another organisation's reports", async () => {
    const first = await fixture.admit(),
      other = randomUUID();
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan) VALUES($1::uuid,'Other',$1::text,'business')",
      [other]
    );
    const project = randomUUID();
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Other',$1::text)",
      [project, other, fixture.owner]
    );
    await pool.query(
      "INSERT INTO project_analytics_settings(project_id,enabled,privacy_mode) VALUES($1,true,'standard')",
      [project]
    );
    await pool.query(
      "UPDATE project_analytics_settings SET privacy_mode='strict' WHERE project_id=$1",
      [project]
    );
    expect(
      (await pool.query("SELECT privacy_invalidated_at FROM report_runs WHERE id=$1", [first.id]))
        .rows[0]?.privacy_invalidated_at
    ).toBeNull();
  });
});
