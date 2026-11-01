import { randomUUID } from "node:crypto";

import { expect, it, beforeAll, afterAll } from "vitest";

import { processNextGroupIncidentJob } from "../../apps/worker/src/processor.js";
import {
  createPostgresMetadataStore,
  createRedisQueueClient
} from "../../packages/storage/src/index.js";

import {
  runIntegration,
  createIntegrationPool,
  createS3AdminClient,
  redisUrl,
  bootstrapStorageAndCreateBucket,
  seedOwnedProject
} from "../helpers/integration-setup.ts";

runIntegration("ingestion bundle trigger precedence", () => {
  const pool = createIntegrationPool();
  const s3Admin = createS3AdminClient();

  beforeAll(async (): Promise<void> => {
    await bootstrapStorageAndCreateBucket(pool, s3Admin);
  });

  afterAll(async (): Promise<void> => {
    await pool.end();
  });

  it("should deterministically apply build-bundle trigger precedence when regeneration conditions overlap", async (): Promise<void> => {
    const queue = createRedisQueueClient({ redisUrl });

    const scenarios = [
      {
        name: "regression dominates all co-occurring triggers",
        incidentStatus: "resolved",
        incomingEventType: "request_event" as const,
        incomingEventClass: "incident_signal" as const,
        includeDeployMetadata: true,
        expectedTrigger: "regression_reopen"
      },
      {
        name: "deploy dominates reproduction/new-context/threshold",
        incidentStatus: "open",
        incomingEventType: "request_event" as const,
        incomingEventClass: "incident_signal" as const,
        includeDeployMetadata: true,
        expectedTrigger: "deploy_metadata"
      },
      {
        name: "reproduction-confidence dominates new-context/threshold",
        incidentStatus: "open",
        incomingEventType: "request_event" as const,
        incomingEventClass: "incident_signal" as const,
        includeDeployMetadata: false,
        expectedTrigger: "reproduction_confidence_change"
      },
      {
        name: "new-context dominates threshold",
        incidentStatus: "open",
        incomingEventType: "frontend_exception" as const,
        incomingEventClass: "incident_signal" as const,
        includeDeployMetadata: false,
        expectedTrigger: "new_context_type"
      }
    ];

    for (const scenario of scenarios) {
      const projectId = randomUUID();
      const organizationId = randomUUID();
      const serviceId = randomUUID();
      const incidentId = randomUUID();
      const existingEventId = randomUUID();
      const incomingEventId = randomUUID();
      const fingerprint = `fp_bundle_precedence_${incomingEventId.slice(0, 8)}`;

      await pool.query("DELETE FROM incident_events");
      await pool.query("DELETE FROM incidents");
      await pool.query("DELETE FROM services");
      await pool.query("DELETE FROM project_tokens");
      await pool.query("DELETE FROM projects");
      await pool.query("DELETE FROM organizations");

      await seedOwnedProject({
        pool,
        organizationId,
        projectId,
        organizationName: "Bundle Precedence Org",
        organizationSlug: `bundle-precedence-org-${organizationId.slice(0, 8)}`,
        projectName: "Bundle Precedence Project",
        projectSlug: `bundle-precedence-project-${projectId.slice(0, 8)}`
      });

      await pool.query(
        `
          INSERT INTO services (id, project_id, name, environment)
          VALUES ($1, $2, $3, $4)
        `,
        [serviceId, projectId, "checkout-api", "production"]
      );

      await pool.query(
        `
          INSERT INTO incidents (
            id,
            project_id,
            service_id,
            environment,
            fingerprint,
            fingerprint_version,
            title,
            severity,
            status,
            first_seen_at,
            last_seen_at,
            occurrence_count,
            matched_fields,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10::timestamptz,
            $10::timestamptz,
            2,
            $11::text[],
            now(),
            now()
          )
        `,
        [
          incidentId,
          projectId,
          serviceId,
          "production",
          fingerprint,
          "v1",
          "TypeError at checkout",
          "high",
          scenario.incidentStatus,
          "2026-03-12T00:00:00.000Z",
          ["normalized_message"]
        ]
      );

      await pool.query(
        `
          INSERT INTO incident_events (incident_id, event_id, event_type, occurred_at, is_sampled)
          VALUES ($1, $2, $3, $4::timestamptz, $5)
        `,
        [incidentId, existingEventId, "backend_exception", "2026-03-12T00:00:00.000Z", true]
      );

      await queue.clearJobQueue("group-incident");
      await queue.clearJobQueue("build-bundle");

      const queryable = {
        query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[]) =>
          pool.query<Row>(sql, params)
      };

      await queue.enqueue("group-incident", {
        project_id: projectId,
        event_id: incomingEventId,
        event_type: scenario.incomingEventType,
        event_class: scenario.incomingEventClass,
        service_name: "checkout-api",
        environment: "production",
        fingerprint,
        normalized_message: "TypeError at checkout",
        matched_fields: ["normalized_message"],
        occurred_at: "2026-03-12T00:10:00.000Z",
        severity: "high",
        ...(scenario.includeDeployMetadata
          ? {
              deploy_metadata: {
                commit_sha: "abc123",
                version: "v2.4.0",
                branch: "main",
                deployed_at: "2026-03-12T00:05:00.000Z"
              }
            }
          : {})
      });

      expect(
        await processNextGroupIncidentJob({
          queue,
          incidentStore: createPostgresMetadataStore(queryable),
          frequencyCounter: {
            recordOccurrence: () =>
              Promise.resolve({
                occurrences_1m: 1,
                occurrences_5m: 1,
                occurrences_1h: 1,
                occurrences_24h: 1,
                baseline_1h_per_5m: 1,
                spike_ratio_5m_to_1h: 1,
                has_sufficient_baseline: false,
                is_spiking: false
              })
          },
          lifecycleWebhookPublisher: {
            publish: () => Promise.resolve(undefined)
          }
        })
      ).toEqual({ processed: true });

      const queuedBuildJobs = await queue.readJobQueue("build-bundle");
      expect(queuedBuildJobs, scenario.name).toHaveLength(1);
      const buildJob = JSON.parse(queuedBuildJobs[0] ?? "{}") as {
        trigger: string;
        occurrence_count: number;
      };
      expect(buildJob.trigger, scenario.name).toBe(scenario.expectedTrigger);
      expect(buildJob.occurrence_count, scenario.name).toBe(3);

      await queue.enqueue("group-incident", {
        project_id: projectId,
        event_id: incomingEventId,
        event_type: scenario.incomingEventType,
        event_class: scenario.incomingEventClass,
        service_name: "checkout-api",
        environment: "production",
        fingerprint,
        normalized_message: "TypeError at checkout",
        matched_fields: ["normalized_message"],
        occurred_at: "2026-03-12T00:10:00.000Z",
        severity: "high",
        ...(scenario.includeDeployMetadata
          ? {
              deploy_metadata: {
                commit_sha: "abc123",
                version: "v2.4.0",
                branch: "main",
                deployed_at: "2026-03-12T00:05:00.000Z"
              }
            }
          : {})
      });

      expect(
        await processNextGroupIncidentJob({
          queue,
          incidentStore: createPostgresMetadataStore(queryable),
          frequencyCounter: {
            recordOccurrence: () =>
              Promise.resolve({
                occurrences_1m: 1,
                occurrences_5m: 1,
                occurrences_1h: 1,
                occurrences_24h: 1,
                baseline_1h_per_5m: 1,
                spike_ratio_5m_to_1h: 1,
                has_sufficient_baseline: false,
                is_spiking: false
              })
          },
          lifecycleWebhookPublisher: {
            publish: () => Promise.resolve(undefined)
          }
        })
      ).toEqual({ processed: true });

      const replayQueuedBuildJobs = await queue.readJobQueue("build-bundle");
      expect(replayQueuedBuildJobs, scenario.name).toHaveLength(1);
      expect(replayQueuedBuildJobs[0], scenario.name).toBe(queuedBuildJobs[0]);
    }
  });
});
