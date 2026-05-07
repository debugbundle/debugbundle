import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";

import { afterAll, beforeAll, expect, it } from "vitest";

import { processNextGroupIncidentJob } from "../../apps/worker/src/processor.js";
import {
  buildRawEventObjectKey,
  createPostgresMetadataStore
} from "../../packages/storage/src/index.js";
import type { GroupIncidentJob } from "../../packages/storage/src/index.js";

import {
  createIntegrationPool,
  createNoopWebhookPublisher,
  createNonSpikingFrequencyCounter,
  createQueryable,
  createS3AdminClient,
  createTestObjectStore,
  runIntegration,
  bootstrapStorageAndCreateBucket
} from "../helpers/integration-setup.ts";

runIntegration("retention sampling integration", () => {
  const pool = createIntegrationPool();
  const s3Admin = createS3AdminClient();

  beforeAll(async (): Promise<void> => {
    await bootstrapStorageAndCreateBucket(pool, s3Admin);
  });

  afterAll(async (): Promise<void> => {
    await pool.end();
  });

  it("deletes demoted raw-event blobs when occurrence sampling downgrades an earlier latest sample", async (): Promise<void> => {
    const organizationId = randomUUID();
    const projectId = randomUUID();
    const eventIds = [randomUUID(), randomUUID(), randomUUID()];
    const occurredAt = [
      "2026-03-20T00:00:00.000Z",
      "2026-03-20T00:01:00.000Z",
      "2026-03-20T00:02:00.000Z"
    ];

    await pool.query(
      `
        TRUNCATE TABLE
          incident_events,
          incidents,
          services,
          projects,
          organizations
        CASCADE
      `,
      []
    );

    await pool.query(
      `
        INSERT INTO organizations (id, name, slug)
        VALUES ($1, $2, $3)
      `,
      [organizationId, "Sampling Org", `sampling-org-${organizationId.slice(0, 8)}`]
    );

    await pool.query(
      `
        INSERT INTO projects (id, organization_id, name, slug, environment_default)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [projectId, organizationId, "Sampling Project", `sampling-project-${projectId.slice(0, 8)}`, "production"]
    );

    const objectStore = createTestObjectStore();
    const body = gzipSync(Buffer.from("{}", "utf8"));

    for (let index = 0; index < eventIds.length; index += 1) {
      await objectStore.putObject({
        key: buildRawEventObjectKey({
          projectId,
          occurredAt: new Date(occurredAt[index]!),
          eventId: eventIds[index]!
        }),
        body,
        contentType: "application/json",
        contentEncoding: "gzip"
      });
    }

    const incidentStore = createPostgresMetadataStore(createQueryable(pool));

    for (let index = 0; index < eventIds.length; index += 1) {
      const currentEventId = eventIds[index]!;
      const currentOccurredAt = occurredAt[index]!;
      const job: GroupIncidentJob = {
        project_id: projectId,
        event_id: currentEventId,
        event_type: "backend_exception",
        event_class: "incident_signal",
        service_name: "checkout-api",
        environment: "production",
        fingerprint: "fp_sampling_case",
        fingerprint_version: "v1",
        normalized_message: "TypeError at checkout",
        matched_fields: ["normalized_message"],
        occurred_at: currentOccurredAt,
        severity: "high"
      };
      const queue = {
        dequeue: (async (jobName: string) => (jobName === "group-incident" ? job : null)) as Parameters<
          typeof processNextGroupIncidentJob
        >[0]["queue"]["dequeue"],
        enqueue: async () => undefined
      } as Parameters<typeof processNextGroupIncidentJob>[0]["queue"];

      await processNextGroupIncidentJob({
        queue,
        alertEvaluationQueue: {
          enqueue: async () => undefined
        },
        incidentStore,
        frequencyCounter: createNonSpikingFrequencyCounter(),
        lifecycleWebhookPublisher: createNoopWebhookPublisher(),
        objectStore
      });
    }

    const statusRows = await pool.query<{ event_id: string; is_sampled: boolean }>(
      `
        SELECT event_id::text AS event_id, is_sampled
        FROM incident_events
        WHERE event_id = ANY($1::uuid[])
        ORDER BY occurred_at ASC
      `,
      [eventIds]
    );

    expect(statusRows.rows).toEqual([
      { event_id: eventIds[0]!, is_sampled: true },
      { event_id: eventIds[1]!, is_sampled: false },
      { event_id: eventIds[2]!, is_sampled: true }
    ]);

    await expect(
      objectStore.getObject({
        key: buildRawEventObjectKey({
          projectId,
          occurredAt: new Date(occurredAt[0]!),
          eventId: eventIds[0]!
        })
      })
    ).resolves.toBeInstanceOf(Buffer);

    await expect(
      objectStore.getObject({
        key: buildRawEventObjectKey({
          projectId,
          occurredAt: new Date(occurredAt[1]!),
          eventId: eventIds[1]!
        })
      })
    ).rejects.toThrow();

    await expect(
      objectStore.getObject({
        key: buildRawEventObjectKey({
          projectId,
          occurredAt: new Date(occurredAt[2]!),
          eventId: eventIds[2]!
        })
      })
    ).resolves.toBeInstanceOf(Buffer);
  });
});