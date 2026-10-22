// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CapacityDialog,
  CheckoutReturnDialog,
  billingReflectsCheckout,
  clearPendingBillingCheckout,
  formatActiveProjectCount,
  formatAllowanceUnitCount,
  formatBillingWindowDescription,
  formatDate,
  formatPlanName,
  getBillingWindowRefreshDelay,
  readPendingBillingCheckout,
  writePendingBillingCheckout
} from "../../../apps/web/src/pages/billing-page.tsx";
import * as api from "../../../apps/web/src/lib/api.ts";
import * as notify from "../../../apps/web/src/lib/notify.tsx";
import { createBillingSummary, jsonResponse } from "./web-test-helpers.js";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => jsonResponse(404, { error: "not_found" }))
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("billing helper and dialog behavior", () => {
  it("reads, writes, and clears pending billing checkout state", () => {
    expect(readPendingBillingCheckout()).toBeNull();

    window.sessionStorage.setItem("debugbundle.billing.checkout", "not-json");
    expect(readPendingBillingCheckout()).toBeNull();

    window.sessionStorage.setItem(
      "debugbundle.billing.checkout",
      JSON.stringify({ previousPlan: "starter", targetPlan: "team" })
    );
    expect(readPendingBillingCheckout()).toBeNull();

    writePendingBillingCheckout({ previousPlan: "free", targetPlan: "solo" });
    expect(readPendingBillingCheckout()).toEqual({ previousPlan: "free", targetPlan: "solo" });

    clearPendingBillingCheckout();
    expect(readPendingBillingCheckout()).toBeNull();
  });

  it("returns safely when billing checkout storage is unavailable", () => {
    vi.stubGlobal("window", undefined);

    expect(readPendingBillingCheckout()).toBeNull();
    expect(() =>
      writePendingBillingCheckout({ previousPlan: "solo", targetPlan: "team" })
    ).not.toThrow();
    expect(() => clearPendingBillingCheckout()).not.toThrow();
  });

  it("detects when billing state reflects a checkout and formats billing labels", () => {
    const baseline = createBillingSummary({ plan: "free", stripe_customer_id: null });
    const updated = createBillingSummary({ plan: "solo", stripe_customer_id: "cus_123" });
    const trialBaseline = createBillingSummary({
      plan: "team",
      billing_state: "trialing",
      stripe_customer_id: null,
      trial: {
        available: false,
        active: true,
        plan: "team",
        started_at: "2026-06-04T00:00:00.000Z",
        ends_at: "2026-07-04T00:00:00.000Z",
        used_at: "2026-06-04T00:00:00.000Z",
        converted_at: null,
        expired_at: null,
        days_remaining: 30
      }
    });
    const convertedTrial = createBillingSummary({
      plan: "team",
      billing_state: "active",
      stripe_customer_id: "cus_123",
      trial: {
        available: false,
        active: false,
        plan: "team",
        started_at: "2026-06-04T00:00:00.000Z",
        ends_at: "2026-07-04T00:00:00.000Z",
        used_at: "2026-06-04T00:00:00.000Z",
        converted_at: "2026-06-10T00:00:00.000Z",
        expired_at: null,
        days_remaining: null
      }
    });

    expect(
      billingReflectsCheckout(updated, { previousPlan: "free", targetPlan: "solo" }, baseline)
    ).toBe(true);
    expect(
      billingReflectsCheckout(
        convertedTrial,
        { previousPlan: "team", targetPlan: "team" },
        trialBaseline
      )
    ).toBe(true);
    expect(billingReflectsCheckout(baseline, null, null)).toBe(false);
    expect(billingReflectsCheckout(updated, null, baseline)).toBe(true);
    expect(
      billingReflectsCheckout(
        baseline,
        null,
        createBillingSummary({ plan: "free", stripe_customer_id: null })
      )
    ).toBe(false);

    expect(formatPlanName("free")).toBe("Free");
    expect(formatPlanName("solo")).toBe("Solo");
    expect(formatPlanName("team")).toBe("Team");
    expect(formatActiveProjectCount(1)).toBe("1 active project");
    expect(formatActiveProjectCount(3)).toBe("3 active projects");
    expect(formatAllowanceUnitCount(1)).toBe("1 allowance unit");
    expect(formatAllowanceUnitCount(4)).toBe("4 allowance units");
    expect(formatDate("2026-04-23T11:56:12.000Z")).toMatch(/2026/);
    expect(
      formatBillingWindowDescription(
        {
          starts_at: "2026-07-01T00:00:00.000Z",
          ends_at: "2026-08-01T00:00:00.000Z"
        },
        { locale: "en-GB", timeZone: "Europe/Ljubljana" }
      )
    ).toBe(
      "Current window: 1 Jul 2026 to 1 Aug 2026. Resets 1 Aug 2026 at 02:00 CEST (00:00 UTC)."
    );
    expect(
      formatBillingWindowDescription(
        {
          starts_at: "2026-07-01T00:00:00.000Z",
          ends_at: "2026-08-01T00:00:00.000Z"
        },
        { locale: "en-GB", timeZone: "UTC" }
      )
    ).toBe("Current window: 1 Jul 2026 to 1 Aug 2026. Resets 1 Aug 2026 at 00:00 UTC.");
    expect(
      formatBillingWindowDescription(
        {
          starts_at: "2026-07-01T00:00:00.000Z",
          ends_at: "2026-08-01T00:00:00.000Z"
        },
        { locale: "en-GB", timeZone: "America/Los_Angeles" }
      )
    ).toMatch(
      /^Current window: 30 Jun 2026 to 31 Jul 2026\. Resets 31 Jul 2026 at 17:00 (?:PDT|GMT-7) \(1 Aug 2026 at 00:00 UTC\)\.$/
    );
  });

  it("bounds billing refresh timers and retries safely after a passed boundary", () => {
    const now = Date.parse("2026-07-01T00:00:00.000Z");

    expect(getBillingWindowRefreshDelay("2026-07-01T00:01:00.000Z", now)).toBe(61_000);
    expect(getBillingWindowRefreshDelay("2026-08-01T00:00:00.000Z", now)).toBe(86_400_000);
    expect(getBillingWindowRefreshDelay("2026-06-30T23:59:00.000Z", now)).toBe(30_000);
    expect(getBillingWindowRefreshDelay("not-a-date", now)).toBeNull();
  });

  it("renders checkout return dialog states", () => {
    const { rerender } = render(
      <CheckoutReturnDialog state={{ status: "syncing" }} onOpenChange={() => {}} />
    );

    expect(screen.getByText(/confirming your subscription/i)).toBeInTheDocument();
    expect(screen.getByText(/this usually finishes in a few seconds/i)).toBeInTheDocument();

    rerender(<CheckoutReturnDialog state={{ status: "success" }} onOpenChange={() => {}} />);
    expect(screen.getByText(/free is active/i)).toBeInTheDocument();

    rerender(<CheckoutReturnDialog state={{ status: "delayed" }} onOpenChange={() => {}} />);
    expect(screen.getByText(/still confirming your subscription/i)).toBeInTheDocument();

    rerender(<CheckoutReturnDialog state={{ status: "canceled" }} onOpenChange={() => {}} />);
    expect(screen.getByText(/checkout canceled/i)).toBeInTheDocument();

    rerender(<CheckoutReturnDialog state={{ status: "error" }} onOpenChange={() => {}} />);
    expect(screen.getByText(/could not confirm billing yet/i)).toBeInTheDocument();
  });

  it("surfaces billing capacity dialog error and cancel paths", async () => {
    const user = userEvent.setup();
    const billing = createBillingSummary({
      plan: "solo",
      stripe_customer_id: "cus_123",
      active_projects: 3,
      capacity_units: {
        total: 5,
        included: 3,
        additional_purchased: 2,
        pending_reduction: null
      }
    });
    const onBillingChange = vi.fn();
    const showErrorToast = vi.spyOn(notify, "showErrorToast").mockImplementation(() => undefined);
    const showSuccessToast = vi
      .spyOn(notify, "showSuccessToast")
      .mockImplementation(() => undefined);

    vi.spyOn(api, "increaseBillingCapacity")
      .mockRejectedValueOnce(new Error("pending_capacity_reduction_exists"))
      .mockRejectedValueOnce(new Error("invalid_target_quantity"));
    vi.spyOn(api, "scheduleBillingCapacityReduction").mockRejectedValue(
      new Error("invalid_target_quantity")
    );
    vi.spyOn(api, "cancelBillingCapacityReduction").mockResolvedValue(
      createBillingSummary({
        plan: "solo",
        stripe_customer_id: "cus_123",
        active_projects: 3,
        capacity_units: {
          total: 5,
          included: 3,
          additional_purchased: 2,
          pending_reduction: null
        }
      })
    );

    const { rerender } = render(
      <CapacityDialog
        billing={billing}
        canChangeBilling={true}
        managementMode="stripe"
        open={true}
        onOpenChange={() => {}}
        onBillingChange={onBillingChange}
      />
    );

    expect(screen.getByRole("dialog", { name: /manage allowance capacity/i })).toHaveClass(
      "max-h-[calc(100dvh-2rem)]",
      "overflow-y-auto",
      "overscroll-contain"
    );

    await user.click(screen.getByRole("button", { name: /increase capacity now/i }));
    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith(
        "Cancel the scheduled reduction before adding more capacity units."
      );
    });

    await user.click(screen.getByRole("button", { name: /increase capacity now/i }));
    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith(
        "Choose a unit count above your current purchased quantity."
      );
    });

    await user.click(screen.getByRole("button", { name: /schedule reduction/i }));
    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith(
        "Choose a unit count below your current purchased quantity."
      );
    });

    rerender(
      <CapacityDialog
        billing={createBillingSummary({
          plan: "solo",
          stripe_customer_id: "cus_123",
          active_projects: 3,
          capacity_units: {
            total: 5,
            included: 3,
            additional_purchased: 2,
            pending_reduction: {
              additional_purchased: 0,
              total: 3,
              effective_at: "2026-04-23T11:56:12.000Z"
            }
          }
        })}
        canChangeBilling={true}
        managementMode="stripe"
        open={true}
        onOpenChange={() => {}}
        onBillingChange={onBillingChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /keep current units/i }));
    await waitFor(() => {
      expect(onBillingChange).toHaveBeenCalled();
      expect(showSuccessToast).toHaveBeenCalledWith(
        "Scheduled capacity reduction cancelled successfully."
      );
    });
  });

  it("applies successful billing capacity increases", async () => {
    const user = userEvent.setup();
    const nextBilling = createBillingSummary({
      plan: "solo",
      stripe_customer_id: "cus_123",
      active_projects: 3,
      capacity_units: {
        total: 6,
        included: 3,
        additional_purchased: 3,
        pending_reduction: null
      }
    });
    const onBillingChange = vi.fn();
    const showSuccessToast = vi
      .spyOn(notify, "showSuccessToast")
      .mockImplementation(() => undefined);

    vi.spyOn(api, "increaseBillingCapacity").mockResolvedValue(nextBilling);

    render(
      <CapacityDialog
        billing={createBillingSummary({
          plan: "solo",
          stripe_customer_id: "cus_123",
          active_projects: 3,
          capacity_units: {
            total: 5,
            included: 3,
            additional_purchased: 2,
            pending_reduction: null
          }
        })}
        canChangeBilling={true}
        managementMode="stripe"
        open={true}
        onOpenChange={() => {}}
        onBillingChange={onBillingChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /increase capacity now/i }));

    await waitFor(() => {
      expect(onBillingChange).toHaveBeenCalledWith(nextBilling);
      expect(showSuccessToast).toHaveBeenCalledWith("Allowance capacity increased successfully.");
    });
  });

  it("applies immediate internal capacity reductions", async () => {
    const user = userEvent.setup();
    const nextBilling = createBillingSummary({
      plan: "team",
      stripe_customer_id: null,
      active_projects: 3,
      capacity_units: {
        total: 16,
        included: 15,
        additional_purchased: 1,
        pending_reduction: null
      }
    });
    const onBillingChange = vi.fn();
    const showSuccessToast = vi
      .spyOn(notify, "showSuccessToast")
      .mockImplementation(() => undefined);

    vi.spyOn(api, "scheduleBillingCapacityReduction").mockResolvedValue(nextBilling);

    render(
      <CapacityDialog
        billing={createBillingSummary({
          plan: "team",
          stripe_customer_id: null,
          active_projects: 3,
          capacity_units: {
            total: 17,
            included: 15,
            additional_purchased: 2,
            pending_reduction: null
          }
        })}
        canChangeBilling={true}
        managementMode="internal"
        open={true}
        onOpenChange={() => {}}
        onBillingChange={onBillingChange}
      />
    );

    expect(
      screen.getByText(
        /internal admin-managed accounts update purchased allowance units immediately/i
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reduce capacity now/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reduce capacity now/i }));

    await waitFor(() => {
      expect(onBillingChange).toHaveBeenCalledWith(nextBilling);
      expect(showSuccessToast).toHaveBeenCalledWith("Allowance capacity reduced successfully.");
    });
  });
});
