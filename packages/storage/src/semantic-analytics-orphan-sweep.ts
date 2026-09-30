import { buildSemanticAnalyticsRawEventObjectKey } from "./helpers.js";
import type { ObjectStoreDeleteInput, ObjectStoreLister } from "./object-store-types.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

const PREFIX = "semantic-events/";
const PAGE_SIZE = 100;
const OLD_OBJECT_MS = 2 * 60 * 60 * 1_000;
const UUID = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const KEY = new RegExp(
  `^semantic-events/(${UUID})/(\\d{4})/(\\d{2})/(\\d{2})/(\\d{2})/(${UUID})/([a-f0-9]{64})\\.json\\.gz$`
);

function parseObjectKey(
  key: string
): { projectId: string; eventId: string; contentHash: string } | null {
  const match = KEY.exec(key);
  if (match === null) return null;
  const [, projectId, year, month, day, hour, eventId, digest] = match;
  const occurredAt = new Date(`${year}-${month}-${day}T${hour}:00:00.000Z`);
  const contentHash = `sha256:${digest}`;
  if (
    !Number.isFinite(occurredAt.getTime()) ||
    buildSemanticAnalyticsRawEventObjectKey({
      projectId: projectId!,
      eventId: eventId!,
      occurredAt,
      contentHash
    }) !== key
  )
    return null;
  return { projectId: projectId!, eventId: eventId!, contentHash };
}

/** Resume a bounded S3 scan and fence any unowned deletion against concurrent admission. */
export async function sweepOldUnownedSemanticAnalyticsObjects(
  db: Queryable,
  input: {
    objectStore: ObjectStoreLister & {
      deleteObject(input: ObjectStoreDeleteInput): Promise<void>;
    };
    now: string;
  }
): Promise<{ scanned: number; deleted: number; hasMore: boolean }> {
  const now = new Date(input.now);
  if (!Number.isFinite(now.getTime()) || now.toISOString() !== input.now)
    throw new Error("semantic_orphan_sweep_time_invalid");
  await db.query(
    "INSERT INTO semantic_analytics_orphan_sweep_state(id) VALUES(1) ON CONFLICT(id) DO NOTHING",
    []
  );
  const state = await db.query<{ last_key: string | null; version: string }>(
    "SELECT last_key,version FROM semantic_analytics_orphan_sweep_state WHERE id=1",
    []
  );
  const lastKey = state.rows[0]?.last_key ?? null;
  const version = state.rows[0]?.version;
  if (version === undefined) throw new Error("semantic_orphan_sweep_state_missing");
  const page = await input.objectStore.listObjects({
    prefix: PREFIX,
    ...(lastKey === null ? {} : { startAfter: lastKey }),
    maxKeys: PAGE_SIZE,
    signal: AbortSignal.timeout(10_000)
  });
  let prior = lastKey ?? PREFIX;
  if (page.objects.length > PAGE_SIZE || (page.hasMore && page.objects.length === 0))
    throw new Error("semantic_orphan_sweep_listing_invalid");
  for (const object of page.objects) {
    if (
      !object.key.startsWith(PREFIX) ||
      object.key <= prior ||
      !(object.lastModifiedAt instanceof Date) ||
      !Number.isFinite(object.lastModifiedAt.getTime())
    )
      throw new Error("semantic_orphan_sweep_listing_invalid");
    prior = object.key;
  }

  let deleted = 0;
  for (const object of page.objects) {
    if (object.lastModifiedAt.getTime() > now.getTime() - OLD_OBJECT_MS) continue;
    const parsed = parseObjectKey(object.key);
    if (parsed === null) continue;
    const action = await runInTransaction(db, async (tx) => {
      const project = await tx.query("SELECT id FROM projects WHERE id=$1::uuid FOR UPDATE", [
        parsed.projectId
      ]);
      if (project.rows.length === 0) return "delete" as const;
      const owned = await tx.query(
        `SELECT 1 FROM semantic_analytics_receipts
         WHERE project_id=$1::uuid AND event_id=$2::uuid AND raw_object_key=$3
           AND raw_status IN ('active','deleting')
         UNION ALL
         SELECT 1 FROM semantic_analytics_pending_objects
         WHERE project_id=$1::uuid AND event_id=$2::uuid AND raw_object_key=$3
         LIMIT 1`,
        [parsed.projectId, parsed.eventId, object.key]
      );
      if (owned.rows.length !== 0) return "skip" as const;
      const marker = await tx.query(
        `INSERT INTO semantic_analytics_pending_objects
           (project_id,event_id,content_hash,raw_object_key,status)
         VALUES($1::uuid,$2::uuid,$3,$4,'deleting')
         ON CONFLICT(project_id,event_id,content_hash) DO NOTHING RETURNING 1`,
        [parsed.projectId, parsed.eventId, parsed.contentHash, object.key]
      );
      return marker.rows.length === 1 ? ("marked" as const) : ("skip" as const);
    });
    if (action === "skip") continue;
    await input.objectStore.deleteObject({ key: object.key, signal: AbortSignal.timeout(10_000) });
    if (action === "marked") {
      await db.query(
        `DELETE FROM semantic_analytics_pending_objects
         WHERE project_id=$1::uuid AND event_id=$2::uuid AND content_hash=$3
           AND raw_object_key=$4 AND status='deleting'`,
        [parsed.projectId, parsed.eventId, parsed.contentHash, object.key]
      );
    }
    deleted += 1;
  }
  await db.query(
    `UPDATE semantic_analytics_orphan_sweep_state
     SET last_key=$1,version=version+1,updated_at=now()
     WHERE id=1 AND version=$2::bigint`,
    [page.hasMore ? page.objects.at(-1)!.key : null, version]
  );
  return { scanned: page.objects.length, deleted, hasMore: page.hasMore };
}
