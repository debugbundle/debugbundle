// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import {
  createIncident,
  createProject,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";
import { chooseSelectOption } from "./helpers/management-ui.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

describe("project inventory", () => {
  it("shows incident inventory from the signed-in incidents route and exposes the sidebar entry", async () => {
    const user = userEvent.setup();
    const anomalyIncident = createIncident({
      title: "Request anomaly: GET /checkout/:orderId returned 404 repeatedly",
      matched_fields: ["request_anomaly", "route_template", "http_method", "http_status"]
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/incidents?limit=20&status=active") && init?.method === undefined) {
        return jsonResponse(200, {
          incidents: [anomalyIncident],
          next_cursor: null
        });
      }

      if (url.endsWith("/v1/incidents?limit=20") && init?.method === undefined) {
        return jsonResponse(200, {
          incidents: [
            createIncident(),
            createIncident({
              incident_id: "inc_456",
              title: "Database timeout during signin",
              severity: "critical",
              status: "regressed",
              service_name: "worker-api",
              occurrence_count: 19,
              regressed_at: "2026-03-17T00:06:00.000Z"
            })
          ],
          next_cursor: "cursor_2"
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/incidents"]} />);

    expect(
      await screen.findByRole("heading", { name: /incidents/i, level: 1 })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /incidents/i })).toHaveAttribute("href", "/incidents");
    expect(screen.getByRole("combobox", { name: /status/i })).toHaveTextContent(
      /^needs attention$/i
    );
    expect(
      await screen.findByText(/request anomaly: get \/checkout\/:orderid returned 404 repeatedly/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/database timeout during signin/i)).toBeNull();
    expect((await screen.findAllByRole("link", { name: /main app/i })).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/^checkout-api$/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^proj_123$/i)).toBeNull();
    expect(screen.queryByText(/^svc_123$/i)).toBeNull();
    expect(screen.getByText(/^high$/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Request anomaly threshold crossed. Grouped by route template, HTTP method, and HTTP status."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/request_anomaly, route_template, http_method, http_status/i)
    ).toBeNull();
    const incidentTable = screen.getByRole("table");
    expect(within(incidentTable).getByText(/^open$/i)).toBeInTheDocument();
    expect(screen.getByText(/7 occurrences/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /previous/i })).toBeNull();

    const brandLink = screen.getByRole("link", { name: /^debugbundle$/i });
    expect(brandLink).toHaveClass("group-data-[collapsible=icon]:!p-1.5");

    await user.click(screen.getByRole("button", { name: /toggle sidebar/i }));

    expect(document.querySelector('[data-slot="sidebar"][data-state="collapsed"]')).not.toBeNull();

    await chooseSelectOption(user, /status/i, /all statuses/i);
    expect(await screen.findByText(/database timeout during signin/i)).toBeInTheDocument();
    expect(screen.getByText(/^critical$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
    expect(incidentTable.className.includes("min-w-[980px]")).toBe(true);
  });

  it("sorts the projects inventory by bundle requests", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [
            createProject({
              name: "Zeta App",
              slug: "zeta-app",
              color_tag: "lime",
              metrics: {
                monthly_bundle_requests: 4,
                monthly_raw_ingested_events: 40,
                retained_bundles: 2,
                monthly_alert_deliveries: 1
              }
            }),
            createProject({
              project_id: "proj_456",
              name: "Alpha App",
              slug: "alpha-app",
              metrics: {
                monthly_bundle_requests: 12,
                monthly_raw_ingested_events: 120,
                retained_bundles: 6,
                monthly_alert_deliveries: 3
              }
            })
          ]
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects"]} />);

    expect(await screen.findByRole("heading", { name: /projects/i, level: 1 })).toBeInTheDocument();
    expect(await screen.findByText(/zeta app/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^plan$/i })).toBeNull();
    await user.click(screen.getByRole("button", { name: /bundle requests/i }));
    await user.click(screen.getByRole("button", { name: /bundle requests/i }));

    const rows = screen.getAllByRole("row");
    expect(within(rows[1] as HTMLTableRowElement).getByText(/alpha app/i)).toBeInTheDocument();
    expect(document.querySelector('[data-project-color-tag="lime"]')).not.toBeNull();

    const tableContainer = screen.getByRole("table").parentElement;
    expect(tableContainer).not.toBeNull();
    expect((tableContainer as HTMLDivElement).className.includes("rounded-lg")).toBe(true);
    expect((tableContainer as HTMLDivElement).className.includes("border")).toBe(true);
  });

  it("shows the reusable empty list state when no incidents are available", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ role: "member" })
        });
      }

      if (url.endsWith("/v1/incidents?limit=20&status=active") && init?.method === undefined) {
        return jsonResponse(200, {
          incidents: [],
          next_cursor: null
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/incidents"]} />);

    expect(
      await screen.findByRole("heading", { name: /incidents/i, level: 1 })
    ).toBeInTheDocument();
    expect(await screen.findByText(/no incidents need attention/i)).toBeInTheDocument();
    expect(screen.getByText(/open and regressed incidents will appear here/i)).toBeInTheDocument();
  });

  it("shows every project incident empty state when the scoped status filter changes", async () => {
    const user = userEvent.setup();
    const project = createProject();

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }

      if (url.includes(`/v1/incidents?project_id=${project.project_id}&limit=20`)) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}/incidents`]} />);

    const statusFilter = await screen.findByRole("combobox", { name: /status/i });
    expect(
      await screen.findByText(/no incidents need attention for this project/i)
    ).toBeInTheDocument();
    expect(statusFilter).toHaveTextContent(/^needs attention$/i);

    await chooseSelectOption(user, /status/i, /^resolved$/i);
    expect(await screen.findByText(/no resolved incidents for this project/i)).toBeInTheDocument();

    await chooseSelectOption(user, /status/i, /^regressed$/i);
    expect(await screen.findByText(/no regressed incidents for this project/i)).toBeInTheDocument();

    await chooseSelectOption(user, /status/i, /all statuses/i);
    expect(await screen.findByText(/no incidents for this project/i)).toBeInTheDocument();
  });

  it("shows every project bundle empty state when the scoped status filter changes", async () => {
    const user = userEvent.setup();
    const project = createProject();

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }

      if (url.includes(`/v1/incidents?project_id=${project.project_id}&limit=20`)) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}/bundles`]} />);

    const statusFilter = await screen.findByRole("combobox", { name: /status/i });
    expect(await screen.findByText(/no bundles need attention/i)).toBeInTheDocument();
    expect(statusFilter).toHaveTextContent(/^needs attention$/i);

    await chooseSelectOption(user, /status/i, /^resolved$/i);
    expect(await screen.findByText(/no bundles for resolved incidents/i)).toBeInTheDocument();

    await chooseSelectOption(user, /status/i, /^regressed$/i);
    expect(await screen.findByText(/no bundles for regressed incidents/i)).toBeInTheDocument();

    await chooseSelectOption(user, /status/i, /all statuses/i);
    expect(await screen.findByText(/no bundles available/i)).toBeInTheDocument();
  });

  it("does not download a bundle artifact when the bundle is pending, failed, or unavailable", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const incident = createIncident({ project_id: project.project_id });
    const createObjectUrlMock = vi.fn(() => "blob:test-url");
    const revokeObjectUrlMock = vi.fn();
    let bundleAttempt = 0;

    vi.stubGlobal("URL", {
      createObjectURL: createObjectUrlMock,
      revokeObjectURL: revokeObjectUrlMock
    });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }

      if (url.includes(`/v1/incidents?project_id=${project.project_id}&limit=20&status=active`)) {
        return jsonResponse(200, { incidents: [incident], next_cursor: null });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/bundle`)) {
        bundleAttempt += 1;
        if (bundleAttempt === 1) {
          return jsonResponse(200, { status: "pending" });
        }
        if (bundleAttempt === 2) {
          return jsonResponse(200, { status: "failed" });
        }
        return Promise.reject(new Error("network_down"));
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}/bundles`]} />);

    const incidentRow = (
      await screen.findByRole("link", { name: /typeerror in checkout handler/i })
    ).closest("tr");
    expect(incidentRow).not.toBeNull();
    const rowButtons = within(incidentRow as HTMLTableRowElement).getAllByRole("button");
    expect(rowButtons.length).toBeGreaterThan(0);

    await user.click(rowButtons[0] as HTMLButtonElement);
    await user.click(rowButtons[0] as HTMLButtonElement);
    await user.click(rowButtons[0] as HTMLButtonElement);

    await waitFor(() => {
      expect(bundleAttempt).toBe(3);
    });
    expect(createObjectUrlMock).not.toHaveBeenCalled();
    expect(revokeObjectUrlMock).not.toHaveBeenCalled();
  });
});
