// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

const analyticsSettings = {
  enabled: true,
  privacy_mode: "strict",
  consent_required: false,
  capture_page_views: true,
  capture_route_changes: true,
  capture_actions: true,
  capture_friction_signals: true,
  journey_sample_rate: 0.1,
  raw_retention_days: 7,
  sample_retention_days: 30,
  hourly_retention_days: 90,
  aggregate_retention_months: 24,
  max_saved_funnels: 10,
  max_custom_dimensions: 0,
  approved_custom_dimensions: []
} as const;

const metricsWindow = {
  project_id: "proj_123",
  from: "2026-06-10T00:00:00.000Z",
  to: "2026-07-10T00:00:00.000Z",
  granularity: "day",
  service: null,
  environment: null
} as const;

if (typeof HTMLElement !== "undefined") {
  HTMLElement.prototype.hasPointerCapture ??= () => false;
  HTMLElement.prototype.setPointerCapture ??= () => {};
  HTMLElement.prototype.releasePointerCapture ??= () => {};
}

async function chooseSelectOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  optionName: string
): Promise<void> {
  const trigger = screen.getByLabelText(label);
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
  await user.click(await screen.findByRole("option", { name: optionName }));
}

async function chooseCustomScopeValue(
  user: ReturnType<typeof userEvent.setup>,
  label: "Service" | "Environment",
  value: string
): Promise<void> {
  await chooseSelectOption(user, label, `Custom ${label.toLowerCase()}`);
  await user.type(screen.getByRole("textbox", { name: `Custom ${label.toLowerCase()}` }), value);
}

