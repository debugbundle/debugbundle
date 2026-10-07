// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "../../../node_modules/.pnpm/node_modules/react-router-dom/dist/index.js";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectWeeklyReportSettingsCard } from "../../../apps/web/src/components/system/project-weekly-report-settings-card.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { jsonResponse, requestUrl } from "./web-test-helpers.js";
import { parseRequestBody } from "./helpers/request-body.js";
afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});
function mockChannels(raw = false) {
  const channels = [
    {
      channel_id: "email_1",
      project_id: "proj_123",
      channel: "email",
      config: { to: ["owner@example.com"] },
      schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
      is_enabled: true,
      created_at: "2026-03-15T00:00:00.000Z",
      updated_at: "2026-03-15T00:00:00.000Z"
    },
    ...(raw
      ? [
          {
            channel_id: "slack_1",
            project_id: "proj_123",
            channel: "slack",
            config: { webhook_url: "https://hooks.slack.com/services/saved" },
            schedule: { day_of_week: "monday", hour_of_day: 9, timezone: "UTC" },
            is_enabled: false,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ]
      : [])
  ];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.includes("/weekly-report-channels?")) return jsonResponse(200, { channels });
    if (url.includes("/slack/destinations")) return jsonResponse(200, { destinations: [] });
    if (init?.method === "PATCH")
      return jsonResponse(200, { channel: { ...channels.at(-1), ...parseRequestBody(init.body) } });
    if (init?.method === "POST")
      return jsonResponse(201, {
        channel: { ...channels[0], ...parseRequestBody(init.body), channel_id: "slack_2" }
      });
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return jsonResponse(404, { error: "not_found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
function show(canEdit = true, plan: "free" | "team" = "team") {
  const view = render(
    <MemoryRouter>
      <ProjectWeeklyReportSettingsCard
        projectId="proj_123"
        organizationPlan={plan}
        canEdit={canEdit}
      />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole("button", { name: "Weekly reports" }));
  return view;
}
it.each([false, true])(
  "tests and disconnects connected Slack destinations, retaining failures for retry %s",
  async (failed) => {
    const base = mockChannels();
    const destination = {
      slack_destination_id: "slack_destination",
      organization_id: "org",
      slack_team_id: "team",
      slack_team_name: "Team",
      slack_channel_id: "channel",
      slack_channel_name: "reports",
      installed_by_member_id: null,
      is_active: true,
      created_at: "2026-10-07T00:00:00Z",
      updated_at: "2026-10-07T00:00:00Z"
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/slack/destinations"))
        return jsonResponse(200, { destinations: [destination] });
      if (url.endsWith("/slack_destination/test"))
        return jsonResponse(
          failed ? 503 : 200,
          failed ? { error: "unavailable" } : { delivered: true }
        );
      if (url.endsWith("/slack_destination") && init?.method === "DELETE")
        return failed
          ? jsonResponse(503, { error: "unavailable" })
          : new Response(null, { status: 204 });
      return base(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    show();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Create Slack weekly report" }));
    await user.click(await screen.findByRole("button", { name: "Send test message" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Send test message" })).toBeEnabled()
    );
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          requestUrl(input).endsWith("/slack_destination/test") && init?.method === "POST"
      )
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Disconnect channel" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true)
    );
    if (failed)
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Disconnect channel" })).toBeEnabled()
      );
    else
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Disconnect channel" })).not.toBeInTheDocument()
      );
  }
);
it.each([false, true])(
  "handles a local synthetic Slack installation handoff and failed start %s",
  async (failed) => {
    const base = mockChannels();
    const originalHref = window.location.href;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (requestUrl(input).includes("/slack/app/install-url?"))
        return jsonResponse(
          failed ? 503 : 200,
          failed ? { error: "unavailable" } : { install_url: originalHref + "#synthetic-slack" }
        );
      return base(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    show();
    const user = userEvent.setup();
    try {
      await user.click(await screen.findByRole("button", { name: "Create Slack weekly report" }));
      await user.click(await screen.findByRole("button", { name: "Connect Slack" }));
      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some(([input]) =>
            requestUrl(input).includes("/slack/app/install-url?")
          )
        ).toBe(true)
      );
      if (failed)
        await waitFor(() =>
          expect(screen.getByRole("button", { name: "Connect Slack" })).toBeEnabled()
        );
      else await waitFor(() => expect(window.location.hash).toBe("#synthetic-slack"));
    } finally {
      window.history.replaceState(null, "", originalHref);
    }
  }
);
it("applies the supported weekly channel bound without claiming a total", async () => {
  const fetchMock = mockChannels();
  show();
  const user = userEvent.setup();
  const limit = await screen.findByLabelText("Weekly report limit");
  fireEvent.change(limit, { target: { value: "100" } });
  await user.click(screen.getByRole("button", { name: "Apply weekly report limit" }));
  await waitFor(() =>
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("limit=100"))).toBe(
      true
    )
  );
});
it("confirms email channel deletion and permits recreating the default channel", async () => {
  const fetchMock = mockChannels();
  show();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Delete email weekly report" }));
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Delete email weekly report"
    })
  );
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) => requestUrl(input).endsWith("/email_1") && init?.method === "DELETE"
      )
    ).toBe(true)
  );
  expect(screen.queryByRole("button", { name: "Delete email weekly report" })).toBeNull();
});
it("edits a saved direct webhook without replacing it with a connected Slack destination", async () => {
  const fetchMock = mockChannels(true);
  show();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  expect(within(screen.getByRole("dialog")).getByLabelText("Slack webhook URL")).toHaveValue(
    "https://hooks.slack.com/services/saved"
  );
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Save Slack weekly report" })
  );
  await waitFor(() =>
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true)
  );
  const request = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
  expect(parseRequestBody(request?.[1]?.body)).toMatchObject({
    config: { webhook_url: "https://hooks.slack.com/services/saved" },
    is_enabled: false
  });
});
it("keeps read-only callers from deleting channels", async () => {
  mockChannels();
  show(false);
  await screen.findByText("Email report");
  expect(screen.queryByRole("button", { name: "Delete email weekly report" })).toBeNull();
});

it("confirms preserved Slack weekly-report cleanup after downgrade", async () => {
  const fetchMock = mockChannels(true);
  show(true, "free");
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Delete Slack weekly report" }));
  expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Delete Slack weekly report"
    })
  );
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) => requestUrl(input).endsWith("/slack_1") && init?.method === "DELETE"
      )
    ).toBe(true)
  );
});
