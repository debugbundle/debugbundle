// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

describe("web app - project settings layout", () => {
  it("renders reusable collapsed settings sections and places weekly reports before project details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((request: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(request);

        if (url.endsWith("/v1/auth/session")) {
          return jsonResponse(200, { session: createSession({ organization_plan: "team" }) });
        }
        if (url.endsWith("/v1/projects") && init?.method === undefined) {
          return jsonResponse(200, {
            projects: [createProject({ organization_plan: "team" })]
          });
        }

        return jsonResponse(404, { error: "not_found" });
      })
    );

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    const sectionNames = [
      "Capture policy",
      "Capture rules",
      "Improvement bundles",
      "Product analytics",
      "Weekly reports"
    ];
    const triggers = await Promise.all(
      sectionNames.map((name) => screen.findByRole("button", { name }))
    );

    for (const trigger of triggers) {
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    }

    for (let index = 0; index < triggers.length - 1; index += 1) {
      const currentTrigger = triggers[index];
      const nextTrigger = triggers[index + 1];
      if (currentTrigger === undefined || nextTrigger === undefined) {
        throw new Error("Expected every settings section trigger to be present.");
      }
      expect(
        currentTrigger.compareDocumentPosition(nextTrigger) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }

    const projectDetails = screen.getByRole("heading", { name: "Project details", level: 3 });
    const destructiveActions = screen.getByRole("heading", {
      name: "Destructive actions",
      level: 3
    });
    const weeklyReportsTrigger = triggers[4];
    if (weeklyReportsTrigger === undefined) {
      throw new Error("Expected the Weekly reports settings section to be present.");
    }
    expect(
      weeklyReportsTrigger.compareDocumentPosition(projectDetails) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    const primaryColumn = triggers[0]?.closest('[data-slot="collapsible"]')?.parentElement;
    const settingsLayout = primaryColumn?.parentElement;
    const secondaryColumn = projectDetails.closest('[data-slot="card"]')?.parentElement;
    expect(settingsLayout).toHaveClass(
      "xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
      "xl:items-start"
    );
    expect(secondaryColumn).not.toBe(primaryColumn);
    expect(secondaryColumn?.parentElement).toBe(settingsLayout);
    expect(destructiveActions.closest('[data-slot="card"]')?.parentElement).toBe(secondaryColumn);
  });
});
