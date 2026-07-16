import { BrowserAnalyticsController } from "../sdks/debugbundle-js/packages/sdk-browser/src/analytics.js";
import { BrowserEventTransport } from "../sdks/debugbundle-js/packages/sdk-browser/src/event-transport.js";
import { buildBrowserTransportRequestBody } from "../sdks/debugbundle-js/packages/sdk-browser/src/runtime.js";
import type {
  ActiveConfig,
  BrowserAnalyticsEventEnvelope,
  BrowserDeviceInfo,
  BrowserTransportMode,
  DebugBundleBrowserTransport
} from "../sdks/debugbundle-js/packages/sdk-browser/src/types.js";
import { createBrowserRelay } from "../sdks/debugbundle-js/packages/sdk-node/src/relay.js";
import { AnalyticsEventEnvelopeSchema } from "../packages/shared-types/src/index.js";

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
  directAcceptedEvents: number;
  relayAcceptedEvents: number;
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
  authState: "anonymous" | "authenticated";
  transportMode: "direct" | "relay";
  device: BrowserDeviceInfo;
}> = [
  {
    sessionId: "selfhost-browser-desktop-chrome",
    converted: true,
    authState: "authenticated",
    transportMode: "direct",
    device: createDevice("desktop", "Chrome", "126", "macOS", "15", "en-US")
  },
  {
    sessionId: "selfhost-browser-mobile-safari",
    converted: false,
    authState: "anonymous",
    transportMode: "relay",
    device: createDevice("mobile", "Safari", "18", "iOS", "18", "de-DE")
  },
  {
    sessionId: "selfhost-browser-desktop-firefox",
    converted: true,
    authState: "authenticated",
    transportMode: "direct",
    device: createDevice("desktop", "Firefox", "128", "Windows", "11", "fr-FR")
  }
];

function createDevice(
  deviceType: BrowserDeviceInfo["device_type"],
  browser: string,
  browserVersion: string,
  os: string,
  osVersion: string,
  language: string
): BrowserDeviceInfo {
  const mobile = deviceType === "mobile";
  return {
    user_agent: `DebugBundle acceptance ${browser}/${browserVersion}`,
    os: { name: os, version: osVersion },
    browser: { name: browser, version: browserVersion },
    device_type: deviceType,
    screen: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    viewport: mobile ? { width: 390, height: 760 } : { width: 1280, height: 760 },
    device_pixel_ratio: mobile ? 3 : 2,
    touch_capable: mobile,
    language,
    connection_type: mobile ? "4g" : "ethernet",
    color_scheme_preference: "light"
  };
}

