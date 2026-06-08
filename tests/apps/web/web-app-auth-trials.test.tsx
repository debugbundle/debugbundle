// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
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

describe("web app - auth trial flows", () => {
  it("shows the selected signup trial, preserves it in auth requests, and routes trial signups to billing", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(401, { error: "invalid_session" });
      }

      if (url.endsWith("/v1/auth/request-code")) {
        expect(init?.body).toBe(
          JSON.stringify({
            email: "owen@example.com",
            accepted_terms: true,
            requested_trial_plan: "team"
          })
        );
        return jsonResponse(200, { success: true });
      }

      if (url.endsWith("/v1/auth/verify-code")) {
        expect(init?.body).toBe(
          JSON.stringify({
            email: "owen@example.com",
            code: "123456",
            requested_trial_plan: "team"
          })
        );
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing")) {
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

      return jsonResponse(200, { projects: [] });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/signup?trial=team"]} />);

    expect(await screen.findByText(/team trial selected/i)).toBeInTheDocument();
    expect(screen.getByText(/30-day no-card trial/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /continue with github/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/v1/auth/github/start?trial=team")
    );

    await user.type(screen.getByLabelText(/email address/i), "owen@example.com");
    await user.click(screen.getByRole("button", { name: /^send code$/i }));
    await user.type(await screen.findByLabelText(/six-digit code/i), "123456");
    await user.click(screen.getByRole("button", { name: /^verify code$/i }));

    expect(await screen.findByRole("button", { name: /convert to team paid/i })).toBeInTheDocument();
    expect(screen.getByText(/trial access stays active through .*2026/i)).toBeInTheDocument();
  });

  it("keeps the signup trial intent when requesting a code", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(401, { error: "invalid_session" });
      }

      if (url.endsWith("/v1/auth/request-code")) {
        expect(init?.body).toBe(
          JSON.stringify({
            email: "owen@example.com",
            accepted_terms: true,
            requested_trial_plan: "solo"
          })
        );
        return jsonResponse(200, { success: true });
      }

      return jsonResponse(200, { success: true });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/signup?trial=solo"]} />);

    expect(await screen.findByText(/solo trial selected/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /continue without trial/i })).toBeNull();
    await user.type(screen.getByLabelText(/email address/i), "owen@example.com");
    await user.click(screen.getByRole("button", { name: /^send code$/i }));
  });

  it("preserves a trial-intent login and lands on billing without auto-starting a trial", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(401, { error: "invalid_session" });
      }

      if (url.endsWith("/v1/auth/request-code")) {
        expect(init?.body).toBe(
          JSON.stringify({
            email: "owner@example.com",
            accepted_terms: true,
            requested_trial_plan: "solo"
          })
        );
        return jsonResponse(200, { success: true });
      }

      if (url.endsWith("/v1/auth/verify-code")) {
        return jsonResponse(200, {
          session: createSession({
            email: "owner@example.com",
            organization_plan: "free"
          })
        });
      }

      if (url.endsWith("/v1/billing")) {
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "free",
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

      return jsonResponse(200, { projects: [] });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/login?trial=solo"]} />);

    await user.type(await screen.findByLabelText(/email address/i), "owner@example.com");
    await user.click(screen.getByRole("button", { name: /^send code$/i }));
    await user.type(await screen.findByLabelText(/six-digit code/i), "123456");
    await user.click(screen.getByRole("button", { name: /^verify code$/i }));

    expect(await screen.findByRole("button", { name: /start solo trial/i })).toBeInTheDocument();
  });

  it("sends an already authenticated pricing trial intent to billing", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({
            organization_plan: "free"
          })
        });
      }

      if (url.endsWith("/v1/billing")) {
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "free",
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

      return jsonResponse(200, { projects: [] });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/signup?trial=team"]} />);

    expect(await screen.findByRole("button", { name: /start team trial/i })).toBeInTheDocument();
  });
});
