// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

function expectSelect(element: HTMLElement): HTMLSelectElement {
  expect(element).toBeInstanceOf(HTMLSelectElement);
  return element as HTMLSelectElement;
}

function expectButton(element: HTMLElement): HTMLButtonElement {
  expect(element).toBeInstanceOf(HTMLButtonElement);
  return element as HTMLButtonElement;
}

describe("web app — project capture policy settings", () => {
  it("lets owners update capture policy from the project settings page", async () => {
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
          projects: [createProject({ organization_plan: "solo" })]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/capture-policy") && init?.method === undefined) {
        return jsonResponse(200, {
          policy: {
            preset: "balanced",
            capture_logs: "warning",
            capture_request_events: "failures_only",
            capture_breadcrumbs: "exception_only",
            capture_probe_events: "buffer_only",
            immediate_client_error_statuses: []
          },
          overrides: {
            capture_logs: null,
            capture_request_events: null,
            capture_breadcrumbs: null,
            capture_probe_events: null,
            immediate_client_error_statuses: null
          }
        });
      }

      if (url.endsWith("/v1/projects/proj_123/capture-policy") && init?.method === "PATCH") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(JSON.stringify({
          preset: "investigative",
          capture_logs: null,
          capture_request_events: "filtered",
          capture_breadcrumbs: null,
          capture_probe_events: null,
          immediate_client_error_statuses: [401, 403, 409, 422]
        }));

        return jsonResponse(200, {
          policy: {
            preset: "investigative",
            capture_logs: "info",
            capture_request_events: "filtered",
            capture_breadcrumbs: "standalone",
            capture_probe_events: "standalone_when_activated",
            immediate_client_error_statuses: [401, 403, 409, 422]
          },
          overrides: {
            capture_logs: null,
            capture_request_events: "filtered",
            capture_breadcrumbs: null,
            capture_probe_events: null,
            immediate_client_error_statuses: [401, 403, 409, 422]
          }
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    const capturePolicyHeading = await screen.findByRole("heading", { name: /capture policy/i, level: 3 });
    const projectDetailsHeading = await screen.findByRole("heading", { name: /project details/i, level: 3 });

    expect(capturePolicyHeading).toBeInTheDocument();
    expect(capturePolicyHeading.compareDocumentPosition(projectDetailsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const presetSelect = expectSelect(screen.getByLabelText(/^preset$/i));
    const requestSelect = expectSelect(screen.getByLabelText(/^request events$/i));
    const clientErrorSelect = expectSelect(screen.getByLabelText(/^client error incidents$/i));
    const saveButton = expectButton(screen.getByRole("button", { name: /save capture policy/i }));

    expect(screen.getByRole("option", { name: /^use preset default \(none\)$/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(presetSelect.value).toBe("balanced");
      expect(saveButton.disabled).toBe(true);
    });

    await user.selectOptions(presetSelect, "investigative");
    await user.selectOptions(requestSelect, "filtered");
    await user.selectOptions(clientErrorSelect, "recommended");

    await waitFor(() => {
      expect(saveButton.disabled).toBe(false);
    });

    await user.click(saveButton);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) => requestUrl(input).endsWith("/v1/projects/proj_123/capture-policy") && init?.method === "PATCH"
        )
      ).toBe(true);
    });

    await waitFor(() => {
      expect(saveButton.disabled).toBe(true);
    });

    expect(screen.getAllByText(/filtered request events/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/recommended \(401, 403, 409, 422\)/i).length).toBeGreaterThan(0);
  });

  it("shows capture policy in read-only mode for members", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ role: "member" })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ organization_plan: "free" })]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/capture-policy") && init?.method === undefined) {
        return jsonResponse(200, {
          policy: {
            preset: "minimal",
            capture_logs: "error",
            capture_request_events: "failures_only",
            capture_breadcrumbs: "local_only",
            capture_probe_events: "buffer_only",
            immediate_client_error_statuses: []
          },
          overrides: {
            capture_logs: null,
            capture_request_events: null,
            capture_breadcrumbs: null,
            capture_probe_events: null,
            immediate_client_error_statuses: null
          }
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    expect(await screen.findByRole("heading", { name: /capture policy/i, level: 3 })).toBeInTheDocument();
    expect(screen.getByText(/only owners can change project capture settings/i)).toBeInTheDocument();

    const presetSelect = expectSelect(screen.getByLabelText(/^preset$/i));
    const requestSelect = expectSelect(screen.getByLabelText(/^request events$/i));
    const clientErrorSelect = expectSelect(screen.getByLabelText(/^client error incidents$/i));

    expect(presetSelect.disabled).toBe(true);
    expect(requestSelect.disabled).toBe(true);
    expect(clientErrorSelect.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /save capture policy/i })).toBeNull();
  });

  it("preserves explicit none for client error incidents after reload", async () => {
    const user = userEvent.setup();
    let savedImmediateClientErrorStatuses: number[] | null = null;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ organization_plan: "team" })]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/capture-policy") && init?.method === undefined) {
        const effectiveImmediateClientErrorStatuses =
          savedImmediateClientErrorStatuses === null
            ? [401, 403, 409, 422]
            : savedImmediateClientErrorStatuses;

        return jsonResponse(200, {
          policy: {
            preset: "investigative",
            capture_logs: "info",
            capture_request_events: "all",
            capture_breadcrumbs: "standalone",
            capture_probe_events: "standalone_when_activated",
            immediate_client_error_statuses: effectiveImmediateClientErrorStatuses
          },
          overrides: {
            capture_logs: null,
            capture_request_events: null,
            capture_breadcrumbs: null,
            capture_probe_events: null,
            immediate_client_error_statuses: savedImmediateClientErrorStatuses
          }
        });
      }

      if (url.endsWith("/v1/projects/proj_123/capture-policy") && init?.method === "PATCH") {
        expect(init.body).toBe(JSON.stringify({
          preset: "investigative",
          capture_logs: null,
          capture_request_events: null,
          capture_breadcrumbs: null,
          capture_probe_events: null,
          immediate_client_error_statuses: []
        }));

        savedImmediateClientErrorStatuses = [];

        return jsonResponse(200, {
          policy: {
            preset: "investigative",
            capture_logs: "info",
            capture_request_events: "all",
            capture_breadcrumbs: "standalone",
            capture_probe_events: "standalone_when_activated",
            immediate_client_error_statuses: []
          },
          overrides: {
            capture_logs: null,
            capture_request_events: null,
            capture_breadcrumbs: null,
            capture_probe_events: null,
            immediate_client_error_statuses: []
          }
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    const clientErrorSelect = expectSelect(await screen.findByLabelText(/^client error incidents$/i));
    const saveButton = expectButton(screen.getByRole("button", { name: /save capture policy/i }));

    await user.selectOptions(clientErrorSelect, "none");

    await waitFor(() => {
      expect(saveButton.disabled).toBe(false);
    });

    await user.click(saveButton);

    await waitFor(() => {
      expect(saveButton.disabled).toBe(true);
    });

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    const reloadedClientErrorSelect = expectSelect(await screen.findAllByLabelText(/^client error incidents$/i).then((elements) => elements.at(-1)!));
    await waitFor(() => {
      expect(reloadedClientErrorSelect.value).toBe("none");
    });
  });
});
