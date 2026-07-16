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

async function findSelectTrigger(label: RegExp | string): Promise<HTMLButtonElement> {
  return expectSelectTrigger(await screen.findByLabelText(label));
}

async function openSelect(label: RegExp | string): Promise<HTMLButtonElement> {
  const trigger = await findSelectTrigger(label);
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
  return trigger;
}

async function openImprovementSettings(): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: "Improvement bundles" }));
}

describe("web app — project improvement settings", () => {
  it("lets owners update improvement settings from the project settings page", async () => {
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
          access_mode: "manage",
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

      if (
        url.endsWith("/v1/projects/proj_123/improvement-settings") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          access_mode: "manage",
          cloud_automation_available: true,
          settings: {
            automated_improvement_bundles_enabled: true,
            improvement_bundle_sensitivity: "balanced"
          }
        });
      }

      if (url.endsWith("/v1/projects/proj_123/improvement-settings") && init?.method === "PATCH") {
        expect(init.body).toBe(
          JSON.stringify({
            automated_improvement_bundles_enabled: false,
            improvement_bundle_sensitivity: "verbose"
          })
        );

        return jsonResponse(200, {
          access_mode: "manage",
          cloud_automation_available: true,
          settings: {
            automated_improvement_bundles_enabled: false,
            improvement_bundle_sensitivity: "verbose"
          }
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);
    await openImprovementSettings();

    expect(
      await screen.findByRole("heading", { name: /^improvement bundles$/i, level: 3 })
    ).toBeInTheDocument();

    const enabledSwitch = document.getElementById(
      "project-improvement-bundles-enabled"
    ) as HTMLButtonElement | null;
    await findSelectTrigger(/sensitivity/i);
    const saveButton = await screen.findByRole("button", { name: /save improvement settings/i });

    expect(enabledSwitch).not.toBeNull();
    const improvementEnabledSwitch = enabledSwitch as HTMLButtonElement;

    expect(improvementEnabledSwitch).toHaveAttribute("aria-checked", "true");
    expect(saveButton).toBeDisabled();
    expect(
      screen.getByText(/create improvement bundles from recurring project signals/i)
    ).toBeInTheDocument();

    await openSelect(/sensitivity/i);
    await user.click(await screen.findByRole("option", { name: /verbose/i }));
    await user.click(improvementEnabledSwitch);

    await waitFor(() => {
      expect(screen.queryByLabelText(/sensitivity/i)).toBeNull();
    });

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });

    await user.click(saveButton);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([request, requestInit]) =>
            requestUrl(request).endsWith("/v1/projects/proj_123/improvement-settings") &&
            requestInit?.method === "PATCH"
        )
      ).toBe(true);
    });
  });

  it("shows upgrade guidance for free-tier projects", async () => {
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

      if (url.endsWith("/v1/projects/proj_123/capture-policy") && init?.method === undefined) {
        return jsonResponse(200, {
          access_mode: "manage",
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

      if (
        url.endsWith("/v1/projects/proj_123/improvement-settings") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          access_mode: "manage",
          cloud_automation_available: false,
          settings: {
            automated_improvement_bundles_enabled: true,
            improvement_bundle_sensitivity: "balanced"
          }
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);
    await openImprovementSettings();

    expect(
      await screen.findByRole("heading", { name: /^improvement bundles$/i, level: 3 })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /upgrade to solo or team to unlock hosted improvements/i
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open billing/i })).toHaveAttribute("href", "/billing");
    expect(document.getElementById("project-improvement-bundles-enabled")).toBeNull();
    expect(screen.queryByText(/counts toward the existing bundle allowance/i)).toBeNull();
  });

  it("renders capture policy before improvement bundles in project settings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
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
            access_mode: "manage",
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

        if (
          url.endsWith("/v1/projects/proj_123/improvement-settings") &&
          init?.method === undefined
        ) {
          return jsonResponse(200, {
            access_mode: "manage",
            cloud_automation_available: true,
            settings: {
              automated_improvement_bundles_enabled: true,
              improvement_bundle_sensitivity: "balanced"
            }
          });
        }

        return jsonResponse(404, { error: "not_found" });
      })
    );

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    const capturePolicyHeading = await screen.findByRole("heading", {
      name: /capture policy/i,
      level: 3
    });
    const improvementHeading = await screen.findByRole("heading", {
      name: /^improvement bundles$/i,
      level: 3
    });

    expect(
      capturePolicyHeading.compareDocumentPosition(improvementHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
