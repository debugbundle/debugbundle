// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { BillingSubscriptionControl } from "../../../apps/web/src/components/system/billing-subscription-control.js";
import { createBillingSummary, jsonResponse, requestUrl } from "./web-test-helpers.js";

afterEach(() => vi.unstubAllGlobals());
function quote() {
  return {
    confirmation_token: "quote_test",
    expires_at: new Date(Date.now() + 600000).toISOString(),
    effective_at: "2026-11-01T00:00:00.000Z",
    target_plan: "solo",
    amount_due: 0,
    currency: "usd",
    tax: 83,
    action: "renewal",
    interval: "month",
    recurring_total: 1275,
    additional_capacity_units: 7
  };
}
function setup(fail = false, failStatus = false) {
  const schedule = vi.fn(),
    cancel = vi.fn();
  let pending: unknown = null;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (failStatus && (!init?.method || init.method === "GET")) {
        failStatus = false;
        return jsonResponse(503, { error: "billing_service_error" });
      }
      if (requestUrl(input).endsWith("/preview"))
        return jsonResponse(200, {
          quote: quote()
        });
      if (init?.method === "POST") {
        schedule(JSON.parse(typeof init.body === "string" ? init.body : "null"));
        if (fail) return jsonResponse(503, { error: "billing_service_error" });
        pending = {
          schedule_id: "sched_test",
          effective_at: "2026-11-01T00:00:00.000Z",
          target_plan: "solo",
          interval: "month",
          additional_capacity_units: 7
        };
      }
      if (init?.method === "DELETE") {
        cancel(JSON.parse(typeof init.body === "string" ? init.body : "null"));
        pending = null;
      }
      return jsonResponse(200, {
        pending_change: pending,
        ...(!init?.method || init.method === "GET"
          ? {
              subscription: {
                plan: "team",
                interval: "month",
                currency: "usd",
                additional_capacity_units: 7,
                base_amount_minor: 1900,
                capacity_unit_amount_minor: 299,
                term_starts_at: "2026-10-01T00:00:00.000Z",
                term_ends_at: "2026-11-01T00:00:00.000Z"
              }
            }
          : {})
      });
    })
  );
  render(
    <BillingSubscriptionControl
      billing={createBillingSummary({ plan: "team", stripe_customer_id: "cus_test" })}
      onNavigate={vi.fn()}
      onRefresh={vi.fn()}
    />
  );
  return { user: userEvent.setup(), schedule, cancel, fetch: vi.mocked(fetch) };
}
async function reviewSolo(f: ReturnType<typeof setup>): Promise<void> {
  await f.user.click(
    await screen.findByRole("button", { name: "Change plan or billing interval" })
  );
  const solo = screen.getByRole("radio", { name: "Solo" });
  await waitFor(() => expect(solo).toBeEnabled());
  await f.user.click(solo);
  await f.user.click(screen.getByRole("button", { name: "Review change" }));
}
it("shows renewal date, taxes, retained capacity and feature loss before explicit confirmation", async () => {
  const f = setup();
  await reviewSolo(f);
  await screen.findByText(/12\.75/);
  expect(screen.getByText(/0\.83/)).toBeInTheDocument();
  expect(screen.getByText(/7 extra capacity/)).toBeInTheDocument();
  expect(screen.getByText(/Collaboration and Slack will pause/)).toBeInTheDocument();
  expect(f.schedule).not.toHaveBeenCalled();
  await f.user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(f.schedule).not.toHaveBeenCalled();
  await reviewSolo(f);
  await f.user.click(await screen.findByRole("button", { name: "Schedule change" }));
  await waitFor(() =>
    expect(f.schedule).toHaveBeenCalledExactlyOnceWith({ confirmation_token: "quote_test" })
  );
  expect(await screen.findByText(/current plan remains active/i)).toBeInTheDocument();
  await f.user.click(screen.getByRole("button", { name: "Keep current plan" }));
  await waitFor(() =>
    expect(f.cancel).toHaveBeenCalledExactlyOnceWith({ schedule_id: "sched_test" })
  );
  expect(
    await screen.findByRole("button", { name: "Change plan or billing interval" })
  ).toBeInTheDocument();
});
it("retains the confirmed request for an ambiguous retry without claiming a downgrade", async () => {
  const f = setup(true);
  await reviewSolo(f);
  await f.user.click(await screen.findByRole("button", { name: "Schedule change" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/Retry/);
  await f.user.click(screen.getByRole("button", { name: "Schedule change" }));
  expect(f.schedule).toHaveBeenCalledTimes(2);
  expect(f.schedule.mock.calls[1]).toEqual(f.schedule.mock.calls[0]);
});

it("recovers a failed initial read through Retry without enabling an unknown change", async () => {
  const f = setup(false, true);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Subscription terms could not be refreshed"
  );
  await f.user.click(screen.getByRole("button", { name: "Change plan or billing interval" }));
  expect(screen.getByRole("button", { name: "Review change" })).toBeDisabled();
  await f.user.click(screen.getByRole("button", { name: "Retry subscription terms" }));
  await waitFor(() => expect(screen.getByText(/billed monthly/i)).toBeInTheDocument());
});
it("recovers preview failure, refreshes an expired quote and never confirms it", async () => {
  const f = setup();
  await waitFor(() => expect(screen.getByText(/billed monthly/i)).toBeInTheDocument());
  await f.user.click(screen.getByRole("button", { name: "Change plan or billing interval" }));
  await f.user.click(screen.getByRole("radio", { name: "Solo" }));
  f.fetch.mockResolvedValueOnce(jsonResponse(503, { error: "billing_service_error" }));
  await f.user.click(screen.getByRole("button", { name: "Review change" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not prepare");
  f.fetch.mockResolvedValueOnce(
    jsonResponse(200, {
      quote: { ...quote(), expires_at: new Date(Date.now() - 1).toISOString() }
    })
  );
  await f.user.click(screen.getByRole("button", { name: "Review change" }));
  await f.user.click(await screen.findByRole("button", { name: "Schedule change" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("quote expired");
  expect(f.schedule).not.toHaveBeenCalled();
  await f.user.click(screen.getByRole("button", { name: "Review change" }));
  await screen.findByText(/12\.75/);
  await f.user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
it("requires a fresh quote after server invalidation and retains a scheduled change after failed cancellation", async () => {
  const f = setup();
  await reviewSolo(f);
  await screen.findByText(/12\.75/);
  f.fetch.mockResolvedValueOnce(jsonResponse(409, { error: "plan_change_confirmation_required" }));
  await f.user.click(screen.getByRole("button", { name: "Schedule change" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("changed or expired");
  await f.user.click(screen.getByRole("button", { name: "Review change" }));
  await f.user.click(await screen.findByRole("button", { name: "Schedule change" }));
  await screen.findByRole("button", { name: "Keep current plan" });
  f.fetch.mockResolvedValueOnce(jsonResponse(503, { error: "billing_service_error" }));
  await f.user.click(screen.getByRole("button", { name: "Keep current plan" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Cancellation could not be confirmed");
  expect(screen.getByText(/current plan remains active/i)).toBeInTheDocument();
  await f.user.click(screen.getByRole("button", { name: "Keep current plan" }));
  expect(
    await screen.findByRole("button", { name: "Change plan or billing interval" })
  ).toBeEnabled();
});
it("resumes a prepared expired quote after reload and after closing the dialog", async () => {
  const f = setup(true);
  await waitFor(() => expect(screen.getByText(/billed monthly/i)).toBeInTheDocument());
  f.fetch.mockResolvedValueOnce(
    jsonResponse(200, {
      quote: {
        ...quote(),
        expires_at: new Date(Date.now() - 1).toISOString(),
        resume_required: true
      }
    })
  );
  await reviewSolo(f);
  expect(await screen.findByText(/previous request is still being checked/)).toBeInTheDocument();
  await f.user.click(screen.getByRole("button", { name: "Schedule change" }));
  await screen.findByRole("alert");
  await f.user.click(screen.getByRole("button", { name: "Cancel" }));
  const requests = f.fetch.mock.calls.length;
  await f.user.click(screen.getByRole("button", { name: "Change plan or billing interval" }));
  expect(f.fetch).toHaveBeenCalledTimes(requests);
  await f.user.click(screen.getByRole("button", { name: "Schedule change" }));
  expect(f.schedule).toHaveBeenCalledTimes(2);
});
