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

describe("web app — project bundles", () => {
  it("downloads a project bundle when the artifact response is returned directly", async () => {
    const project = createProject();
    const incident = createIncident({ project_id: project.project_id });
    const alertMock = vi.fn();
    const createObjectUrlMock = vi.fn(() => "blob:test-url");
    const revokeObjectUrlMock = vi.fn();
    const clickMock = vi.fn();
    const originalCreateElement = document.createElement.bind(document);

    vi.stubGlobal("alert", alertMock);
    vi.stubGlobal("URL", {
      createObjectURL: createObjectUrlMock,
      revokeObjectURL: revokeObjectUrlMock
    });

    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === "a") {
        element.click = clickMock;
      }
      return element;
    }) as typeof document.createElement);

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

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}/bundles`]} />);

    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();

    const user = userEvent.setup();
    const incidentRow = screen
      .getByRole("link", { name: /typeerror in checkout handler/i })
      .closest("tr");
    expect(incidentRow).not.toBeNull();
    const rowButtons = within(incidentRow as HTMLTableRowElement).getAllByRole("button");
    expect(rowButtons.length).toBeGreaterThan(0);
    await user.click(rowButtons[0] as HTMLButtonElement);

    await waitFor(() => {
      expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
    });
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlMock).toHaveBeenCalledWith("blob:test-url");
    expect(alertMock).not.toHaveBeenCalled();
  });

  it("defaults the project bundles tab to active and lets users switch the status filter", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const openIncident = createIncident({
      project_id: project.project_id,
      title: "Open bundle incident"
    });
    const regressedIncident = createIncident({
      incident_id: "inc_regressed_bundle",
      project_id: project.project_id,
      title: "Regressed bundle incident",
      status: "regressed"
    });
    const resolvedIncident = createIncident({
      incident_id: "inc_resolved_bundle",
      project_id: project.project_id,
      title: "Resolved bundle incident",
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

    render(<App initialEntries={[`/projects/${project.project_id}/bundles`]} />);

    const statusFilter = await findStatusFilterTrigger("project-bundles-status-filter");
    expect(statusFilter).toHaveTextContent(/^needs attention$/i);
    expect(await screen.findByText(/regressed bundle incident/i)).toBeInTheDocument();
    expect(await screen.findByText(/open bundle incident/i)).toBeInTheDocument();
    expect(screen.queryByText(/resolved bundle incident/i)).toBeNull();

    await chooseStatusFilterOption(user, "project-bundles-status-filter", /^resolved$/i);
    expect(await screen.findByText(/resolved bundle incident/i)).toBeInTheDocument();
    expect(screen.queryByText(/open bundle incident/i)).toBeNull();
  });

  it("refreshes the project bundles table without reloading the page", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const initialIncident = createIncident({
      project_id: project.project_id,
      title: "Initial bundle incident"
    });
    const refreshedIncident = createIncident({
      incident_id: "inc_refreshed_bundle",
      project_id: project.project_id,
      title: "Refreshed bundle incident"
    });
    let projectBundleRequests = 0;

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
        projectBundleRequests += 1;
        return jsonResponse(200, {
          incidents: projectBundleRequests === 1 ? [initialIncident] : [refreshedIncident],
          next_cursor: null
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}/bundles`]} />);

    expect(await screen.findByText(/initial bundle incident/i)).toBeInTheDocument();
    expect(projectBundleRequests).toBe(1);

    await user.click(getPrimaryRefreshButton());

    expect(await screen.findByText(/refreshed bundle incident/i)).toBeInTheDocument();
    expect(screen.queryByText(/initial bundle incident/i)).toBeNull();
    expect(projectBundleRequests).toBe(2);
  });

  it("keeps project bundle links inside the project shell", async () => {
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

    render(<App initialEntries={[`/projects/${project.project_id}/bundles`]} />);

    const viewBundleLink = await screen.findByRole("link", { name: /view bundle/i });
    expect(viewBundleLink).toHaveAttribute(
      "href",
      `/projects/${project.project_id}/bundles/${incident.incident_id}`
    );
  });

  it("shows project overview with bundles tab and bundle action links", async () => {
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

    render(<App initialEntries={[`/projects/${project.project_id}/bundles`]} />);

    expect(await screen.findByText(/main app/i)).toBeInTheDocument();

    // Bundles tab content should include the incident with bundle actions
    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
    expect(screen.queryByText(/export incidents as csv/i)).toBeNull();
  });

  it("sorts and pages project bundles", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const alphaIncident = createIncident({
      incident_id: "inc_alpha_bundle",
      project_id: project.project_id,
      title: "Alpha bundle incident",
      severity: "low",
      status: "regressed",
      last_seen_at: "2026-03-17T00:01:00.000Z"
    });
    const zuluIncident = createIncident({
      incident_id: "inc_zulu_bundle",
      project_id: project.project_id,
      title: "Zulu bundle incident",
      severity: "critical",
      status: "open",
      last_seen_at: "2026-03-17T00:09:00.000Z"
    });
    const secondPageIncident = createIncident({
      incident_id: "inc_second_page_bundle",
      project_id: project.project_id,
      title: "Second page bundle incident",
      severity: "medium",
      status: "regressed",
      last_seen_at: "2026-03-17T00:05:00.000Z"
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
          incidents: [alphaIncident, zuluIncident],
          next_cursor: "cursor_2"
        });
      }

      if (
        url.endsWith(
          `/v1/incidents?project_id=${project.project_id}&limit=20&cursor=cursor_2&status=active`
        ) &&
        init?.method === undefined
      ) {
        return jsonResponse(200, { incidents: [secondPageIncident], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}/bundles`]} />);

    expect(await screen.findByText(/alpha bundle incident/i)).toBeInTheDocument();

    const expectFirstBundleRow = (name: RegExp) => {
      const rows = screen.getAllByRole("row");
      expect(within(rows[1] as HTMLTableRowElement).getByText(name)).toBeInTheDocument();
    };

    await user.click(screen.getByRole("button", { name: /^incident$/i }));
    expectFirstBundleRow(/alpha bundle incident/i);

    await user.click(screen.getByRole("button", { name: /severity/i }));
    expectFirstBundleRow(/^low$/i);

    await user.click(screen.getByRole("button", { name: /status/i }));
    expectFirstBundleRow(/^open$/i);

    await user.click(screen.getByRole("button", { name: /last seen/i }));
    expectFirstBundleRow(/alpha bundle incident/i);

    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(await screen.findByText(/second page bundle incident/i)).toBeInTheDocument();
  });
});
