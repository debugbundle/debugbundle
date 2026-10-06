import { afterEach, describe, expect, it, vi } from "vitest";

import { getLocalDayWindow, isIncidentAttentionToday } from "../../../apps/web/src/lib/incidents-today.js";
import type { IncidentRecord } from "../../../apps/web/src/lib/api.js";
import * as api from "../../../apps/web/src/lib/api.js";
import { loadDashboardAttentionIncidentPage } from "../../../apps/web/src/lib/dashboard-incidents-today-data.js";

afterEach(() => vi.restoreAllMocks());

describe("dashboard attention pagination", () => {
  it("counts the matching local-day rows once and preserves source offsets across pages", async () => {
    const window = getLocalDayWindow(new Date("2026-06-19T07:00:00.000Z"), "Europe/Ljubljana");
    const incidents = Array.from({ length: 23 }, (_, index) => buildIncident({ incident_id: `incident-${index}` }));
    const list = vi.spyOn(api, "listIncidents").mockImplementation(async (query) => typeof query === "object" && query.cursor === "source_2"
      ? { incidents: incidents.slice(15), nextCursor: null }
      : { incidents: [buildIncident({ first_seen_at: "2026-06-17T10:00:00.000Z" }), ...incidents.slice(0, 15)], nextCursor: "source_2" });
    const first = await loadDashboardAttentionIncidentPage(window, null);
    expect(first.totalPages).toBe(3);
    expect(first.items).toEqual(incidents.slice(0, 10));
    expect(list).toHaveBeenCalledTimes(2);
    const second = await loadDashboardAttentionIncidentPage(window, first.nextCursor);
    expect(second.items).toEqual(incidents.slice(10, 20));
    expect(second.totalPages).toBeUndefined();
    const third = await loadDashboardAttentionIncidentPage(window, second.nextCursor);
    expect(third.items).toEqual(incidents.slice(20));
    expect(third.nextCursor).toBeNull();
  });

  it("stops counting at older incidents and reports an empty result as one page", async () => {
    const window = getLocalDayWindow(new Date("2026-06-19T07:00:00.000Z"), "Europe/Ljubljana");
    const list = vi.spyOn(api, "listIncidents").mockResolvedValue({ incidents: [buildIncident({
      first_seen_at: "2026-06-17T10:00:00.000Z", last_seen_at: "2026-06-17T10:00:00.000Z"
    })], nextCursor: "older" });
    expect(await loadDashboardAttentionIncidentPage(window, null)).toEqual({ items: [], nextCursor: null, totalPages: 1 });
    expect(list).toHaveBeenCalledTimes(1);
  });
});

describe("incidents today web filtering", () => {
  const timeZone = "Europe/Ljubljana";

  it("uses the browser-local day at 01:00 instead of the UTC day", () => {
    const window = getLocalDayWindow(new Date("2026-06-18T23:00:00.000Z"), timeZone);

    expect(window.startsAtIso).toBe("2026-06-18T22:00:00.000Z");
  });

  it("keeps the same browser-local day at 09:00", () => {
    const window = getLocalDayWindow(new Date("2026-06-19T07:00:00.000Z"), timeZone);

    expect(window.startsAtIso).toBe("2026-06-18T22:00:00.000Z");
  });

  it("includes incidents first seen during the local day", () => {
    const window = getLocalDayWindow(new Date("2026-06-19T07:00:00.000Z"), timeZone);

    expect(isIncidentAttentionToday(buildIncident({ first_seen_at: "2026-06-18T22:30:00.000Z" }), window)).toBe(true);
    expect(isIncidentAttentionToday(buildIncident({ first_seen_at: "2026-06-18T21:59:59.999Z" }), window)).toBe(false);
  });

  it("includes incidents regressed during the local day", () => {
    const window = getLocalDayWindow(new Date("2026-06-19T07:00:00.000Z"), timeZone);

    expect(
      isIncidentAttentionToday(
        buildIncident({
          first_seen_at: "2026-06-17T10:00:00.000Z",
          regressed_at: "2026-06-18T22:15:00.000Z"
        }),
        window
      )
    ).toBe(true);
  });
});

function buildIncident(overrides: Partial<IncidentRecord>): IncidentRecord {
  return {
    incident_id: "incident-id",
    project_id: "project-id",
    project_name: "Project",
    project_color_tag: null,
    service_id: "service-id",
    service_name: "Service",
    latest_deployment_id: null,
    environment: "production",
    fingerprint: "fingerprint",
    fingerprint_version: "v1",
    title: "Incident",
    severity: "high",
    status: "open",
    first_seen_at: "2026-06-18T22:30:00.000Z",
    last_seen_at: "2026-06-18T22:30:00.000Z",
    occurrence_count: 1,
    spike_detected_at: null,
    resolved_at: null,
    regressed_at: null,
    matched_fields: [],
    ...overrides
  };
}
