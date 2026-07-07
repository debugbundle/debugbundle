import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import {
  createEventEnvelope,
  type AnalyticsEventEnvelope,
  type AnalyticsSettings
} from "../../../packages/shared-types/src/index.js";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];

const PROJECT_ID = "00000000-0000-4000-8000-000000000123";

function createSettings(overrides: Partial<AnalyticsSettings> = {}): AnalyticsSettings {
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
    aggregate_retention_months: 12,
    max_saved_funnels: 3,
    max_custom_dimensions: 0,
    approved_custom_dimensions: [],
    ...overrides
  };
}

function createAnalyticsEvent(input: {
  eventId: string;
  customDimensions?: Record<string, string>;
}): AnalyticsEventEnvelope {
  return {
    schema_version: "2026-07-analytics-01",
    event_id: input.eventId,
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
      visitor_id_hash: null,
      user_id_hash: null,
      trace_id: null,
      deploy_id: null
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
        referrer_domain: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        country_code: null,
        region_code: null
      },
      custom_dimensions: input.customDimensions ?? {}
    }
  };
}

function createDebugEvent() {
  return createEventEnvelope({
    event_type: "log_event",
    project_token: "dbundle_proj_test",
    service: {
      name: "api",
      environment: "production",
      runtime: "node",
      framework: "fastify"
    },
    payload: {
      level: "error",
      message: "checkout failed",
      attributes: {}
    }
  });
}

function createDependencies(overrides: {
  analyticsSettings?: AnalyticsSettings | null;
  organizationPlan?: "free" | "solo" | "team";
  persistAndEnqueue?: ApiServerDependencies["ingestionPersistence"]["persistAndEnqueue"];
  persistAnalyticsAndEnqueue?: NonNullable<ApiServerDependencies["ingestionPersistence"]["persistAnalyticsAndEnqueue"]>;
  claimEvents?: NonNullable<ApiServerDependencies["ingestionRateLimiter"]>["claimEvents"];
  billingManagement?: ApiServerDependencies["billingManagement"];
} = {}): ReturnType<typeof createApiServer> {
  return createApiServer({
    ingestionPersistence: {
      persistAndEnqueue: overrides.persistAndEnqueue ?? vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" }),
      ...(overrides.persistAnalyticsAndEnqueue === undefined
        ? {}
        : { persistAnalyticsAndEnqueue: overrides.persistAnalyticsAndEnqueue })
    },
    ingestionMetadata: {
      resolveProjectByTokenHash: vi.fn().mockResolvedValue({
        project_id: PROJECT_ID,
        organization_id: "org_123",
        organization_plan: overrides.organizationPlan ?? "team"
      })
    },
    ingestionRateLimiter:
      overrides.claimEvents === undefined
        ? undefined
        : {
            claimEvents: overrides.claimEvents
          },
    ...(overrides.billingManagement === undefined ? {} : { billingManagement: overrides.billingManagement }),
    analyticsSettingsManagement: {
      getAnalyticsSettingsForProject: vi.fn().mockResolvedValue(
        overrides.analyticsSettings === undefined ? createSettings() : overrides.analyticsSettings
      ),
      updateAnalyticsSettingsForProject: vi.fn()
    },
    memberAuth: {
      resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
    },
    tokenManagement: {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    },
    incidentRetrieval: {
      listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
      getIncidentForOrganization: vi.fn().mockResolvedValue(null),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: { getObject: vi.fn() },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] })
    }
  });
}

