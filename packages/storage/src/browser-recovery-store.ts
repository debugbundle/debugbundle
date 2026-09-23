import { createHash } from "node:crypto";
import type { EventEnvelope } from "../../shared-types/src/event-envelope.js";
import { browserRecoveryFailureFromEvent } from "../../shared-types/src/browser-recovery.js";
import type { Queryable } from "./types.js";
import { createWorkerJobStore } from "./worker-job-store.js";

function hashCorrelation(
  projectId: string,
  kind: string,
  value: string | null | undefined
): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? createHash("sha256")
        .update(JSON.stringify([projectId, kind, value]))
        .digest("hex")
    : null;
}

/** Shared correlation locks serialize recovery insertion with resource grouping. */
async function lockCorrelations(
  db: Queryable,
  project: string,
  service: string,
  environment: string,
  session: string | null,
  trace: string | null
): Promise<void> {
  const keys = [
    session === null ? null : `session:${session}`,
    trace === null ? null : `trace:${trace}`
  ]
    .filter((key): key is string => key !== null)
    .sort();
  for (const key of keys)
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      JSON.stringify(["browser_recovery", project, service, environment, key])
    ]);
}

export async function lockBrowserRecoveryEvent(
  db: Queryable,
  projectId: string,
  eventId: string
): Promise<void> {
  const result = await db.query<{
    service_name: string;
    environment: string;
    session_hash: string | null;
    trace_hash: string | null;
  }>(
    "SELECT service_name, environment, session_hash, trace_hash FROM browser_recovery_events WHERE project_id = $1 AND event_id = $2 AND kind = 'resource'",
    [projectId, eventId]
  );
  const row = result.rows[0];
  if (row)
    await lockCorrelations(
      db,
      projectId,
      row.service_name,
      row.environment,
      row.session_hash,
      row.trace_hash
    );
}

export function createBrowserRecoveryStore(db: Queryable): {
  record(projectId: string, event: EventEnvelope): Promise<void>;
} {
  return {
    async record(projectId: string, event: EventEnvelope): Promise<void> {
      const kind =
        event.event_type === "frontend_exception" &&
        event.payload.browser_event?.kind === "resource_error"
          ? "resource"
          : browserRecoveryFailureFromEvent(event) === null
            ? null
            : "recovery";
      if (kind === null) return;
      const session = hashCorrelation(projectId, "session", event.correlation?.session_id);
      const trace = hashCorrelation(projectId, "trace", event.correlation?.trace_id);
      if (session === null && trace === null) return;
      await lockCorrelations(
        db,
        projectId,
        event.service.name,
        event.service.environment,
        session,
        trace
      );
      await db.query(
        `INSERT INTO browser_recovery_events (event_id, project_id, service_name, environment, kind, occurred_at, session_hash, trace_hash, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8, LEAST($6::timestamptz, now()) + interval '7 days') ON CONFLICT (event_id) DO NOTHING`,
        [
          event.event_id,
          projectId,
          event.service.name,
          event.service.environment,
          kind,
          event.occurred_at,
          session,
          trace
        ]
      );
      if (kind !== "recovery") return;
      // Rebuild already-grouped resource incidents; an as-yet ungrouped resource's initial
      // build will read this committed index entry. Replays share the same durable job ID.
      const incidents = await db.query<{ incident_id: string; occurrence_count: number }>(
        `
        SELECT DISTINCT i.id AS incident_id, i.occurrence_count
        FROM browser_recovery_events r
        JOIN incident_events ie ON ie.event_id = r.event_id AND ie.is_sampled = true
        JOIN incidents i ON i.id = ie.incident_id AND i.project_id = r.project_id
        WHERE r.project_id = $1 AND r.service_name = $2 AND r.environment = $3 AND r.kind = 'resource'
          AND r.occurred_at BETWEEN $4::timestamptz - interval '30 seconds' AND $4::timestamptz
          AND r.expires_at > now()
          AND (($5::text IS NOT NULL AND r.session_hash = $5) OR ($6::text IS NOT NULL AND r.trace_hash = $6))
        ORDER BY i.id LIMIT 50`,
        [
          projectId,
          event.service.name,
          event.service.environment,
          event.occurred_at,
          session,
          trace
        ]
      );
      for (const incident of incidents.rows)
        await createWorkerJobStore(db).enqueue("build-bundle", {
          project_id: projectId,
          incident_id: incident.incident_id,
          event_id: event.event_id,
          occurred_at: event.occurred_at,
          occurrence_count: incident.occurrence_count,
          trigger: "new_context_type"
        });
    }
  };
}
