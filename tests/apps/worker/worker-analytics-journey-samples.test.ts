import { gunzipSync, gzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import {
  buildAnalyticsJourneySampleId,
  maybeCaptureAnalyticsJourneySample
} from "../../../apps/worker/src/analytics-journey-samples.js";
import type { AnalyticsEventEnvelope } from "../../../packages/shared-types/src/index.js";
import { hashAnalyticsSessionSubject } from "../../../packages/storage/src/index.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_ID = "99999999-9999-4999-8999-999999999999";

function createAnalyticsEvent(overrides: Partial<AnalyticsEventEnvelope> = {}): AnalyticsEventEnvelope {
  return {
    schema_version: "2026-07-analytics-01",
    event_id: "550e8400-e29b-41d4-a716-446655440000",
    event_type: "analytics_event",
    occurred_at: "2026-03-10T13:45:27.000Z",
    sdk_name: "@debugbundle/sdk-browser",
    sdk_version: "1.0.0",
    service: {
      name: "web",
      runtime: "browser",
      framework: "react",
      environment: "production"
    },
    correlation: {
      session_id: "sess_123",
      visitor_id_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      user_id_hash: null,
      trace_id: "trace_123",
      deploy_id: "deploy_123"
    },
    payload: {
      kind: "page_view",
      route: {
        path: "/pricing",
        normalized_path: "/pricing",
        title: "Pricing"
      },
      dimensions: {
        auth_state: "anonymous",
        device_type: "desktop",
        browser_family: "Chrome",
        browser_major: 125,
        os_family: "macOS",
        os_major: 14,
        language: "en",
        locale: "en-US",
        viewport_bucket: "large",
        referrer_domain: "example.com",
        utm_source: "newsletter",
        utm_medium: null,
        utm_campaign: null,
        country_code: null,
        region_code: null
      },
      custom_dimensions: { plan: "team" }
    },
    ...overrides
  };
}

describe("analytics journey sample capture", () => {
  it("builds deterministic sample ids per project, session, and UTC day", (): void => {
    const event = createAnalyticsEvent();

    expect(buildAnalyticsJourneySampleId(PROJECT_ID, event)).toBe(
      buildAnalyticsJourneySampleId(PROJECT_ID, event)
    );
    expect(
      buildAnalyticsJourneySampleId(PROJECT_ID, {
        ...event,
        occurred_at: "2026-03-11T00:00:00.000Z"
      })
    ).not.toBe(buildAnalyticsJourneySampleId(PROJECT_ID, event));
  });

  it("merges existing retained journey artifacts without duplicating events", async (): Promise<void> => {
    const firstEvent = createAnalyticsEvent();
    const secondEvent = createAnalyticsEvent({
      event_id: "650e8400-e29b-41d4-a716-446655440000",
      occurred_at: "2026-03-10T13:47:00.000Z",
      payload: {
        ...firstEvent.payload,
        kind: "action",
        signal: {
          action_key: "pricing.cta",
          funnel_key: null,
          step_key: null,
          conversion_key: null,
          marker_key: null
        }
      }
    });
    const sampleId = buildAnalyticsJourneySampleId(PROJECT_ID, firstEvent);
    const existingArtifact = {
      schema_version: "analytics_journey_sample.v1",
      sample_id: sampleId,
      project_id: PROJECT_ID,
      service: "web",
      environment: "production",
      session_id_hash: "sha256:existing",
      visitor_id_hash: firstEvent.correlation.visitor_id_hash,
      first_seen_at: firstEvent.occurred_at,
      last_seen_at: firstEvent.occurred_at,
      analysis_tags: ["page_view"],
      dimensions_summary: { device_type: "desktop" },
      events: [{
        event_id: firstEvent.event_id,
        occurred_at: firstEvent.occurred_at,
        kind: "page_view",
        route: firstEvent.payload.route,
        previous_route: null,
        signal: null,
        trace_id: firstEvent.correlation.trace_id,
        deploy_id: firstEvent.correlation.deploy_id,
        dimensions: firstEvent.payload.dimensions,
        custom_dimensions: firstEvent.payload.custom_dimensions
      }]
    };
    const putObject = vi.fn().mockResolvedValue(undefined);
    const reserveAnalyticsJourneySample = vi.fn().mockResolvedValue("exists");
    const recordAnalyticsJourneySample = vi.fn().mockResolvedValue({});

    await expect(
      maybeCaptureAnalyticsJourneySample({
        project_id: PROJECT_ID,
        event: secondEvent,
        dependencies: {
          analyticsSettingsStore: {
            getAnalyticsSettingsByProjectId: vi.fn().mockResolvedValue({
              enabled: true,
              journey_sample_rate: 1,
              sample_retention_days: 30
            })
          },
          analyticsJourneySampleStore: {
            reserveAnalyticsJourneySample,
            recordAnalyticsJourneySample,
            deleteAnalyticsJourneySampleForProject: vi.fn()
          },
          objectStore: {
            getObject: vi.fn().mockResolvedValue(gzipSync(Buffer.from(JSON.stringify(existingArtifact), "utf8"))),
            putObject
          }
        }
      })
    ).resolves.toEqual({ captured: true });

    const payload = putObject.mock.calls[0]?.[0] as { body: Buffer };
    const artifact = JSON.parse(gunzipSync(payload.body).toString("utf8")) as {
      events: Array<{ event_id: string }>;
      analysis_tags: string[];
      last_seen_at: string;
    };
    expect(artifact.events.map((event) => event.event_id)).toEqual([
      firstEvent.event_id,
      secondEvent.event_id
    ]);
    expect(artifact.analysis_tags).toEqual(expect.arrayContaining(["action", "action:pricing.cta"]));
    expect(artifact.last_seen_at).toBe(secondEvent.occurred_at);
    expect(recordAnalyticsJourneySample).toHaveBeenCalledWith(expect.objectContaining({
      sample_id: sampleId,
      correlation_session_hash: hashAnalyticsSessionSubject(PROJECT_ID, secondEvent.correlation.session_id),
      expires_at: "2026-04-09T13:47:00.000Z"
    }));
    expect(reserveAnalyticsJourneySample).toHaveBeenCalledWith(expect.objectContaining({
      sample_id: sampleId
    }));
  });

  it("claims retained sample allowance only when a sample reservation is new", async (): Promise<void> => {
    const event = createAnalyticsEvent();
    const sampleId = buildAnalyticsJourneySampleId(PROJECT_ID, event);
    const claimAnalyticsUsageForOrganization = vi.fn().mockResolvedValue({ allowed: true });
    const recordAnalyticsJourneySample = vi.fn().mockResolvedValue({});

    await expect(
      maybeCaptureAnalyticsJourneySample({
        project_id: PROJECT_ID,
        event,
        dependencies: {
          analyticsSettingsStore: {
            getAnalyticsSettingsByProjectId: vi.fn().mockResolvedValue({
              enabled: true,
              journey_sample_rate: 1,
              sample_retention_days: 7
            })
          },
          analyticsJourneySampleStore: {
            reserveAnalyticsJourneySample: vi.fn().mockResolvedValue("created"),
            recordAnalyticsJourneySample,
            deleteAnalyticsJourneySampleForProject: vi.fn()
          },
          analyticsUsageStore: {
            claimAnalyticsUsageForOrganization,
            releaseAnalyticsUsageForOrganization: vi.fn()
          },
          billingStore: {
            getBillingSummaryForOrganization: vi.fn().mockResolvedValue(createBillingSummary())
          },
          resolveOrganizationIdForProject: vi.fn().mockResolvedValue(ORGANIZATION_ID),
          objectStore: {
            getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found")),
            putObject: vi.fn().mockResolvedValue(undefined)
          }
        }
      })
    ).resolves.toEqual({ captured: true });

    expect(claimAnalyticsUsageForOrganization).toHaveBeenCalledWith({
      organization_id: ORGANIZATION_ID,
      period_starts_at: "2026-03-01T00:00:00.000Z",
      analytics_events: 0,
      analytics_sessions: 0,
      analytics_journey_samples: 1,
      analytics_bundle_generations: 0,
      limits: {
        monthly_analytics_events: 150_000,
        monthly_analytics_sessions: 30_000,
        monthly_analytics_journey_samples: 3_000,
        monthly_analytics_bundle_generations: 75
      }
    });
    expect(recordAnalyticsJourneySample).toHaveBeenCalledWith(expect.objectContaining({
      sample_id: sampleId
    }));
  });

  it("skips new retained samples when the retained sample allowance is exhausted", async (): Promise<void> => {
    const deleteAnalyticsJourneySampleForProject = vi.fn().mockResolvedValue(undefined);
    const putObject = vi.fn();

    await expect(
      maybeCaptureAnalyticsJourneySample({
        project_id: PROJECT_ID,
        event: createAnalyticsEvent(),
        dependencies: {
          analyticsSettingsStore: {
            getAnalyticsSettingsByProjectId: vi.fn().mockResolvedValue({
              enabled: true,
              journey_sample_rate: 1,
              sample_retention_days: 7
            })
          },
          analyticsJourneySampleStore: {
            reserveAnalyticsJourneySample: vi.fn().mockResolvedValue("created"),
            recordAnalyticsJourneySample: vi.fn(),
            deleteAnalyticsJourneySampleForProject
          },
          analyticsUsageStore: {
            claimAnalyticsUsageForOrganization: vi.fn().mockResolvedValue({
              allowed: false,
              metric: "monthly_analytics_journey_samples",
              used: 3_001,
              limit: 3_000,
              usage: {
                monthly_analytics_events: 0,
                monthly_analytics_sessions: 0,
                monthly_analytics_journey_samples: 3_001,
                monthly_analytics_bundle_generations: 0
              }
            }),
            releaseAnalyticsUsageForOrganization: vi.fn()
          },
          billingStore: {
            getBillingSummaryForOrganization: vi.fn().mockResolvedValue(createBillingSummary())
          },
          resolveOrganizationIdForProject: vi.fn().mockResolvedValue(ORGANIZATION_ID),
          objectStore: {
            getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found")),
            putObject
          }
        }
      })
    ).resolves.toEqual({ captured: false, reason: "journey_sample_quota_exceeded" });

    expect(putObject).not.toHaveBeenCalled();
    expect(deleteAnalyticsJourneySampleForProject).toHaveBeenCalledOnce();
  });

  it("releases a newly claimed retained sample allowance when artifact persistence fails", async (): Promise<void> => {
    const releaseAnalyticsUsageForOrganization = vi.fn().mockResolvedValue(undefined);
    const deleteAnalyticsJourneySampleForProject = vi.fn().mockResolvedValue(undefined);
    const deleteObject = vi.fn().mockResolvedValue(undefined);

    await expect(
      maybeCaptureAnalyticsJourneySample({
        project_id: PROJECT_ID,
        event: createAnalyticsEvent(),
        dependencies: {
          analyticsSettingsStore: {
            getAnalyticsSettingsByProjectId: vi.fn().mockResolvedValue({
              enabled: true,
              journey_sample_rate: 1,
              sample_retention_days: 7
            })
          },
          analyticsJourneySampleStore: {
            reserveAnalyticsJourneySample: vi.fn().mockResolvedValue("created"),
            recordAnalyticsJourneySample: vi.fn(),
            deleteAnalyticsJourneySampleForProject
          },
          analyticsUsageStore: {
            claimAnalyticsUsageForOrganization: vi.fn().mockResolvedValue({ allowed: true }),
            releaseAnalyticsUsageForOrganization
          },
          billingStore: {
            getBillingSummaryForOrganization: vi.fn().mockResolvedValue(createBillingSummary())
          },
          resolveOrganizationIdForProject: vi.fn().mockResolvedValue(ORGANIZATION_ID),
          objectStore: {
            getObject: vi.fn().mockRejectedValue(new Error("s3_object_not_found")),
            putObject: vi.fn().mockRejectedValue(new Error("s3_write_failed")),
            deleteObject
          }
        }
      })
    ).rejects.toThrow("s3_write_failed");

    expect(releaseAnalyticsUsageForOrganization).toHaveBeenCalledWith({
      organization_id: ORGANIZATION_ID,
      period_starts_at: "2026-03-01T00:00:00.000Z",
      analytics_events: 0,
      analytics_sessions: 0,
      analytics_journey_samples: 1,
      analytics_bundle_generations: 0
    });
    expect(deleteAnalyticsJourneySampleForProject).toHaveBeenCalledOnce();
    expect(deleteObject).toHaveBeenCalledOnce();
  });

  it("skips capture when project sample settings disable retained samples", async (): Promise<void> => {
    const putObject = vi.fn();

    await expect(
      maybeCaptureAnalyticsJourneySample({
        project_id: PROJECT_ID,
        event: createAnalyticsEvent(),
        dependencies: {
          analyticsSettingsStore: {
            getAnalyticsSettingsByProjectId: vi.fn().mockResolvedValue({
              enabled: true,
              journey_sample_rate: 0,
              sample_retention_days: 7
            })
          },
          analyticsJourneySampleStore: {
            reserveAnalyticsJourneySample: vi.fn(),
            recordAnalyticsJourneySample: vi.fn(),
            deleteAnalyticsJourneySampleForProject: vi.fn()
          },
          objectStore: { getObject: vi.fn(), putObject }
        }
      })
    ).resolves.toEqual({ captured: false, reason: "journey_sample_rate_zero" });

    expect(putObject).not.toHaveBeenCalled();
  });
});

function createBillingSummary() {
  return {
    plan: "solo",
    billing_state: "active",
    stripe_customer_id: null,
    active_projects: 1,
    capacity_units: {
      total: 3,
      included: 3,
      additional_purchased: 0,
      pending_reduction: null
    },
    usage_window: {
      starts_at: "2026-03-01T00:00:00.000Z",
      ends_at: "2026-04-01T00:00:00.000Z"
    },
    allowances: {
      monthly_bundle_requests: { used: 0, limit: 750 },
      monthly_raw_ingested_events: { used: 0, limit: 10_500 },
      retained_bundle_cap: { used: 0, limit: 450 },
      monthly_remote_activations: { used: 0, limit: 75 },
      monthly_alert_deliveries: { used: 0, limit: 225 },
      monthly_webhook_deliveries: { used: 0, limit: 750 }
    },
    trial: {
      available: false,
      active: false,
      plan: null,
      started_at: null,
      ends_at: null,
      converted_at: null,
      expired_at: null
    }
  };
}
