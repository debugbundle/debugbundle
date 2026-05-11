import { RetrievalApiError } from "../../../packages/retrieval-client/src/index.js";

export type RetrievalSource = "local" | "cloud";

type CursorIncidentLike = {
  incident_id: string;
  last_seen_at: string;
};

export function attachSourceToRecord<T extends Record<string, unknown>>(
  payload: T,
  source: RetrievalSource
): T & { source: RetrievalSource } {
  return {
    ...payload,
    source
  };
}

export function attachSourceToPayload<T>(payload: T, source: RetrievalSource): T {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return payload;
  }

  return {
    ...(payload as Record<string, unknown>),
    source
  } as T;
}

export function attachSourceToIncidentContext<
  T extends {
    incident: Record<string, unknown>;
  }
>(payload: T, source: RetrievalSource): T & { incident: T["incident"] & { source: RetrievalSource } } {
  return {
    ...payload,
    incident: attachSourceToRecord(payload.incident, source)
  };
}

export function sortIncidentsDescending<T extends CursorIncidentLike>(incidents: T[]): T[] {
  return [...incidents].sort((left, right) => {
    const bySeenAt = right.last_seen_at.localeCompare(left.last_seen_at);
    if (bySeenAt !== 0) {
      return bySeenAt;
    }

    return right.incident_id.localeCompare(left.incident_id);
  });
}

export function paginateIncidents<T extends CursorIncidentLike>(
  incidents: T[],
  input: { cursor?: string; limit?: number }
): { incidents: T[]; next_cursor: string | null } {
  const sortedIncidents = sortIncidentsDescending(incidents);
  const startIndex = input.cursor === undefined ? 0 : sortedIncidents.findIndex((incident) => buildIncidentCursor(incident) === input.cursor) + 1;
  const pagedIncidents =
    input.limit === undefined
      ? sortedIncidents.slice(startIndex)
      : sortedIncidents.slice(startIndex, startIndex + input.limit);
  const hasMore = input.limit !== undefined && startIndex + input.limit < sortedIncidents.length;

  return {
    incidents: pagedIncidents,
    next_cursor: hasMore && pagedIncidents.length > 0 ? buildIncidentCursor(pagedIncidents[pagedIncidents.length - 1]!) : null
  };
}

export function isNotFoundRetrievalError(error: unknown): boolean {
  return error instanceof RetrievalApiError && error.status === 404;
}

function buildIncidentCursor(incident: CursorIncidentLike): string {
  return `${incident.last_seen_at}|${incident.incident_id}`;
}
