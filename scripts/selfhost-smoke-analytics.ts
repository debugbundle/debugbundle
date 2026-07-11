import { randomUUID } from "node:crypto";

import {
  AnalyticsEventEnvelopeSchema,
  type AnalyticsDimensions,
  type AnalyticsEventEnvelope
} from "../packages/shared-types/src/index.js";

type AnalyticsSmokeInput = {
  apiBaseUrl: string;
  memberToken: string;
  projectToken: string;
  projectId: string;
  serviceName: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  wait?: (milliseconds: number) => Promise<void>;
};

export type AnalyticsSmokeResult = {
  acceptedEvents: number;
  sessions: number;
  pageviews: number;
  conversions: number;
  journeySampleId: string;
  bundleGenerationId: string;
  bundleSchemaVersion: "analytics_bundle.v1";
};

const SESSION_FIXTURES: Array<{
  sessionId: string;
  converted: boolean;
  dimensions: AnalyticsDimensions;
}> = [
  {
    sessionId: "selfhost-browser-desktop-chrome",
    converted: true,
    dimensions: createDimensions({
      auth_state: "authenticated",
      device_type: "desktop",
      browser_family: "Chrome",
      browser_major: 126,
      os_family: "macOS",
      os_major: 15,
      language: "en-US",
      locale: "en-US",
      viewport_bucket: "large",
      referrer_domain: "search.example",
      utm_source: "search",
      utm_medium: "organic"
    })
  },
  {
    sessionId: "selfhost-browser-mobile-safari",
    converted: false,
    dimensions: createDimensions({
      auth_state: "anonymous",
      device_type: "mobile",
      browser_family: "Safari",
      browser_major: 18,
      os_family: "iOS",
      os_major: 18,
      language: "de-DE",
      locale: "de-DE",
      viewport_bucket: "small",
      referrer_domain: "social.example",
      utm_source: "social",
      utm_medium: "referral"
    })
  },
  {
    sessionId: "selfhost-browser-desktop-firefox",
    converted: true,
    dimensions: createDimensions({
      auth_state: "authenticated",
      device_type: "desktop",
      browser_family: "Firefox",
      browser_major: 128,
      os_family: "Windows",
      os_major: 11,
      language: "fr-FR",
      locale: "fr-FR",
      viewport_bucket: "large",
      referrer_domain: null,
      utm_source: null,
      utm_medium: null
    })
  }
];

function createDimensions(overrides: Partial<AnalyticsDimensions>): AnalyticsDimensions {
  return {
    auth_state: "unknown",
    device_type: "unknown",
    browser_family: null,
    browser_major: null,
    os_family: null,
    os_major: null,
    language: null,
    locale: null,
    viewport_bucket: "unknown",
    referrer_domain: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: "selfhost-acceptance",
    country_code: null,
    region_code: null,
    ...overrides
  };
}

function route(path: string, title: string): NonNullable<AnalyticsEventEnvelope["payload"]["route"]> {
  return { path, normalized_path: path, title };
}

function signal(overrides: Partial<NonNullable<AnalyticsEventEnvelope["payload"]["signal"]>>): NonNullable<AnalyticsEventEnvelope["payload"]["signal"]> {
  return {
    action_key: null,
    funnel_key: null,
    step_key: null,
    conversion_key: null,
    marker_key: null,
    ...overrides
  };
}

