// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

function createSummary() {
  return {
    generated_at: "2026-06-12T15:30:00.000Z",
    collection_started_at: "2026-06-10T00:00:00.000Z",
    windows: {
      today: {
        starts_at: "2026-06-12T00:00:00.000Z",
        ends_at: "2026-06-12T15:30:00.000Z"
      },
      this_week: {
        starts_at: "2026-06-08T00:00:00.000Z",
        ends_at: "2026-06-12T15:30:00.000Z"
      },
      this_month: {
        starts_at: "2026-06-01T00:00:00.000Z",
        ends_at: "2026-06-12T15:30:00.000Z"
      },
      this_year: {
        starts_at: "2026-01-01T00:00:00.000Z",
        ends_at: "2026-06-12T15:30:00.000Z"
      }
    },
    kpis: {
      active_accounts_today: 3,
      active_accounts_this_week: 7,
      active_accounts_this_month: 11,
      new_accounts_today: 1,
      new_accounts_this_week: 4,
      new_accounts_this_month: 6,
      deleted_accounts_this_month: 2,
      active_accounts_total: 14,
      deleted_accounts_total: 5
    },
    usage: {
      raw_events_accepted_this_month: 1200,
      billable_events_counted_this_month: 1100,
      incident_signal_events_this_month: 400,
      context_signal_events_this_month: 500,
      operational_signal_events_this_month: 300,
      cloud_verification_events_this_month: 8,
      local_verification_events_this_month: 13
    },
    incidents: {
      opened_this_month: 10,
      resolved_this_month: 8,
      reopened_this_month: 2,
      regressed_this_month: 1,
      occurrences_this_month: 27,
      high_severity_occurrences_this_month: 11,
      critical_severity_occurrences_this_month: 4,
      auto_detected_spikes_this_month: 3,
      resolution_rate_this_month: 0.8
    },
    bundles: {
      failure_created_this_month: 9,
      failure_updated_this_month: 6,
      failure_generation_failed_this_month: 1,
      improvement_created_this_month: 5,
      improvement_generation_failed_this_month: 2,
      reproductions_created_this_month: 7,
      reproductions_failed_this_month: 1
    },
    improvements: {
      opened_this_month: 6,
      resolved_this_month: 3,
      snoozed_this_month: 1,
      resolution_rate_this_month: 0.5,
      recurring_incident_opened_this_month: 2,
      post_deploy_regression_opened_this_month: 1,
      slow_request_opened_this_month: 1,
      request_failure_opened_this_month: 1,
      warning_log_opened_this_month: 1
    },
    billing: {
      trials_started_this_month: 4,
      trials_converted_this_month: 2,
      trials_expired_this_month: 1,
      plan_upgrades_this_month: 3,
      plan_downgrades_this_month: 1,
      capacity_units_purchased_this_month: 12,
      capacity_units_reduced_this_month: 3
    },
    health: {
      raw_events_rejected_this_month: 17,
      malformed_rejections_this_month: 4,
      rate_limited_rejections_this_month: 5,
      quota_rejections_this_month: 2,
      capture_policy_rejections_this_month: 3,
      capture_rule_rejections_this_month: 3,
      alert_deliveries_failed_this_month: 2,
      webhook_deliveries_failed_this_month: 1,
      weekly_reports_failed_this_month: 1,
      github_dispatches_failed_this_month: 2,
      webhooks_auto_disabled_this_month: 1,
      operational_emails_sent_this_month: 8,
      allowance_warning_emails_sent_this_month: 2,
      allowance_limit_emails_sent_this_month: 1
    }
  };
}

function createMalformedBreakdown() {
  return {
    generated_at: "2026-06-12T15:30:00.000Z",
    window: {
      starts_at: "2026-06-01T00:00:00.000Z",
      ends_at: "2026-06-12T15:30:00.000Z"
    },
    total_malformed_rejections_this_month: 4,
    top_sources: [
      {
        project_id: "project_123",
        project_name: "Tasktime",
        project_slug: "tasktime",
        service_name: "web",
        service_environment: "production",
        service_runtime: "node",
        sdk_name: "@debugbundle/node",
        sdk_version: "1.4.0",
        event_type: "log",
        occurrences: 3,
        last_seen_at: "2026-06-12T15:29:00.000Z"
      }
    ],
    top_validation_failures: [
      {
        sdk_name: "@debugbundle/node",
        sdk_version: "1.4.0",
        event_type: "log",
        validation_code: "invalid_type",
        validation_path: "payload.stack",
        occurrences: 2,
        last_seen_at: "2026-06-12T15:28:00.000Z"
      }
    ]
  };
}

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

describe("web app — admin analytics", () => {
  it("renders the admin analytics dashboard while the sidebar links to workspace analytics", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/admin/analytics/summary")) {
        return jsonResponse(200, {
          summary: createSummary()
        });
      }

      if (url.endsWith("/v1/admin/analytics/malformed-rejections")) {
        return jsonResponse(200, {
          breakdown: createMalformedBreakdown()
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/analytics"]} />);

    expect(await screen.findByRole("heading", { name: /analytics/i })).toBeInTheDocument();
    expect(screen.getByText("Active this month")).toBeInTheDocument();
    expect(screen.getByText("1,200")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("Malformed rejection breakdown")).toBeInTheDocument();
    expect(screen.getByText("Top sources")).toBeInTheDocument();
    expect(screen.getByText("Tasktime")).toBeInTheDocument();
    expect(screen.getByText("payload.stack")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^analytics$/i })).toHaveAttribute(
      "href",
      "/analytics/workspace"
    );
  });

  it("shows the email-code gate for allowlisted analytics sessions authenticated with GitHub", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/admin/analytics/summary")) {
        return jsonResponse(404, { error: "not_found" });
      }

      if (url.endsWith("/v1/admin/analytics/access-status")) {
        return jsonResponse(200, { status: "email_auth_required" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/analytics"]} />);

    expect(await screen.findByText(/continue with email/i)).toBeInTheDocument();
    expect(screen.getByText(/analytics access requires an email-authenticated session/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send code/i })).toBeInTheDocument();
  });

  it("redirects signed-in non-admin analytics visits back to the normal app flow", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/admin/analytics/summary")) {
        return jsonResponse(404, { error: "not_found" });
      }

      if (url.endsWith("/v1/admin/analytics/access-status")) {
        return jsonResponse(404, { error: "not_found" });
      }

      if (url.endsWith("/v1/projects")) {
        return jsonResponse(200, {
          projects: []
        });
      }

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, {
          incidents: [],
          next_cursor: null
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/analytics"]} />);

    expect(await screen.findByRole("heading", { name: /incidents today/i })).toBeInTheDocument();
    expect(screen.queryByText(/page not found/i)).not.toBeInTheDocument();
  });

  it("redirects signed-out direct analytics visits into the normal login flow", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: null
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/analytics"]} />);

    expect(await screen.findByRole("link", { name: /continue with github/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send code/i })).toBeInTheDocument();
  });
});