async function emitBrowserSdkTraffic(input: {
  apiBaseUrl: string;
  projectToken: string;
  serviceName: string;
  fetchImpl: typeof fetch;
}): Promise<{ total: number; direct: number; relay: number }> {
  const relay = createBrowserRelay({
    allowedOrigins: ["http://selfhost-browser.debugbundle.local"],
    durableWrite: false,
    endpoint: `${input.apiBaseUrl}/v1/events`,
    projectToken: input.projectToken,
    fetchImpl: input.fetchImpl
  });
  const eventsByMode: Record<"direct" | "relay", BrowserAnalyticsEventEnvelope[]> = {
    direct: [],
    relay: []
  };
  const acceptedByMode: Record<"direct" | "relay", number> = { direct: 0, relay: 0 };
  const errorsByMode: Record<"direct" | "relay", unknown[]> = { direct: [], relay: [] };
  const statusByMode: Record<"direct" | "relay", number | null> = { direct: null, relay: null };

  for (const fixture of SESSION_FIXTURES) {
    const events = eventsByMode[fixture.transportMode];
    const config = createBrowserActiveConfig({
      endpoint:
        fixture.transportMode === "direct"
          ? `${input.apiBaseUrl}/v1/events`
          : "http://browser-relay.debugbundle.local/events",
      projectToken: fixture.transportMode === "direct" ? input.projectToken : null,
      serviceName: input.serviceName,
      transportMode: fixture.transportMode,
      transport: async () => ({ status: 202 })
    });
    const controller = new BrowserAnalyticsController({
      getConfig: () => config,
      getDeviceInfo: () => fixture.device,
      getCurrentRoute: () => "/pricing?token=must-not-leak",
      getSessionId: () => fixture.sessionId,
      enqueue: (event) => events.push(event)
    });
    controller.configure({
      enabled: true,
      privacyMode: "strict",
      consentRequired: false,
      trackPageViews: true,
      trackRouteChanges: true,
      trackSessions: true,
      trackReferrers: true,
      trackActions: true,
      trackFrictionSignals: true,
      sampleRate: 1
    });
    controller.api.setContext({ auth_state: fixture.authState, account_tier: "team" });
    controller.captureSessionStart();
    controller.api.pageView({ path: "/pricing?token=must-not-leak", title: "Pricing" });
    controller.api.track("signup_click", { account_tier: "team", email: "owner@example.com" });
    controller.captureRouteChange("/signup?invite=must-not-leak");
    controller.api.pageView({ path: "/signup", title: "Sign up" });
    controller.api.funnel("checkout", "signup_started");
    controller.captureRouteChange("/checkout?step=payment");
    if (fixture.converted) {
      controller.api.funnel("checkout", "subscription_started");
      controller.api.convert("subscription_started");
    } else {
      controller.api.marker("checkout.abandoned");
    }
    controller.captureSessionSummary();
  }

  for (const mode of ["direct", "relay"] as const) {
    for (const [index, event] of eventsByMode[mode].entries()) {
      const validation = AnalyticsEventEnvelopeSchema.safeParse(event);
      if (!validation.success) {
        throw new Error(
          `Self-host browser analytics ${mode} event ${index} does not satisfy the public analytics schema: ` +
            validation.error.issues
              .map((issue) => `${issue.path.join(".") || "event"}: ${issue.message}`)
              .join("; ")
        );
      }
    }

    const config = createBrowserActiveConfig({
      endpoint:
        mode === "direct"
          ? `${input.apiBaseUrl}/v1/events`
          : "http://browser-relay.debugbundle.local/events",
      projectToken: mode === "direct" ? input.projectToken : null,
      serviceName: input.serviceName,
      transportMode: mode,
      transport: async (request) => {
        if (mode === "relay") {
          const response = await relay({
            method: "POST",
            headers: {
              ...request.headers,
              origin: "http://selfhost-browser.debugbundle.local"
            },
            body: buildBrowserTransportRequestBody(request.transportMode, request.events),
            ipAddress: "127.0.0.1"
          });
          acceptedByMode.relay = response.body?.accepted ?? 0;
          errorsByMode.relay = response.body?.errors ?? [];
          statusByMode.relay = response.status;
          return response;
        }
        const response = await input.fetchImpl(request.endpoint, {
          method: "POST",
          headers: request.headers,
          body: buildBrowserTransportRequestBody(request.transportMode, request.events)
        });
        const body = (await response.json()) as { accepted?: number; errors?: unknown[] };
        acceptedByMode.direct = body.accepted ?? 0;
        errorsByMode.direct = body.errors ?? [];
        statusByMode.direct = response.status;
        return { status: response.status, body };
      }
    });
    const transport = new BrowserEventTransport({
      onDebugResponse: () => undefined,
      onUnauthorized: () => undefined
    });
    transport.configure(config);
    for (const event of eventsByMode[mode]) transport.enqueueAnalytics(event);
    await transport.flush();
    transport.reset();
  }

  for (const mode of ["direct", "relay"] as const) {
    const expected = eventsByMode[mode].length;
    if (acceptedByMode[mode] !== expected) {
      throw new Error(
        `Self-host browser analytics ${mode} ingestion returned HTTP ${statusByMode[mode] ?? "unknown"} and accepted ` +
          `${acceptedByMode[mode]} of ${expected} events.` +
          (errorsByMode[mode].length === 0
            ? ""
            : ` ${errorsByMode[mode].map(formatIngestionError).join(" ")}`)
      );
    }
  }

  return {
    total: acceptedByMode.direct + acceptedByMode.relay,
    direct: acceptedByMode.direct,
    relay: acceptedByMode.relay
  };
}

