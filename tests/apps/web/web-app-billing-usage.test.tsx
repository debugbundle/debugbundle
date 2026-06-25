// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("web app — billing usage", () => {
  it("shows a raw ingested events project breakdown from the billing page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(200, {
          billing: createBillingSummary({
            plan: "team",
            active_projects: 2,
            allowances: {
              ...createBillingSummary({ plan: "team" }).allowances,
              monthly_raw_ingested_events: {
                used: 136445,
                limit: 150000
              }
            }
          })
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [
            createProject({
              project_id: "proj_low",
              name: "API",
              slug: "api",
              metrics: {
                open_incidents: 0,
                regressed_incidents: 0,
                attention_incidents_today: 0,
                opened_incidents_today: 0,
                opened_incidents_month: 0,
                monthly_bundle_requests: 10,
                monthly_raw_ingested_events: 36000,
                retained_bundles: 4,
                monthly_alert_deliveries: 0
              }
            }),
            createProject({
              project_id: "proj_high",
              name: "Patients SPA",
              slug: "patients-spa",
              metrics: {
                open_incidents: 0,
                regressed_incidents: 0,
                attention_incidents_today: 0,
                opened_incidents_today: 0,
                opened_incidents_month: 0,
                monthly_bundle_requests: 28,
                monthly_raw_ingested_events: 100445,
                retained_bundles: 12,
                monthly_alert_deliveries: 0
              }
            }),
            createProject({
              project_id: "proj_shared",
              name: "External shared app",
              slug: "external-shared-app",
              relationship: "shared",
              sharing_state: "shared_with_you",
              metrics: {
                open_incidents: 0,
                regressed_incidents: 0,
                attention_incidents_today: 0,
                opened_incidents_today: 0,
                opened_incidents_month: 0,
                monthly_bundle_requests: 0,
                monthly_raw_ingested_events: 999999,
                retained_bundles: 0,
                monthly_alert_deliveries: 0
              }
            })
          ]
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/billing"]} />);

    expect(await screen.findByRole("heading", { name: /billing/i, level: 1 })).toBeInTheDocument();
    await user.click(
      await screen.findByRole("button", { name: /view raw ingested events breakdown/i })
    );

    const dialog = await screen.findByRole("dialog", {
      name: /raw ingested events breakdown/i
    });
    expect(within(dialog).getByText(/current billing window/i)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/top 2 projects account for 136,445 of 136,445 counted events/i)
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/patients spa/i)).toBeInTheDocument();
    expect(within(dialog).getByText("100,445")).toBeInTheDocument();
    expect(within(dialog).getByText("74%")).toBeInTheDocument();
    expect(within(dialog).getByText(/api/i)).toBeInTheDocument();
    expect(within(dialog).queryByText(/external shared app/i)).toBeNull();
    expect(within(dialog).getAllByRole("link", { name: /open settings/i })[0]).toHaveAttribute(
      "href",
      "/projects/proj_high/settings"
    );
  });
});
