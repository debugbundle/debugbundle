import { describe, expect, it, vi } from "vitest";

import { createPostgresBillingStore } from "../../../packages/storage/src/billing-store.js";

describe("billing store – event_class filter", () => {
  it("uses incident_signal-only billing for free plans", async () => {
    // Track all SQL queries issued
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const query = vi.fn().mockImplementation((sql: string, params: unknown[]) => {
      calls.push({ sql, params });

      // Organization lookup
      if (sql.includes("FROM organizations")) {
        return { rows: [{ plan: "free", stripe_customer_id: null, additional_capacity_units: 0 }] };
      }
      // Table existence check for alert_deliveries
      if (sql.includes("to_regclass")) {
        return { rows: [{ exists: false }] };
      }
      // All count queries
      return { rows: [{ count: 0 }] };
    });

    const store = createPostgresBillingStore({ query });
    await store.getBillingSummaryForOrganization({
      organization_id: "org_123",
      now: "2026-03-15T12:00:00.000Z"
    });

    // Find the incident_events count query
    const incidentEventsCall = calls.find((c) => c.sql.includes("FROM incident_events"));
    expect(incidentEventsCall).toBeDefined();
    expect(incidentEventsCall!.sql).toContain("ie.event_class = 'incident_signal'");
  });

  it("counts incident and context signals for paid plans while excluding operational signals", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const query = vi.fn().mockImplementation((sql: string, params: unknown[]) => {
      calls.push({ sql, params });

      if (sql.includes("FROM organizations")) {
        return { rows: [{ plan: "team", stripe_customer_id: null, additional_capacity_units: 0 }] };
      }

      if (sql.includes("to_regclass")) {
        return { rows: [{ exists: false }] };
      }

      return { rows: [{ count: 0 }] };
    });

    const store = createPostgresBillingStore({ query });
    await store.getBillingSummaryForOrganization({
      organization_id: "org_123",
      now: "2026-03-15T12:00:00.000Z"
    });

    const incidentEventsCall = calls.find((c) => c.sql.includes("FROM incident_events"));
    expect(incidentEventsCall).toBeDefined();
    expect(incidentEventsCall!.sql).toContain("ie.event_class <> 'operational_signal'");
  });

  it("uses persisted additional_capacity_units for active-project and allowance capacity summaries", async () => {
    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("FROM organizations")) {
        return { rows: [{ plan: "solo", stripe_customer_id: null, additional_capacity_units: 3 }] };
      }

      if (sql.includes("to_regclass")) {
        return { rows: [{ exists: false }] };
      }

      if (sql.includes("FROM projects")) {
        return { rows: [{ count: 1 }] };
      }

      return { rows: [{ count: 0 }] };
    });

    const store = createPostgresBillingStore({ query });
    const summary = await store.getBillingSummaryForOrganization({
      organization_id: "org_123",
      now: "2026-03-15T12:00:00.000Z"
    });

    expect(summary).toMatchObject({
      active_projects: 1,
      capacity_units: {
        included: 3,
        additional_purchased: 3,
        total: 6
      },
      allowances: {
        monthly_bundle_requests: { used: 0, limit: 1500 },
        monthly_raw_ingested_events: { used: 0, limit: 21000 },
        retained_bundle_cap: { used: 0, limit: 900 },
        monthly_remote_activations: { used: 0, limit: 150 },
        monthly_alert_deliveries: { used: 0, limit: 450 },
        monthly_webhook_deliveries: { used: 0, limit: 1500 }
      }
    });
  });

  it("counts lifecycle webhook delivery rows against the webhook delivery allowance", async () => {
    const query = vi.fn().mockImplementation((sql: string, params: unknown[]) => {
      if (sql.includes("FROM organizations")) {
        return { rows: [{ plan: "free", stripe_customer_id: null, additional_capacity_units: 0 }] };
      }

      if (sql.includes("to_regclass")) {
        return { rows: [{ exists: params[0] === "public.webhook_deliveries" }] };
      }

      if (sql.includes("FROM webhook_deliveries")) {
        return { rows: [{ count: 12 }] };
      }

      return { rows: [{ count: 0 }] };
    });

    const store = createPostgresBillingStore({ query });
    const summary = await store.getBillingSummaryForOrganization({
      organization_id: "org_123",
      now: "2026-03-15T12:00:00.000Z"
    });

    expect(summary?.allowances.monthly_webhook_deliveries).toEqual({ used: 12, limit: 100 });
  });

  it("reads optional billing fields via row JSON so older local schemas do not break summary reads", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const query = vi.fn().mockImplementation((sql: string, params: unknown[]) => {
      calls.push({ sql, params });

      if (sql.includes("FROM organizations")) {
        return { rows: [{ plan: "free", stripe_customer_id: null }] };
      }

      if (sql.includes("to_regclass")) {
        return { rows: [{ exists: false }] };
      }

      return { rows: [{ count: 0 }] };
    });

    const store = createPostgresBillingStore({ query });
    const summary = await store.getBillingSummaryForOrganization({
      organization_id: "org_123",
      now: "2026-03-24T12:00:00.000Z"
    });

    const organizationCall = calls.find((call) => call.sql.includes("FROM organizations"));

    expect(organizationCall).toBeDefined();
    expect(organizationCall!.sql).toContain(
      "to_jsonb(organizations) ->> 'additional_capacity_units'"
    );
    expect(organizationCall!.sql).toContain(
      "to_jsonb(organizations) ->> 'billing_period_starts_at'"
    );
    expect(organizationCall!.sql).toContain("to_jsonb(organizations) ->> 'billing_period_ends_at'");
    expect(summary).toMatchObject({
      plan: "free",
      capacity_units: {
        additional_purchased: 0,
        total: 1
      },
      usage_window: {
        starts_at: "2026-03-01T00:00:00.000Z",
        ends_at: "2026-04-01T00:00:00.000Z"
      }
    });
  });

  it("uses the persisted Stripe billing period for paid usage windows", async () => {
    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("FROM organizations")) {
        return {
          rows: [
            {
              plan: "solo",
              stripe_customer_id: "cus_123",
              additional_capacity_units: 0,
              billing_period_starts_at: "2026-03-23T00:00:00.000Z",
              billing_period_ends_at: "2026-04-23T00:00:00.000Z"
            }
          ]
        };
      }

      if (sql.includes("to_regclass")) {
        return { rows: [{ exists: false }] };
      }

      return { rows: [{ count: 0 }] };
    });

    const store = createPostgresBillingStore({ query });
    const summary = await store.getBillingSummaryForOrganization({
      organization_id: "org_123",
      now: "2026-03-24T12:00:00.000Z"
    });

    expect(summary?.usage_window).toEqual({
      starts_at: "2026-03-23T00:00:00.000Z",
      ends_at: "2026-04-23T00:00:00.000Z"
    });
  });

  it("falls back to calendar-month windows when no Stripe billing period is stored", async () => {
    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("FROM organizations")) {
        return {
          rows: [
            {
              plan: "solo",
              stripe_customer_id: "cus_123",
              additional_capacity_units: 0,
              billing_period_starts_at: null,
              billing_period_ends_at: null
            }
          ]
        };
      }

      if (sql.includes("to_regclass")) {
        return { rows: [{ exists: false }] };
      }

      return { rows: [{ count: 0 }] };
    });

    const store = createPostgresBillingStore({ query });
    const summary = await store.getBillingSummaryForOrganization({
      organization_id: "org_123",
      now: "2026-03-24T12:00:00.000Z"
    });

    expect(summary?.usage_window).toEqual({
      starts_at: "2026-03-01T00:00:00.000Z",
      ends_at: "2026-04-01T00:00:00.000Z"
    });
  });

  it("uses org_usage_counters when counter exceeds derived incident_events count", async () => {
    const query = vi.fn().mockImplementation((sql: string, params: unknown[]) => {
      if (sql.includes("FROM organizations")) {
        return { rows: [{ plan: "free", stripe_customer_id: null, additional_capacity_units: 0 }] };
      }

      if (sql.includes("to_regclass")) {
        const tableName = (params as string[])[0];
        if (tableName === "public.org_usage_counters") {
          return { rows: [{ exists: true }] };
        }
        return { rows: [{ exists: false }] };
      }

      // Counter table returns 500 (previously consumed events that survived delete)
      if (sql.includes("FROM org_usage_counters")) {
        return { rows: [{ count: 500 }] };
      }

      // Derived incident_events count returns 100 (post-delete)
      if (sql.includes("FROM incident_events")) {
        return { rows: [{ count: 100 }] };
      }

      return { rows: [{ count: 0 }] };
    });

    const store = createPostgresBillingStore({ query });
    const summary = await store.getBillingSummaryForOrganization({
      organization_id: "org_123",
      now: "2026-03-15T12:00:00.000Z"
    });

    // Should use 500 (counter) not 100 (derived), protecting against quota reset via delete
    expect(summary?.allowances.monthly_raw_ingested_events.used).toBe(500);
  });

  it("uses derived count when it exceeds the org_usage_counter", async () => {
    const query = vi.fn().mockImplementation((sql: string, params: unknown[]) => {
      if (sql.includes("FROM organizations")) {
        return { rows: [{ plan: "free", stripe_customer_id: null, additional_capacity_units: 0 }] };
      }

      if (sql.includes("to_regclass")) {
        const tableName = (params as string[])[0];
        if (tableName === "public.org_usage_counters") {
          return { rows: [{ exists: true }] };
        }
        return { rows: [{ exists: false }] };
      }

      if (sql.includes("FROM org_usage_counters")) {
        return { rows: [{ count: 50 }] };
      }

      if (sql.includes("FROM incident_events")) {
        return { rows: [{ count: 200 }] };
      }

      return { rows: [{ count: 0 }] };
    });

    const store = createPostgresBillingStore({ query });
    const summary = await store.getBillingSummaryForOrganization({
      organization_id: "org_123",
      now: "2026-03-15T12:00:00.000Z"
    });

    // Should use 200 (derived) since it's higher than 50 (counter)
    expect(summary?.allowances.monthly_raw_ingested_events.used).toBe(200);
  });

  it("falls back to derived count when org_usage_counters table does not exist", async () => {
    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("FROM organizations")) {
        return { rows: [{ plan: "free", stripe_customer_id: null, additional_capacity_units: 0 }] };
      }

      if (sql.includes("to_regclass")) {
        return { rows: [{ exists: false }] };
      }

      if (sql.includes("FROM incident_events")) {
        return { rows: [{ count: 300 }] };
      }

      return { rows: [{ count: 0 }] };
    });

    const store = createPostgresBillingStore({ query });
    const summary = await store.getBillingSummaryForOrganization({
      organization_id: "org_123",
      now: "2026-03-15T12:00:00.000Z"
    });

    expect(summary?.allowances.monthly_raw_ingested_events.used).toBe(300);
  });

  it("surfaces trial metadata and remaining days for active no-card trials", async () => {
    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("FROM organizations")) {
        return {
          rows: [
            {
              plan: "team",
              billing_state: "trialing",
              stripe_customer_id: null,
              stripe_subscription_id: null,
              additional_capacity_units: 0,
              billing_period_starts_at: "2026-03-15T00:00:00.000Z",
              billing_period_ends_at: "2026-04-14T00:00:00.000Z",
              trial_plan: "team",
              trial_started_at: "2026-03-15T00:00:00.000Z",
              trial_ends_at: "2026-04-14T00:00:00.000Z",
              trial_used_at: "2026-03-15T00:00:00.000Z",
              trial_converted_at: null,
              trial_expired_at: null
            }
          ]
        };
      }

      if (sql.includes("to_regclass")) {
        return { rows: [{ exists: false }] };
      }

      return { rows: [{ count: 0 }] };
    });

    const store = createPostgresBillingStore({ query });
    const summary = await store.getBillingSummaryForOrganization({
      organization_id: "org_trial",
      now: "2026-03-20T12:00:00.000Z"
    });

    expect(summary).toMatchObject({
      plan: "team",
      billing_state: "trialing",
      trial: {
        available: false,
        active: true,
        plan: "team",
        started_at: "2026-03-15T00:00:00.000Z",
        ends_at: "2026-04-14T00:00:00.000Z",
        used_at: "2026-03-15T00:00:00.000Z",
        converted_at: null,
        expired_at: null,
        days_remaining: 25
      }
    });
  });
});

