import { describe, expect, it, vi } from "vitest";

import { createPostgresImprovementOpportunityStore } from "../../../packages/storage/src/improvement-opportunity-store.js";

// Real service identity/fencing is qualified in PostgreSQL integration. These
// cases isolate opportunity persistence, dedupe and lifecycle accounting.
vi.mock("../../../packages/storage/src/metadata-incident-shared.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../packages/storage/src/metadata-incident-shared.js")
    >();
  return {
    ...actual,
    getOrCreateServiceIdentity: vi.fn(
      async (
        _db: unknown,
        _project: string,
        name: string
      ): Promise<{ service_id: string; input_name: string }> => ({
        service_id: "00000000-0000-4000-8000-000000000001",
        input_name: name
      })
    )
  };
});

describe("improvement occurrences", () => {
  it("records warning hotspots and returns the generation trigger decision", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          opportunity_id: "imp_123",
          occurrence_count: 5,
          bundle_generation_number: 0,
          event_recorded: true
        }
      ]
    });

    const store = createPostgresImprovementOpportunityStore({ query });
    const result = await store.recordWarningHotspot({
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      normalized_message: "Payment provider warning",
      source_event_id: "evt_123",
      occurred_at: "2026-05-18T12:00:00.000Z",
      severity: "medium",
      confidence: 0.7,
      threshold: 5
    });

    expect(result).toEqual({
      opportunity_id: "imp_123",
      occurrence_count: 5,
      bundle_generation_number: 0,
      should_generate_bundle: true
    });
    expect(query).toHaveBeenCalledOnce();
    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("INSERT INTO improvement_opportunities");
    expect(sql).toContain("INSERT INTO improvement_opportunity_events");
  });

  it("does not trigger generation when the source event was already counted", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          opportunity_id: "imp_123",
          occurrence_count: 5,
          bundle_generation_number: 0,
          event_recorded: false
        }
      ]
    });

    const store = createPostgresImprovementOpportunityStore({ query });
    const result = await store.recordWarningHotspot({
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      normalized_message: "Payment provider warning",
      source_event_id: "evt_123",
      occurred_at: "2026-05-18T12:00:00.000Z",
      severity: "medium",
      confidence: 0.7,
      threshold: 5
    });

    expect(result).toEqual({
      opportunity_id: "imp_123",
      occurrence_count: 5,
      bundle_generation_number: 0,
      should_generate_bundle: false
    });
    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("existing_event AS");
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM existing_event) AS event_recorded");
    expect(sql).toContain("EXISTS (SELECT 1 FROM inserted_event)");
  });

  it("keeps snoozed improvements snoozed until the snooze window expires", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            opportunity_id: "imp_123",
            occurrence_count: 6,
            bundle_generation_number: 0,
            event_recorded: true,
            opportunity_created: false,
            prior_status: "snoozed",
            prior_snoozed_until: "2026-05-25T13:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [{ organization_id: "org_123" }]
      });
    const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");
    const tx = { query };
    const db = {
      query,
      transaction: async <Result>(
        callback: (queryable: typeof tx) => Promise<Result>
      ): Promise<Result> => callback(tx)
    };

    const store = createPostgresImprovementOpportunityStore(db, {
      accountAnalyticsStore: {
        withDb: vi.fn().mockReturnValue({ recordMetricDeltas }),
        ensureAnalyticsAccount: vi.fn(),
        recordMetricDeltas,
        markAccountDeleted: vi.fn(),
        preserveBillingRetentionForDeletedOrganization: vi.fn(),
        getAccountMetricSummary: vi.fn(),
        listAccountMetricPeriods: vi.fn(),
        getAggregateMetricSummary: vi.fn(),
        getAdminAnalyticsSummary: vi.fn(),
        backfillRetainedRowsForOrganization: vi.fn()
      }
    });

    const result = await store.recordWarningHotspot({
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      normalized_message: "Payment provider warning",
      source_event_id: "evt_124",
      occurred_at: "2026-05-20T12:00:00.000Z",
      severity: "medium",
      confidence: 0.7,
      threshold: 5
    });

    expect(result).toEqual({
      opportunity_id: "imp_123",
      occurrence_count: 6,
      bundle_generation_number: 0,
      should_generate_bundle: false
    });
    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("improvement_opportunities.status = 'snoozed'");
    expect(sql).toContain("improvement_opportunities.snoozed_until > EXCLUDED.last_detected_at");
    expect(recordMetricDeltas).not.toHaveBeenCalled();
  });

  it("reopens snoozed improvements after the snooze window expires", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            opportunity_id: "imp_123",
            occurrence_count: 6,
            bundle_generation_number: 0,
            event_recorded: true,
            opportunity_created: false,
            prior_status: "snoozed",
            prior_snoozed_until: "2026-05-19T12:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [{ organization_id: "org_123" }]
      });
    const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");
    const tx = { query };
    const db = {
      query,
      transaction: async <Result>(
        callback: (queryable: typeof tx) => Promise<Result>
      ): Promise<Result> => callback(tx)
    };

    const store = createPostgresImprovementOpportunityStore(db, {
      accountAnalyticsStore: {
        withDb: vi.fn().mockReturnValue({ recordMetricDeltas }),
        ensureAnalyticsAccount: vi.fn(),
        recordMetricDeltas,
        markAccountDeleted: vi.fn(),
        preserveBillingRetentionForDeletedOrganization: vi.fn(),
        getAccountMetricSummary: vi.fn(),
        listAccountMetricPeriods: vi.fn(),
        getAggregateMetricSummary: vi.fn(),
        getAdminAnalyticsSummary: vi.fn(),
        backfillRetainedRowsForOrganization: vi.fn()
      }
    });

    const result = await store.recordWarningHotspot({
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      normalized_message: "Payment provider warning",
      source_event_id: "evt_125",
      occurred_at: "2026-05-20T12:00:00.000Z",
      severity: "medium",
      confidence: 0.7,
      threshold: 5
    });

    expect(result).toEqual({
      opportunity_id: "imp_123",
      occurrence_count: 6,
      bundle_generation_number: 0,
      should_generate_bundle: true
    });
    expect(recordMetricDeltas).toHaveBeenCalledWith({
      organization_id: "org_123",
      occurred_at: "2026-05-20T12:00:00.000Z",
      source: "improvement_occurrence",
      dedupe_key: "improvement_occurrence:imp_123:evt_125",
      deltas: {
        improvements_reopened: 1
      }
    });
  });

  it("records opened improvement metrics when a new warning hotspot is persisted", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            opportunity_id: "imp_123",
            occurrence_count: 5,
            bundle_generation_number: 0,
            event_recorded: true,
            opportunity_created: true,
            prior_status: null
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [{ organization_id: "org_123" }]
      });
    const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");
    const tx = { query };
    const db = {
      query,
      transaction: async <Result>(
        callback: (queryable: typeof tx) => Promise<Result>
      ): Promise<Result> => callback(tx)
    };

    const store = createPostgresImprovementOpportunityStore(db, {
      accountAnalyticsStore: {
        withDb: vi.fn().mockReturnValue({ recordMetricDeltas }),
        ensureAnalyticsAccount: vi.fn(),
        recordMetricDeltas,
        markAccountDeleted: vi.fn(),
        preserveBillingRetentionForDeletedOrganization: vi.fn(),
        getAccountMetricSummary: vi.fn(),
        listAccountMetricPeriods: vi.fn(),
        getAggregateMetricSummary: vi.fn(),
        getAdminAnalyticsSummary: vi.fn(),
        backfillRetainedRowsForOrganization: vi.fn()
      }
    });

    const result = await store.recordWarningHotspot({
      project_id: "proj_123",
      service_name: "checkout-api",
      environment: "production",
      normalized_message: "Payment provider warning",
      source_event_id: "evt_123",
      occurred_at: "2026-05-18T12:00:00.000Z",
      severity: "medium",
      confidence: 0.7,
      threshold: 5
    });

    expect(result).toEqual({
      opportunity_id: "imp_123",
      occurrence_count: 5,
      bundle_generation_number: 0,
      should_generate_bundle: true
    });
    expect(recordMetricDeltas).toHaveBeenCalledWith({
      organization_id: "org_123",
      occurred_at: "2026-05-18T12:00:00.000Z",
      source: "improvement_occurrence",
      dedupe_key: "improvement_occurrence:imp_123:evt_123",
      deltas: {
        improvements_opened: 1,
        warning_log_improvements_opened: 1
      }
    });
  });

  it("records reopened improvement metrics when a resolved improvement gets a new occurrence", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            opportunity_id: "imp_123",
            occurrence_count: 6,
            bundle_generation_number: 1,
            event_recorded: true,
            opportunity_created: false,
            prior_status: "resolved"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [{ organization_id: "org_123" }]
      });
    const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");
    const tx = { query };
    const db = {
      query,
      transaction: async <Result>(
        callback: (queryable: typeof tx) => Promise<Result>
      ): Promise<Result> => callback(tx)
    };

    const store = createPostgresImprovementOpportunityStore(db, {
      accountAnalyticsStore: {
        withDb: vi.fn().mockReturnValue({ recordMetricDeltas }),
        ensureAnalyticsAccount: vi.fn(),
        recordMetricDeltas,
        markAccountDeleted: vi.fn(),
        preserveBillingRetentionForDeletedOrganization: vi.fn(),
        getAccountMetricSummary: vi.fn(),
        listAccountMetricPeriods: vi.fn(),
        getAggregateMetricSummary: vi.fn(),
        getAdminAnalyticsSummary: vi.fn(),
        backfillRetainedRowsForOrganization: vi.fn()
      }
    });

    const result = await store.recordRequestPattern({
      project_id: "proj_123",
      kind: "request_failure_pattern",
      service_name: "checkout-api",
      environment: "production",
      route_template: "/checkout/{param}",
      http_method: "POST",
      response_status: 503,
      duration_ms: 350,
      source_event_id: "evt_req_fail_123",
      occurred_at: "2026-05-18T12:00:00.000Z",
      severity: "high",
      confidence: 0.82,
      threshold: 3
    });

    expect(result).toEqual({
      opportunity_id: "imp_123",
      occurrence_count: 6,
      bundle_generation_number: 1,
      should_generate_bundle: false
    });
    expect(recordMetricDeltas).toHaveBeenCalledWith({
      organization_id: "org_123",
      occurred_at: "2026-05-18T12:00:00.000Z",
      source: "improvement_occurrence",
      dedupe_key: "improvement_occurrence:imp_123:evt_req_fail_123",
      deltas: {
        improvements_reopened: 1
      }
    });
  });

  it("records request patterns and persists request-event evidence", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          opportunity_id: "imp_request",
          occurrence_count: 5,
          bundle_generation_number: 0,
          event_recorded: true
        }
      ]
    });

    const store = createPostgresImprovementOpportunityStore({ query });
    const result = await store.recordRequestPattern({
      project_id: "proj_123",
      kind: "slow_request",
      service_name: "checkout-api",
      environment: "production",
      route_template: "/checkout/{param}",
      http_method: "GET",
      response_status: 200,
      duration_ms: 1800,
      source_event_id: "evt_req_123",
      occurred_at: "2026-05-18T12:00:00.000Z",
      severity: "medium",
      confidence: 0.7,
      threshold: 5,
      slow_request_duration_threshold_ms: 1500
    });

    expect(result).toEqual({
      opportunity_id: "imp_request",
      occurrence_count: 5,
      bundle_generation_number: 0,
      should_generate_bundle: true
    });
    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("INSERT INTO improvement_opportunities");
    expect(sql).toContain("INSERT INTO improvement_opportunity_events");
  });

  it("records request failure patterns without a slow-request threshold", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          opportunity_id: "imp_request_failure",
          occurrence_count: 3,
          bundle_generation_number: 0,
          event_recorded: true
        }
      ]
    });

    const store = createPostgresImprovementOpportunityStore({ query });
    const result = await store.recordRequestPattern({
      project_id: "proj_123",
      kind: "request_failure_pattern",
      service_name: "checkout-api",
      environment: "production",
      route_template: "/checkout/{param}",
      http_method: "POST",
      response_status: 503,
      duration_ms: 350,
      source_event_id: "evt_req_fail_123",
      occurred_at: "2026-05-18T12:00:00.000Z",
      severity: "high",
      confidence: 0.82,
      threshold: 3
    });

    expect(result).toEqual({
      opportunity_id: "imp_request_failure",
      occurrence_count: 3,
      bundle_generation_number: 0,
      should_generate_bundle: true
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it("records incident patterns with regression deploy context", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          opportunity_id: "imp_regression",
          occurrence_count: 4,
          bundle_generation_number: 0,
          event_recorded: true
        }
      ]
    });

    const store = createPostgresImprovementOpportunityStore({ query });
    const result = await store.recordIncidentPattern?.({
      project_id: "proj_123",
      kind: "post_deploy_regression",
      service_name: "checkout-api",
      environment: "production",
      incident_id: "inc_123",
      incident_title: "Checkout timeout spike",
      incident_occurrence_count: 4,
      incident_severity: "high",
      source_event_id: "evt_inc_123",
      source_event_type: "request_event",
      occurred_at: "2026-05-18T12:00:00.000Z",
      confidence: 0.9,
      threshold: 3,
      regression_deploy: {
        deployment_id: "dep_123",
        commit_sha: "abc123",
        version: "2026.05.18",
        branch: "main",
        deployed_at: "2026-05-18T11:30:00.000Z",
        minutes_since_deploy: 30
      }
    });

    expect(result).toEqual({
      opportunity_id: "imp_regression",
      occurrence_count: 4,
      bundle_generation_number: 0,
      should_generate_bundle: true
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it("records recurring incidents without regression deploy metadata", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          opportunity_id: "imp_recurring",
          occurrence_count: 3,
          bundle_generation_number: 0,
          event_recorded: true
        }
      ]
    });

    const store = createPostgresImprovementOpportunityStore({ query });
    const result = await store.recordIncidentPattern?.({
      project_id: "proj_123",
      kind: "recurring_incident",
      service_name: "checkout-api",
      environment: "production",
      incident_id: "inc_123",
      incident_title: "Checkout timeout spike",
      incident_occurrence_count: 3,
      incident_severity: "medium",
      source_event_id: "evt_inc_123",
      source_event_type: "request_event",
      occurred_at: "2026-05-18T12:00:00.000Z",
      confidence: 0.75,
      threshold: 3,
      regression_deploy: null
    });

    expect(result).toEqual({
      opportunity_id: "imp_recurring",
      occurrence_count: 3,
      bundle_generation_number: 0,
      should_generate_bundle: true
    });
    expect(query).toHaveBeenCalledOnce();
  });
});
