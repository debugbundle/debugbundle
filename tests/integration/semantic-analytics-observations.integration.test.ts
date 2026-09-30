import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { afterAll, beforeEach, expect, it } from "vitest";
import { createDurableWorkerQueue } from "../../apps/worker/src/durable-queue.js";
import { processNextSemanticAnalyticsObservationJob } from "../../apps/worker/src/semantic-analytics-observation.js";
import { stableJson } from "../../packages/event-normalizer/src/canonical-json.js";
import {
  admitSemanticAnalyticsEvent,
  type SemanticAnalyticsAdmissionContext
} from "../../packages/event-normalizer/src/semantic-analytics-admission.js";
import type {
  AnalyticsCatalogEntry,
  SemanticAnalyticsEvent
} from "../../packages/shared-types/src/index.js";
import type { RedisQueueClient } from "../../packages/storage/src/index.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import {
  assertStorageSchemaMigrationsApplied,
  migrateStorageSchema
} from "../../packages/storage/src/schema-migrations.js";
import { persistProtectedSemanticAnalyticsEvent } from "../../packages/storage/src/semantic-analytics-persistence.js";
import { createSemanticAnalyticsReceiptStore } from "../../packages/storage/src/semantic-analytics-receipt-store.js";
import { createS3ObjectStoreClient } from "../../packages/storage/src/s3-client.js";
import { createPostgresRetentionStore } from "../../packages/storage/src/retention-store.js";
import {
  readProjectSemanticFunnelReport,
  readRecentProjectSemanticFunnelReport
} from "../../packages/storage/src/semantic-analytics-funnel-report.js";
import { retryFailedSemanticAnalyticsEvent } from "../../packages/storage/src/semantic-analytics-job-recovery.js";
import {
  createIntegrationPool,
  createS3AdminClient,
  createQueryable,
  runIntegration,
  seedOwnedProject,
  s3Bucket,
  s3Endpoint,
  s3Region
} from "../helpers/integration-setup.js";

