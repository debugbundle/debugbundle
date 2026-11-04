import { describe, expect, it, vi } from "vitest";
import { createPostgresMetadataStore } from "../../../packages/storage/src/index.js";

describe("postgres metadata bundles", () => {
  it("should persist bundle generation history when reserving bundle generation", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          generation_number: 3,
          created_at: "2026-03-15T12:00:00.000Z",
          updated_at: "2026-03-15T12:00:00.000Z",
          source_event_id: "550e8400-e29b-41d4-a716-446655440000",
          source_occurred_at: "2026-03-15T11:59:00.000Z",
          trigger: "regression_reopen"
        }
      ]
    });
    const store = createPostgresMetadataStore({ query });

    const reserved = await store.reserveBundleGeneration({
      incident_id: "inc_123",
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      occurred_at: "2026-03-15T11:59:00.000Z",
      trigger: "regression_reopen"
    });

    expect(reserved).toEqual({
      generation_number: 3,
      created_at: "2026-03-15T12:00:00.000Z",
      updated_at: "2026-03-15T12:00:00.000Z",
      source_event_id: "550e8400-e29b-41d4-a716-446655440000",
      source_occurred_at: "2026-03-15T11:59:00.000Z",
      trigger: "regression_reopen"
    });
    expect(query).toHaveBeenCalledOnce();
    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("INSERT INTO bundle_generations");
    expect(sql).toContain(
      "ON CONFLICT (incident_id, source_event_id)\n            WHERE incident_id IS NOT NULL"
    );
  });

  it("should prune retained bundle owners across incident and improvement keyspaces", async (): Promise<void> => {
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
    const store = createPostgresMetadataStore({ query });
    expect(store.pruneRetainedBundleOwnersForProject).toBeDefined();

    const pruned = await store.pruneRetainedBundleOwnersForProject!({
      project_id: "proj_123",
      retained_bundle_limit: 450
    });

    expect(pruned).toEqual([
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
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("DELETE FROM incidents");
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain(
      "DELETE FROM improvement_opportunities"
    );
    expect(String(query.mock.calls[0]?.[0] ?? "")).toContain("bundle_rank > $2::bigint");
    expect(String(query.mock.calls[0]?.[0] ?? "")).not.toContain("bundle_rank > $2::int");
  });

  it("should return null bundle build context and throw when generation reservation returns no row", async (): Promise<void> => {
    const missingContextStore = createPostgresMetadataStore({
      query: vi.fn().mockResolvedValue({ rows: [] })
    });

    await expect(
      missingContextStore.getBundleBuildContext({
        project_id: "proj_123",
        incident_id: "inc_missing"
      })
    ).resolves.toBeNull();

    const failingReserveStore = createPostgresMetadataStore({
      query: vi.fn().mockResolvedValue({ rows: [] })
    });

    await expect(
      failingReserveStore.reserveBundleGeneration({
        incident_id: "inc_123",
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        occurred_at: "2026-03-15T11:59:00.000Z",
        trigger: "regression_reopen"
      })
    ).rejects.toThrow("bundle_generation_reserve_failed");
  });

  it("should list incident event references and probe event candidates", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            event_id: "550e8400-e29b-41d4-a716-446655440000",
            event_type: "backend_exception",
            occurred_at: "2026-03-10T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            event_id: "550e8400-e29b-41d4-a716-446655440001",
            occurred_at: "2026-03-10T00:05:00.000Z"
          }
        ]
      });
    const store = createPostgresMetadataStore({ query });

    await expect(store.listIncidentEventReferences({ incident_id: "inc_123" })).resolves.toEqual([
      {
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        event_type: "backend_exception",
        occurred_at: "2026-03-10T00:00:00.000Z"
      }
    ]);
    await expect(
      store.listProbeEventCandidatesForServiceWindow({
        project_id: "proj_123",
        environment: "production",
        service_name: "checkout-api",
        window_start: "2026-03-10T00:00:00.000Z",
        window_end: "2026-03-10T01:00:00.000Z"
      })
    ).resolves.toEqual([
      {
        event_id: "550e8400-e29b-41d4-a716-446655440001",
        occurred_at: "2026-03-10T00:05:00.000Z"
      }
    ]);
  });

  it("should fall back to retained incident events when bundle source metadata is missing", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          event_id: "550e8400-e29b-41d4-a716-446655440000",
          occurred_at: "2026-03-10T00:00:00.000Z",
          occurrence_count: 3,
          trigger: "regeneration"
        }
      ]
    });
    const store = createPostgresMetadataStore({ query });

    await expect(
      store.getBundleSourceForOrganization?.({
        organization_id: "org_123",
        incident_id: "inc_123"
      })
    ).resolves.toEqual({
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      occurred_at: "2026-03-10T00:00:00.000Z",
      occurrence_count: 3,
      trigger: "regeneration"
    });
    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("LEFT JOIN LATERAL");
    expect(sql).toContain("fallback_event");
  });
});
