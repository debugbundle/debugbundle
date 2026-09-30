import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { afterAll, beforeEach, expect, it } from "vitest";
import { SemanticAnalyticsEventSchema } from "../../packages/shared-types/src/index.js";
import { stableJson } from "../../packages/event-normalizer/src/canonical-json.js";
import { createDurableWorkerQueue } from "../../apps/worker/src/durable-queue.js";
import { processNextSemanticAnalyticsObservationJob } from "../../apps/worker/src/semantic-analytics-observation.js";
import { readProjectSemanticFunnelReport } from "../../packages/storage/src/semantic-analytics-funnel-report.js";
import type { RedisQueueClient } from "../../packages/storage/src/index.js";
import type { Queryable } from "../../packages/storage/src/types.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { createSemanticAnalyticsReceiptStore } from "../../packages/storage/src/semantic-analytics-receipt-store.js";
import { persistCurrentProjectSemanticAnalyticsEvent } from "../../packages/storage/src/semantic-analytics-persistence.js";
import { loadVerifiedSemanticAnalyticsWorkerInput } from "../../packages/storage/src/semantic-analytics-worker-input.js";
import { requestProjectAnalyticsSubjectErasure } from "../../packages/storage/src/analytics-subject-erasure-store.js";
import { processProjectAnalyticsSubjectErasurePass } from "../../packages/storage/src/analytics-subject-erasure-processor.js";
import {
  createProjectAnalyticsIdentityContext,
  revokeProjectAnalyticsIdentityContext
} from "../../packages/storage/src/analytics-identity-context-store.js";
import {
  createIntegrationPool,
  createS3AdminClient,
  createQueryable,
  createTestObjectStore,
  runIntegration,
  seedOwnedProject,
  s3Bucket
} from "../helpers/integration-setup.js";

