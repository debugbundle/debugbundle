// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

describe("dashboard metrics", () => {
  it("renders the dashboard when projects are returned without metrics", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(404, { error: "billing_not_found" });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [
            {
              project_id: "proj_123",
              organization_id: "org_123",
              name: "Main App",
              slug: "main-app",
              environment_default: "production",
              plan: "free",
              created_at: "2026-03-17T00:00:00.000Z",
              updated_at: "2026-03-17T00:00:00.000Z"
            }
          ]
        });
      }

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    expect(await screen.findByText(/main app/i)).toBeInTheDocument();

    const mainAppRow = screen.getByText(/main app/i).closest("tr");
    expect(mainAppRow).not.toBeNull();
    expect(within(mainAppRow as HTMLTableRowElement).getAllByText(/^0$/)).toHaveLength(3);
    expect(await screen.findByText(/no incidents today/i)).toBeInTheDocument();
  });
});