function buildBrowserTraffic(serviceName: string, occurredAt: Date): AnalyticsEventEnvelope[] {
  return SESSION_FIXTURES.flatMap((fixture, sessionIndex) => {
    const at = (offset: number): string => new Date(occurredAt.getTime() + (sessionIndex * 20 + offset) * 1_000).toISOString();
    const base = (kind: AnalyticsEventEnvelope["payload"]["kind"], offset: number): AnalyticsEventEnvelope => ({
      schema_version: "2026-07-analytics-01",
      event_id: randomUUID(),
      event_type: "analytics_event",
      occurred_at: at(offset),
      sdk_name: "@debugbundle/sdk-browser",
      sdk_version: "1.4.0-local-acceptance",
      service: {
        name: serviceName,
        runtime: "browser",
        framework: "react",
        environment: "production"
      },
      correlation: {
        session_id: fixture.sessionId,
        visitor_id_hash: null,
        user_id_hash: null,
        trace_id: null,
        deploy_id: "selfhost-acceptance"
      },
      payload: {
        kind,
        route: route("/pricing", "Pricing"),
        dimensions: fixture.dimensions,
        custom_dimensions: {}
      }
    });

    const sessionStart = base("session_start", 0);
    const pricingView = base("page_view", 1);
    const signupAction = base("action", 2);
    signupAction.payload.signal = signal({ action_key: "signup_click" });
    const signupRoute = base("route_change", 3);
    signupRoute.payload.route = route("/signup", "Sign up");
    signupRoute.payload.previous_route = route("/pricing", "Pricing");
    const signupView = base("page_view", 4);
    signupView.payload.route = route("/signup", "Sign up");
    const funnelStart = base("funnel_step", 5);
    funnelStart.payload.route = route("/signup", "Sign up");
    funnelStart.payload.signal = signal({ funnel_key: "checkout", step_key: "signup_started" });
    const checkoutRoute = base("route_change", 6);
    checkoutRoute.payload.route = route("/checkout", "Checkout");
    checkoutRoute.payload.previous_route = route("/signup", "Sign up");
    const outcome = base(fixture.converted ? "conversion" : "journey_marker", 7);
    outcome.payload.route = route("/checkout", "Checkout");
    outcome.payload.signal = fixture.converted
      ? signal({ conversion_key: "subscription_started" })
      : signal({ marker_key: "checkout.abandoned" });
    const sessionSummary = base("session_summary", 8);
    sessionSummary.payload.route = route("/checkout", "Checkout");

    return [
      sessionStart,
      pricingView,
      signupAction,
      signupRoute,
      signupView,
      funnelStart,
      checkoutRoute,
      outcome,
      sessionSummary
    ].map((event) => AnalyticsEventEnvelopeSchema.parse(event));
  });
}

