// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import {
  resetBrowserSessionClientState,
  type AvailabilityCheckDailyRollupRecord,
  type AvailabilityCheckRecord,
  type AvailabilityCheckResultRecord
} from "../../../apps/web/src/lib/api.ts";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

if (typeof HTMLElement !== "undefined") {
  HTMLElement.prototype.hasPointerCapture ??= () => false;
  HTMLElement.prototype.setPointerCapture ??= () => {};
  HTMLElement.prototype.releasePointerCapture ??= () => {};
}

async function chooseSelectOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  optionName: string
): Promise<void> {
  const trigger = screen.getByLabelText(label);
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
  await user.click(await screen.findByRole("option", { name: optionName }));
}

function createHealthCheck(overrides: Partial<AvailabilityCheckRecord> = {}): AvailabilityCheckRecord {
  return {
    check_id: "chk_1",
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

const resultFixture: AvailabilityCheckResultRecord = {
  result_id: "res_1",
  check_id: "chk_1",
  project_id: "proj_123",
  started_at: "2026-06-15T10:00:00.000Z",
  completed_at: "2026-06-15T10:00:00.180Z",
  duration_ms: 180,
  status: "success",
  http_status: 200,
  error_kind: null,
  error_message: null,
  redirect_count: 0,
  checked_url_host: "app.example.com",
  final_url: "https://app.example.com/health"
};

const rollupFixture: AvailabilityCheckDailyRollupRecord = {
  check_id: "chk_1",
  project_id: "proj_123",
  day: "2026-06-15",
  state: "operational",
  total_checks: 1440,
  successful_checks: 1438,
  failed_checks: 2,
  degraded_checks: 0,
  avg_duration_ms: 185,
  first_checked_at: "2026-06-15T00:00:00.000Z",
  last_checked_at: "2026-06-15T23:59:00.000Z",
  downtime_seconds: 60,
  incident_ids: []
};

afterEach(() => {
  resetBrowserSessionClientState();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("web app — project health page", () => {
  it("renders checks, retained history, and manages a health check from the project tab", async () => {
    const user = userEvent.setup();
    const project = createProject({
      project_id: "proj_123",
      name: "Main App",
      organization_plan: "team",
      effective_role: "owner"
    });
    const savedCheck = createHealthCheck();
    const createdCheck = createHealthCheck({
      check_id: "chk_2",
      name: "Checkout app",
      url: "https://checkout.example.com/health",
      service_name: "checkout"
    });
    const checks = [savedCheck];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: "team" }) });
      }
      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [project] });
      }
      if (url.endsWith("/v1/projects/proj_123/availability-checks?limit=50")) {
        return jsonResponse(200, {
          checks,
          limits: { max_checks_per_project: 25, min_interval_seconds: 30 }
        });
      }
      if (url.endsWith("/v1/projects/proj_123/availability-checks/chk_1/results?limit=20")) {
        return jsonResponse(200, { results: [resultFixture] });
      }
      if (url.endsWith("/v1/projects/proj_123/availability-checks/chk_1/daily-rollups?limit=30")) {
        return jsonResponse(200, { rollups: [rollupFixture] });
      }
      if (url.endsWith("/v1/projects/proj_123/availability-checks/chk_2/results?limit=20")) {
        return jsonResponse(200, { results: [] });
      }
      if (url.endsWith("/v1/projects/proj_123/availability-checks/chk_2/daily-rollups?limit=30")) {
        return jsonResponse(200, { rollups: [] });
      }
      if (url.endsWith("/v1/projects/proj_123/availability-checks/test")) {
        return jsonResponse(200, {
          normalized_url: "https://checkout.example.com/health",
          result: {
            status: "success",
            http_status: 200,
            duration_ms: 140,
            error_kind: null,
            error_message: null,
            checked_url_host: "checkout.example.com",
            checked_url_path: "/health",
            checked_url_query: {},
            final_url: "https://checkout.example.com/health",
            redirect_count: 0
          }
        });
      }
      if (url.endsWith("/v1/projects/proj_123/availability-checks") && init?.method === "POST") {
        checks.push(createdCheck);
        return jsonResponse(201, { check: createdCheck });
      }
      if (url.endsWith("/v1/projects/proj_123/availability-checks/chk_1") && init?.method === "DELETE") {
        checks.splice(0, checks.length, createdCheck);
        return jsonResponse(200, { deleted: true });
      }

      return jsonResponse(404, { error: "not_found" });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/health"]} />);

    expect(await screen.findByRole("heading", { name: "Health checks" })).toBeInTheDocument();
    expect(await screen.findByText("Primary app")).toBeInTheDocument();
    expect(screen.getAllByText("Passing").length).toBeGreaterThan(0);
    expect(screen.getByText(/GET https:\/\/app\.example\.com\/health/)).toBeInTheDocument();
    expect((await screen.findAllByText("https://app.example.com/health")).length).toBeGreaterThan(0);
    expect(screen.getByText(/1440 checks/)).toBeInTheDocument();
    expect(screen.getByText(/30-day daily history/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    expect(await screen.findByDisplayValue("Primary app")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://app.example.com/health")).toBeInTheDocument();
    expect(screen.getByDisplayValue("60")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Enabled" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: /^close$/i }));

    await user.click(screen.getByRole("button", { name: /create health check/i }));
    expect(screen.getByLabelText(/interval/i)).toHaveValue(60);
    await user.type(screen.getByLabelText(/^name$/i), "Checkout app");
    await user.clear(screen.getByLabelText(/check url/i));
    await user.type(screen.getByLabelText(/check url/i), "https://checkout.example.com/health");
    await user.clear(screen.getByLabelText(/interval/i));
    await user.type(screen.getByLabelText(/interval/i), "30");
    await chooseSelectOption(user, "Service", "Custom service");
    await user.type(screen.getByRole("textbox", { name: "Custom service" }), "checkout");

    await user.click(screen.getByRole("button", { name: /test endpoint/i }));
    expect(await screen.findByText(/endpoint responded within the expected status range/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create check/i }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([requestInput, init]) => requestUrl(requestInput).endsWith("/v1/projects/proj_123/availability-checks") && init?.method === "POST")).toBe(true);
    });
    expect(await screen.findByText("Checkout app")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /^delete$/i })[0]!);
    await user.click(await screen.findByRole("button", { name: /delete check/i }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([requestInput, init]) =>
            requestUrl(requestInput).endsWith("/v1/projects/proj_123/availability-checks/chk_1") &&
            init?.method === "DELETE"
        )
      ).toBe(true);
    });
  });

  it("hides the linked incident badge after the incident is resolved", async () => {
    const project = createProject({
      project_id: "proj_123",
      name: "Main App",
      organization_plan: "team",
      effective_role: "owner"
    });
    const checks = [
      createHealthCheck({
        linked_incident_id: "inc_123",
        linked_incident_status: "resolved",
        status: "failing"
      })
    ];

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
        if (url.endsWith("/v1/projects/proj_123/availability-checks?limit=50")) {
          return jsonResponse(200, {
            checks,
            limits: { max_checks_per_project: 25, min_interval_seconds: 30 }
          });
        }
        if (url.endsWith("/v1/projects/proj_123/availability-checks/chk_1/results?limit=20")) {
          return jsonResponse(200, { results: [] });
        }
        if (url.endsWith("/v1/projects/proj_123/availability-checks/chk_1/daily-rollups?limit=30")) {
          return jsonResponse(200, { rollups: [] });
        }

        return jsonResponse(404, { error: "not_found" });
      })
    );

    render(<App initialEntries={["/projects/proj_123/health"]} />);

    expect(await screen.findByRole("heading", { name: "Health checks" })).toBeInTheDocument();
    expect(await screen.findByText("Primary app")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open incident" })).not.toBeInTheDocument();
  });
});
