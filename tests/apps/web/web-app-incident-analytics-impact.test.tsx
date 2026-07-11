// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import {
  createIncident,
  createProject,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

const PROJECT_ID = "proj_123";
const INCIDENT_ID = "inc_123";
const GENERATION_ID = "77777777-7777-4777-8777-777777777777";
const SAMPLE_ID = "88888888-8888-4888-8888-888888888888";

function createImpact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    incident_id: INCIDENT_ID,
    window: {
      project_id: PROJECT_ID,
      from: "2026-03-16T00:00:00.000Z",
      to: "2026-03-18T00:00:00.000Z",
      granularity: "day",
      service: "checkout-api",
      environment: "production"
    },
    affected_sessions: 18,
    affected_routes: [{ route_key: "/checkout", affected_sessions: 15 }],
    affected_funnels: [{ funnel_key: "checkout", affected_sessions: 12 }],
    top_device_types: [{ value: "mobile", affected_sessions: 11 }],
    top_browsers: [{ value: "Chrome", affected_sessions: 10 }],
    journey_patterns: [
      {
        from_route_key: "/cart",
        to_route_key: "/checkout",
        affected_sessions: 9,
        sample_ids: [SAMPLE_ID]
      }
    ],
    conversion_delta: {
      availability: "available",
      value: -8.4,
      unit: "percentage_points"
    },
    analytics_bundle: {
      status: "completed",
      generation_id: GENERATION_ID,
      failure_reason: null
    },
    ...overrides
  };
}

function installFetch(
  input: {
    impactResponses?: Response[];
    impact?: Record<string, unknown>;
    createResponse?: Response;
  } = {}
): { createBodies: Array<Record<string, unknown>>; requestedUrls: string[] } {
  const project = createProject({ project_id: PROJECT_ID, organization_plan: "team" });
  const incident = createIncident({ incident_id: INCIDENT_ID, project_id: PROJECT_ID });
  const createBodies: Array<Record<string, unknown>> = [];
  const impactResponses = [...(input.impactResponses ?? [])];
  const requestedUrls: string[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn((request: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(request);
      requestedUrls.push(url);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: "team" }) });
      }
      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }
      if (url.endsWith(`/v1/incidents/${INCIDENT_ID}`)) {
        return jsonResponse(200, { incident });
      }
      if (url.includes(`/v1/analytics/incidents/${INCIDENT_ID}/impact?`)) {
        return impactResponses.shift() ?? jsonResponse(200, input.impact ?? createImpact());
      }
      if (url.endsWith(`/v1/incidents/${INCIDENT_ID}/bundle`)) {
        return jsonResponse(200, { status: "pending" });
      }
      if (url.endsWith(`/v1/incidents/${INCIDENT_ID}/reproduction`)) {
        return jsonResponse(200, { status: "pending" });
      }
      if (url.endsWith("/v1/analytics/bundles") && init?.method === "POST") {
        if (typeof init.body !== "string") throw new Error("expected_json_request_body");
        createBodies.push(JSON.parse(init.body) as Record<string, unknown>);
        return (
          input.createResponse ??
          new Response(JSON.stringify({ status: "pending", bundle_generation_id: GENERATION_ID }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-DebugBundle-Generation-Id": GENERATION_ID
            }
          })
        );
      }
      if (url.includes(`/v1/analytics/bundles/${GENERATION_ID}?`)) {
        return jsonResponse(200, {
          status: "pending",
          bundle_generation_id: GENERATION_ID
        });
      }
      return jsonResponse(404, { error: "not_found" });
    })
  );

  return { createBodies, requestedUrls };
}

