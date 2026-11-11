// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { dashboardSetupStorageKey } from "../../../apps/web/src/lib/dashboard-setup-preferences.js";
import {
  createSession,
  createProject,
  createMemberTokenRecord,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

const org = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
function mockAccount(
  options: { existing?: boolean; failed?: boolean; userId?: string; analytics?: boolean } = {}
) {
  const session = createSession({
    organization_id: org,
    organization_plan: "free",
    ...(options.userId ? { user_id: options.userId } : {})
  });
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.endsWith("/v1/auth/session")) return jsonResponse(200, { session });
    if (url.endsWith("/v1/projects"))
      return options.failed
        ? jsonResponse(503, { error: "unavailable" })
        : jsonResponse(200, {
            projects: options.existing
              ? [createProject({ project_id: projectId, organization_id: org })]
              : []
          });
    if (url.includes("/v1/member/tokens"))
      return jsonResponse(200, {
        tokens: options.existing ? [createMemberTokenRecord({ organization_id: org })] : []
      });
    if (url.includes("/v1/incidents?"))
      return jsonResponse(200, { incidents: [], next_cursor: null });
    if (url.endsWith(`/v1/projects/${projectId}/analytics-settings`))
      return jsonResponse(200, {
        access_mode: "manage",
        analytics_available: true,
        settings: { enabled: options.analytics ?? false }
      });
    if (url.endsWith("/v1/auth/logout") && init?.method === "POST")
      return jsonResponse(200, { success: true });
    return jsonResponse(404, { error: "not_found" });
  });
  vi.stubGlobal("fetch", fetch);
  return { session, fetch };
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("dashboard welcome and setup", () => {
  it.each([false, true])(
    "shows analytics as optional on Free with actual enabled state %s",
    async (analytics) => {
      vi.stubEnv("VITE_DEBUGBUNDLE_DEV_MOCK", "true");
      const user = userEvent.setup();
      const { fetch } = mockAccount({ existing: true, analytics });
      render(<App initialEntries={["/dashboard?welcome=1"]} />);
      const welcome = await screen.findByRole("dialog", { name: "Welcome to DebugBundle" });
      await user.click(within(welcome).getByRole("button", { name: "View setup steps" }));
      const guide = await screen.findByRole("dialog", { name: "Your setup guide" });
      expect(within(guide).getByText("Make more of your plan")).toHaveTextContent(
        "Make more of your plan · Optional"
      );
      const link = await within(guide).findByRole("link", { name: "Open analytics settings" });
      expect(link).toHaveAttribute("href", `/projects/${projectId}/settings#analytics-settings`);
      await waitFor(() =>
        expect(within(link.closest("li")!).queryByText("Done") !== null).toBe(analytics)
      );
      expect(within(guide).getByText("Essential setup complete")).toBeVisible();
      expect(fetch.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(
        true
      );
    }
  );
  it.each([
    ["empty", 0],
    ["started", 1]
  ] as const)(
    "previews the %s sidebar state without overwriting account preferences",
    async (state, completed) => {
      vi.stubEnv("VITE_DEBUGBUNDLE_DEV_MOCK", "true");
      const user = userEvent.setup();
      const { session } = mockAccount({ existing: true });
      const key = dashboardSetupStorageKey(session.user_id, session.organization_id);
      const saved = JSON.stringify({
        version: 1,
        welcomeSeen: true,
        sidebarHidden: true,
        incidentReceived: true
      });
      window.localStorage.setItem(key, saved);
      const preview = render(
        <App
          initialEntries={[`/dashboard?setup=${state}${state === "empty" ? "&welcome=1" : ""}`]}
        />
      );
      if (state === "empty") {
        await screen.findByRole("dialog", { name: "Welcome to DebugBundle" });
        await user.keyboard("{Escape}");
      }
      const reminder = await screen.findByRole("button", {
        name: `Setup guide, ${completed} of 3 complete`
      });
      expect(reminder.closest('[data-slot="sidebar-footer"]')).not.toBeNull();
      expect(reminder).toHaveTextContent(`Setup guide · ${completed} of 3`);
      expect(within(reminder).queryByText("Create an Access token")).toBeNull();
      expect(within(reminder).queryByText("Set up your first project")).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
      await user.click(reminder);
      const guide = await screen.findByRole("dialog", { name: "Your setup guide" });
      expect(within(guide).getByText(`${completed} of 3 essentials complete`)).toBeVisible();
      const refresh = within(guide).getByRole("button", { name: "Refresh" });
      expect(refresh.querySelector("svg")?.parentElement).toBe(refresh);
      expect(refresh.querySelector("svg")).toHaveAttribute("data-icon", "inline-start");
      expect(refresh.querySelector("svg")).not.toHaveClass("size-4");
      expect(refresh).toHaveAttribute("data-variant", "outline");
      expect(refresh).toHaveAttribute("data-size", "sm");
      expect(
        within(guide).queryByRole("button", { name: /(?:View|Hide) setup prompt/ })
      ).toBeNull();
      expect(within(guide).queryByRole("textbox", { name: "Setup prompt" })).toBeNull();
      await user.keyboard("{Escape}");
      await user.click(screen.getByRole("button", { name: "Dismiss setup reminder" }));
      expect(screen.queryByRole("button", { name: /Setup guide/ })).toBeNull();
      await user.click(screen.getByRole("button", { name: new RegExp(session.email) }));
      await user.click(await screen.findByRole("menuitem", { name: "Setup guide" }));
      await screen.findByRole("dialog", { name: "Your setup guide" });
      await user.keyboard("{Escape}");
      expect(
        screen.getByRole("button", { name: `Setup guide, ${completed} of 3 complete` })
      ).toBeVisible();
      expect(window.localStorage.getItem(key)).toBe(saved);
      preview.unmount();
      render(<App initialEntries={["/dashboard"]} />);
      await screen.findByRole("button", { name: /owen@example.com/i });
      await waitFor(() => expect(screen.queryByText("Checking setup…")).toBeNull());
      expect(screen.queryByRole("button", { name: /Setup guide/ })).toBeNull();
    }
  );

  it("can replay the welcome in the local demo without resetting existing progress", async () => {
    vi.stubEnv("VITE_DEBUGBUNDLE_DEV_MOCK", "true");
    const user = userEvent.setup();
    mockAccount({ existing: true });
    render(<App initialEntries={["/dashboard?welcome=1"]} />);
    const welcome = await screen.findByRole("dialog", { name: "Welcome to DebugBundle" });
    await user.click(within(welcome).getByRole("button", { name: "View setup steps" }));
    expect(await screen.findByText("Essential setup complete")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each(["real-api", "production"])(
    "ignores the welcome replay link in %s mode",
    async (mode) => {
      vi.stubEnv("VITE_DEBUGBUNDLE_DEV_MOCK", mode === "real-api" ? "false" : "true");
      if (mode === "production") vi.stubEnv("DEV", false);
      mockAccount({ existing: true });
      render(<App initialEntries={["/dashboard?welcome=1&setup=empty"]} />);
      await screen.findByRole("button", { name: /owen@example.com/i });
      await waitFor(() => expect(screen.queryByText("Checking setup…")).toBeNull());
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByRole("button", { name: /Setup guide.*0 of 3/ })).toBeNull();
    }
  );

  it("welcomes an empty account, copies a credential-free prompt and keeps real progress unchanged", async () => {
    const user = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const { fetch } = mockAccount();
    render(<App initialEntries={["/dashboard"]} />);
    const dialog = await screen.findByRole("dialog", { name: "Welcome to DebugBundle" });
    const copyButton = within(dialog).getByRole("button", { name: "Copy setup prompt" });
    expect(copyButton.querySelector("svg")?.parentElement).toBe(copyButton);
    expect(within(dialog).queryByRole("button", { name: /(?:View|Hide) setup prompt/ })).toBeNull();
    expect(within(dialog).queryByRole("textbox", { name: "Setup prompt" })).toBeNull();
    await user.click(copyButton);
    expect(copy).toHaveBeenCalledOnce();
    expect(copy.mock.calls[0]?.[0]).toContain("https://debugbundle.com/docs/quickstart");
    expect(copy.mock.calls[0]?.[0]).not.toMatch(/dbundle_mem_|csrf|browser-session/);
    await user.click(within(dialog).getByRole("button", { name: "I’ll do this later" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: /Setup guide.*0 of 3/i })).toBeVisible();
    expect(fetch.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("remembers dismissal, can hide the reminder, and reopens from the account menu", async () => {
    const user = userEvent.setup();
    const { session } = mockAccount();
    const first = render(<App initialEntries={["/dashboard"]} />);
    await screen.findByRole("dialog", { name: "Welcome to DebugBundle" });
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Dismiss setup reminder" }));
    expect(screen.queryByRole("button", { name: /Setup guide.*of 3/i })).toBeNull();
    first.unmount();
    render(<App initialEntries={["/dashboard"]} />);
    await screen.findByText("No projects yet");
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: new RegExp(session.email) }));
    await user.click(await screen.findByRole("menuitem", { name: "Setup guide" }));
    const dialog = await screen.findByRole("dialog", { name: "Your setup guide" });
    expect(within(dialog).getByText("Create an Access token")).toBeVisible();
  });

  it.each(["close-button", "escape", "later"] as const)(
    "keeps welcome content throughout the exit animation when dismissed using %s",
    async (dismissal) => {
      // Radix reads live animation names in browsers. JSDOM has no animation engine,
      // so keep the computed animation name live until animationend is dispatched.
      const readStyle = window.getComputedStyle.bind(window);
      vi.stubGlobal("getComputedStyle", (node: Element) => {
        const styles = readStyle(node);
        if (node.getAttribute("data-slot") === "dialog-content") {
          Object.defineProperty(styles, "animationName", {
            configurable: true,
            get: () => (node.getAttribute("data-state") === "closed" ? "setup-exit" : "setup-enter")
          });
        }
        return styles;
      });
      const user = userEvent.setup();
      mockAccount();
      render(<App initialEntries={["/dashboard"]} />);
      const welcome = await screen.findByRole("dialog", { name: "Welcome to DebugBundle" });
      if (dismissal === "escape") await user.keyboard("{Escape}");
      else
        await user.click(
          within(welcome).getByRole("button", {
            name: dismissal === "later" ? "I’ll do this later" : "Close"
          })
        );
      expect(welcome).toBeInTheDocument();
      expect(welcome).toHaveAttribute("data-state", "closed");
      expect(within(welcome).getByText("Welcome to DebugBundle")).toBeInTheDocument();
      expect(within(welcome).queryByText("Your setup guide")).toBeNull();
      expect(within(welcome).queryByRole("button", { name: "Refresh" })).toBeNull();
      const animationEnd = new Event("animationend", { bubbles: true });
      Object.defineProperty(animationEnd, "animationName", { value: "setup-exit" });
      fireEvent(welcome, animationEnd);
      await waitFor(() => expect(welcome).not.toBeInTheDocument());
      expect(screen.getByRole("button", { name: /Setup guide.*0 of 3/i })).toHaveFocus();
      await user.click(screen.getByRole("button", { name: /Setup guide.*0 of 3/i }));
      const guide = await screen.findByRole("dialog", { name: "Your setup guide" });
      expect(guide).toBeVisible();
      await user.keyboard("{Escape}");
      expect(guide).toHaveAttribute("data-state", "closed");
      expect(within(guide).getByText("Your setup guide")).toBeInTheDocument();
      expect(within(guide).queryByText("Welcome to DebugBundle")).toBeNull();
      fireEvent(guide, animationEnd);
      await waitFor(() => expect(guide).not.toBeInTheDocument());
    }
  );

  it("refreshes observations through the shared Refresh control without mutating setup", async () => {
    const user = userEvent.setup();
    const { fetch } = mockAccount();
    render(<App initialEntries={["/dashboard"]} />);
    const welcome = await screen.findByRole("dialog", { name: "Welcome to DebugBundle" });
    await user.click(within(welcome).getByRole("button", { name: "View setup steps" }));
    const guide = await screen.findByRole("dialog", { name: "Your setup guide" });
    const refresh = within(guide).getByRole("button", { name: "Refresh" });
    await waitFor(() => expect(refresh).toBeEnabled());
    const projectReads = () =>
      fetch.mock.calls.filter(([input]) => requestUrl(input).endsWith("/v1/projects")).length;
    const before = projectReads();
    await user.click(refresh);
    await waitFor(() => expect(projectReads()).toBe(before + 1));
    expect(refresh).toHaveAttribute("aria-busy", "true");
    expect(refresh).toBeDisabled();
    expect(fetch.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("does not interrupt established accounts or mistake failed reads for new accounts", async () => {
    mockAccount({ existing: true });
    const first = render(<App initialEntries={["/dashboard"]} />);
    await screen.findByRole("button", { name: /owen@example.com/i });
    await waitFor(() => expect(screen.queryByText("Checking setup…")).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
    first.unmount();
    mockAccount({ failed: true, userId: "33333333-3333-4333-8333-333333333333" });
    render(<App initialEntries={["/dashboard"]} />);
    await screen.findByRole("button", { name: /Setup guide/i });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens Access tokens without leaving the welcome overlay behind", async () => {
    const user = userEvent.setup();
    mockAccount();
    render(<App initialEntries={["/dashboard"]} />);
    const dialog = await screen.findByRole("dialog", { name: "Welcome to DebugBundle" });
    await user.click(within(dialog).getByRole("link", { name: "Create access token" }));
    expect(await screen.findByRole("heading", { name: "Access tokens" })).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers a selectable prompt when clipboard access is denied", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    mockAccount();
    render(<App initialEntries={["/dashboard"]} />);
    const dialog = await screen.findByRole("dialog", { name: "Welcome to DebugBundle" });
    await user.click(within(dialog).getByRole("button", { name: "Copy setup prompt" }));
    expect(await within(dialog).findByText("Copy the prompt manually")).toBeVisible();
    expect(within(dialog).getByRole("textbox", { name: "Setup prompt" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: /Setup guide.*0 of 3/i })).toHaveFocus();
  });

  it("keeps dismissals isolated between users", async () => {
    const user = userEvent.setup();
    mockAccount();
    const first = render(<App initialEntries={["/dashboard"]} />);
    await screen.findByRole("dialog", { name: "Welcome to DebugBundle" });
    await user.keyboard("{Escape}");
    first.unmount();
    mockAccount({ userId: "33333333-3333-4333-8333-333333333333" });
    render(<App initialEntries={["/dashboard"]} />);
    expect(await screen.findByRole("dialog", { name: "Welcome to DebugBundle" })).toBeVisible();
  });

  it("keeps a directly opened token screen usable without an automatic welcome", async () => {
    mockAccount();
    render(<App initialEntries={["/access-tokens"]} />);
    await screen.findByText("No access tokens yet");
    expect(screen.queryByRole("dialog")).toBeNull();
    for (const button of screen.getAllByRole("button", { name: "Create access token" }))
      expect(button).toBeEnabled();
  });

  it("closes mobile navigation before opening the guide and restores focus on dismissal", async () => {
    vi.stubGlobal("innerWidth", 375);
    const user = userEvent.setup();
    mockAccount();
    render(<App initialEntries={["/dashboard"]} />);
    await screen.findByRole("dialog", { name: "Welcome to DebugBundle" });
    await user.keyboard("{Escape}");
    const toggle = screen.getByRole("button", { name: "Toggle Sidebar" });
    expect(toggle).toHaveFocus();
    await user.click(toggle);
    await user.click(await screen.findByRole("button", { name: /Setup guide.*0 of 3/i }));
    expect(await screen.findByRole("dialog", { name: "Your setup guide" })).toBeVisible();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(toggle).toHaveFocus());
  });
});
