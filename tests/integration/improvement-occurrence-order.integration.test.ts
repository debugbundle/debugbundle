import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { recordImprovementOpportunityOccurrence } from "../../packages/storage/src/improvement-opportunity-recording.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/index.js";
import { createPostgresImprovementOpportunityStore } from "../../packages/storage/src/index.js";
import { buildHostedImprovementBundle } from "../../apps/worker/src/improvement-bundle-context.js";
import {
  createIntegrationPool,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.ts";

runIntegration("improvement occurrence ordering", () => {
  const pool = createIntegrationPool();
  beforeAll(async () => {
    await bootstrapStorageSchema(pool);
    await migrateStorageSchema(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it.each(["warning_hotspot", "slow_request", "request_failure_pattern"] as const)(
    "builds a schema-valid %s with actual PostgreSQL timestamp output",
    async (kind) => {
      const projectId = randomUUID();
      await seedOwnedProject({
        pool,
        organizationId: randomUUID(),
        projectId,
        organizationName: "Artifact test",
        organizationSlug: `artifact-${projectId}`,
        projectName: "Artifact test",
        projectSlug: `artifact-${projectId}`
      });
      const store = createPostgresImprovementOpportunityStore(pool);
      const eventId = randomUUID();
      const input = {
        project_id: projectId,
        service_name: "api",
        environment: "production",
        severity: "medium" as const,
        confidence: 0.8,
        threshold: 1,
        occurred_at: "2026-09-13T12:00:00.000Z",
        source_event_id: eventId
      };
      const recorded =
        kind === "warning_hotspot"
          ? await store.recordWarningHotspot({
              ...input,
              normalized_message: "Worker configuration is missing"
            })
          : await store.recordRequestPattern({
              ...input,
              kind,
              route_template: "/health",
              http_method: "GET",
              response_status: kind === "slow_request" ? 200 : 503,
              duration_ms: 2750.25
            });
      expect(recorded).not.toBeNull();
      const reserved = await store.reserveImprovementBundleGeneration({
        opportunity_id: recorded!.opportunity_id,
        event_id: eventId,
        occurred_at: "2026-09-13T12:00:00.000Z",
        trigger: "occurrence_threshold"
      });
      const context = await store.getImprovementBundleBuildContext({
        project_id: projectId,
        opportunity_id: recorded!.opportunity_id
      });
      expect(context).not.toBeNull();
      await expect(
        buildHostedImprovementBundle({
          context: context!,
          reserved,
          references: [],
          thresholds: { occurrence_threshold: 1, slow_request_duration_threshold_ms: 2500 },
          objectStore: {
            getObject: async () => {
              throw new Error("s3_object_not_found");
            }
          },
          apiBaseUrl: null,
          appBaseUrl: null,
          docsBaseUrl: null
        })
      ).resolves.toMatchObject({
        bundle_type: "improvement",
        signal: { first_seen_at: "2026-09-13T12:00:00.000Z" }
      });
    }
  );

  it("retains earliest/latest occurrence bounds and matching evidence across delayed arrivals and replays", async () => {
    const projectId = randomUUID();
    await seedOwnedProject({
      pool,
      organizationId: randomUUID(),
      projectId,
      organizationName: "Order test",
      organizationSlug: `order-${projectId}`,
      projectName: "Order test",
      projectSlug: `order-${projectId}`
    });
    const latestId = randomUUID();
    const olderId = randomUUID();
    const input = {
      project_id: projectId,
      service_name: "api",
      environment: "production",
      kind: "warning_hotspot" as const,
      severity: "medium" as const,
      confidence: 0.8,
      fingerprint: "warning-order",
      title: "New warning",
      summary: "New summary",
      evidence: { marker: "new" },
      occurred_at: "2026-09-13T12:00:00.000Z",
      source_event_id: latestId,
      source_event_type: "log_event" as const,
      threshold: 5
    };
    await recordImprovementOpportunityOccurrence(pool, input);
    const old = {
      ...input,
      occurred_at: "2026-07-10T12:00:00.000Z",
      source_event_id: olderId,
      title: "Old warning",
      summary: "Old summary",
      evidence: { marker: "old" }
    };
    await recordImprovementOpportunityOccurrence(pool, old);
    await recordImprovementOpportunityOccurrence(pool, old);
    const { rows } = await pool.query(
      "SELECT first_detected_at, last_detected_at, last_source_event_id, evidence, title, summary, occurrence_count FROM improvement_opportunities WHERE project_id = $1",
      [projectId]
    );
    expect(rows[0]).toMatchObject({
      first_detected_at: new Date(old.occurred_at),
      last_detected_at: new Date(input.occurred_at),
      last_source_event_id: latestId,
      evidence: { marker: "new" },
      title: "New warning",
      summary: "New summary",
      occurrence_count: 2
    });
  });
});
