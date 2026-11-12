// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "../../../node_modules/.pnpm/node_modules/react-router-dom/dist/index.js";
import type { DashboardSetupFacts } from "../../../packages/shared-types/src/dashboard-setup.js";
import {
  DashboardSetupProvider,
  useDashboardSetup
} from "../../../apps/web/src/components/system/dashboard-setup-context.js";
import {
  dashboardSetupStorageKey,
  readDashboardSetupPreferences
} from "../../../apps/web/src/lib/dashboard-setup-preferences.js";
import { createSession } from "./web-test-helpers.js";

const load = vi.hoisted(() => vi.fn<() => Promise<DashboardSetupFacts>>());
vi.mock("../../../apps/web/src/lib/dashboard-setup-data.js", async (original) => ({
  ...(await original<typeof import("../../../apps/web/src/lib/dashboard-setup-data.js")>()),
  loadDashboardSetupFacts: load
}));
const empty: DashboardSetupFacts = {
  accessToken: false,
  project: false,
  incident: false,
  analytics: null,
  analyticsProjectId: null,
  offerAnalytics: false,
  improvements: null,
  reports: null,
  offerImprovements: false,
  offerReports: false
};
const complete: DashboardSetupFacts = {
  ...empty,
  accessToken: true,
  project: true,
  incident: true
};
beforeEach(() => {
  window.localStorage.clear();
  load.mockReset();
});
afterEach(() => vi.restoreAllMocks());

function Probe(): JSX.Element {
  const setup = useDashboardSetup()!;
  return (
    <>
      <output data-testid="setup-progress">
        {setup.loading ? "loading" : setup.progress.completed}
      </output>
      <button onClick={setup.openGuide}>Reopen guide</button>
    </>
  );
}
function Harness({
  userId = "user-one",
  orgId = "org-one",
  plan = "free"
}: {
  userId?: string;
  orgId?: string;
  plan?: "free" | "team";
}): JSX.Element {
  return (
    <MemoryRouter initialEntries={["/settings"]}>
      <DashboardSetupProvider
        session={createSession({
          user_id: userId,
          organization_id: orgId,
          organization_plan: plan
        })}
      >
        <Probe />
      </DashboardSetupProvider>
    </MemoryRouter>
  );
}

describe("dashboard setup state boundaries", () => {
  it("discards late reads from the previous workspace", async () => {
    let finishOld!: (facts: DashboardSetupFacts) => void;
    load
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          })
      )
      .mockResolvedValue(empty);
    const view = render(<Harness />);
    await waitFor(() => expect(load).toHaveBeenCalledOnce());
    view.rerender(<Harness orgId="org-two" />);
    await waitFor(() => expect(screen.getByTestId("setup-progress")).toHaveTextContent("0"));
    await act(async () => finishOld(complete));
    expect(screen.getByTestId("setup-progress")).toHaveTextContent("0");
    expect(
      readDashboardSetupPreferences(dashboardSetupStorageKey("user-one", "org-two"))
        .incidentReceived
    ).toBe(false);
  });

  it("retains receipt after an incident is no longer retained", async () => {
    load.mockResolvedValue(complete);
    const view = render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("setup-progress")).toHaveTextContent("3"));
    view.unmount();
    load.mockResolvedValue({ ...complete, incident: false });
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("setup-progress")).toHaveTextContent("3"));
  });

  it("continues to work when browser storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    load.mockResolvedValue(empty);
    const user = userEvent.setup();
    render(<Harness userId="blocked-storage-user" />);
    await user.click(screen.getByRole("button", { name: "Reopen guide" }));
    expect(await screen.findByRole("dialog", { name: "Your setup guide" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      readDashboardSetupPreferences(dashboardSetupStorageKey("blocked-storage-user", "org-one"))
        .welcomeSeen
    ).toBe(true);
  });

  it("never applies an older response over a newer refresh", async () => {
    let finishFirst!: (facts: DashboardSetupFacts) => void;
    load
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = resolve;
          })
      )
      .mockResolvedValue(empty);
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Reopen guide" }));
    await waitFor(() => expect(screen.getByTestId("setup-progress")).toHaveTextContent("0"));
    await act(async () => finishFirst(complete));
    expect(screen.getByTestId("setup-progress")).toHaveTextContent("0");
  });
});