function formatIngestionError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function createBrowserActiveConfig(input: {
  endpoint: string;
  projectToken: string | null;
  serviceName: string;
  transportMode: BrowserTransportMode;
  transport: DebugBundleBrowserTransport;
}): ActiveConfig {
  return {
    projectToken: input.projectToken,
    environment: "production",
    service: input.serviceName,
    enabled: true,
    redactFields: [],
    tracePropagationTargets: [],
    sampleRate: 1,
    batchSize: 100,
    flushInterval: 60_000,
    endpoint: input.endpoint,
    logLevel: "error",
    maxBreadcrumbs: 0,
    breadcrumbsOnErrorOnly: true,
    captureNetwork: false,
    captureClicks: false,
    captureRouteChanges: true,
    captureConsole: false,
    networkFilter: { urlPatterns: [], urlDenyPatterns: [], statusCodes: [], minResponseTime: null },
    sessionSampleRate: 1,
    maxEventsPerSession: 100,
    maxProbeLabels: 0,
    maxProbeEntriesPerLabel: 0,
    probeFlushOnError: false,
    requestTimeoutMs: 5_000,
    requestsAnalyticsConfig: true,
    captureRules: [],
    fetchImpl: null,
    transport: input.transport,
    transportMode: input.transportMode
  };
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

export async function runSelfhostAnalyticsSmoke(
  input: AnalyticsSmokeInput
): Promise<AnalyticsSmokeResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const wait =
    input.wait ??
    ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const pollIntervalMs = input.pollIntervalMs ?? 1_000;
  const timeoutMs = input.timeoutMs ?? 120_000;
  const apiBaseUrl = input.apiBaseUrl.endsWith("/")
    ? input.apiBaseUrl.slice(0, -1)
    : input.apiBaseUrl;

  const settingsResponse = await fetchImpl(
    `${apiBaseUrl}/v1/projects/${input.projectId}/analytics-settings`,
    {
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
        journey_sample_rate: 1,
        max_custom_dimensions: 1,
        approved_custom_dimensions: ["account_tier"]
      })
    }
  );
  const settings = await parseResponse<{
    analytics_available?: boolean;
    settings?: { enabled?: boolean };
  }>(settingsResponse, "Self-host analytics settings");
  if (settings.analytics_available !== true || settings.settings?.enabled !== true) {
    throw new Error("Self-host analytics settings did not enable analytics.");
  }

  await parseResponse(
    await fetchImpl(`${apiBaseUrl}/v1/projects/${input.projectId}/analytics/saved-funnels`, {
      method: "POST",
      headers: {
        ...authHeaders(input.memberToken),
        "content-type": "application/json"
      },
      body: JSON.stringify({
        funnel_key: "checkout",
        display_name: "Checkout",
        steps: [
          { step_key: "signup_started", display_name: "Signup started" },
          { step_key: "subscription_started", display_name: "Subscription started" }
        ]
      })
    }),
    "Self-host analytics saved funnel"
  );

  const accepted = await emitBrowserSdkTraffic({
    apiBaseUrl,
    projectToken: input.projectToken,
    serviceName: input.serviceName,
    fetchImpl
  });

  const summary = await pollUntil({
    timeoutMs,
    pollIntervalMs,
    wait,
    timeoutMessage:
      "Self-host analytics rollups did not include the browser sessions before timeout.",
    execute: async () => {
      const url = new URL(`${apiBaseUrl}/v1/analytics/summary`);
      url.searchParams.set("project_id", input.projectId);
      url.searchParams.set("last", "1d");
      url.searchParams.set("service", input.serviceName);
      url.searchParams.set("environment", "production");
      const response = await fetchImpl(url.toString(), {
        method: "GET",
        headers: authHeaders(input.memberToken)
      });
      const payload = await parseResponse<{
        summary?: { sessions?: number; pageviews?: number; conversions?: number };
        breakdowns?: {
          device_types?: Array<{ value?: string }>;
          browsers?: Array<{ value?: string }>;
        };
      }>(response, "Self-host analytics summary");
      if (
        (payload.summary?.sessions ?? 0) < 3 ||
        (payload.summary?.pageviews ?? 0) < 6 ||
        (payload.summary?.conversions ?? 0) < 2
      ) {
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
    await fetchImpl(funnelUrl.toString(), {
      method: "GET",
      headers: authHeaders(input.memberToken)
    }),
    "Self-host analytics funnels"
  );
  if (!funnels.funnels?.some((funnel) => funnel.funnel_key === "checkout")) {
    throw new Error("Self-host analytics funnels did not include checkout traffic.");
  }

  const journeySampleId = await pollUntil({
    timeoutMs,
    pollIntervalMs,
    wait,
    timeoutMessage:
      "Self-host analytics journey sampling did not retain a browser journey before timeout.",
    execute: async () => {
      const url = new URL(`${apiBaseUrl}/v1/analytics/journey-samples`);
      url.searchParams.set("project_id", input.projectId);
      url.searchParams.set("service", input.serviceName);
      url.searchParams.set("environment", "production");
      url.searchParams.set("limit", "20");
      const payload = await parseResponse<{
        samples?: Array<{ sample_id?: string; has_artifact?: boolean }>;
      }>(
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
  const bundleGenerationId =
    created.bundle_generation_id ?? createResponse.headers.get("x-debugbundle-generation-id");
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
      const payload = await parseResponse<{
        status?: string;
        reason?: string;
        schema_version?: string;
      }>(response, "Self-host AnalyticsBundle retrieval");
      if (payload.status === "failed") {
        throw new Error(
          `Self-host AnalyticsBundle generation failed: ${payload.reason ?? "unknown reason"}.`
        );
      }
      return payload.schema_version === "analytics_bundle.v1" ? payload.schema_version : null;
    }
  });

  return {
    acceptedEvents: accepted.total,
    directAcceptedEvents: accepted.direct,
    relayAcceptedEvents: accepted.relay,
    sessions: summary.sessions,
    pageviews: summary.pageviews,
    conversions: summary.conversions,
    journeySampleId,
    bundleGenerationId,
    bundleSchemaVersion
  };
}
