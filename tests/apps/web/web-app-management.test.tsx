// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import {
  resetBrowserSessionClientState,
  type AvailabilityCheckDailyRollupRecord,
  type AvailabilityCheckRecord
} from "../../../apps/web/src/lib/api.ts";
import { getLocalDayWindow } from "../../../apps/web/src/lib/incidents-today.ts";
import {
  createAlert,
  createBillingSummary,
  createGitHubDispatchDelivery,
  createGitHubDispatchRule,
  createGitHubInstallation,
  createGitHubRepository,
  createIncident,
  createProject,
  createProjectGitHubRepo,
  createProjectToken,
  createSession,
  createWebhook,
  createWebhookDelivery,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

async function findSelectTrigger(label: RegExp | string): Promise<HTMLElement> {
  return await screen.findByLabelText(label);
}

async function openSelect(label: RegExp | string): Promise<HTMLElement> {
  const trigger = await findSelectTrigger(label);
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
  return trigger;
}

async function chooseSelectOption(
  user: ReturnType<typeof userEvent.setup>,
  label: RegExp | string,
  optionName: RegExp | string
): Promise<void> {
  await openSelect(label);
  await user.click(await screen.findByRole("option", { name: optionName }));
}

function createHealthCheck(overrides: Partial<AvailabilityCheckRecord> = {}): AvailabilityCheckRecord {
  return {
    check_id: "chk_123",
    project_id: "proj_123",
    name: "Primary app",
    url: "https://app.example.com/health",
    method: "GET",
    expected_status_min: 200,
    expected_status_max: 399,
    timeout_ms: 5000,
    interval_seconds: 60,
    failure_threshold: 3,
    recovery_threshold: 2,
    environment: "production",
    service_name: "web",
    enabled: true,
    status: "passing",
    paused_reason: null,
    organization_plan: "team",
    consecutive_failures: 0,
    consecutive_successes: 12,
    linked_incident_id: null,
    linked_incident_status: null,
    last_checked_at: "2026-06-15T10:00:00.000Z",
    next_check_at: "2026-06-15T10:01:00.000Z",
    last_result_status: "success",
    last_result_http_status: 200,
    last_result_error_kind: null,
    last_result_error_message: null,
    last_result_duration_ms: 180,
    created_at: "2026-06-15T09:00:00.000Z",
    updated_at: "2026-06-15T10:00:00.000Z",
    ...overrides
  };
}

function createHealthRollup(
  overrides: Partial<AvailabilityCheckDailyRollupRecord> = {}
): AvailabilityCheckDailyRollupRecord {
  return {
    check_id: "chk_123",
    project_id: "proj_123",
    day: "2026-06-15",
    state: "operational",
    total_checks: 1250,
    successful_checks: 1250,
    failed_checks: 0,
    degraded_checks: 0,
    avg_duration_ms: 180,
    first_checked_at: "2026-06-15T00:00:00.000Z",
    last_checked_at: "2026-06-15T23:59:00.000Z",
    downtime_seconds: 0,
    incident_ids: [],
    ...overrides
  };
}

afterEach(() => {
  resetBrowserSessionClientState();
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
          limits: { max_checks_per_project: 25, min_interval_seconds: 30 }
        });
      }

      if (url.endsWith("/v1/projects/proj_123/availability-checks/chk_123/daily-rollups?limit=30")) {
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
    expect(screen.getByText(/^matching sdk probe labels can ship independently before the next error\.$/i)).toBeInTheDocument();
    expect(screen.getByText(/^3 event types subscribed across endpoints\.$/i)).toBeInTheDocument();
    expect(screen.getByText(/^plan minimum interval 30s with 30-day retained history\.$/i)).toBeInTheDocument();
    expect(screen.getByText(/^2 dispatch rules configured for debugbundle\/app\.$/i)).toBeInTheDocument();
    expect(screen.getByText(/^monday at 09:00 utc$/i)).toBeInTheDocument();
    expect(screen.getByText(/^warning logs, failed requests, exception breadcrumb trails$/i)).toBeInTheDocument();
    expect(screen.getByText(/^hosted improvement detection uses the shared retained bundle allowance\.$/i)).toBeInTheDocument();
    expect(screen.getByText(/^verbose sensitivity$/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("/github/"))).toBe(true);
  });

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
          limits: { max_checks_per_project: 1, min_interval_seconds: 300 }
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
    expect(within(healthChecksBlock as HTMLDivElement).getByText(/^not configured$/i)).toBeInTheDocument();
    expect(within(healthChecksBlock as HTMLDivElement).getByText(/^off$/i)).toBeInTheDocument();
    expect(
      within(healthChecksBlock as HTMLDivElement).getByText(/^no hosted health checks are configured yet\.$/i)
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        requestUrl(input).endsWith("/v1/alerts?project_id=proj_123&limit=100")
      )
    ).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("/github/"))).toBe(true);
  });

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
    expect(screen.getByRole("combobox", { name: /status/i })).toHaveTextContent(/^needs attention$/i);
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
        expect(init.body).toBe(
          JSON.stringify({
            name: "Ops API",
            slug: "ops-api",
            environment_default: "staging",
            color_tag: "blue",
            weekly_report_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
          })
        );

        const createdProject = createProject({
          project_id: "proj_456",
          name: "Ops API",
          slug: "ops-api",
          environment_default: "staging",
          color_tag: "blue"
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
    await chooseSelectOption(user, /default environment/i, /^staging$/i);
    await user.click(screen.getByRole("button", { name: /set color tag to blue/i }));
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
        expect(init.body).toBe(
          JSON.stringify({
            name: "Ops Platform",
            slug: "ops-control-plane",
            environment_default: "preview",
            color_tag: null,
            weekly_report_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
          })
        );

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

    await chooseSelectOption(user, /default environment/i, /^custom$/i);
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
        expect(init.body).toBe(
          JSON.stringify({
            label: "CI deploy",
            allowed_origins: ["https://app.example.com", "https://preview.example.com"]
          })
        );

        return jsonResponse(201, {
          token: createProjectToken({
            token_id: "proj_tok_456",
            label: "CI deploy",
            allowed_origins: ["https://app.example.com", "https://preview.example.com"],
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
    await user.type(
      screen.getByLabelText(/allowed browser origins/i),
      "https://app.example.com\nhttps://preview.example.com"
    );
    await user.click(screen.getByRole("button", { name: /^create token$/i }));

    const revealRegion = await screen.findByRole("region", { name: /new token secret/i });
    expect(within(revealRegion).getByText(/dbundle_proj_secret_123/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/ci deploy/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/browser origins: https:\/\/app\.example\.com, https:\/\/preview\.example\.com/i)).toBeInTheDocument();
  });

  it("revokes a project token from the project tokens page", async () => {
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

      if (
        url.endsWith("/v1/projects/proj_123/tokens/proj_tok_123/revoke") &&
        init?.method === "POST"
      ) {
        expect(init.credentials).toBe("include");
        return jsonResponse(200, { success: true });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/tokens"]} />);

    expect(await screen.findByText(/production ingest/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^revoke$/i }));
    await user.click(await screen.findByRole("button", { name: /revoke token/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/tokens/proj_tok_123/revoke") &&
            init?.method === "POST"
        )
      ).toBe(true);
    });

    expect(await screen.findByText(/project token revoked successfully/i)).toBeInTheDocument();
    expect(screen.queryByText(/production ingest/i)).toBeNull();
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
    expect(
      screen.getByText(/connect an sdk or environment-specific deploy flow/i)
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /create project token/i }).length).toBe(2);
  });

  it("renders used project tokens without the never-used placeholder", async () => {
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
          tokens: [createProjectToken({ last_used_at: "2026-04-20T11:56:12.000Z" })]
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/tokens"]} />);

    expect(await screen.findByText(/production ingest/i)).toBeInTheDocument();
    expect(screen.queryByText(/^never$/i)).toBeNull();
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
          projects: [createProject({ relationship: "shared", effective_role: "admin" })]
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
    expect(screen.getByRole("button", { name: /edit project/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /delete project/i })).toBeDisabled();
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

  it("creates an improvement github dispatch rule with the improvement bundle type", async () => {
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

      if (
        url.endsWith("/v1/github/installation?project_id=proj_123") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          installation: createGitHubInstallation()
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
        return jsonResponse(200, { rules: [] });
      }

      if (
        url.endsWith("/v1/projects/proj_123/github/deliveries?limit=20") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, { deliveries: [] });
      }

      if (url.endsWith("/v1/projects/proj_123/github/rules") && init?.method === "POST") {
        const requestBody = init.body;
        if (typeof requestBody !== "string") {
          throw new Error("expected GitHub dispatch rule request body");
        }
        expect(JSON.parse(requestBody)).toEqual(
          expect.objectContaining({
            name: "Hosted improvements",
            event_types: ["improvement_bundle.created"],
            bundle_type: "improvement",
            incident_status: "new_or_reopened"
          })
        );

        return jsonResponse(201, {
          rule: createGitHubDispatchRule({
            rule_id: "ghr_999",
            name: "Hosted improvements",
            event_types: ["improvement_bundle.created"],
            severity_min: "medium",
            bundle_type: "improvement",
            incident_status: "new_or_reopened",
            cooldown_seconds: 600
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/github"]} />);

    expect(
      await screen.findByText(/no github dispatch rules are configured yet/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create rule/i }));
    await user.type(screen.getByLabelText(/^rule name$/i), "Hosted improvements");
    await chooseSelectOption(user, /event type/i, /^improvement_bundle\.created$/i);
    expect(screen.queryByLabelText(/incident state/i)).toBeNull();
    expect(
      screen.getByText(/hosted improvement bundle rules always use new_or_reopened/i)
    ).toBeInTheDocument();
    await chooseSelectOption(user, /minimum severity/i, /^medium$/i);
    await user.clear(screen.getByLabelText(/cooldown seconds/i));
    await user.type(screen.getByLabelText(/cooldown seconds/i), "600");
    await user.click(screen.getByRole("button", { name: /^create rule$/i }));

    expect(await screen.findByText(/^hosted improvements$/i)).toBeInTheDocument();
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
          repositories: [
            createGitHubRepository(),
            createGitHubRepository({ id: 2, name: "worker", full_name: "debugbundle/worker" })
          ]
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

    expect(
      await screen.findByText(/no github repository is assigned to this project yet/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/choose one repository from the repos currently granted/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /manage repositories in github/i })).toHaveAttribute(
      "href",
      "https://github.com/apps/debugbundle-automation/installations/new"
    );

    await chooseSelectOption(
      user,
      /repositories accessible to this github app installation/i,
      /^debugbundle\/worker$/i
    );
    await user.click(screen.getByRole("button", { name: /connect to this project/i }));

    expect((await screen.findAllByText(/debugbundle\/worker/i)).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /disconnect from this project/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, requestInit]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/github/repo") &&
            requestInit?.method === "DELETE"
        )
      ).toBe(true);
    });

    expect(
      await screen.findByText(/no github repository is assigned to this project yet/i)
    ).toBeInTheDocument();
  });

  it("refreshes the accessible repository list after github-side installation changes", async () => {
    const user = userEvent.setup();
    let repositoryListRequestCount = 0;
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
        repositoryListRequestCount += 1;

        return jsonResponse(200, {
          repositories:
            repositoryListRequestCount === 1
              ? [createGitHubRepository()]
              : [
                  createGitHubRepository(),
                  createGitHubRepository({ id: 2, name: "worker", full_name: "debugbundle/worker" })
                ]
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
      await screen.findByText(/no github repository is assigned to this project yet/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "debugbundle/worker" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /refresh list/i }));

    await openSelect(/repositories accessible to this github app installation/i);
    expect(await screen.findByRole("option", { name: "debugbundle/worker" })).toBeInTheDocument();
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

      if (
        url.endsWith("/v1/github/installation?project_id=proj_123") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          installation: createGitHubInstallation()
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
        return jsonResponse(200, { rules: [] });
      }

      if (
        url.endsWith("/v1/projects/proj_123/github/deliveries?limit=20") &&
        init?.method === undefined
      ) {
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

    expect(
      await screen.findByText(/no github dispatch rules are configured yet/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create rule/i }));
    await user.type(screen.getByLabelText(/^rule name$/i), "Critical incidents");
    await chooseSelectOption(user, /event type/i, /^bundle\.created$/i);
    await user.type(screen.getByLabelText(/environment list/i), "production");
    await user.type(screen.getByLabelText(/service list/i), "checkout-api");
    await chooseSelectOption(user, /minimum severity/i, /^critical$/i);
    await chooseSelectOption(user, /incident state/i, /^new_only$/i);
    await user.clear(screen.getByLabelText(/cooldown seconds/i));
    await user.type(screen.getByLabelText(/cooldown seconds/i), "900");
    await user.click(screen.getByRole("button", { name: /^create rule$/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, requestInit]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/github/rules") &&
            requestInit?.method === "POST"
        )
      ).toBe(true);
    });

    expect(await screen.findByText(/^critical incidents$/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /delete rule critical incidents/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, requestInit]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/github/rules/ghr_999") &&
            requestInit?.method === "DELETE"
        )
      ).toBe(true);
    });

    expect(
      await screen.findByText(/no github dispatch rules are configured yet/i)
    ).toBeInTheDocument();
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

      if (
        url.endsWith("/v1/github/installation?project_id=proj_123") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          installation: createGitHubInstallation()
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
    await chooseSelectOption(user, /minimum severity/i, /^critical$/i);
    await chooseSelectOption(user, /incident state/i, /^new_only$/i);
    await user.clear(screen.getByLabelText(/cooldown seconds/i));
    await user.type(screen.getByLabelText(/cooldown seconds/i), "900");
    await user.click(screen.getByRole("button", { name: /^save rule$/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, requestInit]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/github/rules/ghr_123") &&
            requestInit?.method === "PATCH"
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
    const confirmDeleteButton = within(confirmationDialog).getByRole("button", {
      name: /^delete project$/i
    });

    expect(confirmDeleteButton).toBeDisabled();

    await user.type(confirmationInput, "delete Main App");
    expect(confirmDeleteButton).toBeEnabled();

    await user.click(confirmDeleteButton);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123") && init?.method === "DELETE"
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
          session: createSession({ role: "member" })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ relationship: "shared", effective_role: "admin" })]
        });
      }

      if (url.endsWith("/v1/projects/proj_123") && init?.method === "PATCH") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(
          JSON.stringify({
            name: "Main API",
            slug: "main-api",
            environment_default: "preview",
            color_tag: "amber"
          })
        );

        return jsonResponse(200, {
          project: createProject({
            name: "Main API",
            slug: "main-api",
            environment_default: "preview",
            color_tag: "amber",
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
    await chooseSelectOption(user, /default environment/i, /^custom$/i);
    await user.type(screen.getByLabelText(/custom environment/i), "preview");
    await user.click(screen.getByRole("button", { name: /set color tag to amber/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123") && init?.method === "PATCH"
        )
      ).toBe(true);
    });

    expect((await screen.findAllByText(/^main api$/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/^main-api$/i)).toBeInTheDocument();
    expect(screen.getByText(/^preview$/i)).toBeInTheDocument();
  });

  it("clears a project color tag from the project settings modal", async () => {
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
          projects: [createProject({ relationship: "shared", effective_role: "admin", color_tag: "rose" })]
        });
      }

      if (url.endsWith("/v1/projects/proj_123") && init?.method === "PATCH") {
        expect(init.body).toBe(JSON.stringify({ color_tag: null }));

        return jsonResponse(200, {
          project: createProject({
            color_tag: null,
            updated_at: "2026-03-18T00:00:00.000Z"
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    await user.click(await screen.findByRole("button", { name: /edit project/i }));
    expect(await screen.findByRole("button", { name: /clear color tag/i })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: /clear color tag/i }));
    expect(screen.getByRole("button", { name: /clear color tag/i })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, requestInit]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123") && requestInit?.method === "PATCH"
        )
      ).toBe(true);
    });

    expect(document.querySelector('[data-project-color-tag="rose"]')).toBeNull();
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

    expect(
      await screen.findByRole("heading", { name: /capture policy/i, level: 3 })
    ).toBeInTheDocument();
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

      if (
        url.endsWith("/v1/webhooks/wh_123/deliveries?project_id=proj_123&limit=5") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          deliveries: [createWebhookDelivery()]
        });
      }

      if (url.endsWith("/v1/webhooks/wh_123/test?project_id=proj_123") && init?.method === "POST") {
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
        fetchMock.mock.calls.some(([input]) =>
          requestUrl(input).includes("/v1/webhooks/wh_123/deliveries?project_id=proj_123&limit=5")
        )
      ).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: /send test webhook/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).endsWith("/v1/webhooks/wh_123/test?project_id=proj_123") &&
            init?.method === "POST"
        )
      ).toBe(true);
    });
  });

  it("updates weekly report settings from the project settings page", async () => {
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
          projects: [createProject({ relationship: "shared", effective_role: "admin" })]
        });
      }

      if (
        url.endsWith("/v1/weekly-report-channels?project_id=proj_123&limit=50") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          channels: [
            {
              channel_id: "wr_123",
              project_id: "proj_123",
              channel: "email",
              config: { to: ["owner@example.com"] },
              schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
              is_enabled: true,
              created_at: "2026-03-15T00:00:00.000Z",
              updated_at: "2026-03-15T00:00:00.000Z"
            }
          ]
        });
      }

      if (url.endsWith("/v1/weekly-report-channels/wr_123") && init?.method === "PATCH") {
        expect(init.body).toBe(
          JSON.stringify({
            config: { to: ["owner@example.com", "team@example.com"] },
            schedule: { day_of_week: "friday", hour_of_day: 16, timezone: "Europe/Ljubljana" },
            is_enabled: false
          })
        );

        return jsonResponse(200, {
          channel: {
            channel_id: "wr_123",
            project_id: "proj_123",
            channel: "email",
            config: { to: ["owner@example.com", "team@example.com"] },
            schedule: { day_of_week: "friday", hour_of_day: 16, timezone: "Europe/Ljubljana" },
            is_enabled: false,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-18T00:00:00.000Z"
          }
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    expect(await screen.findByRole("button", { name: /save email weekly report/i })).toBeInTheDocument();

    const enabledSwitches = await screen.findAllByRole("switch", { name: /enabled/i });
    await user.click(enabledSwitches[enabledSwitches.length - 1]!);
    await user.clear(screen.getByLabelText(/recipients/i));
    await user.type(
      screen.getByLabelText(/recipients/i),
      "owner@example.com, team@example.com, ops@example.com, bulk@example.com"
    );
    expect(screen.getByText(/use 3 or fewer recipients/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save email weekly report/i })).toBeDisabled();

    await user.clear(screen.getByLabelText(/recipients/i));
    await user.type(screen.getByLabelText(/recipients/i), "owner@example.com, team@example.com");
    await chooseSelectOption(user, /^day$/i, /friday/i);
    await chooseSelectOption(user, /^hour$/i, /16:00/i);
    await user.clear(screen.getByLabelText(/timezone/i));
    await user.type(screen.getByLabelText(/timezone/i), "Europe/Ljubljana");
    await user.click(screen.getByRole("button", { name: /save email weekly report/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([request, requestInit]) =>
            requestUrl(request).endsWith("/v1/weekly-report-channels/wr_123") &&
            requestInit?.method === "PATCH"
        )
      ).toBe(true);
    });
  });

  it("creates a Slack weekly report from the project settings page on Team", async () => {
    const user = userEvent.setup();
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

      if (url.endsWith("/v1/weekly-report-channels?project_id=proj_123&limit=50") && init?.method === undefined) {
        return jsonResponse(200, {
          channels: [
            {
              channel_id: "wr_email_123",
              project_id: "proj_123",
              channel: "email",
              config: { to: ["owner@example.com"] },
              schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
              is_enabled: true,
              created_at: "2026-03-15T00:00:00.000Z",
              updated_at: "2026-03-15T00:00:00.000Z"
            }
          ]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/slack/destinations") && init?.method === undefined) {
        return jsonResponse(200, {
          destinations: [
            {
              slack_destination_id: "sd_123",
              organization_id: "org_123",
              slack_team_id: "T123",
              slack_team_name: "Acme Workspace",
              slack_channel_id: "C123",
              slack_channel_name: "#weekly-reports",
              installed_by_member_id: "usr_123",
              is_active: true,
              created_at: "2026-03-15T00:00:00.000Z",
              updated_at: "2026-03-15T00:00:00.000Z"
            }
          ]
        });
      }

      if (url.endsWith("/v1/weekly-report-channels") && init?.method === "POST") {
        expect(init.body).toBe(
          JSON.stringify({
            project_id: "proj_123",
            channel: "slack",
            config: { slack_destination_id: "sd_123" },
            schedule: { day_of_week: "friday", hour_of_day: 16, timezone: "America/New_York" },
            is_enabled: true
          })
        );

        return jsonResponse(201, {
          channel: {
            channel_id: "wr_slack_123",
            project_id: "proj_123",
            channel: "slack",
            config: { slack_destination_id: "sd_123" },
            schedule: { day_of_week: "friday", hour_of_day: 16, timezone: "America/New_York" },
            is_enabled: true,
            created_at: "2026-03-18T00:00:00.000Z",
            updated_at: "2026-03-18T00:00:00.000Z"
          }
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    expect(await screen.findByRole("button", { name: /create slack weekly report/i })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /create slack weekly report/i }));

    const dialog = await screen.findByRole("dialog");
    const dayTrigger = within(dialog).getByLabelText(/^day$/i);
    dayTrigger.focus();
    fireEvent.keyDown(dayTrigger, { key: "ArrowDown", code: "ArrowDown" });
    await user.click(await screen.findByRole("option", { name: /friday/i }));

    const hourTrigger = within(dialog).getByLabelText(/^hour$/i);
    hourTrigger.focus();
    fireEvent.keyDown(hourTrigger, { key: "ArrowDown", code: "ArrowDown" });
    await user.click(await screen.findByRole("option", { name: /16:00/i }));

    await user.clear(within(dialog).getByLabelText(/^timezone$/i));
    await user.type(within(dialog).getByLabelText(/^timezone$/i), "America/New_York");
    await user.click(within(dialog).getByRole("button", { name: /^create slack weekly report$/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([request, requestInit]) =>
            requestUrl(request).endsWith("/v1/weekly-report-channels") &&
            requestInit?.method === "POST"
        )
      ).toBe(true);
    });

    expect(await screen.findByText(/acme workspace - #weekly-reports/i)).toBeInTheDocument();
  });

  it("shows preserved Slack weekly reports as paused on lower tiers", async () => {
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

      if (url.endsWith("/v1/weekly-report-channels?project_id=proj_123&limit=50") && init?.method === undefined) {
        return jsonResponse(200, {
          channels: [
            {
              channel_id: "wr_email_123",
              project_id: "proj_123",
              channel: "email",
              config: { to: ["owner@example.com"] },
              schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
              is_enabled: true,
              created_at: "2026-03-15T00:00:00.000Z",
              updated_at: "2026-03-15T00:00:00.000Z"
            },
            {
              channel_id: "wr_slack_123",
              project_id: "proj_123",
              channel: "slack",
              config: { slack_destination_id: "sd_123" },
              schedule: { day_of_week: "friday", hour_of_day: 16, timezone: "America/New_York" },
              is_enabled: true,
              created_at: "2026-03-18T00:00:00.000Z",
              updated_at: "2026-03-18T00:00:00.000Z"
            }
          ]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/slack/destinations") && init?.method === undefined) {
        return jsonResponse(200, {
          destinations: [
            {
              slack_destination_id: "sd_123",
              organization_id: "org_123",
              slack_team_id: "T123",
              slack_team_name: "Acme Workspace",
              slack_channel_id: "C123",
              slack_channel_name: "#weekly-reports",
              installed_by_member_id: "usr_123",
              is_active: true,
              created_at: "2026-03-15T00:00:00.000Z",
              updated_at: "2026-03-15T00:00:00.000Z"
            }
          ]
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    expect(await screen.findByText(/slack weekly reports are paused on the current plan/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create slack weekly report/i })).not.toBeInTheDocument();
    expect(await screen.findByText(/acme workspace - #weekly-reports/i)).toBeInTheDocument();
    expect(screen.getByText(/friday at 16:00 America\/New_York/i)).toBeInTheDocument();
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
    await user.type(
      await screen.findByLabelText(/endpoint url/i),
      "https://hooks.example.test/created"
    );
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

    await user.type(
      await screen.findByLabelText(/endpoint url/i),
      "https://hooks.example.test/filtered"
    );
    await user.click(screen.getByLabelText(/bundle\.reopened/i));
    await user.type(screen.getByLabelText(/environments/i), "production, staging");
    await user.type(screen.getByLabelText(/services/i), "checkout-api, worker");
    await chooseSelectOption(user, /minimum severity/i, /^high$/i);
    await chooseSelectOption(user, /verification scope/i, /non-verification events only/i);
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
    expect(
      screen.getByText(/create a webhook to send lifecycle, verification, or automation events/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/no delivery attempts yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/send a test webhook to create the first delivery record/i)
    ).toBeInTheDocument();
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
          projects: [
            createProject({
              relationship: "shared",
              sharing_state: "shared_with_you",
              effective_role: "member"
            })
          ]
        });
      }

      if (url.endsWith("/v1/alerts?project_id=proj_123&limit=20") && init?.method === undefined) {
        return jsonResponse(200, {
          alerts: [
            createAlert(),
            createAlert({
              alert_id: "alert_456",
              created_by_user_id: "usr_999",
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
    expect(screen.getAllByText(/^-$/).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.queryByText(/only the creator or a project admin can delete this rule/i)
    ).not.toBeInTheDocument();
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

      if (url.endsWith("/v1/alerts/alert_123?project_id=proj_123") && init?.method === "DELETE") {
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
          ([input, init]) =>
            requestUrl(input).endsWith("/v1/alerts/alert_123?project_id=proj_123") &&
            init?.method === "DELETE"
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

      if (url.endsWith("/v1/alerts") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(
          JSON.stringify({
            project_id: "proj_123",
            channel: "slack",
            condition_type: "error_spike",
            severity_min: "critical",
            cooldown_seconds: 0,
            config: {
              slack_destination_id: "sd_123"
            },
            is_enabled: true
          })
        );

        return jsonResponse(201, {
          alert: createAlert({
            alert_id: "alert_789",
            channel: "slack",
            condition_type: "error_spike",
            severity_min: "critical",
            cooldown_seconds: 0
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/alerts"]} />);

    await user.click(await screen.findByRole("button", { name: /create alert rule/i }));
    await chooseSelectOption(user, /channel/i, /^slack$/i);
    expect(screen.getByLabelText(/cooldown \(days\)/i)).toHaveValue(0);
    expect(screen.queryByText(/recommended for email: 1 day/i)).not.toBeInTheDocument();
    await chooseSelectOption(user, /slack channel/i, /^acme - #alerts$/i);
    await chooseSelectOption(user, /condition/i, /^error spike$/i);
    await chooseSelectOption(user, /minimum severity/i, /^critical$/i);
    await user.click(screen.getByRole("button", { name: /^create alert rule$/i }));

    await waitFor(() => {
      expect(screen.getByText(/slack/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/critical/i)).toBeInTheDocument();
  });

  it("creates severity threshold alert rules with the default lifecycle scope from the web route", async () => {
    const user = userEvent.setup();
    let createdAlertRequestBody: unknown = null;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ email: "owner@example.com" })
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
        if (typeof init.body !== "string") {
          throw new Error("expected alert create request body");
        }
        createdAlertRequestBody = JSON.parse(init.body);

        return jsonResponse(201, {
          alert: createAlert({
            alert_id: "alert_threshold_789",
            condition_type: "severity_threshold",
            severity_lifecycle_scope: "both",
            severity_min: "high",
            cooldown_seconds: 86400,
            config: { to: "owner@example.com" }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/alerts"]} />);

    await user.click(await screen.findByRole("button", { name: /create alert rule/i }));
    const recipientInput = await screen.findByLabelText(/recipient email/i);
    await user.clear(recipientInput);
    await user.type(recipientInput, "owner@example.com");
    await chooseSelectOption(user, /condition/i, /^severity threshold$/i);
    expect(screen.getByLabelText(/notify on/i)).toHaveTextContent(/new incidents and regressions/i);
    await chooseSelectOption(user, /minimum severity/i, /^high$/i);
    await user.click(screen.getByRole("button", { name: /^create alert rule$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(createdAlertRequestBody).toEqual({
      project_id: "proj_123",
      channel: "email",
      condition_type: "severity_threshold",
      severity_lifecycle_scope: "both",
      severity_min: "high",
      cooldown_seconds: 86400,
      config: {
        to: "owner@example.com"
      },
      is_enabled: true
    });
    expect(screen.getByText(/new incidents and regressions/i)).toBeInTheDocument();
    expect(screen.getByText(/^high$/i)).toBeInTheDocument();
  });

  it("edits a project alert rule from the web route using the same modal fields as create", async () => {
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
          alerts: [
            createAlert({
              alert_id: "alert_123",
              config: { to: "owner@example.com" },
              cooldown_seconds: 86400
            })
          ]
        });
      }

      if (url.endsWith("/v1/alerts/alert_123?project_id=proj_123") && init?.method === "PATCH") {
        expect(init.credentials).toBe("include");
        const requestBody = init.body;
        if (typeof requestBody !== "string") {
          throw new Error("expected alert update request body");
        }
        expect(JSON.parse(requestBody)).toEqual({
          channel: "email",
          condition_type: "severity_threshold",
          severity_lifecycle_scope: "incident_regressed",
          severity_min: "critical",
          cooldown_seconds: 172800,
          config: {
            to: "alerts@example.com"
          }
        });

        return jsonResponse(200, {
          alert: createAlert({
            alert_id: "alert_123",
            condition_type: "severity_threshold",
            severity_lifecycle_scope: "incident_regressed",
            severity_min: "critical",
            cooldown_seconds: 172800,
            config: { to: "alerts@example.com" }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/alerts"]} />);

    expect(await screen.findByText(/email - owner@example.com/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    expect(await screen.findByRole("heading", { name: /edit alert rule/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/recipient email/i)).toHaveValue("owner@example.com");
    expect(screen.getByLabelText(/cooldown \(days\)/i)).toHaveValue(1);
    expect(screen.getByText(/recommended for email: 1 day/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/recipient email/i));
    await user.type(screen.getByLabelText(/recipient email/i), "alerts@example.com");
    expect(screen.queryByLabelText(/notify on/i)).not.toBeInTheDocument();
    await chooseSelectOption(user, /condition/i, /^severity threshold$/i);
    expect(screen.getByLabelText(/notify on/i)).toHaveTextContent(/new incidents and regressions/i);
    await chooseSelectOption(user, /notify on/i, /^regressions only$/i);
    await chooseSelectOption(user, /minimum severity/i, /^critical$/i);
    await user.clear(screen.getByLabelText(/cooldown \(days\)/i));
    await user.type(screen.getByLabelText(/cooldown \(days\)/i), "2");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).endsWith("/v1/alerts/alert_123?project_id=proj_123") &&
            init?.method === "PATCH"
        )
      ).toBe(true);
    });

    expect(await screen.findByText(/alert rule updated successfully/i)).toBeInTheDocument();
  });

  it("lets owners test and disconnect connected Slack channels from the alert dialog", async () => {
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

      if (
        url.endsWith("/v1/projects/proj_123/slack/destinations/sd_123/test") &&
        init?.method === "POST"
      ) {
        expect(init.headers).toEqual({
          "X-CSRF-Token": "csrf-token-123"
        });
        return jsonResponse(200, { delivered: true });
      }

      if (
        url.endsWith("/v1/projects/proj_123/slack/destinations/sd_123") &&
        init?.method === "DELETE"
      ) {
        expect(init.headers).toEqual({
          "X-CSRF-Token": "csrf-token-123"
        });
        return new Response(null, { status: 204 });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/alerts"]} />);

    await user.click(await screen.findByRole("button", { name: /create alert rule/i }));
    await chooseSelectOption(user, /channel/i, /^slack$/i);
    await user.click(screen.getByRole("button", { name: /send test message/i }));
    await user.click(screen.getByRole("button", { name: /disconnect channel/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/slack/destinations/sd_123/test") &&
            init?.method === "POST"
        )
      ).toBe(true);
    });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/slack/destinations/sd_123") &&
            init?.method === "DELETE"
        )
      ).toBe(true);
    });
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
    expect(screen.getByText(/slack alert delivery and channel management are paused/i)).toBeInTheDocument();
    expect(screen.getByText(/acme - #alerts/i)).toBeInTheDocument();
  });

  it("prefills and requires a single recipient email for email alert rules", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ email: "owner@example.com" })
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
        expect(init.body).toBe(
          JSON.stringify({
            project_id: "proj_123",
            channel: "email",
            condition_type: "new_incident",
            cooldown_seconds: 86400,
            config: {
              to: "alerts@example.com"
            },
            is_enabled: true
          })
        );

        return jsonResponse(201, {
          alert: createAlert({
            alert_id: "alert_email_789",
            cooldown_seconds: 86400,
            config: { to: "alerts@example.com" }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/alerts"]} />);

    await user.click(await screen.findByRole("button", { name: /create alert rule/i }));

    const recipientInput = await screen.findByLabelText(/recipient email/i);
    expect(recipientInput).toHaveValue("owner@example.com");
    expect(screen.getByLabelText(/cooldown \(days\)/i)).toHaveValue(1);
    expect(screen.getByText(/recommended for email: 1 day/i)).toBeInTheDocument();

    await user.clear(recipientInput);
    await user.type(recipientInput, "alerts@example.com");
    await user.click(screen.getByRole("button", { name: /^create alert rule$/i }));

    await waitFor(() => {
      expect(screen.getByText(/email/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/^1 day$/i)).toBeInTheDocument();
  });

  it("validates missing alert webhook urls and creates webhook alert rules", async () => {
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
        expect(init.body).toBe(
          JSON.stringify({
            project_id: "proj_123",
            channel: "webhook",
            condition_type: "new_incident",
            cooldown_seconds: 0,
            config: {
              target_url: "https://alerts.example.test/project-webhook"
            },
            is_enabled: true
          })
        );

        return jsonResponse(201, {
          alert: createAlert({
            alert_id: "alert_webhook_789",
            channel: "webhook",
            cooldown_seconds: 0,
            config: { target_url: "https://alerts.example.test/project-webhook" }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/alerts"]} />);

    await user.click(await screen.findByRole("button", { name: /create alert rule/i }));

    await chooseSelectOption(user, /channel/i, /^alert webhook$/i);
    const destinationInput = screen.getByLabelText(/webhook endpoint url/i);
    expect(destinationInput).toBeInTheDocument();
    expect(screen.getByLabelText(/cooldown \(days\)/i)).toHaveValue(0);
    expect(screen.queryByText(/recommended for email: 1 day/i)).not.toBeInTheDocument();

    const createButton = screen.getByRole("button", { name: /^create alert rule$/i });
    const createForm = createButton.closest("form");
    expect(createForm).not.toBeNull();
    fireEvent.submit(createForm as HTMLFormElement);

    expect(
      await screen.findByText(/add a destination url for this alert channel/i)
    ).toBeInTheDocument();

    await user.type(destinationInput, "https://alerts.example.test/project-webhook");
    await user.click(createButton);

    await waitFor(() => {
      expect(screen.getByText(/alert webhook/i)).toBeInTheDocument();
    });
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

    await openSelect(/channel/i);
    const channelOptions = screen.getAllByRole("option");

    expect(channelOptions.map((option) => option.textContent)).toEqual([
      "Email",
      "Slack (Team tier only)",
      "Alert webhook"
    ]);
    expect(channelOptions[1]).toHaveAttribute("data-disabled");
    await chooseSelectOption(user, /channel/i, /^alert webhook$/i);
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
    expect(
      screen.getByText(/create a rule to send incident events where your team will see them/i)
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /create alert rule/i }).length).toBe(2);
  });

  it("redirects the retired organization route back to projects", async () => {
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
            createProject(),
            createProject({
              project_id: "proj_456",
              name: "Worker",
              slug: "worker",
              relationship: "shared",
              sharing_state: "shared_by_you"
            })
          ]
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "team",
            active_projects: 2,
            capacity_units: {
              total: 17,
              included: 15,
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

    expect(await screen.findByRole("heading", { name: /projects/i, level: 1 })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /organization/i, level: 1 })
    ).not.toBeInTheDocument();
  });

  it("does not show an organization entry in the app sidebar", async () => {
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

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(403, { error: "forbidden" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects"]} />);

    await screen.findByRole("heading", { name: /projects/i, level: 1 });
    expect(screen.queryByRole("link", { name: /^organization$/i })).not.toBeInTheDocument();
  });

  it("keeps the organization entry hidden outside the Team tier as well", async () => {
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

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(403, { error: "forbidden" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/organization"]} />);

    expect(await screen.findByRole("heading", { name: /projects/i, level: 1 })).toBeInTheDocument();
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

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    expect(await screen.findByText(/main app/i)).toBeInTheDocument();

    const mainAppRow = screen.getByText(/main app/i).closest("tr");
    expect(mainAppRow).not.toBeNull();
    expect(within(mainAppRow as HTMLTableRowElement).getAllByText(/^0$/)).toHaveLength(3);
    expect(await screen.findByText(/no incidents today/i)).toBeInTheDocument();
  });

  it("opens the create-project dialog directly from the dashboard empty state", async () => {
    const user = userEvent.setup();
    let projects: ReturnType<typeof createProject>[] = [];

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects });
      }

      if (url.endsWith("/v1/projects") && init?.method === "POST") {
        expect(init.body).toBe(
          JSON.stringify({
            name: "First Project",
            slug: "first-project",
            environment_default: "production",
            color_tag: null,
            weekly_report_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
          })
        );

        const createdProject = createProject({
          project_id: "proj_first",
          name: "First Project",
          slug: "first-project"
        });
        projects = [createdProject];

        return jsonResponse(201, {
          project: createdProject
        });
      }

      if (url.includes("/v1/incidents?") && url.includes("project_id=proj_first")) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^create project$/i }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/project name/i), "First Project");
    await user.click(within(dialog).getByRole("button", { name: /^create project$/i }));

    expect(await screen.findByText(/project details/i)).toBeInTheDocument();
    expect(screen.getByText(/^first-project$/i)).toBeInTheDocument();
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
                open_incidents: 7,
                regressed_incidents: 1,
                attention_incidents_today: 2,
                opened_incidents_today: 2,
                opened_incidents_month: 9,
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
                open_incidents: 5,
                regressed_incidents: 2,
                attention_incidents_today: 1,
                opened_incidents_today: 1,
                opened_incidents_month: 6,
                monthly_bundle_requests: 8,
                monthly_raw_ingested_events: 6,
                retained_bundles: 3,
                monthly_alert_deliveries: 1
              }
            })
          ]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/availability-checks?limit=100")) {
        return jsonResponse(200, {
          checks: [createHealthCheck({ project_id: "proj_123", status: "passing" })],
          limits: { max_checks_per_project: 5, min_interval_seconds: 60 }
        });
      }

      if (url.endsWith("/v1/projects/proj_456/availability-checks?limit=100")) {
        return jsonResponse(200, {
          checks: [createHealthCheck({ check_id: "chk_456", project_id: "proj_456", status: "failing" })],
          limits: { max_checks_per_project: 5, min_interval_seconds: 60 }
        });
      }

      if (url.endsWith("/v1/projects/proj_123/availability-checks/chk_123/daily-rollups?limit=30")) {
        return jsonResponse(200, {
          rollups: [createHealthRollup({ check_id: "chk_123", project_id: "proj_123" })]
        });
      }

      if (url.endsWith("/v1/projects/proj_456/availability-checks/chk_456/daily-rollups?limit=30")) {
        return jsonResponse(200, {
          rollups: [
            createHealthRollup({
              check_id: "chk_456",
              project_id: "proj_456",
              state: "degraded",
              successful_checks: 1249,
              failed_checks: 1,
              degraded_checks: 1,
              downtime_seconds: 60
            })
          ]
        });
      }

      if (url.includes("/v1/incidents?") && url.includes("first_seen_after=")) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
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
              },
              monthly_webhook_deliveries: {
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
      expect(cardWithValueExists("Active incidents", /^15$/)).toBe(true);
      expect(cardWithValueExists("Incidents today", /^3$/)).toBe(true);
      expect(cardWithValueExists("Health status today", /^99\.96%$/)).toBe(true);
      expect(cardWithValueExists("Regressed incidents", /^3$/)).toBe(true);
    });

    expect(screen.getByText(/open or regressed incidents across all projects/i)).toBeInTheDocument();
    expect(screen.getByText(/opened or regressed today across all projects/i)).toBeInTheDocument();
    expect(screen.getByText(/1 check failing across all projects/i)).toBeInTheDocument();
    expect(screen.getByText(/current regressed incidents across all projects/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).endsWith("/v1/billing"))).toBe(
      false
    );
  });

  it("opens the incidents page from the dashboard open-incidents card", async () => {
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

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, {
          incidents: [
            createIncident({
              incident_id: "inc_today",
              title: "Checkout timeout"
            })
          ],
          next_cursor: null
        });
      }

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    await screen.findByText(/open or regressed incidents across all projects/i);

    const openIncidentsCard = screen.getByText(/open or regressed incidents across all projects/i).closest("a");
    expect(openIncidentsCard).not.toBeNull();

    await user.click(openIncidentsCard as HTMLAnchorElement);

    expect(await screen.findByRole("heading", { name: /incident inventory/i })).toBeInTheDocument();
  });

  it("opens the workspace health status page from the dashboard health-status card", async () => {
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

      if (url.endsWith("/v1/projects/proj_123/availability-checks?limit=100")) {
        return jsonResponse(200, {
          checks: [],
          limits: { max_checks_per_project: 1, min_interval_seconds: 300 }
        });
      }

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    const healthStatusCard = await screen.findByRole("link", { name: /health status today/i });
    await screen.findByText(/^not set$/i);
    expect(healthStatusCard).toHaveTextContent(/not set/i);

    await user.click(healthStatusCard);

    expect(await screen.findByRole("heading", { name: /health status/i, level: 1 })).toBeInTheDocument();
    expect(await screen.findByText(/no health checks yet/i)).toBeInTheDocument();
  });

  it("scrolls to the incidents-today panel from the dashboard new-incidents card", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();

    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });

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

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, {
          incidents: [
            createIncident({
              incident_id: "inc_today",
              title: "Checkout timeout"
            })
          ],
          next_cursor: null
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    await screen.findByRole("heading", { name: /incidents today/i });
    await user.click(screen.getByRole("button", { name: /incidents today/i }));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start"
    });
  });

  it("renders incident rows in the dashboard incidents-today table", async () => {
    const todayWindow = getLocalDayWindow();
    const firstSeenAt = new Date(todayWindow.startsAtMs + 30 * 60 * 1000).toISOString();
    const lastSeenAt = new Date(todayWindow.startsAtMs + 2 * 60 * 60 * 1000).toISOString();

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

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, {
          incidents: [
            createIncident({
              incident_id: "inc_today",
              title: "Checkout timeout",
              project_id: "proj_456",
              project_name: "Worker",
              project_color_tag: "emerald",
              service_name: null,
              environment: "production",
              severity: "critical",
              status: "regressed",
              first_seen_at: firstSeenAt,
              last_seen_at: lastSeenAt,
              occurrence_count: 11,
              regressed_at: firstSeenAt
            })
          ],
          next_cursor: null
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    const heading = await screen.findByRole("heading", { name: /incidents today/i });
    const incidentsTodayCard = heading.closest('[data-slot="card"]');
    expect(incidentsTodayCard).not.toBeNull();
    const card = within(incidentsTodayCard as HTMLElement);
    const cardElement = incidentsTodayCard as HTMLElement;

    expect(await card.findByRole("link", { name: /checkout timeout/i })).toBeInTheDocument();
    expect(card.getByRole("link", { name: /worker/i })).toBeInTheDocument();
    expect(cardElement.querySelector('[data-project-color-tag="emerald"]')).not.toBeNull();
    expect(card.getByText(/unknown service/i)).toBeInTheDocument();
    expect(card.getByRole("columnheader", { name: /environment/i })).toBeInTheDocument();
    expect(card.getByText(/^production$/i)).toBeInTheDocument();
    expect(screen.getByText(/^critical$/i)).toBeInTheDocument();
    expect(screen.getByText(/^regressed$/i)).toHaveAttribute("data-variant", "destructive");
    expect(screen.getByText(/^11$/)).toBeInTheDocument();
  });

  it("paginates the dashboard incidents-today table with the shared controls", async () => {
    const user = userEvent.setup();
    const todayWindow = getLocalDayWindow();
    const firstSeenAt = new Date(todayWindow.startsAtMs + 30 * 60 * 1000).toISOString();
    const todayIncidents = Array.from({ length: 11 }, (_, index) =>
      createIncident({
        incident_id: `inc_today_${index + 1}`,
        title: index === 0 ? "Checkout timeout" : index === 10 ? "Retry storm" : `Dashboard incident ${index + 1}`,
        first_seen_at: firstSeenAt,
        regressed_at: null
      })
    );
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

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, {
          incidents: todayIncidents,
          next_cursor: null
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    const heading = await screen.findByRole("heading", { name: /incidents today/i });
    const incidentsTodayCard = heading.closest('[data-slot="card"]');
    expect(incidentsTodayCard).not.toBeNull();
    const card = within(incidentsTodayCard as HTMLElement);

    expect(await card.findByRole("link", { name: /checkout timeout/i })).toBeInTheDocument();
    expect(card.getByText(/page 1/i)).toBeInTheDocument();

    await user.click(card.getByRole("button", { name: /go to next page/i }));

    expect(await card.findByRole("link", { name: /retry storm/i })).toBeInTheDocument();
    expect(card.getByText(/page 2/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("attention_after="))).toBe(false);
  });

  it("loads the dashboard incidents-today table without requiring the attention_after API filter", async () => {
    const todayWindow = getLocalDayWindow();
    const firstSeenAt = new Date(todayWindow.startsAtMs + 30 * 60 * 1000).toISOString();
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

      if (url.includes("/v1/incidents?") && url.includes("attention_after=")) {
        return jsonResponse(400, {
          error: "invalid_query"
        });
      }

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, {
          incidents: [
            createIncident({
              incident_id: "inc_today_dashboard",
              title: "Dashboard incident",
              first_seen_at: firstSeenAt,
              regressed_at: null
            })
          ],
          next_cursor: null
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    const heading = await screen.findByRole("heading", { name: /incidents today/i });
    const incidentsTodayCard = heading.closest('[data-slot="card"]');
    expect(incidentsTodayCard).not.toBeNull();
    const card = within(incidentsTodayCard as HTMLElement);

    expect(await card.findByRole("link", { name: /dashboard incident/i })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("attention_after="))).toBe(false);
    expect(screen.queryByText(/could not load the current page/i)).not.toBeInTheDocument();
  });

  it("does not scan older dashboard incidents-today pages after reaching incidents before today", async () => {
    const todayWindow = getLocalDayWindow();
    const oldIncidentAt = new Date(todayWindow.startsAtMs - 60 * 60 * 1000).toISOString();
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

      if (url.includes("/v1/incidents?") && url.includes("cursor=cursor_2")) {
        return jsonResponse(500, {
          error: "unexpected_scan"
        });
      }

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, {
          incidents: [
            createIncident({
              incident_id: "inc_old",
              title: "Old incident",
              first_seen_at: oldIncidentAt,
              last_seen_at: oldIncidentAt,
              regressed_at: null
            })
          ],
          next_cursor: "cursor_2"
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    expect(await screen.findByText(/no incidents today/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("cursor=cursor_2"))).toBe(false);
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("attention_after="))).toBe(false);
    expect(screen.queryByText(/could not load the current page/i)).not.toBeInTheDocument();
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
    expect(
      screen.getByText(/projects stay unlimited\. this account currently has 1 active project\./i)
    ).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /upgrade to solo/i }));

    expect(locationAssign).toHaveBeenCalledWith("https://billing.stripe.com/checkout/solo");
  });

  it("renders the billing page when the billing payload omits webhook delivery usage", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: {
            plan: "free",
            stripe_customer_id: null,
            active_projects: 1,
            capacity_units: {
              total: 1,
              included: 1,
              additional_purchased: 0,
              pending_reduction: null
            },
            usage_window: {
              starts_at: "2026-03-01T00:00:00.000Z",
              ends_at: "2026-04-01T00:00:00.000Z"
            },
            allowances: {
              monthly_bundle_requests: {
                used: 12,
                limit: 100
              },
              monthly_raw_ingested_events: {
                used: 120,
                limit: 750
              },
              retained_bundle_cap: {
                used: 6,
                limit: 50
              },
              monthly_remote_activations: {
                used: 0,
                limit: 0
              },
              monthly_alert_deliveries: {
                used: 4,
                limit: 25
              }
            }
          }
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing"]} />);

    expect(await screen.findByRole("heading", { name: /billing/i, level: 1 })).toBeInTheDocument();
    expect(await screen.findByText(/^Webhook deliveries$/i)).toBeInTheDocument();
    expect(
      screen.getByText(/lifecycle webhook deliveries created this month\./i)
    ).toBeInTheDocument();
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
              total: 3,
              included: 3,
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
        return (
          requestUrl(input).endsWith("/v1/billing/checkout/confirm") &&
          requestInit?.method === "POST"
        );
      }).length
    ).toBe(1);
  });

  it("confirms billing after a successful Stripe checkout return under React StrictMode", async () => {
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
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "team",
            stripe_customer_id: "cus_123",
            capacity_units: {
              total: 15,
              included: 15,
              additional_purchased: 0,
              pending_reduction: null
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <StrictMode>
        <App initialEntries={["/billing?checkout=success&session_id=cs_test_123"]} />
      </StrictMode>
    );

    expect(await screen.findByRole("dialog", { name: /team is active/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/^team$/i)).toBeInTheDocument();
    });

    expect(
      fetchMock.mock.calls.filter(([input, requestInit]) => {
        return (
          requestUrl(input).endsWith("/v1/billing/checkout/confirm") &&
          requestInit?.method === "POST"
        );
      }).length
    ).toBe(1);
  });

  it("clears the checkout return before refreshing the session after confirmation", async () => {
    let authSessionRequests = 0;
    let resolveRefreshSession: ((response: Response) => void) | null = null;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        authSessionRequests += 1;
        if (authSessionRequests === 1) {
          return jsonResponse(200, {
            session: createSession()
          });
        }

        return new Promise<Response>((resolve) => {
          resolveRefreshSession = resolve;
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary()
        });
      }

      if (url.endsWith("/v1/billing/checkout/confirm") && init?.method === "POST") {
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "team",
            stripe_customer_id: "cus_123",
            capacity_units: {
              total: 15,
              included: 15,
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

    expect(await screen.findByRole("dialog", { name: /team is active/i })).toBeInTheDocument();

    expect(
      fetchMock.mock.calls.filter(([input, requestInit]) => {
        return (
          requestUrl(input).endsWith("/v1/billing/checkout/confirm") &&
          requestInit?.method === "POST"
        );
      }).length
    ).toBe(1);

    expect(resolveRefreshSession).not.toBeNull();
    resolveRefreshSession!(
      new Response(JSON.stringify({ session: createSession({ organization_plan: "team" }) }), {
        status: 200
      })
    );

    await waitFor(() => {
      expect(screen.getByText(/^team$/i)).toBeInTheDocument();
    });

    expect(
      fetchMock.mock.calls.filter(([input, requestInit]) => {
        return (
          requestUrl(input).endsWith("/v1/billing/checkout/confirm") &&
          requestInit?.method === "POST"
        );
      }).length
    ).toBe(1);
  });

  it("shows the owner gate on the billing surface without blocking unverified owners", async () => {
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
            plan: "solo",
            stripe_customer_id: "cus_123",
            active_projects: 1,
            capacity_units: {
              total: 3,
              included: 3,
              additional_purchased: 0,
              pending_reduction: null
            },
            allowances: {
              monthly_bundle_requests: {
                used: 180,
                limit: 750
              },
              monthly_raw_ingested_events: {
                used: 800,
                limit: 10500
              },
              retained_bundle_cap: {
                used: 40,
                limit: 450
              },
              monthly_remote_activations: {
                used: 3,
                limit: 75
              },
              monthly_alert_deliveries: {
                used: 10,
                limit: 225
              },
              monthly_webhook_deliveries: {
                used: 20,
                limit: 750
              }
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", ownerFetchMock);

    const ownerView = render(<App initialEntries={["/billing"]} />);

    expect(await screen.findByRole("button", { name: /manage subscription/i })).toBeEnabled();
    expect(
      screen.queryByText(/verify your email before enabling billing changes/i)
    ).not.toBeInTheDocument();
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

    expect(
      await screen.findByText(/owner permissions are required to manage billing/i)
    ).toBeInTheDocument();
  });

  it("lets internal admin-managed plans reduce capacity immediately from the billing page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ organization_plan: "team" })
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "team",
            stripe_customer_id: null,
            active_projects: 3,
            capacity_units: {
              total: 17,
              included: 15,
              additional_purchased: 2,
              pending_reduction: null
            }
          })
        });
      }

      if (url.endsWith("/v1/billing/capacity/scheduled-reduction") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(JSON.stringify({ target_additional_capacity_units: 1 }));

        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "team",
            stripe_customer_id: null,
            active_projects: 3,
            capacity_units: {
              total: 16,
              included: 15,
              additional_purchased: 1,
              pending_reduction: null
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing"]} />);

    expect(await screen.findByRole("heading", { name: /billing/i, level: 1 })).toBeInTheDocument();
    expect(await screen.findByText(/billing is managed internally/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /manage capacity/i }));
    expect(
      await screen.findByText(/internal admin-managed accounts update purchased allowance units immediately/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /keep current units/i })).not.toBeInTheDocument();

    const reductionInput = screen.getByLabelText(/purchased extra units after update/i);
    await user.clear(reductionInput);
    await user.type(reductionInput, "1");
    await user.click(screen.getByRole("button", { name: /reduce capacity now/i }));

    expect(await screen.findByText(/^1$/i, { selector: "p.font-medium" })).toBeInTheDocument();
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
              total: 5,
              included: 3,
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
              total: 5,
              included: 3,
              additional_purchased: 2,
              pending_reduction: {
                additional_purchased: 0,
                total: 3,
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
    expect(
      await screen.findByRole("heading", { name: /manage allowance capacity/i })
    ).toBeInTheDocument();

    const reductionInput = screen.getByLabelText(/purchased extra units after renewal/i);
    await user.clear(reductionInput);
    await user.type(reductionInput, "0");
    await user.click(screen.getByRole("button", { name: /schedule reduction/i }));

    expect((await screen.findAllByText(/dropping to 3 total units/i)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /keep current units/i })).toBeInTheDocument();
  });

  it("cancels a pending capacity reduction from the billing page", async () => {
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
              total: 5,
              included: 3,
              additional_purchased: 2,
              pending_reduction: {
                additional_purchased: 0,
                total: 3,
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

      if (url.endsWith("/v1/billing/capacity/scheduled-reduction") && init?.method === "DELETE") {
        expect(init.credentials).toBe("include");
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "solo",
            stripe_customer_id: "cus_123",
            active_projects: 3,
            capacity_units: {
              total: 5,
              included: 3,
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

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing"]} />);

    expect(await screen.findByText(/dropping to 3 total units/i)).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /manage capacity/i }));
    await user.click(screen.getByRole("button", { name: /keep current units/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).endsWith("/v1/billing/capacity/scheduled-reduction") &&
            init?.method === "DELETE"
        )
      ).toBe(true);
    });

    expect(
      await screen.findByText(/scheduled capacity reduction cancelled successfully/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/dropping to 3 total units/i)).toBeNull();
  });

  it("keeps the project create dialog open and shows an error when project creation fails", async () => {
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

      if (url.endsWith("/v1/projects") && init?.method === "POST") {
        return jsonResponse(500, { error: "project_create_failed" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects"]} />);

    await screen.findByRole("heading", { name: /projects/i, level: 1 });
    await user.click(screen.getByRole("button", { name: /create project/i }));
    await user.type(await screen.findByLabelText(/project name/i), "Broken Project");
    await user.type(screen.getByLabelText(/project slug/i), "broken-project");
    await user.click(screen.getByRole("button", { name: /^create project$/i }));

    expect(await screen.findByText(/could not create project/i)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows a canceled checkout return dialog on the billing page without confirming checkout", async () => {
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

      if (url.endsWith("/v1/billing/checkout/confirm")) {
        throw new Error("confirm should not be called");
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing?checkout=canceled"]} />);

    expect(await screen.findByRole("heading", { name: /billing/i, level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: /checkout canceled/i })).toBeInTheDocument();
    expect(
      screen.getByText(/no payment was completed and your plan has not changed/i)
    ).toBeInTheDocument();
  });

  it("shows an error toast when opening the billing portal fails", async () => {
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
            capacity_units: {
              total: 3,
              included: 3,
              additional_purchased: 0,
              pending_reduction: null
            }
          })
        });
      }

      if (url.endsWith("/v1/billing/portal") && init?.method === "POST") {
        return jsonResponse(500, { error: "portal_unavailable" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing"]} />);

    await screen.findByRole("heading", { name: /billing/i, level: 1 });
    await user.click(await screen.findByRole("button", { name: /manage subscription/i }));

    expect(
      await screen.findByText(/subscription management is unavailable right now/i)
    ).toBeInTheDocument();
  });

  it("shows an error toast when deleting a project alert rule fails", async () => {
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
          alerts: [createAlert()]
        });
      }

      if (url.endsWith("/v1/alerts/alert_123") && init?.method === "DELETE") {
        return jsonResponse(500, { error: "delete_failed" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/alerts"]} />);

    expect(await screen.findByText(/new incident/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /delete/i }));
    await user.click(await screen.findByRole("button", { name: /^delete alert$/i }));

    expect(await screen.findByText(/could not delete alert rule/i)).toBeInTheDocument();
    expect(screen.getByText(/enabled/i)).toBeInTheDocument();
  });

  it("shows a billing capacity error toast when increasing units fails validation", async () => {
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
            active_projects: 2,
            capacity_units: {
              total: 4,
              included: 3,
              additional_purchased: 1,
              pending_reduction: null
            }
          })
        });
      }

      if (url.endsWith("/v1/billing/capacity/increase") && init?.method === "POST") {
        return jsonResponse(400, { error: "invalid_target_quantity" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing"]} />);

    await screen.findByRole("heading", { name: /billing/i, level: 1 });
    await user.click(await screen.findByRole("button", { name: /manage capacity/i }));

    const increaseInput = screen.getByLabelText(/^purchased extra units$/i);
    await user.clear(increaseInput);
    await user.type(increaseInput, "2");
    await user.click(screen.getByRole("button", { name: /increase capacity now/i }));

    expect(
      await screen.findByText(/choose a unit count above your current purchased quantity/i)
    ).toBeInTheDocument();
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
    expect(await screen.findByText(/no incidents need attention for this project/i)).toBeInTheDocument();
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
