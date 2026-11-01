import type {
  ObjectStoreClient,
  Queryable,
  RetentionRawEventReference,
  RetentionStore
} from "./types.js";
import { buildRawEventObjectKey } from "./helpers.js";

export function createEvidenceContextRetentionStore(
  db: Queryable
): Required<
  Pick<RetentionStore, "listExpiredDiagnosticRawEvents" | "deleteExpiredDiagnosticRawEvents">
> {
  return {
    async listExpiredDiagnosticRawEvents(input) {
      const result = await db.query<RetentionRawEventReference & Record<string, unknown>>(
        `SELECT project_id::text, event_id::text, occurred_at::text
        FROM evidence_context_events WHERE kind <> 'failure' AND expires_at <= $1::timestamptz
        UNION
        SELECT project_id::text,event_id::text,occurred_at::text
        FROM evidence_ingestion_receipts WHERE is_diagnostic=true AND expires_at <= $1::timestamptz
        ORDER BY occurred_at,event_id LIMIT $2`,
        [input.now, input.limit]
      );
      return result.rows;
    },
    async deleteExpiredDiagnosticRawEvents(input) {
      if (input.references.length === 0) return;
      const params = input.references.flatMap((reference) => [
        reference.project_id,
        reference.event_id
      ]);
      const values = input.references
        .map((_, i) => `($${i * 2 + 1}::uuid,$${i * 2 + 2}::uuid)`)
        .join(",");
      await db.query(
        `WITH expired(project_id,event_id) AS (VALUES ${values}), removed AS (
        DELETE FROM evidence_ingestion_receipts r USING expired
        WHERE r.project_id=expired.project_id AND r.event_id=expired.event_id AND r.is_diagnostic=true RETURNING r.event_id)
        DELETE FROM evidence_context_events e USING expired
        WHERE e.project_id=expired.project_id AND e.event_id=expired.event_id AND e.kind <> 'failure'`,
        params
      );
    }
  };
}

/** Delete objects before their index rows, leaving failed deletions discoverable. */
export async function cleanupDiagnosticContextRaw(
  store: Pick<
    RetentionStore,
    "listExpiredDiagnosticRawEvents" | "deleteExpiredDiagnosticRawEvents"
  >,
  objects: Pick<ObjectStoreClient, "deleteObject">,
  input: { now: string; limit: number }
): Promise<{ found: number; deleted: number }> {
  if (
    !store.listExpiredDiagnosticRawEvents ||
    !store.deleteExpiredDiagnosticRawEvents ||
    !objects.deleteObject
  )
    return { found: 0, deleted: 0 };
  const references = await store.listExpiredDiagnosticRawEvents(input),
    deleted: RetentionRawEventReference[] = [];
  for (const reference of references) {
    try {
      await objects.deleteObject({
        key: buildRawEventObjectKey({
          projectId: reference.project_id,
          eventId: reference.event_id,
          occurredAt: new Date(reference.occurred_at)
        })
      });
      deleted.push(reference);
    } catch {
      /* Keep the cleanup tombstone for a later bounded retry. */
    }
  }
  if (deleted.length) await store.deleteExpiredDiagnosticRawEvents({ references: deleted });
  return { found: references.length, deleted: deleted.length };
}
