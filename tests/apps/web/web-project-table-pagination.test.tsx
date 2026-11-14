// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { chooseSelectOption } from "./helpers/management-ui.js";
import {
  createIncident,
  createProject,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

const inventories = [
  { route: "incidents", endpoint: "incidents", title: "Project incidents" },
  { route: "improvements", endpoint: "improvements", title: "Project improvements" },
  { route: "bundles", endpoint: "incidents", title: "Debug bundles" }
] as const;

function row(endpoint: "incidents" | "improvements", title: string) {
  if (endpoint === "incidents") return createIncident({ incident_id: title, title });
  return {
    improvement_id: title,
    project_id: "proj_123",
    project_name: "Main App",
    project_color_tag: null,
    project_slug: "main-app",
    service_id: null,
    service_name: "checkout-api",
    service_runtime: "node",
    service_framework: "fastify",
    environment: "production",
    kind: "warning_hotspot",
    status: "open",
    severity: "medium",
    confidence: 0.78,
    fingerprint: title,
    title,
    summary: "Repeated warning pattern.",
    occurrence_count: 7,
    evidence: { kind: "warning_hotspot" },
    related_incident_ids: [],
    first_detected_at: "2026-11-01T12:00:00.000Z",
    last_detected_at: "2026-11-01T12:30:00.000Z",
    resolved_at: null,
    snoozed_until: null,
    bundle_generation_number: 1,
    bundle_created_at: "2026-11-01T12:31:00.000Z",
    bundle_updated_at: "2026-11-01T12:31:00.000Z",
    bundle_failure_reason: null
  };
}

function installFetch(
  endpoint: "incidents" | "improvements",
  read: (query: URLSearchParams) => Response
) {
  const requests: URLSearchParams[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = new URL(requestUrl(input), "http://localhost");
      if (url.pathname === "/v1/auth/session")
        return jsonResponse(200, { session: createSession() });
      if (url.pathname === "/v1/projects")
        return jsonResponse(200, { projects: [createProject({ organization_plan: "team" })] });
      if (url.pathname === `/v1/${endpoint}`) {
        requests.push(url.searchParams);
        return read(url.searchParams);
      }
      return jsonResponse(404, { error: "not_found" });
    })
  );
  return requests;
}

afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

it.each(inventories)(
  "pages $route with exact title totals and resets its cursor when rows or filters change",
  async ({ route, endpoint, title }) => {
    let resolvedCount = 0;
    const requests = installFetch(endpoint, (query) => {
      const resolved = query.get("status") === "resolved";
      const cursor = query.get("cursor");
      const count = resolved ? resolvedCount : 61;
      return jsonResponse(200, {
        [endpoint]:
          resolved && count === 0
            ? []
            : [row(endpoint, cursor ? "Second page item" : "First page item")],
        next_cursor: resolved ? null : cursor ? "third" : "second",
        ...(cursor
          ? {}
          : {
              total_count: count,
              total_pages: Math.max(1, Math.ceil(count / Number(query.get("limit"))))
            })
      });
    });
    const user = userEvent.setup();
    render(<App initialEntries={[`/projects/proj_123/${route}`]} />);
    await screen.findByRole("heading", { name: `${title} (61)` });
    expect(requests[0]?.get("include_total_count")).toBe("true");
    expect(requests[0]?.get("project_id")).toBe("proj_123");
    const selectName = `${title} rows per page`;
    const select = screen.getByRole("combobox", { name: selectName });
    const footer = select.closest('[data-slot="card-footer"]') as HTMLElement;
    expect(footer).toHaveClass("flex-col", "sm:flex-row");
    if (route !== "bundles") {
      const checkbox = screen.getByRole("checkbox", {
        name: /^Select (incident|improvement) First page item$/
      });
      await user.click(checkbox);
      expect(footer).toHaveClass("pb-28", "sm:pb-4");
      await user.click(checkbox);
      expect(footer).not.toHaveClass("pb-28");
    }
    const navigation = within(footer).getByRole("navigation", { name: "Pagination" });
    expect(within(navigation).getByRole("button", { name: "Go to next page" })).toHaveClass(
      "size-8",
      "sm:w-auto"
    );
    expect(navigation.parentElement).toContainElement(within(footer).getByText("Page 1 of 4"));
    expect(
      screen.getByRole("table").compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(within(footer).getByRole("button", { name: "Go to previous page" })).toBeDisabled();
    await user.click(within(footer).getByRole("button", { name: "Go to next page" }));
    await screen.findByText("Second page item");
    expect(screen.getByRole("heading", { name: `${title} (61)` })).toBeInTheDocument();
    expect(within(footer).getByText("Page 2 of 4")).toBeInTheDocument();
    expect(requests.at(-1)?.has("include_total_count")).toBe(false);
    await chooseSelectOption(user, selectName, "50");
    await screen.findByText("First page item");
    expect(within(footer).getByText("Page 1 of 2")).toBeInTheDocument();
    expect(requests.at(-1)?.get("limit")).toBe("50");
    expect(requests.at(-1)?.has("cursor")).toBe(false);
    expect(requests.at(-1)?.get("include_total_count")).toBe("true");
    expect(select).toHaveTextContent("50");
    await chooseSelectOption(user, /^Status/, "Resolved");
    await screen.findByRole("heading", { name: `${title} (0)` });
    expect(within(footer).queryByText("Page 1 of 1")).toBeNull();
    expect(within(footer).queryByRole("navigation")).toBeNull();
    expect(requests.at(-1)?.get("limit")).toBe("50");
    resolvedCount = 1;
    await user.click(screen.getAllByRole("button", { name: "Refresh" })[0]!);
    await screen.findByRole("heading", { name: `${title} (1)` });
  }
);

it.each(inventories)(
  "omits unknown and failed totals for $route instead of counting a partial page",
  async ({ route, endpoint, title }) => {
    let failed = false;
    installFetch(endpoint, () =>
      failed
        ? jsonResponse(503, { error: "unavailable" })
        : jsonResponse(200, {
            [endpoint]: [row(endpoint, "Partial page item")],
            next_cursor: "second"
          })
    );
    const user = userEvent.setup();
    render(<App initialEntries={[`/projects/proj_123/${route}`]} />);
    await screen.findByText("Partial page item");
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    failed = true;
    await chooseSelectOption(user, /^Status/, "Resolved");
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: `${title} rows per page` })).toBeEnabled()
    );
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: `${title} (0)` })).toBeNull();
  }
);
