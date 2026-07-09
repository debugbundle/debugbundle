import { gunzipSync, gzipSync } from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import {
  buildAnalyticsJourneySampleId,
  maybeCaptureAnalyticsJourneySample
} from "../../../apps/worker/src/analytics-journey-samples.js";
import type { AnalyticsEventEnvelope } from "../../../packages/shared-types/src/index.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

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
          analyticsJourneySampleStore: { recordAnalyticsJourneySample },
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
      expires_at: "2026-04-09T13:47:00.000Z"
    }));
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
          analyticsJourneySampleStore: { recordAnalyticsJourneySample: vi.fn() },
          objectStore: { getObject: vi.fn(), putObject }
        }
      })
    ).resolves.toEqual({ captured: false, reason: "journey_sample_rate_zero" });

    expect(putObject).not.toHaveBeenCalled();
  });
});
