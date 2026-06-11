import { describe, expect, it, vi } from "vitest";

import {
  createPostgresAccountAnalyticsStore,
  createPostgresAccountStore,
  type Queryable
} from "../../../packages/storage/src/index.js";

function rowsResult<Row extends Record<string, unknown>>(rows: Row[]): { rows: Row[] } {
  return { rows };
}

describe("postgres account store", () => {
  it("returns null export when the user is not a member of the organization", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue(rowsResult([]));
    const store = createPostgresAccountStore({ query } as Queryable);

    const result = await store.exportAccountForOrganization({
      organization_id: "org_123",
      user_id: "usr_123",
      exported_at: "2026-04-06T00:00:00.000Z"
    });

    expect(result).toBeNull();
    expect(query).toHaveBeenCalledOnce();
  });

  it("exports account data with project-scoped records", async (): Promise<void> => {
    const query = vi.fn(async (sqlText: string) => {
      if (sqlText.includes("FROM users u")) {
        return rowsResult([{ data: { user_id: "usr_123", email: "owen@example.com", has_email_auth: true, has_github_oauth: true } }]);
      }
      if (sqlText.includes("FROM organizations o")) {
        return rowsResult([{ data: { organization_id: "org_123", name: "Acme" } }]);
      }
      if (sqlText.includes("FROM organization_members om") && sqlText.includes("JOIN users u ON u.id = om.user_id")) {
        return rowsResult([{ data: { user_id: "usr_123", email: "owen@example.com", role: "owner" } }]);
      }
      if (sqlText.includes("FROM project_invites")) {
        return rowsResult([{ data: { invite_id: "inv_123" } }]);
      }
      if (sqlText.includes("FROM member_tokens")) {
        return rowsResult([{ data: { token_id: "tok_123" } }]);
      }
      if (sqlText.includes("FROM projects")) {
        return rowsResult([{ data: { project_id: "proj_123", name: "Main App" } }]);
      }
      if (sqlText.includes("FROM project_members")) {
        return rowsResult([{ data: { project_member_id: "pm_123", project_id: "proj_123", user_id: "usr_456" } }]);
      }
      if (sqlText.includes("FROM project_tokens")) {
        return rowsResult([{ data: { token_id: "proj_tok_123", project_id: "proj_123" } }]);
      }
      if (sqlText.includes("FROM probe_activations")) {
        return rowsResult([{ data: { activation_id: "probe_123", project_id: "proj_123" } }]);
      }
      if (sqlText.includes("FROM capture_policies")) {
        return rowsResult([{ data: { project_id: "proj_123", preset: "balanced" } }]);
      }
      if (sqlText.includes("FROM services")) {
        return rowsResult([{ data: { service_id: "svc_123", project_id: "proj_123" } }]);
      }
      if (sqlText.includes("FROM deployments")) {
        return rowsResult([{ data: { deployment_id: "dep_123", project_id: "proj_123" } }]);
      }
      if (sqlText.includes("FROM processed_events")) {
        return rowsResult([{ data: { project_id: "proj_123", event_id: "evt_123" } }]);
      }
      if (sqlText.includes("FROM improvement_opportunities") && !sqlText.includes("JOIN improvement_opportunities")) {
        return rowsResult([{ data: { improvement_opportunity_id: "imp_123", project_id: "proj_123" } }]);
      }
      if (sqlText.includes("FROM incidents") && !sqlText.includes("JOIN incidents ON")) {
        return rowsResult([{ data: { incident_id: "inc_123", project_id: "proj_123" } }]);
      }
      if (sqlText.includes("FROM bundle_generations")) {
        return rowsResult([{ data: { bundle_generation_id: "bg_123", project_id: "proj_123" } }]);
      }
      if (sqlText.includes("FROM alert_rules")) {
        return rowsResult([{ data: { alert_id: "alert_123", project_id: "proj_123" } }]);
      }
      if (sqlText.includes("FROM slack_destinations")) {
        return rowsResult([{ data: { slack_destination_id: "sd_123", organization_id: "org_123" } }]);
      }
      if (sqlText.includes("FROM alert_deliveries")) {
        return rowsResult([{ data: { delivery_id: "alert_delivery_123", project_id: "proj_123" } }]);
      }
      if (sqlText.includes("FROM alert_email_digests")) {
        return rowsResult([{ data: { digest_id: "aed_123", project_id: "proj_123" } }]);
      }
      if (sqlText.includes("FROM alert_email_digest_items")) {
        return rowsResult([{ data: { digest_item_id: "aedi_123", project_id: "proj_123" } }]);
      }
      if (sqlText.includes("FROM weekly_report_channels")) {
        return rowsResult([{ data: { weekly_report_channel_id: "wrc_123", project_id: "proj_123" } }]);
      }
      if (sqlText.includes("FROM weekly_report_deliveries")) {
        return rowsResult([{ data: { delivery_id: "wrd_123", project_id: "proj_123" } }]);
      }
      if (sqlText.includes("FROM agent_webhooks")) {
        return rowsResult([{ data: { webhook_id: "wh_123", project_id: "proj_123" } }]);
      }
      if (sqlText.includes("FROM webhook_deliveries")) {
        return rowsResult([{ data: { delivery_id: "whd_123", project_id: "proj_123" } }]);
      }
      if (sqlText.includes("FROM project_github_repos")) {
        return rowsResult([{ data: { project_github_repo_id: "pgr_123", project_id: "proj_123" } }]);
      }
      if (sqlText.includes("FROM github_dispatch_rules")) {
        return rowsResult([{ data: { rule_id: "rule_123", project_id: "proj_123" } }]);
      }
      if (sqlText.includes("FROM github_dispatch_deliveries")) {
        return rowsResult([{ data: { delivery_id: "ghd_123", project_id: "proj_123" } }]);
      }
      if (sqlText.includes("FROM incident_events")) {
        return rowsResult([{ data: { incident_id: "inc_123", project_id: "proj_123", event_id: "evt_123", is_sampled: true } }]);
      }
      if (sqlText.includes("FROM improvement_opportunity_events")) {
        return rowsResult([{ data: { improvement_opportunity_id: "imp_123", project_id: "proj_123", event_id: "evt_imp_123" } }]);
      }
      if (sqlText.includes("FROM github_installations")) {
        return rowsResult([{ data: { github_installation_id: "ghi_123", organization_id: "org_123" } }]);
      }
      if (sqlText.includes("FROM github_marketplace_accounts")) {
        return rowsResult([{ data: { marketplace_account_id: 42, organization_id: "org_123" } }]);
      }
      if (sqlText.includes("FROM org_usage_counters")) {
        return rowsResult([{ data: { organization_id: "org_123", month: "2026-04" } }]);
      }
      if (sqlText.includes("FROM processed_billing_events")) {
        return rowsResult([{ data: { organization_id: "org_123", event_id: "bill_123" } }]);
      }
      if (sqlText.includes("FROM processed_github_marketplace_events")) {
        return rowsResult([{ data: { delivery_id: "ghm_123", marketplace_account_id: 42 } }]);
      }
      if (sqlText.includes("FROM plan_cleanup_tasks")) {
        return rowsResult([{ data: { task_id: "pct_123", organization_id: "org_123", project_id: "proj_123" } }]);
      }
      if (sqlText.includes("FROM operational_email_deliveries")) {
        return rowsResult([{ data: { delivery_id: "op_email_123", organization_id: "org_123", project_id: "proj_123" } }]);
      }
      if (sqlText.includes("FROM audit_logs")) {
        return rowsResult([{ data: { audit_log_id: "audit_123", organization_id: "org_123" } }]);
      }

      throw new Error(`Unhandled SQL in exportAccountForOrganization: ${sqlText}`);
    });

    const store = createPostgresAccountStore({ query } as Queryable);

    const result = await store.exportAccountForOrganization({
      organization_id: "org_123",
      user_id: "usr_123",
      exported_at: "2026-04-06T00:00:00.000Z"
    });

    expect(result).toEqual(
      expect.objectContaining({
        export_version: 1,
        exported_at: "2026-04-06T00:00:00.000Z",
        user: expect.objectContaining({ user_id: "usr_123" }),
        organization: expect.objectContaining({ organization_id: "org_123" }),
        projects: [expect.objectContaining({ project_id: "proj_123" })],
        project_members: [expect.objectContaining({ project_member_id: "pm_123" })],
        probe_activations: [expect.objectContaining({ activation_id: "probe_123" })],
        improvement_opportunities: [expect.objectContaining({ improvement_opportunity_id: "imp_123" })],
        improvement_opportunity_events: [expect.objectContaining({ event_id: "evt_imp_123" })],
        incidents: [expect.objectContaining({ incident_id: "inc_123" })],
        incident_events: [expect.objectContaining({ event_id: "evt_123" })],
        alert_email_digests: [expect.objectContaining({ digest_id: "aed_123" })],
        alert_email_digest_items: [expect.objectContaining({ digest_item_id: "aedi_123" })],
        github_marketplace_accounts: [expect.objectContaining({ marketplace_account_id: 42 })],
        processed_github_marketplace_events: [expect.objectContaining({ delivery_id: "ghm_123" })],
        plan_cleanup_tasks: [expect.objectContaining({ task_id: "pct_123" })],
        operational_email_deliveries: [expect.objectContaining({ delivery_id: "op_email_123" })],
        artifacts: {
          raw_events: [],
          bundles: [],
          reproductions: []
        }
      })
    );
  });

  it("blocks deletion when the user is the sole owner of another organization", async (): Promise<void> => {
    const query = vi.fn(async (sqlText: string) => {
      if (sqlText === "BEGIN") {
        return rowsResult([]);
      }
      if (sqlText.includes("SELECT role") && sqlText.includes("FROM organization_members")) {
        return rowsResult([{ role: "owner" }]);
      }
      if (sqlText.includes("SELECT om.organization_id::text AS organization_id")) {
        return rowsResult([{ organization_id: "org_other" }]);
      }
      if (sqlText === "ROLLBACK") {
        return rowsResult([]);
      }

      throw new Error(`Unhandled SQL in deleteAccountForOrganization guard: ${sqlText}`);
    });

    const store = createPostgresAccountStore({ query } as Queryable);

    const result = await store.deleteAccountForOrganization({
      organization_id: "org_123",
      user_id: "usr_123",
      deleted_at: "2026-04-06T00:00:00.000Z"
    });

    expect(result).toBe("other_owned_organizations_exist");
    expect(query).toHaveBeenCalledWith("ROLLBACK", []);
  });

  it("blocks deletion when the user owns a project in another organization", async (): Promise<void> => {
    const query = vi.fn(async (sqlText: string) => {
      if (sqlText === "BEGIN") {
        return rowsResult([]);
      }
      if (sqlText.includes("SELECT role") && sqlText.includes("FROM organization_members")) {
        return rowsResult([{ role: "owner" }]);
      }
      if (sqlText.includes("SELECT om.organization_id::text AS organization_id")) {
        return rowsResult([]);
      }
      if (sqlText.includes("SELECT p.id::text AS project_id")) {
        return rowsResult([{ project_id: "proj_other" }]);
      }
      if (sqlText === "ROLLBACK") {
        return rowsResult([]);
      }

      throw new Error(`Unhandled SQL in deleteAccountForOrganization project-owner guard: ${sqlText}`);
    });

    const store = createPostgresAccountStore({ query } as Queryable);

    const result = await store.deleteAccountForOrganization({
      organization_id: "org_123",
      user_id: "usr_123",
      deleted_at: "2026-04-06T00:00:00.000Z"
    });

    expect(result).toBe("other_owned_projects_exist");
    expect(query).toHaveBeenCalledWith("ROLLBACK", []);
  });

  it("deletes organization, remaining memberships, and the user record", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string) => {
      if (sqlText.includes("SELECT role") && sqlText.includes("FROM organization_members")) {
        return rowsResult([{ role: "owner" }]);
      }
      if (sqlText.includes("SELECT om.organization_id::text AS organization_id")) {
        return rowsResult([]);
      }
      if (sqlText.includes("SELECT p.id::text AS project_id")) {
        return rowsResult([]);
      }
      if (sqlText.includes("SELECT id::text AS project_id") && sqlText.includes("FROM projects")) {
        return rowsResult([{ project_id: "proj_123" }, { project_id: "proj_456" }]);
      }
      if (sqlText.includes("SELECT COUNT(*)::int") && sqlText.includes("FROM incidents i")) {
        return rowsResult([
          {
            project_count: 2,
            open_incident_count: 3,
            open_improvement_count: 1
          }
        ]);
      }
      if (sqlText.includes("DELETE FROM member_tokens") && sqlText.includes("WHERE organization_id = $1")) {
        return rowsResult([{ token_id: "tok_123" }]);
      }
      if (sqlText.includes("FROM account_analytics_accounts")) {
        return rowsResult([{ analytics_account_id: "analytics_123" }]);
      }
      if (sqlText.includes("SELECT") && sqlText.includes("FROM organizations") && sqlText.includes("created_at::text AS created_at")) {
        return rowsResult([
          {
            organization_id: "org_123",
            created_at: "2026-04-01T00:00:00.000Z",
            plan: "team",
            additional_capacity_units: 2
          }
        ]);
      }
      if (sqlText.includes("INSERT INTO account_analytics_accounts")) {
        return rowsResult([{ analytics_account_id: "analytics_123" }]);
      }
      if (sqlText.includes("FROM organizations") && sqlText.includes("stripe_customer_id")) {
        return rowsResult([
          {
            analytics_account_id: "analytics_123",
            organization_id_hash: "org_hash_123",
            plan: "team",
            billing_state: "active",
            stripe_customer_id: "cus_123",
            stripe_subscription_id: "sub_123",
            billing_period_starts_at: "2026-04-01T00:00:00.000Z",
            billing_period_ends_at: "2026-05-01T00:00:00.000Z",
            additional_capacity_units: 2,
            last_billing_event_id: "evt_123"
          }
        ]);
      }
      if (sqlText.includes("INSERT INTO account_payment_retention_records")) {
        return rowsResult([]);
      }
      if (sqlText.includes("INSERT INTO account_payment_provider_events")) {
        return rowsResult([]);
      }
      if (sqlText.includes("INSERT INTO account_metric_events")) {
        return rowsResult([{ dedupe_key_hash: "hash_123" }]);
      }
      if (sqlText.includes("INSERT INTO account_metric_periods")) {
        return rowsResult([]);
      }
      if (sqlText.includes("UPDATE account_analytics_accounts")) {
        return rowsResult([]);
      }
      if (sqlText.includes("DELETE FROM processed_billing_events")) {
        return rowsResult([]);
      }
      if (sqlText.includes("DELETE FROM audit_logs") && sqlText.includes("WHERE organization_id = $1")) {
        return rowsResult([]);
      }
      if (sqlText.includes("DELETE FROM projects")) {
        return rowsResult([]);
      }
      if (sqlText.includes("DELETE FROM organizations")) {
        return rowsResult([{ organization_id: "org_123" }]);
      }
      if (sqlText.includes("DELETE FROM organization_members") && sqlText.includes("WHERE user_id = $1")) {
        return rowsResult([]);
      }
      if (sqlText.includes("DELETE FROM member_tokens") && sqlText.includes("WHERE user_id = $1")) {
        return rowsResult([{ token_id: "tok_user_123" }]);
      }
      if (sqlText.includes("DELETE FROM audit_logs") && sqlText.includes("WHERE actor_user_id = $1")) {
        return rowsResult([]);
      }
      if (sqlText.includes("DELETE FROM users")) {
        return rowsResult([]);
      }

      throw new Error(`Unhandled SQL in deleteAccountForOrganization success: ${sqlText}`);
    });
    const query = queryMock as Queryable["query"];

    const transactionalDb: Queryable = {
      query,
      transaction: async <Result>(callback: (tx: Queryable) => Promise<Result>) =>
        callback({ query } as Queryable)
    };
    const accountAnalyticsStore = createPostgresAccountAnalyticsStore({
      db: transactionalDb,
      analyticsHashSecret: "test-analytics-secret"
    });
    const store = createPostgresAccountStore(transactionalDb, { accountAnalyticsStore });

    const result = await store.deleteAccountForOrganization({
      organization_id: "org_123",
      user_id: "usr_123",
      deleted_at: "2026-04-06T00:00:00.000Z"
    });

    expect(result).toEqual({
      deleted_at: "2026-04-06T00:00:00.000Z",
      organization_id: "org_123",
      deleted_project_ids: ["proj_123", "proj_456"],
      user_deleted: true,
      deleted_member_token_count: 2
    });
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO account_payment_retention_records"),
      expect.any(Array)
    );
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO account_payment_provider_events"),
      expect.any(Array)
    );
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE account_analytics_accounts"),
      ["analytics_123", "2026-04-06T00:00:00.000Z"]
    );
  });

  it("allows deletion when another organization still has a different owner and removes the collaborator membership", async (): Promise<void> => {
    const query = vi.fn(async (sqlText: string) => {
      if (sqlText === "BEGIN" || sqlText === "COMMIT") {
        return rowsResult([]);
      }
      if (sqlText.includes("SELECT role") && sqlText.includes("FROM organization_members")) {
        return rowsResult([{ role: "owner" }]);
      }
      if (sqlText.includes("SELECT om.organization_id::text AS organization_id")) {
        return rowsResult([]);
      }
      if (sqlText.includes("SELECT p.id::text AS project_id")) {
        return rowsResult([]);
      }
      if (sqlText.includes("SELECT id::text AS project_id") && sqlText.includes("FROM projects")) {
        return rowsResult([{ project_id: "proj_123" }]);
      }
      if (sqlText.includes("SELECT COUNT(*)::int") && sqlText.includes("FROM incidents i")) {
        return rowsResult([
          {
            project_count: 1,
            open_incident_count: 0,
            open_improvement_count: 0
          }
        ]);
      }
      if (sqlText.includes("DELETE FROM member_tokens") && sqlText.includes("WHERE organization_id = $1")) {
        return rowsResult([]);
      }
      if (sqlText.includes("DELETE FROM processed_billing_events")) {
        return rowsResult([]);
      }
      if (sqlText.includes("DELETE FROM audit_logs") && sqlText.includes("WHERE organization_id = $1")) {
        return rowsResult([]);
      }
      if (sqlText.includes("DELETE FROM projects")) {
        return rowsResult([]);
      }
      if (sqlText.includes("DELETE FROM organizations")) {
        return rowsResult([{ organization_id: "org_123" }]);
      }
      if (sqlText.includes("DELETE FROM organization_members") && sqlText.includes("WHERE user_id = $1")) {
        return rowsResult([]);
      }
      if (sqlText.includes("DELETE FROM member_tokens") && sqlText.includes("WHERE user_id = $1")) {
        return rowsResult([{ token_id: "tok_user_123" }]);
      }
      if (sqlText.includes("DELETE FROM audit_logs") && sqlText.includes("WHERE actor_user_id = $1")) {
        return rowsResult([]);
      }
      if (sqlText.includes("DELETE FROM users")) {
        return rowsResult([]);
      }

      throw new Error(`Unhandled SQL in deleteAccountForOrganization collaborator cleanup: ${sqlText}`);
    });

    const store = createPostgresAccountStore({ query } as Queryable);

    const result = await store.deleteAccountForOrganization({
      organization_id: "org_123",
      user_id: "usr_123",
      deleted_at: "2026-04-06T00:00:00.000Z"
    });

    expect(result).toEqual({
      deleted_at: "2026-04-06T00:00:00.000Z",
      organization_id: "org_123",
      deleted_project_ids: ["proj_123"],
      user_deleted: true,
      deleted_member_token_count: 1
    });
    expect(query).toHaveBeenCalledWith("COMMIT", []);
  });
});
