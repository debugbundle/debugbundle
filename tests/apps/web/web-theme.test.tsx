// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { THEME_STORAGE_KEY } from "../../../apps/web/src/lib/theme.tsx";
import { jsonResponse, requestUrl } from "./web-test-helpers.js";

function stubMatchMedia(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    }))
  });
}

afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  window.localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("web app - theme bootstrap", () => {
  it("applies the system dark theme before React mounts when no theme preference is stored", async () => {
    stubMatchMedia(true);
    vi.resetModules();

    await import("../../../apps/web/src/lib/theme-init.ts");

    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("uses the system dark preference on the login route when no theme override is stored", async () => {
    stubMatchMedia(true);
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        if (requestUrl(input).endsWith("/v1/auth/session")) {
          return jsonResponse(401, { error: "invalid_session" });
        }

        return jsonResponse(200, { success: true });
      })
    );

    render(<App initialEntries={["/login"]} />);

    expect(await screen.findByRole("heading", { name: /continue to debugbundle/i })).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("keeps an explicit stored light preference on auth routes even when the system prefers dark", async () => {
    stubMatchMedia(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        if (requestUrl(input).endsWith("/v1/auth/session")) {
          return jsonResponse(401, { error: "invalid_session" });
        }

        return jsonResponse(200, { success: true });
      })
    );

    render(<App initialEntries={["/signup"]} />);

    expect(await screen.findByRole("heading", { name: /create your debugbundle account/i })).toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});
