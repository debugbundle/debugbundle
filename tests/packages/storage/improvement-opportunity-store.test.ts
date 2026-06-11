import { describe, expect, it, vi } from "vitest";

import { createPostgresImprovementOpportunityStore } from "../../../packages/storage/src/improvement-opportunity-store.js";

describe("improvement opportunity store", () => {
  it("scopes improvement retrieval to projects visible to a collaborator", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createPostgresImprovementOpportunityStore({ query });

    await store.listImprovementsForOrganization({
      organization_id: "org_collaborator",
      user_id: "usr_collaborator",
      project_id: "proj_shared",
      limit: 20
    });
    await store.getImprovementForOrganization({
      organization_id: "org_collaborator",
      user_id: "usr_collaborator",
      improvement_id: "imp_shared"
    });

    const listSql = String(query.mock.calls[0]?.[0] ?? "");
    expect(listSql).toContain("$2::uuid IS NULL");
    expect(listSql).toContain("$2::uuid IS NOT NULL");
    expect(listSql).toContain("FROM project_members pm");

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("FROM project_members pm"),
      ["org_collaborator", "usr_collaborator", "proj_shared", 20]
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("FROM project_members pm"),
      ["org_collaborator", "imp_shared", "usr_collaborator"]
    );
  });

  it("returns null when improvement execution settings are missing", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    const store = createPostgresImprovementOpportunityStore({ query });
    const result = await store.getImprovementExecutionSettings("proj_missing");

    expect(result).toBeNull();
  });

  it("returns execution settings for supported paid tiers", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          plan: "solo",
          automated_improvement_bundles_enabled: true,
          improvement_bundle_sensitivity: "balanced"
        }
      ]
    });

    const store = createPostgresImprovementOpportunityStore({ query });
    const result = await store.getImprovementExecutionSettings("proj_123");

    expect(result).toEqual({
      plan: "solo",
      automated_improvement_bundles_enabled: true,
      improvement_bundle_sensitivity: "balanced"
    });
  });

  it("forces cloud automation off for free projects even when the stored default is true", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          plan: "free",
          automated_improvement_bundles_enabled: true,
          improvement_bundle_sensitivity: "balanced"
        }
      ]
    });

    const store = createPostgresImprovementOpportunityStore({ query });
    const result = await store.getImprovementExecutionSettings("proj_free");

    expect(result).toEqual({
      plan: "free",
      automated_improvement_bundles_enabled: false,
      improvement_bundle_sensitivity: "balanced"
    });
  });

  it("normalizes unknown plans to free execution settings", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          plan: "enterprise",
          automated_improvement_bundles_enabled: true,
          improvement_bundle_sensitivity: "verbose"
        }
      ]
    });

    const store = createPostgresImprovementOpportunityStore({ query });
    const result = await store.getImprovementExecutionSettings("proj_unknown");

    expect(result).toEqual({
      plan: "free",
      automated_improvement_bundles_enabled: false,
      improvement_bundle_sensitivity: "verbose"
    });
  });

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
      transaction: async <Result>(callback: (queryable: typeof tx) => Promise<Result>): Promise<Result> => callback(tx)
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
      transaction: async <Result>(callback: (queryable: typeof tx) => Promise<Result>): Promise<Result> => callback(tx)
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

  it("lists improvements with filters and cursor parameters", async () => {
    const row = {
      improvement_id: "imp_list_123",
      project_id: "proj_123",
      project_name: "Checkout",
      project_slug: "checkout",
      service_id: null,
      service_name: "checkout-api",
      service_runtime: "node",
      service_framework: "fastify",
      environment: "production",
      kind: "warning_hotspot",
      status: "open",
      severity: "medium",
      confidence: 0.8,
      fingerprint: "fp_warning_hotspot",
      title: "Warning hotspot: payment provider warning",
      summary: "Repeated warning log pattern detected.",
      occurrence_count: 7,
      evidence: { kind: "warning_hotspot" },
      related_incident_ids: [],
      first_detected_at: "2026-05-18T12:00:00.000Z",
      last_detected_at: "2026-05-18T12:30:00.000Z",
      resolved_at: null,
      snoozed_until: null,
      bundle_generation_number: 1,
      bundle_created_at: "2026-05-18T12:31:00.000Z",
      bundle_updated_at: "2026-05-18T12:31:00.000Z",
      bundle_failure_reason: null
    };
    const query = vi.fn().mockResolvedValue({ rows: [row] });

    const store = createPostgresImprovementOpportunityStore({ query });
    const result = await store.listImprovementsForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      environment: "production",
      service: "checkout-api",
      status: "open",
      severity: "medium",
      kind: "warning_hotspot",
      cursor: {
        last_detected_at: "2026-05-18T12:45:00.000Z",
        improvement_id: "imp_cursor_123"
      },
      limit: 20
    });

    expect(result).toEqual([row]);
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("io.bundle_generation_number > 0");
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("io.kind = 'post_deploy_regression'");
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("incident_occurrence_count");
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("~ '^[0-9]+$'");
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("'/wp-admin'");
    expect(query.mock.calls[0]?.[1]).toEqual([
      "org_123",
      null,
      "proj_123",
      "production",
      "checkout-api",
      "open",
      "medium",
      "warning_hotspot",
      "2026-05-18T12:45:00.000Z",
      "imp_cursor_123",
      20
    ]);
  });

  it("lists improvements with only the required organization and limit inputs", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    const store = createPostgresImprovementOpportunityStore({ query });
    const result = await store.listImprovementsForOrganization({
      organization_id: "org_123",
      limit: 10
    });

    expect(result).toEqual([]);
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("io.status <> 'open'");
    expect(query.mock.calls[0]?.[1]).toEqual(["org_123", null, 10]);
  });

  it("returns improvement retrieval records or null for organization lookups", async () => {
    const row = {
      improvement_id: "imp_get_123",
      project_id: "proj_123",
      project_name: "Checkout",
      project_slug: "checkout",
      service_id: null,
      service_name: "checkout-api",
      service_runtime: "node",
      service_framework: "fastify",
      environment: "production",
      kind: "warning_hotspot",
      status: "open",
      severity: "medium",
      confidence: 0.8,
      fingerprint: "fp_warning_hotspot",
      title: "Warning hotspot: payment provider warning",
      summary: "Repeated warning log pattern detected.",
      occurrence_count: 7,
      evidence: { kind: "warning_hotspot" },
      related_incident_ids: [],
      first_detected_at: "2026-05-18T12:00:00.000Z",
      last_detected_at: "2026-05-18T12:30:00.000Z",
      resolved_at: null,
      snoozed_until: null,
      bundle_generation_number: 1,
      bundle_created_at: "2026-05-18T12:31:00.000Z",
      bundle_updated_at: "2026-05-18T12:31:00.000Z",
      bundle_failure_reason: null
    };
    const query = vi.fn().mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: [] });

    const store = createPostgresImprovementOpportunityStore({ query });
    const found = await store.getImprovementForOrganization({
      organization_id: "org_123",
      improvement_id: "imp_get_123"
    });
    const missing = await store.getImprovementForOrganization({
      organization_id: "org_123",
      improvement_id: "imp_missing"
    });

    expect(found).toEqual(row);
    expect(missing).toBeNull();
  });

  it("resolves, reopens, and snoozes improvements for an organization", async () => {
    const resolved = {
      improvement_id: "imp_123",
      project_id: "proj_123",
      project_name: "Checkout",
      project_slug: "checkout",
      service_id: null,
      service_name: "checkout-api",
      service_runtime: "node",
      service_framework: "fastify",
      environment: "production",
      kind: "warning_hotspot",
      status: "resolved",
      severity: "medium",
      confidence: 0.8,
      fingerprint: "fp_warning_hotspot",
      title: "Warning hotspot: payment provider warning",
      summary: "Repeated warning log pattern detected.",
      occurrence_count: 7,
      evidence: { kind: "warning_hotspot" },
      related_incident_ids: [],
      first_detected_at: "2026-05-18T12:00:00.000Z",
      last_detected_at: "2026-05-18T12:30:00.000Z",
      resolved_at: "2026-05-18T13:00:00.000Z",
      snoozed_until: null,
      bundle_generation_number: 1,
      bundle_created_at: "2026-05-18T12:31:00.000Z",
      bundle_updated_at: "2026-05-18T12:31:00.000Z",
      bundle_failure_reason: null
    };
    const reopened = { ...resolved, status: "open", resolved_at: null };
    const snoozed = { ...reopened, status: "snoozed", snoozed_until: "2026-05-25T13:00:00.000Z" };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [resolved] })
      .mockResolvedValueOnce({ rows: [reopened] })
      .mockResolvedValueOnce({ rows: [snoozed] });

    const store = createPostgresImprovementOpportunityStore({ query });
    const resolvedResult = await store.resolveImprovementForOrganization({
      organization_id: "org_123",
      improvement_id: "imp_123",
      resolved_at: "2026-05-18T13:00:00.000Z",
      resolved_by_member_id: "usr_owner"
    });
    const reopenedResult = await store.reopenImprovementForOrganization({
      organization_id: "org_123",
      improvement_id: "imp_123"
    });
    const snoozedResult = await store.snoozeImprovementForOrganization?.({
      organization_id: "org_123",
      improvement_id: "imp_123",
      snoozed_until: "2026-05-25T13:00:00.000Z"
    });

    expect(resolvedResult).toEqual(resolved);
    expect(reopenedResult).toEqual(reopened);
    expect(snoozedResult).toEqual(snoozed);
  });

  it("resolves incident-derived improvements only after every related incident is resolved", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          resolved_count: 2
        }
      ]
    });

    const store = createPostgresImprovementOpportunityStore({ query });
    const result = await store.resolveIncidentDerivedImprovementsForIncident?.({
      organization_id: "org_123",
      incident_id: "inc_123",
      resolved_by_member_id: "usr_owner",
      resolved_at: "2026-05-18T13:00:00.000Z"
    });

    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(result).toBe(2);
    expect(sql).toContain("$2::uuid = ANY(io.related_incident_ids)");
    expect(sql).toContain("io.kind IN ('recurring_incident', 'post_deploy_regression')");
    expect(sql).toContain("LEFT JOIN incidents i ON i.id = related_incident_id");
    expect(sql).toContain("i.id IS NULL");
    expect(sql).toContain("i.status <> 'resolved'");
    expect(query.mock.calls[0]?.[1]).toEqual(["org_123", "inc_123", "usr_owner", "2026-05-18T13:00:00.000Z"]);
  });

  it("records lifecycle metrics for resolve, reopen, snooze, and incident-derived resolution transitions", async () => {
    const resolved = {
      improvement_id: "imp_123",
      project_id: "proj_123",
      project_name: "Checkout",
      project_slug: "checkout",
      service_id: null,
      service_name: "checkout-api",
      service_runtime: "node",
      service_framework: "fastify",
      environment: "production",
      kind: "warning_hotspot",
      status: "resolved",
      severity: "medium",
      confidence: 0.8,
      fingerprint: "fp_warning_hotspot",
      title: "Warning hotspot: payment provider warning",
      summary: "Repeated warning log pattern detected.",
      occurrence_count: 7,
      evidence: { kind: "warning_hotspot" },
      related_incident_ids: [],
      first_detected_at: "2026-05-18T12:00:00.000Z",
      last_detected_at: "2026-05-18T12:30:00.000Z",
      resolved_at: "2026-05-18T13:00:00.000Z",
      snoozed_until: null,
      bundle_generation_number: 1,
      bundle_created_at: "2026-05-18T12:31:00.000Z",
      bundle_updated_at: "2026-05-18T12:31:00.000Z",
      bundle_failure_reason: null
    };
    const reopened = { ...resolved, status: "open", resolved_at: null };
    const snoozed = { ...reopened, status: "snoozed", snoozed_until: "2026-05-25T13:00:00.000Z" };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [resolved] })
      .mockResolvedValueOnce({
        rows: [
          {
            project_id: "proj_123",
            status: "resolved",
            resolved_at: "2026-05-18T13:00:00.000Z",
            snoozed_until: null
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [reopened] })
      .mockResolvedValueOnce({ rows: [snoozed] })
      .mockResolvedValueOnce({ rows: [{ resolved_count: 2 }] });
    const recordMetricDeltas = vi.fn().mockResolvedValue("recorded");
    const tx = { query };
    const db = {
      query,
      transaction: async <Result>(callback: (queryable: typeof tx) => Promise<Result>): Promise<Result> => callback(tx)
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
        backfillRetainedRowsForOrganization: vi.fn()
      }
    });

    const resolvedResult = await store.resolveImprovementForOrganization({
      organization_id: "org_123",
      improvement_id: "imp_123",
      resolved_at: "2026-05-18T13:00:00.000Z",
      resolved_by_member_id: "usr_owner"
    });
    const reopenedResult = await store.reopenImprovementForOrganization({
      organization_id: "org_123",
      improvement_id: "imp_123"
    });
    const snoozedResult = await store.snoozeImprovementForOrganization?.({
      organization_id: "org_123",
      improvement_id: "imp_123",
      snoozed_until: "2026-05-25T13:00:00.000Z"
    });
    const incidentResolvedCount = await store.resolveIncidentDerivedImprovementsForIncident?.({
      organization_id: "org_123",
      incident_id: "inc_123",
      resolved_by_member_id: "usr_owner",
      resolved_at: "2026-05-18T13:00:00.000Z"
    });

    expect(resolvedResult).toEqual(resolved);
    expect(reopenedResult).toEqual(reopened);
    expect(snoozedResult).toEqual(snoozed);
    expect(incidentResolvedCount).toBe(2);

    expect(recordMetricDeltas).toHaveBeenNthCalledWith(1, {
      organization_id: "org_123",
      occurred_at: "2026-05-18T13:00:00.000Z",
      source: "improvement_resolved",
      dedupe_key: "improvement_resolved:imp_123:2026-05-18T13:00:00.000Z",
      deltas: {
        improvements_resolved: 1
      }
    });
    expect(recordMetricDeltas).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        organization_id: "org_123",
        source: "improvement_reopened",
        dedupe_key: "improvement_reopened:imp_123:resolved:2026-05-18T13:00:00.000Z",
        deltas: {
          improvements_reopened: 1
        }
      })
    );
    expect(recordMetricDeltas).toHaveBeenNthCalledWith(3, {
      organization_id: "org_123",
      occurred_at: "2026-05-25T13:00:00.000Z",
      source: "improvement_snoozed",
      dedupe_key: "improvement_snoozed:imp_123:2026-05-25T13:00:00.000Z",
      deltas: {
        improvements_snoozed: 1
      }
    });
    expect(recordMetricDeltas).toHaveBeenNthCalledWith(4, {
      organization_id: "org_123",
      occurred_at: "2026-05-18T13:00:00.000Z",
      source: "incident_derived_improvement_resolved",
      dedupe_key: "incident_derived_improvement_resolved:inc_123:2026-05-18T13:00:00.000Z",
      deltas: {
        improvements_resolved: 2
      }
    });

    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("io.status <> 'resolved'");
    expect(String(query.mock.calls[2]?.[0] ?? "")).toContain("io.status <> 'open'");
    expect(String(query.mock.calls[3]?.[0] ?? "")).toContain("io.snoozed_until IS DISTINCT FROM $3::timestamptz");
  });

  it("returns bundle build context and chronological event references", async () => {
    const buildContext = {
      opportunity_id: "imp_123",
      project_id: "proj_123",
      project_slug: "checkout",
      service_id: null,
      service_name: "checkout-api",
      service_runtime: "node",
      service_framework: "fastify",
      environment: "production",
      kind: "warning_hotspot",
      status: "open",
      severity: "medium",
      confidence: 0.8,
      fingerprint: "fp_warning_hotspot",
      title: "Warning hotspot: payment provider warning",
      summary: "Repeated warning log pattern detected.",
      occurrence_count: 7,
      evidence: { kind: "warning_hotspot" },
      related_incident_ids: [],
      first_detected_at: "2026-05-18T12:00:00.000Z",
      last_detected_at: "2026-05-18T12:30:00.000Z",
      last_source_event_id: "evt_123",
      bundle_generation_number: 1,
      bundle_created_at: "2026-05-18T12:31:00.000Z",
      bundle_updated_at: "2026-05-18T12:31:00.000Z",
      bundle_source_event_id: "evt_123",
      bundle_failure_reason: null
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [buildContext] })
      .mockResolvedValueOnce({
        rows: [
          {
            event_id: "evt_newer",
            event_type: "request_event",
            occurred_at: "2026-05-18T12:02:00.000Z"
          },
          {
            event_id: "evt_older",
            event_type: "log_event",
            occurred_at: "2026-05-18T12:01:00.000Z"
          }
        ]
      });

    const store = createPostgresImprovementOpportunityStore({ query });
    const context = await store.getImprovementBundleBuildContext({
      project_id: "proj_123",
      opportunity_id: "imp_123"
    });
    const references = await store.listImprovementEventReferences({
      opportunity_id: "imp_123",
      limit: 10
    });

    expect(context).toEqual(buildContext);
    expect(references).toEqual([
      {
        event_id: "evt_older",
        event_type: "log_event",
        occurred_at: "2026-05-18T12:01:00.000Z"
      },
      {
        event_id: "evt_newer",
        event_type: "request_event",
        occurred_at: "2026-05-18T12:02:00.000Z"
      }
    ]);
  });

  it("returns null when improvement bundle build context is missing", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    const store = createPostgresImprovementOpportunityStore({ query });
    const context = await store.getImprovementBundleBuildContext({
      project_id: "proj_123",
      opportunity_id: "imp_missing"
    });

    expect(context).toBeNull();
  });

  it("reports bundle-generation presence and updates failure reasons", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ exists: true }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const store = createPostgresImprovementOpportunityStore({ query });
    const exists = await store.hasImprovementBundleGenerationForSourceEvent({
      opportunity_id: "imp_123",
      event_id: "evt_123"
    });
    const missing = await store.hasImprovementBundleGenerationForSourceEvent({
      opportunity_id: "imp_123",
      event_id: "evt_missing"
    });
    await store.markImprovementBundleGenerationFailure({
      opportunity_id: "imp_123",
      reason: "bundle_generation_failed"
    });

    expect(exists).toBe(true);
    expect(missing).toBe(false);
    expect(String(query.mock.calls[2]?.[0] ?? "")).toContain("bundle_failure_reason = $2");
    expect(query.mock.calls[2]?.[1]).toEqual(["imp_123", "bundle_generation_failed"]);
  });

  it("allows clearing bundle failure reasons", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    const store = createPostgresImprovementOpportunityStore({ query });
    await store.markImprovementBundleGenerationFailure({
      opportunity_id: "imp_123",
      reason: null
    });

    expect(query).toHaveBeenCalledWith(expect.any(String), ["imp_123", null]);
  });

  it("reserves improvement bundle generations against the improvement keyspace", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          project_id: "proj_123",
          generation_number: 1,
          created_at: "2026-05-18T12:00:00.000Z",
          updated_at: "2026-05-18T12:00:00.000Z",
          source_event_id: "evt_123",
          source_occurred_at: "2026-05-18T12:00:00.000Z",
          trigger: "occurrence_threshold"
        }
      ]
    });

    const store = createPostgresImprovementOpportunityStore({ query });
    const result = await store.reserveImprovementBundleGeneration({
      opportunity_id: "imp_123",
      event_id: "evt_123",
      occurred_at: "2026-05-18T12:00:00.000Z",
      trigger: "occurrence_threshold"
    });

    expect(result).toEqual({
      generation_number: 1,
      created_at: "2026-05-18T12:00:00.000Z",
      updated_at: "2026-05-18T12:00:00.000Z",
      source_event_id: "evt_123",
      source_occurred_at: "2026-05-18T12:00:00.000Z",
      trigger: "occurrence_threshold"
    });
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("improvement_opportunity_id");
  });

  it("throws when reserving an improvement bundle generation fails", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    const store = createPostgresImprovementOpportunityStore({ query });

    await expect(
      store.reserveImprovementBundleGeneration({
        opportunity_id: "imp_123",
        event_id: "evt_123",
        occurred_at: "2026-05-18T12:00:00.000Z",
        trigger: "occurrence_threshold"
      })
    ).rejects.toThrow("improvement_bundle_generation_reserve_failed");
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

  it("prunes retained bundle owners across incident and improvement keyspaces", async () => {
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

    const store = createPostgresImprovementOpportunityStore({ query });
    const result = await store.pruneRetainedBundleOwnersForProject({
      project_id: "proj_123",
      retained_bundle_limit: 150
    });

    expect(result).toEqual([
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
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("DELETE FROM improvement_opportunities");
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("DELETE FROM incidents");
  });
});
