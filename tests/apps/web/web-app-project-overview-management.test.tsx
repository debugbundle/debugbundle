// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import {
  createAlert,
  createGitHubDispatchRule,
  createGitHubInstallation,
  createProject,
  createProjectGitHubRepo,
  createSession,
  createWebhook,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";
import { createHealthRollup } from "./helpers/management-ui.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

describe("project overview management", () => {
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
                open_incidents: 12,
                regressed_incidents: 4,
                attention_incidents_today: 1,
                opened_incidents_today: 1,
                opened_incidents_month: 6
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
    expect(screen.getByText(/^16$/)).toBeInTheDocument();
    expect(screen.getByText(/^1$/)).toBeInTheDocument();
    expect(screen.getByText(/health status today/i)).toBeInTheDocument();
    expect(await screen.findByText(/^not set$/i)).toBeInTheDocument();
    expect(screen.getByText(/no health checks configured/i)).toBeInTheDocument();
    expect(screen.getByText(/^4$/)).toBeInTheDocument();

    expect(screen.getByRole("tab", { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /incidents/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /bundles/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /probes/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /alerts/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /webhooks/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /github/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /tokens/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /members/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /settings/i })).toBeInTheDocument();
  });

  it("shows project setup at a glance on the overview route", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ organization_plan: "team" })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ organization_plan: "team" })]
        });
      }

      if (url.endsWith("/v1/alerts?project_id=proj_123&limit=100")) {
        return jsonResponse(200, {
          alerts: [
            createAlert({
              alert_id: "alert_enabled",
              channel: "email",
              is_enabled: true
            }),
            createAlert({
              alert_id: "alert_disabled",
              channel: "webhook",
              is_enabled: false
            })
          ]
        });
      }

      if (url.endsWith("/v1/webhooks?project_id=proj_123&limit=100")) {
        return jsonResponse(200, {
          webhooks: [
            createWebhook({
              webhook_id: "wh_enabled",
              is_enabled: true,
              events: ["bundle.created", "bundle.updated"]
            }),
            createWebhook({
              webhook_id: "wh_disabled",
              is_enabled: false,
              events: ["incident.spike_detected"]
            })
          ]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/probes")) {
        return jsonResponse(200, {
          activations: [
            {
              activation_id: "probe_123",
              label_pattern: "checkout.*",
              service: "checkout",
              environment: "production",
              expires_at: "2026-03-17T10:00:00.000Z",
              trigger_expires_at: "2026-03-18T10:00:00.000Z"
            }
          ]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/availability-checks?limit=100")) {
        return jsonResponse(200, {
          checks: [
            {
              check_id: "chk_123",
              project_id: "proj_123",
              name: "API health",
              url: "https://api.debugbundle.com/health",
              method: "GET",
              expected_status_min: 200,
              expected_status_max: 399,
              timeout_ms: 5000,
              interval_seconds: 30,
              failure_threshold: 3,
              recovery_threshold: 2,
              environment: "production",
              service_name: "api",
              enabled: true,
              status: "passing",
              paused_reason: null,
              organization_plan: "team",
              consecutive_failures: 0,
              consecutive_successes: 24,
              linked_incident_id: null,
              linked_incident_status: null,
              last_checked_at: "2026-03-17T09:00:00.000Z",
              next_check_at: "2026-03-17T09:00:30.000Z",
              last_result_status: "success",
              last_result_http_status: 200,
              last_result_error_kind: null,
              last_result_error_message: null,
              last_result_duration_ms: 108,
              created_at: "2026-03-17T08:00:00.000Z",
              updated_at: "2026-03-17T09:00:00.000Z"
            }
          ],
          limits: {
            max_checks_per_project: 10,
            max_monitored_projects_per_organization: 10,
            max_active_checks_per_organization: 50,
            min_interval_seconds: 60,
            recommended_failure_threshold: 2
          }
        });
      }

      if (
        url.endsWith("/v1/projects/proj_123/availability-checks/chk_123/daily-rollups?limit=30")
      ) {
        return jsonResponse(200, {
          rollups: [createHealthRollup()]
        });
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
            immediate_client_error_statuses: [401, 403]
          },
          overrides: {
            capture_logs: null,
            capture_request_events: null,
            capture_breadcrumbs: null,
            capture_probe_events: null,
            immediate_client_error_statuses: [401, 403]
          }
        });
      }

      if (url.endsWith("/v1/projects/proj_123/improvement-settings")) {
        return jsonResponse(200, {
          access_mode: "manage",
          cloud_automation_available: true,
          settings: {
            automated_improvement_bundles_enabled: true,
            improvement_bundle_sensitivity: "verbose"
          }
        });
      }

      if (url.endsWith("/v1/weekly-report-channels?project_id=proj_123&limit=100")) {
        return jsonResponse(200, {
          channels: [
            {
              channel_id: "weekly_email_123",
              project_id: "proj_123",
              channel: "email",
              config: { to: ["owen@example.com", "alerts@example.com"] },
              schedule: {
                day_of_week: "monday",
                hour_of_day: 9,
                timezone: "UTC"
              },
              is_enabled: true,
              created_at: "2026-03-17T00:00:00.000Z",
              updated_at: "2026-03-17T00:00:00.000Z"
            }
          ]
        });
      }

      if (url.endsWith("/v1/github/installation?project_id=proj_123")) {
        return jsonResponse(200, {
          installation: createGitHubInstallation()
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/repo")) {
        return jsonResponse(200, {
          repo: createProjectGitHubRepo({
            repo_owner: "debugbundle",
            repo_name: "app"
          })
        });
      }

      if (url.endsWith("/v1/projects/proj_123/github/rules")) {
        return jsonResponse(200, {
          rules: [
            createGitHubDispatchRule({
              rule_id: "ghr_enabled",
              enabled: true
            }),
            createGitHubDispatchRule({
              rule_id: "ghr_disabled",
              enabled: false
            })
          ]
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123"]} />);

    expect(await screen.findByText(/setup at a glance/i)).toBeInTheDocument();
    expect(await screen.findByText(/^2 rules$/i)).toBeInTheDocument();
    expect(screen.getByText(/^2 endpoints$/i)).toBeInTheDocument();
    expect(screen.getByText(/^1 active$/i)).toBeInTheDocument();
    expect(screen.getByText(/^1 check$/i)).toBeInTheDocument();
    expect(screen.getByText(/^connected$/i)).toBeInTheDocument();
    expect(screen.getByText(/^balanced preset$/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^1 enabled$/i)).toHaveLength(4);
    expect(screen.getByText(/^2 recipients$/i)).toBeInTheDocument();
    expect(screen.getByText(/^2 client 4xx$/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /^matching sdk probe labels can ship independently before the next error\.$/i
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/^3 event types subscribed across endpoints\.$/i)).toBeInTheDocument();
    expect(
      screen.getByText(/^plan minimum interval 60s with 30-day retained history\.$/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^2 dispatch rules configured for debugbundle\/app\.$/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/^monday at 09:00 utc$/i)).toBeInTheDocument();
    expect(
      screen.getByText(/^warning logs, failed requests, exception breadcrumb trails$/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /^hosted improvement detection uses the shared retained bundle allowance\.$/i
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/^verbose sensitivity$/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("/github/"))).toBe(
      true
    );
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

      if (
        url.endsWith("/v1/github/installation?project_id=proj_123") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, { installation: null });
      }

      if (url.includes("/v1/github/app/install-url") && init?.method === undefined) {
        return jsonResponse(404, { error: "not_found" });
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
    expect(
      screen.getByText(/the github app install link could not be loaded/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /install github app/i })).not.toBeInTheDocument();
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

  it("shows preserved Slack destinations as paused on free projects", async () => {
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

      if (url.endsWith("/v1/projects/proj_123/slack/destinations") && init?.method === undefined) {
        return jsonResponse(200, {
          destinations: [
            {
              slack_destination_id: "sd_123",
              organization_id: "org_123",
              slack_team_id: "T123",
              slack_team_name: "Acme",
              slack_channel_id: "C123",
              slack_channel_name: "#alerts",
              installed_by_member_id: "usr_123",
              is_active: true,
              created_at: "2026-05-13T10:00:00.000Z",
              updated_at: "2026-05-13T10:00:00.000Z"
            }
          ]
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/alerts"]} />);

    expect(
      await screen.findByText(/saved slack channels will resume after an upgrade/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/slack alert delivery and channel management are paused/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/acme - #alerts/i)).toBeInTheDocument();
  });
});
