// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { openSelect, chooseSelectOption } from "./helpers/management-ui.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

describe("alert editing", () => {
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
    expect(screen.getByLabelText(/^cooldown$/i)).toHaveValue(0);
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
          service_id: null,
          is_enabled: true,
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
    expect(screen.getByLabelText(/^cooldown$/i)).toHaveValue(1);
    expect(screen.getByText(/recommended for email: 1 day/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/recipient email/i));
    await user.type(screen.getByLabelText(/recipient email/i), "alerts@example.com");
    expect(screen.queryByLabelText(/notify on/i)).not.toBeInTheDocument();
    await chooseSelectOption(user, /condition/i, /^severity threshold$/i);
    expect(screen.getByLabelText(/notify on/i)).toHaveTextContent(/new incidents and regressions/i);
    await chooseSelectOption(user, /notify on/i, /^regressions only$/i);
    await chooseSelectOption(user, /minimum severity/i, /^critical$/i);
    await user.clear(screen.getByLabelText(/^cooldown$/i));
    await user.type(screen.getByLabelText(/^cooldown$/i), "2");
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
    expect(screen.getByLabelText(/^cooldown$/i)).toHaveValue(1);
    expect(screen.getByText(/recommended for email: 1 day/i)).toBeInTheDocument();

    await user.clear(recipientInput);
    await user.type(recipientInput, "alerts@example.com");
    await user.click(screen.getByRole("button", { name: /^create alert rule$/i }));

    await waitFor(() => {
      expect(screen.getByRole("cell", { name: "Email - alerts@example.com" })).toBeInTheDocument();
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
    expect(screen.getByLabelText(/^cooldown$/i)).toHaveValue(0);
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

  it("retains the Slack Team gate while offering email, Discord and alert webhook", async () => {
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
      "Discord",
      "Alert webhook"
    ]);
    expect(channelOptions[1]).toHaveAttribute("data-disabled");
    await chooseSelectOption(user, /channel/i, /^alert webhook$/i);
    expect(screen.getByText(/separate from the Webhooks tab/i)).toBeInTheDocument();
  });
});
