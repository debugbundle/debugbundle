// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { BillingPlanChangeControl } from "../../../apps/web/src/pages/billing-plan-change-control.js";
import { jsonResponse, requestUrl } from "./web-test-helpers.js";

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
    monthly_total: 1275,
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
          additional_capacity_units: 7
        };
      }
      if (init?.method === "DELETE") {
        cancel(JSON.parse(typeof init.body === "string" ? init.body : "null"));
        pending = null;
      }
      return jsonResponse(200, { pending_change: pending });
    })
  );
  render(<BillingPlanChangeControl />);
  return { user: userEvent.setup(), schedule, cancel, fetch: vi.mocked(fetch) };
}
it("shows renewal date, taxes, retained capacity and feature loss before explicit confirmation", async () => {
  const f = setup();
  await f.user.click(await screen.findByRole("button", { name: "Switch to Solo" }));
  await screen.findByText(/12\.75/);
  expect(screen.getByText(/0\.83/)).toBeInTheDocument();
  expect(screen.getByText(/7 extra capacity/)).toBeInTheDocument();
  expect(screen.getByText(/Team features/)).toBeInTheDocument();
  expect(f.schedule).not.toHaveBeenCalled();
  await f.user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(f.schedule).not.toHaveBeenCalled();
  await f.user.click(screen.getByRole("button", { name: "Switch to Solo" }));
  await f.user.click(await screen.findByRole("button", { name: "Confirm switch" }));
  await waitFor(() =>
    expect(f.schedule).toHaveBeenCalledExactlyOnceWith({ confirmation_token: "quote_test" })
  );
  expect(await screen.findByText(/Team remains active/)).toBeInTheDocument();
  await f.user.click(screen.getByRole("button", { name: "Keep Team" }));
  await waitFor(() =>
    expect(f.cancel).toHaveBeenCalledExactlyOnceWith({ schedule_id: "sched_test" })
  );
  expect(await screen.findByRole("button", { name: "Switch to Solo" })).toBeInTheDocument();
});
it("retains the confirmed request for an ambiguous retry without claiming a downgrade", async () => {
  const f = setup(true);
  await f.user.click(await screen.findByRole("button", { name: "Switch to Solo" }));
  await f.user.click(await screen.findByRole("button", { name: "Confirm switch" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/Retry/);
  await f.user.click(screen.getByRole("button", { name: "Confirm switch" }));
  expect(f.schedule).toHaveBeenCalledTimes(2);
  expect(f.schedule.mock.calls[1]).toEqual(f.schedule.mock.calls[0]);
});

it("recovers a failed initial read through Retry without enabling an unknown change", async () => {
  const f = setup(false, true);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load");
  expect(screen.getByRole("button", { name: "Switch to Solo" })).toBeDisabled();
  await f.user.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Switch to Solo" })).toBeEnabled());
});
it("recovers preview failure, refreshes an expired quote and never confirms it", async () => {
  const f = setup();
  await waitFor(() => expect(screen.getByRole("button", { name: "Switch to Solo" })).toBeEnabled());
  f.fetch.mockResolvedValueOnce(jsonResponse(503, { error: "billing_service_error" }));
  await f.user.click(screen.getByRole("button", { name: "Switch to Solo" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not prepare");
  f.fetch.mockResolvedValueOnce(
    jsonResponse(200, {
      quote: { ...quote(), expires_at: new Date(Date.now() - 1).toISOString() }
    })
  );
  await f.user.click(screen.getByRole("button", { name: "Refresh quote" }));
  await f.user.click(await screen.findByRole("button", { name: "Confirm switch" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("quote expired");
  expect(f.schedule).not.toHaveBeenCalled();
  await f.user.click(screen.getByRole("button", { name: "Refresh quote" }));
  await screen.findByText(/12\.75/);
  await f.user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
it("requires a fresh quote after server invalidation and retains a scheduled change after failed cancellation", async () => {
  const f = setup();
  await f.user.click(await screen.findByRole("button", { name: "Switch to Solo" }));
  await screen.findByText(/12\.75/);
  f.fetch.mockResolvedValueOnce(jsonResponse(409, { error: "plan_change_confirmation_required" }));
  await f.user.click(screen.getByRole("button", { name: "Confirm switch" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("changed or expired");
  await f.user.click(screen.getByRole("button", { name: "Refresh quote" }));
  await f.user.click(await screen.findByRole("button", { name: "Confirm switch" }));
  await screen.findByRole("button", { name: "Keep Team" });
  f.fetch.mockResolvedValueOnce(jsonResponse(503, { error: "billing_service_error" }));
  await f.user.click(screen.getByRole("button", { name: "Keep Team" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not cancel");
  expect(screen.getByText(/Team remains active/)).toBeInTheDocument();
  await f.user.click(screen.getByRole("button", { name: "Keep Team" }));
  expect(await screen.findByRole("button", { name: "Switch to Solo" })).toBeEnabled();
});
it("resumes a prepared expired quote after reload and after closing the dialog", async () => {
  const f = setup(true);
  await waitFor(() => expect(screen.getByRole("button", { name: "Switch to Solo" })).toBeEnabled());
  f.fetch.mockResolvedValueOnce(
    jsonResponse(200, {
      quote: {
        ...quote(),
        expires_at: new Date(Date.now() - 1).toISOString(),
        resume_required: true
      }
    })
  );
  await f.user.click(screen.getByRole("button", { name: "Switch to Solo" }));
  expect(await screen.findByText(/previous switch is still being checked/)).toBeInTheDocument();
  await f.user.click(screen.getByRole("button", { name: "Confirm switch" }));
  await screen.findByRole("alert");
  await f.user.click(screen.getByRole("button", { name: "Cancel" }));
  const requests = f.fetch.mock.calls.length;
  await f.user.click(screen.getByRole("button", { name: "Switch to Solo" }));
  expect(f.fetch).toHaveBeenCalledTimes(requests);
  await f.user.click(screen.getByRole("button", { name: "Confirm switch" }));
  expect(f.schedule).toHaveBeenCalledTimes(2);
});
