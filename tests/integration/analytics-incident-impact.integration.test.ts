import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, expect, it } from "vitest";

import { createPostgresAnalyticsMetricsStore } from "../../packages/storage/src/index.js";
import {
  bootstrapStorageAndCreateBucket,
  createIntegrationPool,
  createQueryable,
  createS3AdminClient,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.ts";

runIntegration("analytics incident impact integration", () => {
  const pool = createIntegrationPool();
  const s3Admin = createS3AdminClient();

  beforeAll(async (): Promise<void> => {
    await bootstrapStorageAndCreateBucket(pool, s3Admin);
  });

  afterAll(async (): Promise<void> => {
    await pool.end();
  });

  it("reads linked incident impact from aggregate tables without raw analytics events", async (): Promise<void> => {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const incidentId = randomUUID();
    const generationId = randomUUID();
    const sampleId = randomUUID();
    const bucketStart = "2026-07-10T00:00:00.000Z";
    const subjectHash = "session-subject-hash";
    const dimensionHash = "dimension-hash";

    await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Incident impact org",
      organizationSlug: `incident-impact-${organizationId}`,
      projectName: "Incident impact project",
      projectSlug: `incident-impact-${projectId}`,
      organizationPlan: "team"
    });
    await pool.query(
      `
        INSERT INTO incidents (id, project_id, environment, fingerprint, title, severity, first_seen_at, last_seen_at)
        VALUES ($1, $2, 'production', 'impact-fingerprint', 'Checkout error', 'high', $3, $3)
      `,
      [incidentId, projectId, bucketStart]
    );
    await pool.query(
      `
        INSERT INTO analytics_incident_session_links (
          project_id, incident_id, service, environment, bucket_start, bucket_granularity, route_key, dimension_hash, subject_hash
        )
        VALUES ($1, $2, 'web', 'production', $3, 'day', '/checkout', $4, $5)
      `,
      [projectId, incidentId, bucketStart, dimensionHash, subjectHash]
    );
    await pool.query(
      `
        INSERT INTO analytics_route_rollups (
          project_id, service, environment, bucket_start, bucket_granularity, route_key, dimension_hash,
          device_type, browser_family, pageviews, unique_sessions
        )
        VALUES ($1, 'web', 'production', $2, 'day', '/checkout', $3, 'mobile', 'Chrome', 1, 1)
      `,
      [projectId, bucketStart, dimensionHash]
    );
    await pool.query(
      `
        INSERT INTO analytics_rollup_uniques (
          project_id, rollup_kind, service, environment, bucket_start, bucket_granularity, rollup_key, dimension_hash, subject_hash
        )
        VALUES
          ($1, 'funnel_step_session', 'web', 'production', $2, 'day', 'checkout|payment', $3, $4),
          ($1, 'transition_session', 'web', 'production', $2, 'day', '/pricing|/checkout', $3, $4)
      `,
      [projectId, bucketStart, dimensionHash, subjectHash]
    );
    await pool.query(
      `
        INSERT INTO analytics_journey_samples (
          id, project_id, service, environment, session_id_hash, correlation_session_hash,
          analysis_tags, first_seen_at, last_seen_at, dimensions_summary, s3_object_key,
          has_artifact, expires_at
        )
        VALUES (
          $1, $2, 'web', 'production', 'sha256:retained-session', $3,
          ARRAY['transition:/pricing->/checkout']::text[], $4, $4, '{}'::jsonb,
          $5, true, '2099-01-01T00:00:00.000Z'
        )
      `,
      [
        sampleId,
        projectId,
        subjectHash,
        bucketStart,
        `analytics-journeys/${projectId}/${sampleId}.json.gz`
      ]
    );
    await pool.query(
      `
        INSERT INTO analytics_bundle_generations (
          id, project_id, analysis_kind, analysis_spec, input_fingerprint, status, updated_at
        )
        VALUES ($1, $2, 'incident_impact', $3::jsonb, $4, 'pending', $5)
      `,
      [
        generationId,
        projectId,
        JSON.stringify({ related_incident_ids: [incidentId] }),
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        bucketStart
      ]
    );

    await expect(
      createPostgresAnalyticsMetricsStore(createQueryable(pool)).getIncidentImpact({
        project_id: projectId,
        incident_id: incidentId,
        from: bucketStart,
        to: "2026-07-11T00:00:00.000Z",
        granularity: "day",
        service: "web",
        environment: "production"
      })
    ).resolves.toMatchObject({
      incident_id: incidentId,
      affected_sessions: 1,
      affected_routes: [{ route_key: "/checkout", affected_sessions: 1 }],
      affected_funnels: [{ funnel_key: "checkout", affected_sessions: 1 }],
      top_device_types: [{ value: "mobile", affected_sessions: 1 }],
      top_browsers: [{ value: "Chrome", affected_sessions: 1 }],
      journey_patterns: [{
        from_route_key: "/pricing",
        to_route_key: "/checkout",
        affected_sessions: 1,
        sample_ids: [sampleId]
      }],
      conversion_delta: { availability: "unavailable", value: null },
      analytics_bundle: { status: "pending", generation_id: generationId, failure_reason: null }
    });

    await pool.query("DELETE FROM organizations WHERE id = $1", [organizationId]);
  });
});
