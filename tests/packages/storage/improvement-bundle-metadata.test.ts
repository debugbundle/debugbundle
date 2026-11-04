import { describe, expect, it, vi } from "vitest";

import { createPostgresImprovementOpportunityStore } from "../../../packages/storage/src/improvement-opportunity-store.js";

describe("improvement bundle-metadata", () => {
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
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain(
      "DELETE FROM improvement_opportunities"
    );
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("DELETE FROM incidents");
  });
});
