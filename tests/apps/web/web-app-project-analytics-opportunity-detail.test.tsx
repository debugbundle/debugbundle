// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OPPORTUNITY_ID = "55555555-5555-4555-8555-555555555555";
const INCIDENT_ID = "66666666-6666-4666-8666-666666666666";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

const funnelEvidence = {
  analysis_window: {
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-07-10T00:00:00.000Z"
  },
  thresholds: {
    min_sessions: 20,
    min_dropoffs: 10,
    min_dropoff_rate: 0.4
  },
  funnel_key: "checkout",
  step_key: "shipping",
  step_order: 1,
  sessions_entered: 510,
  sessions_completed: 280,
  dropoffs: 230,
  dropoff_rate: 0.451,
  secret_payload: "must-not-render"
};

function installOpportunityDetailFetch(
  failOnce = false,
  evidence: Record<string, unknown> = funnelEvidence
): { requestedUrls: () => string[] } {
  const requestedUrls: string[] = [];
  let opportunityRequests = 0;

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
      if (url.includes(`/v1/analytics/opportunities/${OPPORTUNITY_ID}?`)) {
        opportunityRequests += 1;
        if (failOnce && opportunityRequests === 1) {
          return jsonResponse(503, { error: "unavailable" });
        }
        return jsonResponse(200, {
          opportunity: {
            opportunity_id: OPPORTUNITY_ID,
            project_id: PROJECT_ID,
            project_name: "Main App",
            project_color_tag: "blue",
            service: "web",
            environment: "production",
            kind: "funnel_dropoff",
            status: "open",
            severity: "high",
            confidence: 0.91,
            title: "Checkout dropoff increased",
            summary: "Sessions leave after the shipping step.",
            evidence,
            related_incident_ids: [INCIDENT_ID],
            related_deploy_ids: ["deploy-42"],
            first_detected_at: "2026-07-01T00:00:00.000Z",
            last_detected_at: "2026-07-10T00:00:00.000Z",
            resolved_at: null,
            snoozed_until: null,
            bundle_generation_id: "77777777-7777-4777-8777-777777777777",
            bundle_status: "completed",
            bundle_created_at: "2026-07-10T00:01:00.000Z",
            bundle_updated_at: "2026-07-10T00:02:00.000Z",
            bundle_failure_reason: null
          }
        });
      }
      return jsonResponse(404, { error: "not_found" });
    })
  );

  return { requestedUrls: () => requestedUrls };
}

describe("web app - project analytics opportunity detail", () => {
  it("renders aggregate evidence, related context, and bundle state without raw evidence dumps", async () => {
    const state = installOpportunityDetailFetch();

    render(
      <App initialEntries={[`/projects/${PROJECT_ID}/analytics/opportunities/${OPPORTUNITY_ID}`]} />
    );

    expect(
      await screen.findByRole("heading", { name: "Checkout dropoff increased" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to opportunities" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/analytics/opportunities`
    );
    const evidence = screen.getByRole("region", { name: "Aggregate evidence" });
    expect(within(evidence).getByText("checkout")).toBeInTheDocument();
    expect(within(evidence).getByText("shipping")).toBeInTheDocument();
    expect(within(evidence).getByText("510")).toBeInTheDocument();
    expect(within(evidence).getByText("230")).toBeInTheDocument();
    expect(within(evidence).getByText("45.1%")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View related incident 1" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/incidents/${INCIDENT_ID}`
    );
    expect(screen.getByText("deploy-42")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View analytics bundle" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/analytics/bundles/77777777-7777-4777-8777-777777777777`
    );
    expect(screen.queryByText("must-not-render")).not.toBeInTheDocument();
    expect(screen.queryByText("secret_payload")).not.toBeInTheDocument();
    expect(
      state
        .requestedUrls()
        .some(
          (url) =>
            url.includes(`/v1/analytics/opportunities/${OPPORTUNITY_ID}?`) &&
            url.includes(`project_id=${PROJECT_ID}`)
        )
    ).toBe(true);
  });

  it("retries a failed opportunity detail read", async () => {
    const user = userEvent.setup();
    installOpportunityDetailFetch(true);

    render(
      <App initialEntries={[`/projects/${PROJECT_ID}/analytics/opportunities/${OPPORTUNITY_ID}`]} />
    );

    expect(await screen.findByText(/could not load analytics opportunity/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry analytics opportunity" }));
    expect(await screen.findByRole("region", { name: "Aggregate evidence" })).toBeInTheDocument();
  });

  it("renders bounded route-loop evidence", async () => {
    installOpportunityDetailFetch(false, {
      thresholds: {
        min_loop_transitions: 20,
        min_unique_sessions: 10,
        min_reverse_transitions: 5
      },
      from_route_key: "/account",
      to_route_key: "/settings",
      forward_transition_count: 31,
      reverse_transition_count: 19,
      total_loop_transitions: 50,
      unique_sessions: 24
    });

    render(
      <App initialEntries={[`/projects/${PROJECT_ID}/analytics/opportunities/${OPPORTUNITY_ID}`]} />
    );

    const evidence = await screen.findByRole("region", { name: "Aggregate evidence" });
    expect(within(evidence).getByText("/account")).toBeInTheDocument();
    expect(within(evidence).getByText("/settings")).toBeInTheDocument();
    expect(within(evidence).getByText("50")).toBeInTheDocument();
    expect(within(evidence).getByText("Minimum reverse transitions")).toBeInTheDocument();
  });

  it("renders only fixed marker evidence fields", async () => {
    installOpportunityDetailFetch(false, {
      thresholds: { min_events: 20, min_unique_sessions: 10 },
      marker_key: "friction.repeated_click",
      route_key: "/checkout",
      event_count: 44,
      unique_sessions: 18,
      target_text: "must-not-render"
    });

    render(
      <App initialEntries={[`/projects/${PROJECT_ID}/analytics/opportunities/${OPPORTUNITY_ID}`]} />
    );

    const evidence = await screen.findByRole("region", { name: "Aggregate evidence" });
    expect(within(evidence).getByText("friction.repeated_click")).toBeInTheDocument();
    expect(within(evidence).getByText("/checkout")).toBeInTheDocument();
    expect(within(evidence).getByText("44")).toBeInTheDocument();
    expect(within(evidence).getByText("Minimum events")).toBeInTheDocument();
    expect(screen.queryByText("must-not-render")).not.toBeInTheDocument();
  });
});
