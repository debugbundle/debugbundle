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

describe("web app — project incidents", () => {
  it("does not flash list skeletons when a project tab data request resolves before the loading delay", async () => {
    const project = createProject();
    const incident = createIncident({ project_id: project.project_id });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }

      if (url.includes("/v1/incidents") && url.includes(`project_id=${project.project_id}`)) {
        return new Promise<Response>((resolve) => {
          window.setTimeout(() => {
            resolve(jsonResponse(200, { incidents: [incident], next_cursor: null }));
          }, 100);
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <App initialEntries={[`/projects/${project.project_id}/bundles`]} />
    );

    expect(await screen.findByText(/debug bundles/i)).toBeInTheDocument();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();

    await new Promise((resolve) => {
      window.setTimeout(resolve, 75);
    });

    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();

    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
  });

  it("shows list skeletons when a project tab data request exceeds the loading delay", async () => {
    const project = createProject();
    const incident = createIncident({ project_id: project.project_id });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }

      if (url.includes("/v1/incidents") && url.includes(`project_id=${project.project_id}`)) {
        return new Promise<Response>((resolve) => {
          window.setTimeout(() => {
            resolve(jsonResponse(200, { incidents: [incident], next_cursor: null }));
          }, 400);
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <App initialEntries={[`/projects/${project.project_id}/bundles`]} />
    );

    expect(await screen.findByText(/debug bundles/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    });

    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
  });

  it("sorts the project incidents table by occurrence count", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const noisyIncident = createIncident({
      project_id: project.project_id,
      title: "Noisy failure",
      occurrence_count: 20
    });
    const quietIncident = createIncident({
      incident_id: "inc_456",
      project_id: project.project_id,
      title: "Quiet failure",
      occurrence_count: 2
    });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }

      if (url.includes("/v1/incidents") && url.includes(`project_id=${project.project_id}`)) {
        return jsonResponse(200, { incidents: [noisyIncident, quietIncident], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}/incidents`]} />);

    expect(await screen.findByText(/noisy failure/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /occurrences/i }));

    const rows = screen.getAllByRole("row");
    expect(within(rows[1] as HTMLTableRowElement).getByText(/quiet failure/i)).toBeInTheDocument();
  });

  it("renders the environment column in the project incidents table", async () => {
    const project = createProject();
    const incident = createIncident({
      project_id: project.project_id,
      title: "Production checkout failure",
      service_name: "Checkout API",
      environment: "production"
    });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }

      if (url.includes("/v1/incidents") && url.includes(`project_id=${project.project_id}`)) {
        return jsonResponse(200, { incidents: [incident], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}/incidents`]} />);

    expect(await screen.findByText(/production checkout failure/i)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /environment/i })).toBeInTheDocument();
    expect(screen.getByText(/^production$/i)).toBeInTheDocument();
  });

  it("defaults the project incidents tab to active and lets users switch the status filter", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const openIncident = createIncident({
      project_id: project.project_id,
      title: "Open project incident"
    });
    const regressedIncident = createIncident({
      incident_id: "inc_regressed_project",
      project_id: project.project_id,
      title: "Regressed project incident",
      status: "regressed"
    });
    const resolvedIncident = createIncident({
      incident_id: "inc_resolved_project",
      project_id: project.project_id,
      title: "Resolved project incident",
      status: "resolved"
    });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }

      if (
        url.endsWith(`/v1/incidents?project_id=${project.project_id}&limit=20&status=active`) &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          incidents: [regressedIncident, openIncident],
          next_cursor: null
        });
      }

      if (
        url.endsWith(`/v1/incidents?project_id=${project.project_id}&limit=20&status=resolved`) &&
        init?.method === undefined
      ) {
        return jsonResponse(200, { incidents: [resolvedIncident], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}/incidents`]} />);

    const statusFilter = await findStatusFilterTrigger("project-incidents-status-filter");
    expect(statusFilter).toHaveTextContent(/^needs attention$/i);
    expect(await screen.findByText(/regressed project incident/i)).toBeInTheDocument();
    expect(await screen.findByText(/open project incident/i)).toBeInTheDocument();
    expect(screen.queryByText(/resolved project incident/i)).toBeNull();

    await chooseStatusFilterOption(user, "project-incidents-status-filter", /^resolved$/i);
    expect(await screen.findByText(/resolved project incident/i)).toBeInTheDocument();
    expect(screen.queryByText(/open project incident/i)).toBeNull();
  });

  it("refreshes the project incidents table without reloading the page", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const initialIncident = createIncident({
      project_id: project.project_id,
      title: "Initial project incident"
    });
    const refreshedIncident = createIncident({
      incident_id: "inc_refreshed_project",
      project_id: project.project_id,
      title: "Refreshed project incident"
    });
    let projectIncidentRequests = 0;

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }

      if (
        url.endsWith(`/v1/incidents?project_id=${project.project_id}&limit=20&status=active`) &&
        init?.method === undefined
      ) {
        projectIncidentRequests += 1;
        return jsonResponse(200, {
          incidents: projectIncidentRequests === 1 ? [initialIncident] : [refreshedIncident],
          next_cursor: null
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}/incidents`]} />);

    expect(await screen.findByText(/initial project incident/i)).toBeInTheDocument();
    expect(projectIncidentRequests).toBe(1);

    await user.click(getPrimaryRefreshButton());

    expect(await screen.findByText(/refreshed project incident/i)).toBeInTheDocument();
    expect(screen.queryByText(/initial project incident/i)).toBeNull();
    expect(projectIncidentRequests).toBe(2);
  });

  it("keeps project-scoped incident links inside the project shell", async () => {
    const project = createProject();
    const incident = createIncident({ project_id: project.project_id });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }

      if (url.includes("/v1/incidents") && url.includes(`project_id=${project.project_id}`)) {
        return jsonResponse(200, { incidents: [incident], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}/incidents`]} />);

    const incidentLink = await screen.findByRole("link", {
      name: /typeerror in checkout handler/i
    });
    expect(incidentLink).toHaveAttribute(
      "href",
      `/projects/${project.project_id}/incidents/${incident.incident_id}`
    );
  });

  it("renders scoped incident detail with project navigation and scoped back link", async () => {
    const project = createProject();
    const incident = createIncident({ project_id: project.project_id });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}`)) {
        return jsonResponse(200, { incident });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/bundle`)) {
        return jsonResponse(200, {
          bundle_id: "bundle_123",
          incident_id: incident.incident_id,
          project_id: incident.project_id,
          version: "v1",
          summary: {
            title: incident.title,
            severity: incident.severity,
            environment: incident.environment
          }
        });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/reproduction`)) {
        return jsonResponse(200, { steps: ["step 1"] });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <App initialEntries={[`/projects/${project.project_id}/bundles/${incident.incident_id}`]} />
    );

    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
    const projectLinks = screen.getAllByRole("link", { name: /main app/i });
    expect(
      projectLinks.some((link) => link.getAttribute("href") === `/projects/${project.project_id}`)
    ).toBe(true);
    expect(screen.getByRole("link", { name: /back to bundles/i })).toHaveAttribute(
      "href",
      `/projects/${project.project_id}/bundles`
    );
  });

  it("uses the scoped incidents back link for project incident detail routes", async () => {
    const project = createProject();
    const incident = createIncident({ project_id: project.project_id });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}`)) {
        return jsonResponse(200, { incident });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/bundle`)) {
        return jsonResponse(200, { status: "pending" });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/reproduction`)) {
        return jsonResponse(200, { status: "pending" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <App initialEntries={[`/projects/${project.project_id}/incidents/${incident.incident_id}`]} />
    );

    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to incidents/i })).toHaveAttribute(
      "href",
      `/projects/${project.project_id}/incidents`
    );
  });

  it("shows project overview with incidents tab listing project-scoped incidents", async () => {
    const project = createProject();
    const incident = createIncident({
      project_id: project.project_id,
      project_name: project.name,
      service_name: "Checkout API"
    });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }

      if (url.includes("/v1/incidents") && url.includes(`project_id=${project.project_id}`)) {
        return jsonResponse(200, { incidents: [incident], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}/incidents`]} />);

    expect(await screen.findByText(/main app/i)).toBeInTheDocument();

    // Incidents tab should be active and show the incident
    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /project/i })).toBeNull();
    expect(screen.getByRole("columnheader", { name: /service/i })).toBeInTheDocument();
    expect(screen.getByText(/checkout api/i)).toBeInTheDocument();
    expect(screen.getByText(/^high$/i)).toBeInTheDocument();
    expect(screen.getByText(/export incidents as csv/i)).toBeInTheDocument();
  });

  it("shows zeroed incident health metrics when a project has no current incidents", async () => {
    const project = createProject({
      metrics: {
        open_incidents: 0,
        regressed_incidents: 0,
        attention_incidents_today: 0,
        opened_incidents_today: 0,
        opened_incidents_month: 0
      }
    });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }

      if (url.includes("/v1/incidents") && url.includes(`project_id=${project.project_id}`)) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}`]} />);

    expect((await screen.findAllByText(/^0$/)).length).toBe(3);
    expect(await screen.findByText(/^not set$/i)).toBeInTheDocument();
    expect(await screen.findByText(/no health checks configured/i)).toBeInTheDocument();
    expect(screen.getByText(/opened or regressed today in this project/i)).toBeInTheDocument();
    expect(screen.getByText(/current regressed incidents in this project/i)).toBeInTheDocument();
  });

  it("shows empty state for project incidents tab with no incidents", async () => {
    const project = createProject();

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }

      if (url.includes("/v1/incidents") && url.includes(`project_id=${project.project_id}`)) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}/incidents`]} />);

    expect(await screen.findByText(/main app/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/no incidents need attention for this project/i)
    ).toBeInTheDocument();
  });

  it("sorts project incidents across service, severity, status, title, and last seen columns", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const incidents = [
      createIncident({
        incident_id: "inc_alpha_project",
        project_id: project.project_id,
        title: "Alpha project incident",
        service_name: null,
        severity: "low",
        status: "regressed",
        occurrence_count: 1,
        last_seen_at: "2026-03-17T00:01:00.000Z"
      }),
      createIncident({
        incident_id: "inc_zulu_project",
        project_id: project.project_id,
        title: "Zulu project incident",
        service_name: "worker-api",
        severity: "critical",
        status: "open",
        occurrence_count: 9,
        last_seen_at: "2026-03-17T00:09:00.000Z"
      })
    ];

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }

      if (url.includes("/v1/incidents") && url.includes(`project_id=${project.project_id}`)) {
        return jsonResponse(200, { incidents, next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}/incidents`]} />);

    expect(await screen.findByText(/alpha project incident/i)).toBeInTheDocument();
    expect(screen.getByText(/unknown service/i)).toBeInTheDocument();

    const expectFirstProjectRow = (name: RegExp) => {
      const rows = screen.getAllByRole("row");
      expect(within(rows[1] as HTMLTableRowElement).getByText(name)).toBeInTheDocument();
    };

    await user.click(screen.getByRole("button", { name: /^incident$/i }));
    expectFirstProjectRow(/alpha project incident/i);

    await user.click(screen.getByRole("button", { name: /service/i }));
    expectFirstProjectRow(/unknown service/i);

    await user.click(screen.getByRole("button", { name: /severity/i }));
    expectFirstProjectRow(/^low$/i);

    await user.click(screen.getByRole("button", { name: /status/i }));
    expectFirstProjectRow(/^open$/i);

    await user.click(screen.getByRole("button", { name: /occurrences/i }));
    expectFirstProjectRow(/1$/i);

    await user.click(screen.getByRole("button", { name: /last seen/i }));
    expectFirstProjectRow(/alpha project incident/i);
  });

  it("exports project incidents as csv", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const incident = createIncident({ project_id: project.project_id });
    const createObjectUrlMock = vi.fn(() => "blob:incident-export");
    const revokeObjectUrlMock = vi.fn();
    const clickMock = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

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

      if (url.includes("/v1/incidents") && url.includes(`project_id=${project.project_id}`)) {
        return jsonResponse(200, { incidents: [incident], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}/incidents`]} />);

    await screen.findByText(/typeerror in checkout handler/i);
    await user.click(screen.getByRole("button", { name: /export incidents as csv/i }));

    expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlMock).toHaveBeenCalledWith("blob:incident-export");
  });

  it("shows not-found callout when project does not exist", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [] });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_nonexistent"]} />);

    expect(await screen.findByText(/this project is not available/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to projects/i })).toHaveAttribute(
      "href",
      "/projects"
    );
  });
});
