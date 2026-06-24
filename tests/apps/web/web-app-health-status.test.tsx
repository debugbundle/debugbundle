// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("web app — health status", () => {
  it("shows project color tags in the health status list", async () => {
    const project = createProject({
      color_tag: "emerald",
      organization_plan: "team"
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);

        if (url.endsWith("/v1/auth/session")) {
          return jsonResponse(200, { session: createSession({ organization_plan: "team" }) });
        }

        if (url.endsWith("/v1/projects") && init?.method === undefined) {
          return jsonResponse(200, { projects: [project] });
        }

        if (url.endsWith(`/v1/projects/${project.project_id}/availability-checks?limit=100`)) {
          return jsonResponse(200, {
            checks: [
              {
                check_id: "chk_123",
                project_id: project.project_id,
                name: "API health",
                url: "https://api.debugbundle.test/health",
                method: "GET",
                expected_status_min: 200,
                expected_status_max: 399,
                timeout_ms: 5000,
                interval_seconds: 60,
                failure_threshold: 3,
                recovery_threshold: 2,
                environment: "production",
                service_name: "api",
                enabled: true,
                status: "passing",
                paused_reason: null,
                organization_plan: "team",
                consecutive_failures: 0,
                consecutive_successes: 10,
                linked_incident_id: null,
                linked_incident_status: null,
                last_checked_at: "2026-06-17T12:00:00.000Z",
                next_check_at: "2026-06-17T12:01:00.000Z",
                last_result_status: "success",
                last_result_http_status: 200,
                last_result_error_kind: null,
                last_result_error_message: null,
                last_result_duration_ms: 120,
                created_at: "2026-06-10T12:00:00.000Z",
                updated_at: "2026-06-17T12:00:00.000Z"
              }
            ],
            limits: { max_checks_per_project: 25, min_interval_seconds: 30 }
          });
        }

        if (
          url.endsWith(
            `/v1/projects/${project.project_id}/availability-checks/chk_123/daily-rollups?limit=30`
          )
        ) {
          return jsonResponse(200, {
            rollups: [
              {
                check_id: "chk_123",
                project_id: project.project_id,
                day: "2026-06-16",
                state: "degraded",
                total_checks: 10,
                successful_checks: 9,
                failed_checks: 1,
                degraded_checks: 1,
                avg_duration_ms: 120,
                first_checked_at: "2026-06-16T00:00:00.000Z",
                last_checked_at: "2026-06-16T12:00:00.000Z",
                downtime_seconds: 60,
                incident_ids: []
              },
              {
                check_id: "chk_123",
                project_id: project.project_id,
                day: "2026-06-17",
                state: "operational",
                total_checks: 10,
                successful_checks: 10,
                failed_checks: 0,
                degraded_checks: 0,
                avg_duration_ms: 120,
                first_checked_at: "2026-06-17T00:00:00.000Z",
                last_checked_at: "2026-06-17T12:00:00.000Z",
                downtime_seconds: 0,
                incident_ids: []
              }
            ]
          });
        }

        return jsonResponse(404, { error: "not_found" });
      })
    );

    render(<App initialEntries={["/health-status"]} />);

    expect(
      await screen.findByRole("heading", { name: /health status/i, level: 1 })
    ).toBeInTheDocument();
    expect(await screen.findByText(/main app/i)).toBeInTheDocument();
    expect(screen.getAllByText("100%").length).toBeGreaterThan(0);
    expect(document.querySelector('[data-project-color-tag="emerald"]')).not.toBeNull();
  });

  it("does not count resolved linked incidents as active", async () => {
    const project = createProject({
      organization_plan: "team"
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);

        if (url.endsWith("/v1/auth/session")) {
          return jsonResponse(200, { session: createSession({ organization_plan: "team" }) });
        }

        if (url.endsWith("/v1/projects") && init?.method === undefined) {
          return jsonResponse(200, { projects: [project] });
        }

        if (url.endsWith(`/v1/projects/${project.project_id}/availability-checks?limit=100`)) {
          return jsonResponse(200, {
            checks: [
              {
                check_id: "chk_123",
                project_id: project.project_id,
                name: "API health",
                url: "https://api.debugbundle.test/health",
                method: "GET",
                expected_status_min: 200,
                expected_status_max: 399,
                timeout_ms: 5000,
                interval_seconds: 60,
                failure_threshold: 3,
                recovery_threshold: 2,
                environment: "production",
                service_name: "api",
                enabled: true,
                status: "failing",
                paused_reason: null,
                organization_plan: "team",
                consecutive_failures: 3,
                consecutive_successes: 0,
                linked_incident_id: "inc_123",
                linked_incident_status: "resolved",
                last_checked_at: "2026-06-17T12:00:00.000Z",
                next_check_at: "2026-06-17T12:01:00.000Z",
                last_result_status: "timeout",
                last_result_http_status: null,
                last_result_error_kind: "timeout",
                last_result_error_message: "timed out",
                last_result_duration_ms: 5000,
                created_at: "2026-06-10T12:00:00.000Z",
                updated_at: "2026-06-17T12:00:00.000Z"
              }
            ],
            limits: { max_checks_per_project: 25, min_interval_seconds: 30 }
          });
        }

        if (
          url.endsWith(
            `/v1/projects/${project.project_id}/availability-checks/chk_123/daily-rollups?limit=30`
          )
        ) {
          return jsonResponse(200, { rollups: [] });
        }

        return jsonResponse(404, { error: "not_found" });
      })
    );

    render(<App initialEntries={["/health-status"]} />);

    expect(
      await screen.findByRole("heading", { name: /health status/i, level: 1 })
    ).toBeInTheDocument();
    expect(await screen.findByText("1 health check")).toBeInTheDocument();
    expect(screen.queryByText(/active incident/)).not.toBeInTheDocument();
  });
});
