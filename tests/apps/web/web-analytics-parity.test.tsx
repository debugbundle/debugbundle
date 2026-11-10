// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { createAnalyticsFilterOptions } from "../../helpers/analytics-filter-options.js";
import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";
import { chooseSelectOption } from "./helpers/management-ui.js";
const projectId = "11111111-1111-4111-8111-111111111111";
const sampleId = "22222222-2222-4222-8222-222222222222";
const settings = {
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
  max_custom_dimensions: 8,
  approved_custom_dimensions: ["plan"]
};
const window = {
  project_id: projectId,
  from: "2026-10-01T00:00:00.000Z",
  to: "2026-10-07T00:00:00.000Z",
  granularity: "day",
  service: null,
  environment: null
};
afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});
function setup(actionsFailOnce = false, emptyActions = false) {
  let actionRequests = 0;
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      requests.push(url);
      if (url.endsWith("/auth/session"))
        return jsonResponse(200, { session: createSession({ organization_plan: "team" }) });
      if (url.endsWith("/projects"))
        return jsonResponse(200, {
          projects: [createProject({ project_id: projectId, organization_plan: "team" })]
        });
      if (url.endsWith("/analytics-settings"))
        return jsonResponse(200, { access_mode: "manage", analytics_available: true, settings });
      if (url.includes("/analytics/filter-options?")) {
        const response = createAnalyticsFilterOptions(projectId);
        const params = new URL(url, "http://localhost").searchParams;
        Object.assign(response.window, {
          from: params.get("from") ?? response.window.from,
          to: params.get("to") ?? response.window.to,
          granularity: params.get("granularity") ?? "day",
          service: params.get("service"),
          environment: params.get("environment")
        });
        return jsonResponse(200, response);
      }
      if (url.includes("/analytics/bundles?"))
        return jsonResponse(200, { bundles: [], next_cursor: null, total_pages: 1 });
      if (url.includes("/analytics/opportunities?"))
        return jsonResponse(200, { opportunities: [], next_cursor: null, total_pages: 1 });
      if (url.includes("/analytics/actions?")) {
        actionRequests += 1;
        if (actionsFailOnce && actionRequests === 1)
          return jsonResponse(503, { error: "unavailable" });
        return jsonResponse(200, {
          window,
          actions: emptyActions
            ? []
            : [
                {
                  action_key: "checkout.submit",
                  kind: "conversion",
                  event_count: 5,
                  unique_sessions: 3
                }
              ]
        });
      }
      if (url.includes("/analytics/journey-patterns?"))
        return jsonResponse(200, { window, patterns: [] });
      if (url.includes("/analytics/journey-samples?"))
        return jsonResponse(200, {
          samples: [
            {
              sample_id: sampleId,
              project_id: projectId,
              service: "web",
              environment: "production",
              session_id_hash: "a".repeat(64),
              visitor_id_hash: null,
              analysis_tags: ["loop"],
              first_seen_at: "2026-10-07T00:00:00.000Z",
              last_seen_at: "2026-10-07T00:01:00.000Z",
              dimensions_summary: {},
              has_artifact: true,
              expires_at: "2026-11-07T00:00:00.000Z",
              created_at: "2026-10-07T00:00:00.000Z"
            }
          ],
          next_cursor: url.includes("cursor=") ? null : "next-sample"
        });
      return jsonResponse(404, { error: "not_found" });
    })
  );
  return requests;
}
it("adds action metrics within existing analytics navigation", async () => {
  const requests = setup();
  render(<App initialEntries={[`/projects/${projectId}/analytics/actions`]} />);
  expect(await screen.findByRole("tab", { name: "Actions" })).toHaveAttribute(
    "data-state",
    "active"
  );
  expect(await screen.findByText("checkout.submit")).toBeInTheDocument();
  expect(screen.getByText("Conversion")).toBeInTheDocument();
  expect(requests.some((url) => url.includes("/analytics/actions?"))).toBe(true);
});
it.each(["Opportunities", "Bundles"])(
  "keeps metrics-only filters out of the %s inventory without losing metric choices",
  async (section) => {
    const requests = setup();
    const user = userEvent.setup();
    render(<App initialEntries={[`/projects/${projectId}/analytics/actions`]} />);
    await screen.findByText("checkout.submit");
    await user.click(screen.getByRole("button", { name: "More filters" }));
    await waitFor(() => expect(screen.getByLabelText("Device type")).toBeEnabled());
    await chooseSelectOption(user, "Device type", "Mobile");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(requests.at(-1)).toContain("device_type=mobile"));
    await user.click(
      within(screen.getByRole("tablist", { name: "Analytics sections" })).getByRole("tab", {
        name: section
      })
    );
    await screen.findByRole("heading", {
      name: section === "Bundles" ? "Generated analytics bundles" : "Analytics opportunities"
    });
    expect(screen.queryByRole("button", { name: "Remove Device type: Mobile filter" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "More filters" }));
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByLabelText("Service")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Environment")).toBeInTheDocument();
    expect(within(panel).queryByLabelText("Device type")).toBeNull();
    expect(within(panel).queryByLabelText("Metric limit")).toBeNull();
    await user.click(within(panel).getByRole("button", { name: /^Reset( filters)?$/ }));
    if (section === "Bundles") {
      await user.click(screen.getByRole("link", { name: "Generate analytics bundle" }));
      const formDialog = await screen.findByRole("dialog", { name: "Generate analytics bundle" });
      expect(within(formDialog).getByLabelText("Additional filters (JSON)")).toHaveValue("");
      await user.click(within(formDialog).getByRole("button", { name: "Cancel" }));
    }
    await user.click(
      within(screen.getByRole("tablist", { name: "Analytics sections" })).getByRole("tab", {
        name: "Actions"
      })
    );
    await screen.findByText("checkout.submit");
    expect(
      screen.getByRole("button", { name: "Remove Device type: Mobile filter" })
    ).toBeInTheDocument();
    await waitFor(() => expect(requests.at(-1)).toContain("device_type=mobile"));
  }
);
it("applies custom UTC windows, hourly granularity and all supported dimension filters to metric requests", async () => {
  const requests = setup();
  const user = userEvent.setup();
  render(<App initialEntries={[`/projects/${projectId}/analytics/actions`]} />);
  await screen.findByText("checkout.submit");
  await chooseSelectOption(user, "Time window", "Custom range");
  fireEvent.change(screen.getByLabelText("From (UTC)"), { target: { value: window.from } });
  fireEvent.change(screen.getByLabelText("To (UTC)"), { target: { value: window.to } });
  await user.click(screen.getByRole("button", { name: "Apply time window" }));
  await user.click(screen.getByRole("button", { name: /^More filters/ }));
  const panel = screen.getByRole("dialog");
  await waitFor(() => expect(screen.getByLabelText("Device type")).toBeEnabled());
  for (const [label, value] of Object.entries({
    Route: "/checkout",
    "Device type": "Mobile",
    "Operating system": "Linux",
    Language: "sl",
    Referrer: "direct",
    "UTM source": "mail",
    "UTM medium": "email",
    "UTM campaign": "launch"
  }))
    await chooseSelectOption(user, label, value);
  fireEvent.change(within(panel).getByLabelText("Metric limit"), { target: { value: "50" } });
  await chooseSelectOption(user, "Authentication state", "Authenticated");
  await chooseSelectOption(user, "Browser", "Firefox");
  await chooseSelectOption(user, "Country", "SI");
  await chooseSelectOption(user, "Custom dimension: plan", "team");
  await chooseSelectOption(user, "Granularity", "Hourly");
  await user.click(within(panel).getByRole("button", { name: "Apply filters" }));
  await waitFor(() => expect(requests.at(-1)).toContain("browser=Firefox"));
  const params = new URL(requests.at(-1)!, "https://example.com").searchParams;
  expect(params.get("from")).toBe(window.from);
  expect(params.get("to")).toBe(window.to);
  expect(params.has("last")).toBe(false);
  expect(params.get("granularity")).toBe("hour");
  expect(params.get("country")).toBe("SI");
  expect(params.get("custom_dimension.plan")).toBe("team");
  expect(params.get("route")).toBe("/checkout");
  expect(params.get("device_type")).toBe("mobile");
  expect(params.get("os")).toBe("Linux");
  expect(params.get("language")).toBe("sl");
  expect(params.get("referrer")).toBe("direct");
  expect(params.get("auth_state")).toBe("authenticated");
  expect(
    screen.getByRole("button", { name: "Remove Authentication state: Authenticated filter" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Remove Device type: Mobile filter" })
  ).toBeInTheDocument();
  expect(params.get("utm_source")).toBe("mail");
  expect(params.get("utm_medium")).toBe("email");
  expect(params.get("utm_campaign")).toBe("launch");
  expect(params.get("limit")).toBe("50");
  await user.click(screen.getByRole("button", { name: /^More filters/ }));
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: /^Reset( filters)?$/ })
  );
  await waitFor(() =>
    expect(new URL(requests.at(-1)!, "https://example.com").searchParams.has("browser")).toBe(false)
  );
  const reset = new URL(requests.at(-1)!, "https://example.com").searchParams;
  expect(reset.get("from")).toBe(window.from);
  expect(reset.get("to")).toBe(window.to);
  expect(reset.get("granularity")).toBe("day");
  expect(reset.has("custom_dimension.plan")).toBe(false);
});
it("lists retained journey samples independently of aggregate pattern selection and follows cursors", async () => {
  const requests = setup();
  const user = userEvent.setup();
  render(<App initialEntries={[`/projects/${projectId}/analytics/journeys`]} />);
  expect(await screen.findByRole("link", { name: `Inspect sample ${sampleId}` })).toHaveAttribute(
    "href",
    `/projects/${projectId}/analytics/journeys/${sampleId}`
  );
  await user.click(screen.getByRole("button", { name: "Next samples" }));
  await waitFor(() =>
    expect(requests.some((url) => url.includes("cursor=next-sample"))).toBe(true)
  );
  await user.click(screen.getByRole("button", { name: "Previous samples" }));
  await waitFor(() => expect(requests.at(-1)).not.toContain("cursor="));
  fireEvent.change(screen.getByLabelText("Sample page limit"), { target: { value: "100" } });
  await user.click(screen.getByRole("button", { name: "Apply sample page limit" }));
  await waitFor(() => expect(requests.at(-1)).toContain("limit=100"));
  fireEvent.change(screen.getByLabelText("Sample tag"), { target: { value: "loop" } });
  await user.click(screen.getByRole("button", { name: "Apply sample tag" }));
  await waitFor(() => expect(requests.at(-1)).toContain("tag=loop"));
  expect(requests.at(-1)).not.toContain("cursor=");
});

