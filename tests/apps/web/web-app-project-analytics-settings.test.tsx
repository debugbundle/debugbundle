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

const defaultSettings = {
  enabled: true,
  privacy_mode: "strict",
  consent_required: true,
  capture_page_views: true,
  capture_route_changes: true,
  capture_actions: false,
  capture_friction_signals: true,
  journey_sample_rate: 0.1,
  raw_retention_days: 7,
  sample_retention_days: 30,
  aggregate_retention_months: 24,
  max_saved_funnels: 10,
  max_custom_dimensions: 0,
  approved_custom_dimensions: []
} as const;

function installFetchMock(input: {
  plan: "free" | "solo" | "team";
  effectiveRole?: "owner" | "admin" | "member";
  accessMode: "manage" | "preview";
  analyticsAvailable: boolean;
  onPatch?: (init: RequestInit) => void;
}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((request: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(request);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession({ organization_plan: input.plan })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [
            createProject({
              organization_plan: input.plan,
              effective_role: input.effectiveRole ?? "owner",
              relationship: input.effectiveRole === "member" ? "shared" : "owned"
            })
          ]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/analytics-settings") && init?.method === undefined) {
        return jsonResponse(200, {
          access_mode: input.accessMode,
          analytics_available: input.analyticsAvailable,
          settings: defaultSettings
        });
      }

      if (url.endsWith("/v1/projects/proj_123/analytics-settings") && init?.method === "PATCH") {
        input.onPatch?.(init);
        return jsonResponse(200, {
          access_mode: "manage",
          analytics_available: true,
          settings: {
            ...defaultSettings,
            capture_actions: true,
            max_custom_dimensions: 2,
            approved_custom_dimensions: ["account_type", "release_channel"]
          }
        });
      }

      return jsonResponse(404, { error: "not_found" });
    })
  );
}

describe("web app - project analytics settings", () => {
  it("lets Team owners update capture and controlled custom-dimension settings", async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn((init: RequestInit) => {
      expect(init.headers).toMatchObject({
        "content-type": "application/json",
        "x-csrf-token": "csrf-token-123"
      });
      expect(JSON.parse(String(init.body))).toEqual({
        ...defaultSettings,
        capture_actions: true,
        max_custom_dimensions: 2,
        approved_custom_dimensions: ["account_type", "release_channel"]
      });
    });
    installFetchMock({
      plan: "team",
      accessMode: "manage",
      analyticsAvailable: true,
      onPatch
    });

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    expect(
      await screen.findByRole("heading", { name: "Product analytics", level: 3 })
    ).toBeInTheDocument();

    await user.click(await screen.findByRole("switch", { name: /capture semantic actions/i }));
    fireEvent.change(screen.getByLabelText(/custom dimension limit/i), {
      target: { value: "2" }
    });
    await user.type(
      screen.getByLabelText(/approved custom dimensions/i),
      "account_type, release_channel"
    );
    await user.click(screen.getByRole("button", { name: /save analytics settings/i }));

    await waitFor(() => expect(onPatch).toHaveBeenCalledTimes(1));
  });

  it("shows members a read-only settings preview", async () => {
    installFetchMock({
      plan: "team",
      effectiveRole: "member",
      accessMode: "preview",
      analyticsAvailable: true
    });

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    expect(
      await screen.findByRole("heading", { name: "Product analytics", level: 3 })
    ).toBeInTheDocument();
    expect(await screen.findByText(/analytics capture is enabled/i)).toBeInTheDocument();
    expect(screen.getByText(/strict privacy/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save analytics settings/i })).toBeNull();
    expect(screen.queryByRole("switch", { name: /capture semantic actions/i })).toBeNull();
  });

  it("shows upgrade guidance instead of editable controls when analytics is unavailable", async () => {
    installFetchMock({
      plan: "free",
      accessMode: "manage",
      analyticsAvailable: false
    });

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    expect(
      await screen.findByRole("heading", { name: "Product analytics", level: 3 })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /upgrade to solo or team to unlock product analytics/i })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /open billing/i })[0]).toHaveAttribute("href", "/billing");
    expect(screen.queryByRole("button", { name: /save analytics settings/i })).toBeNull();
  });

  it("keeps controls hidden after a load failure and retries the settings request", async () => {
    let analyticsRequests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((request: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(request);
        if (url.endsWith("/v1/auth/session")) {
          return jsonResponse(200, { session: createSession({ organization_plan: "solo" }) });
        }
        if (url.endsWith("/v1/projects") && init?.method === undefined) {
          return jsonResponse(200, { projects: [createProject({ organization_plan: "solo" })] });
        }
        if (url.endsWith("/v1/projects/proj_123/analytics-settings")) {
          analyticsRequests += 1;
          return analyticsRequests === 1
            ? jsonResponse(503, { error: "unavailable" })
            : jsonResponse(200, {
                access_mode: "manage",
                analytics_available: true,
                settings: defaultSettings
              });
        }
        return jsonResponse(404, { error: "not_found" });
      })
    );

    const user = userEvent.setup();
    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    expect(await screen.findByText(/could not load product analytics settings/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save analytics settings/i })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("button", { name: /save analytics settings/i })).toBeInTheDocument();
    expect(analyticsRequests).toBe(2);
  });
});
