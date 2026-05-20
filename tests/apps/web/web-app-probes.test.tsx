// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

interface ProbeActivationRecord {
  activation_id: string;
  label_pattern: string;
  service: string;
  environment: string;
  expires_at: string;
  trigger_expires_at: string;
}

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

function createProbeActivation(
  overrides: Partial<ProbeActivationRecord> = {}
): ProbeActivationRecord {
  return {
    activation_id: "00000000-0000-4000-8000-000000000123",
    label_pattern: "checkout.*",
    service: "checkout-api",
    environment: "production",
    expires_at: "2026-05-20T12:05:00.000Z",
    trigger_expires_at: "2026-05-21T12:00:00.000Z",
    ...overrides
  };
}

describe("web app — project probes", () => {
  it("lets paid projects activate and deactivate remote probes", async () => {
    const user = userEvent.setup();
    let activations: ProbeActivationRecord[] = [];
    const createdActivation = createProbeActivation({
      activation_id: "00000000-0000-4000-8000-000000000456",
      label_pattern: "auth.*",
      service: "*"
    });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ organization_plan: "solo" })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [createProject({ organization_plan: "solo" })]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/probes") && init?.method === undefined) {
        return jsonResponse(200, { activations });
      }

      if (url.endsWith("/v1/projects/proj_123/probes/activate") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.headers).toEqual({
          "Content-Type": "application/json",
          "X-CSRF-Token": "csrf-token-123"
        });
        expect(init.body).toBe(
          JSON.stringify({
            label_pattern: "auth.*",
            service: "*",
            environment: "production",
            ttl_seconds: 300,
            trigger_ttl_seconds: 86400
          })
        );

        activations = [createdActivation];

        return jsonResponse(201, {
          activation: createdActivation,
          trigger_token: "dbundle_probe_created_once"
        });
      }

      if (url.endsWith("/v1/projects/proj_123/probes/deactivate") && init?.method === "POST") {
        expect(init.credentials).toBe("include");
        expect(init.body).toBe(JSON.stringify({ activation_id: createdActivation.activation_id }));
        activations = [];

        return jsonResponse(200, { deactivated: createdActivation });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/probes"]} />);

    expect(await screen.findByRole("tab", { name: /probes/i })).toBeInTheDocument();
    expect(await screen.findByText(/no active remote probes/i)).toBeInTheDocument();

    await user.click(
      screen.getAllByRole("button", { name: /activate probe/i })[0] as HTMLButtonElement
    );
    await user.type(await screen.findByLabelText(/label pattern/i), "auth.*");
    await user.click(screen.getByRole("button", { name: /^activate probe$/i }));

    const revealRegion = await screen.findByRole("region", { name: /probe trigger token/i });
    expect(within(revealRegion).getByText(/dbundle_probe_created_once/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/^auth\.\*$/i)).toBeInTheDocument();
    });

    const activationRow = screen.getByText(/^auth\.\*$/i).closest("tr");
    expect(activationRow).not.toBeNull();

    await user.click(
      within(activationRow as HTMLTableRowElement).getByRole("button", { name: /deactivate/i })
    );

    await waitFor(() => {
      expect(screen.queryByText(/^auth\.\*$/i)).toBeNull();
    });
    expect(await screen.findByText(/no active remote probes/i)).toBeInTheDocument();
  });

  it("shows the paid-plan upgrade notice for free projects", async () => {
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

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/probes"]} />);

    expect(
      await screen.findByText(/upgrade to solo or team to activate remote probes/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/always-on probe buffers work on every tier/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /activate probe/i })).toBeNull();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        requestUrl(input).endsWith("/v1/projects/proj_123/probes")
      )
    ).toBe(false);
  });
});
