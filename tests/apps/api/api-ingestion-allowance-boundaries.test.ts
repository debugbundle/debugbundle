import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import {
  createEventEnvelope,
  type AnalyticsEventEnvelope,
  type AnalyticsSettings
} from "../../../packages/shared-types/src/index.js";
import {
  createIncidentRetrievalDependency,
  createMemberAuthDependency,
  createObjectStoreReaderDependency,
  createTokenManagementDependency,
  createWebhookDeliveryDependency
} from "../../helpers/api-ingestion-dependencies.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];

const PROJECT_ID = "00000000-0000-4000-8000-000000000123";

function createBillingSummary(input: { used: number; limit: number }) {
  return {
    plan: "team" as const,
    billing_state: "active" as const,
    stripe_customer_id: null,
    active_projects: 1,
    capacity_units: {
      total: 17,
      included: 15,
      additional_purchased: 2,
      pending_reduction: null
    },
    usage_window: {
      starts_at: "2026-07-01T00:00:00.000Z",
      ends_at: "2026-08-01T00:00:00.000Z"
    },
    allowances: {
      monthly_bundle_requests: { used: 0, limit: 17_000 },
      monthly_raw_ingested_events: input,
      retained_bundle_cap: { used: 0, limit: 8_500 },
      monthly_remote_activations: { used: 0, limit: 1_700 },
      monthly_alert_deliveries: { used: 0, limit: 3_400 },
      monthly_webhook_deliveries: { used: 0, limit: 17_000 }
    },
    trial: {
      available: false,
      active: false,
      plan: null,
      started_at: null,
      ends_at: null,
      used_at: null,
      converted_at: null,
      expired_at: null,
      days_remaining: null
    }
  };
}

function createAnalyticsSettings(): AnalyticsSettings {
  return {
    enabled: true,
    privacy_mode: "strict",
    consent_required: false,
    capture_page_views: true,
    capture_route_changes: true,
    capture_actions: false,
    capture_friction_signals: true,
    journey_sample_rate: 0,
    raw_retention_days: 1,
    sample_retention_days: 7,
    hourly_retention_days: 30,
    aggregate_retention_months: 12,
    max_saved_funnels: 10,
    max_custom_dimensions: 10,
    approved_custom_dimensions: []
  };
}

function createServer(input: {
  organizationPlan?: "free" | "solo" | "team";
  persistAndEnqueue?: ApiServerDependencies["ingestionPersistence"]["persistAndEnqueue"];
  persistAnalyticsAndEnqueue?: NonNullable<
    ApiServerDependencies["ingestionPersistence"]["persistAnalyticsAndEnqueue"]
  >;
  billingSummary?: ReturnType<typeof createBillingSummary>;
  incrementOrgUsageCounter?: NonNullable<
    ApiServerDependencies["billingManagement"]
  >["incrementOrgUsageCounter"];
  incrementProjectUsageCounter?: NonNullable<
    ApiServerDependencies["billingManagement"]
  >["incrementProjectUsageCounter"];
  queueProjectOperationalEmailDelivery?: NonNullable<
    ApiServerDependencies["operationalEmailDelivery"]
  >["queueProjectOperationalEmailDelivery"];
  analyticsUsage?: ApiServerDependencies["analyticsUsage"];
}) {
  const billingSummary = input.billingSummary ?? createBillingSummary({ used: 0, limit: 170_000 });

  return createApiServer({
    ingestionPersistence: {
      persistAndEnqueue:
        input.persistAndEnqueue ??
        vi.fn().mockResolvedValue({ object_key: "raw-events/project/event.json.gz" }),
      ...(input.persistAnalyticsAndEnqueue === undefined
        ? {}
        : { persistAnalyticsAndEnqueue: input.persistAnalyticsAndEnqueue })
    },
    ingestionMetadata: {
      resolveProjectByTokenHash: vi.fn().mockResolvedValue({
        project_id: PROJECT_ID,
        organization_id: "org_123",
        organization_plan: input.organizationPlan ?? "team"
      })
    },
    billingManagement: {
      getBillingSummaryForOrganization: vi.fn().mockResolvedValue(billingSummary),
      incrementOrgUsageCounter: input.incrementOrgUsageCounter ?? vi.fn(),
      incrementProjectUsageCounter: input.incrementProjectUsageCounter ?? vi.fn(),
      createCheckoutLink: vi.fn().mockResolvedValue(null),
      createPortalLink: vi.fn().mockResolvedValue(null)
    },
    analyticsSettingsManagement: {
      getAnalyticsSettingsForProject: vi.fn().mockResolvedValue(createAnalyticsSettings()),
      updateAnalyticsSettingsForProject: vi.fn()
    },
    ...(input.analyticsUsage === undefined ? {} : { analyticsUsage: input.analyticsUsage }),
    ...(input.queueProjectOperationalEmailDelivery === undefined
      ? {}
      : {
          operationalEmailDelivery: {
            queueProjectOperationalEmailDelivery: input.queueProjectOperationalEmailDelivery
          }
        }),
    memberAuth: createMemberAuthDependency(),
    tokenManagement: createTokenManagementDependency(),
    incidentRetrieval: createIncidentRetrievalDependency(),
    objectStoreReader: createObjectStoreReaderDependency(),
    webhookDelivery: createWebhookDeliveryDependency()
  });
}

