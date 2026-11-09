// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillingSubscriptionControl } from "../../../apps/web/src/components/system/billing-subscription-control.js";
import { createBillingSummary } from "./web-test-helpers.js";

const api = vi.hoisted(() => ({
  getBillingOfferStatus: vi.fn(),
  previewBillingOfferChange: vi.fn(),
  scheduleBillingOfferChange: vi.fn(),
  cancelBillingOfferChange: vi.fn(),
  previewBillingOfferUpgrade: vi.fn(),
  startBillingOfferCheckout: vi.fn()
}));
vi.mock("../../../apps/web/src/lib/billing-offer-api.js", () => api);
const status = {
  subscription: {
    plan: "team",
    interval: "year",
    currency: "usd",
    additional_capacity_units: 2,
    base_amount_minor: 19200,
    capacity_unit_amount_minor: 3000,
    term_starts_at: "2026-01-31T00:00:00.000Z",
    term_ends_at: "2027-01-31T00:00:00.000Z"
  },
  pending_change: null
};
const quote = {
  target_plan: "business",
  interval: "year",
  action: "upgrade",
  currency: "usd",
  amount_due: 40000,
  recurring_total: 64980,
  tax: 0,
  additional_capacity_units: 2,
  effective_at: "2026-11-07T00:00:00.000Z",
  expires_at: "2099-11-07T00:00:00.000Z",
  confirmation_token: "confirmed_offer"
};
function props() {
  return {
    billing: createBillingSummary({ plan: "team", stripe_customer_id: "cus_test" }),
    onNavigate: vi.fn(),
    onRefresh: vi.fn(),
    onBeforeCheckout: vi.fn()
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  api.getBillingOfferStatus.mockResolvedValue(structuredClone(status));
  api.previewBillingOfferUpgrade.mockResolvedValue({ quote: structuredClone(quote) });
  api.startBillingOfferCheckout.mockResolvedValue("https://invoice.stripe.com/payment");
  api.scheduleBillingOfferChange.mockResolvedValue({
    pending_change: {
      target_plan: "business",
      interval: "month",
      additional_capacity_units: 2,
      effective_at: "2027-01-31T00:00:00.000Z",
      schedule_id: "schedule"
    }
  });
});
afterEach(() => vi.restoreAllMocks());

