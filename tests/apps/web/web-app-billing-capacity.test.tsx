// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
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

describe("billing capacity", () => {
  it("lets internal admin-managed plans reduce capacity immediately from the billing page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ organization_plan: "team" })
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "team",
            stripe_customer_id: null,
            active_projects: 3,
            capacity_units: {
              total: 17,
              included: 15,
              additional_purchased: 2,
              pending_reduction: null
            }
          })
        });
      }

      if (url.endsWith("/v1/billing/capacity/scheduled-reduction") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(JSON.stringify({ target_additional_capacity_units: 1 }));

        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "team",
            stripe_customer_id: null,
            active_projects: 3,
            capacity_units: {
              total: 16,
              included: 15,
              additional_purchased: 1,
              pending_reduction: null
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing"]} />);

    expect(await screen.findByRole("heading", { name: /billing/i, level: 1 })).toBeInTheDocument();
    expect(await screen.findByText(/billing is managed internally/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /manage capacity/i }));
    expect(
      await screen.findByText(
        /internal admin-managed accounts update purchased allowance units immediately/i
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /keep current units/i })).not.toBeInTheDocument();

    const reductionInput = screen.getByLabelText(/purchased extra units after update/i);
    await user.clear(reductionInput);
    await user.type(reductionInput, "1");
    await user.click(screen.getByRole("button", { name: /reduce capacity now/i }));

    expect(await screen.findByText(/^1$/i, { selector: "p.font-medium" })).toBeInTheDocument();
  });

  it("lets owners schedule a capacity reduction from the billing page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "solo",
            stripe_customer_id: "cus_123",
            active_projects: 3,
            capacity_units: {
              total: 5,
              included: 3,
              additional_purchased: 2,
              pending_reduction: null
            },
            usage_window: {
              starts_at: "2026-03-23T11:56:12.000Z",
              ends_at: "2026-04-23T11:56:12.000Z"
            }
          })
        });
      }

      if (url.endsWith("/v1/billing/capacity/scheduled-reduction") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(JSON.stringify({ target_additional_capacity_units: 0 }));

        return jsonResponse(200, {
          billing: createBillingSummary({
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
            },
            usage_window: {
              starts_at: "2026-03-23T11:56:12.000Z",
              ends_at: "2026-04-23T11:56:12.000Z"
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing"]} />);

    expect(await screen.findByRole("heading", { name: /billing/i, level: 1 })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /manage capacity/i }));
    expect(
      await screen.findByRole("heading", { name: /manage allowance capacity/i })
    ).toBeInTheDocument();

    const reductionInput = screen.getByLabelText(/purchased extra units after renewal/i);
    await user.clear(reductionInput);
    await user.type(reductionInput, "0");
    await user.click(screen.getByRole("button", { name: /schedule reduction/i }));

    expect((await screen.findAllByText(/dropping to 3 total units/i)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /keep current units/i })).toBeInTheDocument();
  });

  it("cancels a pending capacity reduction from the billing page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary({
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
            },
            usage_window: {
              starts_at: "2026-03-23T11:56:12.000Z",
              ends_at: "2026-04-23T11:56:12.000Z"
            }
          })
        });
      }

      if (url.endsWith("/v1/billing/capacity/scheduled-reduction") && init?.method === "DELETE") {
        expect(init.credentials).toBe("include");
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "solo",
            stripe_customer_id: "cus_123",
            active_projects: 3,
            capacity_units: {
              total: 5,
              included: 3,
              additional_purchased: 2,
              pending_reduction: null
            },
            usage_window: {
              starts_at: "2026-03-23T11:56:12.000Z",
              ends_at: "2026-04-23T11:56:12.000Z"
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing"]} />);

    expect(await screen.findByText(/dropping to 3 total units/i)).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /manage capacity/i }));
    await user.click(screen.getByRole("button", { name: /keep current units/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).endsWith("/v1/billing/capacity/scheduled-reduction") &&
            init?.method === "DELETE"
        )
      ).toBe(true);
    });

    expect(
      await screen.findByText(/scheduled capacity reduction cancelled successfully/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/dropping to 3 total units/i)).toBeNull();
  });

  it("shows a billing capacity error toast when increasing units fails validation", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "solo",
            stripe_customer_id: "cus_123",
            active_projects: 2,
            capacity_units: {
              total: 4,
              included: 3,
              additional_purchased: 1,
              pending_reduction: null
            }
          })
        });
      }

      if (url.endsWith("/v1/billing/capacity/increase") && init?.method === "POST") {
        return jsonResponse(400, { error: "invalid_target_quantity" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing"]} />);

    await screen.findByRole("heading", { name: /billing/i, level: 1 });
    await user.click(await screen.findByRole("button", { name: /manage capacity/i }));

    const increaseInput = screen.getByLabelText(/^purchased extra units$/i);
    await user.clear(increaseInput);
    await user.type(increaseInput, "2");
    await user.click(screen.getByRole("button", { name: /increase capacity now/i }));

    expect(
      await screen.findByText(/choose a unit count above your current purchased quantity/i)
    ).toBeInTheDocument();
  });
});
