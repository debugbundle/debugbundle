import { describe, expect, it, vi } from "vitest";

import {
  createPostgresAccountAnalyticsStore,
  createPostgresWebhookDeliveryStore,
  createPostgresMetadataStore,
  type Queryable
} from "../../../packages/storage/src/index.js";
import { createPgError } from "../../helpers/fake-pg-error.ts";

describe("postgres metadata store", () => {
  it("should resolve project by token hash", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [{ project_id: "proj_123", organization_id: "org_123", revoked_at: null, expires_at: null }] });
    const db: Queryable = { query };

    const store = createPostgresMetadataStore(db);
    const resolved = await store.resolveProjectByTokenHash("hash_abc");

    expect(resolved).toEqual({ project_id: "proj_123", organization_id: "org_123", revoked_at: null, expires_at: null });
    expect(query).toHaveBeenCalledOnce();
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("o.suspended_at IS NULL");
  });

  it("should return null when token hash is unknown", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db: Queryable = { query };

    const store = createPostgresMetadataStore(db);
    const resolved = await store.resolveProjectByTokenHash("missing_hash");

    expect(resolved).toBeNull();
  });

  it("should resolve project plan from token hash", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ project_id: "proj_123", organization_id: "org_123", organization_plan: "solo", revoked_at: null, expires_at: null }]
    });
    const db: Queryable = {
      query: query as Queryable["query"],
      transaction: async <Result>(callback: (tx: Queryable) => Promise<Result>) =>
        callback({ query: query as Queryable["query"] })
    };
    const store = createPostgresMetadataStore(db);

    const resolved = await store.resolveProjectByTokenHash("hash_abc");

    expect(resolved).toEqual({ project_id: "proj_123", organization_id: "org_123", organization_plan: "solo", revoked_at: null, expires_at: null });
  });

  it("should resolve member by member token hash", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValue({
        rows: [{ member_id: "mem_123", organization_id: "org_123", role: "owner", revoked_at: null, expires_at: null }]
      });
    const db: Queryable = { query };

    const store = createPostgresMetadataStore(db);
    const resolved = await store.resolveMemberByTokenHash("hash_member");

    expect(resolved).toEqual({
      member_id: "mem_123",
      organization_id: "org_123",
      role: "owner",
      revoked_at: null,
      expires_at: null
    });
    expect(query).toHaveBeenCalledOnce();
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("om.suspended_at IS NULL");
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("org.suspended_at IS NULL");
  });

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

  it("should source project plans from the organization plan across project record mutations", async (): Promise<void> => {
    const calls: string[] = [];
    const query = vi.fn().mockImplementation((sql: string) => {
      calls.push(sql);

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
    const duplicateQuery = vi.fn().mockRejectedValue(createPgError("23505", "projects_organization_id_slug_key"));

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
    expect(createdQuery).toHaveBeenCalledWith(expect.not.stringContaining("COUNT(*)::int"), expect.any(Array));
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
    const duplicateQuery = vi.fn().mockRejectedValue(createPgError("23505", "projects_organization_id_slug_key"));

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
    const deletedQuery = vi.fn().mockResolvedValue({
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
    });
    const missingQuery = vi.fn().mockResolvedValue({ rows: [] });

    const deletedStore = createPostgresMetadataStore({ query: deletedQuery });
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

  it("should use existing service id when available", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "svc_existing" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ incident_id: "inc_123", matched_fields: [], status: "open", regressed_now: false }] });

    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    await store.upsertIncident({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError at /checkout",
      severity: "high",
      occurred_at: "2026-03-10T00:00:00.000Z"
    });

    expect(query).toHaveBeenCalledTimes(3);
  });

  it("should upsert incident using service lookup and linkage", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "svc_123" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ incident_id: "inc_123", matched_fields: ["normalized_message"], status: "open", regressed_now: false }]
      });

    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    const result = await store.upsertIncident({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError at /checkout",
      severity: "high",
      occurred_at: "2026-03-10T00:00:00.000Z"
    });

    expect(result.incident_id).toBe("inc_123");
    expect(query).toHaveBeenCalledTimes(4);
  });

  it("should insert incident event linkage", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db: Queryable = { query };

    const store = createPostgresMetadataStore(db);

    await store.insertIncidentEvent({
      incident_id: "inc_123",
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      event_type: "backend_exception",
      occurred_at: "2026-03-10T00:00:00.000Z",
      is_sampled: true,
      level: null
    });

    expect(query).toHaveBeenCalledOnce();
  });

  it("should list alerts for an in-scope project", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "proj_123" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            alert_id: "alt_123",
            project_id: "proj_123",
            created_by_user_id: "usr_123",
            service_id: null,
            channel: "email",
            condition_type: "new_incident",
            severity_min: null,
            cooldown_seconds: 0,
            config: { to: "owner@example.com" },
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ]
      });
    const store = createPostgresMetadataStore({ query });

    const alerts = await store.listAlertsForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      limit: 10
    });

    expect(alerts).toEqual([
      {
        alert_id: "alt_123",
        project_id: "proj_123",
        created_by_user_id: "usr_123",
        service_id: null,
        channel: "email",
        condition_type: "new_incident",
        severity_min: null,
        cooldown_seconds: 0,
        config: { to: "owner@example.com" },
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      }
    ]);
  });

  it("should filter active incident lists to open and regressed incidents", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createPostgresMetadataStore({ query });

    await store.listIncidentsForOrganization({
      organization_id: "org_123",
      status: "active",
      limit: 20
    });

    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("i.status IN ('open', 'regressed')");
    expect(query.mock.calls[0]?.[1]).toEqual(["org_123", null, 20]);
  });

  it("should create, update, and delete a scoped alert", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "proj_123" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            alert_id: "alt_123",
            project_id: "proj_123",
            created_by_user_id: "usr_123",
            service_id: null,
            channel: "email",
            condition_type: "new_incident",
            severity_min: null,
            cooldown_seconds: 0,
            config: { to: "owner@example.com" },
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            alert_id: "alt_123",
            project_id: "proj_123",
            created_by_user_id: "usr_123",
            service_id: "svc_123",
            channel: "webhook",
            condition_type: "severity_threshold",
            severity_min: "high",
            cooldown_seconds: 0,
            config: { target_url: "https://hooks.example.test/alerts" },
            is_enabled: false,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:05:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ alert_id: "alt_123" }] });
    const store = createPostgresMetadataStore({ query });

    const created = await store.createAlertForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      created_by_user_id: "usr_123",
      channel: "email",
      condition_type: "new_incident",
      cooldown_seconds: 0,
      config: { to: "owner@example.com" },
      is_enabled: true
    });
    const updated = await store.updateAlertForOrganization({
      organization_id: "org_123",
      alert_id: "alt_123",
      channel: "webhook",
      condition_type: "severity_threshold",
      service_id: "svc_123",
      severity_min: "high",
      cooldown_seconds: 0,
      config: { target_url: "https://hooks.example.test/alerts" },
      is_enabled: false
    });
    const deleted = await store.deleteAlertForOrganization({
      organization_id: "org_123",
      alert_id: "alt_123"
    });

    expect(created).toEqual({
      alert_id: "alt_123",
      project_id: "proj_123",
      created_by_user_id: "usr_123",
      service_id: null,
      channel: "email",
      condition_type: "new_incident",
      severity_min: null,
      cooldown_seconds: 0,
      config: { to: "owner@example.com" },
      is_enabled: true,
      created_at: "2026-03-15T00:00:00.000Z",
      updated_at: "2026-03-15T00:00:00.000Z"
    });
    expect(updated).toEqual({
      alert_id: "alt_123",
      project_id: "proj_123",
      created_by_user_id: "usr_123",
      service_id: "svc_123",
      channel: "webhook",
      condition_type: "severity_threshold",
      severity_min: "high",
      cooldown_seconds: 0,
      config: { target_url: "https://hooks.example.test/alerts" },
      is_enabled: false,
      created_at: "2026-03-15T00:00:00.000Z",
      updated_at: "2026-03-15T00:05:00.000Z"
    });
    expect(deleted).toEqual({ alert_id: "alt_123" });
  });

  it("returns null for alert operations when the project scope check fails", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const store = createPostgresMetadataStore({ query });

    const listed = await store.listAlertsForOrganization({
      organization_id: "org_123",
      project_id: "proj_missing",
      limit: 10
    });
    const created = await store.createAlertForOrganization({
      organization_id: "org_123",
      project_id: "proj_missing",
      created_by_user_id: "usr_123",
      service_id: "svc_123",
      channel: "email",
      condition_type: "new_incident",
      cooldown_seconds: 0,
      config: { to: "owner@example.com" },
      is_enabled: true
    });

    expect(listed).toBeNull();
    expect(created).toBeNull();
  });

  it("omits optional alert update fields when they are not provided", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          alert_id: "alt_456",
          project_id: "proj_123",
          created_by_user_id: "usr_123",
          service_id: null,
          channel: "email",
          condition_type: "new_incident",
          severity_min: null,
          cooldown_seconds: 0,
          config: {},
          is_enabled: true,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:10:00.000Z"
        }
      ]
    });
    const store = createPostgresMetadataStore({ query });

    const updated = await store.updateAlertForOrganization({
      organization_id: "org_123",
      alert_id: "alt_456",
      channel: "email",
      condition_type: "new_incident",
      is_enabled: true
    });

    expect(updated).toEqual({
      alert_id: "alt_456",
      project_id: "proj_123",
      created_by_user_id: "usr_123",
      service_id: null,
      channel: "email",
      condition_type: "new_incident",
      severity_min: null,
      cooldown_seconds: 0,
      config: {},
      is_enabled: true,
      created_at: "2026-03-15T00:00:00.000Z",
      updated_at: "2026-03-15T00:10:00.000Z"
    });
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      "alt_456",
      "org_123",
      false,
      null,
      "email",
      "new_incident",
      false,
      null,
      false,
      0,
      false,
      null,
      true,
      null,
      null,
      null
    ]);
  });

  it("should list and create scoped project tokens", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "proj_123" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            token_id: "11111111-1111-4111-8111-111111111111",
            project_id: "proj_123",
            label: "ci",
            created_at: "2026-03-11T00:00:00.000Z",
            last_used_at: null,
            revoked_at: null,
            expires_at: null
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ id: "proj_123" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            token_id: "22222222-2222-4222-8222-222222222222",
            project_id: "proj_123",
            label: "agent",
            created_at: "2026-03-11T00:00:00.000Z",
            last_used_at: null,
            revoked_at: null,
            expires_at: null
          }
        ]
      });

    const store = createPostgresMetadataStore({ query });

    const listed = await store.listProjectTokensForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      limit: 20
    });
    const created = await store.createProjectTokenForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      label: "agent",
      allowed_origins: ["https://static.example.com"],
      token_hash: "hash_abc"
    });

    expect(listed).not.toBeNull();
    expect(listed?.[0]?.token_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(created?.token_id).toBe("22222222-2222-4222-8222-222222222222");
    expect(String(query.mock.calls[1]?.[0] ?? "")).toContain("AND revoked_at IS NULL");
  });

  it("should return null for out-of-scope project token operations", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createPostgresMetadataStore({ query });

    const listed = await store.listProjectTokensForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      limit: 20
    });
    const created = await store.createProjectTokenForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      label: "ci",
      allowed_origins: [],
      token_hash: "hash_abc"
    });

    expect(listed).toBeNull();
    expect(created).toBeNull();
  });

  it("should revoke scoped project/member tokens and list member tokens", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            token_id: "11111111-1111-4111-8111-111111111111",
            project_id: "proj_123",
            label: "ci",
            created_at: "2026-03-11T00:00:00.000Z",
            last_used_at: null,
            revoked_at: "2026-03-11T01:00:00.000Z",
            expires_at: null
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            token_id: "33333333-3333-4333-8333-333333333333",
            user_id: "usr_123",
            organization_id: "org_123",
            label: "cli",
            created_at: "2026-03-11T00:00:00.000Z",
            last_used_at: null,
            revoked_at: null,
            expires_at: null
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            token_id: "33333333-3333-4333-8333-333333333333",
            user_id: "usr_123",
            organization_id: "org_123",
            label: "cli",
            created_at: "2026-03-11T00:00:00.000Z",
            last_used_at: null,
            revoked_at: null,
            expires_at: null
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            token_id: "33333333-3333-4333-8333-333333333333",
            user_id: "usr_123",
            organization_id: "org_123",
            label: "cli",
            created_at: "2026-03-11T00:00:00.000Z",
            last_used_at: null,
            revoked_at: "2026-03-11T01:00:00.000Z",
            expires_at: null
          }
        ]
      });

    const store = createPostgresMetadataStore({ query });

    const revokedProject = await store.revokeProjectTokenForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      token_id: "11111111-1111-4111-8111-111111111111",
      revoked_at: "2026-03-11T01:00:00.000Z"
    });
    const listedMember = await store.listMemberTokensForOrganization({
      organization_id: "org_123",
      user_id: "usr_123",
      limit: 20
    });
    const createdMember = await store.createMemberTokenForOrganization({
      organization_id: "org_123",
      user_id: "usr_123",
      label: "cli",
      token_hash: "hash_mem"
    });
    const revokedMember = await store.revokeMemberTokenForOrganization({
      organization_id: "org_123",
      user_id: "usr_123",
      token_id: "33333333-3333-4333-8333-333333333333",
      revoked_at: "2026-03-11T01:00:00.000Z"
    });

    expect(revokedProject?.revoked_at).toBe("2026-03-11T01:00:00.000Z");
    expect(listedMember[0]?.token_id).toBe("33333333-3333-4333-8333-333333333333");
    expect(createdMember.token_id).toBe("33333333-3333-4333-8333-333333333333");
    expect(revokedMember?.revoked_at).toBe("2026-03-11T01:00:00.000Z");
    expect(String(query.mock.calls[1]?.[0] ?? "")).toContain("AND revoked_at IS NULL");
  });

  it("should throw when member token insert returns no rows", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createPostgresMetadataStore({ query });

    await expect(
      store.createMemberTokenForOrganization({
        organization_id: "org_123",
        user_id: "usr_123",
        label: "cli",
        token_hash: "hash_mem"
      })
    ).rejects.toThrow("member_token_insert_failed");
  });

  it("should create/list/deactivate probe activations in organization scope", async (): Promise<void> => {
    const originalSecret = process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];
    process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = "test-probe-trigger-secret-for-storage";
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "proj_123", organization_plan: "solo" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            activation_id: "11111111-1111-4111-8111-111111111111",
            label_pattern: "checkout.*",
            service: "*",
            environment: "*",
            expires_at: "2026-03-11T01:00:00.000Z",
            trigger_expires_at: "2026-03-12T01:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ id: "proj_123", organization_plan: "solo" }] })
      .mockResolvedValueOnce({ rows: [{ cnt: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            activation_id: "11111111-1111-4111-8111-111111111111",
            label_pattern: "checkout.*",
            service: "*",
            environment: "*",
            expires_at: "2026-03-11T01:00:00.000Z",
            trigger_expires_at: "2026-03-12T01:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            organization_plan: "solo",
            activation_id: "11111111-1111-4111-8111-111111111111",
            deactivated_at: "2026-03-11T00:10:00.000Z"
          }
        ]
      });

    const db: Queryable = {
      query: query as Queryable["query"],
      transaction: async <Result>(callback: (tx: Queryable) => Promise<Result>) =>
        callback({ query: query as Queryable["query"] })
    };
    const store = createPostgresMetadataStore(db);

    const listed = await store.listActiveProbesForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      now: "2026-03-11T00:00:00.000Z"
    });
    const created = await store.createProbeActivationForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      created_by_member_id: "usr_123",
      label_pattern: "checkout.*",
      service: "*",
      environment: "*",
      expires_at: "2026-03-11T01:00:00.000Z",
      trigger_expires_at: "2026-03-12T01:00:00.000Z"
    });
    const deactivated = await store.deactivateProbeActivationForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      activation_id: "11111111-1111-4111-8111-111111111111",
      deactivated_at: "2026-03-11T00:10:00.000Z"
    });

    expect(listed).toEqual({
      organization_plan: "solo",
      activations: [
        {
          activation_id: "11111111-1111-4111-8111-111111111111",
          label_pattern: "checkout.*",
          service: "*",
          environment: "*",
          expires_at: "2026-03-11T01:00:00.000Z",
          trigger_expires_at: "2026-03-12T01:00:00.000Z"
        }
      ]
    });
    expect(created).not.toBeNull();
    if (created === null) {
      throw new Error("expected_probe_activation_create_result");
    }
    expect(created.organization_plan).toBe("solo");
    expect(created.activation.activation_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(created.trigger_token).toMatch(/^dbundle_probe_/);
    expect(query.mock.calls[4]?.[1]).toEqual([
      expect.any(String),
      "proj_123",
      "usr_123",
      "checkout.*",
      "*",
      "*",
      expect.stringMatching(/^[0-9a-f]{64}$/),
      "2026-03-12T01:00:00.000Z",
      "2026-03-11T01:00:00.000Z"
    ]);
    expect(deactivated).toEqual({
      organization_plan: "solo",
      deactivated: {
        activation_id: "11111111-1111-4111-8111-111111111111",
        deactivated_at: "2026-03-11T00:10:00.000Z"
      }
    });

    if (originalSecret === undefined) {
      delete process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];
    } else {
      process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = originalSecret;
    }
  });

  it("should list active probes for a project", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          activation_id: "11111111-1111-4111-8111-111111111111",
          label_pattern: "checkout.*",
          service: "*",
          environment: "*",
          expires_at: "2026-03-11T01:00:00.000Z",
          trigger_expires_at: "2026-03-12T01:00:00.000Z"
        }
      ]
    });
    const db: Queryable = { query: query as Queryable["query"] };
    const store = createPostgresMetadataStore(db);

    const activations = await store.listActiveProbesForProject({
      project_id: "proj_123",
      now: "2026-03-11T00:00:00.000Z"
    });

    expect(activations).toEqual([
      {
        activation_id: "11111111-1111-4111-8111-111111111111",
        label_pattern: "checkout.*",
        service: "*",
        environment: "*",
        expires_at: "2026-03-11T01:00:00.000Z",
        trigger_expires_at: "2026-03-12T01:00:00.000Z"
      }
    ]);
    expect(query).toHaveBeenCalledWith(expect.any(String), ["proj_123", "2026-03-11T00:00:00.000Z"]);
  });

  it("falls back to the free plan when a scoped probe query returns an unknown organization plan", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "proj_123", organization_plan: "enterprise" }] })
      .mockResolvedValueOnce({ rows: [] });
    const store = createPostgresMetadataStore({ query });

    const listed = await store.listActiveProbesForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      now: "2026-03-11T00:00:00.000Z"
    });

    expect(listed).toEqual({
      organization_plan: "free",
      activations: []
    });
  });

  it("should handle out-of-scope and insert-failure probe activation branches", async (): Promise<void> => {
    const originalSecret = process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];
    process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = "test-probe-trigger-secret-for-storage";
    const outOfScopeQuery = vi.fn().mockResolvedValue({ rows: [] });
    const outOfScopeDb: Queryable = {
      query: outOfScopeQuery as Queryable["query"],
      transaction: async <Result>(callback: (tx: Queryable) => Promise<Result>) =>
        callback({ query: outOfScopeQuery as Queryable["query"] })
    };
    const outOfScopeStore = createPostgresMetadataStore(outOfScopeDb);

    const listed = await outOfScopeStore.listActiveProbesForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      now: "2026-03-11T00:00:00.000Z"
    });
    const created = await outOfScopeStore.createProbeActivationForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      created_by_member_id: "usr_123",
      label_pattern: "checkout.*",
      service: "*",
      environment: "*",
      expires_at: "2026-03-11T01:00:00.000Z",
      trigger_expires_at: "2026-03-12T01:00:00.000Z"
    });
    const deactivated = await outOfScopeStore.deactivateProbeActivationForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      activation_id: "11111111-1111-4111-8111-111111111111",
      deactivated_at: "2026-03-11T00:10:00.000Z"
    });

    expect(listed).toBeNull();
    expect(created).toBeNull();
    expect(deactivated).toBeNull();

    const insertFailureQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "proj_123", organization_plan: "solo" }] })
      .mockResolvedValueOnce({ rows: [{ cnt: "0" }] })
      .mockResolvedValueOnce({ rows: [] });
    const insertFailureDb: Queryable = {
      query: insertFailureQuery as Queryable["query"],
      transaction: async <Result>(callback: (tx: Queryable) => Promise<Result>) =>
        callback({ query: insertFailureQuery as Queryable["query"] })
    };
    const insertFailureStore = createPostgresMetadataStore(insertFailureDb);

    await expect(
      insertFailureStore.createProbeActivationForProjectInOrganization({
        organization_id: "org_123",
        project_id: "proj_123",
        created_by_member_id: "usr_123",
        label_pattern: "checkout.*",
        service: "*",
        environment: "*",
        expires_at: "2026-03-11T01:00:00.000Z",
        trigger_expires_at: "2026-03-12T01:00:00.000Z"
      })
    ).rejects.toThrow("probe_activation_insert_failed");

    if (originalSecret === undefined) {
      delete process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];
    } else {
      process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = originalSecret;
    }
  });

  it("should report concurrent probe activation limits when the project is already saturated", async (): Promise<void> => {
    const originalSecret = process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];
    process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = "test-probe-trigger-secret-for-storage";
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "proj_123", organization_plan: "team" }] })
      .mockResolvedValueOnce({ rows: [{ cnt: "5" }] });
    const store = createPostgresMetadataStore({
      query,
      transaction: async <Result>(callback: (tx: Queryable) => Promise<Result>) =>
        callback({ query: query as Queryable["query"] })
    });

    const result = await store.createProbeActivationForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      created_by_member_id: "usr_123",
      label_pattern: "checkout.*",
      service: "*",
      environment: "*",
      expires_at: "2026-03-11T01:00:00.000Z",
      trigger_expires_at: "2026-03-12T01:00:00.000Z"
    });

    expect(result).toEqual({
      organization_plan: "team",
      activation: { activation_id: "", label_pattern: "", service: "", environment: "", expires_at: "", trigger_expires_at: "" },
      trigger_token: "",
      concurrent_limit_exceeded: true
    });

    if (originalSecret === undefined) {
      delete process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];
    } else {
      process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = originalSecret;
    }
  });

  it("should list incident logs with optional level and cursor filters", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          event_id: "550e8400-e29b-41d4-a716-446655440000",
          event_type: "log_event",
          occurred_at: "2026-03-10T00:00:00.000Z",
          is_sampled: true,
          level: "error"
        }
      ]
    });
    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    const logs = await store.listIncidentLogsForOrganization({
      organization_id: "org_123",
      incident_id: "inc_123",
      level: "error",
      cursor: {
        occurred_at: "2026-03-11T00:10:00.000Z",
        event_id: "550e8400-e29b-41d4-a716-446655440001"
      },
      limit: 10
    });

    expect(logs).toEqual([
      {
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        event_type: "log_event",
        occurred_at: "2026-03-10T00:00:00.000Z",
        is_sampled: true,
        level: "error"
      }
    ]);

    expect(query).toHaveBeenCalledWith(expect.any(String), [
      "inc_123",
      "org_123",
      "error",
      "2026-03-11T00:10:00.000Z",
      "550e8400-e29b-41d4-a716-446655440001",
      10,
      null
    ]);
  });

  it("should list incident logs without optional filters", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    const logs = await store.listIncidentLogsForOrganization({
      organization_id: "org_123",
      incident_id: "inc_123",
      limit: 5
    });

    expect(logs).toEqual([]);
    expect(query).toHaveBeenCalledWith(expect.any(String), ["inc_123", "org_123", null, null, null, 5, null]);
  });

  it("should throw when service creation does not return id", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    await expect(
      store.upsertIncident({
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        project_id: "proj_123",
        service_name: "checkout-api",
        environment: "production",
        fingerprint: "fp_123",
        fingerprint_version: "v1",
        title: "TypeError at /checkout",
        severity: "high",
        occurred_at: "2026-03-10T00:00:00.000Z"
      })
    ).rejects.toThrow("service_insert_failed");
  });

  it("should throw when incident upsert returns no rows", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "svc_123" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    await expect(
      store.upsertIncident({
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        project_id: "proj_123",
        service_name: "checkout-api",
        environment: "production",
        fingerprint: "fp_123",
        fingerprint_version: "v1",
        title: "TypeError at /checkout",
        severity: "high",
        occurred_at: "2026-03-10T00:00:00.000Z"
      })
    ).rejects.toThrow("incident_upsert_failed");
  });

  it("should surface regressed status when resolved incident is reopened", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "svc_123" }] })
      .mockResolvedValueOnce({ rows: [{ id: "inc_123", status: "resolved" }] })
      .mockResolvedValueOnce({ rows: [{ duplicate: false }] })
      .mockResolvedValueOnce({ rows: [{ has_event_type: true, has_request_event: false }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ incident_id: "inc_123", matched_fields: [], status: "regressed", regressed_now: true }] });

    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    const result = await store.upsertIncident({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError at /checkout",
      severity: "high",
      occurred_at: "2026-03-10T00:00:00.000Z"
    });

    expect(result.status).toBe("regressed");
  });

  it("should correlate recent deployment metadata when reopening a resolved incident", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "svc_123" }] })
      .mockResolvedValueOnce({ rows: [{ id: "inc_123", status: "resolved" }] })
      .mockResolvedValueOnce({ rows: [{ duplicate: false }] })
      .mockResolvedValueOnce({ rows: [{ has_event_type: true, has_request_event: false }] })
      .mockResolvedValueOnce({
        rows: [
          {
            deployment_id: "dep_123",
            commit_sha: "abc123def456",
            version: "v2.4.0",
            branch: "main",
            deployed_at: "2026-03-10T23:30:00.000Z",
            minutes_since_deploy: 120
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [{ incident_id: "inc_123", matched_fields: ["normalized_message"], status: "regressed", occurrence_count: 2 }]
      });

    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    const result = await store.upsertIncident({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      event_type: "backend_exception",
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError at /checkout",
      severity: "high",
      occurred_at: "2026-03-11T01:30:00.000Z"
    });

    expect(result.regressed_now).toBe(true);
    expect(result.regression_deploy).toEqual({
      deployment_id: "dep_123",
      commit_sha: "abc123def456",
      version: "v2.4.0",
      branch: "main",
      deployed_at: "2026-03-10T23:30:00.000Z",
      minutes_since_deploy: 120
    });
  });

  it("should surface new_context_type_added when an existing incident receives a new event type", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "svc_123" }] })
      .mockResolvedValueOnce({ rows: [{ id: "inc_123", status: "open" }] })
      .mockResolvedValueOnce({ rows: [{ duplicate: false }] })
      .mockResolvedValueOnce({ rows: [{ has_event_type: false, has_request_event: false }] })
      .mockResolvedValueOnce({
        rows: [{ incident_id: "inc_123", matched_fields: ["normalized_message"], status: "open", occurrence_count: 2 }]
      });

    const store = createPostgresMetadataStore({ query });

    const result = await store.upsertIncident({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      event_type: "frontend_exception",
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError at /checkout",
      severity: "high",
      occurred_at: "2026-03-10T00:00:00.000Z"
    });

    expect(result.new_context_type_added).toBe(true);
    expect(result.reproduction_confidence_changed).toBeUndefined();
  });

  it("should surface reproduction_confidence_changed when request context is first observed", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "svc_123" }] })
      .mockResolvedValueOnce({ rows: [{ id: "inc_123", status: "open" }] })
      .mockResolvedValueOnce({ rows: [{ duplicate: false }] })
      .mockResolvedValueOnce({ rows: [{ has_event_type: false, has_request_event: false }] })
      .mockResolvedValueOnce({
        rows: [{ incident_id: "inc_123", matched_fields: ["normalized_message"], status: "open", occurrence_count: 2 }]
      });

    const store = createPostgresMetadataStore({ query });

    const result = await store.upsertIncident({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      event_type: "request_event",
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError at /checkout",
      severity: "high",
      occurred_at: "2026-03-10T00:00:00.000Z"
    });

    expect(result.new_context_type_added).toBe(true);
    expect(result.reproduction_confidence_changed).toBe(true);
  });

  it("should persist deployment rows for deploy_metadata events idempotently by source event", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "svc_123" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ incident_id: "inc_123", matched_fields: ["normalized_message"], status: "open", occurrence_count: 1 }]
      });

    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    await store.upsertIncident({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      event_type: "deploy_metadata",
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_deploy_123",
      fingerprint_version: "v1",
      title: "deploy_metadata event",
      severity: "low",
      occurred_at: "2026-03-10T23:30:00.000Z",
      deploy_metadata: {
        commit_sha: "abc123def456",
        version: "v2.4.0",
        branch: "main",
        deployed_at: "2026-03-10T23:30:00.000Z"
      }
    });

    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO deployments"), expect.any(Array));
  });

  it("should surface duplicate_event when incident linkage already exists", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "svc_123" }] })
      .mockResolvedValueOnce({ rows: [{ id: "inc_123", status: "open" }] })
      .mockResolvedValueOnce({ rows: [{ duplicate: true }] })
      .mockResolvedValueOnce({
        rows: [
          {
            incident_id: "inc_123",
            matched_fields: ["normalized_message"],
            status: "open",
            occurrence_count: 4
          }
        ]
      });

    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    const result = await store.upsertIncident({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError at /checkout",
      severity: "high",
      occurred_at: "2026-03-10T00:00:00.000Z"
    });

    expect(result.duplicate_event).toBe(true);
    expect(result.regressed_now).toBe(false);
  });

  it("should mark incident as spiking once", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const db: Queryable = { query };
    const store = createPostgresMetadataStore(db);

    const marked = await store.markIncidentSpiking({
      incident_id: "inc_123",
      detected_at: "2026-03-10T00:00:00.000Z"
    });

    expect(marked).toBe(true);
    expect(query).toHaveBeenCalledOnce();
  });

  it("should return false when incident spiking update does not affect a row", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const store = createPostgresMetadataStore({ query });

    const marked = await store.markIncidentSpiking({
      incident_id: "inc_123",
      detected_at: "2026-03-10T00:00:00.000Z"
    });

    expect(marked).toBe(false);
  });

  it("records retained incident events and reports demoted references", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ max_rank: 1 }] })
      .mockResolvedValueOnce({ rows: [{ event_id: "evt_latest_old", occurred_at: "2026-03-09T00:00:00.000Z", is_sampled: false }] })
      .mockResolvedValueOnce({ rows: [{ event_id: "evt_high_old", occurred_at: "2026-03-08T00:00:00.000Z", is_sampled: false }] })
      .mockResolvedValueOnce({ rows: [{ is_sampled: true }] })
      .mockResolvedValueOnce({ rows: [] });

    const store = createPostgresMetadataStore({ query });

    const result = await store.recordIncidentEventRetention({
      incident_id: "inc_123",
      event_id: "evt_new",
      event_type: "deploy_metadata",
      occurred_at: "2026-03-10T00:00:00.000Z",
      occurrence_count: 1,
      severity: "critical",
      level: null
    });

    expect(result).toEqual({
      is_sampled: true,
      demoted_event_references: [
        { event_id: "evt_high_old", occurred_at: "2026-03-08T00:00:00.000Z" },
        { event_id: "evt_latest_old", occurred_at: "2026-03-09T00:00:00.000Z" }
      ]
    });
    expect(query.mock.calls.map(([sql]) => String(sql))).toContain("COMMIT");
  });

  it("rolls back incident retention when persistence fails", async (): Promise<void> => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql === "BEGIN") {
        return { rows: [] };
      }
      if (sql.includes("FROM incidents i") && sql.includes("JOIN deployments d")) {
        return { rows: [] };
      }
      if (sql.includes("SELECT MAX(severity_rank)")) {
        return { rows: [{ max_rank: null }] };
      }
      if (sql.includes("retain_latest = false")) {
        return { rows: [] };
      }
      if (sql.includes("retain_highest_severity = false")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO incident_events")) {
        throw new Error("insert_failed");
      }
      if (sql === "ROLLBACK") {
        return { rows: [] };
      }

      throw new Error(`unexpected_sql:${sql.slice(0, 40)}`);
    });

    const store = createPostgresMetadataStore({ query });

    await expect(
      store.recordIncidentEventRetention({
        incident_id: "inc_123",
        event_id: "evt_new",
        event_type: "backend_exception",
        occurred_at: "2026-03-10T00:00:00.000Z",
        occurrence_count: 2,
        severity: "medium",
        level: "error"
      })
    ).rejects.toThrow("insert_failed");

    expect(query.mock.calls.map(([sql]) => String(sql))).toContain("ROLLBACK");
  });

  it("should list and fetch organization-scoped incidents", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            incident_id: "inc_123",
            project_id: "proj_123",
            project_name: "Main App",
            service_id: "svc_123",
            service_name: "checkout-api",
            latest_deployment_id: null,
            environment: "production",
            fingerprint: "fp_123",
            fingerprint_version: "v1",
            title: "TypeError",
            severity: "high",
            status: "open",
            first_seen_at: "2026-03-10T00:00:00.000Z",
            last_seen_at: "2026-03-10T00:10:00.000Z",
            occurrence_count: 3,
            spike_detected_at: null,
            resolved_at: null,
            regressed_at: null,
            matched_fields: ["normalized_message"]
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            incident_id: "inc_123",
            project_id: "proj_123",
            service_id: "svc_123",
            latest_deployment_id: null,
            environment: "production",
            fingerprint: "fp_123",
            fingerprint_version: "v1",
            title: "TypeError",
            severity: "high",
            status: "open",
            first_seen_at: "2026-03-10T00:00:00.000Z",
            last_seen_at: "2026-03-10T00:10:00.000Z",
            occurrence_count: 3,
            spike_detected_at: null,
            resolved_at: null,
            regressed_at: null,
            matched_fields: ["normalized_message"]
          }
        ]
      });

    const store = createPostgresMetadataStore({ query });

    const listed = await store.listIncidentsForOrganization({
      organization_id: "org_123",
      limit: 20
    });
    const fetched = await store.getIncidentForOrganization({
      organization_id: "org_123",
      incident_id: "inc_123"
    });

    expect(listed).toHaveLength(1);
    expect(fetched?.incident_id).toBe("inc_123");
  });

  it("should derive incident_reason from primary incident-signal metadata for 5xx request incidents", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          incident_id: "inc_5xx",
          project_id: "proj_123",
          project_name: "Main App",
          service_id: "svc_123",
          service_name: "checkout-api",
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_5xx",
          fingerprint_version: "v1",
          title: "request GET /checkout",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-10T00:00:00.000Z",
          last_seen_at: "2026-03-10T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          resolved_at: null,
          regressed_at: null,
          matched_fields: ["route_template", "http_method", "http_status"],
          incident_reason_event_type: "request_event",
          incident_reason_event_class: "incident_signal",
          incident_reason_level: null
        }
      ]
    });

    const store = createPostgresMetadataStore({ query });

    const listed = await store.listIncidentsForOrganization({
      organization_id: "org_123",
      limit: 20
    });

    expect(listed).toEqual([
      expect.objectContaining({
        incident_id: "inc_5xx",
        incident_reason: {
          kind: "request_failure",
          description: "request_event matched the immediate request failure incident rule",
          event_type: "request_event",
          event_class: "incident_signal",
          matched_policy: "Immediate request failure statuses bypass capture_request_events suppression"
        }
      })
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("FROM incident_events ie"), ["org_123", null, 20]);
  });

  it("should filter incident listing by first_seen_after when provided", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createPostgresMetadataStore({ query });

    await store.listIncidentsForOrganization({
      organization_id: "org_123",
      first_seen_after: "2026-03-10T00:00:00.000Z",
      limit: 20
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("i.first_seen_at >= $3::timestamptz"),
      ["org_123", null, "2026-03-10T00:00:00.000Z", 20]
    );
  });

  it("should derive incident_reason for request anomaly incidents from matched_fields when no primary incident-signal row exists", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          incident_id: "inc_request_anomaly",
          project_id: "proj_123",
          project_name: "Main App",
          service_id: "svc_123",
          service_name: "checkout-api",
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_request_anomaly",
          fingerprint_version: "v1",
          title: "Request anomaly: GET /checkout/:orderId returned 404 repeatedly",
          severity: "medium",
          status: "open",
          first_seen_at: "2026-03-10T00:00:00.000Z",
          last_seen_at: "2026-03-10T00:10:00.000Z",
          occurrence_count: 24,
          spike_detected_at: null,
          resolved_at: null,
          regressed_at: null,
          matched_fields: ["request_anomaly", "route_template", "http_method", "http_status"],
          incident_reason_event_type: null,
          incident_reason_event_class: null,
          incident_reason_level: null
        }
      ]
    });

    const store = createPostgresMetadataStore({ query });

    const listed = await store.listIncidentsForOrganization({
      organization_id: "org_123",
      limit: 20
    });

    expect(listed).toEqual([
      expect.objectContaining({
        incident_id: "inc_request_anomaly",
        incident_reason: {
          kind: "request_failure",
          description: "request_event crossed the repeated request anomaly threshold",
          event_type: "request_event",
          event_class: "incident_signal",
          matched_policy: "Repeated contextual request failures crossed the request anomaly threshold"
        }
      })
    ]);
  });

  it("preserves the primary incident reason when request_anomaly metadata exists alongside a backend exception", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          incident_id: "inc_backend_primary",
          project_id: "proj_123",
          project_name: "Main App",
          service_id: "svc_123",
          service_name: "checkout-api",
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_backend_primary",
          fingerprint_version: "v1",
          title: "TypeError in checkout handler",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-10T00:00:00.000Z",
          last_seen_at: "2026-03-10T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          resolved_at: undefined,
          regressed_at: null,
          matched_fields: ["request_anomaly", "message"],
          incident_reason_event_type: "backend_exception",
          incident_reason_event_class: "incident_signal",
          incident_reason_level: null
        }
      ]
    });

    const store = createPostgresMetadataStore({ query });

    const listed = await store.listIncidentsForOrganization({
      organization_id: "org_123",
      limit: 20
    });

    expect(listed).toEqual([
      expect.objectContaining({
        incident_id: "inc_backend_primary",
        incident_reason: expect.objectContaining({
          event_type: "backend_exception"
        })
      })
    ]);
    expect(listed[0]).not.toHaveProperty("resolved_at");
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

  it("records probe activation lifecycle metrics when analytics are enabled", async (): Promise<void> => {
    const originalSecret = process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];
    process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = "test-probe-trigger-secret-for-storage";
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT p.id, COALESCE(o.plan, 'free') AS organization_plan")) {
        return {
          rows: [{ id: "proj_123", organization_plan: "solo" }]
        };
      }

      if (sql.includes("SELECT COUNT(*)::text AS cnt")) {
        return { rows: [{ cnt: "0" }] };
      }

      if (sql.includes("INSERT INTO probe_activations")) {
        return {
          rows: [
            {
              activation_id: "11111111-1111-4111-8111-111111111111",
              label_pattern: "checkout.*",
              service: "*",
              environment: "*",
              created_at: "2026-03-11T00:00:00.000Z",
              expires_at: "2026-03-11T01:00:00.000Z",
              trigger_expires_at: "2026-03-12T01:00:00.000Z"
            }
          ]
        };
      }

      if (sql.includes("UPDATE probe_activations pa")) {
        return {
          rows: [
            {
              organization_plan: "solo",
              activation_id: "11111111-1111-4111-8111-111111111111",
              deactivated_at: "2026-03-11T00:10:00.000Z"
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

      throw new Error(`Unhandled SQL in probe analytics test: ${sql}`);
    });

    const transactionalDb: Queryable = {
      query: query as Queryable["query"],
      transaction: async <Result>(callback: (tx: Queryable) => Promise<Result>) =>
        callback({ query: query as Queryable["query"] })
    };
    const accountAnalyticsStore = createPostgresAccountAnalyticsStore({
      db: transactionalDb,
      analyticsHashSecret: "test-analytics-secret"
    });
    const store = createPostgresMetadataStore(transactionalDb, { accountAnalyticsStore });

    await store.createProbeActivationForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      created_by_member_id: "usr_123",
      label_pattern: "checkout.*",
      service: "*",
      environment: "*",
      expires_at: "2026-03-11T01:00:00.000Z",
      trigger_expires_at: "2026-03-12T01:00:00.000Z"
    });
    await store.deactivateProbeActivationForProjectInOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      activation_id: "11111111-1111-4111-8111-111111111111",
      deactivated_at: "2026-03-11T00:10:00.000Z"
    });

    expect(query.mock.calls).toContainEqual([
      expect.stringContaining("INSERT INTO account_metric_events"),
      expect.arrayContaining([
        expect.any(String),
        "analytics_123",
        "remote_probe_activation_created"
      ])
    ]);
    expect(query.mock.calls).toContainEqual([
      expect.stringContaining("INSERT INTO account_metric_events"),
      expect.arrayContaining([
        expect.any(String),
        "analytics_123",
        "remote_probe_activation_expired"
      ])
    ]);

    if (originalSecret === undefined) {
      delete process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];
    } else {
      process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = originalSecret;
    }
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

  it("should apply incident filters and cursor pagination when listing incidents", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          incident_id: "inc_123",
          project_id: "proj_123",
          project_name: "Main App",
          service_id: "svc_123",
          service_name: "checkout-api",
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "TypeError",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-10T00:00:00.000Z",
          last_seen_at: "2026-03-10T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          resolved_at: null,
          regressed_at: null,
          matched_fields: ["normalized_message"]
        }
      ]
    });

    const store = createPostgresMetadataStore({ query });

    const listed = await store.listIncidentsForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      environment: "production",
      service: "checkout-api",
      status: "open",
      severity: "high",
      limit: 10,
      cursor: {
        last_seen_at: "2026-03-10T00:09:00.000Z",
        incident_id: "inc_122"
      }
    });

    expect(listed).toHaveLength(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("AND i.project_id = $3"), [
      "org_123",
      null,
      "proj_123",
      "production",
      "checkout-api",
      "open",
      "high",
      "2026-03-10T00:09:00.000Z",
      "inc_122",
      10
    ]);
  });

  it("should resolve an organization-scoped incident idempotently", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          incident_id: "inc_123",
          project_id: "proj_123",
          project_name: "Main App",
          service_id: "svc_123",
          service_name: "checkout-api",
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "TypeError",
          severity: "high",
          status: "resolved",
          first_seen_at: "2026-03-10T00:00:00.000Z",
          last_seen_at: "2026-03-10T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          resolved_at: "2026-03-10T00:12:00.000Z",
          regressed_at: null,
          matched_fields: ["normalized_message"]
        }
      ],
      rowCount: 1
    });

    const store = createPostgresMetadataStore({ query });

    const resolved = await store.resolveIncidentForOrganization({
      organization_id: "org_123",
      incident_id: "inc_123",
      resolved_by_member_id: "usr_123",
      resolved_at: "2026-03-10T00:12:00.000Z"
    });

    expect(resolved).toEqual({
      incident_id: "inc_123",
      project_id: "proj_123",
      project_name: "Main App",
      project_color_tag: null,
      service_id: "svc_123",
      service_name: "checkout-api",
      latest_deployment_id: null,
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError",
      severity: "high",
      status: "resolved",
      first_seen_at: "2026-03-10T00:00:00.000Z",
      last_seen_at: "2026-03-10T00:10:00.000Z",
      occurrence_count: 3,
      spike_detected_at: null,
      resolved_at: "2026-03-10T00:12:00.000Z",
      regressed_at: null,
      matched_fields: ["normalized_message"]
    });
    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("UPDATE incidents"), [
      "org_123",
      "inc_123",
      "usr_123",
      "2026-03-10T00:12:00.000Z",
      null
    ]);
  });

  it("should reopen an organization-scoped incident clearing resolution fields", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          incident_id: "inc_123",
          project_id: "proj_123",
          project_name: "Main App",
          service_id: "svc_123",
          service_name: "checkout-api",
          latest_deployment_id: null,
          environment: "production",
          fingerprint: "fp_123",
          fingerprint_version: "v1",
          title: "TypeError",
          severity: "high",
          status: "open",
          first_seen_at: "2026-03-10T00:00:00.000Z",
          last_seen_at: "2026-03-10T00:10:00.000Z",
          occurrence_count: 3,
          spike_detected_at: null,
          resolved_at: null,
          regressed_at: null,
          matched_fields: ["normalized_message"]
        }
      ],
      rowCount: 1
    });

    const store = createPostgresMetadataStore({ query });

    const reopened = await store.reopenIncidentForOrganization({
      organization_id: "org_123",
      incident_id: "inc_123"
    });

    expect(reopened).toEqual({
      incident_id: "inc_123",
      project_id: "proj_123",
      project_name: "Main App",
      project_color_tag: null,
      service_id: "svc_123",
      service_name: "checkout-api",
      latest_deployment_id: null,
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError",
      severity: "high",
      status: "open",
      first_seen_at: "2026-03-10T00:00:00.000Z",
      last_seen_at: "2026-03-10T00:10:00.000Z",
      occurrence_count: 3,
      spike_detected_at: null,
      resolved_at: null,
      regressed_at: null,
      matched_fields: ["normalized_message"]
    });
    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("UPDATE incidents"), [
      "org_123",
      "inc_123",
      null
    ]);
  });

  it("should return null when reopening an incident that is already open", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [],
      rowCount: 0
    });

    const store = createPostgresMetadataStore({ query });

    const reopened = await store.reopenIncidentForOrganization({
      organization_id: "org_123",
      incident_id: "inc_123"
    });

    expect(reopened).toBeNull();
    expect(query).toHaveBeenCalledOnce();
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("AND i.status <> 'open'");
  });

  it("should persist webhook delivery intent", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createPostgresWebhookDeliveryStore({ query });

    const result = await store.createDeliveryIntent({
      webhook_id: "wh_123",
      project_id: "proj_123",
      incident_id: "inc_123",
      event_type: "bundle.reopened",
      occurred_at: "2026-03-11T00:00:00.000Z",
      target_url: "https://hooks.example.test/debugbundle",
      signing_secret: "secret_123",
      payload: { incident_id: "inc_123" }
    });

    expect(result.delivery_id).toBeDefined();
    expect(query).toHaveBeenCalledOnce();
  });

  it("should transition webhook delivery to retrying then failed across attempts", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ webhook_id: "wh_123" }] })
      .mockResolvedValueOnce({ rows: [{ status: "failed" }] });
    const store = createPostgresWebhookDeliveryStore({ query });

    const first = await store.markDeliveryAttempt({
      delivery_id: "del_123",
      attempt: 1,
      delivered: false,
      error_message: "timeout",
      response_code: null
    });

    const final = await store.markDeliveryAttempt({
      delivery_id: "del_123",
      attempt: 6,
      delivered: false,
      error_message: "still down",
      response_code: 503
    });

    expect(first).toEqual({ status: "retrying", next_attempt: 2 });
    expect(final).toEqual({ status: "failed", next_attempt: null });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("should disable a webhook after 50 consecutive final delivery failures", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ webhook_id: "wh_123" }] })
      .mockResolvedValueOnce({
        rows: Array.from({ length: 50 }, () => ({ status: "failed" }))
      })
      .mockResolvedValueOnce({ rows: [] });
    const store = createPostgresWebhookDeliveryStore({ query });

    const result = await store.markDeliveryAttempt({
      delivery_id: "del_123",
      attempt: 6,
      delivered: false,
      error_message: "still down",
      response_code: 503
    });

    expect(result).toEqual({
      status: "failed",
      next_attempt: null,
      webhook_disabled: true,
      webhook_id: "wh_123"
    });
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("UPDATE agent_webhooks"),
      ["wh_123"]
    );
  });

  it("should claim due webhook deliveries with incremented attempts", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [{ delivery_id: "del_1", attempt: 2 }] });
    const store = createPostgresWebhookDeliveryStore({ query });

    const jobs = await store.claimDueDeliveries(20);

    expect(jobs).toEqual([{ delivery_id: "del_1", attempt: 2 }]);
    expect(query).toHaveBeenCalledOnce();
  });

  it("should list matching enabled webhooks by event and filters", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          webhook_id: "wh_1",
          target_url: "https://hooks.example.test/one",
          signing_secret: "secret_one",
          filters: {
            environment: ["production"],
            service: ["checkout-api"],
            severity_min: "medium"
          }
        },
        {
          webhook_id: "wh_2",
          target_url: "https://hooks.example.test/two",
          signing_secret: "secret_two",
          filters: {
            environment: ["staging"]
          }
        }
      ]
    });
    const store = createPostgresWebhookDeliveryStore({ query });

    const matches = await store.listMatchingWebhooks({
      project_id: "proj_123",
      event_type: "bundle.reopened",
      environment: "production",
      service_name: "checkout-api",
      severity: "high"
    });

    expect(matches).toEqual([
      {
        webhook_id: "wh_1",
        target_url: "https://hooks.example.test/one",
        signing_secret: "secret_one",
        filters: {
          environment: ["production"],
          service: ["checkout-api"],
          severity_min: "medium"
        }
      }
    ]);
  });

  it("should list recent deliveries for a webhook", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          delivery_id: "del_123",
          event_type: "bundle.reopened",
          status: "delivered",
          attempt_count: 1,
          next_attempt_at: null,
          last_response_code: 200,
          last_attempted_at: "2026-03-11T00:00:01.000Z",
          last_error: null
        }
      ]
    });
    const store = createPostgresWebhookDeliveryStore({ query });

    const deliveries = await store.listDeliveriesForWebhook("wh_123", 10);

    expect(deliveries).toEqual([
      {
        delivery_id: "del_123",
        event_type: "bundle.reopened",
        status: "delivered",
        attempt_count: 1,
        next_attempt_at: null,
        last_response_code: 200,
        last_attempted_at: "2026-03-11T00:00:01.000Z",
        last_error: null
      }
    ]);
    expect(query).toHaveBeenCalledOnce();
  });

  it("should return scoped deliveries for webhook inside organization", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ webhook_id: "wh_123" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            delivery_id: "del_123",
            event_type: "bundle.reopened",
            status: "delivered",
            attempt_count: 1,
            next_attempt_at: null,
            last_response_code: 200,
            last_attempted_at: "2026-03-11T00:00:01.000Z",
            last_error: null
          }
        ]
      });
    const store = createPostgresWebhookDeliveryStore({ query });

    const scoped = await store.listDeliveriesForWebhookInOrganization({
      webhookId: "wh_123",
      organizationId: "org_123",
      limit: 10
    });

    expect(scoped).toEqual({
      deliveries: [
        {
          delivery_id: "del_123",
          event_type: "bundle.reopened",
          status: "delivered",
          attempt_count: 1,
          next_attempt_at: null,
          last_response_code: 200,
          last_attempted_at: "2026-03-11T00:00:01.000Z",
          last_error: null
        }
      ]
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("should return null scoped deliveries when webhook is outside organization", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const store = createPostgresWebhookDeliveryStore({ query });

    const scoped = await store.listDeliveriesForWebhookInOrganization({
      webhookId: "wh_123",
      organizationId: "org_999",
      limit: 10
    });

    expect(scoped).toBeNull();
    expect(query).toHaveBeenCalledOnce();
  });

  it("should list webhooks for an in-scope project", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "proj_123" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            webhook_id: "wh_123",
            project_id: "proj_123",
            created_by_user_id: "usr_123",
            url: "https://hooks.example.test/debugbundle",
            events: ["bundle.created", "bundle.updated"],
            filters: { environment: ["production"] },
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ]
      });
    const store = createPostgresWebhookDeliveryStore({ query });

    const webhooks = await store.listWebhooksForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      limit: 10
    });

    expect(webhooks).toEqual([
      {
        webhook_id: "wh_123",
        project_id: "proj_123",
        created_by_user_id: "usr_123",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created", "bundle.updated"],
        filters: { environment: ["production"] },
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      }
    ]);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("should return null when listing webhooks for an out-of-scope project", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const store = createPostgresWebhookDeliveryStore({ query });

    const webhooks = await store.listWebhooksForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      limit: 10
    });

    expect(webhooks).toBeNull();
    expect(query).toHaveBeenCalledOnce();
  });

  it("should create, fetch, update, and delete a scoped webhook", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "proj_123" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            webhook_id: "wh_123",
            project_id: "proj_123",
            created_by_user_id: "usr_123",
            url: "https://hooks.example.test/debugbundle",
            events: ["bundle.created"],
            filters: { environment: ["production"] },
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            webhook_id: "wh_123",
            project_id: "proj_123",
            created_by_user_id: "usr_123",
            url: "https://hooks.example.test/debugbundle",
            events: ["bundle.created"],
            filters: { environment: ["production"] },
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            webhook_id: "wh_123",
            project_id: "proj_123",
            created_by_user_id: "usr_123",
            url: "https://hooks.example.test/updated",
            events: ["bundle.updated"],
            filters: { environment: ["staging"] },
            is_enabled: false,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:05:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ webhook_id: "wh_123" }] });
    const store = createPostgresWebhookDeliveryStore({ query });

    const created = await store.createWebhookForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      created_by_user_id: "usr_123",
      url: "https://hooks.example.test/debugbundle",
      signing_secret: "dbundle_whsec_test",
      events: ["bundle.created"],
      filters: { environment: ["production"] },
      is_enabled: true
    });
    const fetched = await store.getWebhookForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      webhook_id: "wh_123"
    });
    const updated = await store.updateWebhookForOrganization({
      organization_id: "org_123",
      webhook_id: "wh_123",
      url: "https://hooks.example.test/updated",
      events: ["bundle.updated"],
      filters: { environment: ["staging"] },
      is_enabled: false
    });
    const deleted = await store.deleteWebhookForOrganization({
      organization_id: "org_123",
      webhook_id: "wh_123"
    });

    expect(created).toEqual({
      webhook_id: "wh_123",
      project_id: "proj_123",
      created_by_user_id: "usr_123",
      url: "https://hooks.example.test/debugbundle",
      events: ["bundle.created"],
      filters: { environment: ["production"] },
      is_enabled: true,
      created_at: "2026-03-15T00:00:00.000Z",
      updated_at: "2026-03-15T00:00:00.000Z"
    });
    expect(fetched).toEqual(created);
    expect(updated).toEqual({
      webhook_id: "wh_123",
      project_id: "proj_123",
      created_by_user_id: "usr_123",
      url: "https://hooks.example.test/updated",
      events: ["bundle.updated"],
      filters: { environment: ["staging"] },
      is_enabled: false,
      created_at: "2026-03-15T00:00:00.000Z",
      updated_at: "2026-03-15T00:05:00.000Z"
    });
    expect(deleted).toEqual({ webhook_id: "wh_123" });
  });

  it("should persist bundle generation history when reserving bundle generation", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          generation_number: 3,
          created_at: "2026-03-15T12:00:00.000Z",
          updated_at: "2026-03-15T12:00:00.000Z",
          source_event_id: "550e8400-e29b-41d4-a716-446655440000",
          source_occurred_at: "2026-03-15T11:59:00.000Z",
          trigger: "regression_reopen"
        }
      ]
    });
    const store = createPostgresMetadataStore({ query });

    const reserved = await store.reserveBundleGeneration({
      incident_id: "inc_123",
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      occurred_at: "2026-03-15T11:59:00.000Z",
      trigger: "regression_reopen"
    });

    expect(reserved).toEqual({
      generation_number: 3,
      created_at: "2026-03-15T12:00:00.000Z",
      updated_at: "2026-03-15T12:00:00.000Z",
      source_event_id: "550e8400-e29b-41d4-a716-446655440000",
      source_occurred_at: "2026-03-15T11:59:00.000Z",
      trigger: "regression_reopen"
    });
    expect(query).toHaveBeenCalledOnce();
    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("INSERT INTO bundle_generations");
    expect(sql).toContain("ON CONFLICT (incident_id, source_event_id)\n            WHERE incident_id IS NOT NULL");
  });

  it("should prune retained bundle owners across incident and improvement keyspaces", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          owner_type: "incident",
          project_id: "proj_old",
          incident_id: "inc_old",
          improvement_opportunity_id: null
        },
        {
          owner_type: "improvement",
          project_id: "proj_other",
          incident_id: null,
          improvement_opportunity_id: "imp_old"
        }
      ]
    });
    const store = createPostgresMetadataStore({ query });
    expect(store.pruneRetainedBundleOwnersForProject).toBeDefined();

    const pruned = await store.pruneRetainedBundleOwnersForProject!({
      project_id: "proj_123",
      retained_bundle_limit: 450
    });

    expect(pruned).toEqual([
      {
        owner_type: "incident",
        project_id: "proj_old",
        incident_id: "inc_old",
        improvement_opportunity_id: null
      },
      {
        owner_type: "improvement",
        project_id: "proj_other",
        incident_id: null,
        improvement_opportunity_id: "imp_old"
      }
    ]);
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("DELETE FROM incidents");
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("DELETE FROM improvement_opportunities");
  });

  it("should aggregate weekly project report summary from bundle history and incident activity", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          project_id: "proj_123",
          project_name: "Main App",
          window_start: "2026-03-09T00:00:00.000Z",
          window_end: "2026-03-16T00:00:00.000Z",
          failure_bundles: 3,
          improvement_bundles: 0,
          new_incidents: 2,
          resolved_incidents: 2,
          opened_incidents_resolved: 1,
          regressions: 1,
          top_spiking_incidents: [
            {
              incident_id: "inc_123",
              title: "Checkout failed",
              occurrence_count: 13,
              spike_detected_at: "2026-03-14T08:00:00.000Z"
            }
          ]
        }
      ]
    });
    const store = createPostgresMetadataStore({ query });

    const summary = await store.getWeeklyProjectReport({
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z"
    });

    expect(summary).toEqual({
      project_id: "proj_123",
      project_name: "Main App",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z",
      bundle_counts: {
        failure: 3,
        improvement: 0
      },
      new_incidents: 2,
      resolved_incidents: 2,
      opened_incidents_resolved: 1,
      regressions: 1,
      top_spiking_incidents: [
        {
          incident_id: "inc_123",
          title: "Checkout failed",
          occurrence_count: 13,
          spike_detected_at: "2026-03-14T08:00:00.000Z"
        }
      ]
    });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("FROM bundle_generations");
  });

  it("should return null weekly project report when the project has no weekly activity", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createPostgresMetadataStore({ query });

    const summary = await store.getWeeklyProjectReport({
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z"
    });

    expect(summary).toBeNull();
    expect(query).toHaveBeenCalledOnce();
  });

  it("should read webhook delivery intents and create scoped test deliveries", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            delivery_id: "del_123",
            webhook_id: "wh_123",
            project_id: "proj_123",
            incident_id: "inc_123",
            event_type: "bundle.created",
            status: "pending",
            attempt_count: 0,
            occurred_at: "2026-03-11T00:00:00.000Z",
            target_url: "https://hooks.example.test/debugbundle",
            next_attempt_at: null,
            last_response_code: null,
            last_attempted_at: null,
            last_error: null,
            payload: { ok: true },
            signing_secret: "secret_123"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            webhook_id: "wh_123",
            project_id: "proj_123",
            target_url: "https://hooks.example.test/debugbundle",
            signing_secret: "secret_123"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const store = createPostgresWebhookDeliveryStore({ query });

    await expect(store.getDeliveryIntent("del_123")).resolves.toMatchObject({ delivery_id: "del_123" });
    await expect(
      store.createTestDeliveryForOrganization({
        organization_id: "org_123",
        webhook_id: "wh_123",
        event_type: "verification.failed"
      })
    ).resolves.toMatchObject({ event_type: "verification.failed" });
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("INSERT INTO webhook_deliveries"),
      expect.arrayContaining([
        "wh_123",
        "proj_123",
        null,
        "verification.failed",
        "https://hooks.example.test/debugbundle",
        "secret_123"
      ])
    );
    await expect(
      store.createTestDeliveryForOrganization({
        organization_id: "org_123",
        webhook_id: "wh_missing",
        event_type: "verification.failed"
      })
    ).resolves.toBeNull();
  });

  it("should retry deliveries only for enabled scoped webhooks", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ webhook_id: "wh_123" }] })
      .mockResolvedValueOnce({ rows: [{ delivery_id: "del_retry", event_type: "verification.failed" }] })
      .mockResolvedValueOnce({ rows: [] });
    const store = createPostgresWebhookDeliveryStore({ query });

    await expect(
      store.retryDeliveryForOrganization({ organization_id: "org_123", webhook_id: "wh_123", delivery_id: "del_retry" })
    ).resolves.toEqual({ delivery_id: "del_retry", event_type: "verification.failed" });
    await expect(
      store.retryDeliveryForOrganization({ organization_id: "org_123", webhook_id: "wh_missing", delivery_id: "del_retry" })
    ).resolves.toBeNull();
  });

  it("should filter matching webhooks by bundle type and verification flags", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          webhook_id: "wh_1",
          target_url: "https://hooks.example.test/one",
          signing_secret: "secret_one",
          filters: {
            bundle_type: ["failure"],
            verification: true
          }
        },
        {
          webhook_id: "wh_2",
          target_url: "https://hooks.example.test/two",
          signing_secret: "secret_two",
          filters: {
            bundle_type: ["improvement"],
            verification: false
          }
        }
      ]
    });
    const store = createPostgresWebhookDeliveryStore({ query });

    const matches = await store.listMatchingWebhooks({
      project_id: "proj_123",
      event_type: "verification.passed",
      environment: "production",
      service_name: "checkout-api",
      severity: "high",
      bundle_type: "failure",
      is_verification: true
    });

    expect(matches).toEqual([
      {
        webhook_id: "wh_1",
        target_url: "https://hooks.example.test/one",
        signing_secret: "secret_one",
        filters: {
          bundle_type: ["failure"],
          verification: true
        }
      }
    ]);
  });

  it("should list projects with weekly activity in ascending order", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ project_id: "proj_123" }, { project_id: "proj_456" }]
    });
    const store = createPostgresMetadataStore({ query });

    const projects = await store.listProjectsWithWeeklyActivity({
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z",
      limit: 10
    });

    expect(projects).toEqual(["proj_123", "proj_456"]);
  });

  it("should preserve explicit matched fields during incident upsert", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "svc_123" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ incident_id: "inc_123", matched_fields: ["stack_trace"], status: "open", regressed_now: false }]
      });
    const store = createPostgresMetadataStore({ query });

    const result = await store.upsertIncident({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      fingerprint: "fp_123",
      fingerprint_version: "v1",
      title: "TypeError at /checkout",
      severity: "high",
      occurred_at: "2026-03-10T00:00:00.000Z",
      matched_fields: ["stack_trace"]
    });

    expect(result.matched_fields).toEqual(["stack_trace"]);
  });

  it("should mark webhook deliveries delivered and keep failed webhooks enabled below the disable threshold", async (): Promise<void> => {
    const deliveredQuery = vi.fn().mockResolvedValue({ rows: [] });
    const deliveredStore = createPostgresWebhookDeliveryStore({ query: deliveredQuery });

    await expect(
      deliveredStore.markDeliveryAttempt({
        delivery_id: "del_200",
        attempt: 1,
        delivered: true,
        response_code: 200,
        error_message: null
      })
    ).resolves.toEqual({ status: "delivered", next_attempt: null });

    const failedQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ webhook_id: "wh_123" }] })
      .mockResolvedValueOnce({ rows: [{ status: "failed" }, { status: "retrying" }] });
    const failedStore = createPostgresWebhookDeliveryStore({ query: failedQuery });

    await expect(
      failedStore.markDeliveryAttempt({
        delivery_id: "del_500",
        attempt: 6,
        delivered: false,
        error_message: "upstream_failed",
        response_code: 500
      })
    ).resolves.toEqual({ status: "failed", next_attempt: null });
  });

  it("should return null bundle build context and throw when generation reservation returns no row", async (): Promise<void> => {
    const missingContextStore = createPostgresMetadataStore({
      query: vi.fn().mockResolvedValue({ rows: [] })
    });

    await expect(
      missingContextStore.getBundleBuildContext({
        project_id: "proj_123",
        incident_id: "inc_missing"
      })
    ).resolves.toBeNull();

    const failingReserveStore = createPostgresMetadataStore({
      query: vi.fn().mockResolvedValue({ rows: [] })
    });

    await expect(
      failingReserveStore.reserveBundleGeneration({
        incident_id: "inc_123",
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        occurred_at: "2026-03-15T11:59:00.000Z",
        trigger: "regression_reopen"
      })
    ).rejects.toThrow("bundle_generation_reserve_failed");
  });

  it("should list incident event references and probe event candidates", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            event_id: "550e8400-e29b-41d4-a716-446655440000",
            event_type: "backend_exception",
            occurred_at: "2026-03-10T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            event_id: "550e8400-e29b-41d4-a716-446655440001",
            occurred_at: "2026-03-10T00:05:00.000Z"
          }
        ]
      });
    const store = createPostgresMetadataStore({ query });

    await expect(store.listIncidentEventReferences({ incident_id: "inc_123" })).resolves.toEqual([
      {
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        event_type: "backend_exception",
        occurred_at: "2026-03-10T00:00:00.000Z"
      }
    ]);
    await expect(
      store.listProbeEventCandidatesForServiceWindow({
        project_id: "proj_123",
        environment: "production",
        service_name: "checkout-api",
        window_start: "2026-03-10T00:00:00.000Z",
        window_end: "2026-03-10T01:00:00.000Z"
      })
    ).resolves.toEqual([
      {
        event_id: "550e8400-e29b-41d4-a716-446655440001",
        occurred_at: "2026-03-10T00:05:00.000Z"
      }
    ]);
  });

  it("should fall back to retained incident events when bundle source metadata is missing", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          event_id: "550e8400-e29b-41d4-a716-446655440000",
          occurred_at: "2026-03-10T00:00:00.000Z",
          occurrence_count: 3,
          trigger: "regeneration"
        }
      ]
    });
    const store = createPostgresMetadataStore({ query });

    await expect(
      store.getBundleSourceForOrganization?.({
        organization_id: "org_123",
        incident_id: "inc_123"
      })
    ).resolves.toEqual({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      occurred_at: "2026-03-10T00:00:00.000Z",
      occurrence_count: 3,
      trigger: "regeneration"
    });
    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("LEFT JOIN LATERAL");
    expect(sql).toContain("fallback_event");
  });

  it("should default missing weekly report spike lists to an empty array", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          project_id: "proj_123",
          window_start: "2026-03-09T00:00:00.000Z",
          window_end: "2026-03-16T00:00:00.000Z",
          failure_bundles: 1,
          improvement_bundles: 2,
          new_incidents: 0,
          regressions: 0,
          top_spiking_incidents: null
        }
      ]
    });
    const store = createPostgresMetadataStore({ query });

    await expect(
      store.getWeeklyProjectReport({
        project_id: "proj_123",
        window_start: "2026-03-09T00:00:00.000Z",
        window_end: "2026-03-16T00:00:00.000Z"
      })
    ).resolves.toEqual({
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z",
      bundle_counts: { failure: 1, improvement: 2 },
      new_incidents: 0,
      regressions: 0,
      top_spiking_incidents: []
    });
  });

  it("should exclude mismatched webhook filters for severity, bundle type, and verification", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          webhook_id: "wh_1",
          target_url: "https://hooks.example.test/one",
          signing_secret: "secret_one",
          filters: {
            severity_min: "critical",
            bundle_type: ["improvement"],
            verification: false,
            service: ["checkout-api"]
          }
        }
      ]
    });
    const store = createPostgresWebhookDeliveryStore({ query });

    const matches = await store.listMatchingWebhooks({
      project_id: "proj_123",
      event_type: "verification.passed",
      environment: "production",
      service_name: "checkout-api",
      severity: "high",
      bundle_type: "failure",
      is_verification: true
    });

    expect(matches).toEqual([]);
  });
});
