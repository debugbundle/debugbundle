import {
  ANALYTICS_EVENT_SCHEMA_VERSION,
  AnalyticsEventEnvelopeSchema,
  type AnalyticsDimensions,
  type AnalyticsEventEnvelope,
  type AnalyticsEventKind
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
  device: AnalyticsDimensions;
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
  deviceType: AnalyticsDimensions["device_type"],
  browser: string,
  browserVersion: string,
  os: string,
  osVersion: string,
  language: string
): AnalyticsDimensions {
  return {
    device_type: deviceType,
    auth_state: "unknown",
    browser_family: browser,
    browser_major: Number(browserVersion),
    os_family: os,
    os_major: Number(osVersion),
    language,
    locale: language,
    viewport_bucket: deviceType === "mobile" ? "small" : "large",
    referrer_domain: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    country_code: null,
    region_code: null
  };
}

async function emitBrowserSdkTraffic(input: {
  apiBaseUrl: string;
  projectToken: string;
  serviceName: string;
  fetchImpl: typeof fetch;
}): Promise<{ total: number; direct: number; relay: number }> {
  const eventsByMode: Record<"direct" | "relay", AnalyticsEventEnvelope[]> = {
    direct: [],
    relay: []
  };
  const acceptedByMode: Record<"direct" | "relay", number> = { direct: 0, relay: 0 };
  const errorsByMode: Record<"direct" | "relay", unknown[]> = { direct: [], relay: [] };
  const statusByMode: Record<"direct" | "relay", number | null> = { direct: null, relay: null };

  for (const [fixtureIndex, fixture] of SESSION_FIXTURES.entries()) {
    eventsByMode[fixture.transportMode].push(...createBrowserAnalyticsFixtureEvents({
      fixture,
      fixtureIndex,
      serviceName: input.serviceName
    }));
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

    const response = await input.fetchImpl(`${input.apiBaseUrl}/v1/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-debugbundle-smoke-transport": mode,
        authorization: `Bearer ${input.projectToken}`
      },
      body: JSON.stringify({ events: eventsByMode[mode] })
    });
    const body = (await response.json()) as { accepted?: number; errors?: unknown[] };
    acceptedByMode[mode] = body.accepted ?? 0;
    errorsByMode[mode] = body.errors ?? [];
    statusByMode[mode] = response.status;
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

function createBrowserAnalyticsFixtureEvents(input: {
  fixture: (typeof SESSION_FIXTURES)[number];
  fixtureIndex: number;
  serviceName: string;
}): AnalyticsEventEnvelope[] {
  const eventKinds: AnalyticsEventKind[] = [
    "session_start",
    "page_view",
    "action",
    "route_change",
    "page_view",
    "funnel_step",
    "route_change",
    ...(input.fixture.converted ? ["funnel_step", "conversion"] : ["journey_marker"]),
    "session_summary"
  ];

  return eventKinds.map((kind, eventIndex) => ({
    schema_version: ANALYTICS_EVENT_SCHEMA_VERSION,
    event_id: `00000000-0000-4000-8000-${String(input.fixtureIndex * 100 + eventIndex + 1).padStart(12, "0")}`,
    event_type: "analytics_event",
    occurred_at: "2026-07-16T00:00:00.000Z",
    sdk_name: "@debugbundle/sdk-browser",
    sdk_version: "1.4.1",
    service: { name: input.serviceName, runtime: "browser", framework: null, environment: "production" },
    correlation: {
      session_id: input.fixture.sessionId,
      visitor_id_hash: null,
      user_id_hash: null,
      trace_id: null,
      deploy_id: null
    },
    payload: {
      kind,
      privacy: { mode: "strict", consent_granted: true },
      dimensions: { ...input.fixture.device, auth_state: input.fixture.authState },
      custom_dimensions: { account_tier: "team" },
      route: kind === "page_view" || kind === "route_change"
        ? { path: eventIndex < 3 ? "/pricing" : "/signup", normalized_path: eventIndex < 3 ? "/pricing" : "/signup", title: null }
        : null,
      previous_route: kind === "route_change"
        ? { path: "/pricing", normalized_path: "/pricing", title: null }
        : null,
      signal: fixtureSignal(kind),
      ...(kind === "session_summary" ? { session: { duration_ms: 1_000, pageviews: 2 } } : {})
    }
  }));
}

function fixtureSignal(kind: AnalyticsEventKind) {
  if (kind === "action") return { action_key: "signup_click" };
  if (kind === "funnel_step") return { funnel_key: "checkout", step_key: "signup_started" };
  if (kind === "conversion") return { conversion_key: "subscription_started" };
  if (kind === "journey_marker") return { marker_key: "checkout.abandoned" };
  return undefined;
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
