// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import {
  createBillingSummary,
  createProject,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

describe("organization navigation", () => {
  it("redirects the retired organization route back to projects", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [
            createProject(),
            createProject({
              project_id: "proj_456",
              name: "Worker",
              slug: "worker",
              relationship: "shared",
              sharing_state: "shared_by_you"
            })
          ]
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "team",
            active_projects: 2,
            capacity_units: {
              total: 17,
              included: 15,
              additional_purchased: 2,
              pending_reduction: null
            }
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/organization"]} />);

    expect(await screen.findByRole("heading", { name: /projects/i, level: 1 })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /organization/i, level: 1 })
    ).not.toBeInTheDocument();
  });

  it("does not show an organization entry in the app sidebar", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ role: "member" })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject()]
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(403, { error: "forbidden" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects"]} />);

    await screen.findByRole("heading", { name: /projects/i, level: 1 });
    expect(screen.queryByRole("link", { name: /^organization$/i })).not.toBeInTheDocument();
  });

  it("keeps the organization entry hidden outside the Team tier as well", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ organization_plan: "free" })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ organization_plan: "free" })]
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(403, { error: "forbidden" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/organization"]} />);

    expect(await screen.findByRole("heading", { name: /projects/i, level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^organization$/i })).not.toBeInTheDocument();
  });
});
