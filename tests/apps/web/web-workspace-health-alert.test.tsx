// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.js";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";
import { createHealthCheck } from "./helpers/management-ui.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { loadWorkspaceHealthAlert } from "../../../apps/web/src/lib/workspace-health-alert.js";
import {
  WorkspaceHealthAlertProvider,
  useWorkspaceHealthAlert
} from "../../../apps/web/src/components/system/workspace-health-alert-context.js";

const reads = vi.hoisted(() => ({ projects: vi.fn(), checks: vi.fn() }));
vi.mock("../../../apps/web/src/lib/api.js", async (original) => ({
  ...(await original<typeof import("../../../apps/web/src/lib/api.js")>()),
  listProjects: reads.projects,
  listProjectAvailabilityChecks: reads.checks
}));
afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  reads.projects.mockResolvedValue([createProject()]);
  reads.checks.mockResolvedValue({ checks: [createHealthCheck({ status: "failing" })] });
  return createSession({ organization_plan: "team" });
}
function Probe() {
  const alert = useWorkspaceHealthAlert()!;
  return (
    <>
      <output data-testid="down">{String(alert.down)}</output>
      <button onClick={alert.refresh}>Refresh alert</button>
    </>
  );
}
describe("current workspace health alert", () => {
  it.each([
    ["failing", true, null, true],
    ["passing", true, null, false],
    ["paused", true, "owner_paused", false],
    ["unknown", true, null, false],
    ["failing", false, null, false],
    ["failing", true, "plan_limit", false]
  ] as const)(
    "uses the enabled current %s state (enabled %s, pause %s)",
    async (status, enabled, paused_reason, down) => {
      setup();
      reads.checks.mockResolvedValue({
        checks: [createHealthCheck({ status, enabled, paused_reason })]
      });
      expect(await loadWorkspaceHealthAlert()).toBe(down);
      expect(reads.checks).toHaveBeenCalledExactlyOnceWith("proj_123", 100);
    }
  );
  it("does not treat a single failed result below the threshold as down", async () => {
    setup();
    reads.checks.mockResolvedValue({
      checks: [
        createHealthCheck({
          status: "passing",
          last_result_status: "http_status_mismatch",
          consecutive_failures: 1,
          failure_threshold: 3
        })
      ]
    });
    expect(await loadWorkspaceHealthAlert()).toBe(false);
  });
  it("ignores suspended shares, preserves unknown reads and recognises any confirmed outage", async () => {
    setup();
    reads.projects.mockResolvedValue([
      createProject({ relationship: "shared", shared_access_suspended: true })
    ]);
    expect(await loadWorkspaceHealthAlert()).toBe(false);
    expect(reads.checks).not.toHaveBeenCalled();
    reads.projects.mockResolvedValue([createProject()]);
    reads.checks.mockRejectedValue(new Error("offline"));
    expect(await loadWorkspaceHealthAlert()).toBeNull();
    reads.projects.mockResolvedValue([createProject(), createProject({ project_id: "other" })]);
    reads.checks.mockImplementation(async (id: string) => {
      if (id === "proj_123") throw new Error("offline");
      return { checks: [createHealthCheck({ status: "failing" })] };
    });
    expect(await loadWorkspaceHealthAlert()).toBe(true);
  });
  it("stops queuing reads after the requesting context is cancelled", async () => {
    setup();
    expect(await loadWorkspaceHealthAlert(() => false)).toBeNull();
    expect(reads.projects).not.toHaveBeenCalled();
  });
  it("bounds concurrent project reads and stops after a confirmed outage", async () => {
    setup();
    reads.projects.mockResolvedValue(
      Array.from({ length: 9 }, (_, index) => createProject({ project_id: `project_${index}` }))
    );
    let active = 0;
    let peak = 0;
    reads.checks.mockImplementation(async (id: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return {
        checks: [createHealthCheck({ status: id === "project_8" ? "failing" : "passing" })]
      };
    });
    expect(await loadWorkspaceHealthAlert()).toBe(true);
    expect(peak).toBe(4);
    expect(reads.checks).toHaveBeenCalledTimes(9);
    reads.checks
      .mockClear()
      .mockResolvedValue({ checks: [createHealthCheck({ status: "failing" })] });
    expect(await loadWorkspaceHealthAlert()).toBe(true);
    expect(reads.checks).toHaveBeenCalledTimes(4);
  });
  it("does not queue another batch after cancellation during a read", async () => {
    setup();
    reads.projects.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => createProject({ project_id: `project_${index}` }))
    );
    let current = true;
    const finish: (() => void)[] = [];
    reads.checks.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish.push(() => resolve({ checks: [createHealthCheck({ status: "failing" })] }));
        })
    );
    const result = loadWorkspaceHealthAlert(() => current);
    await waitFor(() => expect(reads.checks).toHaveBeenCalledTimes(4));
    current = false;
    finish.forEach((resolve) => resolve());
    expect(await result).toBeNull();
    expect(reads.checks).toHaveBeenCalledTimes(4);
  });
  it("polls only while visible and refreshes after recovery or focus", async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const session = setup();
    render(
      <WorkspaceHealthAlertProvider session={session}>
        <Probe />
      </WorkspaceHealthAlertProvider>
    );
    await act(async () => {});
    expect(screen.getByTestId("down")).toHaveTextContent("true");
    reads.checks.mockResolvedValue({ checks: [createHealthCheck({ status: "passing" })] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByTestId("down")).toHaveTextContent("false");
    const calls = reads.projects.mock.calls.length;
    visibility.mockReturnValue("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(reads.projects).toHaveBeenCalledTimes(calls);
    visibility.mockReturnValue("visible");
    reads.checks.mockResolvedValue({ checks: [createHealthCheck({ status: "failing" })] });
    fireEvent.focus(window);
    await act(async () => {});
    expect(screen.getByTestId("down")).toHaveTextContent("true");
    reads.checks.mockRejectedValue(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh alert" }));
    await act(async () => {});
    expect(screen.getByTestId("down")).toHaveTextContent("null");
  });
  it("discards late results after a workspace switch", async () => {
    const session = setup();
    let finish!: (projects: ReturnType<typeof createProject>[]) => void;
    reads.projects.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const view = render(
      <WorkspaceHealthAlertProvider session={session}>
        <Probe />
      </WorkspaceHealthAlertProvider>
    );
    await waitFor(() => expect(reads.projects).toHaveBeenCalledOnce());
    reads.checks.mockResolvedValue({ checks: [createHealthCheck({ status: "passing" })] });
    view.rerender(
      <WorkspaceHealthAlertProvider session={{ ...session, organization_id: "new-workspace" }}>
        <Probe />
      </WorkspaceHealthAlertProvider>
    );
    await waitFor(() => expect(screen.getByTestId("down")).toHaveTextContent("false"));
    await act(async () => finish([createProject()]));
    expect(screen.getByTestId("down")).toHaveTextContent("false");
  });
  it.each(["/incidents", "/health-status"])(
    "shows an accessible exclamation on %s and clears it after recovery",
    async (route) => {
      const session = setup();
      vi.stubGlobal(
        "fetch",
        vi.fn((input: RequestInfo | URL) => {
          const url = requestUrl(input);
          if (url.endsWith("/auth/session")) return jsonResponse(200, { session });
          if (url.includes("/incidents?"))
            return jsonResponse(200, { incidents: [], next_cursor: null });
          if (url.includes("/member/tokens")) return jsonResponse(200, { tokens: [] });
          if (url.endsWith("/organizations")) return jsonResponse(200, { organizations: [] });
          if (url.includes("/daily-rollups?")) return jsonResponse(200, { rollups: [] });
          return jsonResponse(404, { error: "not_found" });
        })
      );
      render(<App initialEntries={[route]} />);
      const marker = await screen.findByRole("status", {
        name: "A health check is currently down"
      });
      expect(marker).toHaveTextContent("!");
      expect(marker.querySelector('[data-slot="badge"]')).toHaveAttribute(
        "data-variant",
        "destructive"
      );
      const health = screen.getByRole("link", { name: "Health Status" });
      expect(marker.closest('[data-slot="sidebar-menu-item"]')).toBe(
        health.closest('[data-slot="sidebar-menu-item"]')
      );
      expect(health).toHaveAccessibleDescription("A health check is currently down");
      reads.checks.mockResolvedValue({ checks: [createHealthCheck({ status: "passing" })] });
      if (route === "/health-status") {
        const refresh = await screen.findByRole("button", { name: "Refresh" });
        await waitFor(() => expect(refresh).toBeEnabled());
        fireEvent.click(refresh);
      } else {
        fireEvent.focus(window);
      }
      await waitFor(() =>
        expect(
          screen.queryByRole("status", { name: "A health check is currently down" })
        ).toBeNull()
      );
    }
  );
});
