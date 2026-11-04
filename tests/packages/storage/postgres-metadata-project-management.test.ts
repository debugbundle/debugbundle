import { projectDeletionControlRows } from "../../helpers/project-deletion.js";
import { describe, expect, it, vi } from "vitest";
import {
  createPostgresAccountAnalyticsStore,
  createPostgresMetadataStore,
  type Queryable
} from "../../../packages/storage/src/index.js";
import { createPgError } from "../../helpers/fake-pg-error.ts";

describe("postgres metadata project-management", () => {
  it("should source project plans from the organization plan across project record mutations", async (): Promise<void> => {
    const calls: string[] = [];
    const query = vi.fn().mockImplementation((sql: string) => {
      calls.push(sql);
      const control = projectDeletionControlRows(sql);
      if (control) return control;

      if (sql.includes("WITH created_project AS")) {
        return {
          rows: [
            {
              project_id: "proj_created",
              organization_id: "org_123",
              name: "Created App",
              slug: "created-app",
              environment_default: "production",
              organization_plan: "team",
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
              },
              created_at: "2026-03-16T00:00:00.000Z",
              updated_at: "2026-03-16T00:00:00.000Z"
            }
          ]
        };
      }

      if (sql.includes("WITH updated_project AS")) {
        return {
          rows: [
            {
              project_id: "proj_123",
              organization_id: "org_123",
              name: "Updated App",
              slug: "updated-app",
              environment_default: "staging",
              organization_plan: "team",
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
              },
              created_at: "2026-03-16T00:00:00.000Z",
              updated_at: "2026-03-18T00:00:00.000Z"
            }
          ]
        };
      }

      if (sql.includes("WITH deleted_project AS")) {
        return {
          rows: [
            {
              project_id: "proj_123",
              organization_id: "org_123",
              name: "Deleted App",
              slug: "deleted-app",
              environment_default: "production",
              organization_plan: "team",
              created_at: "2026-03-16T00:00:00.000Z",
              updated_at: "2026-03-18T00:00:00.000Z"
            }
          ]
        };
      }

      if (sql.includes("FROM account_analytics_accounts")) {
        return { rows: [{ analytics_account_id: "analytics_123" }] };
      }

      if (sql.includes("INSERT INTO account_metric_events")) {
        return { rows: [{ dedupe_key_hash: "hash_123" }] };
      }

      if (sql.includes("INSERT INTO account_metric_periods")) {
        return { rows: [] };
      }

      if (sql.includes("to_regclass")) {
        return { rows: [{ exists: false }] };
      }

      return { rows: [] };
    });

    const transactionalDb: Queryable = {
      query,
      transaction: async <Result>(callback: (tx: Queryable) => Promise<Result>) =>
        callback({ query } as Queryable)
    };
    const accountAnalyticsStore = createPostgresAccountAnalyticsStore({
      db: transactionalDb,
      analyticsHashSecret: "test-analytics-secret"
    });
    const store = createPostgresMetadataStore(transactionalDb, { accountAnalyticsStore });

    await store.createProjectForOrganization({
      organization_id: "org_123",
      name: "Created App",
      slug: "created-app",
      environment_default: "production"
    });
    await store.updateProjectForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      name: "Updated App"
    });
    await store.deleteProjectForOrganization({
      organization_id: "org_123",
      project_id: "proj_123"
    });

    const createSql = calls.find((sql) => sql.includes("WITH created_project AS"));
    const updateSql = calls.find((sql) => sql.includes("WITH updated_project AS"));
    const deleteSql = calls.find((sql) => sql.includes("WITH deleted_project AS"));

    expect(createSql).toContain("JOIN organizations o ON o.id = cp.organization_id");
    expect(createSql).toContain("COALESCE(o.plan, 'free') AS organization_plan");
    expect(createSql).toContain("INSERT INTO weekly_report_channels");
    expect(createSql).toContain("jsonb_build_object('to', jsonb_build_array(owner_user.email))");

    expect(updateSql).toContain("JOIN organizations o ON o.id = up.organization_id");
    expect(updateSql).toContain("COALESCE(o.plan, 'free') AS organization_plan");

    expect(deleteSql).toContain("JOIN organizations o ON o.id = dp.organization_id");
    expect(deleteSql).toContain("COALESCE(o.plan, 'free') AS organization_plan");
    expect(calls).toContainEqual(expect.stringContaining("FROM account_analytics_accounts"));
    expect(calls).toContainEqual(expect.stringContaining("INSERT INTO account_metric_periods"));
  });

  it("should create projects for an organization and map duplicate slug conflicts", async (): Promise<void> => {
    const createdQuery = vi.fn().mockResolvedValue({
      rows: [
        {
          project_id: "proj_123",
          organization_id: "org_123",
          name: "Main App",
          slug: "main-app",
          environment_default: "production",
          organization_plan: "free",
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
          },
          created_at: "2026-03-16T00:00:00.000Z",
          updated_at: "2026-03-16T00:00:00.000Z"
        }
      ]
    });
    const duplicateQuery = vi
      .fn()
      .mockRejectedValue(createPgError("23505", "projects_organization_id_slug_key"));

    const createdStore = createPostgresMetadataStore({ query: createdQuery });
    const duplicateStore = createPostgresMetadataStore({ query: duplicateQuery });

    const created = await createdStore.createProjectForOrganization({
      organization_id: "org_123",
      name: "Main App",
      slug: "main-app",
      environment_default: "production"
    });
    const duplicate = await duplicateStore.createProjectForOrganization({
      organization_id: "org_123",
      name: "Main App",
      slug: "main-app",
      environment_default: "production"
    });
    expect(created).toEqual({
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
        open_incidents: 0,
        regressed_incidents: 0,
        attention_incidents_today: 0,
        opened_incidents_today: 0,
        opened_incidents_month: 0,
        monthly_bundle_requests: 0,
        monthly_raw_ingested_events: 0,
        retained_bundles: 0,
        monthly_alert_deliveries: 0
      },
      created_at: "2026-03-16T00:00:00.000Z",
      updated_at: "2026-03-16T00:00:00.000Z"
    });
    expect(duplicate).toBeNull();
    expect(createdQuery).toHaveBeenCalledWith(
      expect.not.stringContaining("COUNT(*)::int"),
      expect.any(Array)
    );
  });

  it("should update projects for an organization and map duplicate slug conflicts", async (): Promise<void> => {
    const updatedQuery = vi.fn().mockResolvedValue({
      rows: [
        {
          project_id: "proj_123",
          organization_id: "org_123",
          name: "Main App API",
          slug: "main-app-api",
          environment_default: "staging",
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
          updated_at: "2026-03-18T00:00:00.000Z"
        }
      ]
    });
    const duplicateQuery = vi
      .fn()
      .mockRejectedValue(createPgError("23505", "projects_organization_id_slug_key"));

    const updatedStore = createPostgresMetadataStore({ query: updatedQuery });
    const duplicateStore = createPostgresMetadataStore({ query: duplicateQuery });

    const updated = await updatedStore.updateProjectForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      name: "Main App API",
      slug: "main-app-api",
      environment_default: "staging"
    });
    const duplicate = await duplicateStore.updateProjectForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      slug: "main-app-api"
    });

    expect(updated).toEqual({
      project_id: "proj_123",
      organization_id: "org_123",
      name: "Main App API",
      slug: "main-app-api",
      environment_default: "staging",
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
      updated_at: "2026-03-18T00:00:00.000Z"
    });
    expect(duplicate).toBe("slug_taken");
    const updateSql = updatedQuery.mock.calls
      .map((call) => String(call[0]))
      .find((sql) => sql.includes("WITH updated_project AS"));
    expect(updateSql).toContain("FROM project_usage_counters");
  });

  it("should scope alert delivery metrics to the updated project in user-scoped project updates", async (): Promise<void> => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const query = vi.fn().mockImplementation((sql: string, params: unknown[]) => {
      calls.push({ sql, params });

      if (sql.includes("information_schema.tables")) {
        return { rows: [{ exists: true }] };
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
            name: "Main App API",
            slug: "main-app-api",
            environment_default: "development",
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
            updated_at: "2026-03-18T00:00:00.000Z"
          }
        ]
      };
    });

    const store = createPostgresMetadataStore({ query });

    const updated = await store.updateProjectForUser!({
      user_id: "usr_123",
      project_id: "proj_123",
      environment_default: "development"
    });

    expect(updated).toEqual({
      project_id: "proj_123",
      organization_id: "org_123",
      owner_user_id: "usr_123",
      owner_email: "owen@example.com",
      relationship: "owned",
      effective_role: "owner",
      shared_access_suspended: false,
      sharing_state: undefined,
      name: "Main App API",
      slug: "main-app-api",
      environment_default: "development",
      color_tag: null,
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
      updated_at: "2026-03-18T00:00:00.000Z"
    });

    const updateCall = calls.find((call) => call.sql.includes("WITH updated_project AS"));

    expect(updateCall).toBeDefined();
    expect(updateCall?.sql).toContain("WHERE ad.project_id = up.project_id");
    expect(updateCall?.sql).toContain("FROM project_usage_counters");
    expect(updateCall?.sql).not.toContain("WHERE ad.project_id = projects.id");
  });

  it("should delete projects for an organization and map missing projects", async (): Promise<void> => {
    const deletedQuery = vi.fn(
      async (sql: string) =>
        projectDeletionControlRows(sql) ?? {
          rows: [
            {
              project_id: "proj_123",
              organization_id: "org_123",
              name: "Main App",
              slug: "main-app",
              environment_default: "production",
              organization_plan: "free",
              created_at: "2026-03-16T00:00:00.000Z",
              updated_at: "2026-03-16T00:00:00.000Z"
            }
          ]
        }
    );
    const missingQuery = vi.fn().mockResolvedValue({ rows: [] });

    const deletedStore = createPostgresMetadataStore({ query: deletedQuery as Queryable["query"] });
    const missingStore = createPostgresMetadataStore({ query: missingQuery });

    const deleted = await deletedStore.deleteProjectForOrganization({
      organization_id: "org_123",
      project_id: "proj_123"
    });
    const missing = await missingStore.deleteProjectForOrganization({
      organization_id: "org_123",
      project_id: "proj_missing"
    });

    expect(deleted).toEqual({
      project_id: "proj_123",
      storage_origin_ids: ["proj_123"],
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
      created_at: "2026-03-16T00:00:00.000Z",
      updated_at: "2026-03-16T00:00:00.000Z"
    });
    expect(missing).toBeNull();
  });

  it("should list organization-scoped services for a project", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: "proj_123" }]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            service_id: "svc_123",
            project_id: "proj_123",
            name: "checkout-api",
            runtime: "node",
            framework: "fastify",
            environment: "production"
          }
        ]
      });

    const store = createPostgresMetadataStore({ query });

    const services = await store.listServicesForOrganization!({
      organization_id: "org_123",
      project_id: "proj_123",
      limit: 10
    });

    expect(services).toEqual([
      {
        service_id: "svc_123",
        project_id: "proj_123",
        name: "checkout-api",
        runtime: "node",
        framework: "fastify",
        environment: "production"
      }
    ]);
  });

  it("should return null when listing services for an out-of-scope project", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createPostgresMetadataStore({ query });

    const services = await store.listServicesForOrganization!({
      organization_id: "org_123",
      project_id: "proj_missing",
      limit: 10
    });

    expect(services).toBeNull();
  });
});
