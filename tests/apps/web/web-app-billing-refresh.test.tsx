// @vitest-environment jsdom

import { act, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import {
  createBillingSummary,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

function countBillingRequests(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter(([input, init]) => {
    return (
      requestUrl(input as RequestInfo | URL).endsWith("/v1/billing") && init?.method === undefined
    );
  }).length;
}

afterEach(() => {
  vi.useRealTimers();
  resetBrowserSessionClientState();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("web app — billing summary refresh", () => {
  it("shows the exact reset time and refreshes just after the billing boundary", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-07-31T23:59:58.000Z"));

    let billingRequests = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        billingRequests += 1;
        return jsonResponse(200, {
          billing:
            billingRequests === 1
              ? createBillingSummary({
                  usage_window: {
                    starts_at: "2026-07-01T00:00:00.000Z",
                    ends_at: "2026-08-01T00:00:00.000Z"
                  }
                })
              : createBillingSummary({
                  usage_window: {
                    starts_at: "2026-08-01T00:00:00.000Z",
                    ends_at: "2026-09-01T00:00:00.000Z"
                  },
                  allowances: {
                    ...createBillingSummary().allowances,
                    monthly_bundle_requests: { used: 0, limit: 100 }
                  }
                })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);
    render(<App initialEntries={["/billing"]} />);

    const resetDescription = await screen.findByText(/resets .*utc/i);
    expect(resetDescription.closest('[aria-live="polite"]')).not.toBeNull();
    expect(countBillingRequests(fetchMock)).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    await waitFor(() => {
      expect(countBillingRequests(fetchMock)).toBe(2);
      expect(screen.getByText("0 of 100")).toBeInTheDocument();
    });
  });

  it("refreshes on focus and visibility recovery without overlapping requests", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"));

    let billingRequests = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        billingRequests += 1;
        return jsonResponse(200, {
          billing: createBillingSummary({
            allowances: {
              ...createBillingSummary().allowances,
              monthly_bundle_requests: { used: billingRequests, limit: 100 }
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);
    render(<App initialEntries={["/billing"]} />);

    expect(await screen.findByText("1 of 100")).toBeInTheDocument();

    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => {
      expect(countBillingRequests(fetchMock)).toBe(2);
      expect(screen.getByText("2 of 100")).toBeInTheDocument();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => {
      expect(countBillingRequests(fetchMock)).toBe(3);
      expect(screen.getByText("3 of 100")).toBeInTheDocument();
    });
  });

  it("defers the boundary refresh while hidden and refreshes when visible again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-07-31T23:59:58.000Z"));

    let visibilityState: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibilityState);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary({
            usage_window: {
              starts_at: "2026-07-01T00:00:00.000Z",
              ends_at: "2026-08-01T00:00:00.000Z"
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);
    render(<App initialEntries={["/billing"]} />);

    await screen.findByText(/resets .*utc/i);
    visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(countBillingRequests(fetchMock)).toBe(1);

    visibilityState = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => {
      expect(countBillingRequests(fetchMock)).toBe(2);
    });
  });

  it("keeps the last billing summary when a background refresh fails and stops after unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"));

    let billingRequests = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        billingRequests += 1;
        return billingRequests === 1
          ? jsonResponse(200, {
              billing: createBillingSummary({
                allowances: {
                  ...createBillingSummary().allowances,
                  monthly_bundle_requests: { used: 12, limit: 100 }
                }
              })
            })
          : jsonResponse(503, { error: "billing_service_error" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);
    const view = render(<App initialEntries={["/billing"]} />);

    expect(await screen.findByText("12 of 100")).toBeInTheDocument();
    window.dispatchEvent(new Event("focus"));

    await waitFor(() => {
      expect(countBillingRequests(fetchMock)).toBe(2);
    });
    expect(screen.getByText("12 of 100")).toBeInTheDocument();

    view.unmount();
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(86_400_000);

    expect(countBillingRequests(fetchMock)).toBe(2);
  });

  it("does not let a stale background refresh overwrite a newer billing mutation", async () => {
    const user = userEvent.setup();
    const freeBilling = createBillingSummary({
      plan: "free",
      billing_state: null
    });
    const trialBilling = createBillingSummary({
      plan: "solo",
      billing_state: "trialing",
      trial: {
        available: false,
        active: true,
        plan: "solo",
        started_at: "2026-08-11T00:00:00.000Z",
        ends_at: "2026-09-10T00:00:00.000Z",
        used_at: "2026-08-11T00:00:00.000Z",
        converted_at: null,
        expired_at: null,
        days_remaining: 30
      }
    });
    let billingRequests = 0;
    let resolveBackgroundRefresh: ((response: Response) => void) | undefined;
    const backgroundRefresh = new Promise<Response>((resolve) => {
      resolveBackgroundRefresh = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        billingRequests += 1;
        return billingRequests === 1
          ? jsonResponse(200, { billing: freeBilling })
          : backgroundRefresh;
      }

      if (url.endsWith("/v1/billing/trial/start") && init?.method === "POST") {
        return jsonResponse(200, { billing: trialBilling });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);
    render(<App initialEntries={["/billing?trial=solo"]} />);

    const startTrial = await screen.findByRole("button", { name: /start solo trial/i });
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => {
      expect(countBillingRequests(fetchMock)).toBe(2);
    });

    await user.click(startTrial);
    expect(await screen.findByText(/30 days left in your solo trial/i)).toBeInTheDocument();

    await act(async () => {
      resolveBackgroundRefresh?.(jsonResponse(200, { billing: freeBilling }));
      await backgroundRefresh;
    });

    expect(screen.getByText(/30 days left in your solo trial/i)).toBeInTheDocument();
  });
});
