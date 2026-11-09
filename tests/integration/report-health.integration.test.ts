import { randomUUID } from "node:crypto";
import { createReportDefinitionStore } from "../../packages/storage/src/report-definition-store.js";
import { createReportFactStore } from "../../packages/storage/src/report-facts-store.js";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { resetReportRunFixture } from "../helpers/report-runs.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
import { createPostgresAvailabilityCheckStore } from "../../packages/storage/src/availability-check-store.js";
import { createReportHealthStore } from "../../packages/storage/src/report-health-store.js";
import type { AvailabilityCheckExecutionResult } from "../../packages/storage/src/availability-check-executor.js";
import { lastCompletedReportPeriod } from "../../packages/smart-reports/src/report-period.js";
runIntegration("observed report health recovery", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    checks = createPostgresAvailabilityCheckStore(db);
  let fixture: Awaited<ReturnType<typeof resetReportRunFixture>>, checkId: string;
  beforeEach(async () => {
    fixture = await resetReportRunFixture(pool, db);
    const check = await checks.createCheckForProjectInOrganization({
      organization_id: fixture.org,
      project_id: fixture.project,
      created_by_user_id: fixture.owner,
      name: "Private endpoint",
      url: "https://private.example.test/health",
      method: "GET",
      expected_status_min: 200,
      expected_status_max: 399,
      timeout_ms: 2500,
      interval_seconds: 60,
      failure_threshold: 1,
      recovery_threshold: 2,
      environment: "production",
      service_name: null,
      enabled: true,
      now: "2026-11-06T09:00:00.000Z"
    });
    if (typeof check === "string") throw new Error(check);
    checkId = check.check_id;
  });
  afterAll(async () => {
    await pool.end();
  });
  const execute = async (at: string, status: AvailabilityCheckExecutionResult["status"]) => {
    await pool.query("UPDATE availability_checks SET claimed_at=$2,next_check_at=$2 WHERE id=$1", [
      checkId,
      at
    ]);
    return checks.recordCheckExecution({
      check_id: checkId,
      scheduled_for: at,
      claimed_at: at,
      started_at: at,
      completed_at: at,
      result: {
        status,
        http_status: status === "success" ? 200 : null,
        duration_ms: 100,
        error_kind: status === "success" ? null : status,
        error_message: status === "success" ? null : "Private error",
        checked_url_host: "private.example.test",
        checked_url_path: "/health",
        checked_url_query: {},
        final_url: "https://private.example.test/health",
        redirect_count: 0
      }
    });
  };
  // Cross a database millisecond before choosing the snapshot boundary: pg returns
  // JS millisecond dates, while the recorded transition retains microseconds.
  const cutoff = async () => {
    await pool.query("SELECT pg_sleep(0.002)");
    return (
      await pool.query<{ at: Date }>("SELECT clock_timestamp() AS at")
    ).rows[0]!.at.toISOString();
  };
  const read = async () =>
    createReportHealthStore(db).readRecoveries({
      origin_ids: [fixture.project],
      period: lastCompletedReportPeriod("daily", "2026-11-07T00:00:00.000Z"),
      cutoff_at: await cutoff()
    });
  it("records only a real failing-to-passing transition after the configured success threshold", async () => {
    await execute("2026-11-06T10:00:00.000Z", "timeout");
    await execute("2026-11-06T10:01:00.000Z", "success");
    expect(await read()).toEqual([]);
    const recovered = await execute("2026-11-06T10:02:00.000Z", "success");
    expect(recovered?.next_status).toBe("passing");
    const rows = await read();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source_type: "health",
      status: "observed_recovery",
      source_id: recovered?.result.result_id,
      retained: true
    });
    expect(JSON.stringify(rows)).not.toContain("private.example.test");
    await execute("2026-11-06T10:03:00.000Z", "success");
    expect(await read()).toHaveLength(1);
  });
  afterEach(() => vi.unstubAllEnvs());
  it("preserves observed recovery for opted-in self-hosted Free reports", async () => {
    vi.stubEnv("SELFHOST_MODE", "true");
    await pool.query("DELETE FROM report_definitions WHERE id=$1", [fixture.definition]);
    await pool.query("UPDATE organizations SET plan='free' WHERE id=$1", [fixture.org]);
    await createReportDefinitionStore(db).create({
      organization_id: fixture.org,
      initiator: { version: 1, kind: "browser_session", user_id: fixture.owner },
      request_id: randomUUID(),
      definition: {
        name: "Self-hosted health",
        cadence: "weekly",
        project_ids: [fixture.project],
        enabled: true,
        schedule: { time: "09:00", timezone: "UTC" },
        privacy_mode: "restricted",
        source_collection_consent: false
      }
    });
    await execute("2026-11-06T10:00:00.000Z", "timeout");
    await execute("2026-11-06T10:01:00.000Z", "success");
    await execute("2026-11-06T10:02:00.000Z", "success");
    expect(
      (
        await pool.query("SELECT * FROM report_health_recoveries WHERE project_id=$1", [
          fixture.project
        ])
      ).rows
    ).toHaveLength(1);
  });

  it("never treats monitor-internal errors or a manual check edit as successful recovery", async () => {
    await execute("2026-11-06T10:00:00.000Z", "timeout");
    await execute("2026-11-06T10:01:00.000Z", "internal_error");
    await pool.query("UPDATE availability_checks SET status='passing' WHERE id=$1", [checkId]);
    expect(await read()).toEqual([]);
  });
  it("retains numeric evidence after routine raw pruning and removes it with the project", async () => {
    await execute("2026-11-06T10:00:00.000Z", "timeout");
    await execute("2026-11-06T10:01:00.000Z", "success");
    await execute("2026-11-06T10:02:00.000Z", "success");
    await pool.query("DELETE FROM availability_check_results WHERE check_id=$1", [checkId]);
    expect((await read())[0]?.retained).toBe(false);
    await pool.query("DELETE FROM projects WHERE id=$1", [fixture.project]);
    expect(await read()).toEqual([]);
  });
  it("collects nothing after opt-out and bounds retained recovery reads to the exact period and origins", async () => {
    await pool.query("UPDATE report_definitions SET enabled=false WHERE id=$1", [
      fixture.definition
    ]);
    await execute("2026-11-06T10:00:00.000Z", "timeout");
    await execute("2026-11-06T10:01:00.000Z", "success");
    await execute("2026-11-06T10:02:00.000Z", "success");
    expect(await read()).toEqual([]);
  });
  it("includes genuine recovery in the canonical whole-scope fact snapshot", async () => {
    await execute("2026-11-06T10:00:00.000Z", "timeout");
    await execute("2026-11-06T10:01:00.000Z", "success");
    const recovered = await execute("2026-11-06T10:02:00.000Z", "success");
    const report = await createReportFactStore(db).readDefinition({
      organization_id: fixture.org,
      definition_id: fixture.definition,
      expected_version: 1,
      period: lastCompletedReportPeriod("daily", "2026-11-07T00:00:00.000Z"),
      cutoff_at: await cutoff()
    });
    expect(report.sources).toContainEqual(
      expect.objectContaining({
        source_type: "health",
        source_id: recovered?.result.result_id,
        text_available: false
      })
    );
    expect(report.facts.evidence).toContainEqual(
      expect.objectContaining({ type: "health", status: "observed_recovery" })
    );
    expect(JSON.stringify(report)).not.toContain("private.example.test");
  });
});
