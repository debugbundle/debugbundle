// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import {
  createBillingSummary,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function preview(activeTrial: boolean, now = "2026-10-22T15:00:00Z") {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = requestUrl(input);
    if (url.endsWith("/v1/auth/session")) return jsonResponse(200, { session: createSession() });
    if (url.endsWith("/v1/billing"))
      return jsonResponse(200, {
        billing: createBillingSummary({
          plan: activeTrial ? "solo" : "free",
          billing_state: activeTrial ? "trialing" : null,
          stripe_customer_id: null,
          trial: {
            available: !activeTrial,
            active: activeTrial,
            plan: activeTrial ? "solo" : null,
            started_at: activeTrial ? "2026-10-22T15:00:00Z" : null,
            ends_at: activeTrial ? "2026-11-21T15:00:00Z" : null,
            used_at: activeTrial ? "2026-10-22T15:00:00Z" : null,
            converted_at: null,
            expired_at: null,
            days_remaining: activeTrial ? 30 : null
          }
        })
      });
    return jsonResponse(404, { error: "not_found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<App initialEntries={["/billing"]} />);
  return fetchMock;
}

it("offers a first-time Free account its trial without showing a paid-unlock notice or issuing Checkout", async () => {
  const fetchMock = preview(false);
  expect(
    await screen.findByText(/start a paid-plan trial before you subscribe/i)
  ).toBeInTheDocument();
  expect(screen.queryByText("Paid subscriptions")).toBeNull();
  expect(screen.queryByText(/paid subscriptions unlock/i)).toBeNull();
  expect(screen.queryByRole("link", { name: "Contact us" })).toBeNull();
  expect(screen.getByRole("button", { name: "Start Solo trial" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Upgrade to Solo" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Upgrade to Team" })).toBeDisabled();
  expect(
    fetchMock.mock.calls.some(([url]) => requestUrl(url).endsWith("/v1/billing/checkout"))
  ).toBe(false);
});

it("shows the exact unlock date, locks both trial purchase choices and refreshes eligibility on focus", async () => {
  preview(true);
  expect(await screen.findByText(/paid subscriptions unlock on/i)).toHaveTextContent("2026");
  expect(screen.getByRole("link", { name: "Contact us" })).toHaveAttribute(
    "href",
    "https://debugbundle.com/contact/"
  );
  expect(screen.getByRole("button", { name: "Convert to Solo paid" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Upgrade to Team" })).toBeDisabled();
  vi.setSystemTime(new Date("2026-10-29T15:00:00Z"));
  fireEvent.focus(window);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Convert to Solo paid" })).toBeEnabled()
  );
  expect(screen.queryByText("Paid subscriptions")).toBeNull();
  expect(screen.queryByText(/paid subscriptions unlock/i)).toBeNull();
  expect(screen.queryByRole("link", { name: "Contact us" })).toBeNull();
});

it("omits the paid-unlock notice when loading a trial whose payment wait has already elapsed", async () => {
  preview(true, "2026-10-29T15:00:00Z");
  expect(await screen.findByRole("button", { name: "Convert to Solo paid" })).toBeEnabled();
  expect(screen.queryByText("Paid subscriptions")).toBeNull();
  expect(screen.queryByText(/paid subscriptions unlock/i)).toBeNull();
  expect(screen.queryByRole("link", { name: "Contact us" })).toBeNull();
});

it("automatically refreshes and unlocks while the billing page stays open", async () => {
  preview(true, "2026-10-29T14:59:59.999Z");
  expect(await screen.findByRole("button", { name: "Convert to Solo paid" })).toBeDisabled();
  vi.setSystemTime(new Date("2026-10-29T15:00:00Z"));
  await waitFor(
    () => expect(screen.getByRole("button", { name: "Convert to Solo paid" })).toBeEnabled(),
    { timeout: 2500 }
  );
  expect(screen.queryByText("Paid subscriptions")).toBeNull();
  expect(screen.queryByText(/paid subscriptions unlock/i)).toBeNull();
  expect(screen.queryByRole("link", { name: "Contact us" })).toBeNull();
});
