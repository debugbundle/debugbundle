// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import {
  createIncident,
  createProject,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

async function findStatusFilterTrigger(id: string): Promise<HTMLElement> {
  await waitFor(() => {
    expect(document.getElementById(id)).not.toBeNull();
  });

  return document.getElementById(id) as HTMLElement;
}

async function chooseStatusFilterOption(
  user: ReturnType<typeof userEvent.setup>,
  triggerId: string,
  optionName: RegExp | string
): Promise<void> {
  const trigger = await findStatusFilterTrigger(triggerId);
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
  await user.click(await screen.findByRole("option", { name: optionName }));
}

function getPrimaryRefreshButton(): HTMLElement {
  const refreshButtons = screen.getAllByRole("button", { name: /^refresh$/i });
  return refreshButtons[refreshButtons.length - 1] as HTMLElement;
}

afterEach(() => {
  resetBrowserSessionClientState();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

  it("formats request-anomaly grouping copy on the incident detail page", async () => {
    const incident = createIncident({
      title: "Request anomaly: GET /checkout/:orderId returned 404 repeatedly",
      matched_fields: ["request_anomaly", "route_template", "http_method", "http_status"]
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
        return jsonResponse(200, { status: "pending" });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/reproduction`)) {
        return jsonResponse(200, { status: "pending" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);

    expect(await screen.findByText(/request anomaly: get \/checkout\/:orderid returned 404 repeatedly/i)).toBeInTheDocument();
    expect(
      screen.getByText("Request anomaly threshold crossed. Grouped by route template, HTTP method, and HTTP status.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/request_anomaly, route_template, http_method, http_status/i)).toBeNull();
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
    const pendingTitle = await screen.findByText(/bundle is being generated/i);
    expect(pendingTitle).toBeInTheDocument();
    expect(pendingTitle.closest("[data-tone='neutral']")).not.toBeNull();
    expect(pendingTitle.closest("[data-tone='neutral']")?.querySelector(".animate-spin")).not.toBeNull();
  });

  it("polls a pending bundle until the artifact is ready", async () => {
    const incident = createIncident();
    let bundleRequestCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}`)) {
        return jsonResponse(200, { incident });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/bundle`)) {
        bundleRequestCount += 1;
        if (bundleRequestCount === 1) {
          return jsonResponse(200, { status: "pending" });
        }

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
        return jsonResponse(200, { status: "pending" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);

    expect(await screen.findByText(/bundle is being generated/i)).toBeInTheDocument();

    expect(await screen.findByText(/full bundle artifact for this incident/i, undefined, { timeout: 4_000 })).toBeInTheDocument();
    expect(bundleRequestCount).toBe(2);
  });

  it("shows unavailable bundle and reproduction callouts when artifact generation fails", async () => {
    const incident = createIncident();
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}`)) {
        return jsonResponse(200, { incident });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/bundle`)) {
        return jsonResponse(200, { status: "failed" });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/reproduction`)) {
        return jsonResponse(200, { status: "failed" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);

    expect(await screen.findByText(/bundle generation failed/i)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /reproduction/i }));
    expect(await screen.findByText(/reproduction not available/i)).toBeInTheDocument();
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

    const { container } = render(<App initialEntries={[`/projects/${project.project_id}/bundles`]} />);

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

    const { container } = render(<App initialEntries={[`/projects/${project.project_id}/bundles`]} />);

    expect(await screen.findByText(/debug bundles/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    });

    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
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
    const user = userEvent.setup();
    const project = createProject();
    const incidents = [
      createIncident({
        project_id: project.project_id,
        project_name: project.name,
        service_id: "svc_123",
        service_name: "Checkout API",
        environment: "production"
      }),
      createIncident({
        incident_id: "inc_456",
        project_id: project.project_id,
        project_name: project.name,
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

      if (url.includes("/v1/incidents?") && url.includes("limit=20") && url.includes("status=open") && init?.method === undefined) {
        return jsonResponse(200, { incidents: [incidents[0]], next_cursor: null });
      }

      if (url.includes("/v1/incidents?") && url.includes("limit=20") && !url.includes("status=") && init?.method === undefined) {
        return jsonResponse(200, { incidents, next_cursor: "cursor_2" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/incidents"]} />);

    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
    expect(await findStatusFilterTrigger("workspace-incidents-status-filter")).toHaveTextContent(/^open$/i);
    expect(screen.queryByText(/database timeout during signin/i)).toBeNull();

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

      if (url.includes("/v1/incidents?") && url.includes("limit=20") && url.includes("status=open") && !url.includes("cursor=") && init?.method === undefined) {
        return jsonResponse(200, { incidents: [firstIncident], next_cursor: "cursor_2" });
      }

      if (url.includes("/v1/incidents?") && url.includes("limit=20") && url.includes("cursor=cursor_2") && url.includes("status=open") && init?.method === undefined) {
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
    const initialIncident = createIncident({ project_id: project.project_id, project_name: project.name, title: "Initial workspace incident" });
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

      if (url.includes("/v1/incidents?") && url.includes("limit=20") && url.includes("status=open") && init?.method === undefined) {
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
    const initialIncident = createIncident({ project_id: project.project_id, project_name: project.name, title: "Initial workspace incident" });
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

      if (url.includes("/v1/incidents?") && url.includes("limit=20") && url.includes("status=open") && init?.method === undefined) {
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

    await waitFor(() => {
      expect(refreshButton).not.toBeDisabled();
    }, { timeout: 2_000 });

    expect(Date.now() - refreshStartedAt).toBeGreaterThanOrEqual(1_000);
    await waitFor(() => {
      expect(refreshButton).toHaveAttribute("aria-busy", "false");
    });
    expect(refreshIcon).not.toHaveClass("animate-spin");
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

  it("defaults the project incidents tab to open and lets users switch the status filter", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const openIncident = createIncident({ project_id: project.project_id, title: "Open project incident" });
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

      if (url.endsWith(`/v1/incidents?project_id=${project.project_id}&limit=20&status=open`) && init?.method === undefined) {
        return jsonResponse(200, { incidents: [openIncident], next_cursor: null });
      }

      if (url.endsWith(`/v1/incidents?project_id=${project.project_id}&limit=20&status=resolved`) && init?.method === undefined) {
        return jsonResponse(200, { incidents: [resolvedIncident], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}/incidents`]} />);

    const statusFilter = await findStatusFilterTrigger("project-incidents-status-filter");
    expect(statusFilter).toHaveTextContent(/^open$/i);
    expect(await screen.findByText(/open project incident/i)).toBeInTheDocument();
    expect(screen.queryByText(/resolved project incident/i)).toBeNull();

    await chooseStatusFilterOption(user, "project-incidents-status-filter", /^resolved$/i);
    expect(await screen.findByText(/resolved project incident/i)).toBeInTheDocument();
    expect(screen.queryByText(/open project incident/i)).toBeNull();
  });

  it("refreshes the project incidents table without reloading the page", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const initialIncident = createIncident({ project_id: project.project_id, title: "Initial project incident" });
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

      if (url.endsWith(`/v1/incidents?project_id=${project.project_id}&limit=20&status=open`) && init?.method === undefined) {
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

  it("defaults the project bundles tab to open and lets users switch the status filter", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const openIncident = createIncident({ project_id: project.project_id, title: "Open bundle incident" });
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

      if (url.endsWith(`/v1/incidents?project_id=${project.project_id}&limit=20&status=open`) && init?.method === undefined) {
        return jsonResponse(200, { incidents: [openIncident], next_cursor: null });
      }

      if (url.endsWith(`/v1/incidents?project_id=${project.project_id}&limit=20&status=resolved`) && init?.method === undefined) {
        return jsonResponse(200, { incidents: [resolvedIncident], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}/bundles`]} />);

    const statusFilter = await findStatusFilterTrigger("project-bundles-status-filter");
    expect(statusFilter).toHaveTextContent(/^open$/i);
    expect(await screen.findByText(/open bundle incident/i)).toBeInTheDocument();
    expect(screen.queryByText(/resolved bundle incident/i)).toBeNull();

    await chooseStatusFilterOption(user, "project-bundles-status-filter", /^resolved$/i);
    expect(await screen.findByText(/resolved bundle incident/i)).toBeInTheDocument();
    expect(screen.queryByText(/open bundle incident/i)).toBeNull();
  });

  it("refreshes the project bundles table without reloading the page", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const initialIncident = createIncident({ project_id: project.project_id, title: "Initial bundle incident" });
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

      if (url.endsWith(`/v1/incidents?project_id=${project.project_id}&limit=20&status=open`) && init?.method === undefined) {
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

      if (url.includes("/v1/incidents?") && url.includes("limit=20") && url.includes("status=open") && init?.method === undefined) {
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

    render(<App initialEntries={[`/projects/${project.project_id}/incidents/${incident.incident_id}`]} />);

    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to incidents/i })).toHaveAttribute(
      "href",
      `/projects/${project.project_id}/incidents`
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
    expect(screen.getByText(/export incidents as csv/i)).toBeInTheDocument();
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

  it("shows zeroed incident health metrics when a project has no current incidents", async () => {
    const project = createProject({
      metrics: {
        open_incidents: 0,
        regressed_incidents: 0,
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

    expect((await screen.findAllByText(/^0$/)).length).toBe(4);
    expect(screen.getByText(/incidents first seen today in this project/i)).toBeInTheDocument();
    expect(screen.getByText(/current regressed incidents in this project/i)).toBeInTheDocument();
  });

  it("sorts and pages project bundles", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const alphaIncident = createIncident({
      incident_id: "inc_alpha_bundle",
      project_id: project.project_id,
      title: "Alpha bundle incident",
      severity: "low",
      status: "resolved",
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

      if (url.endsWith(`/v1/incidents?project_id=${project.project_id}&limit=20&status=open`) && init?.method === undefined) {
        return jsonResponse(200, { incidents: [alphaIncident, zuluIncident], next_cursor: "cursor_2" });
      }

      if (url.endsWith(`/v1/incidents?project_id=${project.project_id}&limit=20&cursor=cursor_2&status=open`) && init?.method === undefined) {
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
    expect(await screen.findByText(/no open incidents for this project/i)).toBeInTheDocument();
  });

  it("shows every workspace incident empty state as the status filter changes", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.includes("/v1/incidents?") && url.includes("limit=20") && init?.method === undefined) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/incidents"]} />);

    const statusFilter = await findStatusFilterTrigger("workspace-incidents-status-filter");
    expect(await screen.findByText(/no open incidents/i)).toBeInTheDocument();
    expect(statusFilter).toHaveTextContent(/^open$/i);

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
        status: "resolved",
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

      if (url.includes("/v1/incidents?") && url.includes("limit=20") && init?.method === undefined) {
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

  it("copies and downloads bundle and reproduction artifacts from the incident detail page", async () => {
    const incident = createIncident();
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    const createObjectUrlMock = vi.fn(() => "blob:incident-artifact");
    const revokeObjectUrlMock = vi.fn();
    const clickMock = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock
      }
    });
    vi.stubGlobal("URL", {
      createObjectURL: createObjectUrlMock,
      revokeObjectURL: revokeObjectUrlMock
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
        return jsonResponse(200, { bundle_id: "bundle_123", summary: { title: incident.title } });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/reproduction`)) {
        return jsonResponse(200, { steps: ["step 1"], command: "pnpm test" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);

    await screen.findByText(/typeerror in checkout handler/i);

    const copyButtons = await screen.findAllByRole("button", { name: /^copy$/i });
    const downloadButtons = await screen.findAllByRole("button", { name: /^download$/i });
    await user.click(copyButtons[0] as HTMLButtonElement);
    await user.click(downloadButtons[0] as HTMLButtonElement);

    await user.click(screen.getByRole("tab", { name: /reproduction/i }));
    const reproCopyButtons = await screen.findAllByRole("button", { name: /^copy$/i });
    const reproDownloadButtons = await screen.findAllByRole("button", { name: /^download$/i });
    await user.click(reproCopyButtons[0] as HTMLButtonElement);
    await user.click(reproDownloadButtons[0] as HTMLButtonElement);

    expect(writeTextMock).toHaveBeenCalledTimes(2);
    expect(createObjectUrlMock).toHaveBeenCalledTimes(2);
    expect(clickMock).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrlMock).toHaveBeenCalledWith("blob:incident-artifact");
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
        status: "resolved",
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
    const clickMock = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

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
    expect(screen.getByRole("link", { name: /back to projects/i })).toHaveAttribute("href", "/projects");
  });
});
