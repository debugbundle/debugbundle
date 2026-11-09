import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { resetReportRunFixture } from "../helpers/report-runs.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
import { createReportEmailStore } from "../../packages/storage/src/report-email-store.js";
import { createReportDefinitionStore } from "../../packages/storage/src/report-definition-store.js";
import { createReportRunAdmissionStore } from "../../packages/storage/src/report-run-admission.js";
import { createReportRunManagementStore } from "../../packages/storage/src/report-run-management.js";
import { createPostgresBillingStore } from "../../packages/storage/src/billing-store.js";
import { createSmartReportProcessor } from "../../apps/worker/src/smart-report-runtime.js";
import { processNextSmartReportJob } from "../../apps/worker/src/smart-report-processor.js";
import { lastCompletedReportPeriod } from "../../packages/smart-reports/src/report-period.js";
import { ReportEmailTransportError } from "../../packages/email/src/ses-transport.js";
runIntegration("fenced canonical report emails", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    saved = new Map<string, Buffer>();
  let fixture: Awaited<ReturnType<typeof resetReportRunFixture>>;
  const objects = {
    putObject: vi.fn(async (input: { key: string; body: Buffer }) => {
      saved.set(input.key, Buffer.from(input.body));
    }),
    getObject: vi.fn(async (input: { key: string }) => {
      const value = saved.get(input.key);
      if (!value) throw new Error("s3_object_not_found");
      return value;
    }),
    deleteObject: vi.fn(async (input: { key: string }) => {
      saved.delete(input.key);
    })
  };
  const initiator = () => ({
    version: 1 as const,
    kind: "browser_session" as const,
    user_id: fixture.owner
  });
  const actor = (id: string) => ({ organization_id: fixture.org, id, initiator: initiator() });
  async function publish(options: { recipientIds?: string[]; projectIds?: string[] } = {}) {
    const definition = await createReportDefinitionStore(db).create({
      organization_id: fixture.org,
      initiator: initiator(),
      request_id: randomUUID(),
      definition: {
        name: "Monthly email review",
        cadence: "monthly",
        project_ids: options.projectIds ?? [fixture.project],
        recipient_user_ids: options.recipientIds ?? [fixture.owner],
        privacy_mode: "full",
        source_collection_consent: true
      }
    });
    const run = await createReportRunAdmissionStore(db, { profile: null }).admit({
      organization_id: fixture.org,
      initiator: initiator(),
      request_id: randomUUID(),
      definition_id: definition.id,
      expected_version: definition.version,
      period: lastCompletedReportPeriod("monthly", new Date().toISOString()),
      kind: "manual",
      send_email: true
    });
    await processNextSmartReportJob({ db, objects, model: null });
    return run;
  }
  const usage = async () =>
    (await createPostgresBillingStore(db).getBillingSummaryForOrganization({
      organization_id: fixture.org,
      now: new Date().toISOString()
    }))!.allowances.monthly_alert_deliveries.used;
  beforeEach(async () => {
    fixture = await resetReportRunFixture(pool, db);
    saved.clear();
    vi.clearAllMocks();
    objects.getObject.mockImplementation(async (input) => {
      const value = saved.get(input.key);
      if (!value) throw new Error("s3_object_not_found");
      return value;
    });
  });
  afterAll(async () => {
    await pool.end();
  });
  it("coalesces scheduling and charges one accepted recipient message once, including after report deletion", async () => {
    const run = await publish(),
      store = createReportEmailStore(db, objects),
      send = vi.fn().mockResolvedValue({ provider_message_id: "accepted-123" });
    await Promise.all(Array.from({ length: 6 }, () => store.scheduleNext()));
    expect((await pool.query("SELECT id FROM report_email_deliveries")).rows).toHaveLength(1);
    expect(await store.processNext(send)).toEqual({ processed: true });
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: expect.stringContaining("@example.test"),
        view: expect.objectContaining({ document: expect.objectContaining({ run_id: run.id }) })
      })
    );
    expect((await store.list(actor(run.id)))[0]).toMatchObject({ status: "accepted" });
    expect(await usage()).toBe(1);
    expect(await store.processNext(send)).toEqual({ processed: false });
    expect(send).toHaveBeenCalledOnce();
    await createReportRunManagementStore(db).remove(actor(run.id));
    expect(await usage()).toBe(1);
    expect((await pool.query("SELECT run_id,status FROM report_email_deliveries")).rows).toEqual([
      { run_id: null, status: "accepted" }
    ]);
  });
  it("suppresses mail after current Business entitlement or verified recipient access is lost", async () => {
    const run = await publish(),
      store = createReportEmailStore(db, objects),
      send = vi.fn();
    await store.scheduleNext();
    await pool.query("UPDATE organizations SET plan='team' WHERE id=$1", [fixture.org]);
    expect(await store.processNext(send)).toEqual({ processed: true });
    expect(send).not.toHaveBeenCalled();
    expect((await store.list(actor(run.id)))[0]?.status).toBe("suppressed");
    expect(await usage()).toBe(0);
  });
  it("rechecks recipient notification suppression before sending the whole mixed report", async () => {
    const run = await publish(),
      store = createReportEmailStore(db, objects),
      send = vi.fn();
    await store.scheduleNext();
    const { createNotificationPreferencesStore } =
      await import("../../packages/storage/src/notification-preferences-store.js");
    await createNotificationPreferencesStore(db).update(
      { audience: "personal", owner_id: fixture.owner, project_id: null },
      { channels: { email: "off" } }
    );
    expect(await store.processNext(send)).toEqual({ processed: true });
    expect(send).not.toHaveBeenCalled();
    expect((await store.list(actor(run.id)))[0]?.status).toBe("suppressed");
    expect(await usage()).toBe(0);
  });
  it("holds an uncertain provider send and never automatically sends it again", async () => {
    const run = await publish(),
      store = createReportEmailStore(db, objects),
      send = vi.fn().mockRejectedValue(new ReportEmailTransportError("uncertain"));
    await store.scheduleNext();
    expect(await store.processNext(send)).toEqual({ processed: true });
    expect((await store.list(actor(run.id)))[0]?.status).toBe("uncertain");
    expect(await usage()).toBe(1);
    expect(await store.processNext(send)).toEqual({ processed: false });
    expect(send).toHaveBeenCalledOnce();
  });
  it("releases definitely rejected sends and retries the saved content through the existing job backoff without another generation", async () => {
    const run = await publish(),
      store = createReportEmailStore(db, objects),
      send = vi
        .fn()
        .mockRejectedValueOnce(new ReportEmailTransportError("rejected"))
        .mockResolvedValueOnce({ provider_message_id: "accepted-after-rejection" });
    await store.scheduleNext();
    expect(await store.processNext(send)).toEqual({ processed: true });
    expect(await usage()).toBe(0);
    await pool.query(
      "UPDATE worker_jobs SET available_at=clock_timestamp() WHERE job_name='deliver-smart-report-email'"
    );
    expect(await store.processNext(send)).toEqual({ processed: true });
    expect((await store.list(actor(run.id)))[0]?.status).toBe("accepted");
    expect(await usage()).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(
      (await pool.query("SELECT generations FROM report_allowance_windows")).rows[0]?.generations
    ).toBe(1);
  });
  it("persists a known acceptance after deletion during provider I/O without restoring report content", async () => {
    const run = await publish(),
      store = createReportEmailStore(db, objects),
      send = vi.fn(async () => {
        await createReportRunManagementStore(db).remove(actor(run.id));
        return { provider_message_id: "accepted-before-delete" };
      });
    await store.scheduleNext();
    expect(await store.processNext(send)).toEqual({ processed: true });
    expect(await usage()).toBe(1);
    expect((await pool.query("SELECT run_id,status FROM report_email_deliveries")).rows).toEqual([
      { run_id: null, status: "accepted" }
    ]);
    expect((await pool.query("SELECT id FROM report_runs WHERE id=$1", [run.id])).rows).toEqual([]);
  });
  it("recovers a sending lease without a second provider call and accepts a late known receipt", async () => {
    const run = await publish(),
      store = createReportEmailStore(db, objects);
    await store.scheduleNext();
    let entered: () => void = () => {},
      finish: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
        entered = resolve;
      }),
      ack = new Promise<void>((resolve) => {
        finish = resolve;
      });
    const send = vi.fn(async () => {
      entered();
      await ack;
      return { provider_message_id: "late-known-acceptance" };
    });
    const first = store.processNext(send);
    await ready;
    await pool.query(
      "UPDATE worker_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE job_name='deliver-smart-report-email' AND status='running'"
    );
    expect(await store.processNext(send)).toEqual({ processed: true });
    expect((await store.list(actor(run.id)))[0]?.status).toBe("uncertain");
    expect(send).toHaveBeenCalledOnce();
    finish();
    await first;
    expect((await store.list(actor(run.id)))[0]?.status).toBe("accepted");
    expect(await usage()).toBe(1);
    expect(send).toHaveBeenCalledOnce();
  });
  it("runs email in the serial report lane while the generation switch also stops new email egress", async () => {
    const run = await publish(),
      store = createReportEmailStore(db, objects),
      send = vi.fn().mockResolvedValue({ provider_message_id: "lane-accepted" });
    await pool.query(
      "UPDATE report_definitions SET enabled=false,next_due_at=NULL,next_period_ends_at=NULL WHERE id=$1",
      [fixture.definition]
    );
    await store.scheduleNext();
    const off = createSmartReportProcessor({ db, objects, env: {}, emailSend: send });
    await off();
    expect(send).not.toHaveBeenCalled();
    const on = createSmartReportProcessor({
      db,
      objects,
      env: { SMART_REPORTS_ENABLED: "true" },
      emailSend: send
    });
    for (let index = 0; index < 4 && !send.mock.calls.length; index++) await on();
    expect(send).toHaveBeenCalledOnce();
    expect((await store.list(actor(run.id)))[0]?.status).toBe("accepted");
  });
  it("withholds the whole mixed report when a recipient loses one project during canonical object I/O", async () => {
    const viewer = randomUUID(),
      other = randomUUID();
    await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
      viewer,
      `${viewer}@example.test`
    ]);
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Other',$1::text)",
      [other, fixture.org, fixture.owner]
    );
    for (const project of [fixture.project, other])
      await pool.query(
        "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'viewer')",
        [randomUUID(), project, viewer]
      );
    const run = await publish({ recipientIds: [viewer], projectIds: [fixture.project, other] }),
      store = createReportEmailStore(db, objects),
      send = vi.fn();
    await store.scheduleNext();
    objects.getObject.mockImplementationOnce(async (input) => {
      const value = saved.get(input.key);
      if (!value) throw new Error("s3_object_not_found");
      await pool.query("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2", [
        other,
        viewer
      ]);
      return value;
    });
    expect(await store.processNext(send)).toEqual({ processed: true });
    expect(send).not.toHaveBeenCalled();
    expect((await store.list(actor(run.id)))[0]?.status).toBe("suppressed");
    expect(await usage()).toBe(0);
  });
  it("supplements personal policy with current shared email suppression", async () => {
    const run = await publish(),
      store = createReportEmailStore(db, objects),
      send = vi.fn();
    await store.scheduleNext();
    const { createNotificationPreferencesStore } =
      await import("../../packages/storage/src/notification-preferences-store.js");
    await createNotificationPreferencesStore(db).update(
      { audience: "shared", owner_id: fixture.org, project_id: null },
      { channels: { email: "off" } }
    );
    expect(await store.processNext(send)).toEqual({ processed: true });
    expect(send).not.toHaveBeenCalled();
    expect((await store.list(actor(run.id)))[0]?.reason).toBe("notification_suppressed");
    expect(await usage()).toBe(0);
  });
  it("uses the existing notification allowance and withholds another recipient at exhaustion", async () => {
    const run = await publish(),
      store = createReportEmailStore(db, objects),
      send = vi.fn();
    await store.scheduleNext();
    await pool.query("UPDATE organizations SET additional_capacity_units=0 WHERE id=$1", [
      fixture.org
    ]);
    const summary = (await createPostgresBillingStore(db).getBillingSummaryForOrganization({
      organization_id: fixture.org,
      now: new Date().toISOString()
    }))!;
    await pool.query(
      `INSERT INTO report_email_deliveries(id,organization_id,expected_ready_sha256,status,attempt_id,allowance_state,allowance_window_starts_at,allowance_window_ends_at,allowance_reserved_at,send_deadline_at,expires_at,accepted_at)
      SELECT gen_random_uuid(),$1,repeat('0',64),'accepted',gen_random_uuid(),'charged',$2,$3,clock_timestamp(),clock_timestamp()+interval '1 day',clock_timestamp()+interval '90 days',clock_timestamp() FROM generate_series(1,$4::integer)`,
      [
        fixture.org,
        summary.usage_window.starts_at,
        summary.usage_window.ends_at,
        summary.allowances.monthly_alert_deliveries.limit
      ]
    );
    expect(await store.processNext(send)).toEqual({ processed: true });
    expect(send).not.toHaveBeenCalled();
    expect((await store.list(actor(run.id)))[0]?.reason).toBe("notification_allowance_exhausted");
    expect(await usage()).toBe(summary.allowances.monthly_alert_deliveries.limit);
  });
  it("expires unsent delivery metadata even with email unconfigured and never sends it later", async () => {
    const run = await publish(),
      store = createReportEmailStore(db, objects),
      send = vi.fn();
    await store.scheduleNext();
    await pool.query(
      "UPDATE report_email_deliveries SET send_deadline_at=clock_timestamp()-interval '1 second' WHERE run_id=$1",
      [run.id]
    );
    const off = createSmartReportProcessor({ db, objects, env: {}, emailSend: null });
    expect(await off()).toEqual({ processed: true });
    expect((await store.list(actor(run.id)))[0]).toMatchObject({
      status: "failed",
      reason: "delivery_expired"
    });
    await store.processNext(send);
    expect(send).not.toHaveBeenCalled();
    expect(await usage()).toBe(0);
  });
  it("does not revive privacy-invalidated work after a definite provider rejection", async () => {
    const run = await publish(),
      store = createReportEmailStore(db, objects),
      send = vi.fn(async () => {
        await pool.query(
          "UPDATE report_definitions SET privacy_mode='restricted',source_collection_consent=false WHERE id=$1",
          [run.definition_id]
        );
        throw new ReportEmailTransportError("rejected");
      });
    await store.scheduleNext();
    expect(await store.processNext(send)).toEqual({ processed: true });
    expect(
      (
        await pool.query(
          "SELECT status,allowance_state FROM report_email_deliveries WHERE run_id=$1",
          [run.id]
        )
      ).rows
    ).toEqual([{ status: "failed", allowance_state: "released" }]);
    expect(await usage()).toBe(0);
    expect(await store.processNext(send)).toEqual({ processed: false });
    expect(send).toHaveBeenCalledOnce();
  });
  it("fails runtime readiness when the required email deletion guard is disabled", async () => {
    const { migrateStorageSchema, assertStorageSchemaMigrationsApplied } =
      await import("../../packages/storage/src/schema-migrations.js");
    await migrateStorageSchema(db);
    await assertStorageSchemaMigrationsApplied(db);
    await pool.query("ALTER TABLE report_runs DISABLE TRIGGER report_runs_email_delete_guard");
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow(
      "report_email_schema_incomplete"
    );
  });
});
