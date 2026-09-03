// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { isOpenAiPluginPreviewEnabled } from "../../../apps/web/src/lib/openai-plugin-preview-gate.ts";
import {
  OPENAI_PLUGIN_PREVIEW_STATES,
  OPENAI_PLUGIN_PREVIEW_VIEWPORTS,
  getOpenAiPreviewScopes
} from "../../../apps/web/src/lib/openai-plugin-previews.ts";
import { jsonResponse, requestUrl } from "./web-test-helpers.js";

const PREVIEW_MATRIX = JSON.parse(
  readFileSync(
    join(process.cwd(), "tests/fixtures/openai-plugin-v1/ui-preview-matrix.json"),
    "utf8"
  )
) as {
  surfaces: typeof OPENAI_PLUGIN_PREVIEW_STATES;
  scope_sets: number;
  viewports: Array<{ id: string; label: string; width: number; height: number }>;
  production_available: boolean;
};

if (typeof HTMLElement !== "undefined") {
  HTMLElement.prototype.hasPointerCapture ??= () => false;
  HTMLElement.prototype.setPointerCapture ??= () => {};
  HTMLElement.prototype.releasePointerCapture ??= () => {};
}

afterEach(() => {
  cleanup();
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPreview(query: string): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => jsonResponse(401, { error: "invalid_session" }));
  vi.stubGlobal("fetch", fetchMock);
  const search = query.includes("embedded=") ? query : `embedded=1&${query}`;
  render(<App initialEntries={[`/__dev/openai-plugin?${search}`]} />);
  return fetchMock;
}

function expectNoPreviewApiCalls(fetchMock: ReturnType<typeof vi.fn>): void {
  expect(
    fetchMock.mock.calls.some(([input]) => {
      const url = requestUrl(input as RequestInfo | URL);
      return url.includes("/oauth/") || url.includes("/v1/openai/connections");
    })
  ).toBe(false);
}

