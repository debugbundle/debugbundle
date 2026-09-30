import {
  createEventEnvelope,
  type AnalyticsEventEnvelope,
  type AnalyticsSettings
} from "../../packages/shared-types/src/index.js";

export function createSettings(overrides: Partial<AnalyticsSettings> = {}): AnalyticsSettings {
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

export function createAnalyticsEvent(input: {
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

export function createDebugEvent() {
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
