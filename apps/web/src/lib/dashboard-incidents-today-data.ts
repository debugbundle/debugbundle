import { listIncidents, type IncidentRecord } from "./api.js";
import { getLocalDayWindow, isIncidentAttentionToday, type LocalDayWindow } from "./incidents-today.js";

const DASHBOARD_INCIDENTS_TODAY_PAGE_SIZE = 10;
const DASHBOARD_INCIDENTS_TODAY_SCAN_LIMIT = 100;

export type DashboardIncidentsTodayCursor = {
  sourceCursor: string | null;
  matchOffset: number;
};

export async function loadDashboardAttentionIncidentPage(
  todayWindow: LocalDayWindow,
  cursor: string | null
): Promise<{ items: IncidentRecord[]; nextCursor: string | null }> {
  const items: IncidentRecord[] = [];
  let currentCursor = decodeDashboardIncidentsTodayCursor(cursor);

  while (items.length < DASHBOARD_INCIDENTS_TODAY_PAGE_SIZE) {
    const response = await listDashboardAttentionIncidentMatches(todayWindow, currentCursor.sourceCursor);
    const availableIncidents = response.matchedIncidents.slice(currentCursor.matchOffset);
    const remainingPageSize = DASHBOARD_INCIDENTS_TODAY_PAGE_SIZE - items.length;
    const incidentsToTake = availableIncidents.slice(0, remainingPageSize);

    items.push(...incidentsToTake);

    const nextMatchOffset = currentCursor.matchOffset + incidentsToTake.length;
    if (nextMatchOffset < response.matchedIncidents.length) {
      return {
        items,
        nextCursor: encodeDashboardIncidentsTodayCursor({
          sourceCursor: currentCursor.sourceCursor,
          matchOffset: nextMatchOffset
        })
      };
    }

    if (
      response.nextSourceCursor === null ||
      response.nextSourceCursor === currentCursor.sourceCursor ||
      response.reachedOlderIncidents
    ) {
      return {
        items,
        nextCursor: null
      };
    }

    currentCursor = {
      sourceCursor: response.nextSourceCursor,
      matchOffset: 0
    };
  }

  return {
    items,
    nextCursor: encodeDashboardIncidentsTodayCursor(currentCursor)
  };
}

export async function countDashboardAttentionIncidents(todayWindow = getLocalDayWindow()): Promise<number> {
  let total = 0;
  let sourceCursor: string | null = null;

  while (true) {
    const response = await listDashboardAttentionIncidentMatches(todayWindow, sourceCursor);
    total += response.matchedIncidents.length;

    if (
      response.nextSourceCursor === null ||
      response.nextSourceCursor === sourceCursor ||
      response.reachedOlderIncidents
    ) {
      return total;
    }

    sourceCursor = response.nextSourceCursor;
  }
}

function encodeDashboardIncidentsTodayCursor(cursor: DashboardIncidentsTodayCursor): string {
  return JSON.stringify(cursor);
}

function decodeDashboardIncidentsTodayCursor(value: string | null): DashboardIncidentsTodayCursor {
  if (value === null) {
    return {
      sourceCursor: null,
      matchOffset: 0
    };
  }

  try {
    const parsed = JSON.parse(value) as Partial<DashboardIncidentsTodayCursor>;
    const sourceCursor = typeof parsed.sourceCursor === "string" ? parsed.sourceCursor : null;
    const parsedMatchOffset = parsed.matchOffset;
    const matchOffset = Number.isInteger(parsedMatchOffset) && parsedMatchOffset !== undefined && parsedMatchOffset >= 0
      ? parsedMatchOffset
      : 0;

    return {
      sourceCursor,
      matchOffset
    };
  } catch {
    return {
      sourceCursor: value,
      matchOffset: 0
    };
  }
}

async function listDashboardAttentionIncidentMatches(
  todayWindow: LocalDayWindow,
  sourceCursor: string | null
): Promise<{
  matchedIncidents: IncidentRecord[];
  nextSourceCursor: string | null;
  reachedOlderIncidents: boolean;
}> {
  const response = await listIncidents({
    limit: DASHBOARD_INCIDENTS_TODAY_SCAN_LIMIT,
    ...(sourceCursor === null ? {} : { cursor: sourceCursor })
  });
  const matchedIncidents = response.incidents.filter((incident) => isIncidentAttentionToday(incident, todayWindow));
  const oldestScannedIncident = response.incidents.at(-1);
  const reachedOlderIncidents =
    oldestScannedIncident !== undefined && isIncidentLastSeenBeforeWindow(oldestScannedIncident, todayWindow);

  return {
    matchedIncidents,
    nextSourceCursor: response.nextCursor,
    reachedOlderIncidents
  };
}

function isIncidentLastSeenBeforeWindow(incident: IncidentRecord, todayWindow: LocalDayWindow): boolean {
  const lastSeenAt = new Date(incident.last_seen_at).getTime();
  return Number.isFinite(lastSeenAt) && lastSeenAt < todayWindow.startsAtMs;
}
