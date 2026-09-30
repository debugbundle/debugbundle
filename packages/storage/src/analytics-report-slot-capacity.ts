import type { Queryable } from "./types.js";

/** Call after locking the project row; space-plan apply locks every linked project first. */
export async function readActiveSpaceReportSlotsInTransaction(
  tx: Queryable,
  projectId: string,
  excludedSpaceId?: string
): Promise<number> {
  const row = (
    await tx.query<{ slots: number }>(
      `SELECT COALESCE(sum(jsonb_array_length(plan.reports)),0)::int AS slots
       FROM analytics_space_projects membership
       JOIN analytics_spaces space ON space.id=membership.space_id
         AND space.archived_at IS NULL
       JOIN analytics_space_plans plan ON plan.space_id=space.id
         AND plan.space_revision=space.revision
       WHERE membership.project_id=$1::uuid
         AND ($2::uuid IS NULL OR space.id<>$2::uuid)
         AND jsonb_array_length(plan.source_catalog_revisions)=(
           SELECT count(*) FROM analytics_space_projects source
           WHERE source.space_id=space.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(plan.source_catalog_revisions) source_revision
           WHERE NOT EXISTS (
             SELECT 1 FROM analytics_space_projects source
             JOIN analytics_project_catalogs catalog ON catalog.project_id=source.project_id
             WHERE source.space_id=space.id
               AND source.project_id=(source_revision->>'project_id')::uuid
               AND catalog.catalog_revision=(source_revision->>'catalog_revision')::bigint
           )
         )
         AND NOT EXISTS (
           SELECT 1 FROM analytics_space_projects source
           LEFT JOIN analytics_project_catalogs catalog ON catalog.project_id=source.project_id
           WHERE source.space_id=space.id AND NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(plan.source_catalog_revisions) source_revision
             WHERE source.project_id=(source_revision->>'project_id')::uuid
               AND catalog.catalog_revision=(source_revision->>'catalog_revision')::bigint
           )
         )`,
      [projectId, excludedSpaceId ?? null]
    )
  ).rows[0];
  if (row === undefined || !Number.isSafeInteger(row.slots) || row.slots < 0)
    throw new Error("analytics_space_report_slots_unavailable");
  return row.slots;
}
