import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createApiDependencies } from "../../apps/api/src/default-dependencies.js";
import { createApiServer } from "../../apps/api/src/server.js";
import {
  processNextGroupIncidentJob,
  processNextNormalizeEventsJob
} from "../../apps/worker/src/processor.js";
import { buildCaptureRuleSuggestions } from "../../packages/shared-types/src/capture-rule-suggestions.js";
import {
  buildRawEventObjectKey,
  createPostgresCaptureRuleStore,
  createPostgresCaptureRuleThresholdStore,
  createPostgresMetadataStore,
  createRedisQueueClient,
  createS3ObjectStoreClient
} from "../../packages/storage/src/index.js";
import { createCaptureRuleManagement } from "../../packages/storage/src/capture-rule-management.js";
import { runInTransaction } from "../../packages/storage/src/transaction.js";
import { createProcessedEventStore } from "../../packages/storage/src/processed-event-store.js";
import { browserResourceEvent } from "../helpers/browser-resource-fixtures.js";
import {
  bootstrapStorageAndCreateBucket,
  createIntegrationPool,
  createS3AdminClient,
  createQueryable,
  createNonSpikingFrequencyCounter,
  redisUrl,
  runIntegration,
  s3Bucket,
  s3Endpoint,
  s3Region,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("browser resource capture controls", () => {
  const pool = createIntegrationPool();
  const admin = createS3AdminClient();
  beforeAll(async () => bootstrapStorageAndCreateBucket(pool, admin));
  afterAll(async () => {
    admin.destroy();
    await pool.end();
  });

  it.each([
    ["demote", "https://www.googletagmanager.com/gtag/js"],
    ["drop", "https://www.googletagmanager.com/gtag/js"],
    ["demote", "https://cdn.example.com/optional.js"],
    ["drop", "https://cdn.example.com/optional.js"],
    ["demote", null],
    ["drop", null]
  ] as const)(
    "enforces %s for %s without rewriting existing incidents or rules",
    async (action, url) => {
      const projectId = randomUUID();
      const organizationId = randomUUID();
      const token = `dbundle_proj_${randomUUID().replaceAll("-", "")}`;
      await seedOwnedProject({
        pool,
        projectId,
        organizationId,
        organizationName: "Resource controls",
        organizationSlug: `org-${organizationId}`,
        projectName: "Resource controls",
        projectSlug: `project-${projectId}`
      });
      await pool.query(
        "INSERT INTO project_tokens (id, project_id, token_hash, label) VALUES ($1, $2, $3, $4)",
        [randomUUID(), projectId, createHash("sha256").update(token).digest("hex"), "resource-test"]
      );
      const db = createQueryable(pool);
      const queue = createRedisQueueClient({ redisUrl });
      const objectStore = createS3ObjectStoreClient({
        endpoint: s3Endpoint,
        region: s3Region,
        bucket: s3Bucket,
        accessKeyId: "test",
        secretAccessKey: "test",
        forcePathStyle: true
      });
      const app = createApiServer(createApiDependencies({ db, queue, objectStore }));
      const publish = vi.fn().mockResolvedValue(undefined);
      const groupDependencies = {
        queue,
        incidentStore: createPostgresMetadataStore(db),
        frequencyCounter: createNonSpikingFrequencyCounter(),
        lifecycleWebhookPublisher: { publish }
      };
      const normalizeDependencies = {
        queue,
        objectStore,
        processedEventStore: createProcessedEventStore(db)
      };
      const send = (event: ReturnType<typeof browserResourceEvent>) =>
        app.inject({
          method: "POST",
          url: "/v1/events",
          headers: { authorization: `Bearer ${token}` },
          payload: { events: [event] }
        });
      const rows = () =>
        pool.query(
          "SELECT id, fingerprint, fingerprint_version, occurrence_count, title, status FROM incidents WHERE project_id = $1 ORDER BY id",
          [projectId]
        );
      try {
        for (const name of ["normalize-events", "group-incident", "evaluate-alerts"] as const)
          await queue.clearJobQueue(name);
        const original = browserResourceEvent({ url });
        expect((await send(original)).statusCode).toBe(202);
        await processNextNormalizeEventsJob(normalizeDependencies);
        await processNextGroupIncidentJob(groupDependencies);
        const before = (await rows()).rows;
        expect(before).toHaveLength(1);
        expect(before[0]?.occurrence_count).toBe(1);
        const incident = before[0]!;
        const suggestions = buildCaptureRuleSuggestions({
          incident: {
            incident_id: incident["id"],
            project_id: projectId,
            fingerprint: incident["fingerprint"],
            fingerprint_version: incident["fingerprint_version"],
            title: incident["title"],
            occurrence_count: 1,
            matched_fields: []
          },
          bundle: {
            project: { environment: original.service.environment },
            service: { name: original.service.name },
            signal: {
              signal_type: "frontend_exception",
              source_event_types: ["frontend_exception"],
              fingerprint: incident["fingerprint"]
            },
            context: { frontend: { exceptions: [original.payload] } }
          }
        });
        const selected = suggestions.find((suggestion) => suggestion.rule.action === action)!;
        expect(selected.requires_confirmation).toBe(true);
        const rules = createPostgresCaptureRuleStore(db);
        const saved = await rules.createCaptureRule({
          ...selected.rule,
          id: randomUUID(),
          project_id: projectId
        });
        await queue.clearJobQueue("evaluate-alerts");
        publish.mockClear();
        const matched = browserResourceEvent({ url });
        const response = await send(matched);
        expect(response.statusCode).toBe(202);
        const key = buildRawEventObjectKey({
          projectId,
          eventId: matched.event_id,
          occurredAt: new Date(matched.occurred_at)
        });
        if (action === "drop") {
          expect(response.json().errors).toContainEqual({
            index: 0,
            reason: "capture_rule_dropped"
          });
          await expect(objectStore.getObject({ key })).rejects.toThrow("s3_object_not_found");
          expect(await queue.readJobQueue("normalize-events")).toHaveLength(0);
        } else {
          expect(await objectStore.getObject({ key })).toBeInstanceOf(Buffer);
          await processNextNormalizeEventsJob(normalizeDependencies);
          expect(await processNextGroupIncidentJob(groupDependencies)).toEqual({
            processed: true,
            reason: "non_incident_signal"
          });
        }
        expect((await rows()).rows).toEqual(before);
        expect(await queue.readJobQueue("evaluate-alerts")).toHaveLength(0);
        expect(publish).not.toHaveBeenCalled();
        expect(
          await rules.getCaptureRuleById({ id: saved.id, project_id: projectId })
        ).toMatchObject({
          id: saved.id,
          matcher: saved.matcher,
          action,
          enabled: true,
          hit_count: 1
        });

        const otherService = browserResourceEvent({ url });
        otherService.service.name = "admin";
        expect((await send(otherService)).statusCode).toBe(202);
        await processNextNormalizeEventsJob(normalizeDependencies);
        await processNextGroupIncidentJob(groupDependencies);
        const scopedRows = (await rows()).rows;
        expect(scopedRows).toHaveLength(2);
        expect(scopedRows.find((row) => row["id"] !== incident["id"])).toMatchObject({
          fingerprint: incident["fingerprint"],
          occurrence_count: 1
        });
        expect(
          await rules.getCaptureRuleById({ id: saved.id, project_id: projectId })
        ).toMatchObject({ hit_count: 1 });

        // Pausing the same saved rule restores ordinary capture without rewriting history.
        await rules.updateCaptureRule({ id: saved.id, project_id: projectId, enabled: false });
        expect((await send(browserResourceEvent({ url }))).statusCode).toBe(202);
        await processNextNormalizeEventsJob(normalizeDependencies);
        await processNextGroupIncidentJob(groupDependencies);
        expect((await rows()).rows).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: incident["id"], occurrence_count: 2 })
          ])
        );
      } finally {
        await app.close();
        // The suite uses a disposable, serial test queue. Grouping also schedules
        // bundle work; leaving it behind lets later durable workers adopt it.
        for (const name of [
          "normalize-events",
          "group-incident",
          "build-bundle",
          "evaluate-alerts"
        ] as const)
          await queue.clearJobQueue(name);
        await queue.close();
        await pool.query("DELETE FROM projects WHERE id = $1", [projectId]);
      }
    }
  );

  it("enforces transactional resource thresholds across 10 routes, hashed assets, allow carve-outs, concurrency, expiry, regression clamping, and redacted legacy tags", async () => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const token = `dbundle_proj_${randomUUID().replaceAll("-", "")}`;
    await seedOwnedProject({
      pool,
      projectId,
      organizationId,
      organizationName: "Threshold controls",
      organizationSlug: `org-${organizationId}`,
      projectName: "Threshold controls",
      projectSlug: `project-${projectId}`
    });
    await pool.query(
      "INSERT INTO project_tokens (id, project_id, token_hash, label) VALUES ($1, $2, $3, $4)",
      [randomUUID(), projectId, createHash("sha256").update(token).digest("hex"), "threshold-test"]
    );
    const db = createQueryable(pool);
    const queue = createRedisQueueClient({ redisUrl });
    const objectStore = createS3ObjectStoreClient({
      endpoint: s3Endpoint,
      region: s3Region,
      bucket: s3Bucket,
      accessKeyId: "test",
      secretAccessKey: "test",
      forcePathStyle: true
    });
    const app = createApiServer(createApiDependencies({ db, queue, objectStore }));
    const publish = vi.fn().mockResolvedValue(undefined);
    const normalizeDependencies = {
      queue,
      objectStore,
      processedEventStore: createProcessedEventStore(db)
    };
    const processOneGroupInTx = async () =>
      runInTransaction(db, (tx) =>
        processNextGroupIncidentJob({
          queue,
          incidentStore: createPostgresMetadataStore(tx),
          captureRuleThresholdStore: createPostgresCaptureRuleThresholdStore(tx),
          frequencyCounter: createNonSpikingFrequencyCounter(),
          lifecycleWebhookPublisher: { publish },
          alertEvaluationQueue: queue
        })
      );
    const ingestAndProcess = async (event: ReturnType<typeof browserResourceEvent>) => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/events",
        headers: { authorization: `Bearer ${token}` },
        payload: { events: [event] }
      });
      expect(response.statusCode).toBe(202);
      await processNextNormalizeEventsJob(normalizeDependencies);
      return processOneGroupInTx();
    };
    const rules = createPostgresCaptureRuleStore(db);
    const management = createCaptureRuleManagement(db);

    try {
      for (const name of [
        "normalize-events",
        "group-incident",
        "build-bundle",
        "evaluate-alerts"
      ] as const) {
        await queue.clearJobQueue(name);
      }

      // 1. Prefix threshold rule for hashed first-party assets + higher-specificity allow carve-out for checkout.
      const assetsRule = await rules.createCaptureRule({
        id: randomUUID(),
        project_id: projectId,
        name: "Threshold first-party Vite assets",
        description: null,
        enabled: true,
        action: "threshold",
        matcher: {
          event_types: ["frontend_exception"],
          browser_event_kind: "resource_error",
          services: ["web"],
          environments: ["production"],
          resource_url: { host: "app.example.com", path_prefix: "/assets/" }
        },
        sample_rate: null,
        sample_event_class: null,
        threshold_count: 11,
        threshold_window_seconds: 3600,
        threshold_group_by: "resource",
        created_by_user_id: null,
        created_from_incident_id: null,
        created_from_event_id: null,
        expires_at: null
      });
      await rules.createCaptureRule({
        id: randomUUID(),
        project_id: projectId,
        name: "Allow checkout assets immediately",
        description: null,
        enabled: true,
        action: "allow",
        matcher: {
          event_types: ["frontend_exception"],
          browser_event_kind: "resource_error",
          services: ["web"],
          environments: ["production"],
          resource_url: { host: "app.example.com", path_prefix: "/assets/checkout-" }
        },
        sample_rate: null,
        sample_event_class: null,
        threshold_count: null,
        threshold_window_seconds: null,
        threshold_group_by: null,
        created_by_user_id: null,
        created_from_incident_id: null,
        created_from_event_id: null,
        expires_at: null
      });

      // SDK config withholds rules when threshold/allow rules are active.
      const sdkConfig = await app.inject({
        method: "GET",
        url: "/v1/sdk/config",
        headers: { authorization: `Bearer ${token}` }
      });
      expect(sdkConfig.statusCode).toBe(200);
      expect(sdkConfig.json().capture_rules).toEqual([]);

      // 2. Two distinct hashed assets (6 + 5 = 11 combined, neither >= 11) -> 0 incidents!
      for (let i = 0; i < 6; i += 1) {
        expect(
          await ingestAndProcess(
            browserResourceEvent({
              url: "https://app.example.com/assets/App-a12bc34.css",
              route: `/page-${i}`,
              tag: "link"
            })
          )
        ).toEqual({ processed: true, reason: "threshold_pending" });
      }
      for (let i = 0; i < 5; i += 1) {
        expect(
          await ingestAndProcess(
            browserResourceEvent({
              url: "https://app.example.com/assets/App-f56de78.css",
              route: `/page-${i}`,
              tag: "link"
            })
          )
        ).toEqual({ processed: true, reason: "threshold_pending" });
      }
      expect(
        (await pool.query("SELECT id FROM incidents WHERE project_id = $1", [projectId])).rows
      ).toHaveLength(0);

      // 3. Neighbouring checkout asset matches higher-specificity `allow` rule -> opens immediately on #1!
      expect(
        await ingestAndProcess(
          browserResourceEvent({
            url: "https://app.example.com/assets/checkout-xyz.js",
            route: "/checkout",
            tag: "script"
          })
        )
      ).toEqual({ processed: true });
      const checkoutIncidents = (
        await pool.query("SELECT id, occurrence_count FROM incidents WHERE project_id = $1", [
          projectId
        ])
      ).rows;
      expect(checkoutIncidents).toHaveLength(1);
      expect(checkoutIncidents[0]?.occurrence_count).toBe(1);

      // 4. 10 then 11 distinct events across 10 routes for a new asset -> 0 at 10, 1 incident at 11 with occurrence_count=11.
      await queue.clearJobQueue("build-bundle");
      await queue.clearJobQueue("evaluate-alerts");
      publish.mockClear();

      const tenRouteUrl = "https://app.example.com/assets/App-live999.css";
      const routes = Array.from({ length: 10 }, (_, idx) => `/gallery/${idx + 1}`);
      for (let i = 0; i < 10; i += 1) {
        expect(
          await ingestAndProcess(
            browserResourceEvent({
              url: tenRouteUrl,
              route: routes[i]!,
              tag: "link"
            })
          )
        ).toEqual({ processed: true, reason: "threshold_pending" });
      }
      expect(await queue.readJobQueue("build-bundle")).toHaveLength(0);
      expect(await queue.readJobQueue("evaluate-alerts")).toHaveLength(0);
      expect(publish).not.toHaveBeenCalled();

      // 11th event crosses threshold!
      const crossingEvent = browserResourceEvent({
        url: tenRouteUrl,
        route: "/settings",
        tag: "link"
      });
      expect(await ingestAndProcess(crossingEvent)).toEqual({ processed: true });

      const assetIncidentResult = await pool.query<{
        id: string;
        occurrence_count: number;
        matched_fields: string[];
        status: string;
      }>(
        `SELECT id, occurrence_count, matched_fields, status
         FROM incidents
         WHERE project_id = $1 AND id <> $2`,
        [projectId, checkoutIncidents[0]!.id]
      );
      expect(assetIncidentResult.rows).toHaveLength(1);
      const assetIncident = assetIncidentResult.rows[0]!;
      expect(assetIncident.occurrence_count).toBe(11);
      expect(assetIncident.matched_fields).toContain("capture_rule_threshold");
      expect(assetIncident.status).toBe("open");

      // Triggering event has retain_first=true; all 11 incident_events are linked with routes preserved.
      const linkedEvents = await pool.query<{
        event_id: string;
        retain_first: boolean;
        resource_route: string | null;
      }>(
        `SELECT event_id::text AS event_id, retain_first, resource_route
         FROM incident_events
         WHERE incident_id = $1`,
        [assetIncident.id]
      );
      expect(linkedEvents.rows).toHaveLength(11);
      expect(
        linkedEvents.rows.find((r) => r.event_id === crossingEvent.event_id)?.retain_first
      ).toBe(true);
      const distinctRoutes = new Set(linkedEvents.rows.map((r) => r.resource_route));
      expect(distinctRoutes.has("/gallery/{param}")).toBe(true);
      expect(distinctRoutes.has("/settings")).toBe(true);

      // Consumed bucket rows are cleared; 1 bundle build, 1 bundle.created, 1 new_incident alert.
      expect(
        (
          await pool.query(
            "SELECT event_id FROM capture_rule_threshold_events WHERE rule_id = $1 AND bucket_key = $2",
            [
              assetsRule.id,
              JSON.stringify(["resource", "app.example.com", "/assets/App-live999.css"])
            ]
          )
        ).rows
      ).toHaveLength(0);
      expect(await queue.readJobQueue("build-bundle")).toHaveLength(1);
      const alerts = (await queue.readJobQueue("evaluate-alerts")).map(
        (raw) => JSON.parse(raw) as { condition_type?: string }
      );
      expect(alerts.filter((a) => a.condition_type === "new_incident")).toHaveLength(1);
      expect(
        publish.mock.calls.filter((call) => call[0]?.event_type === "bundle.created")
      ).toHaveLength(1);

      // 5. Duplicate 11th event_id does not duplicate or bump count; 12th event bypasses threshold because incident is open!
      await app.inject({
        method: "POST",
        url: "/v1/events",
        headers: { authorization: `Bearer ${token}` },
        payload: { events: [crossingEvent] }
      });
      await processNextNormalizeEventsJob(normalizeDependencies);
      expect(
        (
          await pool.query("SELECT occurrence_count FROM incidents WHERE id = $1", [
            assetIncident.id
          ])
        ).rows[0]?.occurrence_count
      ).toBe(11);

      expect(
        await ingestAndProcess(
          browserResourceEvent({ url: tenRouteUrl, route: "/dashboard", tag: "link" })
        )
      ).toEqual({ processed: true });
      expect(
        (
          await pool.query("SELECT occurrence_count FROM incidents WHERE id = $1", [
            assetIncident.id
          ])
        ).rows[0]?.occurrence_count
      ).toBe(12);

      // 6. Service isolation: same URL from "admin" service starts its own pending bucket (does not touch "web" incident).
      const adminEvent = browserResourceEvent({ url: tenRouteUrl, route: "/admin", tag: "link" });
      adminEvent.service.name = "admin";
      // assetsRule is scoped to services:["web"], so adminEvent opens immediately in its own incident.
      expect(await ingestAndProcess(adminEvent)).toEqual({ processed: true });
      expect(
        (
          await pool.query("SELECT occurrence_count FROM incidents WHERE id = $1", [
            assetIncident.id
          ])
        ).rows[0]?.occurrence_count
      ).toBe(12);

      // 7. Resolved-incident regression clamp: resolve assetIncident, insert a pre-resolution pending event,
      // and verify it never counts toward regression; 11 post-resolution events regress it exactly once!
      const resolvedAt = new Date(Date.now() - 120_000).toISOString();
      await pool.query(
        "UPDATE incidents SET status = 'resolved', resolved_at = $2::timestamptz WHERE id = $1",
        [assetIncident.id, resolvedAt]
      );
      await pool.query(
        `INSERT INTO capture_rule_threshold_events (
          event_id, project_id, rule_id, service_name, environment,
          bucket_key, resource_route, occurred_at, received_at, expires_at
        ) VALUES ($1, $2, $3, 'web', 'production', $4, '/old', $5::timestamptz, $5::timestamptz, NOW() + interval '1 hour')`,
        [
          randomUUID(),
          projectId,
          assetsRule.id,
          JSON.stringify(["resource", "app.example.com", "/assets/App-live999.css"]),
          new Date(Date.now() - 180_000).toISOString()
        ]
      );
      for (let i = 0; i < 10; i += 1) {
        expect(
          await ingestAndProcess(
            browserResourceEvent({ url: tenRouteUrl, route: `/post-${i}`, tag: "link" })
          )
        ).toEqual({ processed: true, reason: "threshold_pending" });
      }
      expect(
        (await pool.query("SELECT status FROM incidents WHERE id = $1", [assetIncident.id])).rows[0]
          ?.status
      ).toBe("resolved");
      expect(
        await ingestAndProcess(
          browserResourceEvent({ url: tenRouteUrl, route: "/post-10", tag: "link" })
        )
      ).toEqual({ processed: true });
      expect(
        (
          await pool.query("SELECT status, occurrence_count FROM incidents WHERE id = $1", [
            assetIncident.id
          ])
        ).rows[0]
      ).toEqual({ status: "regressed", occurrence_count: 23 });

      // 8. Rolling window expiry + delayed delivery (server received_at authority) + concurrent crossing!
      const concurrentUrl = "https://app.example.com/assets/App-race.js";
      const concurrentBucket = JSON.stringify([
        "resource",
        "app.example.com",
        "/assets/App-race.js"
      ]);
      // Seed 1 expired row (older than 3600s window) -> must NOT count.
      await pool.query(
        `INSERT INTO capture_rule_threshold_events (
          event_id, project_id, rule_id, service_name, environment,
          bucket_key, resource_route, occurred_at, received_at, expires_at
        ) VALUES ($1, $2, $3, 'web', 'production', $4, '/stale', NOW() - interval '2 hours', NOW() - interval '2 hours', NOW() - interval '1 hour')`,
        [randomUUID(), projectId, assetsRule.id, concurrentBucket]
      );
      // Send 9 events with an old client occurred_at (2 hours ago) — server received_at is NOW so they DO count!
      for (let i = 0; i < 9; i += 1) {
        const delayed = browserResourceEvent({
          url: concurrentUrl,
          route: `/r-${i}`,
          tag: "script"
        });
        delayed.occurred_at = new Date(Date.now() - 2 * 3600_000).toISOString();
        expect(await ingestAndProcess(delayed)).toEqual({
          processed: true,
          reason: "threshold_pending"
        });
      }
      // 10th event is still pending (because the 2-hour-old received_at row expired out of the 1h window).
      expect(
        await ingestAndProcess(
          browserResourceEvent({ url: concurrentUrl, route: "/r-9", tag: "script" })
        )
      ).toEqual({ processed: true, reason: "threshold_pending" });

      // Now enqueue TWO crossing events (#11 and #12) and process them CONCURRENTLY in two real Postgres transactions!
      const raceA = browserResourceEvent({ url: concurrentUrl, route: "/race-a", tag: "script" });
      const raceB = browserResourceEvent({ url: concurrentUrl, route: "/race-b", tag: "script" });
      await app.inject({
        method: "POST",
        url: "/v1/events",
        headers: { authorization: `Bearer ${token}` },
        payload: { events: [raceA, raceB] }
      });
      await processNextNormalizeEventsJob(normalizeDependencies);
      await processNextNormalizeEventsJob(normalizeDependencies);
      publish.mockClear();
      await Promise.all([processOneGroupInTx(), processOneGroupInTx()]);

      const raceIncidents = (
        await pool.query<{ id: string; occurrence_count: number }>(
          `SELECT id, occurrence_count FROM incidents
           WHERE project_id = $1 AND title LIKE '%App-race.js%' OR (project_id = $1 AND occurrence_count = 12)`,
          [projectId]
        )
      ).rows;
      expect(
        publish.mock.calls.filter((call) => call[0]?.event_type === "bundle.created")
      ).toHaveLength(1);
      expect(raceIncidents.some((r) => r.occurrence_count === 12)).toBe(true);

      // A worker can finish processing later receipts before an earlier receipt.
      const outOfOrderBucket = "out-of-order-test";
      const outOfOrderEvents = Array.from({ length: 10 }, () => randomUUID());
      const lateProcessedEventId = randomUUID();
      const unrelatedEventId = randomUUID();
      const receipt = new Date().toISOString();
      await pool.query(
        `INSERT INTO capture_rule_threshold_events (
          event_id, project_id, rule_id, service_name, environment,
          bucket_key, resource_route, occurred_at, received_at, expires_at
        )
        SELECT event_id, $2::uuid, $3::uuid, 'web', 'production', $4, '/in-window',
          $5::timestamptz + interval '10 minutes', $5::timestamptz + interval '10 minutes',
          $5::timestamptz + interval '70 minutes'
        FROM unnest($1::uuid[]) AS upcoming(event_id)
        UNION ALL
        SELECT $6::uuid, $2::uuid, $3::uuid, 'web', 'production', $4, '/outside-window',
          $5::timestamptz + interval '61 minutes', $5::timestamptz + interval '61 minutes',
          $5::timestamptz + interval '121 minutes'`,
        [outOfOrderEvents, projectId, assetsRule.id, outOfOrderBucket, receipt, unrelatedEventId]
      );
      const crossed = await runInTransaction(db, (tx) =>
        createPostgresCaptureRuleThresholdStore(tx).evaluateThresholdGate({
          project_id: projectId,
          service_name: "web",
          environment: "production",
          fingerprint: "out-of-order-test",
          event_id: lateProcessedEventId,
          occurred_at: receipt,
          received_at: receipt,
          rule_id: assetsRule.id,
          threshold_count: 11,
          threshold_window_seconds: 3600,
          threshold_group_by: "resource",
          bucket_key: outOfOrderBucket,
          rule_updated_at: assetsRule.updated_at
        })
      );
      expect(crossed).toMatchObject({
        status: "crossed",
        consumed_event_ids: [lateProcessedEventId, ...outOfOrderEvents.sort()]
      });

      // 9. Multi-URL optional dependency (resource_urls) + legacy redacted-tag 10-route replay -> 1 incident + shared hit_count!
      const multiUrlRule = await rules.createCaptureRule({
        id: randomUUID(),
        project_id: projectId,
        name: "Optional OpenAI embed (primary + fallback CDN)",
        description: null,
        enabled: true,
        action: "threshold",
        matcher: {
          event_types: ["frontend_exception"],
          browser_event_kind: "resource_error",
          services: ["web"],
          environments: ["production"],
          resource_urls: [
            { host: "cdn.openai.com", path_equals: "/chat/embed.js" },
            { host: "fallback.openai.com", path_equals: "/chat/embed.js" }
          ]
        },
        sample_rate: null,
        sample_event_class: null,
        threshold_count: 10,
        threshold_window_seconds: 3600,
        threshold_group_by: "resource",
        created_by_user_id: null,
        created_from_incident_id: null,
        created_from_event_id: null,
        expires_at: null
      });

      // Replay 10 routes with redacted tag_name="[REDACTED]" for primary URL -> 1 single v3 incident (not 10 v2)!
      for (let i = 0; i < 9; i += 1) {
        expect(
          await ingestAndProcess(
            browserResourceEvent({
              url: "https://cdn.openai.com/chat/embed.js",
              route: `/page-${i}`,
              tag: "[REDACTED]"
            })
          )
        ).toEqual({ processed: true, reason: "threshold_pending" });
      }
      expect(
        await ingestAndProcess(
          browserResourceEvent({
            url: "https://cdn.openai.com/chat/embed.js",
            route: "/page-9",
            tag: "[REDACTED]"
          })
        )
      ).toEqual({ processed: true });

      // Fallback URL also matches the SAME rule and increments shared hit_count (10 + 1 = 11) while staying pending!
      expect(
        await ingestAndProcess(
          browserResourceEvent({
            url: "https://fallback.openai.com/chat/embed.js",
            route: "/page-0",
            tag: "[REDACTED]"
          })
        )
      ).toEqual({ processed: true, reason: "threshold_pending" });

      expect(
        (await rules.getCaptureRuleById({ id: multiUrlRule.id, project_id: projectId }))?.hit_count
      ).toBe(11);

      // Unlisted path on same host does NOT match resource_urls -> opens immediately.
      expect(
        await ingestAndProcess(
          browserResourceEvent({
            url: "https://cdn.openai.com/other.js",
            route: "/page-0",
            tag: "script"
          })
        )
      ).toEqual({ processed: true });
      expect(
        (await rules.getCaptureRuleById({ id: multiUrlRule.id, project_id: projectId }))?.hit_count
      ).toBe(11);

      // Verify exactly ONE v3 incident was created for the 10 redacted-tag routes of cdn.openai.com/chat/embed.js!
      const redactedIncidents = await pool.query<{
        id: string;
        fingerprint_version: string;
        occurrence_count: number;
      }>(
        `SELECT i.id, i.fingerprint_version, i.occurrence_count
         FROM incidents i
         WHERE i.project_id = $1
           AND i.fingerprint_version = 'v3'
           AND i.occurrence_count = 10`,
        [projectId]
      );
      expect(redactedIncidents.rows).toHaveLength(1);

      // 10. Pausing the multi-URL rule clears its pending fallback-CDN threshold rows!
      await management.updateCaptureRuleForProject({
        organization_id: organizationId,
        project_id: projectId,
        rule_id: multiUrlRule.id,
        update: { enabled: false }
      });
      expect(
        (
          await pool.query(
            "SELECT event_id FROM capture_rule_threshold_events WHERE rule_id = $1",
            [multiUrlRule.id]
          )
        ).rows
      ).toHaveLength(0);
    } finally {
      await app.close();
      for (const name of [
        "normalize-events",
        "group-incident",
        "build-bundle",
        "evaluate-alerts"
      ] as const) {
        await queue.clearJobQueue(name);
      }
      await queue.close();
      await pool.query("DELETE FROM projects WHERE id = $1", [projectId]);
    }
  });
});
