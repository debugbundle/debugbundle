import { describe, expect, it, vi } from "vitest";

import {
  bootstrapStorageSchema,
  REQUIRED_API_TABLES,
  REQUIRED_WORKER_TABLES,
  STORAGE_BOOTSTRAP_SQL
} from "../../../packages/storage/src/migrations.js";

const ALL_REQUIRED_TABLES = Array.from(new Set([...REQUIRED_API_TABLES, ...REQUIRED_WORKER_TABLES]));

describe("storage bootstrap schema", () => {
  it("should bootstrap an empty schema inside a transaction", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValue({ rows: [] });

    const result = await bootstrapStorageSchema({ query });

    expect(result).toEqual({ status: "bootstrapped" });
    expect(query).toHaveBeenCalledWith("BEGIN", []);
    expect(query).toHaveBeenCalledWith("COMMIT", []);
  });

  it("should no-op when the clean schema is already bootstrapped", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: ALL_REQUIRED_TABLES.map((table_name) => ({ table_name }))
      });

    const result = await bootstrapStorageSchema({ query });

    expect(result).toEqual({ status: "already_bootstrapped" });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("should leave schema evolution to db migrations when all required tables already exist", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: ALL_REQUIRED_TABLES.map((table_name) => ({ table_name }))
      });

    const result = await bootstrapStorageSchema({ query });

    expect(result).toEqual({ status: "already_bootstrapped" });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("should fail when a legacy schema history table is present", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ table_name: "schema_migrations" }] });

    await expect(bootstrapStorageSchema({ query })).rejects.toThrow("storage_bootstrap_legacy_schema_detected");
  });

  it("should fail when only part of the required schema exists", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ table_name: "users" }, { table_name: "organizations" }] });

    await expect(bootstrapStorageSchema({ query })).rejects.toThrow("storage_bootstrap_partial_schema_detected");
  });

  it("should rollback and surface bootstrap failures", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("db exploded"))
      .mockResolvedValueOnce({ rows: [] });

    await expect(bootstrapStorageSchema({ query })).rejects.toThrow("storage_bootstrap_failed: db exploded");
    expect(query).toHaveBeenCalledWith("ROLLBACK", []);
    expect(query).not.toHaveBeenCalledWith("COMMIT", []);
  });

  it("should surface rollback failure details", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("bootstrap blew up"))
      .mockRejectedValueOnce(new Error("rollback blew up"));

    let thrown: unknown;
    try {
      await bootstrapStorageSchema({ query });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain("storage_bootstrap_rollback_failed");
    expect(message).toContain("bootstrap blew up");
    expect(message).toContain("rollback blew up");
  });

  it("should stringify non-Error bootstrap failures", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce("plain string failure")
      .mockResolvedValueOnce({ rows: [] });

    await expect(bootstrapStorageSchema({ query })).rejects.toThrow("plain string failure");
  });

  it("should stringify non-Error rollback failures", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce("bootstrap failed badly")
      .mockRejectedValueOnce("rollback failed badly");

    let thrown: unknown;
    try {
      await bootstrapStorageSchema({ query });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain("bootstrap_error=bootstrap failed badly");
    expect(message).toContain("rollback_error=rollback failed badly");
  });

  it("should expose required tables for auth, alert, billing, and github flows", (): void => {
    expect(REQUIRED_API_TABLES).toContain("email_auth_challenges");
    expect(REQUIRED_API_TABLES).toContain("account_deletion_challenges");
    expect(REQUIRED_API_TABLES).toContain("oauth_identities");
    expect(REQUIRED_API_TABLES).toContain("processed_billing_events");
    expect(REQUIRED_API_TABLES).toContain("project_usage_counters");
    expect(REQUIRED_API_TABLES).toContain("account_analytics_accounts");
    expect(REQUIRED_API_TABLES).toContain("account_metric_periods");
    expect(REQUIRED_API_TABLES).toContain("account_metric_events");
    expect(REQUIRED_API_TABLES).toContain("account_payment_retention_records");
    expect(REQUIRED_API_TABLES).toContain("account_payment_provider_events");
    expect(REQUIRED_API_TABLES).toContain("processed_github_marketplace_events");
    expect(REQUIRED_API_TABLES).toContain("github_marketplace_accounts");
    expect(REQUIRED_API_TABLES).toContain("github_dispatch_deliveries");
    expect(REQUIRED_API_TABLES).toContain("slack_destinations");
    expect(REQUIRED_WORKER_TABLES).toContain("alert_deliveries");
    expect(REQUIRED_WORKER_TABLES).toContain("alert_email_digests");
    expect(REQUIRED_WORKER_TABLES).toContain("alert_email_digest_items");
    expect(REQUIRED_WORKER_TABLES).toContain("slack_destinations");
    expect(REQUIRED_WORKER_TABLES).toContain("weekly_report_deliveries");
    expect(REQUIRED_API_TABLES).toContain("availability_checks");
    expect(REQUIRED_API_TABLES).toContain("availability_check_results");
    expect(REQUIRED_WORKER_TABLES).toContain("availability_check_daily_rollups");
  });

  it("should describe the final schema directly without schema evolution sql", (): void => {
    expect(STORAGE_BOOTSTRAP_SQL.includes("schema_migrations")).toBe(false);
    expect(STORAGE_BOOTSTRAP_SQL.includes("ALTER TABLE")).toBe(false);
    expect(STORAGE_BOOTSTRAP_SQL.includes("IF NOT EXISTS")).toBe(false);
    expect(STORAGE_BOOTSTRAP_SQL.includes(":legacy-")).toBe(false);
  });

  it("should include critical foreign keys with the expected deletion behavior", (): void => {
    expect(STORAGE_BOOTSTRAP_SQL.includes("organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("digest_id uuid NOT NULL REFERENCES alert_email_digests(id) ON DELETE CASCADE")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("webhook_id uuid REFERENCES agent_webhooks(id) ON DELETE CASCADE")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("installation_id uuid NOT NULL REFERENCES github_installations(id) ON DELETE CASCADE")).toBe(true);
  });

  it("should include critical uniqueness constraints for ownership and delivery paths", (): void => {
    expect(STORAGE_BOOTSTRAP_SQL.includes("UNIQUE (project_id, environment, service_id, fingerprint)")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("UNIQUE (organization_id, user_id)")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("email text NOT NULL UNIQUE")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("project_id uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("rule_name text NOT NULL")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("rule_id uuid NOT NULL REFERENCES github_dispatch_rules(id) ON DELETE CASCADE")).toBe(false);
    expect(STORAGE_BOOTSTRAP_SQL.includes("CREATE INDEX plan_cleanup_tasks_pending_idx")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("CREATE UNIQUE INDEX github_dispatch_deliveries_rule_dedupe_key_idx")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("CREATE UNIQUE INDEX alert_email_digests_project_recipient_pending_idx")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("CREATE TABLE project_usage_counters")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("CREATE TABLE account_analytics_accounts")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("CREATE TABLE account_metric_periods")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("CREATE TABLE account_metric_events")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("CREATE TABLE account_payment_retention_records")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("CREATE TABLE account_payment_provider_events")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("UNIQUE (organization_id, slack_team_id, slack_channel_id)")).toBe(true);
  });

  it("should encode improvement constraints directly in the bootstrap schema", (): void => {
    expect(
      STORAGE_BOOTSTRAP_SQL.includes(
        "improvement_bundle_sensitivity text NOT NULL DEFAULT 'high_confidence'\n        CHECK (improvement_bundle_sensitivity IN ('high_confidence', 'balanced', 'verbose'))"
      )
    ).toBe(true);
    expect(
      STORAGE_BOOTSTRAP_SQL.includes(
        "CHECK (\n        (incident_id IS NOT NULL AND improvement_opportunity_id IS NULL AND bundle_type = 'failure')\n        OR (incident_id IS NULL AND improvement_opportunity_id IS NOT NULL AND bundle_type = 'improvement')\n      )"
      )
    ).toBe(true);
  });

  it("should include hot-path indexes for retrieval and claim queries", (): void => {
    expect(STORAGE_BOOTSTRAP_SQL.includes("incident_events_incident_occurred_event_idx")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("webhook_deliveries_status_next_attempt_idx")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("github_dispatch_deliveries_status_next_attempt_idx")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("alert_email_digests_status_next_attempt_idx")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("sessions_token_hash_idx")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("alert_deliveries_project_status_idx")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("organizations_stripe_customer_id_key")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("slack_destinations_org_active_idx")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("github_marketplace_accounts_installation_idx")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("account_metric_periods_grain_period_metric_idx")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("account_payment_provider_events_provider_event_key")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("CREATE TABLE availability_checks")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("CREATE TABLE availability_check_results")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("CREATE TABLE availability_check_daily_rollups")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("severity_lifecycle_scope text")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("alert_rules_severity_lifecycle_scope_check")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("availability_checks_due_idx")).toBe(true);
    expect(STORAGE_BOOTSTRAP_SQL.includes("availability_check_results_check_started_idx")).toBe(true);
  });
});
