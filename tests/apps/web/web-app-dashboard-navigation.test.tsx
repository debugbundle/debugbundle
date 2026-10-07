// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

describe("dashboard navigation", () => {
  it("opens the create-project dialog directly from the dashboard empty state", async () => {
    const user = userEvent.setup();
    let projects: ReturnType<typeof createProject>[] = [];

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects });
      }

      if (url.endsWith("/v1/projects") && init?.method === "POST") {
        expect(init.body).toBe(
          JSON.stringify({
            name: "First Project",
            slug: "first-project",
            environment_default: "production",
            color_tag: null,
            weekly_report_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
          })
        );

        const createdProject = createProject({
          project_id: "proj_first",
          name: "First Project",
          slug: "first-project"
        });
        projects = [createdProject];

        return jsonResponse(201, {
          project: createdProject
        });
      }

      if (url.includes("/v1/incidents?") && url.includes("project_id=proj_first")) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^create project$/i }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/project name/i), "First Project");
    await user.click(within(dialog).getByRole("button", { name: /^create project$/i }));

    expect(await screen.findByText(/project details/i)).toBeInTheDocument();
    expect(screen.getByText(/^first-project$/i)).toBeInTheDocument();
  });

  it("opens the workspace health status page from the dashboard health-status card", async () => {
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

      if (url.endsWith("/v1/projects/proj_123/availability-checks?limit=100")) {
        return jsonResponse(200, {
          checks: [],
          limits: {
            max_checks_per_project: 1,
            max_monitored_projects_per_organization: 3,
            max_active_checks_per_organization: 3,
            min_interval_seconds: 300,
            recommended_failure_threshold: 3
          }
        });
      }

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    const healthStatusCard = await screen.findByRole("link", { name: /health status today/i });
    await screen.findByText(/^not set$/i);
    expect(healthStatusCard).toHaveTextContent(/not set/i);

    await user.click(healthStatusCard);

    expect(
      await screen.findByRole("heading", { name: /health status/i, level: 1 })
    ).toBeInTheDocument();
    expect(await screen.findByText(/no health checks yet/i)).toBeInTheDocument();
  });
});