function authHeaders(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

async function parseResponse<T>(response: Response, label: string): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}.`);
  }
  return body as T;
}

async function pollUntil<T>(input: {
  timeoutMs: number;
  pollIntervalMs: number;
  wait: (milliseconds: number) => Promise<void>;
  execute: () => Promise<T | null>;
  timeoutMessage: string;
}): Promise<T> {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() <= deadline) {
    const result = await input.execute();
    if (result !== null) {
      return result;
    }
    await input.wait(input.pollIntervalMs);
  }
  throw new Error(input.timeoutMessage);
}

export async function runSelfhostAnalyticsSmoke(input: AnalyticsSmokeInput): Promise<AnalyticsSmokeResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const wait = input.wait ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const pollIntervalMs = input.pollIntervalMs ?? 1_000;
  const timeoutMs = input.timeoutMs ?? 120_000;
  const apiBaseUrl = input.apiBaseUrl.endsWith("/") ? input.apiBaseUrl.slice(0, -1) : input.apiBaseUrl;

  const settingsResponse = await fetchImpl(`${apiBaseUrl}/v1/projects/${input.projectId}/analytics-settings`, {
    method: "PATCH",
    headers: {
      ...authHeaders(input.memberToken),
      "content-type": "application/json"
    },
    body: JSON.stringify({
      enabled: true,
      privacy_mode: "strict",
      consent_required: false,
      capture_page_views: true,
      capture_route_changes: true,
      capture_actions: true,
      capture_friction_signals: true,
      journey_sample_rate: 1
    })
  });
  const settings = await parseResponse<{ analytics_available?: boolean; settings?: { enabled?: boolean } }>(
    settingsResponse,
    "Self-host analytics settings"
  );
  if (settings.analytics_available !== true || settings.settings?.enabled !== true) {
    throw new Error("Self-host analytics settings did not enable analytics.");
  }

  const events = buildBrowserTraffic(input.serviceName, new Date(Date.now() - 60_000));
  const ingestionResponse = await fetchImpl(`${apiBaseUrl}/v1/events`, {
    method: "POST",
    headers: {
      ...authHeaders(input.projectToken),
      "content-type": "application/json"
    },
    body: JSON.stringify({ events })
  });
  const ingestion = await parseResponse<{ accepted?: number; rejected?: number }>(
    ingestionResponse,
    "Self-host browser analytics ingestion"
  );
  if (ingestion.accepted !== events.length || ingestion.rejected !== 0) {
    throw new Error(`Self-host browser analytics ingestion accepted ${ingestion.accepted ?? 0} of ${events.length} events.`);
  }

  const summary = await pollUntil({
    timeoutMs,
    pollIntervalMs,
    wait,
    timeoutMessage: "Self-host analytics rollups did not include the browser sessions before timeout.",
    execute: async () => {
      const url = new URL(`${apiBaseUrl}/v1/analytics/summary`);
      url.searchParams.set("project_id", input.projectId);
      url.searchParams.set("last", "1d");
      url.searchParams.set("service", input.serviceName);
      url.searchParams.set("environment", "production");
      const response = await fetchImpl(url.toString(), { method: "GET", headers: authHeaders(input.memberToken) });
      const payload = await parseResponse<{
        summary?: { sessions?: number; pageviews?: number; conversions?: number };
        breakdowns?: { device_types?: Array<{ value?: string }>; browsers?: Array<{ value?: string }> };
      }>(response, "Self-host analytics summary");
      if ((payload.summary?.sessions ?? 0) < 3 || (payload.summary?.pageviews ?? 0) < 6 || (payload.summary?.conversions ?? 0) < 2) {
        return null;
      }
      const deviceTypes = new Set(payload.breakdowns?.device_types?.map((item) => item.value));
      const browsers = new Set(payload.breakdowns?.browsers?.map((item) => item.value));
      if (!deviceTypes.has("desktop") || !deviceTypes.has("mobile") || !browsers.has("Chrome")) {
        return null;
      }
      return payload.summary as { sessions: number; pageviews: number; conversions: number };
    }
  });

  const funnelUrl = new URL(`${apiBaseUrl}/v1/analytics/funnels`);
  funnelUrl.searchParams.set("project_id", input.projectId);
  funnelUrl.searchParams.set("last", "1d");
  funnelUrl.searchParams.set("service", input.serviceName);
  funnelUrl.searchParams.set("environment", "production");
  const funnels = await parseResponse<{ funnels?: Array<{ funnel_key?: string }> }>(
    await fetchImpl(funnelUrl.toString(), { method: "GET", headers: authHeaders(input.memberToken) }),
    "Self-host analytics funnels"
  );
  if (!funnels.funnels?.some((funnel) => funnel.funnel_key === "checkout")) {
    throw new Error("Self-host analytics funnels did not include checkout traffic.");
  }

  const journeySampleId = await pollUntil({
    timeoutMs,
    pollIntervalMs,
    wait,
    timeoutMessage: "Self-host analytics journey sampling did not retain a browser journey before timeout.",
    execute: async () => {
      const url = new URL(`${apiBaseUrl}/v1/analytics/journey-samples`);
      url.searchParams.set("project_id", input.projectId);
      url.searchParams.set("service", input.serviceName);
      url.searchParams.set("environment", "production");
      url.searchParams.set("limit", "20");
      const payload = await parseResponse<{ samples?: Array<{ sample_id?: string; has_artifact?: boolean }> }>(
        await fetchImpl(url.toString(), { method: "GET", headers: authHeaders(input.memberToken) }),
        "Self-host analytics journey samples"
      );
      const sample = payload.samples?.find((candidate) => candidate.has_artifact === true);
      return typeof sample?.sample_id === "string" ? sample.sample_id : null;
    }
  });

  const createResponse = await fetchImpl(`${apiBaseUrl}/v1/analytics/bundles`, {
    method: "POST",
    headers: {
      ...authHeaders(input.memberToken),
      "content-type": "application/json"
    },
    body: JSON.stringify({
      project_id: input.projectId,
      analysis_kind: "usage_summary",
      last: "1d",
      filters: { service: input.serviceName, environment: "production" }
    })
  });
  const created = await parseResponse<{ status?: string; bundle_generation_id?: string }>(
    createResponse,
    "Self-host AnalyticsBundle generation"
  );
  const bundleGenerationId = created.bundle_generation_id ?? createResponse.headers.get("x-debugbundle-generation-id");
  if (typeof bundleGenerationId !== "string" || bundleGenerationId.length === 0) {
    throw new Error("Self-host AnalyticsBundle generation did not return a generation id.");
  }

  const bundleSchemaVersion = await pollUntil({
    timeoutMs,
    pollIntervalMs,
    wait,
    timeoutMessage: "Self-host AnalyticsBundle generation did not complete before timeout.",
    execute: async () => {
      const response = await fetchImpl(
        `${apiBaseUrl}/v1/analytics/bundles/${bundleGenerationId}?project_id=${input.projectId}`,
        { method: "GET", headers: authHeaders(input.memberToken) }
      );
      const payload = await parseResponse<{ status?: string; reason?: string; schema_version?: string }>(
        response,
        "Self-host AnalyticsBundle retrieval"
      );
      if (payload.status === "failed") {
        throw new Error(`Self-host AnalyticsBundle generation failed: ${payload.reason ?? "unknown reason"}.`);
      }
      return payload.schema_version === "analytics_bundle.v1" ? payload.schema_version : null;
    }
  });

  return {
    acceptedEvents: events.length,
    sessions: summary.sessions,
    pageviews: summary.pageviews,
    conversions: summary.conversions,
    journeySampleId,
    bundleGenerationId,
    bundleSchemaVersion
  };
}
