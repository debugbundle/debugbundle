// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import * as notify from "../../../apps/web/src/lib/notify.js";
import {
  createBillingSummary,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("web app - billing trial flows", () => {
  it("shows remaining trial days, the trial end date, and locked capacity messaging for active trials", async () => {
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
            billing_state: "trialing",
            trial: {
              available: false,
              active: true,
              plan: "team",
              started_at: "2026-06-04T00:00:00.000Z",
              ends_at: "2026-07-04T00:00:00.000Z",
              used_at: "2026-06-04T00:00:00.000Z",
              converted_at: null,
              expired_at: null,
              days_remaining: 18
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing"]} />);

    expect(await screen.findByRole("heading", { name: /billing/i, level: 1 })).toBeInTheDocument();
    expect(await screen.findByText(/18 days left in your team trial/i)).toBeInTheDocument();
    expect(screen.getByText(/trial access stays active through .*2026/i)).toBeInTheDocument();
    expect(screen.getByText(/convert to paid to add extra capacity/i)).toBeInTheDocument();
    expect(screen.getByText(/with 18 days left remaining/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /manage capacity/i })).toBeDisabled();
  });

  it("starts the requested free trial from billing and refreshes the page state", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ organization_plan: "free" })
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "free",
            billing_state: null,
            trial: {
              available: true,
              active: false,
              plan: null,
              started_at: null,
              ends_at: null,
              used_at: null,
              converted_at: null,
              expired_at: null,
              days_remaining: null
            }
          })
        });
      }

      if (url.endsWith("/v1/billing/trial/start") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(JSON.stringify({ target_plan: "team" }));

        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "team",
            billing_state: "trialing",
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
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing?trial=team"]} />);

    expect(await screen.findByText(/team trial ready to start/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /start team trial/i }));

    expect(await screen.findByText(/team trial started successfully/i)).toBeInTheDocument();
    expect(await screen.findByText(/30 days left in your team trial/i)).toBeInTheDocument();
  });

  it("shows paid conversion only when the requested free trial was already used", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ organization_plan: "free" })
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "free",
            billing_state: "trial_expired",
            trial: {
              available: false,
              active: false,
              plan: "team",
              started_at: "2026-05-01T00:00:00.000Z",
              ends_at: "2026-05-31T00:00:00.000Z",
              used_at: "2026-05-01T00:00:00.000Z",
              converted_at: null,
              expired_at: "2026-05-31T00:00:00.000Z",
              days_remaining: null
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing?trial=team"]} />);

    expect(await screen.findByText(/this account has already used its free trial/i)).toBeInTheDocument();
    expect(screen.getByText(/already used the team trial/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /upgrade to team/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /start team trial/i })).toBeNull();
  });

  it("shows paid conversion when trial is unavailable without recorded trial plan", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ organization_plan: "free" })
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "free",
            billing_state: null,
            trial: {
              available: false,
              active: false,
              plan: null,
              started_at: null,
              ends_at: null,
              used_at: null,
              converted_at: null,
              expired_at: null,
              days_remaining: null
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing?trial=solo"]} />);

    expect(await screen.findByText(/this account has already used its free trial/i)).toBeInTheDocument();
    expect(screen.getByText(/a new solo trial cannot be started here/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /upgrade to solo/i }).length).toBeGreaterThan(0);
  });

  it("shows specific trial-start errors from the billing page", async () => {
    const user = userEvent.setup();
    const showErrorToast = vi.spyOn(notify, "showErrorToast").mockImplementation(() => undefined);
    const responses = [
      {
        error: "trial_unavailable",
        expected: "This account can no longer start a free trial."
      },
      {
        error: "billing_not_found",
        expected: "Billing details could not be loaded for this organization."
      },
      {
        error: "temporarily_unavailable",
        expected: "Trial start is unavailable right now."
      }
    ];

    for (const response of responses) {
      cleanup();
      resetBrowserSessionClientState();
      showErrorToast.mockClear();

      const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);

        if (url.endsWith("/v1/auth/session")) {
          return jsonResponse(200, {
            session: createSession({ organization_plan: "free" })
          });
        }

        if (url.endsWith("/v1/billing") && init?.method === undefined) {
          return jsonResponse(200, {
            billing: createBillingSummary({
              plan: "free",
              billing_state: null,
              trial: {
                available: true,
                active: false,
                plan: null,
                started_at: null,
                ends_at: null,
                used_at: null,
                converted_at: null,
                expired_at: null,
                days_remaining: null
              }
            })
          });
        }

        if (url.endsWith("/v1/billing/trial/start") && init?.method === "POST") {
          return jsonResponse(409, { error: response.error });
        }

        return jsonResponse(404, { error: "not_found" });
      });

      vi.stubGlobal("fetch", fetchMock);

      render(<App initialEntries={["/billing?trial=team"]} />);

      await user.click(await screen.findByRole("button", { name: /start team trial/i }));

      expect(showErrorToast).toHaveBeenCalledWith(response.expected);
    }
  });
});
