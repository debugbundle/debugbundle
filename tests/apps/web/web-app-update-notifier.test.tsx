// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppUpdateNotifier } from "../../../apps/web/src/components/system/app-update-notifier.js";
import * as updates from "../../../apps/web/src/lib/app-update.js";
import * as notify from "../../../apps/web/src/lib/notify.js";
import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";

afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("app update notifications", () => {
  it("keeps one non-dismissible reload notice through time, focus and route rerenders", async () => {
    vi.useFakeTimers();
    vi.spyOn(updates, "getCurrentAppBuildId").mockReturnValue("build-a");
    const check = vi.spyOn(updates, "fetchLatestAppBuildId").mockResolvedValue("build-b");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ session: null })))
    );
    const view = () => <App initialEntries={["/login"]} />;
    const rendered = render(view());
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(
      screen.getByText("A DebugBundle update is available.").closest("[data-sonner-toast]")
    ).toHaveAttribute("data-dismissible", "false");
    rendered.rerender(view());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600_000);
    });
    fireEvent(window, new Event("focus"));
    fireEvent(document, new Event("visibilitychange"));
    expect(screen.getAllByText("A DebugBundle update is available.")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(check).toHaveBeenCalledOnce();
  });

  it("does not notify from an update check that finishes after unmount", async () => {
    vi.spyOn(updates, "getCurrentAppBuildId").mockReturnValue("build-a");
    const info = vi.spyOn(notify, "showInfoToast").mockImplementation(() => undefined);
    let finish!: (build: string) => void;
    vi.spyOn(updates, "fetchLatestAppBuildId").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const rendered = render(<AppUpdateNotifier />);
    fireEvent(window, new Event("focus"));
    rendered.unmount();
    await act(async () => {
      finish("build-b");
    });
    expect(info).not.toHaveBeenCalled();
  });
});
