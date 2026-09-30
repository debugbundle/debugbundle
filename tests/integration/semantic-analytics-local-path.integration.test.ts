import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { createApiServer } from "../../apps/api/src/server.js";
import {
  processNextAggregateAnalyticsEventsJob,
  type AggregateAnalyticsWorkerQueue
} from "../../apps/worker/src/analytics-aggregation.js";
import { createDurableWorkerQueue } from "../../apps/worker/src/durable-queue.js";
import { processNextSemanticAnalyticsObservationJob } from "../../apps/worker/src/semantic-analytics-observation.js";
import { hashToken } from "../../packages/auth/src/index.js";
import { stableJson } from "../../packages/event-normalizer/src/canonical-json.js";
import {
  SemanticAnalyticsEventSchema,
  type SemanticAnalyticsEvent
} from "../../packages/shared-types/src/index.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { createMetadataAccess } from "../../packages/storage/src/metadata-access.js";
import { persistCurrentProjectSemanticAnalyticsEvent } from "../../packages/storage/src/semantic-analytics-persistence.js";
import { createSemanticAnalyticsReceiptStore } from "../../packages/storage/src/semantic-analytics-receipt-store.js";
import {
  readProjectSemanticFunnelReport,
  readRecentProjectSemanticFunnelReport
} from "../../packages/storage/src/semantic-analytics-funnel-report.js";
import { createAnalyticsWriterStore } from "../../packages/storage/src/analytics-writer-store.js";
import {
  createIngestionPersistenceService,
  createPostgresAnalyticsMetricsStore,
  createPostgresAnalyticsRollupStore,
  createRedisQueueClient
} from "../../packages/storage/src/index.js";
import {
  createAnalyticsEvent,
  createSettings
} from "../helpers/api-analytics-ingestion-fixtures.js";
import { createBaseDependencies } from "../helpers/api-capture-rule-ingestion.js";
import {
  createIntegrationPool,
  createQueryable,
  createS3AdminClient,
  createTestObjectStore,
  redisUrl,
  runIntegration,
  seedOwnedProject,
  s3Bucket
} from "../helpers/integration-setup.js";