function createDebugEvent(eventId: string) {
  return createEventEnvelope({
    event_id: eventId,
    event_type: "backend_exception",
    project_token: "dbundle_proj_test",
    service: {
      name: "checkout-api",
      environment: "production",
      runtime: "node",
      framework: "fastify"
    },
    payload: {
      name: "TypeError",
      message: "boom",
      stack: "TypeError: boom",
      handled: false,
      request: {
        method: "GET",
        path: "/checkout",
        query: {},
        headers: {},
        body: null
      },
      response: { status_code: 500 },
      runtime: { version: "22.0.0" }
    }
  });
}

function createAnalyticsEvent(eventId: string): AnalyticsEventEnvelope {
  return {
    schema_version: "2026-07-analytics-01",
    event_id: eventId,
    event_type: "analytics_event",
    occurred_at: "2026-07-20T12:00:00.000Z",
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
      visitor_id_hash: null,
      user_id_hash: null,
      trace_id: null,
      deploy_id: null
    },
    payload: {
      kind: "page_view",
      privacy: { mode: "strict", consent_granted: false },
      route: { path: "/pricing", normalized_path: "/pricing", title: "Pricing" },
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
        referrer_domain: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        country_code: null,
        region_code: null
      },
      custom_dimensions: {}
    }
  };
}

function createDeployMetadataEvent(eventId: string) {
  return createEventEnvelope({
    event_id: eventId,
    event_type: "deploy_metadata",
    project_token: "dbundle_proj_test",
    service: {
      name: "checkout-api",
      environment: "production",
      runtime: "node",
      framework: "fastify"
    },
    payload: {
      commit_sha: "abc123",
      version: "1.2.3",
      branch: "main",
      environment: "production",
      deployed_at: "2026-07-20T12:00:00.000Z"
    }
  });
}

