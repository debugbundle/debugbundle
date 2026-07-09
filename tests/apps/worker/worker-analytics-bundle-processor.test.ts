import { gunzipSync, gzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import { processNextBuildAnalyticsBundleJob } from "../../../apps/worker/src/analytics-bundle-processor.js";
import { AnalyticsBundleV1Schema } from "../../../packages/shared-types/src/index.js";
import {
  buildAnalyticsBundleObjectKey,
  type AnalyticsBundleGenerationRecord,
  type AnalyticsJourneySampleStore,
  type AnalyticsMetricsStore
} from "../../../packages/storage/src/index.js";
import type { RuntimeLogger } from "../../../packages/runtime-logger/src/index.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const GENERATION_ID = "33333333-3333-4333-8333-333333333333";
const SAMPLE_ID = "00000000-0000-4000-8000-000000000901";
const INPUT_FINGERPRINT = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("worker processor - build-analytics-bundle", () => {
  it("builds and stores a deterministic AnalyticsBundle artifact from aggregate metrics", async (): Promise<void> => {
    const ack = vi.fn().mockResolvedValue(undefined);
    const putObject = vi.fn().mockResolvedValue(undefined);
    const getObject = vi.fn(async () => compressedJourneySampleArtifact());
    const markAnalyticsBundleGenerationCompleted = vi.fn().mockResolvedValue({
      ...createGenerationRecord(),
      status: "completed",
      object_key: buildAnalyticsBundleObjectKey(PROJECT_ID, GENERATION_ID)
    });
    const generationStore = {
      reserveAnalyticsBundleGeneration: vi.fn(),
      listAnalyticsBundleGenerationsForProject: vi.fn(),
      getAnalyticsBundleGenerationForProject: vi.fn().mockResolvedValue(createGenerationRecord()),
      claimAnalyticsBundleGenerationForProject: vi.fn().mockResolvedValue({
        ...createGenerationRecord(),
        status: "running",
        claimed_at: "2026-07-08T12:00:00.000Z"
      }),
      claimPendingAnalyticsBundleGeneration: vi.fn(),
      markAnalyticsBundleGenerationCompleted,
      markAnalyticsBundleGenerationFailed: vi.fn()
    };

    await expect(
      processNextBuildAnalyticsBundleJob({
        queue: {
          claim: vi.fn().mockResolvedValue({
            payload: {
              project_id: PROJECT_ID,
              generation_id: GENERATION_ID,
              requested_at: "2026-07-08T12:00:00.000Z",
              trigger: "manual"
            },
            ack
          })
        },
        analyticsBundleGenerationStore: generationStore,
        analyticsMetricsStore: createMetricsStore(),
        analyticsJourneySampleStore: createJourneySampleStore(),
        objectStore: { putObject, getObject }
      })
    ).resolves.toEqual({ processed: true });

    expect(generationStore.claimAnalyticsBundleGenerationForProject).toHaveBeenCalledWith({
      project_id: PROJECT_ID,
      generation_id: GENERATION_ID,
      claimed_at: expect.any(String)
    });
    expect(putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: buildAnalyticsBundleObjectKey(PROJECT_ID, GENERATION_ID),
        contentType: "application/json",
        contentEncoding: "gzip"
      })
    );
    const body = putObject.mock.calls[0]?.[0]?.body as Buffer;
    const bundle = AnalyticsBundleV1Schema.parse(JSON.parse(gunzipSync(body).toString("utf8")));
    expect(bundle).toMatchObject({
      bundle_type: "analytics",
      analysis_kind: "funnel_dropoff",
      project: {
        project_id: PROJECT_ID,
        service: "web",
        environment: "production"
      },
      metrics: {
        sessions_analyzed: 120,
        affected_sessions: 30
      },
      metadata: {
        input_fingerprint: INPUT_FINGERPRINT
      }
    });
    expect(bundle.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dimension: "device_type", value: "mobile", sessions: 80 }),
        expect.objectContaining({ dimension: "browser", value: "Chrome", sessions: 90 })
      ])
    );
    expect(bundle.journey_patterns).toEqual([
      {
        from_route_key: "/pricing",
        to_route_key: "/checkout",
        transition_count: 70,
        unique_sessions: 60,
        transition_share: 1,
        sample_ids: [SAMPLE_ID]
      }
    ]);
    expect(bundle.representative_journeys).toEqual([
      expect.objectContaining({
        sample_id: SAMPLE_ID,
        event_count: 2,
        timeline: expect.objectContaining({
          "001": expect.objectContaining({ kind: "page_view", route: "/pricing" }),
          "002": expect.objectContaining({ kind: "route_change", previous_route: "/pricing", route: "/checkout" })
        })
      })
    ]);
    expect(markAnalyticsBundleGenerationCompleted).toHaveBeenCalledWith({
      project_id: PROJECT_ID,
      generation_id: GENERATION_ID,
      completed_at: expect.any(String)
    });
    expect(ack).toHaveBeenCalledOnce();
  });

  it("acks completed generations without rebuilding the artifact", async (): Promise<void> => {
    const ack = vi.fn().mockResolvedValue(undefined);
    const putObject = vi.fn();
    const getObject = vi.fn();

    await expect(
      processNextBuildAnalyticsBundleJob({
        queue: {
          claim: vi.fn().mockResolvedValue({
            payload: {
              project_id: PROJECT_ID,
              generation_id: GENERATION_ID,
              requested_at: "2026-07-08T12:00:00.000Z",
              trigger: "regeneration"
            },
            ack
          })
        },
        analyticsBundleGenerationStore: {
          reserveAnalyticsBundleGeneration: vi.fn(),
          listAnalyticsBundleGenerationsForProject: vi.fn(),
          getAnalyticsBundleGenerationForProject: vi.fn().mockResolvedValue({
            ...createGenerationRecord(),
            status: "completed"
          }),
          claimAnalyticsBundleGenerationForProject: vi.fn(),
          claimPendingAnalyticsBundleGeneration: vi.fn(),
          markAnalyticsBundleGenerationCompleted: vi.fn(),
          markAnalyticsBundleGenerationFailed: vi.fn()
        },
        analyticsMetricsStore: createMetricsStore(),
        analyticsJourneySampleStore: createJourneySampleStore(),
        objectStore: { putObject, getObject }
      })
    ).resolves.toEqual({ processed: true, reason: "analytics_bundle_generation_completed" });

    expect(putObject).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledOnce();
  });

  it("builds route-health bundles with incident-affected sessions", async (): Promise<void> => {
    const bundle = await buildBundleForGeneration(
      {
        analysis_kind: "route_health",
        analysis_spec: {
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-07-08T00:00:00.000Z",
          service: "web",
          environment: "production"
        }
      },
      { sessions: 10, routeIncidentSessions: 6 }
    );

    expect(bundle.summary).toMatchObject({
      title: "route health analysis",
      confidence: "low",
      severity: "high"
    });
    expect(bundle.metrics.affected_sessions).toBe(6);
  });

  it("builds journey-friction bundles from transition-pattern sessions", async (): Promise<void> => {
    const bundle = await buildBundleForGeneration(
      {
        analysis_kind: "journey_friction",
        analysis_spec: {
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-07-08T00:00:00.000Z",
          service: "web",
          environment: "production"
        }
      },
      { sessions: 30, journeySessions: 12 }
    );

    expect(bundle.summary).toMatchObject({
      title: "journey friction analysis",
      confidence: "medium",
      severity: "high"
    });
    expect(bundle.metrics.affected_sessions).toBe(12);
  });

  it("links incident-impact bundles from scalar and related analysis spec IDs", async (): Promise<void> => {
    const bundle = await buildBundleForGeneration({
      analysis_kind: "incident_impact",
      analysis_spec: {
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-08T00:00:00.000Z",
        incident_id: "44444444-4444-4444-8444-444444444444",
        related_incident_ids: [
          "55555555-5555-4555-8555-555555555555",
          "44444444-4444-4444-8444-444444444444"
        ],
        deploy_id: "deploy_123",
        related_deploy_ids: ["deploy_456", "deploy_123"]
      }
    });

    expect(bundle.analysis_kind).toBe("incident_impact");
    expect(bundle.linked_incidents).toEqual([
      { incident_id: "44444444-4444-4444-8444-444444444444" },
      { incident_id: "55555555-5555-4555-8555-555555555555" }
    ]);
    expect(bundle.linked_deploys).toEqual([
      { deploy_id: "deploy_123" },
      { deploy_id: "deploy_456" }
    ]);
  });

  it("keeps usage-summary bundles aggregate-only while preserving linked context", async (): Promise<void> => {
    const bundle = await buildBundleForGeneration({
      analysis_kind: "usage_summary",
      analysis_spec: {
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-08T00:00:00.000Z",
        service: "web",
        environment: "production",
        representative_journeys: [{ sample_id: "sample_1", route_count: 4 }, null],
        related_incident_ids: ["44444444-4444-4444-8444-444444444444", ""],
        related_deploy_ids: ["deploy_123"]
      }
    });

    expect(bundle.metrics.affected_sessions).toBeNull();
    expect(bundle.summary).toMatchObject({
      title: "usage summary analysis",
      severity: "low"
    });
    expect(bundle.representative_journeys).toEqual([{ route_count: 4, sample_id: "sample_1" }]);
    expect(bundle.linked_incidents).toEqual([{ incident_id: "44444444-4444-4444-8444-444444444444" }]);
    expect(bundle.linked_deploys).toEqual([{ deploy_id: "deploy_123" }]);
    expect(bundle.recommendations).toEqual([
      expect.objectContaining({ action: "review_top_segments_and_routes" })
    ]);
  });

  it("skips unavailable representative journey samples without failing generation", async (): Promise<void> => {
    const logger = { warn: vi.fn() };
    const bundle = await buildBundleForGeneration(
      {
        analysis_kind: "journey_friction",
        analysis_spec: {
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-07-08T00:00:00.000Z",
          service: "web",
          environment: "production"
        }
      },
      {},
      {
        journeySampleStore: createJourneySampleStore({
          getAnalyticsJourneySampleForProject: vi.fn(async () => null)
        }),
        logger
      }
    );

    expect(bundle.representative_journeys).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("skips invalid representative journey sample artifacts without failing generation", async (): Promise<void> => {
    const logger = { warn: vi.fn() };
    const bundle = await buildBundleForGeneration(
      {
        analysis_kind: "journey_friction",
        analysis_spec: {
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-07-08T00:00:00.000Z",
          service: "web",
          environment: "production"
        }
      },
      {},
      {
        getObject: vi.fn(async () => gzipSync(Buffer.from(JSON.stringify({ schema_version: "wrong" }), "utf8"))),
        logger
      }
    );

    expect(bundle.representative_journeys).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      { project_id: PROJECT_ID, sample_id: SAMPLE_ID },
      "worker_analytics_bundle_journey_sample_invalid"
    );
  });

  it("marks the generation failed when artifact persistence throws", async (): Promise<void> => {
    const ack = vi.fn().mockResolvedValue(undefined);
    const logger = { error: vi.fn() };
    const markAnalyticsBundleGenerationFailed = vi.fn().mockResolvedValue({
      ...createGenerationRecord(),
      status: "failed",
      failure_reason: "build_error"
    });

    await expect(
      processNextBuildAnalyticsBundleJob({
        queue: {
          claim: vi.fn().mockResolvedValue({
            payload: {
              project_id: PROJECT_ID,
              generation_id: GENERATION_ID,
              requested_at: "2026-07-08T12:00:00.000Z",
              trigger: "manual"
            },
            ack
          })
        },
        analyticsBundleGenerationStore: {
          reserveAnalyticsBundleGeneration: vi.fn(),
          listAnalyticsBundleGenerationsForProject: vi.fn(),
          getAnalyticsBundleGenerationForProject: vi.fn().mockResolvedValue(createGenerationRecord()),
          claimAnalyticsBundleGenerationForProject: vi.fn().mockResolvedValue({
            ...createGenerationRecord(),
            status: "running"
          }),
          claimPendingAnalyticsBundleGeneration: vi.fn(),
          markAnalyticsBundleGenerationCompleted: vi.fn(),
          markAnalyticsBundleGenerationFailed
        },
        analyticsMetricsStore: createMetricsStore(),
        analyticsJourneySampleStore: createJourneySampleStore(),
        objectStore: {
          putObject: vi.fn().mockRejectedValue(new Error("s3_write_failed")),
          getObject: vi.fn(async () => compressedJourneySampleArtifact())
        },
        logger: logger as unknown as RuntimeLogger
      })
    ).resolves.toEqual({ processed: true, reason: "analytics_bundle_generation_failed" });

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error_message: "s3_write_failed" }),
      "worker_build_analytics_bundle_failed"
    );
    expect(markAnalyticsBundleGenerationFailed).toHaveBeenCalledWith({
      project_id: PROJECT_ID,
      generation_id: GENERATION_ID,
      failed_at: expect.any(String),
      reason: "build_error"
    });
    expect(ack).toHaveBeenCalledOnce();
  });
});

