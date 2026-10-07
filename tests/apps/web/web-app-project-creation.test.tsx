// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
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
import { chooseSelectOption } from "./helpers/management-ui.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

describe("project creation", () => {
  it("creates a project and opens its overview directly", async () => {
    const user = userEvent.setup();
    const existingProject = createProject({
      metrics: {
        monthly_bundle_requests: 12,
        monthly_raw_ingested_events: 120,
        retained_bundles: 6,
        monthly_alert_deliveries: 4
      }
    });
    let projects = [existingProject];

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.headers).toEqual({
          "Content-Type": "application/json",
          "X-CSRF-Token": "csrf-token-123"
        });
        expect(init.body).toBe(
          JSON.stringify({
            name: "Ops API",
            slug: "ops-api",
            environment_default: "staging",
            color_tag: "blue",
            weekly_report_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
          })
        );

        const createdProject = createProject({
          project_id: "proj_456",
          name: "Ops API",
          slug: "ops-api",
          environment_default: "staging",
          color_tag: "blue"
        });
        projects = [existingProject, createdProject];

        return jsonResponse(201, {
          project: createdProject
        });
      }

      if (url.includes("/v1/incidents") && url.includes("project_id=proj_456")) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      if (url.endsWith("/v1/projects/proj_123/tokens") && init?.method === undefined) {
        return jsonResponse(200, {
          tokens: [createProjectToken()]
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects"]} />);

    expect(await screen.findByRole("heading", { name: /projects/i, level: 1 })).toBeInTheDocument();
    expect(await screen.findByText(/main app/i)).toBeInTheDocument();
    const mainAppRow = screen.getByText(/main app/i).closest("tr");
    expect(mainAppRow).not.toBeNull();
    expect(within(mainAppRow as HTMLTableRowElement).getByText("12")).toBeInTheDocument();
    expect(within(mainAppRow as HTMLTableRowElement).getByText("120")).toBeInTheDocument();

    const createProjectButton = within(screen.getByRole("banner")).getByRole("button", {
      name: /create project/i
    });
    await user.click(createProjectButton);
    expect((await screen.findByRole("dialog")).className.includes("sm:max-w-2xl")).toBe(true);
    await user.type(await screen.findByLabelText(/project name/i), "Ops API");
    expect(screen.getByLabelText(/project slug/i)).toHaveValue("ops-api");
    await chooseSelectOption(user, /default environment/i, /^staging$/i);
    await user.click(screen.getByRole("button", { name: /set color tag to blue/i }));
    await user.click(screen.getByRole("button", { name: /^create project$/i }));

    expect(await screen.findByText(/project details/i)).toBeInTheDocument();
    expect(screen.getByText(/^ops-api$/i)).toBeInTheDocument();
    expect(screen.getByText(/^staging$/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /tokens/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /set up project/i })).not.toBeInTheDocument();
  });

  it("keeps manual slug edits and supports a custom default environment when creating a project", async () => {
    const user = userEvent.setup();
    const existingProject = createProject({
      metrics: {
        monthly_bundle_requests: 4,
        monthly_raw_ingested_events: 40,
        retained_bundles: 2,
        monthly_alert_deliveries: 1
      }
    });
    let projects = [existingProject];

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === "POST") {
        expect(init.body).toBe(
          JSON.stringify({
            name: "Ops Platform",
            slug: "ops-control-plane",
            environment_default: "preview",
            color_tag: null,
            weekly_report_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
          })
        );

        const createdProject = createProject({
          project_id: "proj_789",
          name: "Ops Platform",
          slug: "ops-control-plane",
          environment_default: "preview"
        });
        projects = [existingProject, createdProject];

        return jsonResponse(201, {
          project: createdProject
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects"]} />);

    await screen.findByRole("heading", { name: /projects/i, level: 1 });

    await user.click(screen.getByRole("button", { name: /create project/i }));
    await user.type(await screen.findByLabelText(/project name/i), "Ops API");
    expect(screen.getByLabelText(/project slug/i)).toHaveValue("ops-api");

    await user.clear(screen.getByLabelText(/project slug/i));
    await user.type(screen.getByLabelText(/project slug/i), "ops-control-plane");
    await user.clear(screen.getByLabelText(/project name/i));
    await user.type(screen.getByLabelText(/project name/i), "Ops Platform");

    expect(screen.getByLabelText(/project slug/i)).toHaveValue("ops-control-plane");

    await chooseSelectOption(user, /default environment/i, /^custom$/i);
    await user.type(screen.getByLabelText(/custom environment/i), "preview");
    await user.click(screen.getByRole("button", { name: /^create project$/i }));

    expect(await screen.findByText(/project details/i)).toBeInTheDocument();
    expect(screen.getByText(/^ops-control-plane$/i)).toBeInTheDocument();
    expect(screen.getByText(/^preview$/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /set up project/i })).not.toBeInTheDocument();
  });

  it("keeps the project create dialog open and shows an error when project creation fails", async () => {
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

      if (url.endsWith("/v1/projects") && init?.method === "POST") {
        return jsonResponse(500, { error: "project_create_failed" });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects"]} />);

    await screen.findByRole("heading", { name: /projects/i, level: 1 });
    await user.click(screen.getByRole("button", { name: /create project/i }));
    await user.type(await screen.findByLabelText(/project name/i), "Broken Project");
    await user.type(screen.getByLabelText(/project slug/i), "broken-project");
    await user.click(screen.getByRole("button", { name: /^create project$/i }));

    expect(await screen.findByText(/could not create project/i)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
