// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import * as openAiOauthApi from "../../../apps/web/src/lib/openai-oauth-api.ts";
import { createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

const INTERACTION = {
  interaction_id: "interaction_123",
  client_name: "ChatGPT and Codex",
  publisher: "OpenAI",
  organization_name: "Acme Engineering",
  identity_scopes: ["openid", "email"],
  product_scopes: [
    "debugbundle:projects:read",
    "debugbundle:incidents:read",
    "debugbundle:artifacts:read",
    "debugbundle:improvements:read",
    "debugbundle:analytics:read",
    "debugbundle:health:read"
  ],
  reviewer_access_available: true
};

afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("web app - OpenAI OAuth", () => {
  it("preserves an opaque interaction through existing login and exposes review access only when enabled", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(401, { error: "invalid_session" });
      }
      if (url.endsWith("/oauth/interaction/interaction_123")) {
        return jsonResponse(200, {
          interaction: {
            ...INTERACTION,
            organization_name: null,
            authentication_required: true
          }
        });
      }
      return jsonResponse(404, { error: "not_found" });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/oauth/consent?interaction=interaction_123"]} />);

    const signIn = await screen.findByRole("link", { name: /sign in to continue/i });
    expect(signIn).toHaveAttribute(
      "href",
      "/login?next=%2Foauth%2Fconsent%3Finteraction%3Dinteraction_123"
    );
    expect(
      screen.getByRole("link", { name: /continue with openai review access/i })
    ).toHaveAttribute("href", "/oauth/reviewer?interaction=interaction_123");
  });

  it("renders the approved consent disclosure with selectable requested product scopes", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }
      if (url.endsWith("/oauth/interaction/interaction_123")) {
        return jsonResponse(200, { interaction: INTERACTION });
      }
      return jsonResponse(404, { error: "not_found" });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/oauth/consent?interaction=interaction_123"]} />);

    expect(
      await screen.findByRole("heading", { name: /connect debugbundle to chatgpt and codex/i })
    ).toBeInTheDocument();
    expect(await screen.findByText("Acme Engineering")).toBeInTheDocument();
    expect(screen.getByText(/share your verified email only/i)).toBeInTheDocument();
    expect(
      screen.getByText(/this connection cannot change, resolve, delete, send, or reconfigure/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /see projects available/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /read incident summaries/i })).toBeChecked();
    expect(
      screen.getByText(/incident severity, status, timing, and bounded context/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/fingerprints/i)).not.toBeInTheDocument();
    const allowButton = screen.getByRole("button", { name: /allow access/i });
    const denyButton = screen.getByRole("button", { name: /^deny$/i });
    const decisionGroup = screen.getByRole("group", { name: /authorization decision/i });

    expect(allowButton).toBeEnabled();
    expect(denyButton).toBeEnabled();
    expect(
      allowButton.compareDocumentPosition(denyButton) & Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0);
    expect(decisionGroup).toHaveAttribute("data-slot", "field");
    expect(decisionGroup).toHaveClass("gap-2", "sm:flex-row-reverse", "sm:justify-start");
    expect(allowButton).toHaveClass("w-full", "sm:w-auto");
    expect(denyButton).toHaveClass("w-full", "sm:w-auto");
  });

  it("keeps consent scope choices and decisions in a complete keyboard order", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }
      if (url.endsWith("/oauth/interaction/interaction_123")) {
        return jsonResponse(200, { interaction: INTERACTION });
      }
      return jsonResponse(404, { error: "not_found" });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/oauth/consent?interaction=interaction_123"]} />);

    const brandLink = await screen.findByRole("link", { name: "DebugBundle" });
    const checkboxes = await screen.findAllByRole("checkbox");
    brandLink.focus();

    for (const checkbox of checkboxes) {
      await user.tab();
      expect(checkbox).toHaveFocus();
    }

    const allowButton = screen.getByRole("button", { name: /allow access/i });
    const denyButton = screen.getByRole("button", { name: /^deny$/i });
    const settingsLink = screen.getByRole("link", { name: "Settings" });
    const termsLink = screen.getByRole("link", { name: /terms of service/i });
    const privacyLink = screen.getByRole("link", { name: /privacy policy/i });

    for (const control of [allowButton, denyButton, settingsLink, termsLink, privacyLink]) {
      await user.tab();
      expect(control).toHaveFocus();
    }

    checkboxes[0]?.focus();
    expect(checkboxes[0]).toBeChecked();
    await user.keyboard(" ");
    expect(checkboxes[0]).not.toBeChecked();
  });

  it.each([
    [403, "This organization is no longer available for this authorization request."],
    [
      400,
      "This authorization request is invalid or has expired. Return to ChatGPT or Codex and try again."
    ],
    [
      503,
      "This authorization request is unavailable right now. Return to ChatGPT or Codex and try again."
    ]
  ])("renders the bounded consent recovery message for HTTP %s", async (status, message) => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }
      if (url.endsWith("/oauth/interaction/interaction_123")) {
        return jsonResponse(status, { error: "authorization_unavailable" });
      }
      return jsonResponse(404, { error: "not_found" });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/oauth/consent?interaction=interaction_123"]} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("submits only the opaque interaction, decision, and selected allowlisted scopes", async () => {
    const user = userEvent.setup();
    const handoff = vi
      .spyOn(openAiOauthApi, "continueOpenAiAuthorization")
      .mockImplementation(() => undefined);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }
      if (url.endsWith("/oauth/interaction/interaction_123") && init?.method !== "POST") {
        return jsonResponse(200, { interaction: INTERACTION });
      }
      if (url.endsWith("/oauth/interaction/interaction_123") && init?.method === "POST") {
        expect(init.headers).toEqual({
          "Content-Type": "application/json",
          "X-CSRF-Token": "csrf-token-123"
        });
        if (typeof init.body !== "string") {
          throw new Error("expected_string_request_body");
        }
        expect(JSON.parse(init.body)).toEqual({
          decision: "allow",
          product_scopes: [
            "debugbundle:incidents:read",
            "debugbundle:artifacts:read",
            "debugbundle:improvements:read",
            "debugbundle:analytics:read",
            "debugbundle:health:read"
          ]
        });
        return jsonResponse(200, {
          continue_url: "https://api.debugbundle.com/oauth/authorize/resume"
        });
      }
      return jsonResponse(404, { error: "not_found" });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/oauth/consent?interaction=interaction_123"]} />);

    await user.click(await screen.findByRole("checkbox", { name: /see projects available/i }));
    await user.click(screen.getByRole("button", { name: /allow access/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).endsWith("/oauth/interaction/interaction_123") &&
            init?.method === "POST"
        )
      ).toBe(true);
    });
    expect(handoff).toHaveBeenCalledWith("https://api.debugbundle.com/oauth/authorize/resume");
  });

  it("explains identity-only access when every product scope is removed", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }
      if (url.endsWith("/oauth/interaction/interaction_123")) {
        return jsonResponse(200, { interaction: INTERACTION });
      }
      return jsonResponse(404, { error: "not_found" });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/oauth/consent?interaction=interaction_123"]} />);

    for (const checkbox of await screen.findAllByRole("checkbox")) {
      await user.click(checkbox);
    }
    expect(screen.getByText(/no debugbundle project data will be available/i)).toBeInTheDocument();
  });

  it("clears the reviewer credential after a generic denial", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (requestUrl(input).endsWith("/v1/auth/session")) {
        return jsonResponse(401, { error: "invalid_session" });
      }
      if (
        requestUrl(input).endsWith("/oauth/interaction/interaction_123/reviewer") &&
        init?.method === "POST"
      ) {
        return jsonResponse(401, { error: "openai_reviewer_access_denied" });
      }
      return jsonResponse(404, { error: "not_found" });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/oauth/reviewer?interaction=interaction_123"]} />);

    const credential = await screen.findByLabelText(/review credential/i);
    await user.type(credential, "reviewer-credential-at-least-thirty-two-characters");
    await user.click(screen.getByRole("button", { name: /continue to synthetic review project/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not verify the review credential/i
    );
    expect(credential).toHaveValue("");
  });

  it("submits the reviewer credential with Enter and returns focus to a bounded error", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (requestUrl(input).endsWith("/v1/auth/session")) {
        return jsonResponse(401, { error: "invalid_session" });
      }
      if (
        requestUrl(input).endsWith("/oauth/interaction/interaction_123/reviewer") &&
        init?.method === "POST"
      ) {
        return jsonResponse(401, { error: "openai_reviewer_access_denied" });
      }
      return jsonResponse(404, { error: "not_found" });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/oauth/reviewer?interaction=interaction_123"]} />);

    const credential = await screen.findByLabelText(/review credential/i);
    credential.focus();
    await user.keyboard("reviewer-credential-at-least-thirty-two-characters{Enter}");

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent(/could not verify the review credential/i);
    expect(error.parentElement).toHaveFocus();
    expect(credential).toHaveValue("");
  });

  it("lists retained OpenAI connections in settings and revokes through confirmation", async () => {
    const user = userEvent.setup();
    let revoked = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }
      if (url.endsWith("/v1/openai/connections") && init?.method !== "POST") {
        return jsonResponse(200, {
          connections: revoked
            ? []
            : [
                {
                  grant_id: "grant_123",
                  client_name: "ChatGPT and Codex",
                  organization_name: "Acme Engineering",
                  product_scopes: ["debugbundle:projects:read"],
                  consented_at: "2026-08-30T10:00:00.000Z",
                  expires_at: "2026-09-29T10:00:00.000Z",
                  revoked_at: null,
                  status: "active"
                }
              ]
        });
      }
      if (url.endsWith("/v1/openai/connections/revoke") && init?.method === "POST") {
        expect(init.headers).toEqual({
          "Content-Type": "application/json",
          "X-CSRF-Token": "csrf-token-123"
        });
        expect(init.body).toBe(JSON.stringify({ grant_id: "grant_123" }));
        revoked = true;
        return jsonResponse(200, { revoked: true });
      }
      return jsonResponse(200, { tokens: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/settings"]} />);

    expect(await screen.findByRole("heading", { name: /openai connections/i })).toBeInTheDocument();
    expect((await screen.findAllByText("Acme Engineering"))[0]).toBeInTheDocument();
    const revokeTrigger = screen.getAllByRole("button", { name: /revoke access/i })[0]!;
    revokeTrigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/does not delete debugbundle data/i);
    const cancelButton = screen.getByRole("button", { name: /^cancel$/i });
    expect(cancelButton).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(revokeTrigger).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: /^cancel$/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: /^revoke access$/i })).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByText(/no openai connections/i)).toBeInTheDocument();
    });
  });
});
