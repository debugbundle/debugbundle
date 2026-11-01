import { createHash } from "node:crypto";
import {
  EvidenceReferenceSchema,
  type EventClass,
  type EventEnvelope
} from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";
import { createWorkerJobStore } from "./worker-job-store.js";

function hash(project: string, kind: string, value: string | null | undefined): string | null {
  return value?.trim()
    ? createHash("sha256")
        .update(JSON.stringify([project, "evidence_v1", kind, value]))
        .digest("hex")
    : null;
}

export async function lockEvidenceContextEvent(
  db: Queryable,
  project: string,
  eventId: string
): Promise<void> {
  const result = await db.query<{
    service_name: string;
    environment: string;
    failure_hash: string;
    scope_kind: string;
    scope_hash: string;
  }>(
    "SELECT service_name, environment, failure_hash, scope_kind, scope_hash FROM evidence_context_events WHERE project_id = $1 AND event_id = $2 AND kind = 'failure'",
    [project, eventId]
  );
  for (const row of result.rows)
    await lock(db, [
      project,
      row.service_name,
      row.environment,
      row.failure_hash,
      row.scope_kind,
      row.scope_hash
    ]);
}
async function lock(db: Queryable, values: string[]): Promise<void> {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    JSON.stringify(["evidence_context", ...values])
  ]);
}

/** Called in the normalization transaction, sharing its receipt and durable rebuild ownership. */
export function createEvidenceContextStore(db: Queryable): {
  record(
    projectId: string,
    event: EventEnvelope,
    receivedAt: string,
    eventClass?: EventClass
  ): Promise<void>;
} {
  return {
    async record(projectId, event, receivedAt, eventClass) {
      const diagnostic = event.event_type === "diagnostic_context" ? event.payload : null;
      const reference = EvidenceReferenceSchema.safeParse(
        diagnostic === null
          ? event.context?.["evidence_reference"]
          : {
              version: diagnostic.version,
              failure_ref: diagnostic.failure_ref,
              scope: diagnostic.scope
            }
      );
      if (
        !reference.success ||
        (!diagnostic &&
          (eventClass !== "incident_signal" ||
            !["backend_exception", "frontend_exception", "request_event", "log_event"].includes(
              event.event_type
            )))
      )
        return;
      const receipt = Date.parse(receivedAt);
      const occurred = Date.parse(event.occurred_at);
      if (
        !Number.isFinite(receipt) ||
        !Number.isFinite(occurred) ||
        (diagnostic && occurred > receipt + 60_000)
      )
        return;
      const { scope } = reference.data;
      const failureHash = hash(projectId, "failure", reference.data.failure_ref)!;
      const scopeHash = hash(
        projectId,
        scope.kind,
        scope.kind === "page" ? scope.page_id : scope.operation_id
      )!;
      const sessionHash = hash(projectId, "session", event.correlation?.session_id);
      const traceHash = hash(projectId, "trace", event.correlation?.trace_id);
      if (scope.kind === "page" && sessionHash === null) return;
      await lock(db, [
        projectId,
        event.service.name,
        event.service.environment,
        failureHash,
        scope.kind,
        scopeHash
      ]);
      const kind = diagnostic?.kind ?? "failure";
      const result = await db.query<{ event_id: string }>(
        `INSERT INTO evidence_context_events
      (event_id, project_id, service_name, environment, kind, occurred_at, received_at, failure_hash, scope_kind, scope_hash, session_hash, trace_hash, attempt_hash, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz,$8,$9,$10,$11,$12,$13,LEAST($6::timestamptz,$7::timestamptz) + interval '7 days')
      ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
        [
          event.event_id,
          projectId,
          event.service.name,
          event.service.environment,
          kind,
          event.occurred_at,
          receivedAt,
          failureHash,
          scope.kind,
          scopeHash,
          sessionHash,
          traceHash,
          diagnostic?.kind === "recovery" ? hash(projectId, "attempt", diagnostic.attempt_id) : null
        ]
      );
      if (result.rows.length === 0) return;
      // Keep two active failures to detect reference reuse and twenty observations.
      // Overflow rows remain cleanup/receipt tombstones until their raw objects expire.
      await db.query(
        `UPDATE evidence_context_events SET is_retained=false WHERE event_id IN (
      SELECT event_id FROM evidence_context_events WHERE project_id=$1 AND service_name=$2 AND environment=$3
        AND failure_hash=$4 AND scope_kind=$5 AND scope_hash=$6 AND (kind='failure')=$7
      ORDER BY occurred_at,event_id OFFSET $8)`,
        [
          projectId,
          event.service.name,
          event.service.environment,
          failureHash,
          scope.kind,
          scopeHash,
          kind === "failure",
          kind === "failure" ? 2 : 20
        ]
      );
      if (kind === "failure") return;
      const incidents = await db.query<{
        incident_id: string;
        occurrence_count: number;
        primary_event_id: string;
        primary_occurred_at: string;
      }>(
        `
      SELECT DISTINCT i.id AS incident_id, i.occurrence_count, primary_event.event_id AS primary_event_id,
        primary_event.occurred_at::text AS primary_occurred_at
      FROM evidence_context_events f JOIN incident_events ie ON ie.event_id=f.event_id AND ie.is_sampled=true
      JOIN incidents i ON i.id=ie.incident_id AND i.project_id=f.project_id
      JOIN LATERAL (SELECT event_id, occurred_at FROM incident_events p WHERE p.incident_id=i.id AND p.is_sampled=true
        AND p.event_class='incident_signal'
        AND p.event_type IN ('backend_exception','frontend_exception','request_event','log_event')
        ORDER BY occurred_at DESC,event_id DESC LIMIT 1) primary_event ON true
      WHERE f.project_id=$1 AND f.service_name=$2 AND f.environment=$3 AND f.failure_hash=$4 AND f.scope_kind=$5 AND f.scope_hash=$6
        AND f.kind='failure' AND f.expires_at>now() AND $7::timestamptz BETWEEN f.occurred_at AND f.occurred_at + interval '5 minutes'
        AND ((f.scope_kind='page' AND f.session_hash=$8) OR (f.scope_kind='operation' AND f.trace_hash IS NOT DISTINCT FROM $9::text))
        AND NOT EXISTS (SELECT 1 FROM evidence_context_events other WHERE other.project_id=f.project_id AND other.service_name=f.service_name
          AND other.environment=f.environment AND other.failure_hash=f.failure_hash AND other.scope_kind=f.scope_kind AND other.scope_hash=f.scope_hash
          AND other.kind='failure' AND other.event_id<>f.event_id AND other.expires_at>now())
      ORDER BY i.id LIMIT 50`,
        [
          projectId,
          event.service.name,
          event.service.environment,
          failureHash,
          scope.kind,
          scopeHash,
          event.occurred_at,
          sessionHash,
          traceHash
        ]
      );
      for (const incident of incidents.rows)
        await createWorkerJobStore(db).enqueue("build-bundle", {
          project_id: projectId,
          incident_id: incident.incident_id,
          event_id: event.event_id,
          occurred_at: event.occurred_at,
          occurrence_count: incident.occurrence_count,
          trigger: "new_context_type",
          primary_event_id: incident.primary_event_id,
          primary_occurred_at: new Date(incident.primary_occurred_at).toISOString()
        });
    }
  };
}