function createGenerationRecord(
  overrides: Partial<AnalyticsBundleGenerationRecord> = {}
): AnalyticsBundleGenerationRecord {
  return {
    generation_id: GENERATION_ID,
    project_id: PROJECT_ID,
    opportunity_id: "22222222-2222-4222-8222-222222222222",
    requested_by_user_id: null,
    analysis_kind: "funnel_dropoff",
    analysis_spec: {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-08T00:00:00.000Z",
      granularity: "day",
      service: "web",
      environment: "production",
      funnel_key: "checkout"
    },
    input_fingerprint: INPUT_FINGERPRINT,
    status: "pending",
    object_key: null,
    failure_reason: null,
    created_at: "2026-07-08T10:00:00.000Z",
    claimed_at: null,
    completed_at: null,
    updated_at: "2026-07-08T10:00:00.000Z",
    ...overrides
  };
}

async function buildBundleForGeneration(
  generationOverrides: Partial<AnalyticsBundleGenerationRecord>,
  metricsOverrides: MetricsStoreOverrides = {},
  dependencyOverrides: {
    journeySampleStore?: ReturnType<typeof createJourneySampleStore>;
    getObject?: (input: { key: string }) => Promise<Buffer>;
    logger?: Pick<RuntimeLogger, "warn">;
  } = {}
) {
  const putObject = vi.fn().mockResolvedValue(undefined);
  await processNextBuildAnalyticsBundleJob({
    queue: {
      claim: vi.fn().mockResolvedValue({
        payload: {
          project_id: PROJECT_ID,
          generation_id: GENERATION_ID,
          requested_at: "2026-07-08T12:00:00.000Z",
          trigger: "manual"
        },
        ack: vi.fn().mockResolvedValue(undefined)
      })
    },
    analyticsBundleGenerationStore: {
      reserveAnalyticsBundleGeneration: vi.fn(),
      listAnalyticsBundleGenerationsForProject: vi.fn(),
      getAnalyticsBundleGenerationForProject: vi.fn().mockResolvedValue(createGenerationRecord(generationOverrides)),
      claimAnalyticsBundleGenerationForProject: vi.fn().mockResolvedValue({
        ...createGenerationRecord(generationOverrides),
        status: "running"
      }),
      claimPendingAnalyticsBundleGeneration: vi.fn(),
      markAnalyticsBundleGenerationCompleted: vi.fn().mockResolvedValue({
        ...createGenerationRecord(generationOverrides),
        status: "completed"
      }),
      markAnalyticsBundleGenerationFailed: vi.fn()
    },
    analyticsMetricsStore: createMetricsStore(metricsOverrides),
    analyticsJourneySampleStore: dependencyOverrides.journeySampleStore ?? createJourneySampleStore(),
    objectStore: {
      putObject,
      getObject: dependencyOverrides.getObject ?? vi.fn(async () => compressedJourneySampleArtifact())
    },
    ...(dependencyOverrides.logger === undefined ? {} : { logger: dependencyOverrides.logger as RuntimeLogger })
  });

  const body = putObject.mock.calls[0]?.[0]?.body as Buffer;
  return AnalyticsBundleV1Schema.parse(JSON.parse(gunzipSync(body).toString("utf8")));
}

