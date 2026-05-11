// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { buildApiUrl, resolveApiBaseUrl } from "../../../apps/web/src/lib/api.ts";
import { resolveDocumentationUrl } from "../../../apps/web/src/lib/external-links.ts";
import {
  createBillingSummary,
  createMemberTokenRecord,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("web app - auth routes", () => {
  it("resolves hosted auth URLs through VITE_API_URL while preserving local relative paths", () => {
    expect(resolveApiBaseUrl({})).toBe("");
    expect(buildApiUrl("/v1/auth/session", {})).toBe("/v1/auth/session");

    expect(resolveApiBaseUrl({ VITE_API_URL: " https://api.debugbundle.com/ " })).toBe("https://api.debugbundle.com");
    expect(buildApiUrl("/v1/auth/session", { VITE_API_URL: "https://api.debugbundle.com/" })).toBe(
      "https://api.debugbundle.com/v1/auth/session"
    );
    expect(buildApiUrl("/v1/auth/github/start", { VITE_API_URL: "https://api.debugbundle.com" })).toBe(
      "https://api.debugbundle.com/v1/auth/github/start"
    );
  });

  it("resolves documentation links by environment and supports explicit overrides", () => {
    expect(resolveDocumentationUrl({ DEV: false, MODE: "production" }, new URL("https://app.debugbundle.com/dashboard"))).toBe(
      "https://debugbundle.com/docs"
    );

    expect(
      resolveDocumentationUrl(
        { DEV: false, MODE: "production", VITE_DOCUMENTATION_URL: "https://docs.example.test/custom" },
        new URL("https://app.debugbundle.com/dashboard")
      )
    ).toBe("https://docs.example.test/custom");
  });

  it.each([
    ["/login", /continue to debugbundle/i],
    ["/signup", /create your debugbundle account/i]
  ])("renders the public auth route %s", async (path, heading) => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (requestUrl(input).endsWith("/v1/auth/session")) {
        return jsonResponse(401, { error: "invalid_session" });
      }

      return jsonResponse(200, { success: true });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[path]} />);

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /continue with github/i })).toBeInTheDocument();
    expect(screen.getByText(/continue with email/i)).toBeInTheDocument();
  });

  it.each(["/login", "/signup"])("places GitHub auth above email with an 'or' divider on %s", async (path) => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (requestUrl(input).endsWith("/v1/auth/session")) {
        return jsonResponse(401, { error: "invalid_session" });
      }

      return jsonResponse(200, { success: true });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={[path]} />);

    const githubLink = await screen.findByRole("link", { name: /continue with github/i });
    const emailInput = await screen.findByLabelText(/email address/i);

    expect(screen.getByText(/^or$/i)).toBeInTheDocument();
    expect(githubLink.compareDocumentPosition(emailInput) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("requests and verifies an email code from the login screen before landing on the dashboard", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(401, { error: "invalid_session" });
      }

      if (url.endsWith("/v1/auth/request-code")) {
        expect(init?.method).toBe("POST");
        expect(init?.credentials).toBe("include");
        expect(init?.headers).toEqual({ "Content-Type": "application/json" });
        expect(init?.body).toBe(JSON.stringify({ email: "owen@example.com", accepted_terms: true }));
        return jsonResponse(200, { success: true });
      }

      if (url.endsWith("/v1/auth/verify-code")) {
        expect(init?.method).toBe("POST");
        expect(init?.credentials).toBe("include");
        expect(init?.headers).toEqual({ "Content-Type": "application/json" });
        expect(init?.body).toBe(JSON.stringify({ email: "owen@example.com", code: "123456" }));
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing")) {
        return jsonResponse(200, { billing: createBillingSummary() });
      }

      if (url.endsWith("/v1/projects")) {
        return jsonResponse(200, { projects: [] });
      }

      return jsonResponse(200, { tokens: [] });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/login"]} />);

    await user.type(await screen.findByLabelText(/email address/i), "owen@example.com");
    await user.click(screen.getByRole("button", { name: /^send code$/i }));

    expect(await screen.findByLabelText(/six-digit code/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/six-digit code/i), "123456");
    await user.click(screen.getByRole("button", { name: /^send code$/i }));

    expect(await screen.findByText(/bundle requests/i)).toBeInTheDocument();
  });

  it("validates the email field before requesting a code", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (requestUrl(input).endsWith("/v1/auth/session")) {
        return jsonResponse(401, { error: "invalid_session" });
      }

      return jsonResponse(200, { success: true });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/login"]} />);

    const emailInput = await screen.findByLabelText(/email address/i);
    await user.click(screen.getByRole("button", { name: /^send code$/i }));

    expect(emailInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/enter your email address to receive a sign-in code/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).endsWith("/v1/auth/request-code"))).toBe(false);
  });

  it("validates the verification code before submitting", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(401, { error: "invalid_session" });
      }

      if (url.endsWith("/v1/auth/request-code")) {
        expect(init?.body).toBe(JSON.stringify({ email: "owen@example.com", accepted_terms: true }));
        return jsonResponse(200, { success: true });
      }

      return jsonResponse(200, { success: true });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/login"]} />);

    await user.type(await screen.findByLabelText(/email address/i), "owen@example.com");
    await user.click(screen.getByRole("button", { name: /^send code$/i }));

    const codeInput = await screen.findByLabelText(/six-digit code/i);
    await user.click(screen.getByRole("button", { name: /^send code$/i }));

    expect(codeInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/enter the six-digit code from your email/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).endsWith("/v1/auth/verify-code"))).toBe(false);
  });

  it("shows documentation in the user menu and removes the duplicate settings entry", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing")) {
        return jsonResponse(200, { billing: createBillingSummary() });
      }

      if (url.endsWith("/v1/projects")) {
        return jsonResponse(200, { projects: [] });
      }

      return jsonResponse(200, { tokens: [] });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    expect(await screen.findByText(/bundle requests/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /owen@example.com/i }));

    const documentationItem = await screen.findByRole("menuitem", { name: /documentation/i });
    expect(documentationItem).toHaveAttribute("href", "http://localhost:5292/docs");
    expect(documentationItem).toHaveAttribute("target", "_blank");
    expect(screen.queryByRole("menuitem", { name: /^settings$/i })).toBeNull();
  });

  it("uses the same OTP flow on signup and keeps the legal links visible", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(401, { error: "invalid_session" });
      }

      if (url.endsWith("/v1/auth/request-code")) {
        expect(init?.body).toBe(JSON.stringify({ email: "owen@example.com", accepted_terms: true }));
        return jsonResponse(200, { success: true });
      }

      if (url.endsWith("/v1/auth/verify-code")) {
        expect(init?.body).toBe(JSON.stringify({ email: "owen@example.com", code: "654321" }));
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing")) {
        return jsonResponse(200, { billing: createBillingSummary() });
      }

      if (url.endsWith("/v1/projects")) {
        return jsonResponse(200, { projects: [] });
      }

      return jsonResponse(200, { tokens: [] });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/signup"]} />);

    expect((await screen.findByRole("link", { name: /terms of service/i })).getAttribute("href")).toBe("https://debugbundle.com/terms");
    expect(screen.getByRole("link", { name: /privacy policy/i }).getAttribute("href")).toBe("https://debugbundle.com/privacy");

    await user.type(screen.getByLabelText(/email address/i), "owen@example.com");
    await user.click(screen.getByRole("button", { name: /^send code$/i }));
    await user.type(await screen.findByLabelText(/six-digit code/i), "654321");
    await user.click(screen.getByRole("button", { name: /^send code$/i }));

    expect(await screen.findByText(/bundle requests/i)).toBeInTheDocument();
  });

  it("shows a recoverable GitHub auth callback state when oauth exchange fails", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (requestUrl(input).endsWith("/v1/auth/session")) {
        return jsonResponse(401, { error: "invalid_session" });
      }

      return jsonResponse(200, { success: true });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/auth/github/callback?error=oauth_exchange_failed"]} />);

    expect(await screen.findByRole("heading", { name: /continue with github/i })).toBeInTheDocument();
    expect(screen.getByText(/github sign-in could not be completed/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /continue with github/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to login/i })).toBeInTheDocument();
  });

  it("blocks first member-token creation for unverified sessions", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ email_verified_at: null })
        });
      }

      if (url.endsWith("/v1/member/tokens")) {
        return jsonResponse(200, { tokens: [] });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/member-tokens"]} />);

    expect(await screen.findByRole("heading", { name: /member tokens/i })).toBeInTheDocument();
    expect(screen.getByText(/complete email sign-in again to verify this address/i)).toBeInTheDocument();
    expect(await screen.findByText(/no member tokens yet/i)).toBeInTheDocument();

    const createButtons = screen.getAllByRole("button", { name: /create member token/i });
    expect(createButtons.length).toBeGreaterThan(0);
    createButtons.forEach((button) => {
      expect(button).toBeDisabled();
    });
  });

  it("creates a member token for verified sessions and reveals the plaintext once", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/member/tokens") && init?.method === undefined) {
        return jsonResponse(200, {
          tokens: [createMemberTokenRecord()]
        });
      }

      if (url.endsWith("/v1/member/tokens") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(JSON.stringify({ label: "CI automation" }));

        return jsonResponse(201, {
          token: {
            ...createMemberTokenRecord({ token_id: "tok_456", label: "CI automation" }),
            plaintext: "dbundle_mem_secret_123"
          }
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/member-tokens"]} />);

    expect(await screen.findByRole("heading", { name: /member tokens/i })).toBeInTheDocument();
    expect(await screen.findByText(/local mcp/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create member token/i }));
    await user.type(await screen.findByLabelText(/token label/i), "CI automation");
    await user.click(screen.getByRole("button", { name: /^create token$/i }));

    const revealRegion = await screen.findByRole("region", { name: /new token secret/i });
    expect(within(revealRegion).getByText(/dbundle_mem_secret_123/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/ci automation/i)).toBeInTheDocument();
    });
  });

  it("updates the settings page copy for email-code sign-in", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing")) {
        return jsonResponse(200, {
          billing: createBillingSummary()
        });
      }

      if (url.endsWith("/v1/projects")) {
        return jsonResponse(200, { projects: [] });
      }

      return jsonResponse(200, { tokens: [] });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/settings"]} />);

    expect(await screen.findByRole("heading", { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByText(/^Email code$/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /change password/i })).toBeNull();
    expect(screen.getByText(/one-time code sign-in/i)).toBeInTheDocument();
  });

  it("shows GitHub-only settings copy when email auth is unavailable", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({
            auth_methods: {
              email: false,
              github: true
            }
          })
        });
      }

      if (url.endsWith("/v1/billing")) {
        return jsonResponse(200, {
          billing: createBillingSummary()
        });
      }

      if (url.endsWith("/v1/projects")) {
        return jsonResponse(200, { projects: [] });
      }

      return jsonResponse(200, { tokens: [] });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/settings"]} />);

    expect(await screen.findByRole("heading", { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByText(/this account currently relies on github only/i)).toBeInTheDocument();
  });

  it("downloads the account export from settings", async () => {
    const user = userEvent.setup();
    const createObjectUrlMock = vi.fn(() => "blob:test-url");
    const revokeObjectUrlMock = vi.fn();
    const clickMock = vi.fn();
    const originalCreateElement = document.createElement.bind(document);

    vi.stubGlobal("URL", {
      createObjectURL: createObjectUrlMock,
      revokeObjectURL: revokeObjectUrlMock
    });

    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === "a") {
        element.click = clickMock;
      }
      return element;
    }) as typeof document.createElement);

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/billing")) {
        return jsonResponse(200, { billing: createBillingSummary() });
      }

      if (url.endsWith("/v1/projects")) {
        return jsonResponse(200, { projects: [] });
      }

      if (url.endsWith("/v1/account/export")) {
        return new Response(JSON.stringify({ organization_id: "org_123" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": 'attachment; filename="debugbundle-account-export.json"'
          }
        });
      }

      return jsonResponse(200, { tokens: [] });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/settings"]} />);

    await user.click(await screen.findByRole("button", { name: /download export/i }));

    await waitFor(() => {
      expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
    });
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlMock).toHaveBeenCalledWith("blob:test-url");
  });

  it("deletes the account from settings and returns to the email auth screen", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/billing")) {
        return jsonResponse(200, { billing: createBillingSummary() });
      }

      if (url.endsWith("/v1/projects")) {
        return jsonResponse(200, { projects: [] });
      }

      if (url.endsWith("/v1/account") && init?.method === "DELETE") {
        expect(init.headers).toEqual({
          "Content-Type": "application/json",
          "X-CSRF-Token": "csrf-token-123"
        });
        expect(init.body).toBe(JSON.stringify({ email: "owen@example.com" }));

        return jsonResponse(200, {
          account: {
            deleted_at: "2026-03-17T12:00:00.000Z",
            organization_id: "org_123",
            user_deleted: true
          }
        });
      }

      return jsonResponse(200, { tokens: [] });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/settings"]} />);

    await user.click(await screen.findByRole("button", { name: /delete account/i }));

    const dialog = await screen.findByRole("alertdialog");
    await user.type(within(dialog).getByLabelText(/confirm email address/i), "owen@example.com");
    await user.click(within(dialog).getAllByRole("button", { name: /delete account/i })[0] as HTMLButtonElement);

    expect(await screen.findByRole("heading", { name: /continue to debugbundle/i })).toBeInTheDocument();
  });
});
