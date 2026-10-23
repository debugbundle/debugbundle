// @vitest-environment jsdom

import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getBillingSummary,
  resetBrowserSessionClientState
} from "../../../apps/web/src/lib/api.ts";
import { SessionProvider, useSession } from "../../../apps/web/src/lib/session.tsx";
import { createSession } from "./web-test-helpers.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function SessionProbe(): JSX.Element {
  const { isLoading, session, sessionInvalidationCount, refreshSession } = useSession();

  return (
    <div>
      <span data-testid="loading">{isLoading ? "loading" : "ready"}</span>
      <span data-testid="email">{session?.email ?? "none"}</span>
      <span data-testid="invalidations">{String(sessionInvalidationCount)}</span>
      <button type="button" onClick={() => void refreshSession()}>
        Refresh
      </button>
    </div>
  );
}

function OutsideProviderProbe(): JSX.Element {
  useSession();
  return <div />;
}

describe("web session provider", () => {
  it("deduplicates retries and keeps the failed session read distinct from signed out", async () => {
    let finish!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          })
      );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(useSession, {
      wrapper: ({ children }) => <SessionProvider>{children}</SessionProvider>
    });
    await waitFor(() => expect(result.current.sessionLoadError).toBe(true));
    let retry!: Promise<void>;
    act(() => {
      retry = result.current.retrySession();
      void result.current.retrySession();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.sessionLoadError).toBe(true);
    await act(async () => {
      finish(new Response(JSON.stringify({ session: null }), { status: 200 }));
      await retry;
    });
    expect(result.current.sessionLoadError).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("preserves the established session and rejection contract when an explicit refresh fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ session: createSession() }), { status: 200 })
        )
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    );
    const { result } = renderHook(useSession, {
      wrapper: ({ children }) => <SessionProvider>{children}</SessionProvider>
    });
    await waitFor(() => expect(result.current.session?.email).toBe("owen@example.com"));
    await act(async () => {
      await expect(result.current.refreshSession()).rejects.toThrow("Failed to fetch");
    });
    expect(result.current.session?.email).toBe("owen@example.com");
    expect(result.current.sessionLoadError).toBe(false);
  });

  it("throws when useSession is used outside the provider", () => {
    expect(() => render(<OutsideProviderProbe />)).toThrow(
      "useSession must be used within SessionProvider"
    );
  });

  it("bootstraps only once across rerenders and exposes refreshSession", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session: createSession() }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session: createSession({ email: "owner@example.com" }) }), {
          status: 200
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const rendered = render(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("ready");
    });
    expect(screen.getByTestId("email")).toHaveTextContent("owen@example.com");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rendered.rerender(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: /refresh/i }).click();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByTestId("email")).toHaveTextContent("owner@example.com");
  });

  it("tracks browser-session invalidations triggered by invalid_session responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session: createSession() }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "invalid_session" }), { status: 401 })
      );

    vi.stubGlobal("fetch", fetchMock);

    render(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("email")).toHaveTextContent("owen@example.com");
    });

    await expect(getBillingSummary()).rejects.toThrow("invalid_session");

    await waitFor(() => {
      expect(screen.getByTestId("invalidations")).toHaveTextContent("1");
    });
    expect(screen.getByTestId("email")).toHaveTextContent("none");
    expect(screen.getByTestId("loading")).toHaveTextContent("ready");
  });

  it("prevents default only for invalid-session unhandled rejections", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ session: createSession() }), { status: 200 })
        )
    );

    render(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("ready");
    });

    const invalidSessionEvent = new Event("unhandledrejection", { cancelable: true });
    Object.defineProperty(invalidSessionEvent, "reason", { value: new Error("invalid_session") });
    window.dispatchEvent(invalidSessionEvent);
    expect(invalidSessionEvent.defaultPrevented).toBe(true);

    const otherErrorEvent = new Event("unhandledrejection", { cancelable: true });
    Object.defineProperty(otherErrorEvent, "reason", { value: new Error("different_error") });
    window.dispatchEvent(otherErrorEvent);
    expect(otherErrorEvent.defaultPrevented).toBe(false);
  });
});
