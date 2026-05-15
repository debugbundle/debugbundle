// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

function expectSelectTrigger(element: HTMLElement): HTMLButtonElement {
  expect(element).toBeInstanceOf(HTMLButtonElement);
  return element as HTMLButtonElement;
}

function expectButton(element: HTMLElement): HTMLButtonElement {
  expect(element).toBeInstanceOf(HTMLButtonElement);
  return element as HTMLButtonElement;
}

async function findSelectTrigger(label: RegExp | string): Promise<HTMLButtonElement> {
  return expectSelectTrigger(await screen.findByLabelText(label));
}

async function openSelect(label: RegExp | string): Promise<HTMLButtonElement> {
  const trigger = await findSelectTrigger(label);
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
  return trigger;
}

async function chooseSelectOption(
  user: ReturnType<typeof userEvent.setup>,
  label: RegExp | string,
  optionName: RegExp | string
): Promise<void> {
  await openSelect(label);
  await user.click(await screen.findByRole("option", { name: optionName }));
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

    const presetSelect = await findSelectTrigger(/^preset$/i);
    await findSelectTrigger(/^request events$/i);
    await findSelectTrigger(/^client error incidents$/i);
    const saveButton = expectButton(screen.getByRole("button", { name: /save capture policy/i }));

    await waitFor(() => {
      expect(presetSelect).toHaveTextContent(/^balanced$/i);
      expect(saveButton).toBeDisabled();
    });

    await openSelect(/^client error incidents$/i);
    expect(await screen.findByRole("option", { name: /^use preset default \(none\)$/i })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });

    await chooseSelectOption(user, /^preset$/i, /^investigative$/i);
    await chooseSelectOption(user, /^request events$/i, /^filtered request events$/i);
    await chooseSelectOption(user, /^client error incidents$/i, /^recommended for interactive apps$/i);

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
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
      expect(saveButton).toBeDisabled();
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
          projects: [createProject({ relationship: "shared", effective_role: "member", organization_plan: "free" })]
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
    expect(screen.getByText(/only project owners and admins can change capture settings/i)).toBeInTheDocument();

    const presetSelect = await findSelectTrigger(/^preset$/i);
    const requestSelect = await findSelectTrigger(/^request events$/i);
    const clientErrorSelect = await findSelectTrigger(/^client error incidents$/i);

    expect(presetSelect).toBeDisabled();
    expect(requestSelect).toBeDisabled();
    expect(clientErrorSelect).toBeDisabled();
    expect(screen.queryByRole("button", { name: /save capture policy/i })).toBeNull();
  });

  it("lets shared project admins update capture policy without owner session role", async () => {
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
          projects: [createProject({ relationship: "shared", effective_role: "admin", organization_plan: "team" })]
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
          preset: "balanced",
          capture_logs: null,
          capture_request_events: "all",
          capture_breadcrumbs: null,
          capture_probe_events: null,
          immediate_client_error_statuses: null
        }));

        return jsonResponse(200, {
          policy: {
            preset: "balanced",
            capture_logs: "warning",
            capture_request_events: "all",
            capture_breadcrumbs: "exception_only",
            capture_probe_events: "buffer_only",
            immediate_client_error_statuses: []
          },
          overrides: {
            capture_logs: null,
            capture_request_events: "all",
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

    const requestSelect = await findSelectTrigger(/^request events$/i);
    const saveButton = expectButton(await screen.findByRole("button", { name: /save capture policy/i }));

    expect(requestSelect).toBeEnabled();
    expect(saveButton).toBeDisabled();

    await chooseSelectOption(user, /^request events$/i, /^all request events$/i);

    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });

    await user.click(saveButton);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, requestInit]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/capture-policy") && requestInit?.method === "PATCH"
        )
      ).toBe(true);
    });
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

    await findSelectTrigger(/^client error incidents$/i);
    const saveButton = expectButton(screen.getByRole("button", { name: /save capture policy/i }));

    await chooseSelectOption(user, /^client error incidents$/i, /^none$/i);

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });

    await user.click(saveButton);

    await waitFor(() => {
      expect(saveButton).toBeDisabled();
    });

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    const reloadedClientErrorSelect = expectSelectTrigger(
      await screen.findAllByLabelText(/^client error incidents$/i).then((elements) => elements.at(-1)!)
    );
    await waitFor(() => {
      expect(reloadedClientErrorSelect).toHaveTextContent(/^none$/i);
    });
  });
});
