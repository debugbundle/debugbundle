// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
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
  aggregate_retention_months: 24,
  max_saved_funnels: 10,
  max_custom_dimensions: 0,
  approved_custom_dimensions: []
} as const;

function installOverviewFetch(
  input: {
    plan?: "free" | "solo" | "team";
    enabled?: boolean;
    empty?: boolean;
    failMetricsOnce?: boolean;
    failRoutes?: boolean;
  } = {}
): { metricsRequests: () => number; requestedUrls: () => string[] } {
  let metricsRequests = 0;
  const requestedUrls: string[] = [];
  const plan = input.plan ?? "solo";

  vi.stubGlobal(
    "fetch",
    vi.fn((request: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(request);
      requestedUrls.push(url);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: plan }) });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [createProject({ organization_plan: plan })] });
      }

      if (url.endsWith("/v1/projects/proj_123/analytics-settings")) {
        return jsonResponse(200, {
          access_mode: "manage",
          analytics_available: plan !== "free",
          settings: { ...analyticsSettings, enabled: input.enabled ?? true }
        });
      }

      if (url.includes("/v1/analytics/summary?")) {
        metricsRequests += 1;
        if (input.failMetricsOnce && metricsRequests === 1) {
          return jsonResponse(503, { error: "unavailable" });
        }
        return jsonResponse(200, {
          summary: {
            project_id: "proj_123",
            from: "2026-06-10T00:00:00.000Z",
            to: "2026-07-10T00:00:00.000Z",
            granularity: "day",
            service: null,
            environment: null,
            sessions: input.empty ? 0 : 1280,
            pageviews: input.empty ? 0 : 4860,
            active_visitors: input.empty ? 0 : 940,
            new_visitors: input.empty ? 0 : 610,
            returning_visitors: input.empty ? 0 : 330,
            exits: input.empty ? 0 : 720,
            conversions: input.empty ? 0 : 146
          },
          breakdowns: {
            device_types: input.empty ? [] : [{ value: "mobile", sessions: 720, pageviews: 2910 }],
            browsers: [],
            os: [],
            languages: [],
            referrers: [],
            auth_states: []
          }
        });
      }

      if (url.includes("/v1/analytics/routes?")) {
        if (input.failRoutes) {
          return jsonResponse(503, { error: "unavailable" });
        }
        return jsonResponse(200, {
          window: {
            project_id: "proj_123",
            from: "2026-06-10T00:00:00.000Z",
            to: "2026-07-10T00:00:00.000Z",
            granularity: "day",
            service: null,
            environment: null
          },
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

      if (url.includes("/v1/analytics/opportunities?")) {
        return jsonResponse(200, {
          opportunities: input.empty
            ? []
            : [
                {
                  opportunity_id: "11111111-1111-4111-8111-111111111111",
                  project_id: "proj_123",
                  project_name: "Main App",
                  project_color_tag: null,
                  service: null,
                  environment: null,
                  kind: "funnel_dropoff",
                  status: "open",
                  severity: "high",
                  confidence: 0.91,
                  title: "Checkout completion drops after shipping",
                  summary: "Sessions leave after the shipping step.",
                  evidence: {},
                  related_incident_ids: [],
                  related_deploy_ids: [],
                  first_detected_at: "2026-07-09T00:00:00.000Z",
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

      return jsonResponse(404, { error: "not_found" });
    })
  );

  return { metricsRequests: () => metricsRequests, requestedUrls: () => requestedUrls };
}

describe("web app - project analytics overview", () => {
  it("places one Analytics project tab after Improvements and opens the overview", async () => {
    const user = userEvent.setup();
    installOverviewFetch();

    render(<App initialEntries={["/projects/proj_123"]} />);

    const improvementsTab = await screen.findByRole("tab", { name: "Improvements" });
    const analyticsTab = screen.getByRole("tab", { name: "Analytics" });
    const bundlesTab = screen.getByRole("tab", { name: "Bundles" });
    expect(
      improvementsTab.compareDocumentPosition(analyticsTab) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      analyticsTab.compareDocumentPosition(bundlesTab) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    await user.click(analyticsTab);

    expect(await screen.findByRole("heading", { name: "Analytics overview" })).toBeInTheDocument();
    expect(analyticsTab).toHaveAttribute("data-state", "active");
  });

  it("shows aggregate usage and compact route, device, and opportunity previews", async () => {
    installOverviewFetch();

    render(<App initialEntries={["/projects/proj_123/analytics"]} />);

    expect(await screen.findByText("1,280")).toBeInTheDocument();
    expect(screen.getByText("4,860")).toBeInTheDocument();
    expect(screen.getByText("940")).toBeInTheDocument();
    expect(screen.getByText("146")).toBeInTheDocument();
    expect(screen.getByText("/checkout")).toBeInTheDocument();
    expect(screen.getByText("Mobile")).toBeInTheDocument();
    expect(screen.getByText(/checkout completion drops after shipping/i)).toBeInTheDocument();
  });

  it("applies bounded time, service, and environment filters to aggregate reads", async () => {
    const user = userEvent.setup();
    const state = installOverviewFetch();

    render(<App initialEntries={["/projects/proj_123/analytics"]} />);

    await screen.findByText("1,280");
    await user.type(screen.getByLabelText("Service"), "storefront");
    await user.type(screen.getByLabelText("Environment"), "staging");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() => {
      expect(
        state
          .requestedUrls()
          .some(
            (url) =>
              url.includes("/v1/analytics/summary?") &&
              url.includes("service=storefront") &&
              url.includes("environment=staging") &&
              url.includes("last=30d")
          )
      ).toBe(true);
    });
  });

  it("shows a setup action when paid analytics capture is disabled", async () => {
    const state = installOverviewFetch({ enabled: false });

    render(<App initialEntries={["/projects/proj_123/analytics"]} />);

    expect(
      await screen.findByRole("heading", { name: /analytics capture is off/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open analytics settings/i })).toHaveAttribute(
      "href",
      "/projects/proj_123/settings"
    );
    expect(screen.queryByText("1,280")).toBeNull();
    expect(state.metricsRequests()).toBe(0);
  });

  it("shows paid-plan guidance when analytics is unavailable", async () => {
    const state = installOverviewFetch({ plan: "free" });

    render(<App initialEntries={["/projects/proj_123/analytics"]} />);

    expect(
      await screen.findByRole("heading", {
        name: /upgrade to solo or team to unlock product analytics/i
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open billing/i })).toHaveAttribute("href", "/billing");
    expect(state.metricsRequests()).toBe(0);
  });

  it("shows an explicit empty state after enabled analytics returns no usage", async () => {
    installOverviewFetch({ empty: true });

    render(<App initialEntries={["/projects/proj_123/analytics"]} />);

    expect(await screen.findByText(/no analytics activity in this window/i)).toBeInTheDocument();
    expect(
      screen.getByText(/analytics starts after opted-in browser capture/i)
    ).toBeInTheDocument();
  });

  it("preserves summary metrics when a secondary preview is unavailable", async () => {
    installOverviewFetch({ failRoutes: true });

    render(<App initialEntries={["/projects/proj_123/analytics"]} />);

    expect(await screen.findByText("1,280")).toBeInTheDocument();
    expect(screen.getByText(/some analytics previews are unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/route preview unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/checkout completion drops after shipping/i)).toBeInTheDocument();
  });

  it("retries aggregate reads without reloading the project", async () => {
    const user = userEvent.setup();
    const state = installOverviewFetch({ failMetricsOnce: true });

    render(<App initialEntries={["/projects/proj_123/analytics"]} />);

    expect(await screen.findByText(/could not load analytics overview/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry analytics overview" }));

    expect(await screen.findByText("1,280")).toBeInTheDocument();
    await waitFor(() => expect(state.metricsRequests()).toBe(2));
  });
});
