// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { isSystemEmailReviewEnabled } from "../../../apps/web/src/lib/system-email-previews.ts";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("web app — system email review", () => {
  it("exposes the review route only in dev or test mode", () => {
    expect(isSystemEmailReviewEnabled({ DEV: true, MODE: "development" })).toBe(true);
    expect(isSystemEmailReviewEnabled({ DEV: false, MODE: "test" })).toBe(true);
    expect(isSystemEmailReviewEnabled({ DEV: false, MODE: "production" })).toBe(false);
  });

  it("renders the local owner review surface with implemented operational previews", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (requestUrl(input).endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ role: "owner" })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/__dev/system-emails"]} />);

    expect(await screen.findByRole("heading", { name: /system emails/i })).toBeInTheDocument();
    expect(screen.getByText(/local-only review surface for every email debugbundle currently sends/i)).toBeInTheDocument();
    expect(screen.getAllByText(/email sign-in code/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/webhook auto-disabled/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/your debugbundle sign-in code/i)).toBeInTheDocument();

    const retentionRow = screen.getAllByText(/retention rotation notice/i)[0]?.closest("tr");
    expect(retentionRow).not.toBeNull();

    await user.click(within(retentionRow as HTMLTableRowElement).getByRole("button", { name: /^view$/i }));

    await waitFor(() => {
      expect(screen.getByText(/retained bundles rotated out/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("tab", { name: /html preview/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /mobile view/i })).toBeInTheDocument();
    const desktopPreview = screen.getByTitle(/html desktop preview/i);
    expect(desktopPreview).toBeInTheDocument();
    expect(desktopPreview).toHaveAttribute("srcdoc", expect.stringContaining("<!DOCTYPE html>"));
    expect(desktopPreview).toHaveAttribute("srcdoc", expect.stringContaining("<html lang=\"en\">"));
    expect(desktopPreview).toHaveAttribute("srcdoc", expect.stringContaining("/email/debugbundle-mark.png"));
    expect(desktopPreview).toHaveAttribute("srcdoc", expect.not.stringContaining("app.debugbundle.local/email/debugbundle-mark.png"));
    expect(desktopPreview).toHaveAttribute("srcdoc", expect.not.stringContaining("font-family: Inter, ui-sans-serif"));
    expect(screen.getByRole("button", { name: /send preview email/i })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /mobile view/i }));

    expect(screen.getByTitle(/html mobile preview/i)).toBeInTheDocument();
  });

  it("shows an owner-only gate for member sessions", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (requestUrl(input).endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ role: "member" })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/__dev/system-emails"]} />);

    expect(await screen.findByText(/this local review page is restricted to owners/i)).toBeInTheDocument();
    expect(screen.getByText(/aggregates account, billing, and operational copy in one place/i)).toBeInTheDocument();
  });
});
