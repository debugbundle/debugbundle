import { describe, expect, it, vi } from "vitest";

import { createPostgresImprovementOpportunityStore } from "../../../packages/storage/src/improvement-opportunity-store.js";

describe("improvement store", () => {
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

    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining("FROM project_members pm"), [
      "org_collaborator",
      "usr_collaborator",
      "proj_shared",
      20
    ]);
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("FROM project_members pm"), [
      "org_collaborator",
      "imp_shared",
      "usr_collaborator"
    ]);
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

  it("treats expired snoozes as open during retrieval", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    const store = createPostgresImprovementOpportunityStore({ query });
    await store.listImprovementsForOrganization({
      organization_id: "org_123",
      status: "open",
      limit: 10
    });
    await store.getImprovementForOrganization({
      organization_id: "org_123",
      improvement_id: "imp_123"
    });

    const listSql = String(query.mock.calls[0]?.[0] ?? "");
    const getSql = String(query.mock.calls[1]?.[0] ?? "");

    expect(listSql).toContain("WHEN io.status = 'snoozed'");
    expect(listSql).toContain("io.snoozed_until <= now()");
    expect(listSql).toContain("THEN 'open'");
    expect(getSql).toContain("WHEN io.status = 'snoozed'");
    expect(getSql).toContain("THEN NULL");
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
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [] });

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
    expect(query.mock.calls[0]?.[1]).toEqual([
      "org_123",
      "inc_123",
      "usr_owner",
      "2026-05-18T13:00:00.000Z"
    ]);
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
    expect(String(query.mock.calls[3]?.[0] ?? "")).toContain(
      "io.snoozed_until IS DISTINCT FROM $3::timestamptz"
    );
  });
});
