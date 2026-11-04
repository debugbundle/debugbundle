import { describe, expect, it, vi } from "vitest";
import { createPostgresMetadataStore } from "../../../packages/storage/src/index.js";

describe("postgres metadata project-metrics", () => {
  it("should list projects for an organization", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          project_id: "proj_123",
          organization_id: "org_123",
          name: "Main App",
          slug: "main-app",
          environment_default: "production",
          organization_plan: "free",
          metrics: {
            open_incidents: 5,
            regressed_incidents: 1,
            attention_incidents_today: 2,
            opened_incidents_today: 2,
            opened_incidents_month: 7,
            monthly_bundle_requests: 12,
            monthly_raw_ingested_events: 120,
            retained_bundles: 6,
            monthly_alert_deliveries: 4
          },
          created_at: "2026-03-16T00:00:00.000Z",
          updated_at: "2026-03-16T00:00:00.000Z"
        }
      ]
    });
    const store = createPostgresMetadataStore({ query });

    const projects = await store.listProjectsForOrganization({
      organization_id: "org_123",
      now: "2026-03-19T00:00:00.000Z",
      limit: 10
    });

    expect(projects).toEqual([
      {
        project_id: "proj_123",
        organization_id: "org_123",
        name: "Main App",
        slug: "main-app",
        environment_default: "production",
        color_tag: null,
        organization_plan: "free",
        owner_user_id: undefined,
        owner_email: undefined,
        relationship: undefined,
        effective_role: undefined,
        shared_access_suspended: false,
        sharing_state: undefined,
        metrics: {
          open_incidents: 5,
          regressed_incidents: 1,
          attention_incidents_today: 2,
          opened_incidents_today: 2,
          opened_incidents_month: 7,
          monthly_bundle_requests: 12,
          monthly_raw_ingested_events: 120,
          retained_bundles: 6,
          monthly_alert_deliveries: 4
        },
        created_at: "2026-03-16T00:00:00.000Z",
        updated_at: "2026-03-16T00:00:00.000Z"
      }
    ]);
  });

  it("should use the billing-aligned ingested events predicate in project metrics", async (): Promise<void> => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const query = vi.fn().mockImplementation((sql: string, params: unknown[]) => {
      calls.push({ sql, params });

      if (sql.includes("to_regclass")) {
        return { rows: [{ exists: false }] };
      }

      return {
        rows: [
          {
            project_id: "proj_123",
            organization_id: "org_123",
            name: "Main App",
            slug: "main-app",
            environment_default: "production",
            organization_plan: "free",
            metrics: {
              open_incidents: 5,
              regressed_incidents: 1,
              attention_incidents_today: 2,
              opened_incidents_today: 2,
              opened_incidents_month: 7,
              monthly_bundle_requests: 12,
              monthly_raw_ingested_events: 120,
              retained_bundles: 6,
              monthly_alert_deliveries: 4
            },
            created_at: "2026-03-16T00:00:00.000Z",
            updated_at: "2026-03-16T00:00:00.000Z"
          }
        ]
      };
    });
    const store = createPostgresMetadataStore({ query });

    await store.listProjectsForOrganization({
      organization_id: "org_123",
      now: "2026-03-19T00:00:00.000Z",
      limit: 10
    });

    const listProjectsCall = calls.find((call) => call.sql.includes("FROM projects p"));
    expect(listProjectsCall).toBeDefined();
    expect(listProjectsCall!.sql).toContain("ie.event_class = 'incident_signal'");
    expect(listProjectsCall!.sql).toContain("GREATEST");
    expect(listProjectsCall!.sql).toContain("FROM project_usage_counters");
    expect(listProjectsCall!.sql).toContain("'open_incidents'");
    expect(listProjectsCall!.sql).toContain("'opened_incidents_today'");
    expect(listProjectsCall!.sql).toContain("JOIN organizations o ON o.id = p.organization_id");
    expect(listProjectsCall!.sql).toContain("COALESCE(o.plan, 'free') AS organization_plan");
  });

  it("should count open incidents separately from regressed incidents in project metrics", async (): Promise<void> => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const query = vi.fn().mockImplementation((sql: string, params: unknown[]) => {
      calls.push({ sql, params });

      if (sql.includes("to_regclass")) {
        return { rows: [{ exists: false }] };
      }

      return {
        rows: [
          {
            project_id: "proj_123",
            organization_id: "org_123",
            owner_user_id: "usr_123",
            owner_email: "owen@example.com",
            relationship: "owned",
            effective_role: "owner",
            name: "Main App",
            slug: "main-app",
            environment_default: "production",
            organization_plan: "free",
            metrics: {
              open_incidents: 5,
              regressed_incidents: 1,
              attention_incidents_today: 2,
              opened_incidents_today: 2,
              opened_incidents_month: 7,
              monthly_bundle_requests: 12,
              monthly_raw_ingested_events: 120,
              retained_bundles: 6,
              monthly_alert_deliveries: 4
            },
            created_at: "2026-03-16T00:00:00.000Z",
            updated_at: "2026-03-16T00:00:00.000Z"
          }
        ]
      };
    });
    const store = createPostgresMetadataStore({ query });

    await store.listProjectsForUser!({
      user_id: "usr_123",
      now: "2026-03-19T00:00:00.000Z",
      limit: 10
    });

    const listProjectsCall = calls.find((call) => call.sql.includes("FROM projects p"));
    expect(listProjectsCall).toBeDefined();
    expect(listProjectsCall!.sql).toContain("'open_incidents'");
    expect(listProjectsCall!.sql).toContain("AND i.status = 'open'");
    expect(listProjectsCall!.sql).toContain("'regressed_incidents'");
    expect(listProjectsCall!.sql).toContain("AND i.status = 'regressed'");
    expect(listProjectsCall!.sql).not.toContain("AND i.status <> 'resolved'");
  });

  it("should floor user-scoped project ingested events with durable project counters", async (): Promise<void> => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const query = vi.fn().mockImplementation((sql: string, params: unknown[]) => {
      calls.push({ sql, params });

      if (sql.includes("information_schema.tables")) {
        return { rows: [{ exists: false }] };
      }

      return {
        rows: [
          {
            project_id: "proj_123",
            organization_id: "org_123",
            owner_user_id: "usr_123",
            owner_email: "owen@example.com",
            relationship: "owned",
            effective_role: "owner",
            name: "Main App",
            slug: "main-app",
            environment_default: "production",
            organization_plan: "free",
            metrics: {
              open_incidents: 5,
              regressed_incidents: 1,
              attention_incidents_today: 2,
              opened_incidents_today: 2,
              opened_incidents_month: 7,
              monthly_bundle_requests: 12,
              monthly_raw_ingested_events: 120,
              retained_bundles: 6,
              monthly_alert_deliveries: 4
            },
            created_at: "2026-03-16T00:00:00.000Z",
            updated_at: "2026-03-16T00:00:00.000Z"
          }
        ]
      };
    });
    const store = createPostgresMetadataStore({ query });

    await store.listProjectsForUser!({
      user_id: "usr_123",
      now: "2026-03-19T00:00:00.000Z",
      limit: 10
    });

    const listProjectsCall = calls.find((call) => call.sql.includes("FROM projects p"));
    expect(listProjectsCall).toBeDefined();
    expect(listProjectsCall!.sql).toContain("GREATEST");
    expect(listProjectsCall!.sql).toContain("FROM project_usage_counters");
  });

  it("normalizes empty project metrics when the alert deliveries table exists", async (): Promise<void> => {
    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("information_schema.tables")) {
        return { rows: [{ exists: "t" }] };
      }

      return {
        rows: [
          {
            project_id: "proj_123",
            organization_id: "org_123",
            name: "Main App",
            slug: "main-app",
            environment_default: "production",
            organization_plan: "solo",
            metrics: null,
            created_at: "2026-03-16T00:00:00.000Z",
            updated_at: "2026-03-16T00:00:00.000Z"
          }
        ]
      };
    });
    const store = createPostgresMetadataStore({ query });

    const projects = await store.listProjectsForOrganization({
      organization_id: "org_123",
      now: "2026-03-19T00:00:00.000Z",
      limit: 10
    });

    expect(projects).toEqual([
      expect.objectContaining({
        project_id: "proj_123",
        organization_plan: "solo",
        metrics: {
          open_incidents: 0,
          regressed_incidents: 0,
          attention_incidents_today: 0,
          opened_incidents_today: 0,
          opened_incidents_month: 0,
          monthly_bundle_requests: 0,
          monthly_raw_ingested_events: 0,
          retained_bundles: 0,
          monthly_alert_deliveries: 0
        }
      })
    ]);
  });
});
