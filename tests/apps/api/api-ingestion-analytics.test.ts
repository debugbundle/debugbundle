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
    hourly_retention_days: 30,
    aggregate_retention_months: 12,
    max_saved_funnels: 3,
    max_custom_dimensions: 0,
    approved_custom_dimensions: [],
    ...overrides
  };
}

function createAnalyticsEvent(input: {
  eventId: string;
  kind?: AnalyticsEventEnvelope["payload"]["kind"];
  sessionId?: string;
  customDimensions?: Record<string, string>;
  privacy?: AnalyticsEventEnvelope["payload"]["privacy"];
  projectToken?: string;
  visitorIdHash?: string | null;
  userIdHash?: string | null;
}): AnalyticsEventEnvelope {
  return {
    schema_version: "2026-07-analytics-01",
    event_id: input.eventId,
    event_type: "analytics_event",
    ...(input.projectToken === undefined ? {} : { project_token: input.projectToken }),
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
      session_id: input.sessionId ?? "sess_123",
      visitor_id_hash: input.visitorIdHash ?? null,
      user_id_hash: input.userIdHash ?? null,
      trace_id: null,
      deploy_id: null
    },
    payload: {
      kind: input.kind ?? "page_view",
      privacy: input.privacy ?? { mode: "strict", consent_granted: false },
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

function createDependencies(
  overrides: {
    analyticsSettings?: AnalyticsSettings | null;
    organizationPlan?: "free" | "solo" | "team";
    persistAndEnqueue?: ApiServerDependencies["ingestionPersistence"]["persistAndEnqueue"];
    persistAnalyticsAndEnqueue?: NonNullable<
      ApiServerDependencies["ingestionPersistence"]["persistAnalyticsAndEnqueue"]
    >;
    claimEvents?: NonNullable<ApiServerDependencies["ingestionRateLimiter"]>["claimEvents"];
    billingManagement?: ApiServerDependencies["billingManagement"];
    analyticsUsage?: ApiServerDependencies["analyticsUsage"];
  } = {}
): ReturnType<typeof createApiServer> {
  return createApiServer({
    ingestionPersistence: {
      persistAndEnqueue:
        overrides.persistAndEnqueue ??
        vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" }),
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
    ...(overrides.billingManagement === undefined
      ? {}
      : { billingManagement: overrides.billingManagement }),
    ...(overrides.analyticsUsage === undefined ? {} : { analyticsUsage: overrides.analyticsUsage }),
    analyticsSettingsManagement: {
      getAnalyticsSettingsForProject: vi
        .fn()
        .mockResolvedValue(
          overrides.analyticsSettings === undefined ? createSettings() : overrides.analyticsSettings
        ),
      updateAnalyticsSettingsForProject: vi.fn()
    },
    memberAuth: {
      resolveMemberByTokenHash: vi
        .fn()
        .mockResolvedValue({ member_id: "mem_123", organization_id: "org_123" })
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
      organizationPlan: "free",
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

  it("removes project credentials before persisting debug and analytics events", async () => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const persistAnalyticsAndEnqueue = vi
      .fn()
      .mockResolvedValue({ object_key: "analytics-events/p/k.json.gz" });
    const app = createDependencies({ persistAndEnqueue, persistAnalyticsAndEnqueue });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: {
        events: [
          createDebugEvent(),
          createAnalyticsEvent({
            eventId: "10000000-0000-4000-8000-000000000010",
            projectToken: "dbundle_proj_test"
          })
        ]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(persistAndEnqueue.mock.calls[0]?.[0]).not.toHaveProperty("project_token");
    expect(persistAnalyticsAndEnqueue.mock.calls[0]?.[0]).not.toHaveProperty("project_token");
  });

  it("enforces server consent and capture settings before analytics persistence", async () => {
    const persistAnalyticsAndEnqueue = vi.fn();
    const app = createDependencies({
      persistAnalyticsAndEnqueue,
      analyticsSettings: createSettings({ consent_required: true, capture_page_views: false })
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: {
        events: [
          createAnalyticsEvent({ eventId: "10000000-0000-4000-8000-000000000011" }),
          createAnalyticsEvent({
            eventId: "10000000-0000-4000-8000-000000000012",
            privacy: { mode: "strict", consent_granted: true }
          })
        ]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      accepted: 0,
      rejected: 2,
      errors: [
        { index: 0, reason: "analytics_consent_required" },
        { index: 1, reason: "analytics_capture_disabled" }
      ]
    });
    expect(persistAnalyticsAndEnqueue).not.toHaveBeenCalled();
  });

  it("forces strict server privacy and strips durable analytics identities", async () => {
    const persistAnalyticsAndEnqueue = vi
      .fn()
      .mockResolvedValue({ object_key: "analytics-events/p/k.json.gz" });
    const app = createDependencies({
      persistAnalyticsAndEnqueue,
      analyticsSettings: createSettings({ privacy_mode: "strict" })
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: {
        events: [
          createAnalyticsEvent({
            eventId: "10000000-0000-4000-8000-000000000013",
            privacy: { mode: "custom", consent_granted: true },
            visitorIdHash: `sha256:${"a".repeat(64)}`,
            userIdHash: `sha256:${"b".repeat(64)}`
          })
        ]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(persistAnalyticsAndEnqueue.mock.calls[0]?.[0]).toMatchObject({
      correlation: { visitor_id_hash: null, user_id_hash: null },
      payload: { privacy: { mode: "strict", consent_granted: true } }
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

  it("enforces the current tier when stored custom-dimension settings are stale", async () => {
    const persistAnalyticsAndEnqueue = vi.fn();
    const app = createDependencies({
      organizationPlan: "free",
      persistAnalyticsAndEnqueue,
      analyticsSettings: createSettings({
        max_custom_dimensions: 8,
        approved_custom_dimensions: ["account_tier", "release_channel"]
      })
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: {
        events: [
          createAnalyticsEvent({
            eventId: "10000000-0000-4000-8000-000000000010",
            customDimensions: { account_tier: "team", release_channel: "stable" }
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

  it("rejects analytics-only ingestion when the analytics event allowance is exhausted", async () => {
    const persistAnalyticsAndEnqueue = vi.fn();
    const app = createDependencies({
      organizationPlan: "solo",
      persistAnalyticsAndEnqueue,
      billingManagement: createBillingManagementForAnalyticsQuota(),
      analyticsUsage: {
        getAnalyticsUsageForOrganization: vi.fn(),
        claimAnalyticsUsageForOrganization: vi.fn().mockResolvedValue({
          allowed: false,
          metric: "monthly_analytics_events",
          used: 50_001,
          limit: 50_000,
          usage: {
            monthly_analytics_events: 50_000,
            monthly_analytics_sessions: 0,
            monthly_analytics_journey_samples: 0,
            monthly_analytics_bundle_generations: 0
          }
        }),
        releaseAnalyticsUsageForOrganization: vi.fn()
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: {
        events: [createAnalyticsEvent({ eventId: "10000000-0000-4000-8000-000000000006" })]
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBeDefined();
    expect(response.json()).toMatchObject({
      accepted: 0,
      rejected: 1,
      errors: [{ index: 0, reason: "analytics_quota_exceeded" }]
    });
    expect(persistAnalyticsAndEnqueue).not.toHaveBeenCalled();
  });

  it("accepts Free analytics within the bounded preview allowances", async () => {
    const claimAnalyticsUsageForOrganization = vi.fn().mockResolvedValue({
      allowed: true,
      usage: {
        monthly_analytics_events: 1,
        monthly_analytics_sessions: 1,
        monthly_analytics_journey_samples: 0,
        monthly_analytics_bundle_generations: 0
      }
    });
    const persistAnalyticsAndEnqueue = vi.fn().mockResolvedValue({
      object_key: "analytics-events/p/free.json.gz"
    });
    const app = createDependencies({
      organizationPlan: "free",
      persistAnalyticsAndEnqueue,
      billingManagement: createBillingManagementForAnalyticsQuota(99),
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
        events: [
          createAnalyticsEvent({
            eventId: "10000000-0000-4000-8000-000000000016",
            kind: "session_start",
            sessionId: "sess_free"
          })
        ]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: 1, rejected: 0, errors: [] });
    expect(claimAnalyticsUsageForOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        analytics_events: 1,
        analytics_sessions: 1,
        limits: {
          monthly_analytics_events: 5_000,
          monthly_analytics_sessions: 1_000,
          monthly_analytics_journey_samples: 100,
          monthly_analytics_bundle_generations: 3
        }
      })
    );
    expect(persistAnalyticsAndEnqueue).toHaveBeenCalledOnce();
  });

  it("releases only unpersisted analytics claims after a partial persistence failure", async () => {
    const firstEventId = "10000000-0000-4000-8000-000000000017";
    const secondEventId = "10000000-0000-4000-8000-000000000018";
    const releaseAnalyticsUsageForOrganization = vi.fn().mockResolvedValue(undefined);
    const persistAnalyticsAndEnqueue = vi
      .fn()
      .mockResolvedValueOnce({ object_key: "analytics-events/p/first.json.gz" })
      .mockRejectedValueOnce(new Error("s3_write_failed"));
    const app = createDependencies({
      organizationPlan: "solo",
      persistAnalyticsAndEnqueue,
      billingManagement: createBillingManagementForAnalyticsQuota(),
      analyticsUsage: {
        getAnalyticsUsageForOrganization: vi.fn(),
        claimAnalyticsUsageForOrganization: vi.fn().mockResolvedValue({
          allowed: true,
          usage: {
            monthly_analytics_events: 2,
            monthly_analytics_sessions: 1,
            monthly_analytics_journey_samples: 0,
            monthly_analytics_bundle_generations: 0
          },
          claimed_keys: [`event:${firstEventId}`, "session:sess_partial", `event:${secondEventId}`]
        }),
        releaseAnalyticsUsageForOrganization
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: {
        events: [
          createAnalyticsEvent({
            eventId: firstEventId,
            kind: "session_start",
            sessionId: "sess_partial"
          }),
          createAnalyticsEvent({ eventId: secondEventId, sessionId: "sess_partial" })
        ]
      }
    });

    expect(response.statusCode).toBe(500);
    expect(persistAnalyticsAndEnqueue).toHaveBeenCalledTimes(2);
    expect(releaseAnalyticsUsageForOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        analytics_events: 2,
        analytics_sessions: 1,
        claim_keys: [`event:${secondEventId}`]
      })
    );
  });

  it("keeps debug events accepted when analytics ingestion quota is exhausted in a mixed batch", async () => {
    const persistAndEnqueue = vi.fn().mockResolvedValue({ object_key: "raw-events/p/k.json.gz" });
    const persistAnalyticsAndEnqueue = vi.fn();
    const app = createDependencies({
      organizationPlan: "solo",
      persistAndEnqueue,
      persistAnalyticsAndEnqueue,
      billingManagement: createBillingManagementForAnalyticsQuota(),
      analyticsUsage: {
        getAnalyticsUsageForOrganization: vi.fn(),
        claimAnalyticsUsageForOrganization: vi.fn().mockResolvedValue({
          allowed: false,
          metric: "monthly_analytics_events",
          used: 50_001,
          limit: 50_000,
          usage: {
            monthly_analytics_events: 50_000,
            monthly_analytics_sessions: 0,
            monthly_analytics_journey_samples: 0,
            monthly_analytics_bundle_generations: 0
          }
        }),
        releaseAnalyticsUsageForOrganization: vi.fn()
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: {
        events: [
          createDebugEvent(),
          createAnalyticsEvent({ eventId: "10000000-0000-4000-8000-000000000007" })
        ]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      accepted: 1,
      rejected: 1,
      errors: [{ index: 1, reason: "analytics_quota_exceeded" }]
    });
    expect(persistAndEnqueue).toHaveBeenCalledOnce();
    expect(persistAnalyticsAndEnqueue).not.toHaveBeenCalled();
  });

  it("rejects new analytics sessions when the analytics session allowance is exhausted", async () => {
    const persistAnalyticsAndEnqueue = vi.fn();
    const app = createDependencies({
      organizationPlan: "solo",
      persistAnalyticsAndEnqueue,
      billingManagement: createBillingManagementForAnalyticsQuota(),
      analyticsUsage: {
        getAnalyticsUsageForOrganization: vi.fn(),
        claimAnalyticsUsageForOrganization: vi.fn().mockResolvedValue({
          allowed: false,
          metric: "monthly_analytics_sessions",
          used: 10_001,
          limit: 10_000,
          usage: {
            monthly_analytics_events: 0,
            monthly_analytics_sessions: 10_000,
            monthly_analytics_journey_samples: 0,
            monthly_analytics_bundle_generations: 0
          }
        }),
        releaseAnalyticsUsageForOrganization: vi.fn()
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { authorization: "Bearer dbundle_proj_test" },
      payload: {
        events: [
          createAnalyticsEvent({
            eventId: "10000000-0000-4000-8000-000000000008",
            kind: "session_start",
            sessionId: "sess_new"
          })
        ]
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      accepted: 0,
      rejected: 1,
      errors: [{ index: 0, reason: "analytics_quota_exceeded" }]
    });
    expect(persistAnalyticsAndEnqueue).not.toHaveBeenCalled();
  });
});

function createBillingManagementForAnalyticsQuota(
  capacityUnits = 1
): NonNullable<ApiServerDependencies["billingManagement"]> {
  return {
    getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
      plan: "solo",
      billing_state: "active",
      stripe_customer_id: null,
      active_projects: 1,
      capacity_units: {
        total: capacityUnits,
        included: 1,
        additional_purchased: capacityUnits - 1,
        pending_reduction: null
      },
      usage_window: {
        starts_at: "2026-03-01T00:00:00.000Z",
        ends_at: "2026-04-01T00:00:00.000Z"
      },
      allowances: {
        monthly_bundle_requests: { used: 0, limit: 25 },
        monthly_raw_ingested_events: { used: 0, limit: 10_000 },
        retained_bundle_cap: { used: 0, limit: 5 },
        monthly_remote_activations: { used: 0, limit: 5 },
        monthly_alert_deliveries: { used: 0, limit: 100 },
        monthly_webhook_deliveries: { used: 0, limit: 100 }
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
    }),
    incrementOrgUsageCounter: vi.fn(),
    incrementProjectUsageCounter: vi.fn(),
    createCheckoutLink: vi.fn().mockResolvedValue(null),
    createPortalLink: vi.fn().mockResolvedValue(null)
  };
}
