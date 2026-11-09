// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.js";
import {
  createIncident,
  createProject,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";
import {
  findStatusFilterTrigger,
  chooseStatusFilterOption,
  getPrimaryRefreshButton,
  registerIncidentTestCleanup
} from "../../helpers/web-incidents.js";

registerIncidentTestCleanup();

describe("web app — incidents", () => {
  it("renders the incidents page with project and service columns and clickable incident links", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const incidents = [
      createIncident({
        project_id: project.project_id,
        project_name: project.name,
        project_color_tag: "blue",
        service_id: "svc_123",
        service_name: "Checkout API",
        environment: "production"
      }),
      createIncident({
        incident_id: "inc_456",
        project_id: project.project_id,
        project_name: project.name,
        project_color_tag: "blue",
        title: "Database timeout during signin",
        severity: "critical",
        status: "regressed",
        service_id: "svc_456",
        service_name: "Signin Worker",
        environment: "staging",
        occurrence_count: 19
      })
    ];

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (
        url.includes("/v1/incidents?") &&
        url.includes("limit=20") &&
        url.includes("status=active") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, { incidents, next_cursor: null });
      }

      if (
        url.includes("/v1/incidents?") &&
        url.includes("limit=20") &&
        !url.includes("status=") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, { incidents, next_cursor: "cursor_2" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/incidents"]} />);

    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
    expect(await findStatusFilterTrigger("workspace-incidents-status-filter")).toHaveTextContent(
      /^needs attention$/i
    );
    expect(screen.getByText(/database timeout during signin/i)).toBeInTheDocument();

    await chooseStatusFilterOption(user, "workspace-incidents-status-filter", /all statuses/i);
    expect(await screen.findByText(/database timeout during signin/i)).toBeInTheDocument();

    // Project, service, and environment columns exist
    const projectLinks = await screen.findAllByText(/main app/i);
    expect(projectLinks.length).toBeGreaterThan(0);
    expect(await screen.findByText(/checkout api/i)).toBeInTheDocument();
    expect(await screen.findByText(/signin worker/i)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /environment/i })).toBeInTheDocument();
    expect(screen.getByText(/^production$/i)).toBeInTheDocument();
    expect(screen.getByText(/^staging$/i)).toBeInTheDocument();
    expect(document.querySelectorAll('[data-project-color-tag="blue"]').length).toBeGreaterThan(0);

    // Incident titles are clickable links
    const incidentLink = screen.getByRole("link", { name: /typeerror in checkout handler/i });
    expect(incidentLink).toHaveAttribute("href", "/incidents/inc_123");
  });

  it("pages through incident results using the next cursor controls", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const firstIncident = createIncident({
      project_id: project.project_id,
      project_name: project.name,
      title: "Alpha failure"
    });
    const secondIncident = createIncident({
      incident_id: "inc_456",
      project_id: project.project_id,
      project_name: project.name,
      title: "Zulu failure"
    });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (
        url.includes("/v1/incidents?") &&
        url.includes("limit=20") &&
        url.includes("status=active") &&
        !url.includes("cursor=") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, { incidents: [firstIncident], next_cursor: "cursor_2" });
      }

      if (
        url.includes("/v1/incidents?") &&
        url.includes("limit=20") &&
        url.includes("cursor=cursor_2") &&
        url.includes("status=active") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, { incidents: [secondIncident], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/incidents"]} />);

    expect(await screen.findByText(/alpha failure/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(await screen.findByText(/zulu failure/i)).toBeInTheDocument();
    expect(screen.queryByText(/alpha failure/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: /previous/i }));
    expect(await screen.findByText(/alpha failure/i)).toBeInTheDocument();
  });

  it("refreshes the main incidents table without reloading the page", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const initialIncident = createIncident({
      project_id: project.project_id,
      project_name: project.name,
      title: "Initial workspace incident"
    });
    const refreshedIncident = createIncident({
      incident_id: "inc_workspace_refreshed",
      project_id: project.project_id,
      project_name: project.name,
      title: "Refreshed workspace incident"
    });
    let workspaceIncidentRequests = 0;

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (
        url.includes("/v1/incidents?") &&
        url.includes("limit=20") &&
        url.includes("status=active") &&
        init?.method === undefined
      ) {
        workspaceIncidentRequests += 1;
        return jsonResponse(200, {
          incidents: workspaceIncidentRequests === 1 ? [initialIncident] : [refreshedIncident],
          next_cursor: null
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/incidents"]} />);

    expect(await screen.findByText(/initial workspace incident/i)).toBeInTheDocument();
    expect(workspaceIncidentRequests).toBe(1);

    await user.click(getPrimaryRefreshButton());

    expect(await screen.findByText(/refreshed workspace incident/i)).toBeInTheDocument();
    expect(screen.queryByText(/initial workspace incident/i)).toBeNull();
    expect(workspaceIncidentRequests).toBe(2);
  });

  it("keeps the refresh button spinning for at least one second after a workspace refresh", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const initialIncident = createIncident({
      project_id: project.project_id,
      project_name: project.name,
      title: "Initial workspace incident"
    });
    const refreshedIncident = createIncident({
      incident_id: "inc_workspace_refreshed_spin",
      project_id: project.project_id,
      project_name: project.name,
      title: "Refreshed workspace incident"
    });
    let workspaceIncidentRequests = 0;

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (
        url.includes("/v1/incidents?") &&
        url.includes("limit=20") &&
        url.includes("status=active") &&
        init?.method === undefined
      ) {
        workspaceIncidentRequests += 1;
        return jsonResponse(200, {
          incidents: workspaceIncidentRequests === 1 ? [initialIncident] : [refreshedIncident],
          next_cursor: null
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/incidents"]} />);

    expect(await screen.findByText(/initial workspace incident/i)).toBeInTheDocument();

    const refreshButton = getPrimaryRefreshButton();
    const refreshIcon = refreshButton.querySelector("svg");

    expect(refreshIcon).not.toBeNull();
    expect(refreshButton).not.toBeDisabled();
    expect(refreshIcon).not.toHaveClass("animate-spin");

    const refreshStartedAt = Date.now();
    await user.click(refreshButton);

    expect(await screen.findByText(/refreshed workspace incident/i)).toBeInTheDocument();
    expect(refreshButton).toBeDisabled();
    expect(refreshButton).toHaveAttribute("aria-busy", "true");
    expect(refreshIcon).toHaveClass("animate-spin");

    await waitFor(
      () => {
        expect(refreshButton).not.toBeDisabled();
      },
      { timeout: 2_000 }
    );

    expect(Date.now() - refreshStartedAt).toBeGreaterThanOrEqual(1_000);
    await waitFor(() => {
      expect(refreshButton).toHaveAttribute("aria-busy", "false");
    });
    expect(refreshIcon).not.toHaveClass("animate-spin");
  });

  it("renders project and service names from the initial incidents response without extra name lookups", async () => {
    const project = createProject();
    const incident = createIncident({
      project_id: project.project_id,
      project_name: project.name,
      service_id: "svc_checkout",
      service_name: "Checkout API"
    });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (
        url.includes("/v1/incidents?") &&
        url.includes("limit=20") &&
        url.includes("status=active") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, { incidents: [incident], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/incidents"]} />);

    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
    expect(screen.getByText(project.name)).toBeInTheDocument();
    expect(screen.getByText(/checkout api/i)).toBeInTheDocument();
    expect(screen.queryByText(project.project_id)).toBeNull();
    expect(screen.queryByText(incident.service_id)).toBeNull();
    // Workspace switching adds its account inventory, not project/service name lookups.
    expect(
      fetchMock.mock.calls.filter(([input]) => !requestUrl(input).endsWith("/v1/organizations"))
    ).toHaveLength(2);
  });

  it("shows every workspace incident empty state as the status filter changes", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (
        url.includes("/v1/incidents?") &&
        url.includes("limit=20") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/incidents"]} />);

    const statusFilter = await findStatusFilterTrigger("workspace-incidents-status-filter");
    expect(await screen.findByText(/no incidents need attention/i)).toBeInTheDocument();
    expect(statusFilter).toHaveTextContent(/^needs attention$/i);

    await chooseStatusFilterOption(user, "workspace-incidents-status-filter", /^resolved$/i);
    expect(await screen.findByText(/no resolved incidents/i)).toBeInTheDocument();

    await chooseStatusFilterOption(user, "workspace-incidents-status-filter", /^regressed$/i);
    expect(await screen.findByText(/no regressed incidents/i)).toBeInTheDocument();

    await chooseStatusFilterOption(user, "workspace-incidents-status-filter", /all statuses/i);
    expect(await screen.findByText(/no incidents captured yet/i)).toBeInTheDocument();
  });

  it("sorts workspace incidents across every visible column and renders unknown services", async () => {
    const user = userEvent.setup();
    const incidents = [
      createIncident({
        incident_id: "inc_alpha",
        project_id: "proj_alpha",
        project_name: "Alpha App",
        title: "Alpha failure",
        severity: "low",
        status: "regressed",
        service_name: null,
        occurrence_count: 1,
        last_seen_at: "2026-03-17T00:01:00.000Z"
      }),
      createIncident({
        incident_id: "inc_zulu",
        project_id: "proj_zulu",
        project_name: "Zulu App",
        title: "Zulu failure",
        severity: "critical",
        status: "open",
        service_name: "worker-api",
        occurrence_count: 9,
        last_seen_at: "2026-03-17T00:09:00.000Z"
      })
    ];

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (
        url.includes("/v1/incidents?") &&
        url.includes("limit=20") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, { incidents, next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/incidents?status=all"]} />);

    expect(await screen.findByText(/alpha failure/i)).toBeInTheDocument();
    expect(screen.getByText(/unknown service/i)).toBeInTheDocument();
    expect(screen.getByText(/1 occurrence/i)).toBeInTheDocument();

    const expectFirstDataRow = (name: RegExp) => {
      const rows = screen.getAllByRole("row");
      expect(within(rows[1] as HTMLTableRowElement).getByText(name)).toBeInTheDocument();
    };

    await user.click(screen.getByRole("button", { name: /^incident$/i }));
    expectFirstDataRow(/alpha failure/i);

    await user.click(screen.getByRole("button", { name: /project/i }));
    expectFirstDataRow(/alpha app/i);

    await user.click(screen.getByRole("button", { name: /service/i }));
    expectFirstDataRow(/unknown service/i);

    await user.click(screen.getByRole("button", { name: /severity/i }));
    expectFirstDataRow(/^low$/i);

    await user.click(screen.getByRole("button", { name: /status/i }));
    expectFirstDataRow(/^open$/i);

    await user.click(screen.getByRole("button", { name: /occurrences/i }));
    expectFirstDataRow(/1 occurrence/i);

    await user.click(screen.getByRole("button", { name: /last seen/i }));
    expectFirstDataRow(/alpha failure/i);
  });
});