describe("web app - OpenAI plugin synthetic preview", () => {
  it("requires an explicit development opt-in and can never enable in production", () => {
    expect(
      isOpenAiPluginPreviewEnabled({
        DEV: true,
        MODE: "development",
        VITE_OPENAI_PLUGIN_PREVIEW: "true"
      })
    ).toBe(true);
    expect(
      isOpenAiPluginPreviewEnabled({
        DEV: true,
        MODE: "development",
        VITE_OPENAI_PLUGIN_PREVIEW: "false"
      })
    ).toBe(false);
    expect(
      isOpenAiPluginPreviewEnabled({
        DEV: false,
        MODE: "production",
        VITE_OPENAI_PLUGIN_PREVIEW: "true"
      })
    ).toBe(false);
    expect(
      isOpenAiPluginPreviewEnabled({
        DEV: false,
        MODE: "test"
      })
    ).toBe(true);
  });

  it("defines the complete review matrix and three real iframe viewport widths", () => {
    expect(OPENAI_PLUGIN_PREVIEW_STATES).toEqual({
      consent: [
        "default",
        "loading",
        "expired",
        "unavailable",
        "retryable",
        "allow-processing",
        "deny-processing"
      ],
      reviewer: ["default", "error", "rate-limit"],
      settings: ["empty", "active", "expired", "revoked", "confirmation"]
    });
    expect(OPENAI_PLUGIN_PREVIEW_VIEWPORTS.map(({ width }) => width)).toEqual([390, 768, 1280]);
    expect(OPENAI_PLUGIN_PREVIEW_STATES).toEqual(PREVIEW_MATRIX.surfaces);
    expect(OPENAI_PLUGIN_PREVIEW_VIEWPORTS).toEqual(PREVIEW_MATRIX.viewports);
    expect(PREVIEW_MATRIX.production_available).toBe(false);
  });

  it("makes all 64 product-scope selections deterministic and inspectable", () => {
    const combinations = Array.from({ length: PREVIEW_MATRIX.scope_sets }, (_, mask) =>
      getOpenAiPreviewScopes(mask)
    );
    expect(new Set(combinations.map((scopes) => scopes.join("|")))).toHaveLength(
      PREVIEW_MATRIX.scope_sets
    );
    expect(combinations[0]).toEqual([]);
    expect(combinations[63]).toHaveLength(6);
  });

  it.each([
    ["loading", /loading authorization request/i],
    ["expired", /invalid or has expired/i],
    ["unavailable", /unavailable right now/i],
    ["retryable", /could not save your decision/i]
  ])("renders the consent %s state", async (state, expectedCopy) => {
    renderPreview(`surface=consent&state=${state}&scope_set=63`);
    expect(await screen.findByText(expectedCopy)).toBeInTheDocument();
  });

  it.each([
    ["allow-processing", /allowing access/i],
    ["deny-processing", /denying access/i]
  ])("renders the consent %s action state without issuing a request", async (state, actionName) => {
    renderPreview(`surface=consent&state=${state}&scope_set=63`);
    expect(await screen.findByRole("button", { name: actionName })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: state.startsWith("allow") ? /^deny$/i : /allow access/i })
    ).toBeDisabled();
  });

  it.each(Array.from({ length: 64 }, (_, mask) => [mask]))(
    "renders scope selection %i/63 in the production consent controls",
    async (mask) => {
      renderPreview(`surface=consent&state=default&scope_set=${mask}`);
      const checkboxes = await screen.findAllByRole("checkbox");
      expect(checkboxes).toHaveLength(6);
      expect(checkboxes.map((checkbox) => checkbox.getAttribute("data-state"))).toEqual(
        Array.from({ length: 6 }, (_, index) =>
          (mask & (1 << index)) !== 0 ? "checked" : "unchecked"
        )
      );
    }
  );

  it("normalizes malformed preview parameters to bounded defaults", async () => {
    renderPreview("embedded=0&surface=unknown&state=unknown&viewport=unknown&scope_set=-1");

    const frame = await screen.findByTitle(/consent default desktop preview/i);
    expect(frame).toHaveAttribute(
      "src",
      "/__dev/openai-plugin?embedded=1&surface=consent&state=default&viewport=desktop&scope_set=63"
    );
  });

  it.each([
    ["default", null],
    ["error", /could not verify the review credential/i],
    ["rate-limit", /too many attempts\. wait 30 seconds/i]
  ])("renders the reviewer %s state", async (state, expectedCopy) => {
    renderPreview(`surface=reviewer&state=${state}`);
    expect(
      await screen.findByRole("heading", { name: /openai review access/i })
    ).toBeInTheDocument();
    if (expectedCopy !== null) {
      expect(screen.getByRole("alert")).toHaveTextContent(expectedCopy);
    }
  });

  it.each([
    ["empty", /no openai connections/i],
    ["active", /active/i],
    ["expired", /expired/i],
    ["revoked", /revoked/i]
  ])("renders the Settings %s state", async (state, expectedCopy) => {
    renderPreview(`surface=settings&state=${state}`);
    const section = (await screen.findByRole("heading", { name: /openai connections/i })).closest(
      "section"
    );
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getAllByText(expectedCopy).length).toBeGreaterThan(0);
  });

  it("opens the real revocation confirmation in the Settings confirmation state", async () => {
    renderPreview("surface=settings&state=confirmation");
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      /this stops chatgpt and codex from using this connection/i
    );
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/does not delete debugbundle data/i);
  });

  it("uses the real consent controls for interactive scope and processing inspection", async () => {
    const user = userEvent.setup();
    const fetchMock = renderPreview("surface=consent&state=default&scope_set=63");

    await user.click(await screen.findByRole("checkbox", { name: /see projects available/i }));
    expect(screen.getByRole("checkbox", { name: /see projects available/i })).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: /allow access/i }));
    expect(screen.getByRole("button", { name: /allowing access/i })).toBeDisabled();
    expectNoPreviewApiCalls(fetchMock);
  });

  it("clears synthetic reviewer input without submitting a credential", async () => {
    const user = userEvent.setup();
    const fetchMock = renderPreview("surface=reviewer&state=default");
    const credential = await screen.findByLabelText(/review credential/i);

    await user.type(credential, "synthetic-review-credential-with-enough-characters");
    await user.click(screen.getByRole("button", { name: /continue to synthetic review project/i }));

    expect(credential).toHaveValue("");
    expect(
      screen.getByRole("button", { name: /continue to synthetic review project/i })
    ).toBeDisabled();
    expectNoPreviewApiCalls(fetchMock);
  });

  it("simulates confirmed revocation in memory without calling the connections API", async () => {
    const user = userEvent.setup();
    const fetchMock = renderPreview("surface=settings&state=active");

    await user.click((await screen.findAllByRole("button", { name: /revoke access/i }))[0]!);
    await user.click(screen.getByRole("button", { name: /^revoke access$/i }));

    expect(await screen.findAllByText("Revoked")).toHaveLength(2);
    expectNoPreviewApiCalls(fetchMock);
  });

  it("builds a shareable responsive frame without nesting the preview controller", async () => {
    renderPreview("surface=settings&state=active&viewport=mobile&embedded=0");

    const frame = await screen.findByTitle(/settings active mobile preview/i);
    expect(frame).toHaveStyle({ width: "390px" });
    expect(frame).toHaveAttribute(
      "src",
      "/__dev/openai-plugin?embedded=1&surface=settings&state=active&viewport=mobile&scope_set=63"
    );
  });

  it("exposes all scope sets and keeps controller changes in the shareable URL", async () => {
    const user = userEvent.setup();
    renderPreview("surface=consent&state=default&viewport=desktop&scope_set=63&embedded=0");

    const scopeTrigger = await screen.findByRole("combobox", { name: /scope selection/i });
    scopeTrigger.focus();
    fireEvent.keyDown(scopeTrigger, { key: "ArrowDown", code: "ArrowDown" });
    expect(await screen.findAllByRole("option")).toHaveLength(64);
    expect(screen.getByRole("option", { name: /^64\/64/i })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("tab", { name: "Mobile" }));
    const frame = await screen.findByTitle(/consent default mobile preview/i);
    expect(frame).toHaveStyle({ width: "390px" });
    expect(frame).toHaveAttribute(
      "src",
      "/__dev/openai-plugin?embedded=1&surface=consent&state=default&viewport=mobile&scope_set=63"
    );
  });
});