runIntegration("semantic catalog observations", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const admin = createS3AdminClient();
  const objectStore = createS3ObjectStoreClient({
    endpoint: s3Endpoint,
    region: s3Region,
    bucket: s3Bucket,
    accessKeyId: "test",
    secretAccessKey: "test"
  });
  let projectId: string;
  let ownerUserId: string;

  beforeEach(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await admin.send(new CreateBucketCommand({ Bucket: s3Bucket })).catch(() => undefined);
    projectId = randomUUID();
    ({ ownerUserId } = await seedOwnedProject({
      pool,
      organizationId: randomUUID(),
      projectId,
      organizationName: "Growth",
      organizationSlug: `growth-${projectId}`,
      projectName: "App",
      projectSlug: `app-${projectId}`,
      organizationPlan: "team"
    }));
    const entry: AnalyticsCatalogEntry = {
      name: "account.created",
      revision: 1,
      description: "Committed account",
      producers: ["server"],
      purpose: "business_measurement",
      success_boundary: "committed",
      properties: {
        signup_method: { type: "enum", values: ["email", "oauth"], required: true }
      },
      measurements: {},
      expected_producers: []
    } as const;
    const hash = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");
    await pool.query(
      `INSERT INTO analytics_project_catalogs(project_id,revision,catalog_revision,content_hash,entries)
       VALUES($1::uuid,1,1,$2,$3::jsonb)`,
      [projectId, hash([entry]), JSON.stringify([entry])]
    );
    await pool.query(
      `INSERT INTO analytics_project_catalog_entry_revisions(project_id,name,revision,content_hash,entry)
       VALUES($1::uuid,$2,1,$3,$4::jsonb)`,
      [projectId, entry.name, hash(entry), JSON.stringify(entry)]
    );
  });
  afterAll(async () => {
    await pool.end();
    admin.destroy();
  });

  function admission() {
    const event = JSON.parse(
      readFileSync(new URL("../fixtures/analytics-semantic-event.json", import.meta.url), "utf8")
    ) as SemanticAnalyticsEvent;
    const context: SemanticAnalyticsAdmissionContext = {
      projectId,
      scope: { kind: "project", project_id: projectId },
      scopeRevision: 1,
      catalogRevision: 1,
      principal: "server_writer",
      receivedAt: "2026-09-28T10:01:00.000Z",
      enabled: true,
      businessMeasurementAllowed: true,
      minimumPrivacy: "strict",
      maxProperties: 1,
      earliestOccurredAt: "2026-09-26T10:00:00.000Z",
      identity: null,
      supportedCurrencies: { USD: 2 },
      catalog: [
        {
          name: "account.created",
          revision: 1,
          description: "Committed account",
          producers: ["server"],
          purpose: "business_measurement",
          success_boundary: "committed",
          properties: {
            signup_method: { type: "enum", values: ["email", "oauth"], required: true }
          },
          measurements: {},
          expected_producers: []
        }
      ]
    };
    const result = admitSemanticAnalyticsEvent(event, context);
    if (!result.accepted) throw new Error(`fixture rejected: ${result.reason}`);
    return result;
  }
  async function persist() {
    return persistProtectedSemanticAnalyticsEvent(
      createSemanticAnalyticsReceiptStore(db),
      {
        admission: admission(),
        principal: "server_writer",
        periodStartsAt: "2026-09-01T00:00:00.000Z",
        limits: {
          monthly_analytics_events: 10,
          monthly_analytics_sessions: 10,
          monthly_analytics_journey_samples: 10,
          monthly_analytics_bundle_generations: 10
        },
        recheck: async () => true
      },
      objectStore
    );
  }
  function queue() {
    return createDurableWorkerQueue(
      db,
      { claim: async () => null } as unknown as RedisQueueClient,
      false
    );
  }

  it("records one catalog observation in the same durable job transaction", async () => {
    expect((await persist()).kind).toBe("accepted");
    const worker = queue();
    try {
      expect(
        await processNextSemanticAnalyticsObservationJob({ queue: worker, objectStore })
      ).toEqual({
        processed: true
      });
      expect(
        await processNextSemanticAnalyticsObservationJob({ queue: worker, objectStore })
      ).toEqual({
        processed: false,
        reason: "no_jobs"
      });
    } finally {
      await worker.close();
    }
    expect(
      (
        await pool.query(
          "SELECT status FROM worker_jobs WHERE job_name='process-semantic-analytics-event'"
        )
      ).rows
    ).toEqual([{ status: "completed" }]);
    expect(
      (
        await pool.query(
          "SELECT event_name,event_revision,producer_kind,accepted_count FROM semantic_analytics_catalog_observations"
        )
      ).rows
    ).toEqual([
      {
        event_name: "account.created",
        event_revision: "1",
        producer_kind: "server",
        accepted_count: "1"
      }
    ]);
    expect(
      (
        await pool.query(
          `SELECT sdk_name,sdk_version,accepted_count
           FROM semantic_analytics_producer_observations WHERE project_id=$1::uuid`,
          [projectId]
        )
      ).rows
    ).toEqual([
      {
        sdk_name: admission().event.sdk_name,
        sdk_version: admission().event.sdk_version,
        accepted_count: "1"
      }
    ]);
    expect((await persist()).kind).toBe("accepted");
    expect(
      (await pool.query("SELECT accepted_count FROM semantic_analytics_catalog_observations")).rows
    ).toEqual([{ accepted_count: "1" }]);
    expect(
      (await pool.query("SELECT accepted_count FROM semantic_analytics_producer_observations")).rows
    ).toEqual([{ accepted_count: "1" }]);
  });

  it("requeues an exact retained failed job and completes its effect once", async () => {
    expect((await persist()).kind).toBe("accepted");
    const receipt = (
      await pool.query<{ event_id: string; worker_job_id: string }>(
        "SELECT event_id,worker_job_id FROM semantic_analytics_receipts WHERE project_id=$1::uuid",
        [projectId]
      )
    ).rows[0]!;
    await pool.query(
      "UPDATE worker_jobs SET status='failed',attempts=8,last_error_code='attempts_exhausted' WHERE id=$1",
      [receipt.worker_job_id]
    );
    const request = { actorUserId: ownerUserId, projectId, eventId: receipt.event_id };
    expect(await retryFailedSemanticAnalyticsEvent(db, request)).toEqual({ kind: "queued" });
    const worker = queue();
    try {
      expect(
        await processNextSemanticAnalyticsObservationJob({ queue: worker, objectStore })
      ).toEqual({ processed: true });
      expect(
        await processNextSemanticAnalyticsObservationJob({ queue: worker, objectStore })
      ).toEqual({ processed: false, reason: "no_jobs" });
    } finally {
      await worker.close();
    }
    expect(await retryFailedSemanticAnalyticsEvent(db, request)).toEqual({ kind: "unavailable" });
    expect(
      (
        await pool.query(
          "SELECT accepted_count FROM semantic_analytics_catalog_observations WHERE project_id=$1::uuid",
          [projectId]
        )
      ).rows
    ).toEqual([{ accepted_count: "1" }]);
  });

  it("refuses retry after payload mismatch, retry cap or raw-retention transition", async () => {
    expect((await persist()).kind).toBe("accepted");
    const receipt = (await pool.query<{ event_id: string; worker_job_id: string }>(
      "SELECT event_id,worker_job_id FROM semantic_analytics_receipts WHERE project_id=$1::uuid",
      [projectId]
    )).rows[0]!;
    const request = { actorUserId: ownerUserId, projectId, eventId: receipt.event_id };
    await pool.query(
      `UPDATE worker_jobs SET status='failed',attempts=8,
         payload=jsonb_set(payload,'{content_hash}',to_jsonb($2::text)) WHERE id=$1`,
      [receipt.worker_job_id, `sha256:${"0".repeat(64)}`]
    );
    expect(await retryFailedSemanticAnalyticsEvent(db, request)).toEqual({ kind: "unavailable" });
    await pool.query(
      `UPDATE worker_jobs SET payload=jsonb_set(payload,'{content_hash}',to_jsonb($2::text)),operator_retries=3 WHERE id=$1`,
      [receipt.worker_job_id, admission().content_hash]
    );
    expect(await retryFailedSemanticAnalyticsEvent(db, request)).toEqual({ kind: "unavailable" });
    await pool.query("UPDATE worker_jobs SET operator_retries=0 WHERE id=$1", [receipt.worker_job_id]);
    await pool.query(
      `UPDATE semantic_analytics_receipts SET raw_status='deleting',raw_retention_outcome='lost'
       WHERE project_id=$1::uuid AND event_id=$2::uuid`,
      [projectId, receipt.event_id]
    );
    expect(await retryFailedSemanticAnalyticsEvent(db, request)).toEqual({ kind: "unavailable" });
  });

  it("reads a project funnel with pending, lost and unverified-source quality", async () => {
    const definition = {
      kind: "ordered_funnel",
      key: "signup",
      revision: 1,
      display_name: "Signup",
      scope: { kind: "project", project_id: projectId },
      subject: "session",
      timezone: "UTC",
      conversion_window_seconds: 3600,
      breakdown: null,
      steps: [
        {
          key: "start",
          predicate: { field: "event_name", operator: "in", values: ["account.created"] }
        },
        {
          key: "finish",
          predicate: { field: "event_name", operator: "in", values: ["account.activated"] }
        }
      ]
    };
    const report = { definition, available_from: "2026-09-27T00:00:00.000Z" };
    const hash = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");
    const catalog = (
      await pool.query<{ entries: unknown }>(
        "SELECT entries FROM analytics_project_catalogs WHERE project_id=$1::uuid",
        [projectId]
      )
    ).rows[0]?.entries;
    await pool.query(
      `INSERT INTO analytics_project_plans(project_id,revision,catalog_revision,content_hash,catalog,reports)
       VALUES($1::uuid,1,1,$2,$3::jsonb,$4::jsonb)`,
      [projectId, hash(report), JSON.stringify(catalog), JSON.stringify([report])]
    );
    await pool.query(
      `INSERT INTO analytics_project_report_revisions(project_id,report_key,revision,content_hash,definition,available_from)
       VALUES($1::uuid,'signup',1,$2,$3::jsonb,$4::timestamptz)`,
      [projectId, hash(definition), JSON.stringify(definition), report.available_from]
    );
    const eventId = randomUUID();
    await pool.query(
      `INSERT INTO semantic_analytics_funnel_facts(project_id,report_key,report_revision,event_id,occurred_at,fact)
       VALUES($1::uuid,'signup',1,$2::uuid,$3::timestamptz,$4::jsonb)`,
      [
        projectId,
        eventId,
        "2026-09-28T10:00:00.000Z",
        JSON.stringify({
          subject: "session",
          scope: definition.scope,
          scope_revision: 1,
          definition_key: "signup",
          definition_revision: 1,
          event_id: eventId,
          origin_project_id: projectId,
          content_hash: "a".repeat(64),
          subject_key: "b".repeat(64),
          occurred_at: "2026-09-28T10:00:00.000Z",
          received_at: "2026-09-28T10:01:00.000Z",
          producer_kind: "browser",
          stream_id: null,
          sequence: null,
          matches: [true, false],
          breakdown: { kind: "missing" }
        })
      ]
    );
    await pool.query(
      `INSERT INTO semantic_analytics_receipts(project_id,event_id,content_hash,raw_object_key,
         worker_job_id,principal,authority,scope,scope_revision,catalog_revision,
         occurred_at,accepted_at,expires_at,raw_status,raw_retention_outcome,raw_deleted_at)
       VALUES($1::uuid,$2::uuid,$3,'completed-object',$4,'project_token','client_observed',
         $5::jsonb,1,1,'2026-09-28T10:00:00.000Z','2026-09-28T10:01:00.000Z',
         '2026-10-01T10:01:00.000Z','deleted','job_completed',now())`,
      [
        projectId,
        eventId,
        `sha256:${"a".repeat(64)}`,
        "a".repeat(64),
        JSON.stringify(definition.scope)
      ]
    );
    const pendingEventId = randomUUID();
    await pool.query(
      `INSERT INTO semantic_analytics_receipts(project_id,event_id,content_hash,raw_object_key,
         worker_job_id,principal,authority,scope,scope_revision,catalog_revision,
         occurred_at,accepted_at,expires_at)
       VALUES($1::uuid,$2::uuid,$3,'pending-object',$4,'project_token','client_observed',
         $5::jsonb,1,1,'2026-09-28T11:00:00.000Z','2026-09-28T11:01:00.000Z',
         '2026-10-01T11:01:00.000Z')`,
      [
        projectId,
        pendingEventId,
        `sha256:${"c".repeat(64)}`,
        "d".repeat(64),
        JSON.stringify(definition.scope)
      ]
    );
    await pool.query(
      `INSERT INTO worker_jobs(id,job_name,project_id,payload,status)
       VALUES($1,'process-semantic-analytics-event',$2::uuid,$3::jsonb,'pending')`,
      [
        "d".repeat(64),
        projectId,
        JSON.stringify({
          project_id: projectId,
          event_id: pendingEventId,
          content_hash: `sha256:${"c".repeat(64)}`,
          object_key: "pending-object"
        })
      ]
    );
    await pool.query(
      `INSERT INTO semantic_analytics_receipts(project_id,event_id,content_hash,raw_object_key,
         worker_job_id,principal,authority,scope,scope_revision,catalog_revision,
         occurred_at,accepted_at,expires_at)
       VALUES($1::uuid,$2::uuid,$3,'later-pending-object',$4,'project_token','client_observed',
         $5::jsonb,1,1,'2026-09-28T12:00:00.000Z','2026-09-28T12:01:00.000Z',
         '2026-10-01T12:01:00.000Z')`,
      [
        projectId,
        randomUUID(),
        `sha256:${"e".repeat(64)}`,
        "f".repeat(64),
        JSON.stringify(definition.scope)
      ]
    );
    await pool.query(
      `INSERT INTO semantic_analytics_loss_days(project_id,occurred_on,lost_count)
       VALUES($1::uuid,'2026-09-28',2),($1::uuid,'2026-09-29',5)`,
      [projectId]
    );

    const input = {
      actorUserId: ownerUserId,
      projectId,
      reportKey: "signup",
      from: "2026-09-28T00:00:00.000Z",
      to: "2026-09-28T10:30:00.000Z"
    };
    const result = await readProjectSemanticFunnelReport(db, input);
    expect(result.kind).toBe("report");
    if (result.kind !== "report") return;
    expect(result.evidence).toEqual({
      pending_events: "1",
      failed_events: "0",
      lost_events: "2",
      excluded_events: "0",
      erasure_tasks: "0",
      source_coverage: "unverified"
    });
    await pool.query("UPDATE worker_jobs SET status='failed' WHERE id=$1", ["d".repeat(64)]);
    const stalled = await readProjectSemanticFunnelReport(db, input);
    expect(stalled.kind).toBe("report");
    if (stalled.kind === "report")
      expect(stalled.evidence).toMatchObject({ pending_events: "1", failed_events: "1" });
    expect(
      await retryFailedSemanticAnalyticsEvent(db, {
        actorUserId: randomUUID(),
        projectId,
        eventId: pendingEventId
      })
    ).toEqual({ kind: "forbidden" });
    expect(
      await retryFailedSemanticAnalyticsEvent(db, {
        actorUserId: ownerUserId,
        projectId,
        eventId: pendingEventId
      })
    ).toEqual({ kind: "queued" });
    expect(
      (
        await pool.query("SELECT status,attempts,operator_retries FROM worker_jobs WHERE id=$1", [
          "d".repeat(64)
        ])
      ).rows[0]
    ).toMatchObject({ status: "pending", attempts: 0, operator_retries: 1 });
    const recovering = await readProjectSemanticFunnelReport(db, input);
    expect(recovering.kind).toBe("report");
    if (recovering.kind === "report")
      expect(recovering.evidence).toMatchObject({ pending_events: "1", failed_events: "0" });
    expect(result.report).toMatchObject({
      status: "available",
      quality: "partial",
      quality_reasons: expect.arrayContaining(["incomplete_evidence"]),
      population: { entered: 1, completed: 0, expired: 0, open: 0, unknown: 1, mature: 1 }
    });
    expect(
      await readProjectSemanticFunnelReport(db, { ...input, actorUserId: randomUUID() })
    ).toEqual({
      kind: "forbidden"
    });
    expect(
      await readProjectSemanticFunnelReport(db, {
        ...input,
        from: "2026-09-26T00:00:00.000Z"
      })
    ).toEqual({ kind: "insufficient_history" });
    const recentAvailableFrom = new Date(Date.now() - 8 * 86_400_000).toISOString();
    await pool.query(
      `UPDATE analytics_project_plans SET reports=$2::jsonb WHERE project_id=$1::uuid`,
      [projectId, JSON.stringify([{ ...report, available_from: recentAvailableFrom }])]
    );
    await pool.query(
      `UPDATE analytics_project_report_revisions SET available_from=$2::timestamptz
       WHERE project_id=$1::uuid AND report_key='signup'`,
      [projectId, recentAvailableFrom]
    );
    await pool.query(
      `INSERT INTO project_analytics_settings(project_id,hourly_retention_days)
       VALUES($1::uuid,7)
       ON CONFLICT(project_id) DO UPDATE SET hourly_retention_days=EXCLUDED.hourly_retention_days`,
      [projectId]
    );
    const slowClockDb = {
      ...db,
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => {
        const response = await db.query<Row>(sql, params);
        if (sql.includes("clock_timestamp()"))
          await new Promise((resolve) => setTimeout(resolve, 20));
        return response;
      }
    };
    expect(
      await readRecentProjectSemanticFunnelReport(slowClockDb, {
        actorUserId: ownerUserId,
        projectId,
        reportKey: "signup",
        last: "7d"
      })
    ).toMatchObject({ kind: "report", report: { status: "available" } });
    expect(JSON.stringify(result)).not.toContain(eventId);
    await pool.query(
      `INSERT INTO analytics_project_subject_erasures(
         task_id,project_id,writer_id,idempotency_key,mutation_hash,
         namespace_revision,subject_kind,subject_ref,cutoff_at)
       VALUES($1,$2,$3,$4,$5,1,'anonymous',$6,now())`,
      [
        randomUUID(),
        projectId,
        randomUUID(),
        randomUUID(),
        "a".repeat(64),
        `sha256:${"b".repeat(64)}`
      ]
    );
    expect(await readProjectSemanticFunnelReport(db, input)).toMatchObject({
      kind: "report",
      evidence: { erasure_tasks: "1" },
      report: { status: "available", quality: "partial" }
    });
    const contextId = randomUUID();
    const writerId = randomUUID();
    await pool.query(
      `UPDATE semantic_analytics_receipts
       SET principal='relay',identity_scope=$3::jsonb,identity_verification='project_anonymous',
           namespace_revision=1,identity_context_id=$4::uuid,identity_writer_id=$5::uuid
       WHERE project_id=$1::uuid AND event_id=$2::uuid`,
      [projectId, eventId, JSON.stringify(definition.scope), contextId, writerId]
    );
    await pool.query(
      `INSERT INTO analytics_project_identity_revocations(
         context_id,project_id,writer_id,producer_epoch,binding_hash,revoked_at)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,now())`,
      [contextId, projectId, writerId, randomUUID(), `sha256:${"f".repeat(64)}`]
    );
    const afterRevocation = await readProjectSemanticFunnelReport(db, input);
    expect(afterRevocation).toMatchObject({
      kind: "report",
      evidence: { excluded_events: "1" },
      report: { status: "available", quality: "partial", population: { entered: 0 } }
    });
    await pool.query(
      "UPDATE analytics_project_plans SET reports='[]'::jsonb WHERE project_id=$1::uuid",
      [projectId]
    );
    expect(await readProjectSemanticFunnelReport(db, input)).toEqual({ kind: "not_found" });
  });

  it("persists a project session funnel fact from the plan active at acceptance", async () => {
    const entry: AnalyticsCatalogEntry = {
      name: "account.created",
      revision: 1,
      description: "Viewed account creation",
      producers: ["browser"],
      purpose: "product_analytics",
      success_boundary: "observed",
      properties: {
        signup_method: { type: "enum", values: ["email", "oauth"], required: true }
      },
      measurements: {},
      expected_producers: []
    };
    const definition = {
      kind: "ordered_funnel",
      key: "signup",
      revision: 1,
      display_name: "Signup",
      scope: { kind: "project", project_id: projectId },
      subject: "session",
      timezone: "UTC",
      conversion_window_seconds: 604800,
      breakdown: null,
      steps: [
        {
          key: "start",
          predicate: { field: "event_name", operator: "in", values: ["account.created"] }
        },
        {
          key: "finish",
          predicate: { field: "event_name", operator: "in", values: ["account.activated"] }
        }
      ]
    };
    const hash = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");
    await pool.query(
      "UPDATE analytics_project_catalogs SET entries=$2::jsonb WHERE project_id=$1::uuid",
      [projectId, JSON.stringify([entry])]
    );
    await pool.query(
      `UPDATE analytics_project_catalog_entry_revisions
       SET entry=$2::jsonb,content_hash=$3 WHERE project_id=$1::uuid`,
      [projectId, JSON.stringify(entry), hash(entry)]
    );
    const report = { definition, available_from: "2026-09-27T00:00:00.000Z" };
    await pool.query(
      `INSERT INTO analytics_project_plans(project_id,revision,catalog_revision,content_hash,catalog,reports)
       VALUES($1::uuid,1,1,$2,$3::jsonb,$4::jsonb)`,
      [projectId, hash([entry, report]), JSON.stringify([entry]), JSON.stringify([report])]
    );
    await pool.query(
      `INSERT INTO analytics_project_plan_revisions(project_id,revision,catalog_revision,
         idempotency_key,mutation_hash,review_hash,content_hash,capacity_limit,
         legacy_saved_funnels,catalog,reports,applied_at)
       VALUES($1::uuid,1,1,$2::uuid,$3,$3,$3,10,0,$4::jsonb,$5::jsonb,
         '2026-09-27T00:00:00.000Z'::timestamptz)`,
      [projectId, randomUUID(), hash(report), JSON.stringify([entry]), JSON.stringify([report])]
    );
    await pool.query(
      `INSERT INTO analytics_project_report_revisions(project_id,report_key,revision,content_hash,definition,available_from)
       VALUES($1::uuid,'signup',1,$2,$3::jsonb,'2026-09-27T00:00:00.000Z'::timestamptz)`,
      [projectId, hash(definition), JSON.stringify(definition)]
    );
    const source = JSON.parse(
      readFileSync(new URL("../fixtures/analytics-semantic-event.json", import.meta.url), "utf8")
    ) as SemanticAnalyticsEvent;
    const sessionId = randomUUID();
    const event = {
      ...source,
      sdk_name: "@debugbundle/sdk-browser",
      service: { ...source.service, runtime: "browser" },
      producer: { kind: "browser" as const, stream_id: null, sequence: null },
      operation_id: null,
      correlation: { ...source.correlation, session_id: sessionId },
      payload: {
        ...source.payload,
        purpose: "product_analytics" as const,
        privacy: { mode: "strict" as const, consent_granted: true }
      }
    };
    const admitted = admitSemanticAnalyticsEvent(event, {
      projectId,
      scope: { kind: "project", project_id: projectId },
      scopeRevision: 1,
      catalogRevision: 1,
      principal: "project_token",
      receivedAt: "2026-09-28T10:01:00.000Z",
      enabled: true,
      businessMeasurementAllowed: false,
      minimumPrivacy: "strict",
      maxProperties: 1,
      earliestOccurredAt: "2026-09-26T10:00:00.000Z",
      identity: null,
      supportedCurrencies: { USD: 2 },
      catalog: [entry]
    });
    expect(admitted.accepted).toBe(true);
    if (!admitted.accepted) throw new Error(admitted.reason);
    expect(
      (
        await persistProtectedSemanticAnalyticsEvent(
          createSemanticAnalyticsReceiptStore(db),
          {
            admission: admitted,
            principal: "project_token",
            periodStartsAt: "2026-09-01T00:00:00.000Z",
            limits: {
              monthly_analytics_events: 10,
              monthly_analytics_sessions: 10,
              monthly_analytics_journey_samples: 10,
              monthly_analytics_bundle_generations: 10
            },
            recheck: async () => true
          },
          objectStore
        )
      ).kind
    ).toBe("accepted");
    // A later plan removal must not rewrite the accepted event's definition snapshot.
    await pool.query(
      `UPDATE analytics_project_plans SET revision=2,reports='[]'::jsonb
       WHERE project_id=$1::uuid`,
      [projectId]
    );
    await pool.query(
      `INSERT INTO analytics_project_plan_revisions(project_id,revision,catalog_revision,
         idempotency_key,mutation_hash,review_hash,content_hash,capacity_limit,
         legacy_saved_funnels,catalog,reports,applied_at)
       VALUES($1::uuid,2,1,$2::uuid,$3,$3,$3,10,0,$4::jsonb,'[]'::jsonb,clock_timestamp())`,
      [projectId, randomUUID(), hash(entry), JSON.stringify([entry])]
    );
    const worker = queue();
    try {
      expect(
        await processNextSemanticAnalyticsObservationJob({ queue: worker, objectStore })
      ).toEqual({ processed: true });
    } finally {
      await worker.close();
    }
    const facts = (
      await pool.query<{
        report_key: string;
        report_revision: string;
        fact: { matches: boolean[]; subject_key: string };
      }>(
        "SELECT report_key,report_revision,fact FROM semantic_analytics_funnel_facts WHERE project_id=$1::uuid",
        [projectId]
      )
    ).rows;
    expect(facts).toHaveLength(1);
    expect(facts[0]?.report_key).toBe("signup");
    expect(facts[0]?.report_revision).toBe("1");
    expect(facts[0]?.fact.matches).toEqual([true, false]);
    expect(facts[0]?.fact.subject_key).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(facts)).not.toContain(sessionId);
    await createPostgresRetentionStore(db).pruneExpiredAnalyticsRollups({
      now: "2026-09-29T00:00:00.000Z",
      limit: 100
    });
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_funnel_facts")).rows[0]?.count
    ).toBe("1");
    await pool.query("UPDATE semantic_analytics_funnel_facts SET occurred_at='2024-01-01'");
    await createPostgresRetentionStore(db).pruneExpiredAnalyticsRollups({
      now: "2026-09-29T00:00:00.000Z",
      limit: 100
    });
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_funnel_facts")).rows[0]?.count
    ).toBe("0");
  });

  it("does not complete or count a job whose immutable catalog entry has gone missing", async () => {
    await persist();
    await pool.query("DELETE FROM analytics_project_catalog_entry_revisions WHERE project_id=$1", [
      projectId
    ]);
    const worker = queue();
    try {
      await expect(
        processNextSemanticAnalyticsObservationJob({ queue: worker, objectStore })
      ).rejects.toThrow("semantic_worker_catalog_unavailable");
      await worker.failClaimedJobs();
    } finally {
      await worker.close();
    }
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_catalog_observations")).rows[0]
        ?.count
    ).toBe("0");
    expect(
      (
        await pool.query(
          "SELECT status FROM worker_jobs WHERE job_name='process-semantic-analytics-event'"
        )
      ).rows
    ).toEqual([{ status: "pending" }]);
  });

  it("does not project a queued event after its receipt is revoked", async () => {
    await persist();
    await pool.query("DELETE FROM semantic_analytics_receipts WHERE project_id=$1", [projectId]);
    const worker = queue();
    try {
      expect(
        await processNextSemanticAnalyticsObservationJob({ queue: worker, objectStore })
      ).toEqual({ processed: false, reason: "receipt_unavailable" });
    } finally {
      await worker.close();
    }
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_catalog_observations")).rows[0]
        ?.count
    ).toBe("0");
    expect(
      (
        await pool.query(
          "SELECT status FROM worker_jobs WHERE job_name='process-semantic-analytics-event'"
        )
      ).rows
    ).toEqual([{ status: "completed" }]);
  });

  it("rolls an observation back if durable job completion fails, then counts one retry", async () => {
    await persist();
    await pool.query(`CREATE FUNCTION reject_semantic_job_completion() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.job_name='process-semantic-analytics-event' AND NEW.status='completed'
        THEN RAISE EXCEPTION 'completion unavailable'; END IF;
        RETURN NEW;
      END $$`);
    await pool.query(`CREATE TRIGGER reject_semantic_job_completion
      BEFORE UPDATE OF status ON worker_jobs
      FOR EACH ROW EXECUTE FUNCTION reject_semantic_job_completion()`);
    const worker = queue();
    try {
      await expect(
        processNextSemanticAnalyticsObservationJob({ queue: worker, objectStore })
      ).rejects.toThrow("completion unavailable");
      await worker.failClaimedJobs();
      expect(
        (await pool.query("SELECT count(*) FROM semantic_analytics_catalog_observations")).rows[0]
          ?.count
      ).toBe("0");
      expect(
        (await pool.query("SELECT count(*) FROM semantic_analytics_producer_observations")).rows[0]
          ?.count
      ).toBe("0");
      await pool.query("DROP TRIGGER reject_semantic_job_completion ON worker_jobs");
      await pool.query("DROP FUNCTION reject_semantic_job_completion()");
      await pool.query(
        "UPDATE worker_jobs SET available_at=now() WHERE job_name='process-semantic-analytics-event'"
      );
      expect(
        await processNextSemanticAnalyticsObservationJob({ queue: worker, objectStore })
      ).toEqual({
        processed: true
      });
      expect(
        (await pool.query("SELECT accepted_count FROM semantic_analytics_catalog_observations"))
          .rows
      ).toEqual([{ accepted_count: "1" }]);
      expect(
        (await pool.query("SELECT accepted_count FROM semantic_analytics_producer_observations"))
          .rows
      ).toEqual([{ accepted_count: "1" }]);
    } finally {
      await worker.close();
    }
  });

  it("requires the observation migration before API/worker readiness and upgrades a populated predecessor", async () => {
    await migrateStorageSchema(db);
    await pool.query("DROP TABLE semantic_analytics_catalog_observations");
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202609280007_add_semantic_catalog_observations'"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow();
    const upgraded = await migrateStorageSchema(db);
    expect(upgraded.applied).toContain("202609280007_add_semantic_catalog_observations");
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
    expect(
      (await pool.query("SELECT id FROM projects WHERE id=$1", [projectId])).rows
    ).toHaveLength(1);
  });

  it("requires the producer observation migration without relabeling older observations", async () => {
    await migrateStorageSchema(db);
    await pool.query(
      `INSERT INTO semantic_analytics_catalog_observations(
         project_id,catalog_revision,event_name,event_revision,producer_kind,observed_on,
         accepted_count,first_occurred_at,last_occurred_at,last_accepted_at)
       VALUES($1::uuid,1,'account.created',1,'server','2026-09-28',2,
         '2026-09-28T10:00:00Z','2026-09-28T10:01:00Z','2026-09-28T10:02:00Z')`,
      [projectId]
    );
    await pool.query("DROP TABLE semantic_analytics_producer_observations");
    await pool.query(
      "DELETE FROM storage_migration_ledger WHERE id='202609280015_add_semantic_producer_observations'"
    );
    await expect(assertStorageSchemaMigrationsApplied(db)).rejects.toThrow();
    const upgraded = await migrateStorageSchema(db);
    expect(upgraded.applied).toContain("202609280015_add_semantic_producer_observations");
    expect(
      (await pool.query("SELECT accepted_count FROM semantic_analytics_catalog_observations")).rows
    ).toEqual([{ accepted_count: "2" }]);
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_producer_observations")).rows[0]
        ?.count
    ).toBe("0");
    await expect(assertStorageSchemaMigrationsApplied(db)).resolves.toBeUndefined();
  });

  it("prunes expired observation aggregates using project aggregate retention", async () => {
    await persist();
    const worker = queue();
    try {
      await processNextSemanticAnalyticsObservationJob({ queue: worker, objectStore });
    } finally {
      await worker.close();
    }
    const retention = createPostgresRetentionStore(db);
    await retention.pruneExpiredAnalyticsRollups({
      now: "2026-09-28T12:00:00.000Z",
      limit: 100
    });
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_catalog_observations")).rows[0]
        ?.count
    ).toBe("1");
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_producer_observations")).rows[0]
        ?.count
    ).toBe("1");
    await pool.query("UPDATE semantic_analytics_catalog_observations SET observed_on='2024-01-01'");
    await pool.query(
      "UPDATE semantic_analytics_producer_observations SET observed_on='2024-01-01'"
    );
    await retention.pruneExpiredAnalyticsRollups({
      now: "2026-09-28T12:00:00.000Z",
      limit: 100
    });
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_catalog_observations")).rows[0]
        ?.count
    ).toBe("0");
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_producer_observations")).rows[0]
        ?.count
    ).toBe("0");
  });
});
