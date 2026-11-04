import { describe, expect, it, vi } from "vitest";
import { createPostgresMetadataStore } from "../../../packages/storage/src/index.js";

describe("postgres metadata weekly-reports", () => {
  it("should aggregate weekly project report summary from bundle history and incident activity", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          project_id: "proj_123",
          project_name: "Main App",
          window_start: "2026-03-09T00:00:00.000Z",
          window_end: "2026-03-16T00:00:00.000Z",
          failure_bundles: 3,
          improvement_bundles: 0,
          new_incidents: 2,
          resolved_incidents: 2,
          opened_incidents_resolved: 1,
          regressions: 1,
          top_spiking_incidents: [
            {
              incident_id: "inc_123",
              title: "Checkout failed",
              occurrence_count: 13,
              spike_detected_at: "2026-03-14T08:00:00.000Z"
            }
          ]
        }
      ]
    });
    const store = createPostgresMetadataStore({ query });

    const summary = await store.getWeeklyProjectReport({
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z"
    });

    expect(summary).toEqual({
      project_id: "proj_123",
      project_name: "Main App",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z",
      bundle_counts: {
        failure: 3,
        improvement: 0
      },
      new_incidents: 2,
      resolved_incidents: 2,
      opened_incidents_resolved: 1,
      regressions: 1,
      top_spiking_incidents: [
        {
          incident_id: "inc_123",
          title: "Checkout failed",
          occurrence_count: 13,
          spike_detected_at: "2026-03-14T08:00:00.000Z"
        }
      ]
    });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("FROM bundle_generations");
  });

  it("should return null weekly project report when the project has no weekly activity", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createPostgresMetadataStore({ query });

    const summary = await store.getWeeklyProjectReport({
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z"
    });

    expect(summary).toBeNull();
    expect(query).toHaveBeenCalledOnce();
  });

  it("should list projects with weekly activity in ascending order", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ project_id: "proj_123" }, { project_id: "proj_456" }]
    });
    const store = createPostgresMetadataStore({ query });

    const projects = await store.listProjectsWithWeeklyActivity({
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z",
      limit: 10
    });

    expect(projects).toEqual(["proj_123", "proj_456"]);
  });

  it("should default missing weekly report spike lists to an empty array", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          project_id: "proj_123",
          window_start: "2026-03-09T00:00:00.000Z",
          window_end: "2026-03-16T00:00:00.000Z",
          failure_bundles: 1,
          improvement_bundles: 2,
          new_incidents: 0,
          regressions: 0,
          top_spiking_incidents: null
        }
      ]
    });
    const store = createPostgresMetadataStore({ query });

    await expect(
      store.getWeeklyProjectReport({
        project_id: "proj_123",
        window_start: "2026-03-09T00:00:00.000Z",
        window_end: "2026-03-16T00:00:00.000Z"
      })
    ).resolves.toEqual({
      project_id: "proj_123",
      window_start: "2026-03-09T00:00:00.000Z",
      window_end: "2026-03-16T00:00:00.000Z",
      bundle_counts: { failure: 1, improvement: 2 },
      new_incidents: 0,
      regressions: 0,
      top_spiking_incidents: []
    });
  });
});
