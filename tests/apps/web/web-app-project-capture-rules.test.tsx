// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

const captureRuleFixture = {
  id: "rule_1",
  project_id: "proj_123",
  name: "Demote analytics resource errors",
  description: "Known third-party browser resource noise.",
  enabled: true,
  action: "demote" as const,
  matcher: {
    event_types: ["frontend_exception"],
    browser_event_kind: "resource_error",
    resource_url: { host: "analytics.example.com" }
  },
  sample_rate: null,
  sample_event_class: null,
  created_by_user_id: null,
  created_from_incident_id: "inc_123",
  created_from_event_id: null,
  expires_at: null,
  hit_count: 12,
  last_matched_at: "2026-05-26T10:10:00.000Z",
  created_at: "2026-05-26T10:00:00.000Z",
  updated_at: "2026-05-26T10:00:00.000Z"
};

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("web app — project capture rules", () => {
  it("renders capture rules between capture policy and improvement settings and lets managers pause a rule", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [createProject({ organization_plan: "solo" })] });
      }

      if (url.endsWith("/v1/projects/proj_123/capture-policy") && init?.method === undefined) {
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

      if (url.endsWith("/v1/projects/proj_123/capture-rules") && init?.method === undefined) {
        return jsonResponse(200, {
          access_mode: "manage",
          rules: [captureRuleFixture]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/capture-rules/rule_1") && init?.method === "PATCH") {
        expect(init.body).toBe(JSON.stringify({ enabled: false }));
        return jsonResponse(200, {
          rule: {
            ...captureRuleFixture,
            enabled: false
          }
        });
      }

      if (url.endsWith("/v1/projects/proj_123/improvement-settings") && init?.method === undefined) {
        return jsonResponse(200, {
          access_mode: "manage",
          cloud_automation_available: true,
          settings: {
            automated_improvement_bundles_enabled: true,
            improvement_bundle_sensitivity: "balanced"
          }
        });
      }

      if (url.includes("/v1/weekly-report-channels?")) {
        return jsonResponse(200, { channels: [] });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    const capturePolicyHeading = await screen.findByRole("heading", { name: /capture policy/i, level: 3 });
    const captureRulesHeading = await screen.findByRole("heading", { name: /capture rules/i, level: 3 });
    const improvementHeading = await screen.findByRole("heading", { name: /automated improvement bundles/i, level: 3 });

    expect(capturePolicyHeading.compareDocumentPosition(captureRulesHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(captureRulesHeading.compareDocumentPosition(improvementHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/demote analytics resource errors/i)).toBeInTheDocument();
    expect(screen.getByText(/known third-party browser resource noise/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^pause$/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/capture-rules/rule_1") && init?.method === "PATCH"
        )
      ).toBe(true);
    });

    expect(await screen.findByText(/^disabled$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^enable$/i })).toBeInTheDocument();
  });

  it("shows capture rules in preview-only mode for shared members", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ role: "member" }) });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ relationship: "shared", effective_role: "member", organization_plan: "team" })]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/capture-policy") && init?.method === undefined) {
        return jsonResponse(200, {
          access_mode: "preview",
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

      if (url.endsWith("/v1/projects/proj_123/capture-rules") && init?.method === undefined) {
        return jsonResponse(200, {
          access_mode: "preview",
          rules: [captureRuleFixture]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/improvement-settings") && init?.method === undefined) {
        return jsonResponse(200, {
          access_mode: "preview",
          cloud_automation_available: true,
          settings: {
            automated_improvement_bundles_enabled: true,
            improvement_bundle_sensitivity: "balanced"
          }
        });
      }

      if (url.includes("/v1/weekly-report-channels?")) {
        return jsonResponse(200, { channels: [] });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    expect(await screen.findByRole("heading", { name: /capture rules/i, level: 3 })).toBeInTheDocument();
    expect(screen.getByText(/members can review project capture rules here/i)).toBeInTheDocument();
    expect(screen.getByText(/demote analytics resource errors/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^pause$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^delete$/i })).toBeNull();
  });
});