runIntegration("local semantic analytics browser and Node path", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const s3Admin = createS3AdminClient();
  const objectStore = createTestObjectStore();
  const redis = createRedisQueueClient({ redisUrl });
  const browserToken = `dbundle_proj_${"B".repeat(43)}`;
  const writerToken = `dbundle_anl_${"A".repeat(43)}`;
  let projectId: string;
  let organizationId: string;
  let ownerUserId: string;

  beforeEach(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await s3Admin.send(new CreateBucketCommand({ Bucket: s3Bucket })).catch(() => undefined);
    projectId = randomUUID();
    organizationId = randomUUID();
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
  });
  afterAll(async () => {
    await redis.close();
    await pool.end();
    s3Admin.destroy();
  });

  it("keeps installed analytics separate while browser and Node facts reach the project funnel", async () => {
    const now = Date.now();
    const at = (offsetMs: number) => new Date(now + offsetMs).toISOString();
    const hash = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");
    const entries = [
      {
        name: "session.start",
        revision: 1,
        description: "Browser session observed",
        producers: ["browser"],
        purpose: "product_analytics",
        success_boundary: "observed",
        properties: {},
        measurements: {},
        expected_producers: []
      },
      {
        name: "page.view",
        revision: 1,
        description: "Allowlisted page observed",
        producers: ["browser"],
        purpose: "product_analytics",
        success_boundary: "observed",
        properties: {},
        measurements: {},
        expected_producers: []
      },
      {
        name: "route.change",
        revision: 1,
        description: "Allowlisted route transition observed",
        producers: ["browser"],
        purpose: "product_analytics",
        success_boundary: "observed",
        properties: {},
        measurements: {},
        expected_producers: []
      },
      {
        name: "session.summary",
        revision: 1,
        description: "Browser session summary observed",
        producers: ["browser"],
        purpose: "product_analytics",
        success_boundary: "observed",
        properties: {},
        measurements: {},
        expected_producers: []
      },
      {
        name: "click.button",
        revision: 1,
        description: "Generic structural button click observed",
        producers: ["browser"],
        purpose: "product_analytics",
        success_boundary: "observed",
        properties: {},
        measurements: {},
        expected_producers: []
      },
      {
        name: "friction.dead_click",
        revision: 1,
        description: "Repeated non-interactive click observed",
        producers: ["browser"],
        purpose: "product_analytics",
        success_boundary: "observed",
        properties: {},
        measurements: {},
        expected_producers: []
      },
      {
        name: "signup.started",
        revision: 1,
        description: "Signup began",
        producers: ["browser"],
        purpose: "product_analytics",
        success_boundary: "observed",
        properties: {},
        measurements: {},
        expected_producers: []
      },
      {
        name: "signup.completed",
        revision: 1,
        description: "Signup completion observed",
        producers: ["browser"],
        purpose: "product_analytics",
        success_boundary: "observed",
        properties: {},
        measurements: {},
        expected_producers: []
      },
      {
        name: "account.created",
        revision: 1,
        description: "Account committed",
        producers: ["server"],
        purpose: "business_measurement",
        success_boundary: "committed",
        properties: {},
        measurements: {},
        expected_producers: []
      },
      {
        name: "account.completed",
        revision: 1,
        description: "Account setup committed",
        producers: ["server"],
        purpose: "business_measurement",
        success_boundary: "committed",
        properties: {},
        measurements: {},
        expected_producers: []
      }
    ];
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
          predicate: { field: "event_name", operator: "in", values: ["signup.started"] }
        },
        {
          key: "finish",
          predicate: { field: "event_name", operator: "in", values: ["signup.completed"] }
        }
      ]
    };
    const report = { definition, available_from: at(-3_600_000) };
    const userDefinition = {
      ...definition,
      key: "account_setup",
      display_name: "Account setup",
      subject: "user" as const,
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
    const userReport = { definition: userDefinition, available_from: report.available_from };
    const reports = [report, userReport];
    await pool.query(
      "INSERT INTO project_analytics_settings(project_id,enabled,privacy_mode,max_custom_dimensions) VALUES($1,true,'strict',2)",
      [projectId]
    );
    await pool.query(
      "INSERT INTO project_tokens(id,project_id,token_hash,label) VALUES($1,$2,$3,'Browser')",
      [randomUUID(), projectId, hashToken(browserToken)]
    );
    await pool.query("INSERT INTO analytics_writer_state(project_id,revision) VALUES($1,1)", [
      projectId
    ]);
    await pool.query(
      `INSERT INTO analytics_writers(id,project_id,organization_id,issuer_user_id,kind,display_name,token_hash,expires_at)
       VALUES($1,$2,$3,$4,'server','App server',$5,now()+interval '30 days')`,
      [randomUUID(), projectId, organizationId, ownerUserId, hashToken(writerToken)]
    );
    await pool.query(
      "INSERT INTO analytics_project_catalogs(project_id,revision,catalog_revision,content_hash,entries) VALUES($1,1,1,$2,$3::jsonb)",
      [projectId, hash(entries), JSON.stringify(entries)]
    );
    for (const entry of entries)
      await pool.query(
        `INSERT INTO analytics_project_catalog_entry_revisions(project_id,name,revision,content_hash,entry)
       VALUES($1::uuid,$2,1,$3,$4::jsonb)`,
        [projectId, entry.name, hash(entry), JSON.stringify(entry)]
      );
    await pool.query(
      `INSERT INTO analytics_project_plans(project_id,revision,catalog_revision,business_measurement_enabled,content_hash,catalog,reports)
       VALUES($1::uuid,1,1,true,$2,$3::jsonb,$4::jsonb)`,
      [projectId, hash([entries, reports]), JSON.stringify(entries), JSON.stringify(reports)]
    );
    await pool.query(
      `INSERT INTO analytics_project_plan_revisions(project_id,revision,catalog_revision,
         idempotency_key,mutation_hash,review_hash,content_hash,capacity_limit,
         legacy_saved_funnels,catalog,reports,applied_at)
       VALUES($1::uuid,1,1,$2::uuid,$3,$3,$3,10,0,$4::jsonb,$5::jsonb,$6::timestamptz)`,
      [
        projectId,
        randomUUID(),
        hash(report),
        JSON.stringify(entries),
        JSON.stringify(reports),
        at(-3_600_000)
      ]
    );
    await pool.query(
      `INSERT INTO analytics_project_report_revisions(project_id,report_key,revision,content_hash,definition,available_from)
       VALUES($1::uuid,'signup',1,$2,$3::jsonb,$4::timestamptz)`,
      [projectId, hash(definition), JSON.stringify(definition), report.available_from]
    );
    await pool.query(
      `INSERT INTO analytics_project_report_revisions(project_id,report_key,revision,content_hash,definition,available_from)
       VALUES($1::uuid,'account_setup',1,$2,$3::jsonb,$4::timestamptz)`,
      [projectId, hash(userDefinition), JSON.stringify(userDefinition), userReport.available_from]
    );
    await pool.query(
      `INSERT INTO analytics_funnel_definitions(project_id,funnel_key,display_name,steps)
       VALUES($1::uuid,'signup','Installed signup funnel',$2::jsonb)`,
      [
        projectId,
        JSON.stringify([
          { step_key: "start", display_name: "Start" },
          { step_key: "finish", display_name: "Finish" }
        ])
      ]
    );

    const base = JSON.parse(
      readFileSync(new URL("../fixtures/analytics-semantic-event.json", import.meta.url), "utf8")
    ) as SemanticAnalyticsEvent;
    const sessionId = randomUUID();
    const browserEvent = (name: string, occurredAt: string) =>
      SemanticAnalyticsEventSchema.parse({
        ...base,
        event_id: randomUUID(),
        occurred_at: occurredAt,
        sdk_name: "@debugbundle/sdk-browser",
        service: { ...base.service, runtime: "browser" },
        producer: { kind: "browser", stream_id: null, sequence: null },
        operation_id: null,
        correlation: { ...base.correlation, session_id: sessionId },
        payload: {
          ...base.payload,
          name,
          purpose: "product_analytics",
          privacy: { mode: "strict", consent_granted: true },
          properties: {},
          measurements: {}
        }
      });
    const fixtureNodeEvent = SemanticAnalyticsEventSchema.parse({
      ...base,
      event_id: randomUUID(),
      occurred_at: at(-120_000),
      operation_id: `sha256:${hash("committed-account")}`,
      correlation: { ...base.correlation, session_id: null },
      payload: { ...base.payload, name: "account.created", properties: {}, measurements: {} }
    });
    const packedPath = process.env["SEMANTIC_PACKED_EVENTS_FILE"];
    const packed = packedPath ? (JSON.parse(readFileSync(packedPath, "utf8")) as unknown) : null;
    const packedEvents =
      packed === null ? null : SemanticAnalyticsEventSchema.array().length(10).parse(packed);
    if (packedEvents !== null) {
      expect(packedEvents.map((event) => event.payload.name).sort()).toEqual(
        [
          "signup.started",
          "signup.completed",
          "session.start",
          "page.view",
          "route.change",
          "session.summary",
          "click.button",
          "friction.dead_click",
          "account.created",
          "account.created"
        ].sort()
      );
      expect(
        packedEvents.filter(
          (event) => event.producer.kind === "server" && event.correlation.user_id_hash !== null
        )
      ).toHaveLength(1);
      const packedBrowser = packedEvents.filter((event) => event.producer.kind === "browser");
      expect(new Set(packedBrowser.map((event) => event.correlation.session_id)).size).toBe(1);
      expect(
        packedEvents.find((event) => event.producer.kind === "server")?.correlation.session_id
      ).toBeNull();
      expect(
        packedEvents.find((event) => event.payload.kind === "page_view")?.payload.route
      ).toEqual({
        normalized_path: "/smoke-browser"
      });
      expect(
        packedEvents.find((event) => event.payload.kind === "route_change")?.payload.previous_route
      ).toEqual({ normalized_path: "/smoke-browser" });
      expect(
        packedEvents.find((event) => event.payload.kind === "session_summary")?.payload.session
      ).toMatchObject({ views: 2 });
    }
    const browserEvents =
      packedEvents === null
        ? [
            browserEvent("signup.started", at(-300_000)),
            browserEvent("signup.completed", at(-240_000))
          ]
        : packedEvents.filter((event) => event.producer.kind === "browser");
    const nodeEvent =
      packedEvents?.find(
        (event) => event.producer.kind === "server" && event.correlation.user_id_hash === null
      ) ?? fixtureNodeEvent;
    const packedIdentityEvent = packedEvents?.find(
      (event) => event.producer.kind === "server" && event.correlation.user_id_hash !== null
    );
    const installedAnalyticsEvent = createAnalyticsEvent({
      eventId: randomUUID(),
      kind: "funnel_step",
      sessionId: randomUUID(),
      privacy: { mode: "strict", consent_granted: true }
    });
    installedAnalyticsEvent.occurred_at = at(-300_000);
    installedAnalyticsEvent.sdk_version = "3.0.3";
    const installedWindowStart = new Date(installedAnalyticsEvent.occurred_at);
    installedWindowStart.setUTCHours(0, 0, 0, 0);
    installedAnalyticsEvent.payload.signal = {
      action_key: null,
      funnel_key: "signup",
      step_key: "start",
      conversion_key: null,
      marker_key: null
    };
    const installedPersistence = createIngestionPersistenceService({ objectStore, queue: redis });
    const persistInstalledAnalytics = vi.spyOn(installedPersistence, "persistAnalyticsAndEnqueue");
    const receipts = createSemanticAnalyticsReceiptStore(db);
    const baseDependencies = createBaseDependencies({
      resolveProjectByTokenHash: createMetadataAccess(db).resolveProjectByTokenHash
    });
    const app = createApiServer({
      ...baseDependencies,
      ingestionPersistence: installedPersistence,
      analyticsSettingsManagement: {
        getAnalyticsSettingsForProject: vi.fn().mockResolvedValue(createSettings()),
        updateAnalyticsSettingsForProject: vi.fn()
      },
      memberAuth: {
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({
          member_id: ownerUserId,
          organization_id: organizationId,
          role: "owner",
          revoked_at: null,
          expires_at: null
        })
      },
      projectManagement: {
        resolveProjectAccessForUser: vi.fn().mockResolvedValue({
          project_id: projectId,
          organization_id: organizationId,
          owner_user_id: ownerUserId,
          owner_email: "owner@example.test",
          relationship: "owned",
          effective_role: "owner",
          organization_plan: "team",
          shared_access_suspended: false
        }),
        listProjectsForOrganization: vi.fn().mockResolvedValue([]),
        createProjectForOrganization: vi.fn(),
        updateProjectForOrganization: vi.fn(),
        deleteProjectForOrganization: vi.fn()
      },
      ingestionRateLimiter: {
        claimEvents: vi.fn().mockResolvedValue({
          allowed: true,
          limit: 10_000,
          remaining: 9_999,
          retry_after_ms: 0
        })
      },
      analyticsWriters: createAnalyticsWriterStore(db),
      semanticAnalyticsDelivery: {
        enabled: true,
        getRateLimitPerMinute: async () => 10_000,
        persist: ({ projectId: authenticatedProjectId, credentialHash, event }) =>
          persistCurrentProjectSemanticAnalyticsEvent(db, receipts, objectStore, {
            policy: {
              projectId: authenticatedProjectId,
              credentialHash,
              principal: "server_writer"
            },
            event
          })
      },
      semanticAnalyticsClientDelivery: {
        enabled: true,
        persist: ({ projectId: authenticatedProjectId, credentialHash, event }) =>
          persistCurrentProjectSemanticAnalyticsEvent(db, receipts, objectStore, {
            policy: {
              projectId: authenticatedProjectId,
              credentialHash,
              principal: "project_token"
            },
            event
          })
      },
      semanticAnalyticsReports: {
        enabled: true,
        read: (input) => readProjectSemanticFunnelReport(db, input),
        readRecent: (input) => readRecentProjectSemanticFunnelReport(db, input)
      }
    });
    try {
      const browser = await app.inject({
        method: "POST",
        url: "/v1/events",
        headers: { authorization: `Bearer ${browserToken}` },
        payload: { events: [installedAnalyticsEvent, ...browserEvents] }
      });
      expect(browser.statusCode).toBe(202);
      expect(browser.json()).toEqual({
        accepted: browserEvents.length + 1,
        rejected: 0,
        errors: []
      });
      expect(persistInstalledAnalytics).toHaveBeenCalledOnce();
      expect(persistInstalledAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          schema_version: "2026-07-analytics-01",
          event_id: installedAnalyticsEvent.event_id
        }),
        projectId
      );
      const node = await app.inject({
        method: "POST",
        url: "/v1/analytics/deliver",
        headers: { authorization: `Bearer ${writerToken}` },
        payload: { events: [nodeEvent] }
      });
      expect(node.statusCode).toBe(200);
      expect(node.json()).toMatchObject({
        submitted: 1,
        accepted: 1,
        rejected: 0,
        accepted_events: [{ index: 0, event_id: nodeEvent.event_id }]
      });
      const worker = createDurableWorkerQueue(db, redis, false);
      try {
        const installedJob = await processNextAggregateAnalyticsEventsJob({
          queue: worker as unknown as AggregateAnalyticsWorkerQueue,
          objectStore,
          analyticsRollupStore: createPostgresAnalyticsRollupStore(db)
        });
        expect(installedJob).toEqual({ processed: true });
        await worker.ackClaimedJobs(installedJob);
        for (let index = 0; index < browserEvents.length + 1; index += 1)
          expect(
            await processNextSemanticAnalyticsObservationJob({ queue: worker, objectStore })
          ).toEqual({ processed: true });
      } finally {
        await worker.close();
      }
      const reportResponse = await app.inject({
        method: "POST",
        url: `/v1/analytics/scopes/project/${projectId}/reports/query`,
        headers: { authorization: "Bearer dbundle_mem_test_token" },
        payload: { report_key: "signup", from: at(-3_000_000), to: new Date().toISOString() }
      });
      expect(reportResponse.statusCode).toBe(200);
      expect(reportResponse.json()).toMatchObject({
        report: {
          status: "available",
          quality: "partial",
          quality_reasons: expect.arrayContaining(["incomplete_evidence"]),
          population: { entered: 1, completed: 1 }
        },
        evidence: {
          pending_events: "0",
          failed_events: "0",
          lost_events: "0",
          excluded_events: "0",
          erasure_tasks: "0",
          source_coverage: "unverified"
        }
      });
      expect(
        (await pool.query("SELECT count(*) FROM semantic_analytics_catalog_observations")).rows[0]
          ?.count
      ).toBe(String(browserEvents.length + 1));
      expect(
        (await pool.query("SELECT count(*) FROM semantic_analytics_funnel_facts")).rows[0]?.count
      ).toBe("2");
      expect(
        (
          await pool.query("SELECT count(*) FROM analytics_ingestion_ledger WHERE project_id=$1", [
            projectId
          ])
        ).rows[0]?.count
      ).toBe("1");
      expect(
        await createPostgresAnalyticsMetricsStore(db).getFunnelAnalysis({
          project_id: projectId,
          funnel_key: "signup",
          from: installedWindowStart.toISOString(),
          to: at(0),
          granularity: "day"
        })
      ).toMatchObject({
        funnel: { sessions_entered: 1, sessions_completed: 0 }
      });
      if (packedIdentityEvent !== undefined) {
        await pool.query(
          "UPDATE project_analytics_settings SET privacy_mode='custom' WHERE project_id=$1",
          [projectId]
        );
        await pool.query(
          `INSERT INTO analytics_project_identity_namespaces(project_id,namespace_revision,key_fingerprint)
           VALUES($1,1,$2)`,
          [projectId, `sha256:${"b".repeat(64)}`]
        );
        const known = await app.inject({
          method: "POST",
          url: "/v1/analytics/deliver",
          headers: { authorization: `Bearer ${writerToken}` },
          payload: { events: [packedIdentityEvent] }
        });
        expect(known.statusCode).toBe(200);
        expect(known.json()).toMatchObject({
          accepted: 1,
          accepted_events: [{ event_id: packedIdentityEvent.event_id }]
        });
        const identityWorker = createDurableWorkerQueue(db, redis, false);
        try {
          expect(
            await processNextSemanticAnalyticsObservationJob({
              queue: identityWorker,
              objectStore
            })
          ).toEqual({ processed: true });
        } finally {
          await identityWorker.close();
        }
        const userReportResponse = await app.inject({
          method: "POST",
          url: `/v1/analytics/scopes/project/${projectId}/reports/query`,
          headers: { authorization: "Bearer dbundle_mem_test_token" },
          payload: {
            report_key: "account_setup",
            from: at(-3_000_000),
            to: new Date().toISOString()
          }
        });
        expect(userReportResponse.statusCode).toBe(200);
        expect(userReportResponse.json()).toMatchObject({
          report: { status: "available", population: { entered: 1, completed: 0 } },
          evidence: { excluded_events: "0", pending_events: "0" }
        });
        expect(
          (
            await pool.query(
              `SELECT identity_writer_id IS NOT NULL AS has_writer,
                    identity_context_id,identity_verification
             FROM semantic_analytics_receipts WHERE project_id=$1 AND event_id=$2`,
              [projectId, packedIdentityEvent.event_id]
            )
          ).rows[0]
        ).toEqual({
          has_writer: true,
          identity_context_id: null,
          identity_verification: "server_namespace"
        });
      }
    } finally {
      await app.close();
    }
  });
});