describe("billing plan and interval control", () => {
  it("returns keyboard focus to the plan-change button after closing the dialog", async () => {
    const user = userEvent.setup();
    render(<BillingSubscriptionControl {...props()} />);
    const trigger = screen.getByRole("button", { name: "Change plan or billing interval" });
    await user.click(trigger);
    await screen.findByRole("dialog", { name: "Change subscription" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it("shows a status retry inside the open dialog and preserves the requested plan", async () => {
    const user = userEvent.setup(),
      input = props();
    api.getBillingOfferStatus.mockRejectedValueOnce(new Error("offline"));
    render(
      <BillingSubscriptionControl {...input} requestedPlan={{ plan: "business", sequence: 1 }} />
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/subscription terms/i);
    await user.click(screen.getByRole("button", { name: /retry subscription terms/i }));
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "Yearly" })).toHaveAttribute("aria-checked", "true")
    );
    expect(screen.getByRole("radio", { name: "Business" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: /review change/i })).toBeEnabled();
  });
  it("keeps a failed cancellation visible and retries only the same schedule", async () => {
    const user = userEvent.setup(),
      input = props();
    api.getBillingOfferStatus.mockResolvedValue({
      ...structuredClone(status),
      pending_change: {
        target_plan: "solo",
        interval: "month",
        schedule_id: "same_schedule",
        effective_at: "2027-01-31T00:00:00.000Z",
        additional_capacity_units: 2
      }
    });
    api.cancelBillingOfferChange
      .mockRejectedValueOnce(new Error("response_lost"))
      .mockResolvedValueOnce({ pending_change: null });
    render(<BillingSubscriptionControl {...input} />);
    await user.click(await screen.findByRole("button", { name: /keep current plan/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/same schedule/i);
    await user.click(screen.getByRole("button", { name: /keep current plan/i }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /keep current plan/i })).not.toBeInTheDocument()
    );
    expect(api.cancelBillingOfferChange.mock.calls).toEqual([["same_schedule"], ["same_schedule"]]);
  });
  it("shows actual yearly terms and confirms the exact upgrade without treating its invoice as payment success", async () => {
    const user = userEvent.setup(),
      input = props();
    render(<BillingSubscriptionControl {...input} />);
    expect(await screen.findByText(/billed yearly/i)).toBeInTheDocument();
    expect(screen.getByText(/\$192\.00\/year/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /change plan or billing interval/i }));
    await user.click(screen.getByRole("radio", { name: "Business" }));
    await user.click(screen.getByRole("button", { name: /review change/i }));
    expect(api.previewBillingOfferUpgrade).toHaveBeenCalledExactlyOnceWith({
      target_plan: "business",
      interval: "year"
    });
    expect(await screen.findByText(/recurring yearly total/i)).toBeInTheDocument();
    expect(screen.getByText("$649.80")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /confirm upgrade/i }));
    expect(api.startBillingOfferCheckout).toHaveBeenCalledExactlyOnceWith(
      { target_plan: "business", interval: "year" },
      "confirmed_offer"
    );
    expect(
      await screen.findByRole("link", { name: /continue payment on stripe/i })
    ).toHaveAttribute("href", "https://invoice.stripe.com/payment");
    expect(input.onNavigate).not.toHaveBeenCalled();
    expect(input.onRefresh).not.toHaveBeenCalled();
  });
  it("routes an interval switch through renewal and keeps paid annual access until that date", async () => {
    const user = userEvent.setup(),
      input = props();
    api.previewBillingOfferChange.mockResolvedValue({
      quote: {
        ...quote,
        interval: "month",
        action: "renewal",
        amount_due: 0,
        recurring_total: 6498,
        effective_at: "2027-01-31T00:00:00.000Z"
      }
    });
    render(<BillingSubscriptionControl {...input} />);
    await screen.findByText(/billed yearly/i);
    await user.click(screen.getByRole("button", { name: /change plan or billing interval/i }));
    await user.click(screen.getByRole("radio", { name: "Business" }));
    await user.click(screen.getByRole("radio", { name: "Monthly" }));
    await user.click(screen.getByRole("button", { name: /review change/i }));
    expect(api.previewBillingOfferChange).toHaveBeenCalledExactlyOnceWith({
      target_plan: "business",
      interval: "month"
    });
    expect(await screen.findByText(/current plan stays active until/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /schedule change/i }));
    await waitFor(() =>
      expect(api.scheduleBillingOfferChange).toHaveBeenCalledExactlyOnceWith("confirmed_offer")
    );
    expect(input.onRefresh).toHaveBeenCalled();
    expect(api.startBillingOfferCheckout).not.toHaveBeenCalled();
  });
  it("purchases a selected yearly Business plan after the existing trial wait", async () => {
    const user = userEvent.setup(),
      input = props();
    input.billing = createBillingSummary({
      plan: "solo",
      stripe_customer_id: null,
      trial: {
        available: false,
        active: true,
        plan: "solo",
        started_at: "2026-10-01T00:00:00.000Z",
        ends_at: "2026-12-01T00:00:00.000Z",
        used_at: "2026-10-01T00:00:00.000Z",
        converted_at: null,
        expired_at: null,
        days_remaining: 20
      }
    });
    api.startBillingOfferCheckout.mockResolvedValue("https://checkout.stripe.com/business");
    render(<BillingSubscriptionControl {...input} />);
    await user.click(screen.getByRole("button", { name: /choose a paid plan/i }));
    await user.click(screen.getByRole("radio", { name: "Business" }));
    await user.click(screen.getByRole("radio", { name: "Yearly" }));
    expect(screen.getByText(/\$588\.00\/year/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /continue to stripe/i }));
    await waitFor(() =>
      expect(input.onNavigate).toHaveBeenCalledWith("https://checkout.stripe.com/business")
    );
    expect(api.startBillingOfferCheckout).toHaveBeenCalledExactlyOnceWith({
      target_plan: "business",
      interval: "year"
    });
    expect(input.onBeforeCheckout).toHaveBeenCalledWith("business");
  });
  it("keeps the same token after an uncertain confirmation and permits a prepared expired quote to resume", async () => {
    const user = userEvent.setup(),
      input = props();
    api.previewBillingOfferUpgrade.mockResolvedValue({
      quote: { ...quote, expires_at: "2000-01-01T00:00:00.000Z", resume_required: true }
    });
    api.startBillingOfferCheckout.mockRejectedValueOnce(new Error("billing_service_error"));
    render(<BillingSubscriptionControl {...input} />);
    await screen.findByText(/billed yearly/i);
    await user.click(screen.getByRole("button", { name: /change plan or billing interval/i }));
    await user.click(screen.getByRole("radio", { name: "Business" }));
    await user.click(screen.getByRole("button", { name: /review change/i }));
    await screen.findByText(/previous.*request/i);
    await user.click(screen.getByRole("button", { name: /confirm upgrade/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/same.*request/i);
    await user.click(screen.getByRole("button", { name: /confirm upgrade/i }));
    await screen.findByRole("link", { name: /continue payment on stripe/i });
    expect(api.startBillingOfferCheckout.mock.calls[1]).toEqual(
      api.startBillingOfferCheckout.mock.calls[0]
    );
    expect(api.previewBillingOfferUpgrade).toHaveBeenCalledTimes(1);
  });
  it("does not navigate after the account context unmounts during checkout", async () => {
    const user = userEvent.setup(),
      input = props();
    let resolve!: (url: string) => void;
    api.startBillingOfferCheckout.mockReturnValue(
      new Promise<string>((done) => {
        resolve = done;
      })
    );
    const view = render(<BillingSubscriptionControl {...input} />);
    await screen.findByText(/billed yearly/i);
    await user.click(screen.getByRole("button", { name: /change plan or billing interval/i }));
    await user.click(screen.getByRole("radio", { name: "Business" }));
    await user.click(screen.getByRole("button", { name: /review change/i }));
    await screen.findByText(/recurring yearly total/i);
    await user.click(screen.getByRole("button", { name: /confirm upgrade/i }));
    view.unmount();
    resolve("https://app.debugbundle.test/billing?checkout=success");
    await Promise.resolve();
    await Promise.resolve();
    expect(input.onNavigate).not.toHaveBeenCalled();
  });
});
