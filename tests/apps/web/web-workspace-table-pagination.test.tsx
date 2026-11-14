// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { getLocalDayWindow } from "../../../apps/web/src/lib/incidents-today.js";
import { chooseSelectOption } from "./helpers/management-ui.js";
import {
  createIncident,
  createProject,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

const inventories = [
  { route: "/incidents", endpoint: "/v1/incidents", key: "incidents", title: "Incident inventory" },
  {
    route: "/improvements",
    endpoint: "/v1/improvements",
    key: "improvements",
    title: "Improvement inventory"
  },
  {
    route: "/analytics/workspace",
    endpoint: "/v1/analytics/opportunities",
    key: "opportunities",
    title: "Analytics opportunities"
  },
  {
    route: "/analytics/workspace/bundles",
    endpoint: "/v1/analytics/bundles",
    key: "bundles",
    title: "Generated analytics bundles"
  }
] as const;

const at = "2026-11-12T10:00:00.000Z";
function inventoryRow(key: string) {
  return {
    ...createIncident(),
    title: "Saved inventory item",
    improvement_id: "imp_123",
    opportunity_id: "22222222-2222-4222-8222-222222222222",
    generation_id: "33333333-3333-4333-8333-333333333333",
    project_slug: "main-app",
    service: "web",
    service_runtime: "node",
    service_framework: "fastify",
    kind: "route_loop",
    summary: "Saved aggregate signal",
    confidence: 0.8,
    evidence: {},
    related_incident_ids: [],
    first_detected_at: at,
    last_detected_at: at,
    snoozed_until: null,
    bundle_status: "completed",
    bundle_generation_number: 1,
    bundle_created_at: at,
    bundle_updated_at: at,
    bundle_failure_reason: null,
    analysis_kind: "usage_summary",
    analysis_spec: {},
    input_fingerprint: "sha256:" + "a".repeat(64),
    status: key === "bundles" ? "completed" : "open",
    has_artifact: true,
    failure_reason: null,
    created_at: at,
    claimed_at: at,
    completed_at: at,
    updated_at: at
  };
}

function sessionResponse(url: URL): Response | null {
  if (url.pathname === "/v1/auth/session")
    return jsonResponse(200, { session: createSession({ organization_plan: "team" }) });
  if (url.pathname === "/v1/projects")
    return jsonResponse(200, { projects: [createProject({ organization_plan: "team" })] });
  return null;
}

afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

it.each(inventories)(
  "uses the shared footer, stable totals and single-page hiding on $route",
  async ({ route, endpoint, key, title }) => {
    let count = 61;
    const requests: URLSearchParams[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = new URL(requestUrl(input), "http://localhost");
        const common = sessionResponse(url);
        if (common) return common;
        if (url.pathname === endpoint) {
          const query = url.searchParams;
          requests.push(query);
          return jsonResponse(200, {
            [key]: [inventoryRow(key)],
            next_cursor: count > Number(query.get("limit")) ? "next" : null,
            ...(query.has("cursor")
              ? {}
              : { total_count: count, total_pages: Math.ceil(count / Number(query.get("limit"))) })
          });
        }
        return jsonResponse(404, { error: "not_found" });
      })
    );
    const user = userEvent.setup();
    render(<App initialEntries={[route]} />);
    await screen.findByRole("heading", { name: `${title} (61)` });
    const select = screen.getByRole("combobox", { name: `${title} rows per page` });
    const footer = select.closest('[data-slot="card-footer"]') as HTMLElement;
    expect(footer).toHaveClass("flex-col", "sm:flex-row");
    expect(
      screen.getByRole("table").compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    if (key === "improvements") {
      const hint = screen.getByText("Select improvements on this page to apply a bulk action.");
      expect(
        hint.compareDocumentPosition(
          screen.getByRole("button", { name: "Select all visible improvements" })
        ) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
    expect(within(footer).getByText("Page 1 of 4")).toBeInTheDocument();
    await user.click(within(footer).getByRole("button", { name: "Go to next page" }));
    await screen.findByText("Page 2 of 4");
    expect(screen.getByRole("heading", { name: `${title} (61)` })).toBeInTheDocument();
    await chooseSelectOption(user, `${title} rows per page`, "50");
    await screen.findByText("Page 1 of 2");
    expect(requests.at(-1)?.get("limit")).toBe("50");
    expect(requests.at(-1)?.has("cursor")).toBe(false);
    count = 1;
    await user.click(screen.getAllByRole("button", { name: "Refresh" })[0]!);
    await screen.findByRole("heading", { name: `${title} (1)` });
    expect(within(footer).queryByRole("navigation")).toBeNull();
  }
);

it("pages dashboard incidents today at the selected size with an exact matching count", async () => {
  const today = getLocalDayWindow();
  const timestamp = new Date(today.startsAtMs + 1000).toISOString();
  const incidents = Array.from({ length: 12 }, (_, index) =>
    createIncident({
      incident_id: `today-${index}`,
      title: `Today incident ${index}`,
      first_seen_at: timestamp,
      last_seen_at: timestamp
    })
  );
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = new URL(requestUrl(input), "http://localhost");
      return (
        sessionResponse(url) ??
        (url.pathname === "/v1/incidents"
          ? jsonResponse(200, { incidents, next_cursor: null })
          : jsonResponse(404, { error: "not_found" }))
      );
    })
  );
  const user = userEvent.setup();
  render(<App initialEntries={["/dashboard"]} />);
  await screen.findByRole("heading", { name: "Incidents today (12)" });
  const select = screen.getByRole("combobox", { name: "Incidents today rows per page" });
  const card = select.closest('[data-slot="card"]') as HTMLElement;
  expect(within(card).getAllByRole("row")).toHaveLength(11);
  await chooseSelectOption(user, "Incidents today rows per page", "20");
  await waitFor(() => expect(within(card).getAllByRole("row")).toHaveLength(13));
  expect(within(card).queryByRole("navigation")).toBeNull();
});
