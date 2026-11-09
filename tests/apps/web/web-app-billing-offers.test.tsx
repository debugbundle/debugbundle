// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { readPendingBillingCheckout } from "../../../apps/web/src/pages/billing-page-helpers.js";
import {
  createBillingSummary,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});
it("carries a selected annual Business offer through the authenticated Billing page", async () => {
  const user = userEvent.setup(),
    assign = vi.fn(),
    checkout = vi.fn();
  Object.defineProperty(window, "location", { configurable: true, value: { assign } });
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session")) return jsonResponse(200, { session: createSession() });
      if (url.endsWith("/v1/billing"))
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "team",
            stripe_customer_id: null,
            billing_state: "trialing",
            trial: {
              available: false,
              active: true,
              plan: "team",
              started_at: "2026-10-01T00:00:00.000Z",
              ends_at: "2026-12-01T00:00:00.000Z",
              used_at: "2026-10-01T00:00:00.000Z",
              converted_at: null,
              expired_at: null,
              days_remaining: 20
            }
          })
        });
      if (url.endsWith("/v1/billing/checkout")) {
        expect(init?.credentials).toBe("include");
        expect(new Headers(init?.headers).get("x-csrf-token")).toBe("csrf-token-123");
        expect(new Headers(init?.headers).has("authorization")).toBe(false);
        expect(typeof init?.body).toBe("string");
        checkout(JSON.parse(init?.body as string));
        return jsonResponse(200, { url: "https://checkout.stripe.com/business" });
      }
      return jsonResponse(404, { error: "not_found" });
    })
  );
  render(<App initialEntries={["/billing?plan=business&interval=year"]} />);
  expect(await screen.findByRole("dialog", { name: /change subscription/i })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Business" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("radio", { name: "Yearly" })).toHaveAttribute("aria-checked", "true");
  await user.click(screen.getByRole("button", { name: /continue to stripe/i }));
  await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/business"));
  expect(checkout).toHaveBeenCalledExactlyOnceWith({ target_plan: "business", interval: "year" });
  expect(readPendingBillingCheckout()).toEqual({ previousPlan: "team", targetPlan: "business" });
});
it("shows the real annual term alongside the independent monthly allowance window", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session"))
        return jsonResponse(200, { session: createSession({ organization_plan: "business" }) });
      if (url.endsWith("/v1/billing"))
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "business",
            stripe_customer_id: "cus_test",
            usage_window: {
              starts_at: "2026-11-01T00:00:00.000Z",
              ends_at: "2026-12-01T00:00:00.000Z"
            }
          })
        });
      if (url.endsWith("/v1/billing/offers/change"))
        return jsonResponse(200, {
          pending_change: null,
          subscription: {
            plan: "business",
            interval: "year",
            currency: "usd",
            additional_capacity_units: 0,
            base_amount_minor: 58800,
            capacity_unit_amount_minor: null,
            term_starts_at: "2026-01-31T00:00:00.000Z",
            term_ends_at: "2027-01-31T00:00:00.000Z"
          }
        });
      return jsonResponse(404, { error: "not_found" });
    })
  );
  render(<App initialEntries={["/billing"]} />);
  expect(await screen.findByText(/billed yearly.*\$588\.00\/year/i)).toBeInTheDocument();
  expect(screen.getByText(/paid term:.*2027/i)).toBeInTheDocument();
  expect(screen.getByText("Allowance window")).toBeInTheDocument();
});
