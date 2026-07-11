// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

const SAMPLE_ID = "44444444-4444-4444-8444-444444444444";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

function installJourneyDetailFetch(failOnce = false): { requestedUrls: () => string[] } {
  const requestedUrls: string[] = [];
  let sampleRequests = 0;

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
      if (url.includes(`/v1/analytics/journey-samples/${SAMPLE_ID}?`)) {
        sampleRequests += 1;
        if (failOnce && sampleRequests === 1) {
          return jsonResponse(503, { error: "unavailable" });
        }
        return jsonResponse(200, {
          sample: {
            sample_id: SAMPLE_ID,
            project_id: PROJECT_ID,
            service: "web",
            environment: "production",
            session_id_hash: "sha256:internal-session-hash",
            visitor_id_hash: "sha256:internal-visitor-hash",
            analysis_tags: ["checkout", "transition:/pricing->/checkout"],
            first_seen_at: "2026-07-10T10:00:00.000Z",
            last_seen_at: "2026-07-10T10:03:00.000Z",
            dimensions_summary: {
              device_type: "mobile",
              browser_family: "chrome",
              auth_state: "authenticated",
              account_id: "must-not-render"
            },
            has_artifact: true,
            expires_at: "2026-08-10T10:03:00.000Z",
            created_at: "2026-07-10T10:03:10.000Z"
          },
          journey: {
            schema_version: "analytics_journey_sample.v1",
            events: [
              {
                event_id: "event-must-not-render",
                occurred_at: "2026-07-10T10:00:00.000Z",
                kind: "page_view",
                route: { path: "/pricing", normalized_path: "/pricing", title: "Pricing" },
                previous_route: null,
                signal: null,
                trace_id: "trace-must-not-render",
                custom_dimensions: { target_text: "secret button text" }
              },
              {
                event_id: "event-2-must-not-render",
                occurred_at: "2026-07-10T10:01:00.000Z",
                kind: "funnel_step",
                route: { path: "/checkout", normalized_path: "/checkout", title: null },
                previous_route: { path: "/pricing", normalized_path: "/pricing", title: null },
                signal: {
                  action_key: null,
                  funnel_key: "checkout",
                  step_key: "shipping",
                  conversion_key: null,
                  marker_key: null
                },
                deploy_id: "deploy-42"
              }
            ]
          }
        });
      }
      return jsonResponse(404, { error: "not_found" });
    })
  );

  return { requestedUrls: () => requestedUrls };
}

describe("web app - project analytics journey detail", () => {
  it("renders a privacy-safe structured timeline without internal identifiers or raw data", async () => {
    const state = installJourneyDetailFetch();

    render(
      <App
        initialEntries={[
          `/projects/${PROJECT_ID}/analytics/journeys/${SAMPLE_ID}`
        ]}
      />
    );

    expect(await screen.findByRole("heading", { name: "Journey sample" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to journeys" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/analytics/journeys`
    );
    const timeline = await screen.findByRole("list", { name: "Structured journey timeline" });
    expect(within(timeline).getByText("Page View")).toBeInTheDocument();
    expect(within(timeline).getByText("Funnel Step")).toBeInTheDocument();
    expect(within(timeline).getByText("/pricing")).toBeInTheDocument();
    expect(within(timeline).getByText("/checkout")).toBeInTheDocument();
    expect(within(timeline).getByText("checkout / shipping")).toBeInTheDocument();
    expect(screen.getByText("mobile")).toBeInTheDocument();
    expect(screen.getByText("chrome")).toBeInTheDocument();
    expect(screen.getByText("authenticated")).toBeInTheDocument();

    for (const sensitiveValue of [
      "sha256:internal-session-hash",
      "sha256:internal-visitor-hash",
      "trace-must-not-render",
      "event-must-not-render",
      "must-not-render",
      "secret button text"
    ]) {
      expect(screen.queryByText(sensitiveValue)).not.toBeInTheDocument();
    }
    expect(
      state.requestedUrls().some(
        (url) =>
          url.includes(`/v1/analytics/journey-samples/${SAMPLE_ID}?`) &&
          url.includes(`project_id=${PROJECT_ID}`)
      )
    ).toBe(true);
  });

  it("retries a failed retained sample read", async () => {
    const user = userEvent.setup();
    installJourneyDetailFetch(true);

    render(
      <App
        initialEntries={[
          `/projects/${PROJECT_ID}/analytics/journeys/${SAMPLE_ID}`
        ]}
      />
    );

    expect(await screen.findByText(/could not load journey sample/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry journey sample" }));
    expect(await screen.findByRole("list", { name: "Structured journey timeline" })).toBeInTheDocument();
  });
});
