// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const GENERATION_ID = "77777777-7777-4777-8777-777777777777";
const INCIDENT_ID = "66666666-6666-4666-8666-666666666666";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

function readyBundle(): Record<string, unknown> {
  return {
    schema_version: "analytics_bundle.v1",
    bundle_type: "analytics",
    analysis_kind: "funnel_dropoff",
    project: { project_id: PROJECT_ID, service: "web", environment: "production" },
    analysis_window: {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-10T00:00:00.000Z",
      granularity: "day"
    },
    summary: {
      title: "Checkout funnel dropoff analysis",
      description: "Shipping is the highest-loss checkout step.",
      confidence: "high",
      severity: "medium"
    },
    metrics: {
      sessions_analyzed: 1200,
      affected_sessions: 230,
      baseline: { conversion_rate: 0.72 },
      current: {
        conversion_rate: 0.55,
        sessions: 1200,
        secret_payload: "must-not-render"
      }
    },
    segments: [
      {
        dimension: "device_type",
        value: "mobile",
        sessions: 720,
        pageviews: 2910,
        target_text: "must-not-render"
      }
    ],
    journey_patterns: [
      {
        from_route_key: "/pricing",
        to_route_key: "/checkout",
        transition_count: 420,
        unique_sessions: 350,
        transition_share: 0.42,
        sample_ids: ["sample-must-not-render"]
      }
    ],
    representative_journeys: [
      {
        sample_id: "sample-2-must-not-render",
        selection_rank: 2,
        selection_basis: "unique_sessions",
        selection_primary_count: 80,
        selection_secondary_count: 100,
        selection_transition_share: 0.3,
        service: "web",
        environment: "production",
        timeline: {
          "001": {
            event_id: "event-must-not-render",
            trace_id: "trace-must-not-render",
            occurred_at: "2026-07-10T10:00:00.000Z",
            kind: "page_view",
            route: "/pricing",
            previous_route: null,
            custom_dimensions: { target_text: "must-not-render" }
          }
        }
      },
      {
        sample_id: "sample-1-must-not-render",
        selection_rank: 1,
        selection_basis: "unique_sessions",
        selection_primary_count: 120,
        selection_secondary_count: 160,
        selection_transition_share: 0.5,
        service: "web",
        environment: "production",
        timeline: {
          "001": {
            event_id: "event-2-must-not-render",
            occurred_at: "2026-07-10T10:01:00.000Z",
            kind: "semantic_action",
            route: "/checkout",
            previous_route: "/pricing",
            action_key: "click.button",
            dimensions: { device_type: "mobile", account_id: "must-not-render" }
          }
        }
      }
    ],
    linked_incidents: [{ incident_id: INCIDENT_ID, title: "Checkout API errors" }],
    linked_deploys: [{ deploy_id: "deploy-42", internal_ref: "must-not-render" }],
    recommendations: [
      {
        priority: 1,
        action: "inspect_highest_dropoff_step",
        rationale: "Compare shipping completion across affected segments."
      }
    ],
    redaction: {
      rules_applied: ["analytics-bundle-default-redaction"],
      omitted_fields: ["form_values", "raw_click_text"]
    },
    metadata: {
      input_fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  };
}

function installBundleDetailFetch(
  responses: Array<Record<string, unknown>>,
  failOnce = false
): {
  requestedUrls: () => string[];
} {
  const requestedUrls: string[] = [];
  let detailRequests = 0;

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
          projects: [createProject({ project_id: PROJECT_ID, organization_plan: "team" })]
        });
      }
      if (url.includes(`/v1/analytics/bundles/${GENERATION_ID}?`)) {
        if (failOnce && detailRequests === 0) {
          detailRequests += 1;
          return jsonResponse(503, { error: "unavailable" });
        }
        const response = responses[Math.min(detailRequests, responses.length - 1)]!;
        detailRequests += 1;
        return jsonResponse(200, response);
      }
      return jsonResponse(404, { error: "not_found" });
    })
  );

  return { requestedUrls: () => requestedUrls };
}

describe("web app - project AnalyticsBundle detail", () => {
  it("renders ready artifacts as bounded structured evidence in deterministic journey order", async () => {
    const state = installBundleDetailFetch([readyBundle()]);

    render(<App initialEntries={[`/projects/${PROJECT_ID}/analytics/bundles/${GENERATION_ID}`]} />);

    expect(
      await screen.findByRole("heading", { name: "Checkout funnel dropoff analysis" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to AnalyticsBundles" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/analytics/bundles`
    );
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("1,200")).toBeInTheDocument();
    expect(screen.getByText("230")).toBeInTheDocument();
    expect(screen.getByText("mobile")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("Inspect Highest Dropoff Step")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Checkout API errors" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/incidents/${INCIDENT_ID}`
    );
    expect(screen.getByText("deploy-42")).toBeInTheDocument();

    const journeys = screen.getByRole("list", { name: "Representative journeys" });
    const journeyItems = within(journeys).getAllByRole("listitem");
    expect(journeyItems[0]).toHaveTextContent("Rank 1");
    expect(journeyItems[0]).toHaveTextContent("/checkout");
    expect(journeyItems[0]).toHaveTextContent("Click Button");
    expect(journeyItems[1]).toHaveTextContent("Rank 2");
    expect(journeyItems[1]).toHaveTextContent("/pricing");

    expect(screen.getByText("analytics-bundle-default-redaction")).toBeInTheDocument();
    for (const sensitiveValue of [
      "sample-1-must-not-render",
      "sample-2-must-not-render",
      "event-must-not-render",
      "trace-must-not-render",
      "must-not-render",
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    ]) {
      expect(screen.queryByText(sensitiveValue)).not.toBeInTheDocument();
    }
    expect(
      state
        .requestedUrls()
        .some(
          (url) =>
            url.includes(`/v1/analytics/bundles/${GENERATION_ID}?`) &&
            url.includes(`project_id=${PROJECT_ID}`)
        )
    ).toBe(true);
  });

  it("refreshes a pending generation into its ready artifact", async () => {
    const user = userEvent.setup();
    installBundleDetailFetch([
      { status: "pending", bundle_generation_id: GENERATION_ID },
      readyBundle()
    ]);

    render(<App initialEntries={[`/projects/${PROJECT_ID}/analytics/bundles/${GENERATION_ID}`]} />);

    expect(await screen.findByText("Processing")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh AnalyticsBundle status" }));
    expect(
      await screen.findByRole("heading", { name: "Checkout funnel dropoff analysis" })
    ).toBeInTheDocument();
  });

  it("shows an explicit failed generation state", async () => {
    installBundleDetailFetch([{ status: "failed", reason: "monthly_quota_exceeded" }]);

    render(<App initialEntries={[`/projects/${PROJECT_ID}/analytics/bundles/${GENERATION_ID}`]} />);

    expect(await screen.findByText("Generation failed")).toBeInTheDocument();
    expect(screen.getByText("Monthly Quota Exceeded")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh AnalyticsBundle status" })
    ).toBeInTheDocument();
  });

  it("retries a failed artifact read", async () => {
    const user = userEvent.setup();
    installBundleDetailFetch([readyBundle(), readyBundle()], true);

    render(<App initialEntries={[`/projects/${PROJECT_ID}/analytics/bundles/${GENERATION_ID}`]} />);

    expect(await screen.findByText(/could not load AnalyticsBundle/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh AnalyticsBundle status" }));
    expect(
      await screen.findByRole("heading", { name: "Checkout funnel dropoff analysis" })
    ).toBeInTheDocument();
  });
});
