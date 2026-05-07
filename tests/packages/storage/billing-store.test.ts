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
      now: "2026-03-15T12:00:00.000Z",
    });

    // Find the incident_events count query
    const incidentEventsCall = calls.find(
      (c) => c.sql.includes("FROM incident_events")
    );
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
        included: 2,
        additional_purchased: 3,
        total: 5
      },
      allowances: {
        monthly_bundle_requests: { used: 0, limit: 1250 },
        monthly_raw_ingested_events: { used: 0, limit: 10000 },
        retained_bundle_cap: { used: 0, limit: 750 },
        monthly_remote_activations: { used: 0, limit: 125 },
        monthly_alert_deliveries: { used: 0, limit: 375 }
      }
    });
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
    expect(organizationCall!.sql).toContain("to_jsonb(organizations) ->> 'additional_capacity_units'");
    expect(organizationCall!.sql).toContain("to_jsonb(organizations) ->> 'billing_period_starts_at'");
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
          rows: [{
            plan: "solo",
            stripe_customer_id: "cus_123",
            additional_capacity_units: 0,
            billing_period_starts_at: "2026-03-23T00:00:00.000Z",
            billing_period_ends_at: "2026-04-23T00:00:00.000Z"
          }]
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
          rows: [{
            plan: "solo",
            stripe_customer_id: "cus_123",
            additional_capacity_units: 0,
            billing_period_starts_at: null,
            billing_period_ends_at: null
          }]
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
