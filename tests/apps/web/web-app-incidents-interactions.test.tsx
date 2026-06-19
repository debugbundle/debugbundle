// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

afterEach(() => {
  resetBrowserSessionClientState();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("web app — incident table interactions", () => {
  it("opens the workspace incident detail route when users click anywhere on the row", async () => {
    const user = userEvent.setup();
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

      if (url.includes("/v1/incidents?") && url.includes("status=active") && init?.method === undefined) {
        return jsonResponse(200, { incidents: [incident], next_cursor: null });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}`) && init?.method === undefined) {
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

    render(<App initialEntries={["/incidents"]} />);

    const row = (await screen.findByText(/checkout api/i)).closest("tr");
    expect(row).not.toBeNull();

    await user.click(row as HTMLTableRowElement);

    expect(await screen.findByRole("button", { name: /mark resolved/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to incidents/i })).toHaveAttribute("href", "/incidents");
  });

  it("creates a capture rule from an incident suggestion on the detail page", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const incident = createIncident({
      project_id: project.project_id,
      project_name: project.name,
      service_name: "Checkout API"
    });
    let captureRuleCreated = false;

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}`) && init?.method === undefined) {
        return jsonResponse(200, { incident });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/bundle`)) {
        return jsonResponse(200, { status: "pending" });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/reproduction`)) {
        return jsonResponse(200, { status: "pending" });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/capture-rule-suggestion`) && init?.method === "POST") {
        return jsonResponse(200, {
          bundle_status: "ready",
          suggestions: [
            {
              suggestion_id: "primary_resource_host_demote",
              label: "Demote resource errors from analytics.example.com",
              recommended_action: "demote",
              confidence: "high",
              reason: "Known third-party resource noise.",
              requires_confirmation: false,
              created_rule_id: captureRuleCreated ? "rule_1" : null,
              created_rule_enabled: captureRuleCreated ? true : null,
              rule: {
                name: "Demote resource errors from analytics.example.com",
                description: null,
                enabled: true,
                action: "demote",
                matcher: {
                  event_types: ["frontend_exception"],
                  browser_event_kind: "resource_error",
                  resource_url: { host: "analytics.example.com" }
                },
                sample_rate: null,
                sample_event_class: null,
                created_by_user_id: null,
                created_from_incident_id: incident.incident_id,
                created_from_event_id: null,
                expires_at: null
              }
            }
          ]
        });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}/capture-rules`) && init?.method === "POST") {
        expect(init.body).toBe(JSON.stringify({ suggestion_id: "primary_resource_host_demote" }));
        captureRuleCreated = true;
        return jsonResponse(201, {
          rule: {
            id: "rule_1",
            project_id: project.project_id,
            name: "Demote resource errors from analytics.example.com",
            description: null,
            enabled: true,
            action: "demote",
            matcher: {
              event_types: ["frontend_exception"],
              browser_event_kind: "resource_error",
              resource_url: { host: "analytics.example.com" }
            },
            sample_rate: null,
            sample_event_class: null,
            created_by_user_id: null,
            created_from_incident_id: incident.incident_id,
            created_from_event_id: null,
            expires_at: null,
            hit_count: 0,
            last_matched_at: null,
            created_at: "2026-05-26T10:00:00.000Z",
            updated_at: "2026-05-26T10:00:00.000Z"
          }
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/incidents/${incident.incident_id}`]} />);

    await screen.findByRole("button", { name: /mark resolved/i });
    await user.click(screen.getByRole("button", { name: /capture rules/i }));

    expect(await screen.findByText(/demote resource errors from analytics\.example\.com/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create rule/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).endsWith(`/v1/incidents/${incident.incident_id}/capture-rules`) && init?.method === "POST"
        )
      ).toBe(true);
    });

    expect(await screen.findByRole("button", { name: /^rule exists$/i })).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /^close$/i }).at(-1) as HTMLButtonElement);
    await user.click(screen.getByRole("button", { name: /capture rules/i }));

    expect(await screen.findByRole("button", { name: /^rule exists$/i })).toBeInTheDocument();
  });

  it("bulk resolves workspace incidents from the table with one request", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const incidentState = [
      createIncident({
        incident_id: "inc_workspace_open",
        project_id: project.project_id,
        project_name: project.name,
        title: "Open workspace incident",
        status: "open"
      }),
      createIncident({
        incident_id: "inc_workspace_regressed",
        project_id: project.project_id,
        project_name: project.name,
        title: "Regressed workspace incident",
        status: "regressed"
      }),
      createIncident({
        incident_id: "inc_workspace_resolved",
        project_id: project.project_id,
        project_name: project.name,
        title: "Resolved workspace incident",
        status: "resolved",
        resolved_at: "2026-05-18T13:00:00.000Z"
      })
    ];

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.includes("/v1/incidents?") && init?.method === undefined) {
        const request = new URL(url, "https://app.debugbundle.test");
        const status = request.searchParams.get("status");
        const incidents = status === null
          ? incidentState
          : status === "active"
            ? incidentState.filter((incident) => incident.status === "open" || incident.status === "regressed")
            : incidentState.filter((incident) => incident.status === status);
        return jsonResponse(200, { incidents, next_cursor: null });
      }

      if (url.endsWith("/v1/incidents/resolve") && init?.method === "POST") {
        expect(init.body).toBe(JSON.stringify({ incident_ids: ["inc_workspace_open", "inc_workspace_regressed"] }));
        const incidents = incidentState.filter(
          (incident) => incident.incident_id === "inc_workspace_open" || incident.incident_id === "inc_workspace_regressed"
        );
        for (const incident of incidents) {
          incident.status = "resolved";
          incident.resolved_at = "2026-05-18T13:15:00.000Z";
          incident.regressed_at = null;
        }
        return jsonResponse(200, { incidents });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/incidents"]} />);

    await screen.findByText(/open workspace incident/i);
    await chooseStatusFilterOption(user, "workspace-incidents-status-filter", /all statuses/i);
    expect(await screen.findByText(/resolved workspace incident/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /select all visible incidents/i }));
    await screen.findByText(/3 incidents selected on this page/i);
    await user.click(screen.getByRole("button", { name: /mark selected resolved/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) => requestUrl(input).endsWith("/v1/incidents/resolve") && init?.method === "POST"
        )
      ).toHaveLength(1);
    });
  });

  it("uses the bulk workspace incident resolve endpoint", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const incidentState = [
      createIncident({
        incident_id: "inc_workspace_retry_one",
        project_id: project.project_id,
        project_name: project.name,
        title: "Retry workspace incident one",
        status: "open"
      }),
      createIncident({
        incident_id: "inc_workspace_retry_two",
        project_id: project.project_id,
        project_name: project.name,
        title: "Retry workspace incident two",
        status: "open"
      })
    ];

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.includes("/v1/incidents?") && init?.method === undefined) {
        const request = new URL(url, "https://app.debugbundle.test");
        const status = request.searchParams.get("status");
        const incidents = status === null
          ? incidentState
          : status === "active"
            ? incidentState.filter((incident) => incident.status === "open" || incident.status === "regressed")
            : incidentState.filter((incident) => incident.status === status);
        return jsonResponse(200, { incidents, next_cursor: null });
      }

      if (url.endsWith("/v1/incidents/resolve") && init?.method === "POST") {
        expect(init.body).toBe(
          JSON.stringify({ incident_ids: ["inc_workspace_retry_one", "inc_workspace_retry_two"] })
        );
        for (const incident of incidentState) {
          incident.status = "resolved";
          incident.resolved_at = "2026-05-18T13:15:00.000Z";
          incident.regressed_at = null;
        }
        return jsonResponse(200, { incidents: incidentState });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/incidents"]} />);

    await screen.findByText(/retry workspace incident one/i);
    await user.click(screen.getByRole("button", { name: /select all visible incidents/i }));
    await screen.findByText(/2 incidents selected on this page/i);
    await user.click(screen.getByRole("button", { name: /mark selected resolved/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) => requestUrl(input).endsWith("/v1/incidents/resolve") && init?.method === "POST"
        )
      ).toHaveLength(1);
    });

  });

  it("opens the project incident detail route when users click anywhere on the row", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const incident = createIncident({
      project_id: project.project_id,
      project_name: project.name,
      service_name: "Project Checkout API"
    });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }

      if (url.includes("/v1/incidents?") && url.includes(`project_id=${project.project_id}`) && url.includes("status=active") && init?.method === undefined) {
        return jsonResponse(200, { incidents: [incident], next_cursor: null });
      }

      if (url.endsWith(`/v1/incidents/${incident.incident_id}`) && init?.method === undefined) {
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

    render(<App initialEntries={[`/projects/${project.project_id}/incidents`]} />);

    const row = (await screen.findByText(/project checkout api/i)).closest("tr");
    expect(row).not.toBeNull();

    await user.click(row as HTMLTableRowElement);

    expect(await screen.findByRole("button", { name: /mark resolved/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to incidents/i })).toHaveAttribute(
      "href",
      `/projects/${project.project_id}/incidents`
    );
  });

  it("bulk resolves project incidents from the table with one request", async () => {
    const user = userEvent.setup();
    const project = createProject();
    const incidentState = [
      createIncident({
        incident_id: "inc_project_open",
        project_id: project.project_id,
        title: "Open project incident",
        status: "open"
      }),
      createIncident({
        incident_id: "inc_project_regressed",
        project_id: project.project_id,
        title: "Regressed project incident",
        status: "regressed"
      }),
      createIncident({
        incident_id: "inc_project_resolved",
        project_id: project.project_id,
        title: "Resolved project incident",
        status: "resolved",
        resolved_at: "2026-05-18T13:00:00.000Z"
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

      if (url.includes("/v1/incidents?") && url.includes(`project_id=${project.project_id}`) && init?.method === undefined) {
        const request = new URL(url, "https://app.debugbundle.test");
        const status = request.searchParams.get("status");
        const incidents = status === null
          ? incidentState
          : status === "active"
            ? incidentState.filter((incident) => incident.status === "open" || incident.status === "regressed")
            : incidentState.filter((incident) => incident.status === status);
        return jsonResponse(200, { incidents, next_cursor: null });
      }

      if (url.endsWith("/v1/incidents/resolve") && init?.method === "POST") {
        expect(init.body).toBe(JSON.stringify({ incident_ids: ["inc_project_open", "inc_project_regressed"] }));
        const incidents = incidentState.filter(
          (incident) => incident.incident_id === "inc_project_open" || incident.incident_id === "inc_project_regressed"
        );
        for (const incident of incidents) {
          incident.status = "resolved";
          incident.resolved_at = "2026-05-18T13:20:00.000Z";
          incident.regressed_at = null;
        }
        return jsonResponse(200, { incidents });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[`/projects/${project.project_id}/incidents`]} />);

    await screen.findByText(/open project incident/i);
    await chooseStatusFilterOption(user, "project-incidents-status-filter", /all statuses/i);
    expect(await screen.findByText(/resolved project incident/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /select all visible incidents/i }));
    await screen.findByText(/3 incidents selected on this page/i);
    await user.click(screen.getByRole("button", { name: /mark selected resolved/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) => requestUrl(input).endsWith("/v1/incidents/resolve") && init?.method === "POST"
        )
      ).toHaveLength(1);
    });
  });
});
