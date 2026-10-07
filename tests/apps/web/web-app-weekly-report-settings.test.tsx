// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";
import { openProjectSettingsSection, chooseSelectOption } from "./helpers/management-ui.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

describe("weekly report settings", () => {
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
    await openProjectSettingsSection("Weekly reports");

    expect(
      await screen.findByRole("button", { name: /save email weekly report/i })
    ).toBeInTheDocument();

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

      if (
        url.endsWith("/v1/weekly-report-channels?project_id=proj_123&limit=50") &&
        init?.method === undefined
      ) {
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
    await openProjectSettingsSection("Weekly reports");

    const emptyWeeklyReportsTitle = await screen.findByText("No Slack weekly reports yet");
    expect(emptyWeeklyReportsTitle.closest('[data-slot="empty"]')).toHaveClass(
      "min-h-[11rem]",
      "border",
      "border-dashed",
      "border-border/80",
      "bg-background/50"
    );
    expect(
      await screen.findByRole("button", { name: /create slack weekly report/i })
    ).toBeInTheDocument();
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

      if (
        url.endsWith("/v1/weekly-report-channels?project_id=proj_123&limit=50") &&
        init?.method === undefined
      ) {
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
    await openProjectSettingsSection("Weekly reports");

    expect(
      await screen.findByText(/slack weekly reports are paused on the current plan/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /create slack weekly report/i })
    ).not.toBeInTheDocument();
    expect(await screen.findByText(/acme workspace - #weekly-reports/i)).toBeInTheDocument();
    expect(screen.getByText(/friday at 16:00 America\/New_York/i)).toBeInTheDocument();
  });
});
