// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const GENERATION_ID = "77777777-7777-4777-8777-777777777777";
const INCIDENT_ID = "66666666-6666-4666-8666-666666666666";

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

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

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

function installCreateFetch(
  input: {
    createStatus?: number;
    createBody?: Record<string, unknown>;
    includeGenerationHeader?: boolean;
    failIncidentsOnce?: boolean;
  } = {}
): { createBodies: () => Array<Record<string, unknown>> } {
  const createBodies: Array<Record<string, unknown>> = [];
  let incidentRequests = 0;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(request);
      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: "team" }) });
      }
      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ project_id: PROJECT_ID, organization_plan: "team" })]
        });
      }
      if (url.endsWith(`/v1/projects/${PROJECT_ID}/analytics-settings`)) {
        return jsonResponse(200, {
          access_mode: "manage",
          analytics_available: true,
          settings: analyticsSettings
        });
      }
      if (url.includes("/v1/incidents?")) {
        incidentRequests += 1;
        if (input.failIncidentsOnce && incidentRequests === 1) {
          return jsonResponse(503, { error: "unavailable" });
        }
        return jsonResponse(200, {
          incidents: [
            {
              incident_id: INCIDENT_ID,
              project_id: PROJECT_ID,
              project_name: "Main App",
              project_color_tag: null,
              service_id: "web",
              service_name: "Web",
              latest_deployment_id: "deploy-42",
              environment: "production",
              fingerprint: "fingerprint",
              fingerprint_version: "v1",
              title: "Checkout API errors",
              severity: "high",
              status: "open",
              first_seen_at: "2026-07-01T00:00:00.000Z",
              last_seen_at: "2026-07-10T00:00:00.000Z",
              occurrence_count: 12,
              spike_detected_at: null,
              regressed_at: null,
              matched_fields: []
            }
          ],
          next_cursor: null
        });
      }
      if (url.endsWith("/v1/analytics/bundles") && init?.method === "POST") {
        createBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        const headers = new Headers({ "Content-Type": "application/json" });
        if (input.includeGenerationHeader ?? true) {
          headers.set("X-DebugBundle-Generation-Id", GENERATION_ID);
        }
        return new Response(
          JSON.stringify(
            input.createBody ?? {
              status: "pending",
              bundle_generation_id: GENERATION_ID
            }
          ),
          { status: input.createStatus ?? 200, headers }
        );
      }
      if (url.includes(`/v1/analytics/bundles/${GENERATION_ID}?`)) {
        return jsonResponse(
          200,
          input.createBody?.["status"] === "failed"
            ? input.createBody
            : { status: "pending", bundle_generation_id: GENERATION_ID }
        );
      }
      return jsonResponse(404, { error: "not_found" });
    })
  );

  return { createBodies: () => createBodies };
}

