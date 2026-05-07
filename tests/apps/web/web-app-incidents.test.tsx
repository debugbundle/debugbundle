// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import {
  createIncident,
  createProject,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web app — incident and project detail routes", () => {
  it("shows incident detail page with metadata, severity badge, and bundle/reproduction tabs", async () => {
    const incident = createIncident({
      fingerprint: "fp_checkout_timeout_route_template_production_checkout_api_1234567890abcdefghijklmnopqrstuvwxyz"
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
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
        return jsonResponse(200, { steps: ["step 1", "step 2"] });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);

    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
    expect(screen.getByText(/^high$/i)).toBeInTheDocument();
    expect(screen.getByText(/^open$/i)).toBeInTheDocument();
    expect(screen.getByText(String(incident.occurrence_count))).toBeInTheDocument();

    // Verify the back link exists
    const backLinks = screen.getAllByRole("link", { name: /back to incidents/i });
    expect(backLinks.length).toBeGreaterThan(0);
    expect(backLinks[0]).toHaveAttribute("href", "/incidents");

    // Bundle tab loads by default — verify the bundle card content
    expect(await screen.findByText(/full bundle artifact for this incident/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download/i })).toBeInTheDocument();

    const fingerprintValue = screen.getByText(incident.fingerprint);
    expect(fingerprintValue).toHaveAttribute("title", incident.fingerprint);
    expect(fingerprintValue.className.includes("truncate")).toBe(true);

    expect(container.querySelector('[data-token="property"]')).not.toBeNull();
    expect(container.querySelector('[data-token="string"]')).not.toBeNull();
  });

  it("allows resolving an incident from the detail page", async () => {
    const incident = createIncident();
    const resolvedIncident = createIncident({
      incident_id: incident.incident_id,
      status: "resolved",
      resolved_at: "2026-03-17T00:06:00.000Z"
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}`) && init?.method === undefined) {
        return jsonResponse(200, { incident });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/resolve`) && init?.method === "POST") {
        return jsonResponse(200, { incident: resolvedIncident });
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

    render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);

    const user = userEvent.setup();

    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /mark resolved/i }));

    expect(await screen.findByText(/^resolved$/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark resolved/i })).toBeNull();
    const resolveCall = fetchMock.mock.calls.find(([input]) =>
      requestUrl(input).includes(`/v1/incidents/${incident.incident_id}/resolve`)
    );
    expect(resolveCall).toBeDefined();
    if (resolveCall === undefined) {
      throw new Error("expected_resolve_call");
    }
    const [, resolveInit] = resolveCall;
    expect(resolveInit?.method).toBe("POST");
    expect(resolveInit?.credentials).toBe("include");
    expect(resolveInit?.headers).toEqual(
      expect.objectContaining({
        "X-CSRF-Token": "csrf-token-123"
      })
    );
  });

  it("shows pending state when bundle is still being generated", async () => {
    const incident = createIncident();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
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

    render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);

    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
    expect(await screen.findByText(/bundle is being generated/i)).toBeInTheDocument();
  });

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
    const incidentRow = screen.getByRole("link", { name: /typeerror in checkout handler/i }).closest("tr");
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

  it("shows error state when incident is not found", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/incidents/inc_nonexistent")) {
        return jsonResponse(404, { error: "not_found" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/incidents/inc_nonexistent"]} />);

    expect(await screen.findByText(/incident not available/i)).toBeInTheDocument();
    const backLinks = screen.getAllByRole("link", { name: /back to incidents/i });
    expect(backLinks.length).toBeGreaterThan(0);
  });

  it("renders the incidents page with project and service columns and clickable incident links", async () => {
    const project = createProject();
    const incidents = [
      createIncident({ project_id: project.project_id, project_name: project.name, service_id: "svc_123", service_name: "Checkout API" }),
      createIncident({
        incident_id: "inc_456",
        project_id: project.project_id,
        project_name: project.name,
        title: "Database timeout during signin",
        severity: "critical",
        status: "regressed",
        service_id: "svc_456",
        service_name: "Signin Worker",
        occurrence_count: 19
      })
    ];

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/incidents?limit=20") && init?.method === undefined) {
        return jsonResponse(200, { incidents, next_cursor: "cursor_2" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/incidents"]} />);

    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
    expect(screen.getByText(/database timeout during signin/i)).toBeInTheDocument();

    // Project and service columns exist
    const projectLinks = await screen.findAllByText(/main app/i);
    expect(projectLinks.length).toBeGreaterThan(0);
    expect(await screen.findByText(/checkout api/i)).toBeInTheDocument();
    expect(await screen.findByText(/signin worker/i)).toBeInTheDocument();

    // Incident titles are clickable links
    const incidentLink = screen.getByRole("link", { name: /typeerror in checkout handler/i });
    expect(incidentLink).toHaveAttribute("href", "/incidents/inc_123");
  });

  it("pages through incident results using the next cursor controls", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const firstIncident = createIncident({ project_id: project.project_id, project_name: project.name, title: "Alpha failure" });
    const secondIncident = createIncident({ incident_id: "inc_456", project_id: project.project_id, project_name: project.name, title: "Zulu failure" });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/incidents?limit=20") && init?.method === undefined) {
        return jsonResponse(200, { incidents: [firstIncident], next_cursor: "cursor_2" });
      }

      if (url.endsWith("/v1/incidents?limit=20&cursor=cursor_2") && init?.method === undefined) {
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

  it("sorts the project incidents table by occurrence count", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const noisyIncident = createIncident({ project_id: project.project_id, title: "Noisy failure", occurrence_count: 20 });
    const quietIncident = createIncident({ incident_id: "inc_456", project_id: project.project_id, title: "Quiet failure", occurrence_count: 2 });

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

      if (url.endsWith("/v1/incidents?limit=20") && init?.method === undefined) {
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

    const incidentLink = await screen.findByRole("link", { name: /typeerror in checkout handler/i });
    expect(incidentLink).toHaveAttribute("href", `/projects/${project.project_id}/incidents/${incident.incident_id}`);
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
    expect(viewBundleLink).toHaveAttribute("href", `/projects/${project.project_id}/bundles/${incident.incident_id}`);
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

    render(<App initialEntries={[`/projects/${project.project_id}/bundles/${incident.incident_id}`]} />);

    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
    const projectLinks = screen.getAllByRole("link", { name: /main app/i });
    expect(projectLinks.some((link) => link.getAttribute("href") === `/projects/${project.project_id}`)).toBe(true);
    expect(screen.getByRole("link", { name: /back to bundles/i })).toHaveAttribute(
      "href",
      `/projects/${project.project_id}/bundles`
    );
  });

  it("shows project overview with incidents tab listing project-scoped incidents", async () => {
    const project = createProject();
    const incident = createIncident({ project_id: project.project_id, project_name: project.name, service_name: "Checkout API" });

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
    expect(screen.getByText(/export incidents as csv/i)).toBeInTheDocument();
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
    expect(await screen.findByText(/no incidents for this project/i)).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: /back to projects/i })).toHaveAttribute("href", "/projects");
  });
});
