// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import {
  createAlert,
  createProject,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";
import { chooseSelectOption } from "./helpers/management-ui.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

describe("alert management", () => {
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
});
