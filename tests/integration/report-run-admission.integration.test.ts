import {
  resetReportRunFixture,
  reportTestCost as cost,
  reportTestReceipt as receipt
} from "../helpers/report-runs.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { createReportDefinitionStore } from "../../packages/storage/src/report-definition-store.js";
import { createReportRunAdmissionStore } from "../../packages/storage/src/report-run-admission.js";
import { createReportRunExecutionStore } from "../../packages/storage/src/report-run-execution.js";
import { createWorkerJobStore } from "../../packages/storage/src/worker-job-store.js";
import { createReportModelAttemptStore } from "../../packages/storage/src/report-model-attempt-store.js";
import { createReportArtifactStore } from "../../packages/storage/src/report-artifact-store.js";
import { createReportRunManagementStore } from "../../packages/storage/src/report-run-management.js";
import { reportModelProfile } from "../../packages/smart-reports/src/model-request.js";
import { lastCompletedReportPeriod } from "../../packages/smart-reports/src/report-period.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
runIntegration("atomic report run admission", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    definitions = createReportDefinitionStore(db),
    store = createReportRunAdmissionStore(db, { profile: reportModelProfile("gpt-6.1-terra") });
  let org: string, project: string, owner: string, definition: string;
  const actor = () => ({ version: 1 as const, kind: "browser_session" as const, user_id: owner });
  const period = lastCompletedReportPeriod("monthly", "2026-11-01T00:00:00.000Z");
  const admit = (request_id = randomUUID()) =>
    store.admit({
      organization_id: org,
      initiator: actor(),
      request_id,
      definition_id: definition,
      expected_version: 1,
      period,
      kind: "manual"
    });
  beforeEach(async () => {
    ({ org, project, owner, definition } = await resetReportRunFixture(pool, db));
  });
  afterAll(async () => {
    await pool.end();
  });
  it("recovers a lost acknowledgement without reserving another generation or AI allocation", async () => {
    const request = randomUUID(),
      first = await admit(request),
      second = await admit(request);
    expect(second.id).toBe(first.id);
    expect(first).toMatchObject({
      status: "queued",
      privacy_mode: "full",
      scope: [{ project_id: project, origin_project_ids: [project] }]
    });
    const usage = (
      await pool.query(
        "SELECT generations,held_nano_usd,spent_nano_usd FROM report_allowance_windows"
      )
    ).rows[0];
    expect(usage).toMatchObject({ generations: 1, held_nano_usd: "24750000", spent_nano_usd: "0" });
    expect(first).not.toHaveProperty("initiating_authority");
    expect(
      (
        await pool.query(
          "SELECT j.job_name,j.payload FROM report_runs r JOIN worker_jobs j ON j.id=r.processing_job_id WHERE r.id=$1",
          [first.id]
        )
      ).rows
    ).toEqual([
      { job_name: "generate-smart-report", payload: { run_id: first.id, organization_id: org } }
    ]);
    expect(
      (await pool.query("SELECT id FROM worker_jobs WHERE job_name='generate-smart-report'")).rows
    ).toHaveLength(1);
    await expect(
      store.admit({
        organization_id: org,
        initiator: actor(),
        request_id: request,
        definition_id: definition,
        expected_version: 2,
        period,
        kind: "manual"
      })
    ).rejects.toThrow("report_request_conflict");
  });
  it("rolls back the run and its complete reservation if durable enqueue fails", async () => {
    await pool.query(
      `CREATE FUNCTION reject_report_enqueue() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.job_name='generate-smart-report' THEN RAISE EXCEPTION 'test_report_enqueue_failed'; END IF; RETURN NEW; END $$`
    );
    await pool.query(
      "CREATE TRIGGER reject_report_enqueue BEFORE INSERT ON worker_jobs FOR EACH ROW EXECUTE FUNCTION reject_report_enqueue()"
    );
    await expect(admit()).rejects.toThrow("test_report_enqueue_failed");
    expect((await pool.query("SELECT id FROM report_runs")).rows).toEqual([]);
    expect((await pool.query("SELECT * FROM report_allowance_windows")).rows).toEqual([]);
  });
  it("serialises the last shared slot and protects all forty worst-case AI allocations", async () => {
    for (let index = 0; index < 39; index++) await admit();
    const outcomes = await Promise.allSettled([admit(), admit()]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    const usage = (
      await pool.query("SELECT generations,held_nano_usd FROM report_allowance_windows")
    ).rows[0];
    expect(usage).toMatchObject({ generations: 40, held_nano_usd: "990000000" });
  });
  it("records a scheduled quota skip once without allocating money or a job", async () => {
    for (let i = 0; i < 40; i++) await admit();
    const scheduled = createReportRunAdmissionStore(db, {
      profile: reportModelProfile("gpt-6.1-terra"),
      record_scheduled_quota_skips: true
    });
    const input = {
      organization_id: org,
      initiator: actor(),
      definition_id: definition,
      expected_version: 1,
      period,
      kind: "scheduled" as const
    };
    const first = await scheduled.admit({ ...input, request_id: randomUUID() }),
      second = await scheduled.admit({ ...input, request_id: randomUUID() });
    expect(first).toMatchObject({
      status: "skipped_quota",
      skip_reason: "generation_quota",
      generation_counted: false
    });
    expect(second.id).toBe(first.id);
    expect(
      (await pool.query("SELECT generations,held_nano_usd FROM report_allowance_windows")).rows[0]
    ).toMatchObject({ generations: 40, held_nano_usd: "990000000" });
    expect(
      (await pool.query("SELECT id FROM worker_jobs WHERE job_name='generate-smart-report'")).rows
    ).toHaveLength(40);
  });
  it("deduplicates a scheduled period across request IDs and definition versions", async () => {
    const input = {
      organization_id: org,
      initiator: actor(),
      definition_id: definition,
      expected_version: 1,
      period,
      kind: "scheduled" as const
    };
    const first = await store.admit({ ...input, request_id: randomUUID() });
    await pool.query(
      "UPDATE report_definitions SET version=version+1,name='Updated review' WHERE id=$1",
      [definition]
    );
    const second = await store.admit({ ...input, expected_version: 2, request_id: randomUUID() });
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ definition_version: 1, name: "Monthly review" });
    expect(
      (await pool.query("SELECT generations FROM report_allowance_windows")).rows[0]?.generations
    ).toBe(1);
  });
  it("keeps claimed scopes immutable and removes runs containing an origin removed from the current definition", async () => {
    const run = await admit(),
      another = randomUUID();
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Another',$1::text)",
      [another, org, owner]
    );
    await definitions.replace({
      organization_id: org,
      initiator: actor(),
      id: definition,
      definition: {
        name: "Replacement scope",
        cadence: "monthly",
        project_ids: [another],
        recipient_user_ids: [],
        source_collection_consent: true,
        schedule: { time: "09:00", timezone: "UTC" },
        enabled: true,
        expected_version: 1
      }
    });
    expect(
      (await pool.query("SELECT accepted_scope FROM report_runs WHERE id=$1", [run.id])).rows[0]
        ?.accepted_scope
    ).toEqual(run.scope);
    await pool.query("DELETE FROM projects WHERE id=$1", [project]);
    expect((await pool.query("SELECT id FROM report_runs WHERE id=$1", [run.id])).rows).toEqual([]);
    expect(
      (await pool.query("SELECT id FROM report_definitions WHERE id=$1", [definition])).rows
    ).toHaveLength(1);
  });
  it("releases a definitely unstarted deleted run's shared allocation once", async () => {
    await admit();
    await pool.query("DELETE FROM report_definitions WHERE id=$1", [definition]);
    expect(
      (await pool.query("SELECT generations,held_nano_usd FROM report_allowance_windows")).rows[0]
    ).toMatchObject({ generations: 0, held_nano_usd: "0" });
  });
  it("binds only a real live job lease and preserves accepted settings across ordinary edits", async () => {
    const run = await admit(),
      jobs = createWorkerJobStore(db),
      execution = createReportRunExecutionStore(db);
    const claim = (await jobs.claim("generate-smart-report"))!;
    await expect(execution.bind({ ...claim, token: randomUUID() })).rejects.toThrow(
      "worker_job_lease_lost"
    );
    expect(await execution.bind(claim)).toMatchObject({ id: run.id, status: "processing" });
    await pool.query(
      "UPDATE report_definitions SET name='Next report',version=version+1,enabled=false WHERE id=$1",
      [definition]
    );
    await expect(execution.check(claim)).resolves.toBeUndefined();
    await pool.query(
      "UPDATE worker_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1",
      [claim.id]
    );
    await expect(execution.check(claim)).rejects.toThrow("worker_job_lease_lost");
    const replacement = (await jobs.claim("generate-smart-report"))!;
    expect(replacement.token).not.toBe(claim.token);
    await expect(execution.bind(replacement)).resolves.toMatchObject({ id: run.id });
    await expect(execution.check(claim)).rejects.toThrow("worker_job_lease_lost");
  });
  it("claims an exact selected report job without consuming another pending run", async () => {
    const first = await admit(),
      second = await admit();
    const job = (
      await pool.query<{ processing_job_id: string }>(
        "SELECT processing_job_id FROM report_runs WHERE id=$1",
        [second.id]
      )
    ).rows[0]!.processing_job_id;
    const claim = await createWorkerJobStore(db).claim("generate-smart-report", job);
    expect(claim?.payload["run_id"]).toBe(second.id);
    expect(claim?.payload["run_id"]).not.toBe(first.id);
  });
  it("rotates generation claims between organisations before draining a noisy account", async () => {
    const first = await admit(),
      second = await admit(),
      otherOrg = randomUUID(),
      otherProject = randomUUID();
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan) VALUES($1::uuid,'Other organisation',$1::text,'business')",
      [otherOrg]
    );
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'owner')",
      [randomUUID(), otherOrg, owner]
    );
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Other',$1::text)",
      [otherProject, otherOrg, owner]
    );
    const otherDefinition = await definitions.create({
      organization_id: otherOrg,
      initiator: actor(),
      request_id: randomUUID(),
      definition: {
        name: "Other review",
        cadence: "monthly",
        project_ids: [otherProject],
        recipient_user_ids: [],
        source_collection_consent: true,
        enabled: false
      }
    });
    const other = await store.admit({
      organization_id: otherOrg,
      initiator: actor(),
      request_id: randomUUID(),
      definition_id: otherDefinition.id,
      expected_version: 1,
      period,
      kind: "manual"
    });
    const execution = createReportRunExecutionStore(db),
      jobs = createWorkerJobStore(db),
      seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const claim = (await execution.claimNext())!;
      seen.push(String(claim.payload["run_id"]));
      await execution.bind(claim);
      await jobs.complete(claim);
    }
    expect(seen).toEqual([first.id, other.id, second.id]);
    expect(await execution.claimNext()).toBeNull();
  });
  it("rechecks saved actor, live plan and privacy before allowing a claimed run to progress", async () => {
    await admit();
    const execution = createReportRunExecutionStore(db),
      claim = (await createWorkerJobStore(db).claim("generate-smart-report"))!;
    await execution.bind(claim);
    await pool.query("UPDATE users SET email_verified_at=NULL WHERE id=$1", [owner]);
    await expect(execution.check(claim)).rejects.toThrow("forbidden");
    await pool.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [owner]);
    await pool.query(
      "UPDATE report_definitions SET privacy_mode='restricted',source_collection_consent=false WHERE id=$1",
      [definition]
    );
    await expect(execution.check(claim)).rejects.toThrow("forbidden");
    await pool.query("UPDATE organizations SET plan='team' WHERE id=$1", [org]);
    await expect(execution.check(claim)).rejects.toThrow("upgrade_required");
  });
  it("uses annual accounts' anchored monthly window rather than the report's UTC month", async () => {
    await pool.query(
      "UPDATE organizations SET billing_interval='year',billing_period_starts_at='2026-08-17T12:00:00Z',billing_period_ends_at='2027-08-17T12:00:00Z',billing_allowance_anchor_at='2026-08-17T12:00:00Z' WHERE id=$1",
      [org]
    );
    await admit();
    const usage = (
      await pool.query<{ starts_at: Date; ends_at: Date }>(
        "SELECT starts_at,ends_at FROM report_allowance_windows"
      )
    ).rows[0]!;
    expect(usage.starts_at.getUTCDate()).toBe(17);
    expect(usage.starts_at.getUTCHours()).toBe(12);
    expect(usage.ends_at.getUTCDate()).toBe(17);
    expect(usage.ends_at.getTime() - usage.starts_at.getTime()).toBeLessThan(32 * 86400000);
  });
  async function paidIntent() {
    const run = await admit(),
      jobs = createWorkerJobStore(db),
      claim = (await jobs.claim("generate-smart-report"))!;
    await createReportRunExecutionStore(db).bind(claim);
    await pool.query("UPDATE report_runs SET facts_object_key=$2,facts_sha256=$3 WHERE id=$1", [
      run.id,
      `smart-reports/${org}/${definition}/${run.id}/facts.json`,
      "a".repeat(64)
    ]);
    const input = {
      attempt_id: randomUUID(),
      profile: reportModelProfile("gpt-6.1-terra"),
      facts_sha256: "a".repeat(64),
      request_sha256: "b".repeat(64),
      input_tokens: 100
    };
    const attempts = createReportModelAttemptStore(db);
    await attempts.begin(claim, input);
    return { run, jobs, claim, input, attempts };
  }
  it("commits a paid intent once, retains unknown cost and never retries the provider after a worker reclaim", async () => {
    const { run, jobs, claim, input, attempts } = await paidIntent();
    expect((await pool.query("SELECT state FROM report_model_attempts")).rows).toEqual([
      { state: "sending" }
    ]);
    await expect(attempts.begin(claim, { ...input, attempt_id: randomUUID() })).rejects.toThrow(
      "report_paid_attempt_already_admitted"
    );
    await attempts.settle({
      attempt_id: input.attempt_id,
      outcome: {
        state: "uncertain",
        maximum_nano_usd: 24750000,
        elapsed_ms: 55,
        reason: "report_provider_outcome_unknown"
      }
    });
    expect(
      (await pool.query("SELECT held_nano_usd,spent_nano_usd FROM report_allowance_windows"))
        .rows[0]
    ).toMatchObject({ held_nano_usd: "24750000", spent_nano_usd: "0" });
    await jobs.fail(claim);
    await pool.query("UPDATE worker_jobs SET available_at=now()-interval '1 second' WHERE id=$1", [
      claim.id
    ]);
    const replacement = (await jobs.claim("generate-smart-report"))!;
    await createReportRunExecutionStore(db).bind(replacement);
    await expect(
      attempts.begin(replacement, { ...input, attempt_id: randomUUID() })
    ).rejects.toThrow("report_paid_attempt_already_admitted");
    const outcome = receipt();
    await attempts.settle({ attempt_id: input.attempt_id, outcome });
    await attempts.settle({ attempt_id: input.attempt_id, outcome });
    expect(
      (await pool.query("SELECT held_nano_usd,spent_nano_usd FROM report_allowance_windows"))
        .rows[0]
    ).toMatchObject({ held_nano_usd: "0", spent_nano_usd: String(cost) });
    expect(
      (await pool.query("SELECT ai_status,paid_attempts FROM report_runs WHERE id=$1", [run.id]))
        .rows[0]
    ).toMatchObject({ ai_status: "failed", paid_attempts: 1 });
    await expect(
      attempts.settle({ attempt_id: input.attempt_id, outcome: receipt() })
    ).rejects.toThrow("report_attempt_receipt_conflict");
  });
  it("settles actual cost after run deletion without retaining a narrative or refunding a paid generation", async () => {
    const { run, input, attempts } = await paidIntent();
    await pool.query("DELETE FROM report_runs WHERE id=$1", [run.id]);
    await attempts.settle({ attempt_id: input.attempt_id, outcome: receipt() });
    expect(
      (
        await pool.query(
          "SELECT generations,held_nano_usd,spent_nano_usd FROM report_allowance_windows"
        )
      ).rows[0]
    ).toMatchObject({ generations: 1, held_nano_usd: "0", spent_nano_usd: String(cost) });
    expect((await pool.query("SELECT narrative_json FROM report_model_attempts")).rows).toEqual([
      { narrative_json: null }
    ]);
  });
  it("preserves earlier paid costs while a disabled model admits factual work under a lowered budget", async () => {
    const paid = await paidIntent();
    await paid.attempts.settle({ attempt_id: paid.input.attempt_id, outcome: receipt() });
    const command = {
      organization_id: org,
      initiator: actor(),
      request_id: randomUUID(),
      definition_id: definition,
      expected_version: 1,
      period,
      kind: "manual" as const
    };
    expect(
      await createReportRunAdmissionStore(db, { profile: null, monthly_budget_nano_usd: 0 }).admit(
        command
      )
    ).toMatchObject({ ai_status: "unavailable", status: "queued" });
    expect(
      (
        await pool.query(
          "SELECT generations,held_nano_usd,spent_nano_usd,budget_limit_nano_usd FROM report_allowance_windows"
        )
      ).rows[0]
    ).toMatchObject({
      generations: 2,
      held_nano_usd: "0",
      spent_nano_usd: String(cost),
      budget_limit_nano_usd: String(cost)
    });
    await expect(
      createReportRunAdmissionStore(db, {
        profile: reportModelProfile("gpt-6.1-terra"),
        monthly_budget_nano_usd: 0
      }).admit({ ...command, request_id: randomUUID() })
    ).rejects.toThrow("report_ai_budget_exhausted");
  });
  it("registers private content-addressed objects before a write and cleans them after account deletion", async () => {
    const run = await admit(),
      claim = (await createWorkerJobStore(db).claim("generate-smart-report"))!;
    await createReportRunExecutionStore(db).bind(claim);
    const artifacts = createReportArtifactStore(db),
      input = {
        kind: "facts" as const,
        sha256: "a".repeat(64),
        expires_at: new Date(Date.now() + 86400000).toISOString()
      };
    const key = await artifacts.allocate(claim, input);
    expect(key).toBe(`smart-reports/${org}/${definition}/${run.id}/facts-${"a".repeat(64)}.json`);
    expect((await pool.query("SELECT state FROM report_artifact_objects")).rows).toEqual([
      { state: "allocated" }
    ]);
    await artifacts.attach(claim, input);
    expect(
      (await pool.query("SELECT facts_object_key FROM report_runs WHERE id=$1", [run.id])).rows[0]
        ?.facts_object_key
    ).toBe(key);
    await pool.query("DELETE FROM organizations WHERE id=$1", [org]);
    expect((await pool.query("SELECT state FROM report_artifact_objects")).rows).toEqual([
      { state: "deleting" }
    ]);
    await pool.query(
      "UPDATE report_artifact_objects SET cleanup_after_at=now()-interval '1 second'"
    );
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    expect(await artifacts.cleanupNext({ deleteObject })).toBe(true);
    expect(deleteObject).toHaveBeenCalledWith({ key, timeoutMs: 30000 });
    expect(await artifacts.cleanupNext({ deleteObject })).toBe(false);
  });
  it("permanently invalidates full runs on privacy narrowing and only releases definitely unused allocations", async () => {
    const paid = await paidIntent(),
      queued = await admit(),
      execution = createReportRunExecutionStore(db);
    await pool.query(
      "UPDATE report_definitions SET privacy_mode='restricted',source_collection_consent=false WHERE id=$1",
      [definition]
    );
    expect(
      (await pool.query("SELECT generations,held_nano_usd FROM report_allowance_windows")).rows[0]
    ).toMatchObject({ generations: 1, held_nano_usd: "24750000" });
    expect(
      (
        await pool.query("SELECT status,generation_counted FROM report_runs WHERE id=$1", [
          queued.id
        ])
      ).rows[0]
    ).toMatchObject({ status: "paused_access", generation_counted: false });
    await pool.query(
      "UPDATE report_definitions SET privacy_mode='full',source_collection_consent=true WHERE id=$1",
      [definition]
    );
    await expect(execution.bind(paid.claim)).rejects.toThrow("forbidden");
    await paid.attempts.settle({ attempt_id: paid.input.attempt_id, outcome: receipt() });
    expect(
      (await pool.query("SELECT held_nano_usd,spent_nano_usd FROM report_allowance_windows"))
        .rows[0]
    ).toMatchObject({ held_nano_usd: "0", spent_nano_usd: String(cost) });
  });
  it("cancels an unstarted run once and fences its durable job", async () => {
    const run = await admit(),
      management = createReportRunManagementStore(db),
      input = { organization_id: org, id: run.id, initiator: actor() };
    expect(await management.cancel(input)).toMatchObject({
      status: "cancelled",
      generation_counted: false
    });
    expect(await management.cancel(input)).toMatchObject({ status: "cancelled" });
    expect(
      (await pool.query("SELECT generations,held_nano_usd FROM report_allowance_windows")).rows[0]
    ).toMatchObject({ generations: 0, held_nano_usd: "0" });
    expect(await createWorkerJobStore(db).claim("generate-smart-report")).toBeNull();
  });
  it("keeps a cancelled paid intent reserved until its independent receipt settles", async () => {
    const paid = await paidIntent(),
      management = createReportRunManagementStore(db),
      input = { organization_id: org, id: paid.run.id, initiator: actor() };
    expect(await management.cancel(input)).toMatchObject({
      status: "cancelled",
      ai_status: "uncertain",
      generation_counted: true
    });
    expect(
      (await pool.query("SELECT generations,held_nano_usd FROM report_allowance_windows")).rows[0]
    ).toMatchObject({ generations: 1, held_nano_usd: "24750000" });
    await paid.attempts.settle({ attempt_id: paid.input.attempt_id, outcome: receipt() });
    expect(await management.get(input)).toMatchObject({ status: "cancelled", ai_status: "failed" });
    await management.remove(input);
    expect(
      (await pool.query("SELECT state,narrative_json FROM report_model_attempts")).rows
    ).toEqual([{ state: "rejected", narrative_json: null }]);
  });
  it("requires both persisted canonical artifacts, finishes factual-only work and releases unused AI money", async () => {
    const run = await admit(),
      claim = (await createWorkerJobStore(db).claim("generate-smart-report"))!,
      management = createReportRunManagementStore(db),
      artifacts = createReportArtifactStore(db);
    await createReportRunExecutionStore(db).bind(claim);
    await expect(management.complete(claim)).rejects.toThrow("report_outputs_not_persisted");
    const expires_at = new Date(Date.now() + 86400000).toISOString();
    for (const kind of ["facts", "ready"] as const) {
      const input = { kind, sha256: (kind === "facts" ? "a" : "b").repeat(64), expires_at };
      await artifacts.allocate(claim, input);
      await artifacts.attach(claim, input);
    }
    expect(await management.complete(claim)).toMatchObject({
      id: run.id,
      status: "factual_only",
      ai_status: "failed",
      generation_counted: true
    });
    expect(
      (
        await pool.query(
          "SELECT generations,held_nano_usd,spent_nano_usd FROM report_allowance_windows"
        )
      ).rows[0]
    ).toMatchObject({ generations: 1, held_nano_usd: "0", spent_nano_usd: "0" });
    expect(
      (await pool.query("SELECT status,payload FROM worker_jobs WHERE id=$1", [claim.id])).rows[0]
    ).toMatchObject({ status: "completed", payload: null });
  });
  it("continues pagination across inaccessible mixed scopes without returning their metadata", async () => {
    const visible = await admit(),
      other = randomUUID(),
      viewer = randomUUID();
    await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
      viewer,
      `${viewer}@example.test`
    ]);
    await pool.query(
      "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'viewer')",
      [randomUUID(), project, viewer]
    );
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Other',$1::text)",
      [other, org, owner]
    );
    const mixed = await definitions.create({
      organization_id: org,
      initiator: actor(),
      request_id: randomUUID(),
      definition: {
        name: "Private mixed scope",
        cadence: "monthly",
        project_ids: [project, other],
        recipient_user_ids: [],
        source_collection_consent: true,
        enabled: false
      }
    });
    await store.admit({
      organization_id: org,
      initiator: actor(),
      request_id: randomUUID(),
      definition_id: mixed.id,
      expected_version: 1,
      period,
      kind: "manual"
    });
    const management = createReportRunManagementStore(db),
      initiator = { version: 1 as const, kind: "browser_session" as const, user_id: viewer };
    const first = await management.list({ organization_id: org, initiator, limit: 1 });
    expect(first.items).toEqual([]);
    expect(first.next_cursor).not.toBeNull();
    const next = await management.list({
      organization_id: org,
      initiator,
      limit: 1,
      cursor: first.next_cursor!
    });
    expect(next.items.map((item) => item.id)).toEqual([visible.id]);
    expect(next.next_cursor).toBeNull();
    await expect(
      management.cancel({ organization_id: org, initiator, id: visible.id })
    ).rejects.toThrow("report_not_found");
  });
  it("rejects untrusted metering and drops a successful narrative after actor revocation", async () => {
    const { input, attempts } = await paidIntent(),
      outcome = receipt();
    await expect(
      attempts.settle({ attempt_id: input.attempt_id, outcome: { ...outcome, cost_nano_usd: 0 } })
    ).rejects.toThrow("report_attempt_cost_mismatch");
    expect((await pool.query("SELECT state FROM report_model_attempts")).rows).toEqual([
      { state: "sending" }
    ]);
    await pool.query("UPDATE users SET email_verified_at=NULL WHERE id=$1", [owner]);
    await attempts.settle({
      attempt_id: input.attempt_id,
      outcome: {
        ...outcome,
        state: "succeeded",
        narrative: {
          version: 1,
          overview: { text: "Recorded work needs review.", evidence_refs: ["c1"] },
          highlights: [],
          priorities: [],
          limitations: []
        }
      }
    });
    expect(
      (await pool.query("SELECT state,narrative_json FROM report_model_attempts")).rows
    ).toEqual([{ state: "succeeded", narrative_json: null }]);
    expect(
      (await pool.query("SELECT spent_nano_usd FROM report_allowance_windows")).rows[0]
        ?.spent_nano_usd
    ).toBe(String(cost));
  });
  it("admits factual-only work without an AI key allocation but never outside live management rights", async () => {
    const factual = createReportRunAdmissionStore(db, { profile: null });
    const run = await factual.admit({
      organization_id: org,
      initiator: actor(),
      request_id: randomUUID(),
      definition_id: definition,
      expected_version: 1,
      period,
      kind: "manual"
    });
    expect(run.ai_status).toBe("unavailable");
    expect(
      (await pool.query("SELECT held_nano_usd FROM report_allowance_windows")).rows[0]
        ?.held_nano_usd
    ).toBe("0");
    await pool.query("UPDATE users SET email_verified_at=NULL WHERE id=$1", [owner]);
    await expect(admit()).rejects.toThrow("forbidden");
  });
});
