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
  createPostgresMetadataStore,
  createRedisQueueClient,
  createS3ObjectStoreClient
} from "../../packages/storage/src/index.js";
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
});