describe("ingestion monthly allowance boundaries", () => {
  it("uses the final raw-ingestion unit before rejecting only the batch surplus", async (): Promise<void> => {
    const persistAndEnqueue = vi
      .fn()
      .mockResolvedValue({ object_key: "raw-events/project/event.json.gz" });
    const incrementOrgUsageCounter = vi.fn();
    const incrementProjectUsageCounter = vi.fn();
    const queueProjectOperationalEmailDelivery = vi.fn().mockResolvedValue({
      delivery_id: "op_123",
      created: true
    });
    const app = createServer({
      persistAndEnqueue,
      billingSummary: createBillingSummary({ used: 169_999, limit: 170_000 }),
      incrementOrgUsageCounter,
      incrementProjectUsageCounter,
      queueProjectOperationalEmailDelivery
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: {
        events: [
          createDebugEvent("10000000-0000-4000-8000-000000000001"),
          createDebugEvent("10000000-0000-4000-8000-000000000002"),
          createDebugEvent("10000000-0000-4000-8000-000000000003")
        ]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      accepted: 1,
      rejected: 2,
      errors: [
        { index: 1, reason: "monthly_quota_exceeded" },
        { index: 2, reason: "monthly_quota_exceeded" }
      ]
    });
    expect(persistAndEnqueue).toHaveBeenCalledOnce();
    expect(persistAndEnqueue.mock.calls[0]?.[0]).toMatchObject({
      event_id: "10000000-0000-4000-8000-000000000001"
    });
    expect(incrementOrgUsageCounter).toHaveBeenCalledWith({
      organization_id: "org_123",
      period_starts_at: "2026-07-01T00:00:00.000Z",
      count: 1
    });
    expect(incrementProjectUsageCounter).toHaveBeenCalledWith({
      project_id: PROJECT_ID,
      period_starts_at: "2026-07-01T00:00:00.000Z",
      count: 1
    });
    expect(queueProjectOperationalEmailDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "allowance_limit_reached",
        payload: expect.objectContaining({
          meter: "monthly_raw_ingested_events",
          used: 170_000,
          limit: 170_000
        })
      })
    );
  });

  it("uses the final analytics-event unit before rejecting only the batch surplus", async (): Promise<void> => {
    const firstEventId = "10000000-0000-4000-8000-000000000011";
    const secondEventId = "10000000-0000-4000-8000-000000000012";
    const persistAnalyticsAndEnqueue = vi
      .fn()
      .mockResolvedValue({ object_key: "analytics-events/project/event.json.gz" });
    const claimAnalyticsUsageForOrganization = vi
      .fn()
      .mockResolvedValueOnce({
        allowed: false,
        metric: "monthly_analytics_events",
        used: 4_250_001,
        limit: 4_250_000,
        usage: {
          monthly_analytics_events: 4_249_999,
          monthly_analytics_sessions: 0,
          monthly_analytics_journey_samples: 0,
          monthly_analytics_bundle_generations: 0
        }
      })
      .mockResolvedValueOnce({
        allowed: true,
        usage: {
          monthly_analytics_events: 4_250_000,
          monthly_analytics_sessions: 0,
          monthly_analytics_journey_samples: 0,
          monthly_analytics_bundle_generations: 0
        },
        claimed_keys: [`event:${firstEventId}`]
      })
      .mockResolvedValueOnce({
        allowed: false,
        metric: "monthly_analytics_events",
        used: 4_250_001,
        limit: 4_250_000,
        usage: {
          monthly_analytics_events: 4_250_000,
          monthly_analytics_sessions: 0,
          monthly_analytics_journey_samples: 0,
          monthly_analytics_bundle_generations: 0
        }
      });
    const app = createServer({
      persistAnalyticsAndEnqueue,
      analyticsUsage: {
        getAnalyticsUsageForOrganization: vi.fn(),
        claimAnalyticsUsageForOrganization,
        releaseAnalyticsUsageForOrganization: vi.fn()
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: {
        events: [createAnalyticsEvent(firstEventId), createAnalyticsEvent(secondEventId)]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      accepted: 1,
      rejected: 1,
      errors: [{ index: 1, reason: "analytics_quota_exceeded" }]
    });
    expect(persistAnalyticsAndEnqueue).toHaveBeenCalledOnce();
    expect(persistAnalyticsAndEnqueue.mock.calls[0]?.[0]).toMatchObject({
      event_id: firstEventId
    });
    expect(claimAnalyticsUsageForOrganization).toHaveBeenCalledTimes(3);
  });

  it("does not reject unmetered Free-tier events when the metered allowance is exhausted", async (): Promise<void> => {
    const persistAndEnqueue = vi
      .fn()
      .mockResolvedValue({ object_key: "raw-events/project/event.json.gz" });
    const incrementOrgUsageCounter = vi.fn();
    const incrementProjectUsageCounter = vi.fn();
    const app = createServer({
      organizationPlan: "free",
      persistAndEnqueue,
      billingSummary: createBillingSummary({ used: 750, limit: 750 }),
      incrementOrgUsageCounter,
      incrementProjectUsageCounter
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: {
        events: [
          createDebugEvent("10000000-0000-4000-8000-000000000021"),
          createDeployMetadataEvent("10000000-0000-4000-8000-000000000022")
        ]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      accepted: 1,
      rejected: 1,
      errors: [{ index: 0, reason: "monthly_quota_exceeded" }]
    });
    expect(persistAndEnqueue).toHaveBeenCalledOnce();
    expect(persistAndEnqueue.mock.calls[0]?.[0]).toMatchObject({
      event_id: "10000000-0000-4000-8000-000000000022"
    });
    expect(incrementOrgUsageCounter).not.toHaveBeenCalled();
    expect(incrementProjectUsageCounter).not.toHaveBeenCalled();
  });
});
