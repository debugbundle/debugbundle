// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
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

const metricsWindow = {
  project_id: "proj_123",
  from: "2026-06-10T00:00:00.000Z",
  to: "2026-07-10T00:00:00.000Z",
  granularity: "day",
  service: null,
  environment: null
} as const;

function installMetricsFetch(
  input: {
    empty?: boolean;
    enabled?: boolean;
    failDevices?: boolean;
    failRoutesOnce?: boolean;
    failSettingsOnce?: boolean;
  } = {}
): {
  requestedUrls: () => string[];
} {
  const requestedUrls: string[] = [];
  let routeRequests = 0;
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
          device_types: input.empty
            ? []
            : [{ value: "mobile", sessions: 720, pageviews: 2910 }],
          browsers: input.empty
            ? []
            : [{ value: "chrome", sessions: 610, pageviews: 2500 }],
          os: input.empty ? [] : [{ value: "ios", sessions: 440, pageviews: 1810 }],
          languages: input.empty
            ? []
            : [{ value: "en-us", sessions: 810, pageviews: 3200 }]
        });
      }

      if (url.includes("/v1/analytics/referrers?")) {
        return jsonResponse(200, {
          window: metricsWindow,
          referrers: input.empty
            ? []
            : [{ value: "search.example", sessions: 350, pageviews: 1200 }],
          utm_sources: input.empty
            ? []
            : [{ value: "newsletter", sessions: 140, pageviews: 510 }],
          utm_mediums: input.empty
            ? []
            : [{ value: "email", sessions: 130, pageviews: 480 }],
          utm_campaigns: input.empty
            ? []
            : [{ value: "summer_launch", sessions: 90, pageviews: 330 }]
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
    expect(within(sectionTabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Overview",
      "Routes",
      "Audiences"
    ]);

    await user.click(within(sectionTabs).getByRole("tab", { name: "Audiences" }));
    expect(await screen.findByRole("heading", { name: "Audience analytics" })).toBeInTheDocument();
    expect(within(sectionTabs).getByRole("tab", { name: "Audiences" })).toHaveAttribute(
      "data-state",
      "active"
    );
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

    await user.type(screen.getByLabelText("Service"), "storefront");
    await user.type(screen.getByLabelText("Environment"), "staging");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() => {
      expect(
        state.requestedUrls().some(
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
    expect(
      state.requestedUrls().some((url) => url.includes("/v1/analytics/routes?"))
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("/checkout")).toBeInTheDocument();
  });

  it("shows an explicit audience empty state", async () => {
    installMetricsFetch({ empty: true });

    render(<App initialEntries={["/projects/proj_123/analytics/audiences"]} />);

    expect(await screen.findByText(/no audience activity in this window/i)).toBeInTheDocument();
  });
});
