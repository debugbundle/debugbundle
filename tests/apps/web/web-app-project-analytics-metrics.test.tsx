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
    failPlanOnce?: boolean;
    forbidPlan?: boolean;
    orderedReports?: boolean;
    failOrderedOnce?: boolean;
    orderedHistory?: boolean;
    failRoutesOnce?: boolean;
    failSettingsOnce?: boolean;
  } = {}
): {
  requestedUrls: () => string[];
  submittedReports: () => unknown[];
} {
  const requestedUrls: string[] = [];
  let routeRequests = 0;
  let funnelRequests = 0;
  let bundleRequests = 0;
  let funnelDetailRequests = 0;
  let journeyRequests = 0;
  let opportunityRequests = 0;
  let settingsRequests = 0;
  let planRequests = 0;
  let orderedRequests = 0;
  const submittedReports: unknown[] = [];

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

      if (url.endsWith("/v1/projects/proj_123/analytics/plan")) {
        planRequests += 1;
        if (input.forbidPlan) return jsonResponse(403, { error: "forbidden" });
        if (input.failPlanOnce && planRequests === 1)
          return jsonResponse(503, { error: "unavailable" });
        return jsonResponse(200, {
          project_id: "proj_123",
          revision: 1,
          catalog_revision: 1,
          business_measurement_enabled: false,
          catalog: input.empty
            ? []
            : [
                {
                  name: "signup_completed",
                  revision: 1,
                  description: "Signup completed",
                  producers: ["server"],
                  purpose: "product_usage",
                  success_boundary: "committed",
                  properties: {},
                  measurements: {},
                  expected_producers: [
                    { sdk_name: "@debugbundle/sdk-node", minimum_version: "3.0.3" }
                  ]
                }
              ],
          reports: input.orderedReports
            ? [
                {
                  definition: {
                    kind: "ordered_funnel",
                    key: "signup_flow",
                    revision: 1,
                    display_name: "Signup flow",
                    scope: { kind: "project", project_id: "proj_123" },
                    subject: "session",
                    timezone: "UTC",
                    conversion_window_seconds: 3600,
                    breakdown: null,
                    steps: []
                  },
                  available_from: "2026-07-01T00:00:00.000Z"
                }
              ]
            : [],
          observations: input.empty
            ? []
            : [
                {
                  event_name: "signup_completed",
                  event_revision: 1,
                  producer_kind: "server",
                  observed_count: "3",
                  first_observed_on: "2026-07-01",
                  last_observed_on: "2026-07-03"
                }
              ],
          producer_observations: input.empty
            ? []
            : [
                {
                  event_name: "signup_completed",
                  event_revision: 1,
                  producer_kind: "server",
                  sdk_name: "@debugbundle/sdk-node",
                  sdk_version: "3.0.3",
                  observed_count: "3",
                  first_observed_on: "2026-07-01",
                  last_observed_on: "2026-07-03"
                }
              ],
          producer_observations_truncated: false
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

      if (url.endsWith("/v1/analytics/scopes/project/proj_123/reports/query")) {
        orderedRequests += 1;
        submittedReports.push(typeof init?.body === "string" ? JSON.parse(init.body) : null);
        if (input.orderedHistory)
          return jsonResponse(409, { error: "analytics_report_insufficient_history" });
        if (input.failOrderedOnce && orderedRequests === 1)
          return jsonResponse(503, { error: "analytics_reports_not_available" });
        return jsonResponse(200, {
          kind: "report",
          report: {
            status: "available",
            calculation_version: "ordered-funnel-1",
            quality: "partial",
            quality_reasons: ["incomplete_evidence"],
            scope: { kind: "project", project_id: "proj_123" },
            subject: "session",
            scope_revision: 1,
            definition_key: "signup_flow",
            definition_revision: 1,
            from: "2026-07-03T00:00:00.000Z",
            to: "2026-07-10T00:00:00.000Z",
            observation_cutoff: "2026-07-10T00:00:00.000Z",
            watermark: "2026-07-10T00:00:00.000Z",
            available_from: "2026-07-01T00:00:00.000Z",
            sample_rate: 1,
            population: {
              entered: 12,
              completed: 5,
              open: 3,
              expired: 2,
              unknown: 2,
              mature: 7
            },
            steps: [
              { key: "started", reached: 12, overall: null, previous: null },
              {
                key: "finished",
                reached: 5,
                overall: { numerator: 5, denominator: 12 },
                previous: { numerator: 5, denominator: 12 }
              }
            ],
            breakdowns: [],
            time_to_convert: null
          },
          evidence: {
            pending_events: "1",
            failed_events: "1",
            lost_events: "0",
            excluded_events: "2",
            erasure_tasks: "0",
            source_coverage: "unverified"
          }
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

  return { requestedUrls: () => requestedUrls, submittedReports: () => submittedReports };
}

describe("web app - project analytics metrics", () => {
  it("navigates between project analytics sections including tracking", async () => {
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
      "Bundles",
      "Tracking"
    ]);

    await user.click(within(sectionTabs).getByRole("tab", { name: "Audiences" }));
    expect(await screen.findByRole("heading", { name: "Audience analytics" })).toBeInTheDocument();
    expect(within(sectionTabs).getByRole("tab", { name: "Audiences" })).toHaveAttribute(
      "data-state",
      "active"
    );
  });

  it("shows declared tracking sources without claiming SDK or success verification", async () => {
    const state = installMetricsFetch();
    render(<App initialEntries={["/projects/proj_123/analytics/tracking"]} />);

    expect(await screen.findByRole("heading", { name: "Tracking" })).toBeInTheDocument();
    expect(
      screen.getByText(/submitted SDK names and versions are not verified/i)
    ).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Measurement health" });
    expect(within(table).getByText("signup_completed")).toBeInTheDocument();
    expect(within(table).getByText("@debugbundle/sdk-node 3.0.3")).toBeInTheDocument();
    expect(within(table).getByText("Not verified")).toBeInTheDocument();
    expect(
      state.requestedUrls().some((url) => url.endsWith("/v1/projects/proj_123/analytics/plan"))
    ).toBe(true);
  });

  it("shows an empty tracking state and retries a failed plan read", async () => {
    const user = userEvent.setup();
    installMetricsFetch({ empty: true, failPlanOnce: true });
    render(<App initialEntries={["/projects/proj_123/analytics/tracking"]} />);

    expect(await screen.findByText("Could not load tracking plan")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry tracking plan" }));
    expect(await screen.findByText("No event definitions yet")).toBeInTheDocument();
  });

  it("explains restricted tracking plan access without showing a partial table", async () => {
    installMetricsFetch({ forbidPlan: true });
    render(<App initialEntries={["/projects/proj_123/analytics/tracking"]} />);

    expect(await screen.findByText("Tracking plan access required")).toBeInTheDocument();
    expect(screen.getByText(/project owner or admin/i)).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Measurement health" })).not.toBeInTheDocument();
  });

  it("offers the same analytics sections through the labeled compact navigation", async () => {
    const user = userEvent.setup();
    installMetricsFetch();
    render(<App initialEntries={["/projects/proj_123/analytics/routes"]} />);

    expect(await screen.findByRole("heading", { name: "Route analytics" })).toBeInTheDocument();
    const trigger = screen.getByLabelText("Analytics section");
    expect(trigger).toHaveTextContent("Routes");
    await chooseSelectOption(user, "Analytics section", "Audiences");
    expect(await screen.findByRole("heading", { name: "Audience analytics" })).toBeInTheDocument();
    expect(trigger).toHaveTextContent("Audiences");
  });

  it("labels legacy funnel step aggregates and expands their step analysis inline", async () => {
    const user = userEvent.setup();
    const state = installMetricsFetch();

    render(<App initialEntries={["/projects/proj_123/analytics/funnels"]} />);

    expect(await screen.findByRole("tab", { name: "Legacy step counts" })).toBeInTheDocument();
    expect(
      screen.getByText(/do not prove that the same sessions completed each step in order/i)
    ).toBeInTheDocument();

    const summaryTable = await screen.findByRole("table", { name: "Funnel metrics" });
    for (const heading of ["Funnel", "Entered", "Completed", "Dropoffs", "Conversion rate"]) {
      expect(within(summaryTable).getByRole("columnheader", { name: heading })).toBeInTheDocument();
    }
    expect(within(summaryTable).getByText("checkout")).toBeInTheDocument();
    expect(within(summaryTable).getByText("54.9%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View steps for checkout" }));

    expect(screen.getByText(/saved step order and aggregate counts/i)).toBeInTheDocument();

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

  it("shows ordered same-session counts and incomplete evidence separately from legacy steps", async () => {
    const user = userEvent.setup();
    const state = installMetricsFetch({ orderedReports: true });
    render(<App initialEntries={["/projects/proj_123/analytics/funnels"]} />);

    await user.click(await screen.findByRole("tab", { name: "Ordered funnels" }));
    expect(await screen.findByRole("heading", { name: "Ordered funnels" })).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Funnel metrics" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("More filters")).not.toBeInTheDocument();
    expect(screen.getByText(/all services and environments/i)).toBeInTheDocument();
    expect(await screen.findByText("Partial measurement coverage")).toBeInTheDocument();
    expect(screen.getByText(/source coverage is unverified/i)).toBeInTheDocument();
    expect(screen.getByText(/1 failed processing/i)).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Ordered funnel steps" });
    expect(within(table).getByText("finished")).toBeInTheDocument();
    expect(screen.getByText(/5 of 12 entered sessions completed/i)).toBeInTheDocument();
    expect(state.submittedReports()).toContainEqual({ report_key: "signup_flow", last: "30d" });
    await chooseSelectOption(user, "Time window", "Last 7 days");
    await waitFor(() =>
      expect(state.submittedReports()).toContainEqual({ report_key: "signup_flow", last: "7d" })
    );
  });

  it("gives a retryable ordered report error", async () => {
    const user = userEvent.setup();
    installMetricsFetch({ orderedReports: true, failOrderedOnce: true });
    render(<App initialEntries={["/projects/proj_123/analytics/funnels/ordered"]} />);
    expect(await screen.findByText("Could not load ordered funnel")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry ordered funnel" }));
    expect(await screen.findByRole("table", { name: "Ordered funnel steps" })).toBeInTheDocument();
  });

  it("shows a missing-history explanation without inventing report counts", async () => {
    installMetricsFetch({ orderedReports: true, orderedHistory: true });
    render(<App initialEntries={["/projects/proj_123/analytics/funnels/ordered"]} />);
    expect(await screen.findByText("More history needed")).toBeInTheDocument();
    expect(
      screen.getByText(/begins before the funnel definition became available/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Ordered funnel steps" })).not.toBeInTheDocument();
  });

  it("explains when the project has no ordered funnel definition", async () => {
    installMetricsFetch();
    render(<App initialEntries={["/projects/proj_123/analytics/funnels/ordered"]} />);
    expect(await screen.findByText("No ordered funnels")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Ordered funnel steps" })).not.toBeInTheDocument();
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