describe("api analytics ingestion split", () => {
  it("accepts enabled analytics events into the analytics lane only", async () => {
    const persistAndEnqueue = vi.fn();
    const persistAnalyticsAndEnqueue = vi.fn().mockResolvedValue({
      object_key: "analytics-events/p/k.json.gz"
    });
    const app = createDependencies({
      persistAndEnqueue,
      persistAnalyticsAndEnqueue,
      analyticsSettings: createSettings({
        max_custom_dimensions: 1,
        approved_custom_dimensions: ["account_tier"]
      })
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: {
        events: [
          createAnalyticsEvent({
            eventId: "10000000-0000-4000-8000-000000000001",
            customDimensions: { account_tier: "team" }
          })
        ]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: 1, rejected: 0, errors: [] });
    expect(persistAndEnqueue).not.toHaveBeenCalled();
    expect(persistAnalyticsAndEnqueue).toHaveBeenCalledOnce();
    expect(persistAnalyticsAndEnqueue.mock.calls[0]?.[0]).toMatchObject({
      event_type: "analytics_event",
      project_id: PROJECT_ID
    });
  });

  it("splits mixed debug and analytics batches without applying debug processing to analytics", async () => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const persistAnalyticsAndEnqueue = vi.fn().mockResolvedValue({
      object_key: "analytics-events/p/k.json.gz"
    });
    const claimEvents = vi.fn().mockResolvedValue({
      allowed: true,
      limit: 10_000,
      remaining: 9_998,
      retry_after_ms: 0
    });
    const app = createDependencies({
      persistAndEnqueue,
      persistAnalyticsAndEnqueue,
      claimEvents
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: {
        events: [
          createDebugEvent(),
          createAnalyticsEvent({ eventId: "10000000-0000-4000-8000-000000000002" })
        ]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ accepted: 2, rejected: 0, errors: [] });
    expect(claimEvents).toHaveBeenCalledWith(expect.objectContaining({ event_count: 2 }));
    expect(persistAndEnqueue).toHaveBeenCalledOnce();
    expect(persistAnalyticsAndEnqueue).toHaveBeenCalledOnce();
  });

  it("rejects disabled analytics events while accepting valid debug events in the same batch", async () => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const persistAnalyticsAndEnqueue = vi.fn();
    const app = createDependencies({
      persistAndEnqueue,
      persistAnalyticsAndEnqueue,
      analyticsSettings: createSettings({ enabled: false })
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: {
        events: [
          createDebugEvent(),
          createAnalyticsEvent({ eventId: "10000000-0000-4000-8000-000000000003" })
        ]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      accepted: 1,
      rejected: 1,
      errors: [{ index: 1, reason: "analytics_disabled" }]
    });
    expect(persistAndEnqueue).toHaveBeenCalledOnce();
    expect(persistAnalyticsAndEnqueue).not.toHaveBeenCalled();
  });

  it("rejects analytics events with unapproved custom dimensions", async () => {
    const persistAnalyticsAndEnqueue = vi.fn();
    const app = createDependencies({
      persistAnalyticsAndEnqueue,
      analyticsSettings: createSettings({
        max_custom_dimensions: 1,
        approved_custom_dimensions: ["account_tier"]
      })
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: {
        events: [
          createAnalyticsEvent({
            eventId: "10000000-0000-4000-8000-000000000004",
            customDimensions: { plan: "team" }
          })
        ]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      accepted: 0,
      rejected: 1,
      errors: [{ index: 0, reason: "analytics_invalid_dimension" }]
    });
    expect(persistAnalyticsAndEnqueue).not.toHaveBeenCalled();
  });

  it("keeps analytics accepted when debug monthly ingestion allowance is exhausted", async () => {
    const persistAndEnqueue = vi.fn();
    const persistAnalyticsAndEnqueue = vi.fn().mockResolvedValue({
      object_key: "analytics-events/p/k.json.gz"
    });
    const app = createDependencies({
      persistAndEnqueue,
      persistAnalyticsAndEnqueue,
      billingManagement: {
        getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
          usage_window: {
            starts_at: "2026-03-01T00:00:00.000Z",
            ends_at: "2026-04-01T00:00:00.000Z"
          },
          allowances: {
            monthly_bundle_requests: { used: 0, limit: 25 },
            monthly_raw_ingested_events: { used: 1, limit: 1 },
            retained_bundle_cap: { used: 0, limit: 5 },
            monthly_remote_activations: { used: 0, limit: 5 },
            monthly_alert_deliveries: { used: 0, limit: 100 },
            monthly_webhook_deliveries: { used: 0, limit: 100 }
          }
        }),
        incrementOrgUsageCounter: vi.fn(),
        incrementProjectUsageCounter: vi.fn(),
        createCheckoutLink: vi.fn().mockResolvedValue(null),
        createPortalLink: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: {
        events: [
          createDebugEvent(),
          createAnalyticsEvent({ eventId: "10000000-0000-4000-8000-000000000005" })
        ]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      accepted: 1,
      rejected: 1,
      errors: [{ index: 0, reason: "monthly_quota_exceeded" }]
    });
    expect(persistAndEnqueue).not.toHaveBeenCalled();
    expect(persistAnalyticsAndEnqueue).toHaveBeenCalledOnce();
  });
});
