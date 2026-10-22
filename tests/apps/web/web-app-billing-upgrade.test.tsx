// @vitest-environment jsdom
import { billingReflectsCheckout } from "../../../apps/web/src/pages/billing-page-helpers.js";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
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
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});
function setup(
  options: {
    confirmError?: string;
    pendingPayment?: boolean;
    paidImmediately?: boolean;
    expired?: boolean;
    previewError?: boolean;
  } = {}
) {
  const assign = vi.fn();
  Object.defineProperty(window, "location", { configurable: true, value: { assign } });
  const checkout = vi.fn();
  const preview = vi.fn();
  let paid = false;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session")) return jsonResponse(200, { session: createSession() });
      if (url.endsWith("/v1/billing"))
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: paid ? "team" : "solo",
            billing_state: "active",
            stripe_customer_id: "cus_test",
            capacity_units: {
              included: 3,
              additional_purchased: 7,
              total: 10,
              pending_reduction: null
            }
          })
        });
      if (url.endsWith("/v1/billing/upgrade/preview")) {
        preview();
        if (options.previewError) return jsonResponse(503, { error: "billing_service_error" });
        if (options.pendingPayment)
          return jsonResponse(200, { payment_url: "https://invoice.stripe.com/i/synthetic" });
        return jsonResponse(200, {
          quote: {
            confirmation_token: "signed_test_quote",
            expires_at: new Date(Date.now() + (options.expired ? -1000 : 600000)).toISOString(),
            currency: "usd",
            amount_due: 824,
            tax: 61,
            monthly_total: 4252,
            additional_capacity_units: 7
          }
        });
      }
      if (url.endsWith("/v1/billing/checkout")) {
        checkout(JSON.parse(typeof init?.body === "string" ? init.body : "null"));
        return options.confirmError
          ? jsonResponse(409, { error: options.confirmError })
          : jsonResponse(200, {
              url: options.paidImmediately
                ? "http://localhost:5173/billing?checkout=success"
                : "https://invoice.stripe.com/i/synthetic"
            });
      }
      return jsonResponse(404, { error: "not_found" });
    })
  );
  render(<App initialEntries={["/billing"]} />);
  return {
    assign,
    checkout,
    preview,
    markPaid: () => {
      paid = true;
    },
    user: userEvent.setup()
  };
}
it("requires confirmation, shows tax and retained units, and Cancel never charges", async () => {
  const f = setup();
  await f.user.click(await screen.findByRole("button", { name: "Upgrade to Team" }));
  expect(await screen.findByRole("dialog", { name: "Upgrade to Team" })).toBeInTheDocument();
  expect(screen.getByText(/8\.24/)).toBeInTheDocument();
  expect(screen.getByText(/0\.61/)).toBeInTheDocument();
  expect(screen.getByText(/42\.52/)).toBeInTheDocument();
  expect(screen.getByText(/7.*extra.*capacity/i)).toBeInTheDocument();
  expect(f.checkout).not.toHaveBeenCalled();
  await f.user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(f.checkout).not.toHaveBeenCalled();
  expect(f.assign).not.toHaveBeenCalled();
});
it("submits the exact quote once and keeps billing open while payment continues in a separate tab", async () => {
  const f = setup();
  await f.user.click(await screen.findByRole("button", { name: "Upgrade to Team" }));
  await f.user.click(await screen.findByRole("button", { name: "Confirm upgrade" }));
  await waitFor(() =>
    expect(f.checkout).toHaveBeenCalledExactlyOnceWith({
      target_plan: "team",
      confirmation_token: "signed_test_quote"
    })
  );
  const link = await screen.findByRole("link", { name: /continue payment on stripe/i });
  expect(link).toHaveAttribute("href", "https://invoice.stripe.com/i/synthetic");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  expect(screen.getByText(/^Opens in a new tab\. Return here/)).toBeInTheDocument();
  expect(f.assign).not.toHaveBeenCalled();
  await f.user.click(link);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(f.checkout).toHaveBeenCalledTimes(1);
  f.markPaid();
  window.dispatchEvent(new Event("focus"));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Upgrade to Team" })).not.toBeInTheDocument()
  );
  expect(f.assign).not.toHaveBeenCalled();
});

