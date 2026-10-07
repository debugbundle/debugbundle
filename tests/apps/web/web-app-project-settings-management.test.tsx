// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";
import { chooseSelectOption } from "./helpers/management-ui.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

describe("project settings management", () => {
  it("shows project settings details, install-guidance framing, and destructive-actions structure", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ role: "member" })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ relationship: "shared", effective_role: "admin" })]
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    await waitFor(() => {
      expect(screen.getAllByText(/main-app/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/production/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit project/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /delete project/i })).toBeDisabled();
  });

  it("deletes a project from the project settings destructive action", async () => {
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

      if (url.endsWith("/v1/projects/proj_123") && init?.method === "DELETE") {
        expect(init.credentials).toBe("include");

        return jsonResponse(200, {
          project: {
            project_id: "proj_123",
            organization_id: "org_123",
            name: "Main App",
            slug: "main-app",
            environment_default: "production",
            plan: "free",
            created_at: "2026-03-17T00:00:00.000Z",
            updated_at: "2026-03-17T00:00:00.000Z"
          }
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    const deleteButton = await screen.findByRole("button", { name: /delete project/i });
    expect(deleteButton).toBeEnabled();

    await user.click(deleteButton);
    const confirmationDialog = await screen.findByRole("alertdialog");
    const confirmationInput = within(confirmationDialog).getByLabelText(/confirmation phrase/i);
    const confirmDeleteButton = within(confirmationDialog).getByRole("button", {
      name: /^delete project$/i
    });

    expect(confirmDeleteButton).toBeDisabled();

    await user.type(confirmationInput, "delete Main App");
    expect(confirmDeleteButton).toBeEnabled();

    await user.click(confirmDeleteButton);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123") && init?.method === "DELETE"
        )
      ).toBe(true);
    });

    expect(await screen.findByRole("heading", { name: /projects/i, level: 1 })).toBeInTheDocument();
  });

  it("updates project details from the project settings modal", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ role: "member" })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ relationship: "shared", effective_role: "admin" })]
        });
      }

      if (url.endsWith("/v1/projects/proj_123") && init?.method === "PATCH") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(
          JSON.stringify({
            name: "Main API",
            slug: "main-api",
            environment_default: "preview",
            color_tag: "amber"
          })
        );

        return jsonResponse(200, {
          project: createProject({
            name: "Main API",
            slug: "main-api",
            environment_default: "preview",
            color_tag: "amber",
            updated_at: "2026-03-18T00:00:00.000Z"
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    await user.click(await screen.findByRole("button", { name: /edit project/i }));
    expect((await screen.findByRole("dialog")).className.includes("sm:max-w-2xl")).toBe(true);
    await user.clear(await screen.findByLabelText(/project name/i));
    await user.type(screen.getByLabelText(/project name/i), "Main API");
    await user.clear(screen.getByLabelText(/project slug/i));
    await user.type(screen.getByLabelText(/project slug/i), "main-api");
    await chooseSelectOption(user, /default environment/i, /^custom$/i);
    await user.type(screen.getByLabelText(/custom environment/i), "preview");
    await user.click(screen.getByRole("button", { name: /set color tag to amber/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123") && init?.method === "PATCH"
        )
      ).toBe(true);
    });

    expect((await screen.findAllByText(/^main api$/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/^main-api$/i)).toBeInTheDocument();
    expect(screen.getByText(/^preview$/i)).toBeInTheDocument();
  });

  it("clears a project color tag from the project settings modal", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ role: "member" })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [
            createProject({ relationship: "shared", effective_role: "admin", color_tag: "rose" })
          ]
        });
      }

      if (url.endsWith("/v1/projects/proj_123") && init?.method === "PATCH") {
        expect(init.body).toBe(JSON.stringify({ color_tag: null }));

        return jsonResponse(200, {
          project: createProject({
            color_tag: null,
            updated_at: "2026-03-18T00:00:00.000Z"
          })
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    await user.click(await screen.findByRole("button", { name: /edit project/i }));
    expect(await screen.findByRole("button", { name: /clear color tag/i })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    await user.click(screen.getByRole("button", { name: /clear color tag/i }));
    expect(screen.getByRole("button", { name: /clear color tag/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, requestInit]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123") && requestInit?.method === "PATCH"
        )
      ).toBe(true);
    });

    expect(document.querySelector('[data-project-color-tag="rose"]')).toBeNull();
  });

  it("links into project settings from the projects management table", async () => {
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

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects"]} />);

    expect(await screen.findByRole("heading", { name: /projects/i, level: 1 })).toBeInTheDocument();

    // Click the project row to navigate to project overview, then use tabs
    const mainAppRow = (await screen.findByText(/^main app$/i)).closest("tr");
    expect(mainAppRow).not.toBeNull();
    await user.click(mainAppRow as HTMLTableRowElement);

    await user.click(await screen.findByRole("tab", { name: /settings/i }));

    expect(
      await screen.findByRole("heading", { name: /capture policy/i, level: 3 })
    ).toBeInTheDocument();
  });
});