runIntegration("semantic relay identity admission", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const s3Admin = createS3AdminClient();
  const objectStore = createTestObjectStore();
  let projectId: string;
  let writerId: string;
  let writerHash: string;
  let ownerUserId: string;

  beforeEach(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await s3Admin.send(new CreateBucketCommand({ Bucket: s3Bucket })).catch(() => undefined);
    const organizationId = randomUUID();
    projectId = randomUUID();
    ({ ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Growth",
      organizationSlug: `growth-${projectId}`,
      projectName: "App",
      projectSlug: `app-${projectId}`,
      organizationPlan: "team"
    }));
    writerHash = "a".repeat(64);
    writerId = randomUUID();
    await pool.query(
      "INSERT INTO project_analytics_settings(project_id,enabled,privacy_mode,max_custom_dimensions) VALUES($1,true,'strict',2)",
      [projectId]
    );
    await pool.query("INSERT INTO analytics_writer_state(project_id,revision) VALUES($1,1)", [
      projectId
    ]);
    await pool.query(
      `INSERT INTO analytics_writers(id,project_id,organization_id,issuer_user_id,kind,display_name,token_hash,expires_at)
      VALUES($1,$2,$3,$4,'server','Relay writer',$5,now()+interval '30 days')`,
      [writerId, projectId, organizationId, ownerUserId, writerHash]
    );
    const catalog = [
      {
        name: "account.created",
        revision: 1,
        description: "Committed account",
        producers: ["server"],
        purpose: "business_measurement",
        success_boundary: "committed",
        properties: { signup_method: { type: "enum", values: ["email", "oauth"], required: true } },
        measurements: {},
        expected_producers: []
      }
    ];
    await pool.query(
      "INSERT INTO analytics_project_catalogs(project_id,revision,catalog_revision,content_hash,entries) VALUES($1,1,1,$2,$3::jsonb)",
      [projectId, "b".repeat(64), JSON.stringify(catalog)]
    );
    await pool.query(
      "INSERT INTO analytics_project_plans(project_id,revision,catalog_revision,business_measurement_enabled,content_hash,catalog,reports) VALUES($1,1,1,false,$2,$3::jsonb,'[]'::jsonb)",
      [projectId, "c".repeat(64), JSON.stringify(catalog)]
    );
  });
  afterAll(async () => {
    await pool.end();
    s3Admin.destroy();
  });
  const serverEvent = () =>
    SemanticAnalyticsEventSchema.parse(
      JSON.parse(
        readFileSync(new URL("../fixtures/analytics-semantic-event.json", import.meta.url), "utf8")
      )
    );

  it("binds server subject facts to the authenticated writer and current namespace through worker replay", async () => {
    await pool.query(
      "UPDATE project_analytics_settings SET privacy_mode='custom' WHERE project_id=$1",
      [projectId]
    );
    await pool.query(
      "UPDATE analytics_project_plans SET business_measurement_enabled=true WHERE project_id=$1",
      [projectId]
    );
    await pool.query(
      "INSERT INTO analytics_project_identity_namespaces(project_id,namespace_revision,key_fingerprint) VALUES($1,1,$2)",
      [projectId, `sha256:${"b".repeat(64)}`]
    );
    const hash = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");
    const availableFrom = new Date(Date.now() - 120_000).toISOString();
    const definition = {
      kind: "ordered_funnel",
      key: "server_signup",
      revision: 1,
      display_name: "Server signup",
      scope: { kind: "project", project_id: projectId },
      subject: "user",
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
          predicate: { field: "event_name", operator: "in", values: ["account.completed"] }
        }
      ]
    };
    const reportState = { definition, available_from: availableFrom };
    await pool.query("UPDATE analytics_project_plans SET reports=$2::jsonb WHERE project_id=$1", [
      projectId,
      JSON.stringify([reportState])
    ]);
    const catalog = (
      await pool.query<{ entries: unknown }>(
        "SELECT entries FROM analytics_project_catalogs WHERE project_id=$1",
        [projectId]
      )
    ).rows[0]!.entries;
    const entry = (catalog as Array<unknown>)[0];
    await pool.query(
      `INSERT INTO analytics_project_catalog_entry_revisions(project_id,name,revision,content_hash,entry)
       VALUES($1::uuid,'account.created',1,$2,$3::jsonb)`,
      [projectId, hash(entry), JSON.stringify(entry)]
    );
    await pool.query(
      `INSERT INTO analytics_project_plan_revisions(project_id,revision,catalog_revision,
         idempotency_key,mutation_hash,review_hash,content_hash,capacity_limit,
         legacy_saved_funnels,catalog,reports,applied_at)
       VALUES($1::uuid,1,1,$2::uuid,$3,$3,$3,50,0,$4::jsonb,$5::jsonb,$6::timestamptz)`,
      [
        projectId,
        randomUUID(),
        hash(reportState),
        JSON.stringify(catalog),
        JSON.stringify([reportState]),
        availableFrom
      ]
    );
    await pool.query(
      `INSERT INTO analytics_project_report_revisions(project_id,report_key,revision,
         content_hash,definition,available_from)
       VALUES($1::uuid,'server_signup',1,$2,$3::jsonb,$4::timestamptz)`,
      [projectId, hash(definition), JSON.stringify(definition), availableFrom]
    );
    const value = serverEvent();
    value.event_id = randomUUID();
    value.occurred_at = new Date().toISOString();
    value.payload.privacy.mode = "custom";
    value.correlation.namespace_revision = 1;
    value.correlation.user_id_hash = `sha256:${"c".repeat(64)}`;
    const input = {
      policy: { projectId, principal: "server_writer" as const, credentialHash: writerHash },
      event: value
    };
    expect(
      await persistCurrentProjectSemanticAnalyticsEvent(
        db,
        createSemanticAnalyticsReceiptStore(db),
        objectStore,
        input
      )
    ).toMatchObject({ kind: "accepted", duplicate: false });
    const receipt = (
      await pool.query<{ identity_writer_id: string; identity_context_id: string | null }>(
        "SELECT identity_writer_id,identity_context_id FROM semantic_analytics_receipts WHERE project_id=$1 AND event_id=$2",
        [projectId, value.event_id]
      )
    ).rows[0];
    expect(receipt).toEqual({ identity_writer_id: writerId, identity_context_id: null });
    const job = (
      await pool.query<{ id: string; payload: Record<string, unknown> }>(
        "SELECT id,payload FROM worker_jobs WHERE job_name='process-semantic-analytics-event' AND project_id=$1",
        [projectId]
      )
    ).rows[0]!;
    expect(await loadVerifiedSemanticAnalyticsWorkerInput(db, objectStore, job)).toMatchObject({
      provenance: { identity_writer_id: writerId, identity_verification: "server_namespace" }
    });
    const queue = createDurableWorkerQueue(
      db,
      { claim: async () => null } as unknown as RedisQueueClient,
      false
    );
    try {
      expect(await processNextSemanticAnalyticsObservationJob({ queue, objectStore })).toEqual({
        processed: true
      });
    } finally {
      await queue.close();
    }
    const reportQuery = {
      actorUserId: ownerUserId,
      projectId,
      reportKey: "server_signup",
      from: new Date(Date.parse(value.occurred_at) - 60_000).toISOString(),
      to: new Date(Date.parse(value.occurred_at) + 1).toISOString()
    };
    expect(await readProjectSemanticFunnelReport(db, reportQuery)).toMatchObject({
      kind: "report",
      evidence: { excluded_events: "0" },
      report: { status: "available", population: { entered: 1 } }
    });
    await pool.query(
      "UPDATE analytics_project_identity_namespaces SET namespace_revision=2 WHERE project_id=$1",
      [projectId]
    );
    await expect(loadVerifiedSemanticAnalyticsWorkerInput(db, objectStore, job)).rejects.toThrow(
      "semantic_worker_identity_authority_unavailable"
    );
    expect(await readProjectSemanticFunnelReport(db, reportQuery)).toMatchObject({
      kind: "report",
      evidence: { excluded_events: "1" },
      report: { status: "available", population: { entered: 0 } }
    });
    await pool.query(
      "UPDATE analytics_project_identity_namespaces SET namespace_revision=1 WHERE project_id=$1",
      [projectId]
    );
    expect(await readProjectSemanticFunnelReport(db, reportQuery)).toMatchObject({
      kind: "report",
      evidence: { excluded_events: "0" },
      report: { status: "available", population: { entered: 1 } }
    });
    const erasure = await requestProjectAnalyticsSubjectErasure(db, writerHash, {
      namespace_revision: 1,
      subject_kind: "user",
      subject_ref: value.correlation.user_id_hash,
      idempotency_key: randomUUID()
    });
    expect(erasure.kind).toBe("accepted");
    if (erasure.kind !== "accepted") return;
    expect(await readProjectSemanticFunnelReport(db, reportQuery)).toMatchObject({
      kind: "report",
      evidence: { excluded_events: "1" },
      report: { status: "available", population: { entered: 0 } }
    });
    expect(
      await processProjectAnalyticsSubjectErasurePass(db, objectStore, { limit: 100 })
    ).toMatchObject({ task_id: erasure.receipt.task_id, objects_deleted: 1 });
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM semantic_analytics_funnel_facts WHERE project_id=$1 AND event_id=$2",
          [projectId, value.event_id]
        )
      ).rows[0]
    ).toEqual({ count: 0 });
  });

  it("stamps relay subjects from the current first-party context and fences revocation before receipt", async () => {
    await pool.query("UPDATE analytics_writers SET kind='relay' WHERE id=$1", [writerId]);
    await pool.query(
      "UPDATE project_analytics_settings SET privacy_mode='custom',consent_required=true WHERE project_id=$1",
      [projectId]
    );
    const clientCatalog = [
      {
        name: "signup.started",
        revision: 1,
        description: "Signup entered",
        producers: ["browser"],
        purpose: "product_analytics",
        success_boundary: "observed",
        properties: {},
        measurements: {},
        expected_producers: []
      }
    ];
    await pool.query(
      "UPDATE analytics_project_catalogs SET entries=$2::jsonb WHERE project_id=$1",
      [projectId, JSON.stringify(clientCatalog)]
    );
    await pool.query("UPDATE analytics_project_plans SET catalog=$2::jsonb WHERE project_id=$1", [
      projectId,
      JSON.stringify(clientCatalog)
    ]);
    const hash = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");
    await pool.query(
      `INSERT INTO analytics_project_catalog_entry_revisions(project_id,name,revision,content_hash,entry)
       VALUES($1::uuid,'signup.started',1,$2,$3::jsonb)`,
      [projectId, hash(clientCatalog[0]), JSON.stringify(clientCatalog[0])]
    );
    const availableFrom = new Date(Date.now() - 120_000).toISOString();
    const definition = {
      kind: "ordered_funnel",
      key: "signup",
      revision: 1,
      display_name: "Signup",
      scope: { kind: "project", project_id: projectId },
      subject: "anonymous",
      timezone: "UTC",
      conversion_window_seconds: 3600,
      breakdown: null,
      steps: [
        {
          key: "start",
          predicate: { field: "event_name", operator: "in", values: ["signup.started"] }
        },
        {
          key: "finish",
          predicate: { field: "event_name", operator: "in", values: ["signup.finished"] }
        }
      ]
    };
    const reportState = { definition, available_from: availableFrom };
    await pool.query("UPDATE analytics_project_plans SET reports=$2::jsonb WHERE project_id=$1", [
      projectId,
      JSON.stringify([reportState])
    ]);
    await pool.query(
      `INSERT INTO analytics_project_plan_revisions(project_id,revision,catalog_revision,
         idempotency_key,mutation_hash,review_hash,content_hash,capacity_limit,
         legacy_saved_funnels,catalog,reports,applied_at)
       VALUES($1::uuid,1,1,$2::uuid,$3,$3,$3,50,0,$4::jsonb,$5::jsonb,$6::timestamptz)`,
      [
        projectId,
        randomUUID(),
        hash(reportState),
        JSON.stringify(clientCatalog),
        JSON.stringify([reportState]),
        availableFrom
      ]
    );
    await pool.query(
      `INSERT INTO analytics_project_report_revisions(project_id,report_key,revision,
         content_hash,definition,available_from)
       VALUES($1::uuid,'signup',1,$2,$3::jsonb,$4::timestamptz)`,
      [projectId, hash(definition), JSON.stringify(definition), availableFrom]
    );
    await pool.query(
      "INSERT INTO analytics_project_identity_namespaces(project_id,namespace_revision,key_fingerprint) VALUES($1,1,$2)",
      [projectId, `sha256:${"e".repeat(64)}`]
    );
    const producerEpoch = randomUUID();
    const bindingHash = `sha256:${"f".repeat(64)}`;
    const created = await createProjectAnalyticsIdentityContext(db, writerHash, {
      producer_epoch: producerEpoch,
      binding_hash: bindingHash,
      namespace_revision: 1,
      anonymous_id_hash: `sha256:${"a".repeat(64)}`,
      consent_granted: true,
      idempotency_key: randomUUID()
    });
    expect(created.kind).toBe("created");
    if (created.kind !== "created") throw new Error("relay context unavailable");
    const reference = {
      context_id: created.context.context_id,
      producer_epoch: producerEpoch,
      binding_hash: bindingHash
    };
    const now = new Date().toISOString();
    const base = serverEvent();
    const client = SemanticAnalyticsEventSchema.parse({
      ...base,
      event_id: randomUUID(),
      occurred_at: now,
      sdk_name: "@debugbundle/sdk-browser",
      service: { ...base.service, runtime: "browser" },
      producer: { kind: "browser", stream_id: null, sequence: null },
      operation_id: null,
      correlation: { ...base.correlation, session_id: randomUUID() },
      payload: {
        ...base.payload,
        name: "signup.started",
        purpose: "product_analytics",
        privacy: { mode: "custom", consent_granted: true },
        properties: {}
      }
    });
    const persist = (
      eventId = client.event_id,
      store: Parameters<typeof persistCurrentProjectSemanticAnalyticsEvent>[2] = objectStore,
      identityContext = reference
    ) =>
      persistCurrentProjectSemanticAnalyticsEvent(
        db,
        createSemanticAnalyticsReceiptStore(db),
        store,
        {
          policy: { projectId, principal: "relay", credentialHash: writerHash },
          event: { ...client, event_id: eventId },
          identityContext
        }
      );
    expect((await persist()).kind).toBe("accepted");
    const receipt = (
      await pool.query<{
        identity_context_id: string;
        identity_writer_id: string;
        identity_producer_epoch: string;
        raw_object_key: string;
      }>(
        "SELECT identity_context_id,identity_writer_id,identity_producer_epoch,raw_object_key FROM semantic_analytics_receipts WHERE project_id=$1",
        [projectId]
      )
    ).rows[0]!;
    expect(receipt).toMatchObject({
      identity_context_id: reference.context_id,
      identity_writer_id: writerId,
      identity_producer_epoch: producerEpoch
    });
    expect(
      (
        await pool.query(
          `SELECT subject_kind,subject_ref FROM semantic_analytics_receipt_subjects
           WHERE project_id=$1 AND event_id=$2`,
          [projectId, client.event_id]
        )
      ).rows
    ).toEqual([{ subject_kind: "anonymous", subject_ref: created.context.anonymous_id_hash }]);
    const stored = JSON.parse(
      gunzipSync(await objectStore.getObject({ key: receipt.raw_object_key })).toString("utf8")
    );
    expect(stored.correlation).toMatchObject({
      namespace_revision: 1,
      anonymous_id_hash: created.context.anonymous_id_hash,
      user_id_hash: null
    });
    const second = await createProjectAnalyticsIdentityContext(db, writerHash, {
      producer_epoch: producerEpoch,
      binding_hash: bindingHash,
      namespace_revision: 1,
      anonymous_id_hash: created.context.anonymous_id_hash!,
      consent_granted: true,
      idempotency_key: randomUUID()
    });
    expect(second.kind).toBe("created");
    if (second.kind !== "created") throw new Error("second context unavailable");
    const secondReference = { ...reference, context_id: second.context.context_id };
    expect(await persist(client.event_id, objectStore, secondReference)).toEqual({
      kind: "event_id_conflict"
    });
    const job = (
      await pool.query<{ id: string; payload: Record<string, unknown> }>(
        "SELECT id,payload FROM worker_jobs WHERE job_name='process-semantic-analytics-event' AND project_id=$1",
        [projectId]
      )
    ).rows[0]!;
    expect(
      await db.transaction!((tx) => loadVerifiedSemanticAnalyticsWorkerInput(tx, objectStore, job))
    ).toMatchObject({
      provenance: { identity_context_id: reference.context_id, identity_writer_id: writerId }
    });
    const queue = createDurableWorkerQueue(
      db,
      { claim: async () => null } as unknown as RedisQueueClient,
      false
    );
    try {
      expect(await processNextSemanticAnalyticsObservationJob({ queue, objectStore })).toEqual({
        processed: true
      });
    } finally {
      await queue.close();
    }
    const reportQuery = {
      actorUserId: ownerUserId,
      projectId,
      reportKey: "signup",
      from: new Date(Date.parse(client.occurred_at) - 60_000).toISOString(),
      to: new Date(Date.parse(client.occurred_at) + 1).toISOString()
    };
    expect(await readProjectSemanticFunnelReport(db, reportQuery)).toMatchObject({
      kind: "report",
      evidence: { excluded_events: "0" },
      report: { status: "available", population: { entered: 1 } }
    });
    await pool.query(
      "DELETE FROM semantic_analytics_receipt_subjects WHERE project_id=$1 AND event_id=$2",
      [projectId, client.event_id]
    );
    expect(await readProjectSemanticFunnelReport(db, reportQuery)).toMatchObject({
      kind: "report",
      evidence: { excluded_events: "1" },
      report: { status: "available", population: { entered: 0 } }
    });
    await expect(
      db.transaction!((tx) => loadVerifiedSemanticAnalyticsWorkerInput(tx, objectStore, job))
    ).rejects.toThrow("semantic_worker_identity_authority_unavailable");
    await pool.query(
      `INSERT INTO semantic_analytics_receipt_subjects(
         project_id,event_id,namespace_revision,subject_kind,subject_ref)
       VALUES($1,$2,1,'anonymous',$3)`,
      [projectId, client.event_id, created.context.anonymous_id_hash]
    );
    await pool.query(
      "UPDATE analytics_project_identity_namespaces SET namespace_revision=2 WHERE project_id=$1",
      [projectId]
    );
    expect(await readProjectSemanticFunnelReport(db, reportQuery)).toMatchObject({
      kind: "report",
      evidence: { excluded_events: "1" },
      report: { status: "available", population: { entered: 0 } }
    });
    await pool.query(
      "UPDATE analytics_project_identity_namespaces SET namespace_revision=1 WHERE project_id=$1",
      [projectId]
    );
    await pool.query("UPDATE analytics_writers SET revoked_at=now() WHERE id=$1", [writerId]);
    expect(await readProjectSemanticFunnelReport(db, reportQuery)).toMatchObject({
      kind: "report",
      evidence: { excluded_events: "1" },
      report: { status: "available", population: { entered: 0 } }
    });
    await pool.query("UPDATE analytics_writers SET revoked_at=NULL WHERE id=$1", [writerId]);
    expect((await persist(randomUUID(), objectStore, secondReference)).kind).toBe("accepted");
    const secondQueue = createDurableWorkerQueue(
      db,
      { claim: async () => null } as unknown as RedisQueueClient,
      false
    );
    try {
      expect(
        await processNextSemanticAnalyticsObservationJob({ queue: secondQueue, objectStore })
      ).toEqual({
        processed: true
      });
    } finally {
      await secondQueue.close();
    }
    expect(await readProjectSemanticFunnelReport(db, reportQuery)).toMatchObject({
      kind: "report",
      evidence: { excluded_events: "0" },
      report: { status: "available", population: { entered: 1 } }
    });
    const race = await persist(randomUUID(), {
      putObject: async (input) => {
        await objectStore.putObject(input);
        await revokeProjectAnalyticsIdentityContext(db, writerHash, {
          ...reference,
          idempotency_key: randomUUID()
        });
      }
    });
    expect(race).toEqual({ kind: "authority_changed" });
    expect(await readProjectSemanticFunnelReport(db, reportQuery)).toMatchObject({
      kind: "report",
      evidence: { excluded_events: "2" },
      report: { status: "available", quality: "partial", population: { entered: 0 } }
    });
    await expect(
      db.transaction!((tx) => loadVerifiedSemanticAnalyticsWorkerInput(tx, objectStore, job))
    ).rejects.toThrow("semantic_worker_identity_authority_unavailable");
    expect(
      (
        await pool.query("SELECT count(*) FROM semantic_analytics_receipts WHERE project_id=$1", [
          projectId
        ])
      ).rows[0]?.count
    ).toBe("2");
    expect(await persist(randomUUID())).toEqual({
      kind: "rejected",
      reason: "identity_not_authorized"
    });
    expect(await persist(randomUUID(), objectStore, secondReference)).toEqual({
      kind: "rejected",
      reason: "identity_not_authorized"
    });
    expect(
      await createProjectAnalyticsIdentityContext(db, writerHash, {
        producer_epoch: producerEpoch,
        binding_hash: bindingHash,
        namespace_revision: 1,
        anonymous_id_hash: created.context.anonymous_id_hash!,
        consent_granted: true,
        idempotency_key: randomUUID()
      })
    ).toEqual({ kind: "unavailable" });
    expect(
      await createProjectAnalyticsIdentityContext(db, writerHash, {
        producer_epoch: randomUUID(),
        binding_hash: bindingHash,
        namespace_revision: 1,
        anonymous_id_hash: created.context.anonymous_id_hash!,
        consent_granted: true,
        idempotency_key: randomUUID()
      })
    ).toMatchObject({ kind: "created" });
  });

  it("fences stale accepted replay and new stale-time delivery after subject erasure", async () => {
    await pool.query("UPDATE analytics_writers SET kind='relay' WHERE id=$1", [writerId]);
    await pool.query(
      "UPDATE project_analytics_settings SET privacy_mode='custom',consent_required=true WHERE project_id=$1",
      [projectId]
    );
    const catalog = [
      {
        name: "signup.started",
        revision: 1,
        description: "Signup entered",
        producers: ["browser"],
        purpose: "product_analytics",
        success_boundary: "observed",
        properties: {},
        measurements: {},
        expected_producers: []
      }
    ];
    const catalogHash = createHash("sha256").update(stableJson(catalog[0])).digest("hex");
    await pool.query(
      "UPDATE analytics_project_catalogs SET entries=$2::jsonb WHERE project_id=$1",
      [projectId, JSON.stringify(catalog)]
    );
    await pool.query("UPDATE analytics_project_plans SET catalog=$2::jsonb WHERE project_id=$1", [
      projectId,
      JSON.stringify(catalog)
    ]);
    await pool.query(
      `INSERT INTO analytics_project_catalog_entry_revisions(project_id,name,revision,content_hash,entry)
       VALUES($1,'signup.started',1,$2,$3::jsonb)`,
      [projectId, catalogHash, JSON.stringify(catalog[0])]
    );
    await pool.query(
      "INSERT INTO analytics_project_identity_namespaces(project_id,namespace_revision,key_fingerprint) VALUES($1,1,$2)",
      [projectId, `sha256:${"e".repeat(64)}`]
    );
    const anonymousRef = `sha256:${"a".repeat(64)}`;
    const bindingHash = `sha256:${"f".repeat(64)}`;
    const createContext = async (producerEpoch: string) => {
      const result = await createProjectAnalyticsIdentityContext(db, writerHash, {
        producer_epoch: producerEpoch,
        binding_hash: bindingHash,
        namespace_revision: 1,
        anonymous_id_hash: anonymousRef,
        consent_granted: true,
        idempotency_key: randomUUID()
      });
      if (result.kind !== "created") throw new Error("context_missing");
      return {
        context_id: result.context.context_id,
        producer_epoch: producerEpoch,
        binding_hash: bindingHash
      };
    };
    const firstContext = await createContext(randomUUID());
    const base = serverEvent();
    const original = SemanticAnalyticsEventSchema.parse({
      ...base,
      event_id: randomUUID(),
      occurred_at: new Date(Date.now() - 1_000).toISOString(),
      sdk_name: "@debugbundle/sdk-browser",
      service: { ...base.service, runtime: "browser" },
      producer: { kind: "browser", stream_id: null, sequence: null },
      operation_id: null,
      correlation: { ...base.correlation, session_id: randomUUID() },
      payload: {
        ...base.payload,
        name: "signup.started",
        purpose: "product_analytics",
        privacy: { mode: "custom", consent_granted: true },
        properties: {}
      }
    });
    const persist = (event: typeof original, identityContext: typeof firstContext) =>
      persistCurrentProjectSemanticAnalyticsEvent(
        db,
        createSemanticAnalyticsReceiptStore(db),
        objectStore,
        {
          policy: { projectId, principal: "relay", credentialHash: writerHash },
          event,
          identityContext
        }
      );
    expect((await persist(original, firstContext)).kind).toBe("accepted");
    const job = (
      await pool.query<{ id: string; payload: Record<string, unknown> }>(
        "SELECT id,payload FROM worker_jobs WHERE job_name='process-semantic-analytics-event' AND project_id=$1",
        [projectId]
      )
    ).rows[0]!;
    const organizationId = (
      await pool.query<{ organization_id: string }>(
        "SELECT organization_id FROM projects WHERE id=$1",
        [projectId]
      )
    ).rows[0]!.organization_id;
    const manager = await pool.connect();
    const worker = await pool.connect();
    let pendingRead: ReturnType<typeof loadVerifiedSemanticAnalyticsWorkerInput> | null = null;
    try {
      await manager.query("BEGIN");
      await manager.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [organizationId]);
      await worker.query("BEGIN");
      await worker.query("SET LOCAL statement_timeout='5s'");
      const workerPid = (await worker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))
        .rows[0]!.pid;
      pendingRead = loadVerifiedSemanticAnalyticsWorkerInput(
        worker as unknown as Queryable,
        objectStore,
        job
      );
      let reachedOrganizationLock = false;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const waiting = await pool.query<{ waiting: boolean }>(
          `SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=$1`,
          [workerPid]
        );
        if (waiting.rows[0]?.waiting) {
          reachedOrganizationLock = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(reachedOrganizationLock).toBe(true);
      let projectAcquired = false;
      try {
        await manager.query("SELECT id FROM projects WHERE id=$1 FOR UPDATE NOWAIT", [projectId]);
        projectAcquired = true;
      } catch (error) {
        if ((error as { code?: string }).code !== "55P03") throw error;
      }
      expect(projectAcquired).toBe(true);
      await manager.query("COMMIT");
      expect(await pendingRead).not.toBeNull();
      await worker.query("ROLLBACK");
    } finally {
      await manager.query("ROLLBACK").catch(() => undefined);
      await pendingRead?.catch(() => undefined);
      await worker.query("ROLLBACK").catch(() => undefined);
      manager.release();
      worker.release();
    }
    const erasure = await requestProjectAnalyticsSubjectErasure(db, writerHash, {
      namespace_revision: 1,
      subject_kind: "anonymous",
      subject_ref: anonymousRef,
      idempotency_key: randomUUID()
    });
    expect(erasure.kind).toBe("accepted");
    if (erasure.kind !== "accepted") return;
    await expect(
      db.transaction!((tx) => loadVerifiedSemanticAnalyticsWorkerInput(tx, objectStore, job))
    ).rejects.toThrow("semantic_worker_identity_authority_unavailable");
    expect(await persist(original, firstContext)).toEqual({
      kind: "rejected",
      reason: "identity_not_authorized"
    });
    const freshContext = await createContext(randomUUID());
    const stale = { ...original, event_id: randomUUID() };
    expect(await persist(stale, freshContext)).toEqual({ kind: "authority_changed" });
    const rawKey = String(job.payload["object_key"]);
    expect(
      await processProjectAnalyticsSubjectErasurePass(
        db,
        {
          deleteObjects: async ({ keys }) => ({ deleted: [], failed: keys }),
          listObjects: (input) => objectStore.listObjects(input)
        },
        { limit: 100 }
      )
    ).toMatchObject({
      task_id: erasure.receipt.task_id,
      objects_deleted: 0,
      failed_objects: 1,
      complete: false
    });
    expect((await objectStore.getObject({ key: rawKey })).byteLength).toBeGreaterThan(0);
    await pool.query(
      `UPDATE analytics_project_subject_erasures
       SET next_attempt_at=clock_timestamp(),lease_token=NULL,lease_expires_at=NULL
       WHERE task_id=$1`,
      [erasure.receipt.task_id]
    );
    await pool.query(
      `UPDATE semantic_analytics_receipts SET raw_delete_retry_at=clock_timestamp()
       WHERE project_id=$1 AND event_id=$2`,
      [projectId, original.event_id]
    );
    expect(
      await processProjectAnalyticsSubjectErasurePass(
        db,
        {
          deleteObjects: async ({ keys }) => ({ deleted: keys, failed: [] }),
          listObjects: (input) => objectStore.listObjects(input)
        },
        { limit: 100 }
      )
    ).toMatchObject({
      task_id: erasure.receipt.task_id,
      objects_deleted: 0,
      failed_objects: 1,
      complete: false
    });
    expect((await objectStore.getObject({ key: rawKey })).byteLength).toBeGreaterThan(0);
    await pool.query(
      `UPDATE analytics_project_subject_erasures
       SET next_attempt_at=clock_timestamp(),lease_token=NULL,lease_expires_at=NULL
       WHERE task_id=$1`,
      [erasure.receipt.task_id]
    );
    await pool.query(
      `UPDATE semantic_analytics_receipts SET raw_delete_retry_at=clock_timestamp()
       WHERE project_id=$1 AND event_id=$2`,
      [projectId, original.event_id]
    );
    expect(
      await processProjectAnalyticsSubjectErasurePass(db, objectStore, { limit: 100 })
    ).toMatchObject({
      task_id: erasure.receipt.task_id,
      objects_deleted: 1,
      failed_objects: 0,
      complete: true
    });
    await expect(objectStore.getObject({ key: rawKey })).rejects.toThrow();
    expect(
      (
        await pool.query(
          "SELECT raw_status,raw_retention_outcome FROM semantic_analytics_receipts WHERE project_id=$1 AND event_id=$2",
          [projectId, original.event_id]
        )
      ).rows[0]
    ).toMatchObject({ raw_status: "deleted", raw_retention_outcome: "erased" });
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM semantic_analytics_receipt_subjects WHERE project_id=$1 AND event_id=$2",
          [projectId, original.event_id]
        )
      ).rows[0]?.count
    ).toBe("0");
    const fresh = {
      ...original,
      event_id: randomUUID(),
      occurred_at: new Date(Date.parse(erasure.receipt.cutoff_at) + 1).toISOString()
    };
    expect((await persist(fresh, freshContext)).kind).toBe("accepted");
    expect(
      (
        await pool.query("SELECT count(*) FROM semantic_analytics_receipts WHERE project_id=$1", [
          projectId
        ])
      ).rows[0]?.count
    ).toBe("2");
  });
});
