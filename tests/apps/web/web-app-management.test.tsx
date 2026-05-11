// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import {
  createAlert,
  createBillingSummary,
  createGitHubDispatchDelivery,
  createGitHubDispatchRule,
  createGitHubInstallation,
  createGitHubRepository,
  createIncident,
  createOrganizationInvite,
  createOrganizationMember,
  createProject,
  createProjectGitHubRepo,
  createProjectToken,
  createSession,
  createWebhook,
  createWebhookDelivery,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web app — management routes", () => {
  it("shows project overview with details and tab navigation to project sub-routes", async () => {
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
              metrics: {
                monthly_bundle_requests: 12,
                monthly_raw_ingested_events: 120,
                retained_bundles: 6,
                monthly_alert_deliveries: 4
              }
            })
          ]
        });
      }

      if (url.includes("/v1/incidents") && url.includes("project_id=proj_123")) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123"]} />);

    expect(await screen.findByText(/main app/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /main app/i })).not.toBeInTheDocument();
    expect(screen.getByText(/^12$/)).toBeInTheDocument();
    expect(screen.getByText(/^120$/)).toBeInTheDocument();
    expect(screen.getByText(/^6$/)).toBeInTheDocument();
    expect(screen.getByText(/^4$/)).toBeInTheDocument();

    expect(screen.getByRole("tab", { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /incidents/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /bundles/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /alerts/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /webhooks/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /github/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /tokens/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /settings/i })).toBeInTheDocument();
  });

  it("shows incident inventory from the signed-in incidents route and exposes the sidebar entry", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/incidents?limit=20&status=open") && init?.method === undefined) {
        return jsonResponse(200, {
          incidents: [createIncident()],
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

    expect(await screen.findByRole("heading", { name: /incidents/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /incidents/i })).toHaveAttribute("href", "/incidents");
    expect(screen.getByRole("combobox", { name: /status/i })).toHaveValue("open");
    expect(await screen.findByText(/typeerror in checkout handler/i)).toBeInTheDocument();
    expect(screen.queryByText(/database timeout during signin/i)).toBeNull();
    expect((await screen.findAllByRole("link", { name: /main app/i })).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/^checkout-api$/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^proj_123$/i)).toBeNull();
    expect(screen.queryByText(/^svc_123$/i)).toBeNull();
    expect(screen.getByText(/^high$/i)).toBeInTheDocument();
    const incidentTable = screen.getByRole("table");
    expect(within(incidentTable).getByText(/^open$/i)).toBeInTheDocument();
    expect(screen.getByText(/7 occurrences/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /previous/i })).toBeNull();

    await user.selectOptions(screen.getByRole("combobox", { name: /status/i }), "all");
    expect(await screen.findByText(/database timeout during signin/i)).toBeInTheDocument();
    expect(screen.getByText(/^critical$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
    expect(incidentTable.className.includes("min-w-[860px]")).toBe(true);
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

      if (url.endsWith("/v1/incidents?limit=20&status=open") && init?.method === undefined) {
        return jsonResponse(200, {
          incidents: [],
          next_cursor: null
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/incidents"]} />);

    expect(await screen.findByRole("heading", { name: /incidents/i, level: 1 })).toBeInTheDocument();
    expect(await screen.findByText(/no incidents captured yet/i)).toBeInTheDocument();
    expect(screen.getByText(/incoming incidents will appear here/i)).toBeInTheDocument();
  });

  it("creates a project and opens its overview directly", async () => {
    const user = userEvent.setup();
    const existingProject = createProject({
      metrics: {
        monthly_bundle_requests: 12,
        monthly_raw_ingested_events: 120,
        retained_bundles: 6,
        monthly_alert_deliveries: 4
      }
    });
    let projects = [existingProject];

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.headers).toEqual({
          "Content-Type": "application/json",
          "X-CSRF-Token": "csrf-token-123"
        });
        expect(init.body).toBe(JSON.stringify({
          name: "Ops API",
          slug: "ops-api",
          environment_default: "staging"
        }));

        const createdProject = createProject({
          project_id: "proj_456",
          name: "Ops API",
          slug: "ops-api",
          environment_default: "staging"
        });
        projects = [existingProject, createdProject];

        return jsonResponse(201, {
          project: createdProject
        });
      }

      if (url.includes("/v1/incidents") && url.includes("project_id=proj_456")) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      if (url.endsWith("/v1/projects/proj_123/tokens") && init?.method === undefined) {
        return jsonResponse(200, {
          tokens: [createProjectToken()]
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects"]} />);

    expect(await screen.findByRole("heading", { name: /projects/i, level: 1 })).toBeInTheDocument();
    expect(await screen.findByText(/main app/i)).toBeInTheDocument();
    const mainAppRow = screen.getByText(/main app/i).closest("tr");
    expect(mainAppRow).not.toBeNull();
    expect(within(mainAppRow as HTMLTableRowElement).getByText("12")).toBeInTheDocument();
    expect(within(mainAppRow as HTMLTableRowElement).getByText("120")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create project/i }));
    expect((await screen.findByRole("dialog")).className.includes("sm:max-w-2xl")).toBe(true);
    await user.type(await screen.findByLabelText(/project name/i), "Ops API");
    expect(screen.getByLabelText(/project slug/i)).toHaveValue("ops-api");
    await user.selectOptions(screen.getByLabelText(/default environment/i), "staging");
    await user.click(screen.getByRole("button", { name: /^create project$/i }));

    expect(await screen.findByText(/project details/i)).toBeInTheDocument();
    expect(screen.getByText(/^ops-api$/i)).toBeInTheDocument();
    expect(screen.getByText(/^staging$/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /tokens/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /set up project/i })).not.toBeInTheDocument();
  });

  it("keeps manual slug edits and supports a custom default environment when creating a project", async () => {
    const user = userEvent.setup();
    const existingProject = createProject({
      metrics: {
        monthly_bundle_requests: 4,
        monthly_raw_ingested_events: 40,
        retained_bundles: 2,
        monthly_alert_deliveries: 1
      }
    });
    let projects = [existingProject];

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === "POST") {
        expect(init.body).toBe(JSON.stringify({
          name: "Ops Platform",
          slug: "ops-control-plane",
          environment_default: "preview"
        }));

        const createdProject = createProject({
          project_id: "proj_789",
          name: "Ops Platform",
          slug: "ops-control-plane",
          environment_default: "preview"
        });
        projects = [existingProject, createdProject];

        return jsonResponse(201, {
          project: createdProject
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects"]} />);

    await screen.findByRole("heading", { name: /projects/i, level: 1 });

    await user.click(screen.getByRole("button", { name: /create project/i }));
    await user.type(await screen.findByLabelText(/project name/i), "Ops API");
    expect(screen.getByLabelText(/project slug/i)).toHaveValue("ops-api");

    await user.clear(screen.getByLabelText(/project slug/i));
    await user.type(screen.getByLabelText(/project slug/i), "ops-control-plane");
    await user.clear(screen.getByLabelText(/project name/i));
    await user.type(screen.getByLabelText(/project name/i), "Ops Platform");

    expect(screen.getByLabelText(/project slug/i)).toHaveValue("ops-control-plane");

    await user.selectOptions(screen.getByLabelText(/default environment/i), "__custom__");
    await user.type(screen.getByLabelText(/custom environment/i), "preview");
    await user.click(screen.getByRole("button", { name: /^create project$/i }));

    expect(await screen.findByText(/project details/i)).toBeInTheDocument();
    expect(screen.getByText(/^ops-control-plane$/i)).toBeInTheDocument();
    expect(screen.getByText(/^preview$/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /set up project/i })).not.toBeInTheDocument();
  });

  it("creates a project token and reveals the plaintext once", async () => {
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
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/tokens") && init?.method === undefined) {
        return jsonResponse(200, {
          tokens: [createProjectToken()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/tokens") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(JSON.stringify({ label: "CI deploy" }));

        return jsonResponse(201, {
          token: createProjectToken({
            token_id: "proj_tok_456",
            label: "CI deploy",
            plaintext: "dbundle_proj_secret_123"
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/tokens"]} />);

    expect(await screen.findByText(/production ingest/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create project token/i }));
    await user.type(await screen.findByLabelText(/token label/i), "CI deploy");
    await user.click(screen.getByRole("button", { name: /^create token$/i }));

    const revealRegion = await screen.findByRole("region", { name: /new token secret/i });
    expect(within(revealRegion).getByText(/dbundle_proj_secret_123/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/ci deploy/i)).toBeInTheDocument();
    });
  });

  it("shows the project token empty state with a create action", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/tokens") && init?.method === undefined) {
        return jsonResponse(200, {
          tokens: []
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/tokens"]} />);

    expect(await screen.findByText(/no project tokens yet/i)).toBeInTheDocument();
    expect(screen.getByText(/connect an sdk or environment-specific deploy flow/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /create project token/i }).length).toBe(2);
  });

  it("shows project settings details, install-guidance framing, and destructive-actions structure", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ role: "member" })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject()]
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    await waitFor(() => {
      expect(screen.getAllByText(/main-app/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/production/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit project/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /install guidance entry point/i, level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open github automation/i })).toHaveAttribute("href", "/projects/proj_123/github");
    expect(screen.getByRole("button", { name: /delete project/i })).toBeDisabled();
  });

  it("shows paid-tier github settings state and retries a failed delivery", async () => {
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
          projects: [createProject({ organization_plan: "solo" })]
        });
      }

      if (url.endsWith("/v1/github/installation") && init?.method === undefined) {
        return jsonResponse(200, {
          installation: createGitHubInstallation()
        });
      }

      if (url.endsWith("/v1/github/repositories") && init?.method === undefined) {
        return jsonResponse(200, {
          repositories: [createGitHubRepository()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/repo") && init?.method === undefined) {
        return jsonResponse(200, {
          repo: createProjectGitHubRepo()
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/rules") && init?.method === undefined) {
        return jsonResponse(200, {
          rules: [createGitHubDispatchRule()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/deliveries?limit=20") && init?.method === undefined) {
        return jsonResponse(200, {
          deliveries: [createGitHubDispatchDelivery()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/deliveries/gdd_123/retry") && init?.method === "POST") {
        return jsonResponse(200, {
          delivery: createGitHubDispatchDelivery({
            status: "retrying",
            last_error: null,
            github_status_code: null
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/github"]} />);

    expect((await screen.findAllByText(/debugbundle\/app/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/high severity incidents/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/repository not found/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry delivery/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, requestInit]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/github/deliveries/gdd_123/retry") &&
            requestInit?.method === "POST"
        )
      ).toBe(true);
    });

    expect(await screen.findByText(/^retrying$/i)).toBeInTheDocument();
  });

  it("shows a github connection lost warning for suspended installations", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ organization_plan: "team" })]
        });
      }

      if (url.endsWith("/v1/github/installation") && init?.method === undefined) {
        return jsonResponse(200, {
          installation: createGitHubInstallation({ status: "suspended" })
        });
      }

      if (url.endsWith("/v1/github/app/install-url") && init?.method === undefined) {
        return jsonResponse(200, {
          install_url: "https://github.com/apps/debugbundle-automation/installations/new"
        });
      }

      if (url.endsWith("/v1/github/repositories") && init?.method === undefined) {
        return jsonResponse(200, {
          repositories: [createGitHubRepository()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/repo") && init?.method === undefined) {
        return jsonResponse(200, {
          repo: createProjectGitHubRepo()
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/rules") && init?.method === undefined) {
        return jsonResponse(200, {
          rules: [createGitHubDispatchRule()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/deliveries?limit=20") && init?.method === undefined) {
        return jsonResponse(200, {
          deliveries: []
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/github"]} />);

    expect(await screen.findByText(/github connection lost/i)).toBeInTheDocument();
    expect(screen.getByText(/dispatches are paused until the installation is active again/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /reconnect github app/i })).toHaveAttribute(
      "href",
      "https://github.com/apps/debugbundle-automation/installations/new"
    );
  });

  it("shows setup guidance when no github installation is connected yet", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ organization_plan: "team" })]
        });
      }

      if (url.endsWith("/v1/github/installation") && init?.method === undefined) {
        return jsonResponse(404, { error: "installation_not_found" });
      }

      if (url.endsWith("/v1/github/app/install-url") && init?.method === undefined) {
        return jsonResponse(200, {
          install_url: "https://github.com/apps/debugbundle-automation/installations/new"
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/repo") && init?.method === undefined) {
        return jsonResponse(404, { error: "repo_not_found" });
      }

      if (url.endsWith("/v1/projects/proj_123/github/rules") && init?.method === undefined) {
        return jsonResponse(200, { rules: [] });
      }

      if (url.endsWith("/v1/projects/proj_123/github/deliveries?limit=20") && init?.method === undefined) {
        return jsonResponse(200, { deliveries: [] });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/github"]} />);

    expect(await screen.findByText(/connect the github app to start automation/i)).toBeInTheDocument();
    expect(screen.getByText(/no github app installation is connected to this workspace yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /install github app/i })).toHaveAttribute(
      "href",
      "https://github.com/apps/debugbundle-automation/installations/new"
    );
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).endsWith("/v1/github/repositories"))).toBe(false);
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).endsWith("/v1/projects/proj_123/github/repo"))).toBe(false);
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).endsWith("/v1/projects/proj_123/github/rules"))).toBe(false);
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).endsWith("/v1/projects/proj_123/github/deliveries?limit=20"))).toBe(false);
  });

  it("keeps setup actionable and explicit when the install-url helper route is unavailable", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ organization_plan: "team" })]
        });
      }

      if (url.endsWith("/v1/github/installation") && init?.method === undefined) {
        return jsonResponse(404, { error: "installation_not_found" });
      }

      if (url.endsWith("/v1/github/app/install-url") && init?.method === undefined) {
        return jsonResponse(404, { error: "not_found" });
      }

      if (url.endsWith("/v1/projects/proj_123/github/repo") && init?.method === undefined) {
        return jsonResponse(404, { error: "repo_not_found" });
      }

      if (url.endsWith("/v1/projects/proj_123/github/rules") && init?.method === undefined) {
        return jsonResponse(200, { rules: [] });
      }

      if (url.endsWith("/v1/projects/proj_123/github/deliveries?limit=20") && init?.method === undefined) {
        return jsonResponse(200, { deliveries: [] });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/github"]} />);

    expect(await screen.findByText(/connect the github app to start automation/i)).toBeInTheDocument();
    expect(screen.getByText(/no github app installation is connected to this workspace yet/i)).toBeInTheDocument();
    expect(screen.getByText(/the github app install link could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /install github app/i })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).endsWith("/v1/projects/proj_123/github/repo"))).toBe(false);
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).endsWith("/v1/projects/proj_123/github/rules"))).toBe(false);
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).endsWith("/v1/projects/proj_123/github/deliveries?limit=20"))).toBe(false);
  });

  it("shows a specific message when github automation is not configured on the api", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ organization_plan: "team" })]
        });
      }

      if (url.endsWith("/v1/github/installation") && init?.method === undefined) {
        return jsonResponse(503, { error: "github_not_configured" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/github"]} />);

    expect(await screen.findByText(/github automation is not configured on the api yet/i)).toBeInTheDocument();
    expect(screen.getByText(/set github_app_id, github_app_private_key, and github_app_webhook_secret/i)).toBeInTheDocument();
  });

  it("routes free-plan github automation upsells to billing", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ organization_plan: "free" })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ organization_plan: "free" })]
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/github"]} />);

    expect(await screen.findByText(/upgrade to solo or team to connect github automation/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open billing/i })).toHaveAttribute("href", "/billing");
  });

  it("lets owners connect and remove a github repository from the project github page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ organization_plan: "team" })]
        });
      }

      if (url.endsWith("/v1/github/installation") && init?.method === undefined) {
        return jsonResponse(200, {
          installation: createGitHubInstallation()
        });
      }

      if (url.endsWith("/v1/github/repositories") && init?.method === undefined) {
        return jsonResponse(200, {
          repositories: [createGitHubRepository(), createGitHubRepository({ id: 2, name: "worker", full_name: "debugbundle/worker" })]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/repo") && init?.method === undefined) {
        return jsonResponse(404, { error: "repo_not_found" });
      }

      if (url.endsWith("/v1/projects/proj_123/github/rules") && init?.method === undefined) {
        return jsonResponse(200, { rules: [] });
      }

      if (url.endsWith("/v1/projects/proj_123/github/deliveries?limit=20") && init?.method === undefined) {
        return jsonResponse(200, { deliveries: [] });
      }

      if (url.endsWith("/v1/projects/proj_123/github/repo") && init?.method === "PUT") {
        expect(init.body).toBe(JSON.stringify({ owner: "debugbundle", repo: "worker" }));
        return jsonResponse(200, {
          repo: createProjectGitHubRepo({ repo_name: "worker", default_branch: "main" })
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/repo") && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/github"]} />);

    expect(await screen.findByText(/no github repository is assigned to this project yet/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/available repositories/i), "debugbundle/worker");
    await user.click(screen.getByRole("button", { name: /connect repository/i }));

    expect((await screen.findAllByText(/debugbundle\/worker/i)).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /remove repository/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, requestInit]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/github/repo") && requestInit?.method === "DELETE"
        )
      ).toBe(true);
    });

    expect(await screen.findByText(/no github repository is assigned to this project yet/i)).toBeInTheDocument();
  });

  it("lets owners create and delete a github dispatch rule from the project github page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ organization_plan: "solo" })]
        });
      }

      if (url.endsWith("/v1/github/installation") && init?.method === undefined) {
        return jsonResponse(200, {
          installation: createGitHubInstallation()
        });
      }

      if (url.endsWith("/v1/github/repositories") && init?.method === undefined) {
        return jsonResponse(200, {
          repositories: [createGitHubRepository()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/repo") && init?.method === undefined) {
        return jsonResponse(200, {
          repo: createProjectGitHubRepo()
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/rules") && init?.method === undefined) {
        return jsonResponse(200, { rules: [] });
      }

      if (url.endsWith("/v1/projects/proj_123/github/deliveries?limit=20") && init?.method === undefined) {
        return jsonResponse(200, { deliveries: [] });
      }

      if (url.endsWith("/v1/projects/proj_123/github/rules") && init?.method === "POST") {
        return jsonResponse(201, {
          rule: createGitHubDispatchRule({
            rule_id: "ghr_999",
            name: "Critical incidents",
            event_types: ["bundle.created"],
            environments: ["production"],
            services: ["checkout-api"],
            severity_min: "critical",
            incident_status: "new_only",
            cooldown_seconds: 900
          })
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/rules/ghr_999") && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/github"]} />);

    expect(await screen.findByText(/no github dispatch rules are configured yet/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create rule/i }));
    await user.type(screen.getByLabelText(/^rule name$/i), "Critical incidents");
    await user.selectOptions(screen.getByLabelText(/event type/i), "bundle.created");
    await user.type(screen.getByLabelText(/environment list/i), "production");
    await user.type(screen.getByLabelText(/service list/i), "checkout-api");
    await user.selectOptions(screen.getByLabelText(/minimum severity/i), "critical");
    await user.selectOptions(screen.getByLabelText(/incident state/i), "new_only");
    await user.clear(screen.getByLabelText(/cooldown seconds/i));
    await user.type(screen.getByLabelText(/cooldown seconds/i), "900");
    await user.click(screen.getByRole("button", { name: /^create rule$/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, requestInit]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/github/rules") && requestInit?.method === "POST"
        )
      ).toBe(true);
    });

    expect(await screen.findByText(/^critical incidents$/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /delete rule critical incidents/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, requestInit]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/github/rules/ghr_999") && requestInit?.method === "DELETE"
        )
      ).toBe(true);
    });

    expect(await screen.findByText(/no github dispatch rules are configured yet/i)).toBeInTheDocument();
  });

  it("lets owners edit a github dispatch rule from the project github page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ organization_plan: "team" })]
        });
      }

      if (url.endsWith("/v1/github/installation") && init?.method === undefined) {
        return jsonResponse(200, {
          installation: createGitHubInstallation()
        });
      }

      if (url.endsWith("/v1/github/repositories") && init?.method === undefined) {
        return jsonResponse(200, {
          repositories: [createGitHubRepository()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/repo") && init?.method === undefined) {
        return jsonResponse(200, {
          repo: createProjectGitHubRepo()
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/rules") && init?.method === undefined) {
        return jsonResponse(200, {
          rules: [createGitHubDispatchRule()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/deliveries?limit=20") && init?.method === undefined) {
        return jsonResponse(200, { deliveries: [] });
      }

      if (url.endsWith("/v1/projects/proj_123/github/rules/ghr_123") && init?.method === "PATCH") {
        return jsonResponse(200, {
          rule: createGitHubDispatchRule({
            name: "Critical only",
            severity_min: "critical",
            cooldown_seconds: 900,
            incident_status: "new_only"
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/github"]} />);

    expect(await screen.findByText(/high severity incidents/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /edit rule high severity incidents/i }));
    await user.clear(screen.getByLabelText(/^rule name$/i));
    await user.type(screen.getByLabelText(/^rule name$/i), "Critical only");
    await user.selectOptions(screen.getByLabelText(/minimum severity/i), "critical");
    await user.selectOptions(screen.getByLabelText(/incident state/i), "new_only");
    await user.clear(screen.getByLabelText(/cooldown seconds/i));
    await user.type(screen.getByLabelText(/cooldown seconds/i), "900");
    await user.click(screen.getByRole("button", { name: /^save rule$/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, requestInit]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/github/rules/ghr_123") && requestInit?.method === "PATCH"
        )
      ).toBe(true);
    });

    expect(await screen.findByText(/^critical only$/i)).toBeInTheDocument();
  });

  it("deletes a project from the project settings destructive action", async () => {
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
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123") && init?.method === "DELETE") {
        expect(init.credentials).toBe("include");

        return jsonResponse(200, {
          project: {
            project_id: "proj_123",
            organization_id: "org_123",
            name: "Main App",
            slug: "main-app",
            environment_default: "production",
            plan: "free",
            created_at: "2026-03-17T00:00:00.000Z",
            updated_at: "2026-03-17T00:00:00.000Z"
          }
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    const deleteButton = await screen.findByRole("button", { name: /delete project/i });
    expect(deleteButton).toBeEnabled();

    await user.click(deleteButton);
    const confirmationDialog = await screen.findByRole("alertdialog");
    const confirmationInput = within(confirmationDialog).getByLabelText(/confirmation phrase/i);
    const confirmDeleteButton = within(confirmationDialog).getByRole("button", { name: /^delete project$/i });

    expect(confirmDeleteButton).toBeDisabled();

    await user.type(confirmationInput, "delete Main App");
    expect(confirmDeleteButton).toBeEnabled();

    await user.click(confirmDeleteButton);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) => requestUrl(input).endsWith("/v1/projects/proj_123") && init?.method === "DELETE"
        )
      ).toBe(true);
    });

    expect(await screen.findByRole("heading", { name: /projects/i, level: 1 })).toBeInTheDocument();
  });

  it("updates project details from the project settings modal", async () => {
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
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123") && init?.method === "PATCH") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(JSON.stringify({
          name: "Main API",
          slug: "main-api",
          environment_default: "preview"
        }));

        return jsonResponse(200, {
          project: createProject({
            name: "Main API",
            slug: "main-api",
            environment_default: "preview",
            updated_at: "2026-03-18T00:00:00.000Z"
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    await user.click(await screen.findByRole("button", { name: /edit project/i }));
    expect((await screen.findByRole("dialog")).className.includes("sm:max-w-2xl")).toBe(true);
    await user.clear(await screen.findByLabelText(/project name/i));
    await user.type(screen.getByLabelText(/project name/i), "Main API");
    await user.clear(screen.getByLabelText(/project slug/i));
    await user.type(screen.getByLabelText(/project slug/i), "main-api");
    await user.selectOptions(screen.getByLabelText(/default environment/i), "__custom__");
    await user.type(screen.getByLabelText(/custom environment/i), "preview");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) => requestUrl(input).endsWith("/v1/projects/proj_123") && init?.method === "PATCH"
        )
      ).toBe(true);
    });

    expect((await screen.findAllByText(/^main api$/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/^main-api$/i)).toBeInTheDocument();
    expect(screen.getByText(/^preview$/i)).toBeInTheDocument();
  });

  it("links into project settings from the projects management table", async () => {
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
          projects: [createProject()]
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects"]} />);

    expect(await screen.findByRole("heading", { name: /projects/i, level: 1 })).toBeInTheDocument();

    // Click the project row to navigate to project overview, then use tabs
    const mainAppRow = (await screen.findByText(/^main app$/i)).closest("tr");
    expect(mainAppRow).not.toBeNull();
    await user.click(mainAppRow as HTMLTableRowElement);

    await user.click(await screen.findByRole("tab", { name: /settings/i }));

    expect(await screen.findByRole("heading", { name: /install guidance entry point/i, level: 3 })).toBeInTheDocument();
  });

  it("shows project webhooks with recent delivery status and triggers a synthetic test delivery", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ role: "member" })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/webhooks?project_id=proj_123&limit=20") && init?.method === undefined) {
        return jsonResponse(200, {
          webhooks: [createWebhook()]
        });
      }

      if (url.endsWith("/v1/webhooks/wh_123/deliveries?limit=5") && init?.method === undefined) {
        return jsonResponse(200, {
          deliveries: [createWebhookDelivery()]
        });
      }

      if (url.endsWith("/v1/webhooks/wh_123/test") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(JSON.stringify({ event_type: "verification.passed" }));

        return jsonResponse(202, {
          delivery: createWebhookDelivery({
            delivery_id: "del_456",
            status: "pending",
            last_response_code: null,
            last_attempted_at: null
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/webhooks"]} />);

    // Wait for webhook content to load
    await screen.findByRole("button", { name: /send test webhook/i });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("/v1/webhooks/wh_123/deliveries?limit=5"))
      ).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: /send test webhook/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) => requestUrl(input).endsWith("/v1/webhooks/wh_123/test") && init?.method === "POST"
        )
      ).toBe(true);
    });
  });

  it("creates a project webhook and reveals the signing secret once", async () => {
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
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/webhooks?project_id=proj_123&limit=20") && init?.method === undefined) {
        return jsonResponse(200, {
          webhooks: []
        });
      }

      if (url.endsWith("/v1/webhooks") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(
          JSON.stringify({
            project_id: "proj_123",
            url: "https://hooks.example.test/created",
            events: ["bundle.created"],
            filters: {},
            is_enabled: true
          })
        );

        return jsonResponse(201, {
          webhook: createWebhook({
            webhook_id: "wh_456",
            url: "https://hooks.example.test/created",
            signing_secret: "dbundle_whsec_secret_123"
          })
        });
      }

      if (url.endsWith("/v1/webhooks/wh_456/deliveries?limit=5") && init?.method === undefined) {
        return jsonResponse(200, {
          deliveries: []
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/webhooks"]} />);

    await user.click(await screen.findByRole("button", { name: /create webhook/i }));
    await user.type(await screen.findByLabelText(/endpoint url/i), "https://hooks.example.test/created");
    await user.click(screen.getByRole("button", { name: /^create webhook$/i }));

    const revealRegion = await screen.findByRole("region", { name: /new webhook signing secret/i });
    expect(within(revealRegion).getByText(/dbundle_whsec_secret_123/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/hooks\.example\.test\/created/i)).toBeInTheDocument();
    });
  });

  it("creates a project webhook with expanded event options and delivery filters", async () => {
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
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/webhooks?project_id=proj_123&limit=20") && init?.method === undefined) {
        return jsonResponse(200, {
          webhooks: []
        });
      }

      if (url.endsWith("/v1/webhooks") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(
          JSON.stringify({
            project_id: "proj_123",
            url: "https://hooks.example.test/filtered",
            events: ["bundle.created", "bundle.reopened"],
            filters: {
              environment: ["production", "staging"],
              service: ["checkout-api", "worker"],
              severity_min: "high",
              bundle_type: ["failure"],
              verification: false
            },
            is_enabled: true
          })
        );

        return jsonResponse(201, {
          webhook: createWebhook({
            webhook_id: "wh_789",
            url: "https://hooks.example.test/filtered",
            events: ["bundle.created", "bundle.reopened"],
            filters: {
              environment: ["production", "staging"],
              service: ["checkout-api", "worker"],
              severity_min: "high",
              bundle_type: ["failure"],
              verification: false
            },
            signing_secret: "dbundle_whsec_secret_789"
          })
        });
      }

      if (url.endsWith("/v1/webhooks/wh_789/deliveries?limit=5") && init?.method === undefined) {
        return jsonResponse(200, {
          deliveries: []
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/webhooks"]} />);

    await user.click(await screen.findByRole("button", { name: /create webhook/i }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText(/bundle\.reopened/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/bundle\.resolved/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/verification\.passed/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/improvement_bundle\.created/i)).toBeInTheDocument();

    await user.type(await screen.findByLabelText(/endpoint url/i), "https://hooks.example.test/filtered");
    await user.click(screen.getByLabelText(/bundle\.reopened/i));
    await user.type(screen.getByLabelText(/environments/i), "production, staging");
    await user.type(screen.getByLabelText(/services/i), "checkout-api, worker");
    await user.selectOptions(screen.getByLabelText(/minimum severity/i), "high");
    await user.selectOptions(screen.getByLabelText(/verification scope/i), "non_verification_only");
    await user.click(screen.getByLabelText(/failure bundles/i));
    await user.click(screen.getByRole("button", { name: /^create webhook$/i }));

    await waitFor(() => {
      expect(screen.getByText(/hooks\.example\.test\/filtered/i)).toBeInTheDocument();
    });
  });

  it("shows webhook empty states for endpoints and deliveries", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/webhooks?project_id=proj_123&limit=20") && init?.method === undefined) {
        return jsonResponse(200, {
          webhooks: []
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/webhooks"]} />);

    expect(await screen.findByText(/no webhook endpoints yet/i)).toBeInTheDocument();
    expect(screen.getByText(/create a webhook to send lifecycle, verification, or automation events/i)).toBeInTheDocument();
    expect(screen.getByText(/no delivery attempts yet/i)).toBeInTheDocument();
    expect(screen.getByText(/send a test webhook to create the first delivery record/i)).toBeInTheDocument();
  });

  it("shows project alerts and existing rule visibility from the project-scoped route", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ role: "member" })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/alerts?project_id=proj_123&limit=20") && init?.method === undefined) {
        return jsonResponse(200, {
          alerts: [
            createAlert(),
            createAlert({
              alert_id: "alert_456",
              channel: "webhook",
              condition_type: "error_spike",
              severity_min: "high"
            })
          ]
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/alerts"]} />);

    expect(await screen.findByText(/new incident/i)).toBeInTheDocument();
    expect(await screen.findByText(/error spike/i)).toBeInTheDocument();
    expect(screen.getByText(/high/i)).toBeInTheDocument();
  });

  it("deletes a project alert rule from the web route", async () => {
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
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/alerts?project_id=proj_123&limit=20") && init?.method === undefined) {
        return jsonResponse(200, {
          alerts: [createAlert()]
        });
      }

      if (url.endsWith("/v1/alerts/alert_123") && init?.method === "DELETE") {
        expect(init.credentials).toBe("include");
        return new Response(null, { status: 204 });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/alerts"]} />);

    expect(await screen.findByText(/new incident/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /delete/i }));
    await user.click(await screen.findByRole("button", { name: /delete alert/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) => requestUrl(input).endsWith("/v1/alerts/alert_123") && init?.method === "DELETE"
        )
      ).toBe(true);
    });
  });

  it("creates a project alert rule from the web route", async () => {
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
          projects: [createProject({ organization_plan: "team" })]
        });
      }

      if (url.endsWith("/v1/alerts?project_id=proj_123&limit=20") && init?.method === undefined) {
        return jsonResponse(200, {
          alerts: []
        });
      }

      if (url.endsWith("/v1/alerts") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(
          JSON.stringify({
            project_id: "proj_123",
            channel: "slack",
            condition_type: "error_spike",
            severity_min: "critical",
            config: {
              webhook_url: "https://hooks.slack.com/services/T000/B000/XXX"
            },
            is_enabled: true
          })
        );

        return jsonResponse(201, {
          alert: createAlert({
            alert_id: "alert_789",
            channel: "slack",
            condition_type: "error_spike",
            severity_min: "critical"
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/alerts"]} />);

    await user.click(await screen.findByRole("button", { name: /create alert rule/i }));
    await user.selectOptions(await screen.findByLabelText(/channel/i), "slack");
    await user.type(screen.getByLabelText(/slack webhook url/i), "https://hooks.slack.com/services/T000/B000/XXX");
    await user.selectOptions(screen.getByLabelText(/condition/i), "error_spike");
    await user.selectOptions(screen.getByLabelText(/minimum severity/i), "critical");
    await user.click(screen.getByRole("button", { name: /^create alert rule$/i }));

    await waitFor(() => {
      expect(screen.getByText(/slack/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/critical/i)).toBeInTheDocument();
  });

  it("limits free-project alert channels to email and alert webhook", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ organization_plan: "free" })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ organization_plan: "free" })]
        });
      }

      if (url.endsWith("/v1/alerts?project_id=proj_123&limit=20") && init?.method === undefined) {
        return jsonResponse(200, {
          alerts: []
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/alerts"]} />);

    await user.click(await screen.findByRole("button", { name: /create alert rule/i }));

    const channelSelect = await screen.findByLabelText(/channel/i);
    const channelOptions = within(channelSelect).getAllByRole("option");

    expect(channelOptions.map((option) => option.textContent)).toEqual(["Email", "Alert webhook"]);
    await user.selectOptions(channelSelect, "webhook");
    expect(screen.getByText(/separate from the Webhooks tab/i)).toBeInTheDocument();
  });

  it("shows the project alert empty state with a create action", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/alerts?project_id=proj_123&limit=20") && init?.method === undefined) {
        return jsonResponse(200, {
          alerts: []
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/alerts"]} />);

    expect(await screen.findByText(/no alert rules yet/i)).toBeInTheDocument();
    expect(screen.getByText(/create a rule to send incident events where your team will see them/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /create alert rule/i }).length).toBe(2);
  });

  it("shows organization members for owners and blocks member-role callers from the management surface", async () => {
    const ownerFetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/organization/members") && init?.method === undefined) {
        return jsonResponse(200, {
          members: [createOrganizationMember(), createOrganizationMember({ user_id: "usr_456", email: "casey@example.com", role: "member" })]
        });
      }

      if (url.endsWith("/v1/organization/members/invites") && init?.method === undefined) {
        return jsonResponse(200, {
          invites: [createOrganizationInvite()]
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", ownerFetchMock);

    const ownerView = render(<App initialEntries={["/organization/members"]} />);

    expect(await screen.findByRole("heading", { name: /organization members/i, level: 1 })).toBeInTheDocument();
    expect(await screen.findByText(/casey@example.com/i)).toBeInTheDocument();
    expect(await screen.findByText(/pending@example.com/i)).toBeInTheDocument();
    ownerView.unmount();

    const memberFetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ role: "member" })
        });
      }

      if (url.endsWith("/v1/organization/members") && init?.method === undefined) {
        return jsonResponse(403, { error: "forbidden" });
      }

      if (url.endsWith("/v1/organization/members/invites") && init?.method === undefined) {
        return jsonResponse(403, { error: "forbidden" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", memberFetchMock);

    render(<App initialEntries={["/organization/members"]} />);

    expect(await screen.findByText(/owner permissions are required to manage members/i)).toBeInTheDocument();
  });

  it("invites a member, changes a member role, removes a member, and cancels an invite from the org members page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/organization/members") && init?.method === undefined) {
        return jsonResponse(200, {
          members: [
            createOrganizationMember(),
            createOrganizationMember({ user_id: "usr_456", email: "casey@example.com", role: "member" })
          ]
        });
      }

      if (url.endsWith("/v1/organization/members/invites") && init?.method === undefined) {
        return jsonResponse(200, {
          invites: [createOrganizationInvite()]
        });
      }

      if (url.endsWith("/v1/organization/members/invite") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        const body = JSON.parse(init.body as string) as { email: string; role: string };
        return jsonResponse(201, {
          invite: createOrganizationInvite({ invite_id: "inv_456", email: body.email, role: body.role as "owner" | "member" })
        });
      }

      if (url.endsWith("/v1/organization/members/usr_456") && init?.method === "PATCH") {
        expect(init.credentials).toBe("include");
        const body = JSON.parse(init.body as string) as { role: string };
        return jsonResponse(200, {
          member: createOrganizationMember({ user_id: "usr_456", email: "casey@example.com", role: body.role as "owner" | "member" })
        });
      }

      if (url.endsWith("/v1/organization/members/usr_456") && init?.method === "DELETE") {
        return jsonResponse(200, {
          member: createOrganizationMember({ user_id: "usr_456", email: "casey@example.com", role: "member" })
        });
      }

      if (url.includes("/v1/organization/members/invites/inv_123") && init?.method === "DELETE") {
        return jsonResponse(200, {
          invite: createOrganizationInvite()
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/organization/members"]} />);

    expect(await screen.findByRole("heading", { name: /organization members/i, level: 1 })).toBeInTheDocument();
    expect(await screen.findByText(/casey@example.com/i)).toBeInTheDocument();

    // Invite a new member
    await user.click(screen.getByRole("button", { name: /invite member/i }));
    expect((await screen.findByRole("dialog")).className.includes("sm:max-w-lg")).toBe(true);
    expect(screen.getByText(/invite someone to this organization/i)).toBeInTheDocument();
    await user.type(await screen.findByLabelText(/email address/i), "newbie@example.com");
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() => {
      expect(screen.getByText(/newbie@example.com/i)).toBeInTheDocument();
    });

    // Change casey's role
    const caseyRoleSelect = screen.getByLabelText(/role for casey@example.com/i);
    await user.selectOptions(caseyRoleSelect, "owner");

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) => requestUrl(input).endsWith("/v1/organization/members/usr_456") && init?.method === "PATCH"
        )
      ).toBe(true);
    });

    // Cancel the original pending invite
    const cancelButtons = screen.getAllByRole("button", { name: /^cancel$/i });
    expect(cancelButtons[0]).toBeDefined();
    await user.click(cancelButtons[0] as HTMLButtonElement);
    await user.click(await screen.findByRole("button", { name: /cancel invite/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) => requestUrl(input).includes("/v1/organization/members/invites/inv_123") && init?.method === "DELETE"
        )
      ).toBe(true);
    });
  });

  it("shows organization overview summary with entry points into member and billing management", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject(), createProject({ project_id: "proj_456", name: "Worker", slug: "worker" })]
        });
      }

      if (url.endsWith("/v1/organization/members") && init?.method === undefined) {
        return jsonResponse(200, {
          members: [createOrganizationMember(), createOrganizationMember({ user_id: "usr_456", email: "casey@example.com", role: "member" })]
        });
      }

      if (url.endsWith("/v1/organization/members/invites") && init?.method === undefined) {
        return jsonResponse(200, {
          invites: [createOrganizationInvite()]
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "team",
            active_projects: 2,
            capacity_units: {
              total: 5,
              included: 3,
              additional_purchased: 2,
              pending_reduction: null
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/organization"]} />);

    expect(await screen.findByRole("heading", { name: /organization/i, level: 1 })).toBeInTheDocument();
    expect(screen.getAllByText(/org_123/i).length).toBeGreaterThan(0);
    expect(await screen.findByText(/2 members and 1 pending invite/i)).toBeInTheDocument();
    expect(await screen.findByText(/team plan with 2 active projects and 5 allowance units/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open member management/i })).toHaveAttribute("href", "/organization/members");
    expect(screen.getByRole("link", { name: /open billing management/i })).toHaveAttribute("href", "/billing");
  });

  it("routes the app-shell organization navigation through the overview and shows member-role gates", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ role: "member" })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/organization/members") && init?.method === undefined) {
        return jsonResponse(403, { error: "forbidden" });
      }

      if (url.endsWith("/v1/organization/members/invites") && init?.method === undefined) {
        return jsonResponse(403, { error: "forbidden" });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(403, { error: "forbidden" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    await user.click(await screen.findByRole("link", { name: /organization/i }));

    expect(await screen.findByRole("heading", { name: /organization/i, level: 1 })).toBeInTheDocument();
    expect(await screen.findByText(/1 active project/i)).toBeInTheDocument();
    expect(await screen.findByText(/owner permissions are required to manage members/i)).toBeInTheDocument();
    expect(await screen.findByText(/owner permissions are required to manage billing/i)).toBeInTheDocument();
  });

  it("hides organization navigation and gates organization routes outside the Team tier", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ organization_plan: "free" })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ organization_plan: "free" })]
        });
      }

      if (url.endsWith("/v1/organization/members") && init?.method === undefined) {
        return jsonResponse(403, { error: "forbidden" });
      }

      if (url.endsWith("/v1/organization/members/invites") && init?.method === undefined) {
        return jsonResponse(403, { error: "forbidden" });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(403, { error: "forbidden" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/organization"]} />);

    expect(await screen.findByRole("link", { name: /review plan options/i })).toHaveAttribute("href", "/billing");
    expect(screen.queryByRole("link", { name: /^organization$/i })).not.toBeInTheDocument();
  });

  it("renders the dashboard when projects are returned without metrics", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(404, { error: "billing_not_found" });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [
            {
              project_id: "proj_123",
              organization_id: "org_123",
              name: "Main App",
              slug: "main-app",
              environment_default: "production",
              plan: "free",
              created_at: "2026-03-17T00:00:00.000Z",
              updated_at: "2026-03-17T00:00:00.000Z"
            }
          ]
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    expect(await screen.findByText(/main app/i)).toBeInTheDocument();

    const mainAppRow = screen.getByText(/main app/i).closest("tr");
    expect(mainAppRow).not.toBeNull();
    expect(within(mainAppRow as HTMLTableRowElement).getAllByText(/^0$/)).toHaveLength(2);
  });

  it("renders dashboard activity cards from project metrics instead of billing-cycle totals", async () => {
    function cardWithValueExists(label: string, value: RegExp): boolean {
      return screen.queryAllByText(value).some((element) => {
        const card = element.closest("[data-slot='card']");
        return card?.textContent?.includes(label) ?? false;
      });
    }

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
              project_id: "proj_123",
              name: "Main App",
              metrics: {
                monthly_bundle_requests: 14,
                monthly_raw_ingested_events: 44,
                retained_bundles: 11,
                monthly_alert_deliveries: 2
              }
            }),
            createProject({
              project_id: "proj_456",
              name: "Worker",
              slug: "worker",
              metrics: {
                monthly_bundle_requests: 8,
                monthly_raw_ingested_events: 6,
                retained_bundles: 3,
                monthly_alert_deliveries: 1
              }
            })
          ]
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary({
            allowances: {
              monthly_bundle_requests: {
                used: 999,
                limit: 1000
              },
              monthly_raw_ingested_events: {
                used: 999,
                limit: 1000
              },
              retained_bundle_cap: {
                used: 999,
                limit: 1000
              },
              monthly_remote_activations: {
                used: 0,
                limit: 0
              },
              monthly_alert_deliveries: {
                used: 999,
                limit: 1000
              }
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    await waitFor(() => {
      expect(cardWithValueExists("Bundle Requests", /^22$/)).toBe(true);
      expect(cardWithValueExists("Ingested Events", /^50$/)).toBe(true);
      expect(cardWithValueExists("Retained Bundles", /^14$/)).toBe(true);
      expect(cardWithValueExists("Alert Deliveries", /^3$/)).toBe(true);
    });

    expect(screen.getAllByText(/this month across all projects/i)).toHaveLength(3);
    expect(screen.getByText(/current total across all projects/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).endsWith("/v1/billing"))).toBe(false);
  });

  it("renders billing summary for owners and starts the Stripe checkout entry point from the billing page", async () => {
    const user = userEvent.setup();
    const locationAssign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        assign: locationAssign
      }
    });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary()
        });
      }

      if (url.endsWith("/v1/billing/checkout") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(JSON.stringify({ target_plan: "solo" }));

        return jsonResponse(200, {
          url: "https://billing.stripe.com/checkout/solo"
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing"]} />);

    expect(await screen.findByRole("heading", { name: /billing/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /billing/i })).toBeInTheDocument();
    expect((await screen.findAllByText(/current plan/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/active projects/i)).toBeInTheDocument();
    expect(screen.getByText(/total allowance units/i)).toBeInTheDocument();
    expect(screen.getByText(/projects stay unlimited\. this account currently has 1 active project\./i)).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /upgrade to solo/i }));

    expect(locationAssign).toHaveBeenCalledWith("https://billing.stripe.com/checkout/solo");
  });

  it("confirms billing and shows a success dialog after a successful Stripe checkout return", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary()
        });
      }

      if (url.endsWith("/v1/billing/checkout/confirm") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(JSON.stringify({ session_id: "cs_test_123" }));

        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "solo",
            stripe_customer_id: "cus_123",
            capacity_units: {
              total: 2,
              included: 2,
              additional_purchased: 0,
              pending_reduction: null
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing?checkout=success&session_id=cs_test_123"]} />);

    expect(await screen.findByRole("heading", { name: /billing/i, level: 1 })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/^solo$/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("dialog", { name: /solo is active/i })).toBeInTheDocument();
    expect(screen.getByText(/new tier is available across this account/i)).toBeInTheDocument();

    expect(
      fetchMock.mock.calls.filter(([input, requestInit]) => {
        return requestUrl(input).endsWith("/v1/billing/checkout/confirm") && requestInit?.method === "POST";
      }).length
    ).toBe(1);
  });

  it("shows verification and owner gates on the billing surface", async () => {
    const ownerFetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ email_verified_at: null })
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary({
            email_verification_required: true,
            plan: "solo",
            stripe_customer_id: "cus_123",
            active_projects: 1,
            capacity_units: {
              total: 2,
              included: 2,
              additional_purchased: 0,
              pending_reduction: null
            },
            allowances: {
              monthly_bundle_requests: {
                used: 180,
                limit: 500
              },
              monthly_raw_ingested_events: {
                used: 800,
                limit: 4000
              },
              retained_bundle_cap: {
                used: 40,
                limit: 300
              },
              monthly_remote_activations: {
                used: 3,
                limit: 50
              },
              monthly_alert_deliveries: {
                used: 10,
                limit: 150
              }
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", ownerFetchMock);

    const ownerView = render(<App initialEntries={["/billing"]} />);

    expect(await screen.findByText(/verify your email before enabling billing changes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /manage subscription/i })).toBeDisabled();
    expect(screen.getByText(/^solo$/i).className.includes("border-border")).toBe(true);
    expect(screen.getByText(/^solo$/i).className.includes("text-primary")).toBe(false);
    ownerView.unmount();

    const memberFetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ role: "member" })
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(403, { error: "forbidden" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", memberFetchMock);

    render(<App initialEntries={["/billing"]} />);

    expect(await screen.findByText(/owner permissions are required to manage billing/i)).toBeInTheDocument();
  });

  it("lets owners schedule a capacity reduction from the billing page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "solo",
            stripe_customer_id: "cus_123",
            active_projects: 3,
            capacity_units: {
              total: 4,
              included: 2,
              additional_purchased: 2,
              pending_reduction: null
            },
            usage_window: {
              starts_at: "2026-03-23T11:56:12.000Z",
              ends_at: "2026-04-23T11:56:12.000Z"
            }
          })
        });
      }

      if (url.endsWith("/v1/billing/capacity/scheduled-reduction") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(JSON.stringify({ target_additional_capacity_units: 0 }));

        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "solo",
            stripe_customer_id: "cus_123",
            active_projects: 3,
            capacity_units: {
              total: 4,
              included: 2,
              additional_purchased: 2,
              pending_reduction: {
                additional_purchased: 0,
                total: 2,
                effective_at: "2026-04-23T11:56:12.000Z"
              }
            },
            usage_window: {
              starts_at: "2026-03-23T11:56:12.000Z",
              ends_at: "2026-04-23T11:56:12.000Z"
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing"]} />);

    expect(await screen.findByRole("heading", { name: /billing/i, level: 1 })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /manage capacity/i }));
    expect(await screen.findByRole("heading", { name: /manage allowance capacity/i })).toBeInTheDocument();

    const reductionInput = screen.getByLabelText(/purchased extra units after renewal/i);
    await user.clear(reductionInput);
    await user.type(reductionInput, "0");
    await user.click(screen.getByRole("button", { name: /schedule reduction/i }));

    expect((await screen.findAllByText(/dropping to 2 total units/i)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /keep current units/i })).toBeInTheDocument();
  });
});
