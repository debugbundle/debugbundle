// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { getLocalDayWindow } from "../../../apps/web/src/lib/incidents-today.ts";
import {
  createIncident,
  createProject,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";

afterEach(() => {
  resetBrowserSessionClientState();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("dashboard incidents today consistency", () => {
  it("uses the same local-day incident logic for the stat card and table", async () => {
    const todayWindow = getLocalDayWindow();
    const oldIncidentAt = new Date(todayWindow.startsAtMs - 60 * 60 * 1000).toISOString();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [
            createProject({
              metrics: {
                attention_incidents_today: 14,
                opened_incidents_today: 14
              }
            })
          ]
        });
      }

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, {
          incidents: [
            createIncident({
              incident_id: "inc_old",
              title: "Yesterday incident",
              first_seen_at: oldIncidentAt,
              last_seen_at: oldIncidentAt,
              regressed_at: null
            })
          ],
          next_cursor: null
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    const incidentsTodayButton = await screen.findByRole("button", { name: /incidents today/i });
    await waitFor(() => {
      expect(within(incidentsTodayButton).getByText(/^0$/)).toBeInTheDocument();
    });

    expect(await screen.findByText(/no incidents today/i)).toBeInTheDocument();
    expect(screen.getByText(/incidents opened or regressed today will appear here/i)).toBeInTheDocument();
  });
});