it("uses inventory kind/status controls and bounded page limits within the applied time window", async () => {
  const requests = setup();
  const user = userEvent.setup();
  render(<App initialEntries={[`/projects/${projectId}/analytics/bundles`]} />);
  await screen.findByRole("heading", { name: "Generated analytics bundles" });
  await chooseSelectOption(user, "Time window", "Custom range");
  fireEvent.change(screen.getByLabelText("From (UTC)"), { target: { value: window.from } });
  fireEvent.change(screen.getByLabelText("To (UTC)"), { target: { value: window.to } });
  await user.click(screen.getByRole("button", { name: "Apply time window" }));
  await user.click(screen.getByRole("button", { name: "Filters" }));
  await chooseSelectOption(user, "Status", "Failed");
  await chooseSelectOption(user, "Analysis kind", "Route health");
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Apply filters" })
  );
  await waitFor(() => expect(requests.some((url) => url.includes("status=failed"))).toBe(true));
  fireEvent.change(screen.getByLabelText("Inventory page limit"), { target: { value: "100" } });
  await user.click(screen.getByRole("button", { name: "Apply inventory page limit" }));
  await waitFor(() => expect(requests.at(-1)).toContain("limit=100"));
  const params = new URL(requests.at(-1)!, "https://example.com").searchParams;
  expect(params.get("kind")).toBe("route_health");
  expect(params.get("from")).toBe(window.from);
  expect(params.get("to")).toBe(window.to);
});

it("retries unavailable action metrics and presents an explicit empty result", async () => {
  setup(true, true);
  const user = userEvent.setup();
  render(<App initialEntries={[`/projects/${projectId}/analytics/actions`]} />);
  await user.click(await screen.findByRole("button", { name: "Retry action metrics" }));
  expect(await screen.findByText("No action activity in this window")).toBeInTheDocument();
});