afterEach(() => {
  resetBrowserSessionClientState();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("web app - incident analytics impact", () => {
  it("renders aggregate impact and links only public journey and bundle references", async () => {
    installFetch();
    render(<App initialEntries={[`/projects/${PROJECT_ID}/incidents/${INCIDENT_ID}`]} />);

    const panel = await screen.findByRole("region", { name: "Analytics impact" });
    expect(within(panel).getByText("18")).toBeInTheDocument();
    expect(within(panel).getByText("/checkout")).toBeInTheDocument();
    expect(within(panel).getByText("checkout")).toBeInTheDocument();
    expect(within(panel).getByText("mobile")).toBeInTheDocument();
    expect(within(panel).getByText("Chrome")).toBeInTheDocument();
    expect(within(panel).getByText("-8.4 pp")).toBeInTheDocument();
    expect(within(panel).getByText("/cart to /checkout")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "View journey 1" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/analytics/journeys/${SAMPLE_ID}`
    );
    expect(within(panel).getByRole("link", { name: "View AnalyticsBundle" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/analytics/bundles/${GENERATION_ID}`
    );
    expect(panel).not.toHaveTextContent(SAMPLE_ID);
  });

  it("renders an explicit zero-impact state without inventing conversion data", async () => {
    installFetch({
      impact: createImpact({
        affected_sessions: 0,
        affected_routes: [],
        affected_funnels: [],
        top_device_types: [],
        top_browsers: [],
        journey_patterns: [],
        conversion_delta: { availability: "unavailable", value: null, unit: "percentage_points" },
        analytics_bundle: {
          status: "not_requested",
          generation_id: null,
          failure_reason: null
        }
      })
    });
    render(<App initialEntries={[`/projects/${PROJECT_ID}/incidents/${INCIDENT_ID}`]} />);

    const panel = await screen.findByRole("region", { name: "Analytics impact" });
    expect(within(panel).getByText(/no analytics-linked sessions were found/i)).toBeInTheDocument();
    expect(within(panel).getByText("Unavailable")).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: "Generate AnalyticsBundle" })
    ).toBeInTheDocument();
  });

  it("keeps expected analytics capability absences out of incident error states", async () => {
    installFetch({ impactResponses: [jsonResponse(403, { error: "upgrade_required" })] });
    render(<App initialEntries={[`/projects/${PROJECT_ID}/incidents/${INCIDENT_ID}`]} />);

    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Analytics impact" })).toBeNull();
    });
    expect(await screen.findByText(/bundle is being generated/i)).toBeInTheDocument();
  });

  it("retries a failed impact read without affecting the incident artifacts", async () => {
    const emptyImpact = createImpact({ affected_sessions: 0, affected_routes: [] });
    installFetch({
      impactResponses: [
        jsonResponse(500, { error: "internal_error" }),
        jsonResponse(200, emptyImpact)
      ]
    });
    const user = userEvent.setup();
    render(<App initialEntries={[`/projects/${PROJECT_ID}/incidents/${INCIDENT_ID}`]} />);

    expect(await screen.findByText("Could not load analytics impact")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry analytics impact" }));
    expect(await screen.findByText(/no analytics-linked sessions were found/i)).toBeInTheDocument();
    expect(screen.getByText(/bundle is being generated/i)).toBeInTheDocument();
  });

  it("generates a bounded incident-impact bundle and opens its canonical detail", async () => {
    const state = installFetch({
      impact: createImpact({
        analytics_bundle: {
          status: "not_requested",
          generation_id: null,
          failure_reason: null
        }
      })
    });
    const user = userEvent.setup();
    render(<App initialEntries={[`/projects/${PROJECT_ID}/incidents/${INCIDENT_ID}`]} />);

    await user.click(await screen.findByRole("button", { name: "Generate AnalyticsBundle" }));
    await waitFor(() => {
      expect(state.requestedUrls.some((url) => url.includes(`/v1/analytics/bundles/${GENERATION_ID}?`))).toBe(true);
    });
    expect(state.createBodies).toEqual([
      {
        project_id: PROJECT_ID,
        analysis_kind: "incident_impact",
        incident_id: INCIDENT_ID,
        filters: {}
      }
    ]);
  });

  it("keeps generation retryable when the AnalyticsBundle allowance is exhausted", async () => {
    installFetch({
      impact: createImpact({
        analytics_bundle: {
          status: "not_requested",
          generation_id: null,
          failure_reason: null
        }
      }),
      createResponse: jsonResponse(429, { error: "analytics_quota_exceeded" })
    });
    const user = userEvent.setup();
    render(<App initialEntries={[`/projects/${PROJECT_ID}/incidents/${INCIDENT_ID}`]} />);

    const generateButton = await screen.findByRole("button", {
      name: "Generate AnalyticsBundle"
    });
    await user.click(generateButton);

    expect(
      await screen.findByText(/monthly AnalyticsBundle generation allowance/i)
    ).toBeInTheDocument();
    expect(generateButton).toBeEnabled();
  });

  it("shows a failed AnalyticsBundle with both its artifact and regeneration actions", async () => {
    installFetch({
      impact: createImpact({
        analytics_bundle: {
          status: "failed",
          generation_id: GENERATION_ID,
          failure_reason: "Aggregate evidence was unavailable for the requested window."
        }
      })
    });
    render(<App initialEntries={[`/projects/${PROJECT_ID}/incidents/${INCIDENT_ID}`]} />);

    const panel = await screen.findByRole("region", { name: "Analytics impact" });
    expect(within(panel).getByText("Failed")).toBeInTheDocument();
    expect(within(panel).getByText(/aggregate evidence was unavailable/i)).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "View AnalyticsBundle" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/analytics/bundles/${GENERATION_ID}`
    );
    expect(within(panel).getByRole("button", { name: "Generate again" })).toBeInTheDocument();
  });
});
