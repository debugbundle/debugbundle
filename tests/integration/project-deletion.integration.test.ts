import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";

import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, expect, it } from "vitest";

import { createPostgresBillingStore, createPostgresMetadataStore, deleteProjectObjects } from "../../packages/storage/src/index.js";

import {
  createIntegrationPool,
  createQueryable,
  createS3AdminClient,
  createTestObjectStore,
  runIntegration,
  bootstrapStorageAndCreateBucket,
  s3Bucket
} from "../helpers/integration-setup.ts";

runIntegration("project deletion integration", () => {
  const pool = createIntegrationPool();
  const s3Admin = createS3AdminClient();

  beforeAll(async (): Promise<void> => {
    await bootstrapStorageAndCreateBucket(pool, s3Admin);
  });

  afterAll(async (): Promise<void> => {
    await pool.end();
  });

  it("should cascade project-scoped records when a project is deleted", async (): Promise<void> => {
    const organizationId = randomUUID();
    const projectId = randomUUID();
    const serviceId = randomUUID();
    const incidentId = randomUUID();
    const eventId = randomUUID();
    const processedEventId = randomUUID();
    const deploymentId = randomUUID();
    const bundleGenerationId = randomUUID();
    const projectTokenId = randomUUID();
    const probeActivationId = randomUUID();
    const alertRuleId = randomUUID();
    const alertDeliveryId = randomUUID();
    const webhookId = randomUUID();
    const webhookDeliveryId = randomUUID();
    const weeklyReportChannelId = randomUUID();
    const weeklyReportDeliveryId = randomUUID();

    await resetProjectDeletionTables();

    await pool.query(
      `
        INSERT INTO organizations (id, name, slug)
        VALUES ($1, $2, $3)
      `,
      [organizationId, "Project Deletion Org", `project-deletion-org-${organizationId.slice(0, 8)}`]
    );

    await pool.query(
      `
        INSERT INTO projects (id, organization_id, name, slug, environment_default)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [projectId, organizationId, "Main App", "main-app", "production"]
    );

    await pool.query(
      `
        INSERT INTO project_tokens (id, project_id, token_hash, label)
        VALUES ($1, $2, $3, $4)
      `,
      [projectTokenId, projectId, "proj_token_hash_123", "Production ingest"]
    );

    await pool.query(
      `
        INSERT INTO probe_activations (
          id,
          project_id,
          created_by_member_id,
          label_pattern,
          service,
          environment,
          trigger_expires_at,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz)
      `,
      [
        probeActivationId,
        projectId,
        randomUUID(),
        "checkout.*",
        "checkout-api",
        "production",
        "2026-03-21T00:10:00.000Z",
        "2026-03-21T01:00:00.000Z"
      ]
    );

    await pool.query(
      `
        INSERT INTO capture_policies (
          project_id,
          preset,
          capture_logs,
          capture_request_events,
          capture_breadcrumbs,
          capture_probe_events
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [projectId, "investigative", "info", "all", "standalone", "standalone_when_activated"]
    );

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
          'open',
          $9::timestamptz,
          $10::timestamptz,
          $11,
          $12::text[],
          now(),
          now()
        )
      `,
      [
        incidentId,
        projectId,
        serviceId,
        "production",
        "fp_project_deletion",
        "v1",
        "TypeError at checkout",
        "high",
        "2026-03-21T00:00:00.000Z",
        "2026-03-21T00:05:00.000Z",
        2,
        ["normalized_message"]
      ]
    );

    await pool.query(
      `
        INSERT INTO incident_events (
          incident_id,
          event_id,
          event_type,
          event_class,
          occurred_at,
          is_sampled
        )
        VALUES ($1, $2, $3, $4, $5::timestamptz, $6)
      `,
      [incidentId, eventId, "backend_exception", "incident_signal", "2026-03-21T00:00:00.000Z", true]
    );

    await pool.query(
      `
        INSERT INTO processed_events (
          event_id,
          project_id,
          event_type,
          fingerprint,
          normalized_message
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [processedEventId, projectId, "backend_exception", "fp_project_deletion", "TypeError at checkout"]
    );

    await pool.query(
      `
        INSERT INTO deployments (
          id,
          project_id,
          service_id,
          environment,
          source_event_id,
          commit_sha,
          version,
          branch,
          deployed_at,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::jsonb)
      `,
      [deploymentId, projectId, serviceId, "production", randomUUID(), "abc123", "1.2.3", "main", "2026-03-20T23:55:00.000Z", "{}"]
    );

    await pool.query(
      `
        INSERT INTO bundle_generations (
          id,
          project_id,
          incident_id,
          bundle_type,
          generation_number,
          source_event_id,
          source_occurred_at,
          trigger,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9::timestamptz, $10::timestamptz)
      `,
      [bundleGenerationId, projectId, incidentId, "failure", 1, eventId, "2026-03-21T00:00:00.000Z", "occurrence_threshold", "2026-03-21T00:01:00.000Z", "2026-03-21T00:01:00.000Z"]
    );

    await pool.query(
      `
        INSERT INTO alert_rules (
          id,
          project_id,
          service_id,
          channel,
          condition_type,
          severity_min,
          config,
          is_enabled
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      `,
      [alertRuleId, projectId, serviceId, "email", "new_incident", "high", "{}", true]
    );

    await pool.query(
      `
        INSERT INTO alert_deliveries (
          id,
          alert_id,
          project_id,
          incident_id,
          condition_type,
          dedupe_key,
          channel,
          status,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      `,
      [alertDeliveryId, alertRuleId, projectId, incidentId, "new_incident", "dedupe_123", "email", "pending", "{}"]
    );

    await pool.query(
      `
        INSERT INTO agent_webhooks (
          id,
          project_id,
          url,
          secret_hash,
          events,
          filters,
          is_enabled
        )
        VALUES ($1, $2, $3, $4, $5::text[], $6::jsonb, $7)
      `,
      [webhookId, projectId, "https://hooks.example.test/debugbundle", "secret_hash_123", ["bundle.created"], "{}", true]
    );

    await pool.query(
      `
        INSERT INTO webhook_deliveries (
          id,
          webhook_id,
          project_id,
          incident_id,
          event_type,
          target_url,
          signing_secret,
          occurred_at,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::jsonb)
      `,
      [webhookDeliveryId, webhookId, projectId, incidentId, "bundle.created", "https://hooks.example.test/debugbundle", "secret_123", "2026-03-21T00:02:00.000Z", "{}"]
    );

    await pool.query(
      `
        INSERT INTO weekly_report_channels (
          id,
          project_id,
          channel,
          config,
          schedule_day_of_week,
          schedule_hour_of_day,
          schedule_timezone,
          is_enabled
        )
        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
      `,
      [weeklyReportChannelId, projectId, "email", '{"to":["ops@example.com"]}', "monday", 9, "UTC", true]
    );

    await pool.query(
      `
        INSERT INTO weekly_report_deliveries (
          id,
          weekly_report_channel_id,
          project_id,
          window_start,
          window_end,
          channel,
          status
        )
        VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7)
      `,
      [weeklyReportDeliveryId, weeklyReportChannelId, projectId, "2026-03-14T00:00:00.000Z", "2026-03-21T00:00:00.000Z", "email", "pending"]
    );

    const store = createPostgresMetadataStore(createQueryable(pool));
    const deleted = await store.deleteProjectForOrganization({
      organization_id: organizationId,
      project_id: projectId
    });

    expect(deleted).toMatchObject({
      project_id: projectId,
      organization_id: organizationId,
      name: "Main App",
      slug: "main-app"
    });

    for (const assertion of projectScopedAssertions()) {
      const result = await pool.query<{ count: number }>(assertion.sql, [projectId]);
      expect(result.rows[0]?.count ?? -1, assertion.name).toBe(0);
    }

    const organizationCount = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM organizations WHERE id = $1`,
      [organizationId]
    );
    expect(organizationCount.rows[0]?.count ?? -1).toBe(1);
  });

  async function resetProjectDeletionTables(): Promise<void> {
    await pool.query(
      `
        TRUNCATE TABLE
          webhook_deliveries,
          alert_deliveries,
          weekly_report_deliveries,
          bundle_generations,
          deployments,
          incident_events,
          alert_rules,
          weekly_report_channels,
          capture_policies,
          probe_activations,
          agent_webhooks,
          project_tokens,
          incidents,
          services,
          projects,
          organizations
        CASCADE
      `,
      []
    );
  }

  it("should delete S3 blobs under all project prefixes", async (): Promise<void> => {
    const objectStore = createTestObjectStore();
    const projectId = randomUUID();
    const otherProjectId = randomUUID();
    const dummyBody = gzipSync(Buffer.from("{}", "utf8"));

    await objectStore.putObject({ key: `raw-events/${projectId}/2026/03/21/00/evt1.json.gz`, body: dummyBody, contentType: "application/json", contentEncoding: "gzip" });
    await objectStore.putObject({ key: `raw-events/${projectId}/2026/03/21/01/evt2.json.gz`, body: dummyBody, contentType: "application/json", contentEncoding: "gzip" });
    await objectStore.putObject({ key: `bundles/${projectId}/inc1/bundle.json.gz`, body: dummyBody, contentType: "application/json", contentEncoding: "gzip" });
    await objectStore.putObject({ key: `reproductions/${projectId}/inc1/reproduction.json.gz`, body: dummyBody, contentType: "application/json", contentEncoding: "gzip" });
    await objectStore.putObject({ key: `raw-events/${otherProjectId}/2026/03/21/00/evt3.json.gz`, body: dummyBody, contentType: "application/json", contentEncoding: "gzip" });

    await deleteProjectObjects(objectStore, projectId);

    const targetRaw = await s3Admin.send(new ListObjectsV2Command({ Bucket: s3Bucket, Prefix: `raw-events/${projectId}/` }));
    const targetBundles = await s3Admin.send(new ListObjectsV2Command({ Bucket: s3Bucket, Prefix: `bundles/${projectId}/` }));
    const targetRepros = await s3Admin.send(new ListObjectsV2Command({ Bucket: s3Bucket, Prefix: `reproductions/${projectId}/` }));

    expect(targetRaw.Contents ?? [], "raw-events should be empty").toHaveLength(0);
    expect(targetBundles.Contents ?? [], "bundles should be empty").toHaveLength(0);
    expect(targetRepros.Contents ?? [], "reproductions should be empty").toHaveLength(0);

    const otherRaw = await s3Admin.send(new ListObjectsV2Command({ Bucket: s3Bucket, Prefix: `raw-events/${otherProjectId}/` }));
    expect(otherRaw.Contents ?? [], "other project raw-events should survive").toHaveLength(1);
  });

  it("should preserve organization usage counters across project deletion and recreation", async (): Promise<void> => {
    const organizationId = randomUUID();
    const deletedProjectId = randomUUID();
    const recreatedProjectId = randomUUID();
    const periodStartsAt = "2026-03-01T00:00:00.000Z";

    await resetProjectDeletionTables();

    await pool.query(
      `
        INSERT INTO organizations (id, name, slug, plan)
        VALUES ($1, $2, $3, $4)
      `,
      [organizationId, "Usage Counter Org", `usage-counter-org-${organizationId.slice(0, 8)}`, "solo"]
    );

    await pool.query(
      `
        INSERT INTO projects (id, organization_id, name, slug, environment_default)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [deletedProjectId, organizationId, "Deleted Project", "deleted-project", "production"]
    );

    await pool.query(
      `
        INSERT INTO org_usage_counters (organization_id, period_starts_at, raw_ingested_events, updated_at)
        VALUES ($1, $2::timestamptz, $3, $4::timestamptz)
      `,
      [organizationId, periodStartsAt, 17, "2026-03-15T12:00:00.000Z"]
    );

    const metadataStore = createPostgresMetadataStore(createQueryable(pool));
    const billingStore = createPostgresBillingStore(createQueryable(pool));

    const deleted = await metadataStore.deleteProjectForOrganization({
      organization_id: organizationId,
      project_id: deletedProjectId
    });

    expect(deleted?.project_id).toBe(deletedProjectId);

    await pool.query(
      `
        INSERT INTO projects (id, organization_id, name, slug, environment_default)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [recreatedProjectId, organizationId, "Recreated Project", "recreated-project", "production"]
    );

    const summary = await billingStore.getBillingSummaryForOrganization({
      organization_id: organizationId,
      now: "2026-03-20T12:00:00.000Z"
    });

    expect(summary).not.toBeNull();
    expect(summary?.active_projects).toBe(1);
    expect(summary?.usage_window.starts_at).toBe(periodStartsAt);
    expect(summary?.allowances.monthly_raw_ingested_events.used).toBe(17);

    const counterRow = await pool.query<{ raw_ingested_events: number }>(
      `
        SELECT raw_ingested_events
        FROM org_usage_counters
        WHERE organization_id = $1
          AND period_starts_at = $2::timestamptz
      `,
      [organizationId, periodStartsAt]
    );

    expect(counterRow.rows[0]?.raw_ingested_events ?? -1).toBe(17);
  });
});

function projectScopedAssertions(): Array<{ name: string; sql: string }> {
  return [
    { name: "projects", sql: `SELECT COUNT(*)::int AS count FROM projects WHERE id = $1` },
    { name: "project_tokens", sql: `SELECT COUNT(*)::int AS count FROM project_tokens WHERE project_id = $1` },
    { name: "probe_activations", sql: `SELECT COUNT(*)::int AS count FROM probe_activations WHERE project_id = $1` },
    { name: "capture_policies", sql: `SELECT COUNT(*)::int AS count FROM capture_policies WHERE project_id = $1` },
    { name: "services", sql: `SELECT COUNT(*)::int AS count FROM services WHERE project_id = $1` },
    { name: "incidents", sql: `SELECT COUNT(*)::int AS count FROM incidents WHERE project_id = $1` },
    {
      name: "incident_events",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM incident_events ie
        JOIN incidents i ON i.id = ie.incident_id
        WHERE i.project_id = $1
      `
    },
    { name: "processed_events", sql: `SELECT COUNT(*)::int AS count FROM processed_events WHERE project_id = $1` },
    { name: "deployments", sql: `SELECT COUNT(*)::int AS count FROM deployments WHERE project_id = $1` },
    { name: "bundle_generations", sql: `SELECT COUNT(*)::int AS count FROM bundle_generations WHERE project_id = $1` },
    { name: "alert_rules", sql: `SELECT COUNT(*)::int AS count FROM alert_rules WHERE project_id = $1` },
    { name: "alert_deliveries", sql: `SELECT COUNT(*)::int AS count FROM alert_deliveries WHERE project_id = $1` },
    { name: "agent_webhooks", sql: `SELECT COUNT(*)::int AS count FROM agent_webhooks WHERE project_id = $1` },
    { name: "webhook_deliveries", sql: `SELECT COUNT(*)::int AS count FROM webhook_deliveries WHERE project_id = $1` },
    { name: "weekly_report_channels", sql: `SELECT COUNT(*)::int AS count FROM weekly_report_channels WHERE project_id = $1` },
    { name: "weekly_report_deliveries", sql: `SELECT COUNT(*)::int AS count FROM weekly_report_deliveries WHERE project_id = $1` }
  ];
}