type MetricsStoreOverrides = {
  sessions?: number;
  routeIncidentSessions?: number;
  journeySessions?: number;
};

function createMetricsStore(overrides: MetricsStoreOverrides = {}): AnalyticsMetricsStore {
  const sessions = overrides.sessions ?? 120;
  const routeIncidentSessions = overrides.routeIncidentSessions ?? 6;
  const journeySessions = overrides.journeySessions ?? 60;

  return {
    getUsageSummary: vi.fn().mockResolvedValue({
      summary: {
        project_id: PROJECT_ID,
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-08T00:00:00.000Z",
        granularity: "day",
        service: "web",
        environment: "production",
        sessions,
        pageviews: 420,
        active_visitors: 110,
        new_visitors: 70,
        returning_visitors: 40,
        exits: 20,
        conversions: 35
      },
      breakdowns: {
        device_types: [{ value: "mobile", sessions: 80, pageviews: 300 }],
        browsers: [{ value: "Chrome", sessions: 90, pageviews: 320 }],
        os: [{ value: "iOS", sessions: 60, pageviews: 210 }],
        languages: [{ value: "en-US", sessions: 100, pageviews: 370 }],
        referrers: [{ value: "direct", sessions: 50, pageviews: 150 }],
        auth_states: [{ value: "anonymous", sessions: 90, pageviews: 300 }]
      }
    }),
    getRouteMetrics: vi.fn().mockResolvedValue({
      window: metricWindow(),
      routes: [
        {
          route_key: "/checkout",
          pageviews: 140,
          unique_sessions: 90,
          entrances: 40,
          exits: 20,
          bounces: 8,
          linked_incident_sessions: routeIncidentSessions
        }
      ]
    }),
    getJourneyPatterns: vi.fn().mockResolvedValue({
      window: metricWindow(),
      patterns: [
        {
          from_route_key: "/pricing",
          to_route_key: "/checkout",
          transition_count: 70,
          unique_sessions: journeySessions,
          transition_share: 1,
          sample_ids: [SAMPLE_ID]
        }
      ]
    }),
    getDeviceBreakdown: vi.fn().mockResolvedValue({
      window: metricWindow(),
      device_types: [{ value: "mobile", sessions: 80, pageviews: 300 }],
      browsers: [{ value: "Chrome", sessions: 90, pageviews: 320 }],
      os: [{ value: "iOS", sessions: 60, pageviews: 210 }],
      languages: [{ value: "en-US", sessions: 100, pageviews: 370 }]
    }),
    getReferrerMetrics: vi.fn().mockResolvedValue({
      window: metricWindow(),
      referrers: [{ value: "direct", sessions: 50, pageviews: 150 }],
      utm_sources: [{ value: "newsletter", sessions: 20, pageviews: 80 }],
      utm_mediums: [{ value: "email", sessions: 20, pageviews: 80 }],
      utm_campaigns: [{ value: "summer", sessions: 20, pageviews: 80 }]
    }),
    listFunnels: vi.fn().mockResolvedValue({
      window: metricWindow(),
      funnels: []
    }),
    getFunnelAnalysis: vi.fn().mockResolvedValue({
      funnel: {
        ...metricWindow(),
        funnel_key: "checkout",
        sessions_entered: 100,
        sessions_completed: 70,
        dropoffs: 30,
        conversion_rate: 0.7
      },
      steps: [
        {
          step_key: "payment",
          step_order: 2,
          sessions_entered: 80,
          sessions_completed: 60,
          dropoffs: 20,
          conversion_rate: 0.75
        }
      ]
    })
  };
}

