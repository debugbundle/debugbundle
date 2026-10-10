// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.js";
import {
  applyResolvedTheme,
  getStoredTheme,
  initializeThemeDocument,
  resolveTheme,
  ThemeProvider,
  THEME_STORAGE_KEY,
  useTheme
} from "../../../apps/web/src/lib/theme.js";
import { statusPageFixture, statusPublicId } from "../../helpers/public-status.ts";
import { jsonResponse, requestUrl } from "./web-test-helpers.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";

function deviceTheme(initialDark: boolean) {
  let matches = initialDark;
  const listeners = new Set<() => void>();
  const removeEventListener = vi.fn((_type: string, listener: () => void) =>
    listeners.delete(listener)
  );
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((media: string) => ({
      get matches() {
        return matches;
      },
      media,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener,
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    }))
  });
  return {
    change(dark: boolean) {
      matches = dark;
      listeners.forEach((listener) => listener());
    },
    removeEventListener
  };
}

afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([true, false])(
  "follows the device on public pages despite a conflicting dashboard preference (dark: %s)",
  async (dark) => {
    deviceTheme(dark);
    window.localStorage.setItem(THEME_STORAGE_KEY, dark ? "light" : "dark");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse(200, statusPageFixture()))
    );
    render(<App initialEntries={[`/status/${statusPublicId}`]} />);
    await screen.findByRole("heading", { name: "Product status" });
    expect(document.documentElement.classList.contains("dark")).toBe(dark);
    expect(document.documentElement.style.colorScheme).toBe(dark ? "dark" : "light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(dark ? "light" : "dark");
    const footer = screen.getByRole("link", { name: "Powered by DebugBundle" });
    expect(footer).toHaveTextContent(/^Powered by DebugBundle$/);
    expect(footer).toHaveClass("underline", "underline-offset-4");
    const logoLink = screen.getByRole("link", { name: /^DebugBundle$/ });
    expect(logoLink.nextElementSibling).toBe(footer);
    expect(footer).not.toContainElement(logoLink);
    const logo = logoLink.querySelector("img");
    expect(logo).toHaveAttribute("src", "/favicon.svg");
    expect(logo).toHaveAttribute("aria-hidden", "true");
    expect(logo).toHaveClass("size-6");
    expect(footer).toHaveAttribute("href", "https://debugbundle.com");
    expect(logoLink).toHaveAttribute("href", "https://debugbundle.com");
  }
);

it("updates public pages when the device changes and removes the listener on unmount", async () => {
  const device = deviceTheme(true);
  window.localStorage.setItem(THEME_STORAGE_KEY, "light");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => jsonResponse(200, statusPageFixture()))
  );
  const view = render(<App initialEntries={[`/status/${statusPublicId}`]} />);
  await screen.findByRole("heading", { name: "Product status" });
  expect(document.documentElement).toHaveClass("dark");
  act(() => device.change(false));
  expect(document.documentElement).not.toHaveClass("dark");
  expect(document.documentElement.style.colorScheme).toBe("light");
  act(() => device.change(true));
  expect(document.documentElement).toHaveClass("dark");
  view.unmount();
  expect(device.removeEventListener).toHaveBeenCalledTimes(1);
});

