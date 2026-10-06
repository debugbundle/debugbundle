import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  createPostgresMetadataStore,
  createPostgresImprovementOpportunityStore,
  createPostgresAnalyticsOpportunityStore,
  createPostgresAnalyticsBundleGenerationStore
} from "../../packages/storage/src/index.js";
import {
  countIncidentsForOrganization,
  countImprovementsForOrganization
} from "../../packages/storage/src/incident-improvement-counts.js";
import { upsertAnalyticsOpportunity } from "../../packages/storage/src/analytics-opportunity-recording.js";
import {
  bootstrapStorageAndCreateBucket,
  createIntegrationPool,
  createQueryable,
  createS3AdminClient,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("filtered pagination counts", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const s3 = createS3AdminClient();
  const organizationId = randomUUID();
  const projectId = randomUUID();
  const otherProjectId = randomUUID();
  let ownerUserId: string;
  const occurredAt = "2026-10-05T10:00:00.000Z";

  beforeAll(async () => {
    await bootstrapStorageAndCreateBucket(pool, s3);
    ({ ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Counts",
      organizationSlug: `counts-${organizationId}`,
      projectName: "Counts",
      projectSlug: `counts-${projectId}`
    }));
    await seedOwnedProject({
      pool,
      organizationId: randomUUID(),
      projectId: otherProjectId,
      organizationName: "Other counts",
      organizationSlug: `other-counts-${otherProjectId}`,
      projectName: "Other counts",
      projectSlug: `other-counts-${otherProjectId}`
    });
  });
  afterAll(async () => {
    await pool.end();
    s3.destroy();
  });

  it("matches incident list filters and member visibility with actual PostgreSQL counts", async () => {
    for (const project of [projectId, otherProjectId]) {
      for (const environment of ["production", "production", "staging"]) {
        await pool.query(
          `INSERT INTO incidents
          (id, project_id, environment, fingerprint, title, severity, first_seen_at, last_seen_at)
          VALUES ($1::uuid, $2, $3, $1::text, 'Count incident', 'high', $4, $4)`,
          [randomUUID(), project, environment, occurredAt]
        );
      }
    }
    const filters = {
      organization_id: organizationId,
      user_id: ownerUserId,
      environment: "production",
      severity: "high" as const,
      status: "active" as const,
      attention_after: occurredAt
    };
    const list = await createPostgresMetadataStore(db).listIncidentsForOrganization({
      ...filters,
      limit: 100
    });
    expect(list).toHaveLength(2);
    expect(await countIncidentsForOrganization(db, filters)).toBe(list.length);
    expect(
      await countIncidentsForOrganization(db, { ...filters, project_id: otherProjectId })
    ).toBe(0);
  });

  it("counts only visible improvement bundles and applies the same effective status as the list", async () => {
    const store = createPostgresImprovementOpportunityStore(db);
    for (const [index, environment] of ["production", "production", "staging"].entries()) {
      const eventId = randomUUID();
      const recorded = await store.recordWarningHotspot({
        project_id: projectId,
        service_name: "api",
        environment,
        normalized_message: `Warning ${index}`,
        severity: "medium",
        confidence: 0.8,
        threshold: 1,
        occurred_at: occurredAt,
        source_event_id: eventId
      });
      await store.reserveImprovementBundleGeneration({
        opportunity_id: recorded!.opportunity_id,
        event_id: eventId,
        occurred_at: occurredAt,
        trigger: "occurrence_threshold"
      });
    }
    const filters = {
      organization_id: organizationId,
      user_id: ownerUserId,
      environment: "production",
      status: "open" as const,
      kind: "warning_hotspot" as const
    };
    const list = await store.listImprovementsForOrganization({ ...filters, limit: 100 });
    expect(list).toHaveLength(2);
    expect(await countImprovementsForOrganization(db, filters)).toBe(list.length);
    expect(
      await countImprovementsForOrganization(db, { ...filters, project_id: otherProjectId })
    ).toBe(0);
  });

  it("counts analytics before LIMIT, respects project scope, and keeps legacy responses unchanged", async () => {
    const opportunities = createPostgresAnalyticsOpportunityStore(db);
    const bundles = createPostgresAnalyticsBundleGenerationStore(db);
    for (const project of [projectId, otherProjectId]) {
      for (let index = 0; index < 3; index += 1) {
        await upsertAnalyticsOpportunity(db, {
          projectId: project,
          service: "web",
          environment: "production",
          kind: "funnel_dropoff",
          severity: "medium",
          confidence: 0.8,
          fingerprint: `count-${project}-${index}`,
          title: "Dropoff",
          summary: "Dropoff count",
          evidence: {},
          detectedAt: occurredAt
        });
        await bundles.reserveAnalyticsBundleGeneration({
          project_id: project,
          analysis_kind: "funnel_dropoff",
          analysis_spec: { funnel: `count-${index}` }
        });
      }
    }
    const filters = {
      organization_id: organizationId,
      project_id: projectId,
      limit: 2,
      include_total: true
    };
    const opportunityPage = await opportunities.listAnalyticsOpportunitiesForProject(filters);
    expect(opportunityPage.opportunities).toHaveLength(2);
    expect(opportunityPage.total_pages).toBe(2);
    expect(
      (await opportunities.listAnalyticsOpportunitiesForOrganization(filters)).total_pages
    ).toBe(2);
    expect((await bundles.listAnalyticsBundleGenerationsForProject(filters)).total_pages).toBe(2);
    expect(
      (await bundles.listAnalyticsBundleGenerationsForOrganization!(filters)).total_pages
    ).toBe(2);
    expect(
      await opportunities.listAnalyticsOpportunitiesForProject({ ...filters, include_total: false })
    ).not.toHaveProperty("total_pages");
    expect(
      await bundles.listAnalyticsBundleGenerationsForProject({ ...filters, include_total: false })
    ).not.toHaveProperty("total_pages");
  });
});
