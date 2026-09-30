import { createHash } from "node:crypto";
import { AnalyticsCatalogEntrySchema } from "../../shared-types/src/index.js";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import type { VerifiedSemanticAnalyticsWorkerInput } from "./semantic-analytics-worker-input.js";
import type { Queryable } from "./types.js";

/** The durable worker transaction owns exactly-once application and job completion. */
export async function recordSemanticAnalyticsCatalogObservationInTransaction(
  tx: Queryable,
  projectId: string,
  verified: VerifiedSemanticAnalyticsWorkerInput
): Promise<void> {
  const { event, provenance } = verified;
  const identity = provenance.identity_scope;
  if (
    provenance.scope.kind !== "project" ||
    provenance.scope.project_id !== projectId ||
    (identity !== null &&
      (identity.kind !== "project" ||
        identity.project_id !== projectId ||
        provenance.identity_writer_id === null ||
        (provenance.identity_verification !== "server_namespace" &&
          provenance.identity_context_id === null)))
  )
    throw new Error("semantic_worker_scope_unavailable");

  const historical = (
    await tx.query<{ entry: unknown; content_hash: string }>(
      `SELECT entry,content_hash FROM analytics_project_catalog_entry_revisions
       WHERE project_id=$1::uuid AND name=$2 AND revision=$3`,
      [projectId, event.payload.name, event.payload.event_revision]
    )
  ).rows[0];
  const parsed = AnalyticsCatalogEntrySchema.safeParse(historical?.entry);
  if (
    historical === undefined ||
    !parsed.success ||
    historical.content_hash !==
      createHash("sha256").update(stableJson(parsed.data)).digest("hex") ||
    parsed.data.name !== event.payload.name ||
    parsed.data.revision !== event.payload.event_revision ||
    parsed.data.purpose !== event.payload.purpose ||
    !parsed.data.producers.includes(event.producer.kind)
  )
    throw new Error("semantic_worker_catalog_unavailable");

  const observedOn = event.occurred_at.slice(0, 10);
  await tx.query(
    `INSERT INTO semantic_analytics_catalog_observations(
       project_id,catalog_revision,event_name,event_revision,producer_kind,observed_on,
       accepted_count,first_occurred_at,last_occurred_at,last_accepted_at
     ) VALUES($1::uuid,$2,$3,$4,$5,$6::date,1,$7::timestamptz,$7::timestamptz,$8::timestamptz)
     ON CONFLICT(project_id,catalog_revision,event_name,event_revision,producer_kind,observed_on)
     DO UPDATE SET accepted_count=semantic_analytics_catalog_observations.accepted_count+1,
       first_occurred_at=LEAST(semantic_analytics_catalog_observations.first_occurred_at,EXCLUDED.first_occurred_at),
       last_occurred_at=GREATEST(semantic_analytics_catalog_observations.last_occurred_at,EXCLUDED.last_occurred_at),
       last_accepted_at=GREATEST(semantic_analytics_catalog_observations.last_accepted_at,EXCLUDED.last_accepted_at),
       updated_at=now()`,
    [
      projectId,
      provenance.catalog_revision,
      event.payload.name,
      event.payload.event_revision,
      event.producer.kind,
      observedOn,
      event.occurred_at,
      provenance.accepted_at
    ]
  );
  // SDK metadata is submitted provenance, not proof of package authenticity or
  // the catalog's declared success boundary. Keep it separate from kind totals.
  await tx.query(
    `INSERT INTO semantic_analytics_producer_observations(
       project_id,catalog_revision,event_name,event_revision,producer_kind,sdk_name,sdk_version,
       observed_on,accepted_count,first_occurred_at,last_occurred_at,last_accepted_at
     ) VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8::date,1,$9::timestamptz,$9::timestamptz,$10::timestamptz)
     ON CONFLICT(project_id,catalog_revision,event_name,event_revision,producer_kind,sdk_name,sdk_version,observed_on)
     DO UPDATE SET accepted_count=semantic_analytics_producer_observations.accepted_count+1,
       first_occurred_at=LEAST(semantic_analytics_producer_observations.first_occurred_at,EXCLUDED.first_occurred_at),
       last_occurred_at=GREATEST(semantic_analytics_producer_observations.last_occurred_at,EXCLUDED.last_occurred_at),
       last_accepted_at=GREATEST(semantic_analytics_producer_observations.last_accepted_at,EXCLUDED.last_accepted_at),
       updated_at=now()`,
    [
      projectId,
      provenance.catalog_revision,
      event.payload.name,
      event.payload.event_revision,
      event.producer.kind,
      event.sdk_name,
      event.sdk_version,
      observedOn,
      event.occurred_at,
      provenance.accepted_at
    ]
  );
}