it("restores the stored dashboard theme when navigating from a public page to login", async () => {
  deviceTheme(true);
  window.localStorage.setItem(THEME_STORAGE_KEY, "light");
  window.history.replaceState(null, "", `/status/${statusPublicId}`);
  const fetchMock = vi.fn((input: RequestInfo | URL) =>
    requestUrl(input).includes("/public/status/")
      ? jsonResponse(200, statusPageFixture())
      : jsonResponse(401, { error: "invalid_session" })
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<App />);
  await screen.findByRole("heading", { name: "Product status" });
  expect(document.documentElement).toHaveClass("dark");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  act(() => {
    window.history.pushState(null, "", "/login");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await screen.findByRole("heading", { name: /continue to debugbundle/i });
  expect(document.documentElement).not.toHaveClass("dark");
  expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
});

it.each(["/status/invalid", "/invalid"])(
  "applies device theme before mounting on public location %s",
  async (path) => {
    deviceTheme(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    if (path === "/invalid") vi.stubEnv("VITE_PUBLIC_STATUS_PAGE_BASE_URL", window.location.origin);
    window.history.replaceState(null, "", path);
    vi.resetModules();
    await import("../../../apps/web/src/lib/theme-init.js");
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  }
);

it("prevents a forced theme consumer from changing the dashboard preference", () => {
  deviceTheme(false);
  window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
  function ThemeAction() {
    const { setTheme } = useTheme();
    return <button onClick={() => setTheme("dark")}>Change theme</button>;
  }
  render(
    <ThemeProvider forcedTheme="system">
      <ThemeAction />
    </ThemeProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "Change theme" }));
  expect(document.documentElement).not.toHaveClass("dark");
  expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
});

it("renders public status without accessing blocked dashboard storage", async () => {
  deviceTheme(true);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Storage blocked");
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => jsonResponse(200, statusPageFixture()))
  );
  render(<App initialEntries={[`/status/${statusPublicId}`]} />);
  await screen.findByRole("heading", { name: "Product status" });
  expect(document.documentElement).toHaveClass("dark");
});

it("preserves normal dashboard theme selection and system updates", () => {
  const device = deviceTheme(true);
  window.localStorage.setItem(THEME_STORAGE_KEY, "light");
  function ThemeActions() {
    const { setTheme } = useTheme();
    return (
      <>
        {(["light", "dark", "system"] as const).map((theme) => (
          <button key={theme} onClick={() => setTheme(theme)}>
            {theme}
          </button>
        ))}
      </>
    );
  }
  render(
    <ThemeProvider>
      <ThemeActions />
    </ThemeProvider>
  );
  expect(document.documentElement).not.toHaveClass("dark");
  fireEvent.click(screen.getByRole("button", { name: "dark" }));
  expect(document.documentElement).toHaveClass("dark");
  expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  fireEvent.click(screen.getByRole("button", { name: "system" }));
  expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
  act(() => device.change(false));
  expect(document.documentElement).not.toHaveClass("dark");
  fireEvent.click(screen.getByRole("button", { name: "light" }));
  act(() => device.change(true));
  expect(document.documentElement).not.toHaveClass("dark");
  expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
});

it("uses the light fallback on a public page when matchMedia is unavailable", async () => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: undefined
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => jsonResponse(200, statusPageFixture()))
  );
  render(<App initialEntries={[`/status/${statusPublicId}`]} />);
  await screen.findByRole("heading", { name: "Product status" });
  expect(document.documentElement).not.toHaveClass("dark");
  expect(document.documentElement.style.colorScheme).toBe("light");
});

it("keeps device updates and listener cleanup compatible with legacy media-query listeners", async () => {
  let matches = true;
  let change: (() => void) | undefined;
  const removeListener = vi.fn();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((media: string) => ({
      get matches() {
        return matches;
      },
      media,
      onchange: null,
      addListener: (listener: () => void) => {
        change = listener;
      },
      removeListener
    }))
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => jsonResponse(200, statusPageFixture()))
  );
  const view = render(<App initialEntries={[`/status/${statusPublicId}`]} />);
  await screen.findByRole("heading", { name: "Product status" });
  expect(document.documentElement).toHaveClass("dark");
  expect(change).toBeTypeOf("function");
  act(() => {
    matches = false;
    change?.();
  });
  expect(document.documentElement).not.toHaveClass("dark");
  view.unmount();
  expect(removeListener).toHaveBeenCalledWith(change);
});

it("keeps neutral initialization safe when browser globals are unavailable", () => {
  vi.stubGlobal("window", undefined);
  vi.stubGlobal("document", undefined);
  try {
    expect(getStoredTheme()).toBe("system");
    expect(resolveTheme("system")).toBe("light");
    expect(initializeThemeDocument()).toEqual({ theme: "system", resolvedTheme: "light" });
    expect(() => applyResolvedTheme("dark")).not.toThrow();
  } finally {
    vi.unstubAllGlobals();
  }
});
