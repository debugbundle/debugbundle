import { describe, expect, it, vi } from "vitest";

import {
  buildAnalyticsRawEventObjectKey,
  buildBundleObjectKey,
  buildReproductionObjectKey,
  createPostgresRetentionStore,
  createRetentionCleanupService,
  type RetentionStore
} from "../../../packages/storage/src/index.js";

function createMockRetentionStore(overrides: Partial<RetentionStore> = {}): RetentionStore {
  return {
    listExpiredSampledRawEvents: vi.fn().mockResolvedValue([]),
    markRawEventsExpired: vi.fn().mockResolvedValue(undefined),
    listExpiredAnalyticsRawEvents: vi.fn().mockResolvedValue([]),
    deleteExpiredAnalyticsRawEvents: vi.fn().mockResolvedValue(undefined),
    listExpiredAnalyticsJourneySamples: vi.fn().mockResolvedValue([]),
    deleteExpiredAnalyticsJourneySamples: vi.fn().mockResolvedValue(undefined),
    pruneExpiredAnalyticsRollups: vi
      .fn()
      .mockResolvedValue({ deleted_rows: 0, reached_batch_limit: false }),
    listExpiredAnalyticsBundleGenerations: vi.fn().mockResolvedValue([]),
    deleteExpiredAnalyticsBundleGenerations: vi.fn().mockResolvedValue(undefined),
    listExpiredIncidents: vi.fn().mockResolvedValue([]),
    deleteExpiredIncidents: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

describe("retention cleanup service", () => {
  it("queries and updates retention records through the postgres store", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { project_id: "proj_123", event_id: "evt_123", occurred_at: "2026-04-01T00:00:00.000Z" }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            project_id: "proj_123",
            event_id: "550e8400-e29b-41d4-a716-446655440000",
            occurred_at: "2026-04-01T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            project_id: "proj_123",
            sample_id: "22222222-2222-4222-8222-222222222222",
            s3_object_key:
              "analytics-journeys/proj_123/22222222-2222-4222-8222-222222222222.json.gz",
            expires_at: "2026-04-01T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            project_id: "proj_123",
            generation_id: "33333333-3333-4333-8333-333333333333",
            opportunity_id: "44444444-4444-4444-8444-444444444444",
            status: "completed",
            object_key:
              "analytics-bundles/proj_123/33333333-3333-4333-8333-333333333333/analytics-bundle.json.gz",
            completed_at: "2026-04-01T00:00:00.000Z",
            updated_at: "2026-04-01T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ project_id: "proj_123", incident_id: "inc_123" }]
      })
      .mockResolvedValueOnce({ rows: [] });

    const store = createPostgresRetentionStore({ query });

    await expect(
      store.listExpiredSampledRawEvents({ now: "2026-04-04T12:00:00.000Z", limit: 25 })
    ).resolves.toEqual([
      { project_id: "proj_123", event_id: "evt_123", occurred_at: "2026-04-01T00:00:00.000Z" }
    ]);

    await store.markRawEventsExpired({
      references: [
        { project_id: "proj_123", event_id: "evt_123", occurred_at: "2026-04-01T00:00:00.000Z" }
      ]
    });

    await expect(
      store.listExpiredAnalyticsRawEvents({ now: "2026-04-04T12:00:00.000Z", limit: 25 })
    ).resolves.toEqual([
      {
        project_id: "proj_123",
        event_id: "550e8400-e29b-41d4-a716-446655440000",
        occurred_at: "2026-04-01T00:00:00.000Z"
      }
    ]);

    await store.deleteExpiredAnalyticsRawEvents({
      references: [
        {
          project_id: "proj_123",
          event_id: "550e8400-e29b-41d4-a716-446655440000",
          occurred_at: "2026-04-01T00:00:00.000Z"
        }
      ]
    });

    await expect(
      store.listExpiredAnalyticsJourneySamples({ now: "2026-04-04T12:00:00.000Z", limit: 25 })
    ).resolves.toEqual([
      {
        project_id: "proj_123",
        sample_id: "22222222-2222-4222-8222-222222222222",
        s3_object_key: "analytics-journeys/proj_123/22222222-2222-4222-8222-222222222222.json.gz",
        expires_at: "2026-04-01T00:00:00.000Z"
      }
    ]);

    await store.deleteExpiredAnalyticsJourneySamples({
      references: [
        {
          project_id: "proj_123",
          sample_id: "22222222-2222-4222-8222-222222222222",
          s3_object_key: "analytics-journeys/proj_123/22222222-2222-4222-8222-222222222222.json.gz",
          expires_at: "2026-04-01T00:00:00.000Z"
        }
      ]
    });

    await expect(
      store.listExpiredAnalyticsBundleGenerations({
        now: "2026-04-04T12:00:00.000Z",
        limit: 25
      })
    ).resolves.toEqual([
      {
        project_id: "proj_123",
        generation_id: "33333333-3333-4333-8333-333333333333",
        opportunity_id: "44444444-4444-4444-8444-444444444444",
        status: "completed",
        object_key:
          "analytics-bundles/proj_123/33333333-3333-4333-8333-333333333333/analytics-bundle.json.gz",
        completed_at: "2026-04-01T00:00:00.000Z",
        updated_at: "2026-04-01T00:00:00.000Z"
      }
    ]);

    await store.deleteExpiredAnalyticsBundleGenerations({
      references: [
        {
          project_id: "proj_123",
          generation_id: "33333333-3333-4333-8333-333333333333",
          opportunity_id: "44444444-4444-4444-8444-444444444444",
          status: "completed",
          object_key:
            "analytics-bundles/proj_123/33333333-3333-4333-8333-333333333333/analytics-bundle.json.gz",
          completed_at: "2026-04-01T00:00:00.000Z",
          updated_at: "2026-04-01T00:00:00.000Z"
        }
      ]
    });

    await expect(
      store.listExpiredIncidents({ now: "2026-04-04T12:00:00.000Z", limit: 25 })
    ).resolves.toEqual([{ project_id: "proj_123", incident_id: "inc_123" }]);

    await store.deleteExpiredIncidents({
      references: [{ project_id: "proj_123", incident_id: "inc_123" }]
    });

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("SELECT\n            i.project_id::text AS project_id"),
      ["2026-04-04T12:00:00.000Z", 14, 30, 7, 25]
    );
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("UPDATE incident_events ie"), [
      "evt_123"
    ]);
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("FROM analytics_ingestion_ledger ail"),
      ["2026-04-04T12:00:00.000Z", 25]
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("DELETE FROM analytics_ingestion_ledger ail"),
      ["proj_123", "550e8400-e29b-41d4-a716-446655440000"]
    );
    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining("FROM analytics_journey_samples"),
      ["2026-04-04T12:00:00.000Z", 25]
    );
    expect(query).toHaveBeenNthCalledWith(
      6,
      expect.stringContaining("DELETE FROM analytics_journey_samples samples"),
      ["22222222-2222-4222-8222-222222222222"]
    );
    expect(query).toHaveBeenNthCalledWith(
      7,
      expect.stringContaining("FROM analytics_bundle_generations abg"),
      ["2026-04-04T12:00:00.000Z", 25]
    );
    expect(query).toHaveBeenNthCalledWith(
      8,
      expect.stringContaining("DELETE FROM analytics_bundle_generations abg"),
      [
        "33333333-3333-4333-8333-333333333333",
        "44444444-4444-4444-8444-444444444444",
        "completed",
        "analytics-bundles/proj_123/33333333-3333-4333-8333-333333333333/analytics-bundle.json.gz"
      ]
    );
    expect(String(query.mock.calls[7]?.[0])).toContain("UPDATE analytics_opportunities ao");
    expect(String(query.mock.calls[7]?.[0])).toContain("NOT EXISTS");
    expect(query).toHaveBeenNthCalledWith(
      9,
      expect.stringContaining("SELECT\n            i.project_id::text AS project_id"),
      ["2026-04-04T12:00:00.000Z", 30, 90, 7, 25]
    );
    expect(query).toHaveBeenNthCalledWith(10, expect.stringContaining("DELETE FROM incidents i"), [
      "inc_123"
    ]);
  });

  it("skips postgres retention updates when the reference lists are empty", async (): Promise<void> => {
    const query = vi.fn();
    const store = createPostgresRetentionStore({ query });

    await store.markRawEventsExpired({ references: [] });
    await store.deleteExpiredAnalyticsRawEvents({ references: [] });
    await store.deleteExpiredAnalyticsJourneySamples({ references: [] });
    await store.deleteExpiredAnalyticsBundleGenerations({ references: [] });
    await store.deleteExpiredIncidents({ references: [] });

    expect(query).not.toHaveBeenCalled();
  });

  it("prunes expired analytics aggregate rollups using project aggregate retention settings", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ deleted: 1 }, { deleted: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ deleted: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ deleted: 1 }, { deleted: 1 }] })
      .mockResolvedValueOnce({ rows: [] });
    const store = createPostgresRetentionStore({ query });

    await expect(
      store.pruneExpiredAnalyticsRollups({ now: "2026-07-08T12:00:00.000Z", limit: 2 })
    ).resolves.toEqual({
      deleted_rows: 5,
      reached_batch_limit: true
    });

    expect(query).toHaveBeenCalledTimes(6);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("DELETE FROM analytics_rollup_uniques target"),
      ["2026-07-08T12:00:00.000Z", 2]
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("DELETE FROM analytics_session_rollups target"),
      ["2026-07-08T12:00:00.000Z", 2]
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("DELETE FROM analytics_route_rollups target"),
      ["2026-07-08T12:00:00.000Z", 2]
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("DELETE FROM analytics_action_rollups target"),
      ["2026-07-08T12:00:00.000Z", 2]
    );
    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining("DELETE FROM analytics_funnel_rollups target"),
      ["2026-07-08T12:00:00.000Z", 2]
    );
    expect(query).toHaveBeenNthCalledWith(
      6,
      expect.stringContaining("DELETE FROM analytics_transition_rollups target"),
      ["2026-07-08T12:00:00.000Z", 2]
    );
    for (const call of query.mock.calls) {
      expect(String(call[0])).toContain("settings.aggregate_retention_months");
      expect(String(call[0])).toContain("candidate.bucket_start");
    }
  });

  it("returns early when the retention cleanup object store is unavailable", async (): Promise<void> => {
    const listExpiredSampledRawEvents = vi.fn();
    const pruneExpiredAnalyticsRollups = vi.fn();
    const listExpiredIncidents = vi.fn();

    const retentionCleanup = createRetentionCleanupService({
      retentionStore: createMockRetentionStore({
        listExpiredSampledRawEvents,
        pruneExpiredAnalyticsRollups,
        listExpiredIncidents
      }),
      objectStore: {}
    });

    await retentionCleanup.runCleanup({
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });

    expect(listExpiredSampledRawEvents).not.toHaveBeenCalled();
    expect(pruneExpiredAnalyticsRollups).not.toHaveBeenCalled();
    expect(listExpiredIncidents).not.toHaveBeenCalled();
  });

  it("marks raw events expired after successful raw-object cleanup", async (): Promise<void> => {
    const markRawEventsExpired = vi.fn().mockResolvedValue(undefined);

    const retentionCleanup = createRetentionCleanupService({
      retentionStore: createMockRetentionStore({
        listExpiredSampledRawEvents: vi.fn().mockResolvedValue([
          {
            project_id: "proj_123",
            event_id: "evt_123",
            occurred_at: "2026-04-04T10:00:00.000Z"
          }
        ]),
        markRawEventsExpired
      }),
      objectStore: {
        deleteObject: vi.fn().mockResolvedValue(undefined)
      },
      batchSize: 10,
      maxBatches: 1
    });

    await retentionCleanup.runCleanup({
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });

    expect(markRawEventsExpired).toHaveBeenCalledWith({
      references: [
        {
          project_id: "proj_123",
          event_id: "evt_123",
          occurred_at: "2026-04-04T10:00:00.000Z"
        }
      ]
    });
  });

  it("deletes analytics raw metadata after successful raw-object cleanup", async (): Promise<void> => {
    const deleteExpiredAnalyticsRawEvents = vi.fn().mockResolvedValue(undefined);
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const reference = {
      project_id: "proj_123",
      event_id: "550e8400-e29b-41d4-a716-446655440000",
      occurred_at: "2026-04-04T10:00:00.000Z"
    };

    const retentionCleanup = createRetentionCleanupService({
      retentionStore: createMockRetentionStore({
        listExpiredAnalyticsRawEvents: vi.fn().mockResolvedValue([reference]),
        deleteExpiredAnalyticsRawEvents
      }),
      objectStore: {
        deleteObject
      },
      batchSize: 10,
      maxBatches: 1
    });

    await retentionCleanup.runCleanup({
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });

    expect(deleteObject).toHaveBeenCalledWith({
      key: buildAnalyticsRawEventObjectKey({
        projectId: reference.project_id,
        occurredAt: new Date(reference.occurred_at),
        eventId: reference.event_id
      })
    });
    expect(deleteExpiredAnalyticsRawEvents).toHaveBeenCalledWith({
      references: [reference]
    });
  });

  it("deletes journey sample metadata after successful sample-object cleanup", async (): Promise<void> => {
    const deleteExpiredAnalyticsJourneySamples = vi.fn().mockResolvedValue(undefined);
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const reference = {
      project_id: "proj_123",
      sample_id: "22222222-2222-4222-8222-222222222222",
      s3_object_key: "analytics-journeys/proj_123/22222222-2222-4222-8222-222222222222.json.gz",
      expires_at: "2026-04-04T10:00:00.000Z"
    };

    const retentionCleanup = createRetentionCleanupService({
      retentionStore: createMockRetentionStore({
        listExpiredAnalyticsJourneySamples: vi.fn().mockResolvedValue([reference]),
        deleteExpiredAnalyticsJourneySamples
      }),
      objectStore: {
        deleteObject
      },
      batchSize: 10,
      maxBatches: 1
    });

    await retentionCleanup.runCleanup({
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });

    expect(deleteObject).toHaveBeenCalledWith({
      key: reference.s3_object_key
    });
    expect(deleteExpiredAnalyticsJourneySamples).toHaveBeenCalledWith({
      references: [reference]
    });
  });

  it("deletes AnalyticsBundle generation metadata after successful artifact cleanup", async (): Promise<void> => {
    const deleteExpiredAnalyticsBundleGenerations = vi.fn().mockResolvedValue(undefined);
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const reference = {
      project_id: "proj_123",
      generation_id: "33333333-3333-4333-8333-333333333333",
      opportunity_id: "44444444-4444-4444-8444-444444444444",
      status: "completed" as const,
      object_key:
        "analytics-bundles/proj_123/33333333-3333-4333-8333-333333333333/analytics-bundle.json.gz",
      completed_at: "2026-04-04T10:00:00.000Z",
      updated_at: "2026-04-04T10:00:00.000Z"
    };

    const retentionCleanup = createRetentionCleanupService({
      retentionStore: createMockRetentionStore({
        listExpiredAnalyticsBundleGenerations: vi.fn().mockResolvedValue([reference]),
        deleteExpiredAnalyticsBundleGenerations
      }),
      objectStore: {
        deleteObject
      },
      batchSize: 10,
      maxBatches: 1
    });

    await retentionCleanup.runCleanup({
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });

    expect(deleteObject).toHaveBeenCalledWith({
      key: reference.object_key
    });
    expect(deleteExpiredAnalyticsBundleGenerations).toHaveBeenCalledWith({
      references: [reference]
    });
  });

  it("deletes failed AnalyticsBundle generation metadata without artifact cleanup", async (): Promise<void> => {
    const deleteExpiredAnalyticsBundleGenerations = vi.fn().mockResolvedValue(undefined);
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const reference = {
      project_id: "proj_123",
      generation_id: "33333333-3333-4333-8333-333333333333",
      opportunity_id: "44444444-4444-4444-8444-444444444444",
      status: "failed" as const,
      object_key: null,
      completed_at: null,
      updated_at: "2026-04-04T10:00:00.000Z"
    };

    const retentionCleanup = createRetentionCleanupService({
      retentionStore: createMockRetentionStore({
        listExpiredAnalyticsBundleGenerations: vi.fn().mockResolvedValue([reference]),
        deleteExpiredAnalyticsBundleGenerations
      }),
      objectStore: {
        deleteObject
      },
      batchSize: 10,
      maxBatches: 1
    });

    await retentionCleanup.runCleanup({
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });

    expect(deleteObject).not.toHaveBeenCalled();
    expect(deleteExpiredAnalyticsBundleGenerations).toHaveBeenCalledWith({
      references: [reference]
    });
  });

  it("does not delete analytics metadata when object cleanup fails", async (): Promise<void> => {
    const deleteExpiredAnalyticsRawEvents = vi.fn().mockResolvedValue(undefined);
    const deleteExpiredAnalyticsJourneySamples = vi.fn().mockResolvedValue(undefined);
    const deleteExpiredAnalyticsBundleGenerations = vi.fn().mockResolvedValue(undefined);

    const retentionCleanup = createRetentionCleanupService({
      retentionStore: createMockRetentionStore({
        listExpiredAnalyticsRawEvents: vi.fn().mockResolvedValue([
          {
            project_id: "proj_123",
            event_id: "550e8400-e29b-41d4-a716-446655440000",
            occurred_at: "2026-04-04T10:00:00.000Z"
          }
        ]),
        deleteExpiredAnalyticsRawEvents,
        listExpiredAnalyticsJourneySamples: vi.fn().mockResolvedValue([
          {
            project_id: "proj_123",
            sample_id: "22222222-2222-4222-8222-222222222222",
            s3_object_key:
              "analytics-journeys/proj_123/22222222-2222-4222-8222-222222222222.json.gz",
            expires_at: "2026-04-04T10:00:00.000Z"
          }
        ]),
        deleteExpiredAnalyticsJourneySamples,
        listExpiredAnalyticsBundleGenerations: vi.fn().mockResolvedValue([
          {
            project_id: "proj_123",
            generation_id: "33333333-3333-4333-8333-333333333333",
            opportunity_id: "44444444-4444-4444-8444-444444444444",
            status: "completed",
            object_key:
              "analytics-bundles/proj_123/33333333-3333-4333-8333-333333333333/analytics-bundle.json.gz",
            completed_at: "2026-04-04T10:00:00.000Z",
            updated_at: "2026-04-04T10:00:00.000Z"
          }
        ]),
        deleteExpiredAnalyticsBundleGenerations
      }),
      objectStore: {
        deleteObject: vi.fn().mockRejectedValue(new Error("delete_failed"))
      },
      batchSize: 10,
      maxBatches: 1
    });

    await retentionCleanup.runCleanup({
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });

    expect(deleteExpiredAnalyticsRawEvents).not.toHaveBeenCalled();
    expect(deleteExpiredAnalyticsJourneySamples).not.toHaveBeenCalled();
    expect(deleteExpiredAnalyticsBundleGenerations).not.toHaveBeenCalled();
  });

  it("stops after an empty retention cleanup batch", async (): Promise<void> => {
    const listExpiredSampledRawEvents = vi.fn().mockResolvedValue([]);
    const pruneExpiredAnalyticsRollups = vi
      .fn()
      .mockResolvedValue({ deleted_rows: 0, reached_batch_limit: false });
    const listExpiredIncidents = vi.fn().mockResolvedValue([]);

    const retentionCleanup = createRetentionCleanupService({
      retentionStore: createMockRetentionStore({
        listExpiredSampledRawEvents,
        pruneExpiredAnalyticsRollups,
        listExpiredIncidents
      }),
      objectStore: {
        deleteObject: vi.fn().mockResolvedValue(undefined)
      },
      batchSize: 10,
      maxBatches: 2
    });

    await retentionCleanup.runCleanup({
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });

    expect(listExpiredSampledRawEvents).toHaveBeenCalledTimes(1);
    expect(pruneExpiredAnalyticsRollups).toHaveBeenCalledTimes(1);
    expect(listExpiredIncidents).toHaveBeenCalledTimes(1);
  });

  it("continues cleanup batches while analytics aggregate pruning reaches the batch limit", async (): Promise<void> => {
    const pruneExpiredAnalyticsRollups = vi
      .fn()
      .mockResolvedValueOnce({ deleted_rows: 10, reached_batch_limit: true })
      .mockResolvedValueOnce({ deleted_rows: 1, reached_batch_limit: false });

    const retentionCleanup = createRetentionCleanupService({
      retentionStore: createMockRetentionStore({
        pruneExpiredAnalyticsRollups
      }),
      objectStore: {
        deleteObject: vi.fn().mockResolvedValue(undefined)
      },
      batchSize: 10,
      maxBatches: 3
    });

    await retentionCleanup.runCleanup({
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });

    expect(pruneExpiredAnalyticsRollups).toHaveBeenCalledTimes(2);
  });

  it("does not delete expired incident metadata when artifact cleanup only partially succeeds", async (): Promise<void> => {
    const deleteObject = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("delete_failed"));
    const deleteExpiredIncidents = vi.fn().mockResolvedValue(undefined);

    const retentionCleanup = createRetentionCleanupService({
      retentionStore: createMockRetentionStore({
        listExpiredIncidents: vi
          .fn()
          .mockResolvedValue([{ project_id: "proj_123", incident_id: "inc_123" }]),
        deleteExpiredIncidents
      }),
      objectStore: {
        deleteObject
      },
      batchSize: 10,
      maxBatches: 1
    });

    await retentionCleanup.runCleanup({
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });

    expect(deleteObject).toHaveBeenNthCalledWith(1, {
      key: buildBundleObjectKey("proj_123", "inc_123")
    });
    expect(deleteObject).toHaveBeenNthCalledWith(2, {
      key: buildReproductionObjectKey("proj_123", "inc_123")
    });
    expect(deleteExpiredIncidents).not.toHaveBeenCalled();
  });

  it("deletes expired incident metadata only after bundle and reproduction cleanup both succeed", async (): Promise<void> => {
    const deleteExpiredIncidents = vi.fn().mockResolvedValue(undefined);

    const retentionCleanup = createRetentionCleanupService({
      retentionStore: createMockRetentionStore({
        listExpiredIncidents: vi
          .fn()
          .mockResolvedValue([{ project_id: "proj_123", incident_id: "inc_123" }]),
        deleteExpiredIncidents
      }),
      objectStore: {
        deleteObject: vi.fn().mockResolvedValue(undefined)
      },
      batchSize: 10,
      maxBatches: 1
    });

    await retentionCleanup.runCleanup({
      scheduled_at: "2026-04-04T12:00:00.000Z"
    });

    expect(deleteExpiredIncidents).toHaveBeenCalledWith({
      references: [{ project_id: "proj_123", incident_id: "inc_123" }]
    });
  });
});
