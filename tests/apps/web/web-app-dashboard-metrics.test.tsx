// @vitest-environment jsdom

import { act, render, screen, waitFor, within } from "@testing-library/react";
import { describe, afterEach, expect, it, vi } from "vitest";
import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { getLocalDayWindow } from "../../../apps/web/src/lib/incidents-today.js";
import * as notify from "../../../apps/web/src/lib/notify.js";
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

describe("dashboard metrics", () => {
  it("quietly refreshes the incident cards and rows once when the dashboard becomes visible", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const toast = vi.spyOn(notify, "showErrorToast");
    let openIncidents = 1;
    let healthStatus = "passing";
    const { startsAtIso } = getLocalDayWindow();
    const firstIncident = createIncident({
      incident_id: "inc_first",
      title: "Checkout timeout",
      first_seen_at: startsAtIso,
      last_seen_at: startsAtIso
    });
    const incidents = vi
      .fn<() => Response | Promise<Response>>()
      .mockImplementation(() =>
        jsonResponse(200, { incidents: [firstIncident], next_cursor: null })
      );
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url.endsWith("/v1/auth/session"))
          return jsonResponse(200, { session: createSession() });
        if (url.endsWith("/v1/projects"))
          return jsonResponse(200, {
            projects: [
              createProject({ metrics: { open_incidents: openIncidents, regressed_incidents: 0 } })
            ]
          });
        if (url.includes("/v1/incidents?")) return incidents();
        if (url.includes("/availability-checks?"))
          return jsonResponse(200, {
            checks: [
              { check_id: healthStatus === "passing" ? "before" : "after", status: healthStatus }
            ]
          });
        if (url.includes("/after/daily-rollups?"))
          return jsonResponse(503, { error: "unavailable" });
        if (url.includes("/daily-rollups?")) return jsonResponse(200, { rollups: [] });
        return jsonResponse(404, { error: "not_found" });
      })
    );

    render(<App initialEntries={["/dashboard"]} />);
    const card = within(await screen.findByRole("link", { name: /active incidents/i }));
    const health = within(screen.getByRole("link", { name: /health status today/i }));
    await waitFor(() => expect(card.getByText("1")).toBeInTheDocument());
    expect(health.getByText(/1 check passing/)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Checkout timeout" })).toBeInTheDocument();
    expect(incidents).toHaveBeenCalledTimes(1);
    incidents.mockClear();
    openIncidents = 2;
    healthStatus = "failing";
    let finish!: (response: Response) => void;
    incidents.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        finish = resolve;
      })
    );
    visibility.mockReturnValue("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(incidents).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(incidents).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("link", { name: "Checkout timeout" })).toBeInTheDocument();
    for (const refresh of screen.getAllByRole("button", { name: "Refresh" })) {
      expect(refresh).toBeEnabled();
    }
    await act(async () =>
      finish(
        jsonResponse(200, {
          incidents: [
            { ...firstIncident, incident_id: "inc_second", title: "Payment unavailable" },
            firstIncident
          ],
          next_cursor: null
        })
      )
    );
    expect(await screen.findByRole("link", { name: "Payment unavailable" })).toBeInTheDocument();
    await waitFor(() => expect(card.getByText("2")).toBeInTheDocument());
    const projectsTable = screen.getByRole("columnheader", { name: "Slug" }).closest("table")!;
    const projectRow = within(within(projectsTable).getByRole("row", { name: /Main App/ }));
    expect(projectRow.getAllByRole("cell")[3]).toHaveTextContent(/^2$/);
    expect(health.getByText(/1 check failing/)).toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: /incidents today/i })).getByText("2")
    ).toBeInTheDocument();

    incidents.mockReturnValueOnce(jsonResponse(503, { error: "temporarily_unavailable" }));
    await act(async () => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(incidents).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("heading", { name: "Incidents today (2)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Payment unavailable" })).toBeInTheDocument();
    expect(toast).not.toHaveBeenCalled();
  });

  it("renders the dashboard when projects are returned without metrics", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, {
          session: createSession()
        });
      }

      if (url.endsWith("/v1/billing") && init?.method === undefined) {
        return jsonResponse(404, { error: "billing_not_found" });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [
            {
              project_id: "proj_123",
              organization_id: "org_123",
              name: "Main App",
              slug: "main-app",
              environment_default: "production",
              plan: "free",
              created_at: "2026-03-17T00:00:00.000Z",
              updated_at: "2026-03-17T00:00:00.000Z"
            }
          ]
        });
      }

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    expect(await screen.findByText(/main app/i)).toBeInTheDocument();

    const mainAppRow = screen.getByText(/main app/i).closest("tr");
    expect(mainAppRow).not.toBeNull();
    expect(within(mainAppRow as HTMLTableRowElement).getAllByText(/^0$/)).toHaveLength(3);
    expect(await screen.findByText(/no incidents today/i)).toBeInTheDocument();
  });
});