describe("billing store – incrementOrgUsageCounter", () => {
  it("issues UPSERT SQL with correct parameters", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const query = vi.fn().mockImplementation((sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return { rows: [] };
    });

    const store = createPostgresBillingStore({ query });
    await store.incrementOrgUsageCounter({
      organization_id: "org_abc",
      period_starts_at: "2026-03-01T00:00:00.000Z",
      count: 5
    });

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.sql).toContain("INSERT INTO org_usage_counters");
    expect(call.sql).toContain("ON CONFLICT");
    expect(call.sql).toContain("raw_ingested_events + EXCLUDED.raw_ingested_events");
    expect(call.params).toEqual(["org_abc", "2026-03-01T00:00:00.000Z", 5]);
  });
});

describe("billing store – trial lifecycle", () => {
  it("starts an eligible trial and returns the updated summary", async () => {
    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("UPDATE organizations") && sql.includes("billing_state = 'trialing'")) {
        return { rows: [{ id: "org_trial" }] };
      }

      if (sql.includes("FROM organizations")) {
        return {
          rows: [
            {
              plan: "solo",
              billing_state: "trialing",
              stripe_customer_id: null,
              stripe_subscription_id: null,
              additional_capacity_units: 0,
              billing_period_starts_at: "2026-03-01T00:00:00.000Z",
              billing_period_ends_at: "2026-03-31T00:00:00.000Z",
              trial_plan: "solo",
              trial_started_at: "2026-03-01T00:00:00.000Z",
              trial_ends_at: "2026-03-31T00:00:00.000Z",
              trial_used_at: "2026-03-01T00:00:00.000Z",
              trial_converted_at: null,
              trial_expired_at: null
            }
          ]
        };
      }

      if (sql.includes("to_regclass")) {
        return { rows: [{ exists: false }] };
      }

      return { rows: [{ count: 0 }] };
    });

    const store = createPostgresBillingStore({ query });
    const summary = await store.startTrialForOrganization({
      organization_id: "org_trial",
      target_plan: "solo",
      started_at: "2026-03-01T00:00:00.000Z",
      ends_at: "2026-03-31T00:00:00.000Z"
    });

    expect(typeof summary).not.toBe("string");
    expect(summary).toMatchObject({
      plan: "solo",
      billing_state: "trialing",
      trial: {
        active: true,
        plan: "solo",
        available: false
      }
    });
  });

  it("rejects starting a second trial after one has been used", async () => {
    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("UPDATE organizations") && sql.includes("billing_state = 'trialing'")) {
        return { rows: [] };
      }

      if (sql.includes("SELECT id::text AS id")) {
        return { rows: [{ id: "org_trial" }] };
      }

      return { rows: [] };
    });

    const store = createPostgresBillingStore({ query });
    const result = await store.startTrialForOrganization({
      organization_id: "org_trial",
      target_plan: "team",
      started_at: "2026-03-01T00:00:00.000Z",
      ends_at: "2026-03-31T00:00:00.000Z"
    });

    expect(result).toBe("trial_unavailable");
  });

  it("expires an overdue unconverted trial idempotently", async () => {
    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("UPDATE organizations") && sql.includes("billing_state = 'trial_expired'")) {
        return { rows: [{ id: "org_trial" }] };
      }

      if (sql.includes("FROM organizations")) {
        return {
          rows: [
            {
              plan: "free",
              billing_state: "trial_expired",
              stripe_customer_id: null,
              stripe_subscription_id: null,
              additional_capacity_units: 0,
              billing_period_starts_at: null,
              billing_period_ends_at: null,
              trial_plan: "solo",
              trial_started_at: "2026-03-01T00:00:00.000Z",
              trial_ends_at: "2026-03-31T00:00:00.000Z",
              trial_used_at: "2026-03-01T00:00:00.000Z",
              trial_converted_at: null,
              trial_expired_at: "2026-04-01T00:00:00.000Z"
            }
          ]
        };
      }

      if (sql.includes("to_regclass")) {
        return { rows: [{ exists: false }] };
      }

      return { rows: [{ count: 0 }] };
    });

    const store = createPostgresBillingStore({ query });
    const summary = await store.expireTrialForOrganization({
      organization_id: "org_trial",
      now: "2026-04-01T00:00:00.000Z"
    });

    expect(typeof summary).not.toBe("string");
    expect(summary).toMatchObject({
      plan: "free",
      billing_state: "trial_expired",
      trial: {
        active: false,
        expired_at: "2026-04-01T00:00:00.000Z"
      }
    });
  });

  it("returns unrecorded trial lifecycle candidates and records the ledger after side effects", async () => {
    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("FROM organizations") && sql.includes("trial_started_at")) {
        return {
          rows: [
            {
              organization_id: "org_trial",
              current_plan: "team",
              trial_plan: "team",
              trial_started_at: "2026-06-01T00:00:00.000Z",
              trial_ends_at: "2026-07-01T00:00:00.000Z",
              trial_converted_at: null,
              trial_expired_at: null
            }
          ]
        };
      }

      if (sql.includes("SELECT EXISTS") && sql.includes("trial_lifecycle_events")) {
        return { rows: [{ exists: false }] };
      }

      if (sql.includes("INSERT INTO trial_lifecycle_events")) {
        return { rows: [{ id: "tle_123" }] };
      }

      return { rows: [] };
    });

    const store = createPostgresBillingStore({ query });
    const claimed = await store.claimTrialStartedNotificationCandidates({ limit: 5 });

    expect(claimed).toEqual([
      {
        organization_id: "org_trial",
        current_plan: "team",
        trial_plan: "team",
        trial_started_at: "2026-06-01T00:00:00.000Z",
        trial_ends_at: "2026-07-01T00:00:00.000Z",
        trial_converted_at: null,
        trial_expired_at: null
      }
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT EXISTS"),
      [
        "org_trial",
        "trial_started_email",
        "2026-06-01T00:00:00.000Z"
      ]
    );

    await expect(
      store.recordTrialLifecycleEvent({
        organization_id: "org_trial",
        event_type: "trial_started_email",
        dedupe_key: "2026-06-01T00:00:00.000Z"
      })
    ).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO trial_lifecycle_events"),
      expect.arrayContaining([
        expect.any(String),
        "org_trial",
        "trial_started_email",
        "2026-06-01T00:00:00.000Z"
      ])
    );
  });
});