it("resumes the saved invoice in a separate tab without confirming another upgrade", async () => {
  const f = setup({ pendingPayment: true });
  await f.user.click(await screen.findByRole("button", { name: "Upgrade to Team" }));
  const link = await screen.findByRole("link", { name: /continue payment on stripe/i });
  expect(link).toHaveAttribute("href", "https://invoice.stripe.com/i/synthetic");
  await f.user.click(link);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(f.checkout).not.toHaveBeenCalled();
  expect(f.assign).not.toHaveBeenCalled();
});

it("preserves the existing return flow when Stripe already completed the upgrade", async () => {
  const f = setup({ paidImmediately: true });
  await f.user.click(await screen.findByRole("button", { name: "Upgrade to Team" }));
  await f.user.click(await screen.findByRole("button", { name: "Confirm upgrade" }));
  await waitFor(() =>
    expect(f.assign).toHaveBeenCalledWith("http://localhost:5173/billing?checkout=success")
  );
  expect(
    screen.queryByRole("link", { name: /continue payment on stripe/i })
  ).not.toBeInTheDocument();
});
it("keeps the dialog open and requires a refreshed quote when the confirmed amount changes", async () => {
  const f = setup({ confirmError: "upgrade_confirmation_required" });
  await f.user.click(await screen.findByRole("button", { name: "Upgrade to Team" }));
  await f.user.click(await screen.findByRole("button", { name: "Confirm upgrade" }));
  expect(await screen.findByText(/quote.*changed or expired/i)).toBeInTheDocument();
  expect(f.assign).not.toHaveBeenCalled();
  await f.user.click(screen.getByRole("button", { name: "Refresh quote" }));
  expect(f.preview).toHaveBeenCalledTimes(2);
  expect(f.checkout).toHaveBeenCalledTimes(1);
});

it("does not mistake trial or incomplete base access for a paid checkout", () => {
  const pending = { previousPlan: "free" as const, targetPlan: "solo" as const };
  const incomplete = createBillingSummary({ plan: "solo", billing_state: "incomplete" });
  const trial = createBillingSummary({ plan: "solo", billing_state: "active" });
  trial.trial.active = true;
  expect(billingReflectsCheckout(incomplete, pending, null)).toBe(false);
  expect(billingReflectsCheckout(trial, pending, null)).toBe(false);
});

it("keeps an unavailable preview retryable without sending a payment request", async () => {
  const f = setup({ previewError: true });
  await f.user.click(await screen.findByRole("button", { name: "Upgrade to Team" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not prepare this upgrade");
  await f.user.click(screen.getByRole("button", { name: "Refresh quote" }));
  await waitFor(() => expect(f.preview).toHaveBeenCalledTimes(2));
  expect(f.checkout).not.toHaveBeenCalled();
});

it("does not submit an expired quote", async () => {
  const f = setup({ expired: true });
  await f.user.click(await screen.findByRole("button", { name: "Upgrade to Team" }));
  await f.user.click(await screen.findByRole("button", { name: "Confirm upgrade" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("quote has changed or expired");
  expect(f.checkout).not.toHaveBeenCalled();
});

it("retries an uncertain confirmation with the same confirmed quote", async () => {
  const f = setup({ confirmError: "billing_service_error" });
  await f.user.click(await screen.findByRole("button", { name: "Upgrade to Team" }));
  await f.user.click(await screen.findByRole("button", { name: "Confirm upgrade" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Retry to check the same payment attempt"
  );
  await f.user.click(screen.getByRole("button", { name: "Confirm upgrade" }));
  await waitFor(() => expect(f.checkout).toHaveBeenCalledTimes(2));
  expect(f.checkout.mock.calls[1]).toEqual(f.checkout.mock.calls[0]);
  expect(f.assign).not.toHaveBeenCalled();
});
