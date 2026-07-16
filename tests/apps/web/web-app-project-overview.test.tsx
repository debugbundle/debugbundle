// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

const analyticsSettings = {
  enabled: true,
  privacy_mode: "strict",
  consent_required: true,
  capture_page_views: true,
  capture_route_changes: true,
  capture_actions: true,
  capture_friction_signals: true,
  journey_sample_rate: 0.1,
  raw_retention_days: 7,
  sample_retention_days: 30,
  hourly_retention_days: 90,
  aggregate_retention_months: 24,
  max_saved_funnels: 10,
  max_custom_dimensions: 8,
  approved_custom_dimensions: []
} as const;

function installProjectOverviewFetch(input: {
  plan: "free" | "solo" | "team";
  analyticsAvailable: boolean;
  analyticsEnabled?: boolean;
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
          projects: [createProject({ organization_plan: input.plan })]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/analytics-settings")) {
        return jsonResponse(200, {
          access_mode: "manage",
          analytics_available: input.analyticsAvailable,
          settings: {
            ...analyticsSettings,
            enabled: input.analyticsEnabled ?? true
          }
        });
      }

      return jsonResponse(404, { error: "not_found" });
    })
  );
}

async function findSetupSection(): Promise<HTMLDivElement> {
  const section = (await screen.findByText(/setup at a glance/i)).closest("div.border-t");
  expect(section).not.toBeNull();
  await within(section as HTMLDivElement).findByText(/^alerts$/i);
  return section as HTMLDivElement;
}

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
});

describe("web app - project overview", () => {
  it("orders project tabs by the primary investigation and automation workflow", async () => {
    installProjectOverviewFetch({ plan: "team", analyticsAvailable: true });

    render(<App initialEntries={["/projects/proj_123"]} />);

    expect((await screen.findAllByRole("tab")).map((tab) => tab.textContent)).toEqual([
      "Overview",
      "Incidents",
      "Health",
      "Improvements",
      "Analytics",
      "Bundles",
      "Alerts",
      "Probes",
      "Webhooks",
      "GitHub",
      "Tokens",
      "Members",
      "Settings"
    ]);
  });

  it("orders setup cards and summarizes enabled analytics capture", async () => {
    installProjectOverviewFetch({ plan: "team", analyticsAvailable: true });

    render(<App initialEntries={["/projects/proj_123"]} />);

    const setupSection = await findSetupSection();
    const setupGrid = within(setupSection)
      .getByText(/^alerts$/i)
      .closest("div.grid");
    expect(setupGrid).not.toBeNull();
    expect(
      Array.from((setupGrid as HTMLDivElement).children).map(
        (card) => card.querySelector("p")?.textContent
      )
    ).toEqual([
      "Alerts",
      "Analytics",
      "Health checks",
      "Improvement bundles",
      "Weekly reports",
      "Capture policy",
      "Probes",
      "Webhooks",
      "GitHub automation"
    ]);

    const analyticsCard = within(setupSection)
      .getByText(/^analytics$/i)
      .closest("div.rounded-lg");
    expect(analyticsCard).not.toBeNull();
    expect(within(analyticsCard as HTMLDivElement).getByText(/^enabled$/i)).toBeInTheDocument();
    expect(
      within(analyticsCard as HTMLDivElement).getByText(/^strict privacy$/i)
    ).toBeInTheDocument();
    expect(
      within(analyticsCard as HTMLDivElement).getByText(
        /^browser analytics capture waits for explicit visitor consent\.$/i
      )
    ).toBeInTheDocument();
  });

  it("shows analytics as available but off on Free projects", async () => {
    installProjectOverviewFetch({
      plan: "free",
      analyticsAvailable: true,
      analyticsEnabled: false
    });

    render(<App initialEntries={["/projects/proj_123"]} />);

    const setupSection = await findSetupSection();
    const analyticsCard = within(setupSection)
      .getByText(/^analytics$/i)
      .closest("div.rounded-lg");
    expect(analyticsCard).not.toBeNull();
    expect(within(analyticsCard as HTMLDivElement).getByText(/^off$/i)).toBeInTheDocument();
    expect(
      within(analyticsCard as HTMLDivElement).getByText(/^strict privacy$/i)
    ).toBeInTheDocument();
  });
});
