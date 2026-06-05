import { describe, expect, it, vi } from "vitest";

import { createPostgresBillingSyncStore } from "../../../packages/storage/src/billing-sync-store.js";

function findSqlCall(
  query: ReturnType<typeof vi.fn>,
  pattern: string
): [string, unknown[]] {
  const call = query.mock.calls.find(([sql]) => String(sql).includes(pattern));
  expect(call).toBeDefined();
  return call as [string, unknown[]];
}

function createMockDb(): {
  query: ReturnType<typeof vi.fn>;
  store: ReturnType<typeof createPostgresBillingSyncStore>;
} {
  const query = vi.fn();
  return { query, store: createPostgresBillingSyncStore({ query }) };
}

describe("createPostgresBillingSyncStore", () => {
  describe("isEventProcessed", () => {
    it("should return true when event exists", async () => {
      const { query, store } = createMockDb();
      query.mockResolvedValue({ rows: [{ exists: true }] });

      const result = await store.isEventProcessed("evt_123");

      expect(result).toBe(true);
      expect(query).toHaveBeenCalledWith(expect.stringContaining("processed_billing_events"), [
        "evt_123"
      ]);
    });

    it("should return false when event does not exist", async () => {
      const { query, store } = createMockDb();
      query.mockResolvedValue({ rows: [{ exists: false }] });

      const result = await store.isEventProcessed("evt_456");

      expect(result).toBe(false);
    });

    it("should return false when query returns empty rows", async () => {
      const { query, store } = createMockDb();
      query.mockResolvedValue({ rows: [] });

      const result = await store.isEventProcessed("evt_empty");

      expect(result).toBe(false);
    });
  });

  describe("markEventProcessed", () => {
    it("should insert event with organization_id", async () => {
      const { query, store } = createMockDb();
      query.mockResolvedValue({ rows: [] });

      await store.markEventProcessed("evt_123", "checkout.session.completed", "org_abc");

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO processed_billing_events"),
        ["evt_123", "checkout.session.completed", "org_abc"]
      );
    });

    it("should insert event with null organization_id", async () => {
      const { query, store } = createMockDb();
      query.mockResolvedValue({ rows: [] });

      await store.markEventProcessed("evt_456", "unknown_event", null);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO processed_billing_events"),
        ["evt_456", "unknown_event", null]
      );
    });

    it("should use ON CONFLICT DO NOTHING for idempotency", async () => {
      const { query, store } = createMockDb();
      query.mockResolvedValue({ rows: [] });

      await store.markEventProcessed("evt_789", "invoice.paid", "org_xyz");

      expect(query).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT"), expect.any(Array));
    });
  });

  describe("updateEntitlements", () => {
    it("should update organization with all entitlement fields", async () => {
      const { query, store } = createMockDb();
      query.mockResolvedValue({ rows: [] });

      await store.updateEntitlements({
        organization_id: "org_abc",
        plan: "team",
        additional_capacity_units: 2,
        billing_state: "active",
        stripe_customer_id: "cus_123",
        stripe_subscription_id: "sub_456",
        billing_period_starts_at: "2026-03-01T00:00:00.000Z",
        billing_period_ends_at: "2026-04-01T00:00:00.000Z",
        last_billing_sync_at: "2026-03-01T00:00:00.000Z",
        last_billing_event_id: "evt_789"
      });

      expect(query).toHaveBeenCalledWith("BEGIN", []);
      expect(query).toHaveBeenCalledWith("COMMIT", []);
      const [sql, params] = findSqlCall(query, "UPDATE organizations");
      expect(sql).toContain("UPDATE organizations");
      expect(sql).toContain("plan = $2");
      expect(sql).toContain("additional_capacity_units = $3");
      expect(sql).toContain("billing_state = $4");
      expect(sql).toContain("stripe_customer_id = $5");
      expect(sql).toContain("stripe_subscription_id = $6");
      expect(sql).toContain("billing_period_starts_at = $7::timestamptz");
      expect(sql).toContain("billing_period_ends_at = $8::timestamptz");
      expect(sql).toContain("trial_converted_at = CASE");
      expect(params).toEqual([
        "org_abc",
        "team",
        2,
        "active",
        "cus_123",
        "sub_456",
        "2026-03-01T00:00:00.000Z",
        "2026-04-01T00:00:00.000Z",
        "2026-03-01T00:00:00.000Z",
        "evt_789"
      ]);
    });

    it("should handle null billing_period_ends_at", async () => {
      const { query, store } = createMockDb();
      query.mockResolvedValue({ rows: [] });

      await store.updateEntitlements({
        organization_id: "org_abc",
        plan: "solo",
        additional_capacity_units: 0,
        billing_state: "active",
        stripe_customer_id: "cus_123",
        stripe_subscription_id: "sub_456",
        billing_period_starts_at: null,
        billing_period_ends_at: null,
        last_billing_sync_at: "2026-03-01T00:00:00.000Z",
        last_billing_event_id: "evt_789"
      });

      const [, params] = findSqlCall(query, "UPDATE organizations");
      expect(params[6]).toBeNull();
      expect(params[7]).toBeNull();
    });

    it("marks trial_converted_at when syncing a paid entitlement for a prior trial", async () => {
      const { query, store } = createMockDb();
      query.mockResolvedValue({ rows: [] });

      await store.updateEntitlements({
        organization_id: "org_trial",
        plan: "solo",
        additional_capacity_units: 0,
        billing_state: "active",
        stripe_customer_id: "cus_trial",
        stripe_subscription_id: "sub_trial",
        billing_period_starts_at: "2026-03-01T00:00:00.000Z",
        billing_period_ends_at: "2026-04-01T00:00:00.000Z",
        last_billing_sync_at: "2026-03-02T00:00:00.000Z",
        last_billing_event_id: "evt_trial_convert"
      });

      const [sql] = findSqlCall(query, "UPDATE organizations");
      expect(sql).toContain(
        "WHEN $2 <> 'free' AND (to_jsonb(organizations) ->> 'trial_used_at') IS NOT NULL"
      );
      expect(sql).toContain(
        "COALESCE((to_jsonb(organizations) ->> 'trial_converted_at')::timestamptz, $9::timestamptz)"
      );
    });

    it("records cleanup-count audit metadata when Stripe sync lowers the plan", async () => {
      const { query, store } = createMockDb();
      query.mockImplementation((sql: string) => {
        if (sql.includes("SELECT COALESCE(plan, 'free') AS plan")) {
          return { rows: [{ plan: "team" }] };
        }

        if (sql.includes("UPDATE organizations")) {
          return { rows: [], rowCount: 1 };
        }

        if (sql.includes("JOIN project_members members")) {
          return { rows: [], rowCount: 2 };
        }

        if (sql.includes("FROM slack_destinations")) {
          return { rows: [], rowCount: 1 };
        }

        if (sql.includes("INSERT INTO audit_logs")) {
          return {
            rows: [
              {
                audit_log_id: "audit_123",
                organization_id: "org_abc",
                actor_user_id: null,
                actor_type: "system",
                action: "billing.plan_downgrade_cleanup",
                target_type: "organization",
                target_id: "org_abc",
                status: "success",
                ip_address: null,
                metadata: {},
                occurred_at: "2026-03-01T00:00:00.000Z",
                created_at: "2026-03-01T00:00:00.000Z"
              }
            ]
          };
        }

        return { rows: [], rowCount: 0 };
      });

      await store.updateEntitlements({
        organization_id: "org_abc",
        plan: "solo",
        additional_capacity_units: 0,
        billing_state: "active",
        stripe_customer_id: "cus_123",
        stripe_subscription_id: "sub_456",
        billing_period_starts_at: "2026-03-01T00:00:00.000Z",
        billing_period_ends_at: "2026-04-01T00:00:00.000Z",
        last_billing_sync_at: "2026-03-01T00:00:00.000Z",
        last_billing_event_id: "evt_789"
      });

      const auditCall = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO audit_logs"));
      expect(auditCall).toBeDefined();
      const metadata = JSON.parse(auditCall?.[1]?.[9] as string) as Record<string, unknown>;
      expect(metadata).toMatchObject({
        previous_plan: "team",
        target_plan: "solo",
        trigger_source: "stripe_sync",
        cleanup_summary: {
          suspended_project_members: 2,
          suspended_slack_destinations: 1
        }
      });
    });
  });

  describe("resolveOrganizationByStripeCustomerId", () => {
    it("should return organization id when found", async () => {
      const { query, store } = createMockDb();
      query.mockResolvedValue({ rows: [{ id: "org_found" }] });

      const result = await store.resolveOrganizationByStripeCustomerId("cus_123");

      expect(result).toBe("org_found");
      expect(query).toHaveBeenCalledWith(expect.stringContaining("stripe_customer_id"), [
        "cus_123"
      ]);
    });

    it("should return null when not found", async () => {
      const { query, store } = createMockDb();
      query.mockResolvedValue({ rows: [] });

      const result = await store.resolveOrganizationByStripeCustomerId("cus_unknown");

      expect(result).toBeNull();
    });
  });

  describe("linkStripeCustomer", () => {
    it("should update organization with stripe customer and subscription IDs", async () => {
      const { query, store } = createMockDb();
      query.mockResolvedValue({ rows: [] });

      await store.linkStripeCustomer("org_abc", "cus_123", "sub_456");

      const sql = query.mock.calls[0]?.[0] as string;
      const params = query.mock.calls[0]?.[1] as unknown[];
      expect(sql).toContain("UPDATE organizations");
      expect(sql).toContain("stripe_customer_id");
      expect(sql).toContain("stripe_subscription_id");
      expect(params).toEqual(["org_abc", "cus_123", "sub_456"]);
    });
  });

  describe("revokeEntitlements", () => {
    it("should set organization to free plan with canceled state", async () => {
      const { query, store } = createMockDb();
      query.mockResolvedValue({ rows: [] });

      await store.revokeEntitlements("org_abc", "evt_cancel");

      expect(query).toHaveBeenCalledWith("BEGIN", []);
      expect(query).toHaveBeenCalledWith("COMMIT", []);
      const [sql, params] = findSqlCall(query, "UPDATE organizations");
      expect(sql).toContain("plan = 'free'");
      expect(sql).toContain("additional_capacity_units = 0");
      expect(sql).toContain("billing_state = 'canceled'");
      expect(sql).toContain("billing_period_starts_at = NULL");
      expect(sql).toContain("billing_period_ends_at = NULL");
      expect(params).toEqual(["org_abc", "evt_cancel"]);
      expect(
        query.mock.calls.some((call) => String(call[0]).includes("JOIN github_dispatch_rules rules"))
      ).toBe(true);
    });

    it("rolls back when downgrade cleanup fails", async () => {
      const { query, store } = createMockDb();
      query.mockImplementation((sql: string) => {
        if (sql.includes("JOIN github_dispatch_rules rules")) {
          throw new Error("cleanup failed");
        }

        return { rows: [] };
      });

      await expect(store.revokeEntitlements("org_abc", "evt_cancel")).rejects.toThrow(
        "cleanup failed"
      );

      expect(query).toHaveBeenCalledWith("BEGIN", []);
      expect(query).toHaveBeenCalledWith("ROLLBACK", []);
      expect(query).not.toHaveBeenCalledWith("COMMIT", []);
    });
  });

  describe("updateBillingState", () => {
    it("should update only billing_state without changing plan or slots", async () => {
      const { query, store } = createMockDb();
      query.mockResolvedValue({ rows: [] });

      await store.updateBillingState("org_abc", "past_due", "evt_fail");

      const sql = query.mock.calls[0]?.[0] as string;
      const params = query.mock.calls[0]?.[1] as unknown[];
      expect(sql).toContain("billing_state = $2");
      expect(sql).not.toContain("plan =");
      expect(sql).not.toContain("additional_capacity_units");
      expect(params).toEqual(["org_abc", "past_due", "evt_fail"]);
    });
  });
});
