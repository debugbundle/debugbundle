// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { offerClaim, offerDefinition, offerPolicy } from "../../helpers/offer-fixtures.js";
import { createOfferQuoteCodec } from "../../../packages/referrals/src/offer-quote.js";
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

it("refreshes a removed claim after rejection and requires a new regular-price confirmation", async () => {
  const user = userEvent.setup(),
    assign = vi.fn(),
    ordinaryCheckout = vi.fn();
  let removed = false,
    customerReads = 0;
  const quote = createOfferQuoteCodec("quote-secret-longer-than-thirty-two-characters").issue({
    organization_id: offerClaim.claim_id,
    actor_user_id: offerClaim.claim_id,
    claim_id: offerClaim.claim_id,
    version_id: offerDefinition.version_id,
    selection: { target_plan: "solo", interval: "month" },
    policy: offerPolicy
  });
  Object.defineProperty(window, "location", { configurable: true, value: { assign } });
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session")) return jsonResponse(200, { session: createSession() });
      if (url.endsWith("/v1/billing"))
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "free",
            trial: {
              available: false,
              active: false,
              plan: "solo",
              started_at: "2026-10-01T00:00:00.000Z",
              ends_at: "2026-10-31T00:00:00.000Z",
              used_at: "2026-10-01T00:00:00.000Z",
              converted_at: null,
              expired_at: "2026-10-31T00:00:00.000Z",
              days_remaining: 0
            }
          })
        });
      if (url.endsWith("/v2/offers/capabilities")) return jsonResponse(200, { enabled: true });
      if (url.endsWith("/v2/offers/signup-intent/retry"))
        return jsonResponse(200, { intent: null });
      if (url.endsWith("/v2/offers/customer")) {
        customerReads++;
        return jsonResponse(200, {
          claim: { ...offerClaim, status: removed ? "revoked" : "saved" },
          pending: null,
          early_purchase_allowed: false
        });
      }
      if (url.endsWith("/v2/offers/quote"))
        return removed
          ? jsonResponse(409, { error: "offer_ineligible" })
          : jsonResponse(200, { quote });
      if (url.endsWith("/v2/offers/checkout")) {
        removed = true;
        return jsonResponse(409, { error: "offer_confirmation_required" });
      }
      if (url.endsWith("/v1/billing/checkout")) {
        ordinaryCheckout();
        return jsonResponse(200, { url: "https://checkout.stripe.com/regular" });
      }
      return jsonResponse(404, { error: "not_found" });
    })
  );
  render(<App initialEntries={["/billing?plan=solo&interval=month"]} />);
  await user.click(await screen.findByRole("button", { name: "Review introductory price" }));
  await screen.findByText("$4.00");
  await user.click(screen.getByRole("button", { name: "Continue to Stripe" }));
  await waitFor(() => expect(customerReads).toBe(2));
  await user.click(await screen.findByRole("button", { name: "Review price" }));
  const confirm = await screen.findByRole("button", { name: "Continue to Stripe" });
  expect(ordinaryCheckout).not.toHaveBeenCalled();
  expect(assign).not.toHaveBeenCalled();
  await user.click(confirm);
  await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/regular"));
  expect(ordinaryCheckout).toHaveBeenCalledOnce();
});