describe("web app - project AnalyticsBundle generation", () => {
  it("submits a bounded funnel analysis and opens its generation detail", async () => {
    const user = userEvent.setup();
    const state = installCreateFetch();
    render(<App initialEntries={[`/projects/${PROJECT_ID}/analytics/bundles/new`]} />);

    expect(
      await screen.findByRole("heading", { name: "Generate AnalyticsBundle" })
    ).toBeInTheDocument();
    await chooseSelectOption(user, "Analysis kind", "Funnel Dropoff");
    await user.type(screen.getByLabelText("Funnel key"), "checkout");
    await user.type(screen.getByLabelText("Service"), "storefront");
    await user.type(screen.getByLabelText("Environment"), "production");
    await user.click(screen.getByRole("button", { name: "Generate AnalyticsBundle" }));

    expect(await screen.findByText("Processing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to AnalyticsBundles" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/analytics/bundles`
    );
    expect(state.createBodies()).toEqual([
      {
        project_id: PROJECT_ID,
        analysis_kind: "funnel_dropoff",
        last: "30d",
        funnel: "checkout",
        filters: { service: "storefront", environment: "production" }
      }
    ]);
  });

  it("validates a custom route window before submitting normalized dates", async () => {
    const user = userEvent.setup();
    const state = installCreateFetch();
    render(<App initialEntries={[`/projects/${PROJECT_ID}/analytics/bundles/new`]} />);

    await screen.findByRole("heading", { name: "Generate AnalyticsBundle" });
    await chooseSelectOption(user, "Analysis kind", "Route Health");
    await chooseSelectOption(user, "Time window", "Custom range");
    await user.type(screen.getByLabelText("From"), "2026-07-01");
    await user.type(screen.getByLabelText("To"), "2026-07-10");
    await user.type(screen.getByLabelText("Route"), "/checkout?step=payment");
    await user.click(screen.getByRole("button", { name: "Generate AnalyticsBundle" }));

    expect(
      screen.getByText(/route must not contain query strings or fragments/i)
    ).toBeInTheDocument();
    expect(state.createBodies()).toHaveLength(0);

    await user.clear(screen.getByLabelText("Route"));
    await user.type(screen.getByLabelText("Route"), "/checkout");
    await user.click(screen.getByRole("button", { name: "Generate AnalyticsBundle" }));
    await waitFor(() => expect(state.createBodies()).toHaveLength(1));
    expect(state.createBodies()[0]).toMatchObject({
      analysis_kind: "route_health",
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-10T23:59:59.999Z",
      route: "/checkout"
    });
    expect(state.createBodies()[0]).not.toHaveProperty("last");
  });

  it("offers accessible project incidents for incident-impact analysis", async () => {
    const user = userEvent.setup();
    const state = installCreateFetch();
    render(<App initialEntries={[`/projects/${PROJECT_ID}/analytics/bundles/new`]} />);

    await screen.findByRole("heading", { name: "Generate AnalyticsBundle" });
    await chooseSelectOption(user, "Analysis kind", "Incident Impact");
    await chooseSelectOption(user, "Incident", "Checkout API errors");
    await user.click(screen.getByRole("button", { name: "Generate AnalyticsBundle" }));

    await waitFor(() => expect(state.createBodies()).toHaveLength(1));
    expect(state.createBodies()[0]).toMatchObject({
      analysis_kind: "incident_impact",
      incident_id: INCIDENT_ID
    });
  });

  it("retries a failed incident-context read", async () => {
    const user = userEvent.setup();
    installCreateFetch({ failIncidentsOnce: true });
    render(<App initialEntries={[`/projects/${PROJECT_ID}/analytics/bundles/new`]} />);

    await screen.findByRole("heading", { name: "Generate AnalyticsBundle" });
    await chooseSelectOption(user, "Analysis kind", "Incident Impact");
    expect(await screen.findByText("Could not load project incidents")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry incidents" }));
    await waitFor(() => expect(screen.getByLabelText("Incident")).toBeEnabled());
  });

  it("routes an immediately failed generation by canonical response metadata", async () => {
    const user = userEvent.setup();
    installCreateFetch({
      createBody: { status: "failed", reason: "monthly_quota_exceeded" }
    });
    render(<App initialEntries={[`/projects/${PROJECT_ID}/analytics/bundles/new`]} />);

    await screen.findByRole("heading", { name: "Generate AnalyticsBundle" });
    await user.click(screen.getByRole("button", { name: "Generate AnalyticsBundle" }));

    expect(await screen.findByText("Generation failed")).toBeInTheDocument();
    expect(screen.getByText("Monthly Quota Exceeded")).toBeInTheDocument();
  });

  it("keeps entered values visible when the generation allowance is exhausted", async () => {
    const user = userEvent.setup();
    installCreateFetch({
      createStatus: 429,
      createBody: { error: "analytics_quota_exceeded" },
      includeGenerationHeader: false
    });
    render(<App initialEntries={[`/projects/${PROJECT_ID}/analytics/bundles/new`]} />);

    await screen.findByRole("heading", { name: "Generate AnalyticsBundle" });
    await user.type(screen.getByLabelText("Service"), "storefront");
    await user.click(screen.getByRole("button", { name: "Generate AnalyticsBundle" }));

    expect(await screen.findByText("AnalyticsBundle limit reached")).toBeInTheDocument();
    expect(screen.getByLabelText("Service")).toHaveValue("storefront");
  });
});