function installMetricsFetch(
  input: {
    empty?: boolean;
    enabled?: boolean;
    failBundlesOnce?: boolean;
    failDevices?: boolean;
    failFunnelDetailOnce?: boolean;
    failFunnelsOnce?: boolean;
    failJourneysOnce?: boolean;
    failOpportunitiesOnce?: boolean;
    failRoutesOnce?: boolean;
    failSettingsOnce?: boolean;
  } = {}
): {
  requestedUrls: () => string[];
} {
  const requestedUrls: string[] = [];
  let routeRequests = 0;
  let funnelRequests = 0;
  let bundleRequests = 0;
  let funnelDetailRequests = 0;
  let journeyRequests = 0;
  let opportunityRequests = 0;
  let settingsRequests = 0;

  vi.stubGlobal(
    "fetch",
    vi.fn((request: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(request);
      requestedUrls.push(url);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: "team" }) });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ organization_plan: "team" })]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/analytics-settings")) {
        settingsRequests += 1;
        if (input.failSettingsOnce && settingsRequests === 1) {
          return jsonResponse(503, { error: "unavailable" });
        }
        return jsonResponse(200, {
          access_mode: "manage",
          analytics_available: true,
          settings: { ...analyticsSettings, enabled: input.enabled ?? true }
        });
      }

      if (url.includes("/v1/analytics/routes?")) {
        routeRequests += 1;
        if (input.failRoutesOnce && routeRequests === 1) {
          return jsonResponse(503, { error: "unavailable" });
        }
        return jsonResponse(200, {
          window: metricsWindow,
          routes: input.empty
            ? []
            : [
                {
                  route_key: "/checkout",
                  pageviews: 830,
                  unique_sessions: 510,
                  entrances: 210,
                  exits: 160,
                  bounces: 42,
                  linked_incident_sessions: 18
                }
              ]
        });
      }

      if (url.includes("/v1/analytics/devices?")) {
        if (input.failDevices) return jsonResponse(503, { error: "unavailable" });
        return jsonResponse(200, {
          window: metricsWindow,
          device_types: input.empty ? [] : [{ value: "mobile", sessions: 720, pageviews: 2910 }],
          browsers: input.empty ? [] : [{ value: "chrome", sessions: 610, pageviews: 2500 }],
          os: input.empty ? [] : [{ value: "ios", sessions: 440, pageviews: 1810 }],
          languages: input.empty ? [] : [{ value: "en-us", sessions: 810, pageviews: 3200 }]
        });
      }

      if (url.includes("/v1/analytics/referrers?")) {
        return jsonResponse(200, {
          window: metricsWindow,
          referrers: input.empty
            ? []
            : [{ value: "search.example", sessions: 350, pageviews: 1200 }],
          utm_sources: input.empty ? [] : [{ value: "newsletter", sessions: 140, pageviews: 510 }],
          utm_mediums: input.empty ? [] : [{ value: "email", sessions: 130, pageviews: 480 }],
          utm_campaigns: input.empty
            ? []
            : [{ value: "summer_launch", sessions: 90, pageviews: 330 }]
        });
      }

      if (url.includes("/v1/analytics/funnels/checkout?")) {
        funnelDetailRequests += 1;
        if (input.failFunnelDetailOnce && funnelDetailRequests === 1) {
          return jsonResponse(503, { error: "unavailable" });
        }
        return jsonResponse(200, {
          funnel: {
            ...metricsWindow,
            funnel_key: "checkout",
            sessions_entered: 510,
            sessions_completed: 280,
            dropoffs: 230,
            conversion_rate: 0.549
          },
          steps: input.empty
            ? []
            : [
                {
                  step_key: "payment",
                  step_order: 1,
                  sessions_entered: 360,
                  sessions_completed: 280,
                  dropoffs: 80,
                  conversion_rate: 0.778
                },
                {
                  step_key: "shipping",
                  step_order: 0,
                  sessions_entered: 510,
                  sessions_completed: 360,
                  dropoffs: 150,
                  conversion_rate: 0.706
                }
              ]
        });
      }

      if (url.includes("/v1/analytics/funnels?")) {
        funnelRequests += 1;
        if (input.failFunnelsOnce && funnelRequests === 1) {
          return jsonResponse(503, { error: "unavailable" });
        }
        return jsonResponse(200, {
          window: metricsWindow,
          funnels: input.empty
            ? []
            : [
                {
                  funnel_key: "checkout",
                  sessions_entered: 510,
                  sessions_completed: 280,
                  dropoffs: 230,
                  conversion_rate: 0.549
                }
              ]
        });
      }

      if (url.includes("/v1/analytics/journey-patterns?")) {
        journeyRequests += 1;
        if (input.failJourneysOnce && journeyRequests === 1) {
          return jsonResponse(503, { error: "unavailable" });
        }
        return jsonResponse(200, {
          window: metricsWindow,
          patterns: input.empty
            ? []
            : [
                {
                  from_route_key: "/pricing",
                  to_route_key: "/checkout",
                  transition_count: 420,
                  unique_sessions: 350,
                  transition_share: 0.42,
                  sample_ids: ["44444444-4444-4444-8444-444444444444"]
                }
              ]
        });
      }

      if (url.includes("/v1/analytics/opportunities?")) {
        opportunityRequests += 1;
        if (input.failOpportunitiesOnce && opportunityRequests === 1) {
          return jsonResponse(503, { error: "unavailable" });
        }
        return jsonResponse(200, {
          opportunities: input.empty
            ? []
            : [
                {
                  opportunity_id: "55555555-5555-4555-8555-555555555555",
                  project_id: "proj_123",
                  project_name: "Project",
                  project_color_tag: null,
                  service: "web",
                  environment: "production",
                  kind: "funnel_dropoff",
                  status: "open",
                  severity: "high",
                  confidence: 0.91,
                  title: "Checkout dropoff increased",
                  summary: "Sessions leave after shipping.",
                  evidence: {},
                  related_incident_ids: [],
                  related_deploy_ids: [],
                  first_detected_at: "2026-07-01T00:00:00.000Z",
                  last_detected_at: "2026-07-10T00:00:00.000Z",
                  resolved_at: null,
                  snoozed_until: null,
                  bundle_generation_id: null,
                  bundle_status: "not_requested",
                  bundle_created_at: null,
                  bundle_updated_at: null,
                  bundle_failure_reason: null
                }
              ],
          next_cursor: null
        });
      }

      if (url.includes("/v1/analytics/bundles?")) {
        bundleRequests += 1;
        if (input.failBundlesOnce && bundleRequests === 1) {
          return jsonResponse(503, { error: "unavailable" });
        }
        return jsonResponse(200, {
          bundles: input.empty
            ? []
            : [
                {
                  generation_id: "77777777-7777-4777-8777-777777777777",
                  project_id: "proj_123",
                  project_name: "Project",
                  project_color_tag: null,
                  opportunity_id: "55555555-5555-4555-8555-555555555555",
                  requested_by_user_id: null,
                  analysis_kind: "funnel_dropoff",
                  analysis_spec: {
                    filters: { service: "web", environment: "production" }
                  },
                  input_fingerprint:
                    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                  status: "completed",
                  has_artifact: true,
                  failure_reason: null,
                  created_at: "2026-07-10T00:01:00.000Z",
                  claimed_at: "2026-07-10T00:01:10.000Z",
                  completed_at: "2026-07-10T00:02:00.000Z",
                  updated_at: "2026-07-10T00:02:00.000Z"
                }
              ],
          next_cursor: null
        });
      }

      return jsonResponse(404, { error: "not_found" });
    })
  );

  return { requestedUrls: () => requestedUrls };
}