function createJourneySampleStore(
  overrides: Partial<Pick<AnalyticsJourneySampleStore, "getAnalyticsJourneySampleForProject">> = {}
): Pick<AnalyticsJourneySampleStore, "getAnalyticsJourneySampleForProject"> {
  return {
    getAnalyticsJourneySampleForProject: vi.fn(async () => ({
      sample_id: SAMPLE_ID,
      project_id: PROJECT_ID,
      service: "web",
      environment: "production",
      session_id_hash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      visitor_id_hash: null,
      analysis_tags: ["route:/pricing", "transition:/pricing->/checkout"],
      first_seen_at: "2026-07-02T10:00:00.000Z",
      last_seen_at: "2026-07-02T10:05:00.000Z",
      dimensions_summary: { device_type: "desktop" },
      has_artifact: true,
      object_key: `analytics-journeys/${PROJECT_ID}/${SAMPLE_ID}.json.gz`,
      expires_at: "2026-07-16T10:05:00.000Z",
      created_at: "2026-07-02T10:00:00.000Z"
    })),
    ...overrides
  };
}

function compressedJourneySampleArtifact(): Buffer {
  return gzipSync(Buffer.from(JSON.stringify({
    schema_version: "analytics_journey_sample.v1",
    sample_id: SAMPLE_ID,
    project_id: PROJECT_ID,
    service: "web",
    environment: "production",
    session_id_hash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    visitor_id_hash: null,
    first_seen_at: "2026-07-02T10:00:00.000Z",
    last_seen_at: "2026-07-02T10:05:00.000Z",
    analysis_tags: ["route:/pricing", "transition:/pricing->/checkout"],
    dimensions_summary: { device_type: "desktop" },
    events: [
      {
        event_id: "event_1",
        occurred_at: "2026-07-02T10:00:00.000Z",
        kind: "page_view",
        route: { normalized_path: "/pricing", path: "/pricing" },
        previous_route: null,
        signal: null,
        trace_id: null,
        deploy_id: "deploy_1",
        dimensions: { device_type: "desktop" },
        custom_dimensions: {}
      },
      {
        event_id: "event_2",
        occurred_at: "2026-07-02T10:05:00.000Z",
        kind: "route_change",
        route: { normalized_path: "/checkout", path: "/checkout" },
        previous_route: { normalized_path: "/pricing", path: "/pricing" },
        signal: { funnel_key: "checkout", step_key: "payment" },
        trace_id: "trace_1",
        deploy_id: "deploy_1",
        dimensions: { device_type: "desktop" },
        custom_dimensions: {}
      }
    ]
  }), "utf8"));
}

function metricWindow() {
  return {
    project_id: PROJECT_ID,
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-07-08T00:00:00.000Z",
    granularity: "day" as const,
    service: "web",
    environment: "production"
  };
}
