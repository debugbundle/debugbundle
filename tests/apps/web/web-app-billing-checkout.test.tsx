// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { StrictMode } from "react";
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

describe("billing checkout", () => {
  it("renders billing summary for owners and starts the Stripe checkout entry point from the billing page", async () => {
    const user = userEvent.setup();
    const locationAssign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        assign: locationAssign
      }
    });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary()
        });
      }

      if (url.endsWith("/v1/billing/checkout") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(JSON.stringify({ target_plan: "solo" }));

        return jsonResponse(200, {
          url: "https://billing.stripe.com/checkout/solo"
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing"]} />);

    expect(await screen.findByRole("heading", { name: /billing/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /billing/i })).toBeInTheDocument();
    expect((await screen.findAllByText(/current plan/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/active projects/i)).toBeInTheDocument();
    expect(screen.getByText(/total allowance units/i)).toBeInTheDocument();
    expect(
      screen.getByText(/projects stay unlimited\. this account currently has 1 active project\./i)
    ).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /upgrade to solo/i }));

    expect(locationAssign).toHaveBeenCalledWith("https://billing.stripe.com/checkout/solo");
  });

  it("confirms billing and shows a success dialog after a successful Stripe checkout return", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary()
        });
      }

      if (url.endsWith("/v1/billing/checkout/confirm") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(JSON.stringify({ session_id: "cs_test_123" }));

        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "solo",
            stripe_customer_id: "cus_123",
            capacity_units: {
              total: 3,
              included: 3,
              additional_purchased: 0,
              pending_reduction: null
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing?checkout=success&session_id=cs_test_123"]} />);

    expect(await screen.findByRole("heading", { name: /billing/i, level: 1 })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/^solo$/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("dialog", { name: /solo is active/i })).toBeInTheDocument();
    expect(screen.getByText(/new tier is available across this account/i)).toBeInTheDocument();

    expect(
      fetchMock.mock.calls.filter(([input, requestInit]) => {
        return (
          requestUrl(input).endsWith("/v1/billing/checkout/confirm") &&
          requestInit?.method === "POST"
        );
      }).length
    ).toBe(1);
  });

  it("confirms billing after a successful Stripe checkout return under React StrictMode", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary()
        });
      }

      if (url.endsWith("/v1/billing/checkout/confirm") && init?.method === "POST") {
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "team",
            stripe_customer_id: "cus_123",
            capacity_units: {
              total: 15,
              included: 15,
              additional_purchased: 0,
              pending_reduction: null
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <StrictMode>
        <App initialEntries={["/billing?checkout=success&session_id=cs_test_123"]} />
      </StrictMode>
    );

    expect(await screen.findByRole("dialog", { name: /team is active/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/^team$/i)).toBeInTheDocument();
    });

    expect(
      fetchMock.mock.calls.filter(([input, requestInit]) => {
        return (
          requestUrl(input).endsWith("/v1/billing/checkout/confirm") &&
          requestInit?.method === "POST"
        );
      }).length
    ).toBe(1);
  });

  it("clears the checkout return before refreshing the session after confirmation", async () => {
    let authSessionRequests = 0;
    let resolveRefreshSession: ((response: Response) => void) | null = null;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        authSessionRequests += 1;
        if (authSessionRequests === 1) {
          return jsonResponse(200, {
            session: createSession()
          });
        }

        return new Promise<Response>((resolve) => {
          resolveRefreshSession = resolve;
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary()
        });
      }

      if (url.endsWith("/v1/billing/checkout/confirm") && init?.method === "POST") {
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "team",
            stripe_customer_id: "cus_123",
            capacity_units: {
              total: 15,
              included: 15,
              additional_purchased: 0,
              pending_reduction: null
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing?checkout=success&session_id=cs_test_123"]} />);

    expect(await screen.findByRole("dialog", { name: /team is active/i })).toBeInTheDocument();

    expect(
      fetchMock.mock.calls.filter(([input, requestInit]) => {
        return (
          requestUrl(input).endsWith("/v1/billing/checkout/confirm") &&
          requestInit?.method === "POST"
        );
      }).length
    ).toBe(1);

    expect(resolveRefreshSession).not.toBeNull();
    resolveRefreshSession!(
      new Response(JSON.stringify({ session: createSession({ organization_plan: "team" }) }), {
        status: 200
      })
    );

    await waitFor(() => {
      expect(screen.getByText(/^team$/i)).toBeInTheDocument();
    });

    expect(
      fetchMock.mock.calls.filter(([input, requestInit]) => {
        return (
          requestUrl(input).endsWith("/v1/billing/checkout/confirm") &&
          requestInit?.method === "POST"
        );
      }).length
    ).toBe(1);
  });

  it("shows a canceled checkout return dialog on the billing page without confirming checkout", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary()
        });
      }

      if (url.endsWith("/v1/billing/checkout/confirm")) {
        throw new Error("confirm should not be called");
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing?checkout=canceled"]} />);

    expect(await screen.findByRole("heading", { name: /billing/i, level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: /checkout canceled/i })).toBeInTheDocument();
    expect(
      screen.getByText(/no payment was completed and your plan has not changed/i)
    ).toBeInTheDocument();
  });
});
