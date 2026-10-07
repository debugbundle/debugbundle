// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import {
  createGitHubDispatchDelivery,
  createGitHubDispatchRule,
  createGitHubInstallation,
  createGitHubRepository,
  createProject,
  createProjectGitHubRepo,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

describe("github setup", () => {
  it("shows github automation as unavailable on free projects when no preserved setup exists", async () => {
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

      if (url.endsWith("/v1/alerts?project_id=proj_123&limit=100")) {
        return jsonResponse(200, { alerts: [] });
      }

      if (url.endsWith("/v1/webhooks?project_id=proj_123&limit=100")) {
        return jsonResponse(200, { webhooks: [] });
      }

      if (url.endsWith("/v1/projects/proj_123/probes")) {
        return jsonResponse(200, { activations: [] });
      }

      if (url.endsWith("/v1/projects/proj_123/availability-checks?limit=100")) {
        return jsonResponse(200, {
          checks: [],
          limits: {
            max_checks_per_project: 1,
            max_monitored_projects_per_organization: 3,
            max_active_checks_per_organization: 3,
            min_interval_seconds: 300,
            recommended_failure_threshold: 3
          }
        });
      }

      if (url.endsWith("/v1/weekly-report-channels?project_id=proj_123&limit=100")) {
        return jsonResponse(200, { channels: [] });
      }

      if (url.endsWith("/v1/projects/proj_123/capture-policy")) {
        return jsonResponse(200, {
          access_mode: "manage",
          policy: {
            preset: "balanced",
            capture_logs: "warning",
            capture_request_events: "failures_only",
            capture_breadcrumbs: "exception_only",
            capture_probe_events: "buffer_only",
            immediate_client_error_statuses: []
          },
          overrides: {
            capture_logs: null,
            capture_request_events: null,
            capture_breadcrumbs: null,
            capture_probe_events: null,
            immediate_client_error_statuses: null
          }
        });
      }

      if (url.endsWith("/v1/projects/proj_123/improvement-settings")) {
        return jsonResponse(200, {
          access_mode: "manage",
          cloud_automation_available: true,
          settings: {
            automated_improvement_bundles_enabled: true,
            improvement_bundle_sensitivity: "balanced"
          }
        });
      }

      if (url.endsWith("/v1/github/installation?project_id=proj_123")) {
        return jsonResponse(200, { installation: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123"]} />);

    expect(await screen.findByText(/setup at a glance/i)).toBeInTheDocument();
    const probesDescription = await screen.findByText(
      /^always-on probe buffers still work in the sdk, but remote probe activation requires solo or team\.$/i
    );
    const probesBlock = probesDescription.closest("div.rounded-lg");
    expect(probesBlock).not.toBeNull();
    expect(within(probesBlock as HTMLDivElement).getByText(/^solo\+ only$/i)).toBeInTheDocument();
    expect(within(probesBlock as HTMLDivElement).getByText(/^unavailable$/i)).toBeInTheDocument();
    expect(probesDescription).toBeInTheDocument();
    const githubDescription = screen.getByText(
      /^repository dispatch automation is not available on the free plan\.$/i
    );
    const githubBlock = githubDescription.closest("div.rounded-lg");
    expect(githubBlock).not.toBeNull();
    expect(within(githubBlock as HTMLDivElement).getByText(/^solo\+ only$/i)).toBeInTheDocument();
    expect(within(githubBlock as HTMLDivElement).getByText(/^unavailable$/i)).toBeInTheDocument();
    expect(githubDescription).toBeInTheDocument();
    const healthChecksBlock = screen.getByText(/^health checks$/i).closest("div.rounded-lg");
    expect(healthChecksBlock).not.toBeNull();
    expect(
      within(healthChecksBlock as HTMLDivElement).getByText(/^not configured$/i)
    ).toBeInTheDocument();
    expect(within(healthChecksBlock as HTMLDivElement).getByText(/^off$/i)).toBeInTheDocument();
    expect(
      within(healthChecksBlock as HTMLDivElement).getByText(
        /^no hosted health checks are configured yet\.$/i
      )
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        requestUrl(input).endsWith("/v1/alerts?project_id=proj_123&limit=100")
      )
    ).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("/github/"))).toBe(
      true
    );
  });

  it("shows retry actions only for failed github deliveries and retries them", async () => {
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

      if (
        url.endsWith("/v1/github/installation?project_id=proj_123") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          installation: createGitHubInstallation()
        });
      }

      if (url.includes("/v1/github/app/install-url") && init?.method === undefined) {
        return jsonResponse(200, {
          install_url: "https://github.com/apps/debugbundle-automation/installations/new"
        });
      }

      if (
        url.endsWith("/v1/github/repositories?project_id=proj_123") &&
        init?.method === undefined
      ) {
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

      if (
        url.endsWith("/v1/projects/proj_123/github/deliveries?limit=20") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          deliveries: [
            createGitHubDispatchDelivery(),
            createGitHubDispatchDelivery({
              delivery_id: "gdd_456",
              incident_id: "inc_456",
              target_title: "Backend timeout in worker sync",
              status: "delivered",
              attempt_count: 1,
              last_attempt_at: "2026-03-26T00:20:00.000Z",
              last_error: null,
              github_status_code: 204
            })
          ]
        });
      }

      if (
        url.endsWith("/v1/projects/proj_123/github/deliveries/gdd_123/retry") &&
        init?.method === "POST"
      ) {
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
    expect(screen.getByRole("link", { name: /manage repositories in github/i })).toHaveAttribute(
      "href",
      "https://github.com/apps/debugbundle-automation/installations/new"
    );
    const deliveriesTable = screen.getByRole("table");
    const failedRow = within(deliveriesTable)
      .getAllByRole("row")
      .find((row) => within(row).queryByText(/typeerror in checkout/i) !== null);
    const deliveredRow = within(deliveriesTable)
      .getAllByRole("row")
      .find((row) => within(row).queryByText(/backend timeout in worker sync/i) !== null);

    expect(failedRow).toBeDefined();
    expect(deliveredRow).toBeDefined();
    expect(
      within(failedRow as HTMLTableRowElement).getByRole("button", { name: /retry delivery/i })
    ).toBeInTheDocument();
    expect(
      within(deliveredRow as HTMLTableRowElement).queryByRole("button", { name: /retry delivery/i })
    ).toBeNull();

    await user.click(
      within(failedRow as HTMLTableRowElement).getByRole("button", { name: /retry delivery/i })
    );

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

      if (
        url.endsWith("/v1/github/installation?project_id=proj_123") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          installation: createGitHubInstallation({ status: "suspended" })
        });
      }

      if (url.includes("/v1/github/app/install-url") && init?.method === undefined) {
        return jsonResponse(200, {
          install_url: "https://github.com/apps/debugbundle-automation/installations/new"
        });
      }

      if (
        url.endsWith("/v1/github/repositories?project_id=proj_123") &&
        init?.method === undefined
      ) {
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

      if (
        url.endsWith("/v1/projects/proj_123/github/deliveries?limit=20") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          deliveries: []
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/github"]} />);

    expect(await screen.findByText(/github connection lost/i)).toBeInTheDocument();
    expect(
      screen.getByText(/dispatches are paused until the installation is active again/i)
    ).toBeInTheDocument();
    const reconnectLink = screen.getByRole("link", { name: /reconnect github app/i });
    expect(reconnectLink).toHaveAttribute(
      "href",
      "https://github.com/apps/debugbundle-automation/installations/new"
    );
    expect(reconnectLink).not.toHaveAttribute("target");
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

      if (
        url.endsWith("/v1/github/installation?project_id=proj_123") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, { installation: null });
      }

      if (url.includes("/v1/github/app/install-url") && init?.method === undefined) {
        return jsonResponse(200, {
          install_url: "https://github.com/apps/debugbundle-automation/installations/new"
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/repo") && init?.method === undefined) {
        return jsonResponse(200, { repo: null });
      }

      if (url.endsWith("/v1/projects/proj_123/github/rules") && init?.method === undefined) {
        return jsonResponse(200, { rules: [] });
      }

      if (
        url.endsWith("/v1/projects/proj_123/github/deliveries?limit=20") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, { deliveries: [] });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/github"]} />);

    expect(
      await screen.findByText(/connect the github app to start automation/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no github app installation is connected to this workspace yet/i)
    ).toBeInTheDocument();
    const installLink = screen.getByRole("link", { name: /install github app/i });
    expect(installLink).toHaveAttribute(
      "href",
      "https://github.com/apps/debugbundle-automation/installations/new"
    );
    expect(installLink).not.toHaveAttribute("target");
    expect(
      fetchMock.mock.calls.some(([input]) =>
        requestUrl(input).includes(
          "/v1/github/app/install-url?return_to=%2Fprojects%2Fproj_123%2Fgithub&project_id=proj_123"
        )
      )
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        requestUrl(input).endsWith("/v1/github/repositories?project_id=proj_123")
      )
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        requestUrl(input).endsWith("/v1/projects/proj_123/github/repo")
      )
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        requestUrl(input).endsWith("/v1/projects/proj_123/github/rules")
      )
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        requestUrl(input).endsWith("/v1/projects/proj_123/github/deliveries?limit=20")
      )
    ).toBe(false);
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

      if (
        url.endsWith("/v1/github/installation?project_id=proj_123") &&
        init?.method === undefined
      ) {
        return jsonResponse(503, { error: "github_not_configured" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/github"]} />);

    expect(
      await screen.findByText(/github automation is not configured on the api yet/i)
    ).toBeInTheDocument();
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

      if (
        url.endsWith("/v1/github/installation?project_id=proj_123") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, { installation: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/github"]} />);

    expect(
      await screen.findByText(/upgrade to solo or team to connect github automation/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open billing/i })).toHaveAttribute("href", "/billing");
  });

  it("shows preserved github setup as paused on free projects", async () => {
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

      if (
        url.endsWith("/v1/github/installation?project_id=proj_123") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          installation: createGitHubInstallation()
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

      if (
        url.endsWith("/v1/projects/proj_123/github/deliveries?limit=20") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, { deliveries: [] });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/github"]} />);

    expect(
      await screen.findByText(/github automation is paused while this project is on free/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/repository connected to this project/i)).toBeInTheDocument();
    expect(screen.getByText(/debugbundle\/app/i)).toBeInTheDocument();
    expect(screen.getByText(/high severity incidents/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create rule/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry delivery/i })).not.toBeInTheDocument();
  });
});
