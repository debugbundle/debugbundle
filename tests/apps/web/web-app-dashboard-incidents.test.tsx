// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, afterEach, expect, it, vi } from "vitest";
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
  vi.unstubAllGlobals();
});

describe("dashboard incidents", () => {
  it("opens the incidents page from the dashboard open-incidents card", async () => {
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

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, {
          incidents: [
            createIncident({
              incident_id: "inc_today",
              title: "Checkout timeout"
            })
          ],
          next_cursor: null
        });
      }

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, { incidents: [], next_cursor: null });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    await screen.findByText(/open or regressed incidents across all projects/i);

    const openIncidentsCard = screen
      .getByText(/open or regressed incidents across all projects/i)
      .closest("a");
    expect(openIncidentsCard).not.toBeNull();

    await user.click(openIncidentsCard as HTMLAnchorElement);

    expect(await screen.findByRole("heading", { name: /incident inventory/i })).toBeInTheDocument();
  });

  it("scrolls to the incidents-today panel from the dashboard new-incidents card", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();

    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });

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

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, {
          incidents: [
            createIncident({
              incident_id: "inc_today",
              title: "Checkout timeout"
            })
          ],
          next_cursor: null
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    await screen.findByRole("heading", { name: /incidents today/i });
    await user.click(screen.getByRole("button", { name: /incidents today/i }));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start"
    });
  });

  it("renders incident rows in the dashboard incidents-today table", async () => {
    const todayWindow = getLocalDayWindow();
    const firstSeenAt = new Date(todayWindow.startsAtMs + 30 * 60 * 1000).toISOString();
    const lastSeenAt = new Date(todayWindow.startsAtMs + 2 * 60 * 60 * 1000).toISOString();

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

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, {
          incidents: [
            createIncident({
              incident_id: "inc_today",
              title: "Checkout timeout",
              project_id: "proj_456",
              project_name: "Worker",
              project_color_tag: "emerald",
              service_name: null,
              environment: "production",
              severity: "critical",
              status: "regressed",
              first_seen_at: firstSeenAt,
              last_seen_at: lastSeenAt,
              occurrence_count: 11,
              regressed_at: firstSeenAt
            })
          ],
          next_cursor: null
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    const heading = await screen.findByRole("heading", { name: /incidents today/i });
    const incidentsTodayCard = heading.closest('[data-slot="card"]');
    expect(incidentsTodayCard).not.toBeNull();
    const card = within(incidentsTodayCard as HTMLElement);
    const cardElement = incidentsTodayCard as HTMLElement;

    expect(await card.findByRole("link", { name: /checkout timeout/i })).toBeInTheDocument();
    expect(card.getByRole("link", { name: /worker/i })).toBeInTheDocument();
    expect(cardElement.querySelector('[data-project-color-tag="emerald"]')).not.toBeNull();
    expect(card.getByText(/unknown service/i)).toBeInTheDocument();
    expect(card.getByRole("columnheader", { name: /environment/i })).toBeInTheDocument();
    expect(card.getByText(/^production$/i)).toBeInTheDocument();
    expect(screen.getByText(/^critical$/i)).toBeInTheDocument();
    expect(screen.getByText(/^regressed$/i)).toHaveAttribute("data-variant", "destructive");
    expect(screen.getByText(/^11$/)).toBeInTheDocument();
  });

  it("paginates the dashboard incidents-today table with the shared controls", async () => {
    const user = userEvent.setup();
    const todayWindow = getLocalDayWindow();
    const firstSeenAt = new Date(todayWindow.startsAtMs + 30 * 60 * 1000).toISOString();
    const todayIncidents = Array.from({ length: 11 }, (_, index) =>
      createIncident({
        incident_id: `inc_today_${index + 1}`,
        title:
          index === 0
            ? "Checkout timeout"
            : index === 10
              ? "Retry storm"
              : `Dashboard incident ${index + 1}`,
        first_seen_at: firstSeenAt,
        regressed_at: null
      })
    );
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

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, {
          incidents: todayIncidents,
          next_cursor: null
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    const heading = await screen.findByRole("heading", { name: /incidents today/i });
    const incidentsTodayCard = heading.closest('[data-slot="card"]');
    expect(incidentsTodayCard).not.toBeNull();
    const card = within(incidentsTodayCard as HTMLElement);

    expect(await card.findByRole("link", { name: /checkout timeout/i })).toBeInTheDocument();
    expect(card.getByText(/page 1/i)).toBeInTheDocument();

    await user.click(card.getByRole("button", { name: /go to next page/i }));

    expect(await card.findByRole("link", { name: /retry storm/i })).toBeInTheDocument();
    expect(card.getByText(/page 2/i)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("attention_after="))
    ).toBe(false);
  });

  it("loads the dashboard incidents-today table without requiring the attention_after API filter", async () => {
    const todayWindow = getLocalDayWindow();
    const firstSeenAt = new Date(todayWindow.startsAtMs + 30 * 60 * 1000).toISOString();
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

      if (url.includes("/v1/incidents?") && url.includes("attention_after=")) {
        return jsonResponse(400, {
          error: "invalid_query"
        });
      }

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, {
          incidents: [
            createIncident({
              incident_id: "inc_today_dashboard",
              title: "Dashboard incident",
              first_seen_at: firstSeenAt,
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

    const heading = await screen.findByRole("heading", { name: /incidents today/i });
    const incidentsTodayCard = heading.closest('[data-slot="card"]');
    expect(incidentsTodayCard).not.toBeNull();
    const card = within(incidentsTodayCard as HTMLElement);

    expect(await card.findByRole("link", { name: /dashboard incident/i })).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("attention_after="))
    ).toBe(false);
    expect(screen.queryByText(/could not load the current page/i)).not.toBeInTheDocument();
  });

  it("does not scan older dashboard incidents-today pages after reaching incidents before today", async () => {
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
          projects: [createProject()]
        });
      }

      if (url.includes("/v1/incidents?") && url.includes("cursor=cursor_2")) {
        return jsonResponse(500, {
          error: "unexpected_scan"
        });
      }

      if (url.includes("/v1/incidents?")) {
        return jsonResponse(200, {
          incidents: [
            createIncident({
              incident_id: "inc_old",
              title: "Old incident",
              first_seen_at: oldIncidentAt,
              last_seen_at: oldIncidentAt,
              regressed_at: null
            })
          ],
          next_cursor: "cursor_2"
        });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/dashboard"]} />);

    expect(await screen.findByText(/no incidents today/i)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("cursor=cursor_2"))
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("attention_after="))
    ).toBe(false);
    expect(screen.queryByText(/could not load the current page/i)).not.toBeInTheDocument();
  });
});
