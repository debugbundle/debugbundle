// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import {
  createProject,
  createProjectToken,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

describe("project token management", () => {
  it("creates a project token and reveals the plaintext once", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/tokens") && init?.method === undefined) {
        return jsonResponse(200, {
          tokens: [createProjectToken()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/tokens") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(
          JSON.stringify({
            label: "CI deploy",
            allowed_origins: ["https://app.example.com", "https://preview.example.com"]
          })
        );

        return jsonResponse(201, {
          token: createProjectToken({
            token_id: "proj_tok_456",
            label: "CI deploy",
            allowed_origins: ["https://app.example.com", "https://preview.example.com"],
            plaintext: "dbundle_proj_secret_123"
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/tokens"]} />);

    expect(await screen.findByText(/production ingest/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create project token/i }));
    await user.type(await screen.findByLabelText(/token label/i), "CI deploy");
    await user.type(
      screen.getByLabelText(/allowed browser origins/i),
      "https://app.example.com\nhttps://preview.example.com"
    );
    await user.click(screen.getByRole("button", { name: /^create token$/i }));

    const revealRegion = await screen.findByRole("region", { name: /new token secret/i });
    expect(within(revealRegion).getByText(/dbundle_proj_secret_123/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/ci deploy/i)).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        /browser origins: https:\/\/app\.example\.com, https:\/\/preview\.example\.com/i
      )
    ).toBeInTheDocument();
  });

  it("revokes a project token from the project tokens page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/tokens") && init?.method === undefined) {
        return jsonResponse(200, {
          tokens: [createProjectToken()]
        });
      }

      if (
        url.endsWith("/v1/projects/proj_123/tokens/proj_tok_123/revoke") &&
        init?.method === "POST"
      ) {
        expect(init.credentials).toBe("include");
        return jsonResponse(200, { success: true });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/tokens"]} />);

    expect(await screen.findByText(/production ingest/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^revoke$/i }));
    await user.click(await screen.findByRole("button", { name: /revoke token/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/tokens/proj_tok_123/revoke") &&
            init?.method === "POST"
        )
      ).toBe(true);
    });

    expect(await screen.findByText(/project token revoked successfully/i)).toBeInTheDocument();
    expect(screen.queryByText(/production ingest/i)).toBeNull();
  });

  it("shows the project token empty state with a create action", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/tokens") && init?.method === undefined) {
        return jsonResponse(200, {
          tokens: []
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/tokens"]} />);

    expect(await screen.findByText(/no project tokens yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/connect an sdk or environment-specific deploy flow/i)
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /create project token/i }).length).toBe(2);
  });

  it("renders used project tokens without the never-used placeholder", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/tokens") && init?.method === undefined) {
        return jsonResponse(200, {
          tokens: [createProjectToken({ last_used_at: "2026-04-20T11:56:12.000Z" })]
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/tokens"]} />);

    expect(await screen.findByText(/production ingest/i)).toBeInTheDocument();
    expect(screen.queryByText(/^never$/i)).toBeNull();
  });
});
