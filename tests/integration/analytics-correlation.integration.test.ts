import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, expect, it } from "vitest";

import type { AnalyticsEventEnvelope } from "../../packages/shared-types/src/index.js";
import {
  createPostgresAnalyticsCorrelationStore,
  createPostgresAnalyticsRollupStore,
  hashAnalyticsCorrelationValue,
  hashAnalyticsSessionSubject
} from "../../packages/storage/src/index.js";
import {
  bootstrapStorageAndCreateBucket,
  createIntegrationPool,
  createQueryable,
  createS3AdminClient,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.ts";

runIntegration("analytics incident correlation integration", () => {
  const pool = createIntegrationPool();
  const s3Admin = createS3AdminClient();

  beforeAll(async (): Promise<void> => {
    await bootstrapStorageAndCreateBucket(pool, s3Admin);
  });

  afterAll(async (): Promise<void> => {
    await pool.end();
  });

  it("links route sessions exactly once whether analytics or the incident arrives first", async (): Promise<void> => {
    for (const order of ["analytics_first", "incident_first", "concurrent"] as const) {
      const projectId = randomUUID();
      const organizationId = randomUUID();
      const incidentId = randomUUID();
      const eventId = randomUUID();
      const sessionId = `session-${order}`;
      const traceId = `trace-${order}`;
      const occurredAt = "2026-07-10T10:05:00.000Z";
      const db = createQueryable(pool);
      const rollupStore = createPostgresAnalyticsRollupStore(db);
      const correlationStore = createPostgresAnalyticsCorrelationStore(db);

      await seedOwnedProject({
        pool,
        organizationId,
        projectId,
        organizationName: `Org ${order}`,
        organizationSlug: `org-${organizationId}`,
        projectName: `Project ${order}`,
        projectSlug: `project-${projectId}`,
        organizationPlan: "team"
      });
      await pool.query(
        `
          INSERT INTO incidents (
            id,
            project_id,
            environment,
            fingerprint,
            title,
            severity,
            first_seen_at,
            last_seen_at
          )
          VALUES ($1, $2, 'production', $3, 'Frontend failure', 'high', $4, $4)
        `,
        [incidentId, projectId, `fingerprint-${order}`, occurredAt]
      );

      const analyticsWrite = (): Promise<{ recorded: boolean }> =>
        rollupStore.recordAnalyticsEvent({
          project_id: projectId,
          event: createAnalyticsPageView({
            projectId,
            eventId: randomUUID(),
            sessionId,
            traceId,
            occurredAt
          })
        });
      const incidentWrite = (): Promise<{ recorded: boolean; linked_sessions: number }> =>
        correlationStore.recordIncidentCorrelation({
          project_id: projectId,
          incident_id: incidentId,
          event_id: eventId,
          service: "web",
          environment: "production",
          occurred_at: occurredAt,
          session_id_hash: hashAnalyticsSessionSubject(projectId, sessionId),
          trace_id_hash: hashAnalyticsCorrelationValue(traceId)
        });

      if (order === "analytics_first") {
        await expect(analyticsWrite()).resolves.toEqual({ recorded: true });
        await expect(incidentWrite()).resolves.toEqual({ recorded: true, linked_sessions: 2 });
      } else if (order === "incident_first") {
        await expect(incidentWrite()).resolves.toEqual({ recorded: true, linked_sessions: 0 });
        await expect(analyticsWrite()).resolves.toEqual({ recorded: true });
      } else {
        const [analyticsResult, incidentResult] = await Promise.all([
          analyticsWrite(),
          incidentWrite()
        ]);
        expect(analyticsResult).toEqual({ recorded: true });
        expect(incidentResult.recorded).toBe(true);
      }

      const routeResult = await pool.query<{
        bucket_granularity: "hour" | "day";
        linked_incident_sessions: string;
      }>(
        `
          SELECT bucket_granularity, linked_incident_sessions::text
          FROM analytics_route_rollups
          WHERE project_id = $1
            AND route_key = '/checkout'
          ORDER BY bucket_granularity
        `,
        [projectId]
      );
      expect(routeResult.rows).toEqual([
        { bucket_granularity: "day", linked_incident_sessions: "1" },
        { bucket_granularity: "hour", linked_incident_sessions: "1" }
      ]);

      await expect(incidentWrite()).resolves.toEqual({ recorded: false, linked_sessions: 0 });
      const linkCount = await pool.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM analytics_incident_session_links
          WHERE incident_id = $1
        `,
        [incidentId]
      );
      expect(linkCount.rows[0]?.count).toBe("2");

      await pool.query("DELETE FROM organizations WHERE id = $1", [organizationId]);
    }
  });
});

function createAnalyticsPageView(input: {
  projectId: string;
  eventId: string;
  sessionId: string;
  traceId: string;
  occurredAt: string;
}): AnalyticsEventEnvelope {
  return {
    schema_version: "2026-07-analytics-01",
    event_id: input.eventId,
    event_type: "analytics_event",
    project_id: input.projectId,
    occurred_at: input.occurredAt,
    sdk_name: "@debugbundle/sdk-browser",
    sdk_version: "1.0.0",
    service: {
      name: "web",
      runtime: "browser",
      framework: "react",
      environment: "production"
    },
    correlation: {
      session_id: input.sessionId,
      visitor_id_hash: null,
      user_id_hash: null,
      trace_id: input.traceId,
      deploy_id: "deploy-2026-07-10"
    },
    payload: {
      kind: "page_view",
      privacy: { mode: "strict", consent_granted: false },
      route: {
        path: "/checkout",
        normalized_path: "/checkout",
        title: "Checkout"
      },
      dimensions: {
        auth_state: "anonymous",
        device_type: "desktop",
        browser_family: "Chrome",
        browser_major: 126,
        os_family: "macOS",
        os_major: 15,
        language: "en",
        locale: "en-US",
        viewport_bucket: "large",
        referrer_domain: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        country_code: null,
        region_code: null
      },
      custom_dimensions: {}
    }
  };
}
