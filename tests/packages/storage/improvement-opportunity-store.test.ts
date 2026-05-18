import { describe, expect, it, vi } from "vitest";

import { createPostgresImprovementOpportunityStore } from "../../../packages/storage/src/improvement-opportunity-store.js";

describe("improvement opportunity store", () => {
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

  it("records warning hotspots and returns the generation trigger decision", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          opportunity_id: "imp_123",
          occurrence_count: 5,
          bundle_generation_number: 0
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

  it("records request patterns and persists request-event evidence", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          opportunity_id: "imp_request",
          occurrence_count: 5,
          bundle_generation_number: 0
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