describe("web app - project analytics metrics", () => {
  it("navigates between only implemented project analytics sections", async () => {
    const user = userEvent.setup();
    installMetricsFetch();

    render(<App initialEntries={["/projects/proj_123/analytics/routes"]} />);

    expect(await screen.findByRole("heading", { name: "Route analytics" })).toBeInTheDocument();
    const sectionTabs = screen.getByRole("tablist", { name: "Analytics sections" });
    expect(
      within(sectionTabs)
        .getAllByRole("tab")
        .map((tab) => tab.textContent)
    ).toEqual([
      "Overview",
      "Routes",
      "Funnels",
      "Audiences",
      "Journeys",
      "Opportunities",
      "Bundles"
    ]);

    await user.click(within(sectionTabs).getByRole("tab", { name: "Audiences" }));
    expect(await screen.findByRole("heading", { name: "Audience analytics" })).toBeInTheDocument();
    expect(within(sectionTabs).getByRole("tab", { name: "Audiences" })).toHaveAttribute(
      "data-state",
      "active"
    );
  });

  it("shows funnel summaries and expands an ordered step analysis inline", async () => {
    const user = userEvent.setup();
    const state = installMetricsFetch();

    render(<App initialEntries={["/projects/proj_123/analytics/funnels"]} />);

    const summaryTable = await screen.findByRole("table", { name: "Funnel metrics" });
    for (const heading of ["Funnel", "Entered", "Completed", "Dropoffs", "Conversion rate"]) {
      expect(within(summaryTable).getByRole("columnheader", { name: heading })).toBeInTheDocument();
    }
    expect(within(summaryTable).getByText("checkout")).toBeInTheDocument();
    expect(within(summaryTable).getByText("54.9%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View steps for checkout" }));

    const stepsTable = await screen.findByRole("table", { name: "Checkout funnel steps" });
    expect(within(stepsTable).getAllByRole("row")[1]).toHaveTextContent("shipping");
    expect(within(stepsTable).getAllByRole("row")[2]).toHaveTextContent("payment");
    expect(
      state
        .requestedUrls()
        .some(
          (url) =>
            url.includes("/v1/analytics/funnels/checkout?") &&
            url.includes("project_id=proj_123") &&
            url.includes("last=30d")
        )
    ).toBe(true);
  });

  it("retries funnel summary and detail failures independently", async () => {
    const user = userEvent.setup();
    installMetricsFetch({ failFunnelsOnce: true, failFunnelDetailOnce: true });

    render(<App initialEntries={["/projects/proj_123/analytics/funnels"]} />);

    expect(await screen.findByText(/could not load funnel analytics/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry funnel analytics" }));
    await user.click(await screen.findByRole("button", { name: "View steps for checkout" }));

    expect(await screen.findByText(/could not load checkout steps/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry checkout steps" }));
    expect(await screen.findByRole("table", { name: "Checkout funnel steps" })).toBeInTheDocument();
  });

  it("shows an explicit funnel empty state", async () => {
    installMetricsFetch({ empty: true });

    render(<App initialEntries={["/projects/proj_123/analytics/funnels"]} />);

    const emptyTitle = await screen.findByText(/no funnel activity in this window/i);
    expect(
      emptyTitle.closest('[data-slot="empty"]')?.querySelector(".lucide-funnel")
    ).not.toBeNull();
  });

  it("shows aggregate journey transitions and retained sample references", async () => {
    installMetricsFetch();

    render(<App initialEntries={["/projects/proj_123/analytics/journeys"]} />);

    const table = await screen.findByRole("table", { name: "Journey patterns" });
    for (const heading of [
      "From route",
      "To route",
      "Transitions",
      "Unique sessions",
      "Share",
      "Retained samples"
    ]) {
      expect(within(table).getByRole("columnheader", { name: heading })).toBeInTheDocument();
    }
    expect(within(table).getByText("/pricing")).toBeInTheDocument();
    expect(within(table).getByText("/checkout")).toBeInTheDocument();
    expect(within(table).getByText("42%")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "Sample 1" })).toHaveAttribute(
      "href",
      "/projects/proj_123/analytics/journeys/44444444-4444-4444-8444-444444444444"
    );
  });

  it("retries failed journey-pattern reads and renders an empty state", async () => {
    const user = userEvent.setup();
    installMetricsFetch({ failJourneysOnce: true, empty: true });

    render(<App initialEntries={["/projects/proj_123/analytics/journeys"]} />);

    expect(await screen.findByText(/could not load journey patterns/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry journey patterns" }));
    const emptyTitle = await screen.findByText(/no journey transitions in this window/i);
    expect(
      emptyTitle.closest('[data-slot="empty"]')?.querySelector(".lucide-route")
    ).not.toBeNull();
  });

  it("shows project-scoped opportunities and opens their detail route", async () => {
    const state = installMetricsFetch();

    render(<App initialEntries={["/projects/proj_123/analytics/opportunities"]} />);

    const table = await screen.findByRole("table", { name: "Project analytics opportunities" });
    expect(within(table).getByText("Checkout dropoff increased")).toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: "Project" })).not.toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "Checkout dropoff increased" })).toHaveAttribute(
      "href",
      "/projects/proj_123/analytics/opportunities/55555555-5555-4555-8555-555555555555"
    );
    expect(
      state
        .requestedUrls()
        .some(
          (url) =>
            url.includes("/v1/analytics/opportunities?") &&
            url.includes("project_id=proj_123") &&
            url.includes("status=all") &&
            url.includes("limit=20")
        )
    ).toBe(true);
  });

  it("retries failed project opportunity reads and renders an empty state", async () => {
    const user = userEvent.setup();
    installMetricsFetch({ failOpportunitiesOnce: true, empty: true });

    render(<App initialEntries={["/projects/proj_123/analytics/opportunities"]} />);

    expect(
      await screen.findByText(/could not load project analytics opportunities/i)
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry project analytics opportunities" }));
    expect(
      await screen.findByText(/no analytics opportunities in this project/i)
    ).toBeInTheDocument();
  });

  it("shows project-scoped AnalyticsBundles and opens their detail route", async () => {
    const state = installMetricsFetch();

    render(<App initialEntries={["/projects/proj_123/analytics/bundles"]} />);

    const table = await screen.findByRole("table", { name: "Project analytics bundles" });
    expect(screen.getByRole("link", { name: "Generate analytics bundle" })).toHaveAttribute(
      "href",
      "/projects/proj_123/analytics/bundles/new"
    );
    expect(within(table).queryByRole("columnheader", { name: "Project" })).not.toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "Funnel Dropoff" })).toHaveAttribute(
      "href",
      "/projects/proj_123/analytics/bundles/77777777-7777-4777-8777-777777777777"
    );
    expect(within(table).getByRole("link", { name: "View opportunity" })).toHaveAttribute(
      "href",
      "/projects/proj_123/analytics/opportunities/55555555-5555-4555-8555-555555555555"
    );
    expect(
      state
        .requestedUrls()
        .some(
          (url) =>
            url.includes("/v1/analytics/bundles?") &&
            url.includes("project_id=proj_123") &&
            url.includes("status=all") &&
            url.includes("limit=20")
        )
    ).toBe(true);
  });

  it("retries failed project AnalyticsBundle reads and renders an empty state", async () => {
    const user = userEvent.setup();
    installMetricsFetch({ failBundlesOnce: true, empty: true });

    render(<App initialEntries={["/projects/proj_123/analytics/bundles"]} />);

    expect(
      await screen.findByText(/could not load project analytics bundles/i)
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry project analytics bundles" }));
    expect(await screen.findByText(/no analytics bundles in this project/i)).toBeInTheDocument();
  });

  it("shows complete route metrics and applies shared filters", async () => {
    const user = userEvent.setup();
    const state = installMetricsFetch();

    render(<App initialEntries={["/projects/proj_123/analytics/routes"]} />);

    const table = await screen.findByRole("table", { name: "Route metrics" });
    for (const heading of [
      "Route",
      "Page views",
      "Unique sessions",
      "Entrances",
      "Exits",
      "Bounces",
      "Incident-linked sessions"
    ]) {
      expect(within(table).getByRole("columnheader", { name: heading })).toBeInTheDocument();
    }
    expect(within(table).getByText("/checkout")).toBeInTheDocument();
    expect(within(table).getByText("830")).toBeInTheDocument();
    expect(within(table).getByText("18")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More filters" }));
    await chooseCustomScopeValue(user, "Service", "storefront");
    await chooseSelectOption(user, "Environment", "staging");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() => {
      expect(
        state
          .requestedUrls()
          .some(
            (url) =>
              url.includes("/v1/analytics/routes?") &&
              url.includes("service=storefront") &&
              url.includes("environment=staging") &&
              url.includes("last=30d")
          )
      ).toBe(true);
    });
  });

  it("shows all audience dimensions without hiding successful partial data", async () => {
    installMetricsFetch({ failDevices: true });

    render(<App initialEntries={["/projects/proj_123/analytics/audiences"]} />);

    expect(await screen.findByText(/some audience metrics are unavailable/i)).toBeInTheDocument();
    expect(screen.getByText("Referrers")).toBeInTheDocument();
    expect(screen.getByText("search.example")).toBeInTheDocument();
    expect(screen.getByText("newsletter")).toBeInTheDocument();
    expect(screen.getByText("email")).toBeInTheDocument();
    expect(screen.getByText("summer_launch")).toBeInTheDocument();
    expect(screen.getByText(/device and platform metrics unavailable/i)).toBeInTheDocument();
  });

  it("retries a failed route read without reloading the project", async () => {
    const user = userEvent.setup();
    const state = installMetricsFetch({ failRoutesOnce: true });

    render(<App initialEntries={["/projects/proj_123/analytics/routes"]} />);

    expect(await screen.findByText(/could not load route analytics/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry route analytics" }));

    expect(await screen.findByText("/checkout")).toBeInTheDocument();
    expect(
      state.requestedUrls().filter((url) => url.includes("/v1/analytics/routes?")).length
    ).toBe(2);
  });

  it("uses the journey icon for an empty route window", async () => {
    installMetricsFetch({ empty: true });

    render(<App initialEntries={["/projects/proj_123/analytics/routes"]} />);

    const emptyTitle = await screen.findByText(/no route activity in this window/i);
    expect(
      emptyTitle.closest('[data-slot="empty"]')?.querySelector(".lucide-waypoints")
    ).not.toBeNull();
  });

  it("does not read child metrics when analytics capture is disabled", async () => {
    const state = installMetricsFetch({ enabled: false });

    render(<App initialEntries={["/projects/proj_123/analytics/audiences"]} />);

    expect(
      await screen.findByRole("heading", { name: /analytics capture is off/i })
    ).toBeInTheDocument();
    expect(
      state
        .requestedUrls()
        .some(
          (url) =>
            url.includes("/v1/analytics/devices?") || url.includes("/v1/analytics/referrers?")
        )
    ).toBe(false);
  });

  it("retries the project analytics settings gate before reading child metrics", async () => {
    const user = userEvent.setup();
    const state = installMetricsFetch({ failSettingsOnce: true });

    render(<App initialEntries={["/projects/proj_123/analytics/routes"]} />);

    expect(await screen.findByText(/analytics settings unavailable/i)).toBeInTheDocument();
    expect(state.requestedUrls().some((url) => url.includes("/v1/analytics/routes?"))).toBe(false);

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("/checkout")).toBeInTheDocument();
  });

  it("shows an explicit audience empty state", async () => {
    installMetricsFetch({ empty: true });

    render(<App initialEntries={["/projects/proj_123/analytics/audiences"]} />);

    expect(await screen.findByText(/no audience activity in this window/i)).toBeInTheDocument();
  });
});
