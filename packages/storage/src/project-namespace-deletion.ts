import type { Queryable } from "./types.js";

/** Call only inside the authorised deletion transaction. Historical namespaces
 * are removed together; ordinary alias deletes never enter this context. */
export async function prepareProjectNamespaceDeletion(
  db: Queryable,
  input: { project_id: string; owner_user_id?: string; organization_id?: string }
): Promise<string[] | null> {
  const access = await db.query<{ organization_id: string }>(
    `SELECT organization_id FROM projects WHERE id=$1::uuid
   AND ($2::uuid IS NULL OR owner_user_id=$2::uuid) AND ($3::uuid IS NULL OR organization_id=$3::uuid)`,
    [input.project_id, input.owner_user_id ?? null, input.organization_id ?? null]
  );
  if (!access.rows[0]) return null;
  await db.query("SELECT id FROM organizations WHERE id=$1::uuid FOR UPDATE", [
    access.rows[0].organization_id
  ]);
  await db.query("SELECT debugbundle_assert_canonical_project_write($1::uuid)", [input.project_id]);
  // Ownership may have changed while waiting for the cutover fence.
  const current = await db.query<{ id: string }>(
    `SELECT id FROM projects WHERE id=$1::uuid
    AND ($2::uuid IS NULL OR owner_user_id=$2::uuid) AND ($3::uuid IS NULL OR organization_id=$3::uuid)`,
    [input.project_id, input.owner_user_id ?? null, input.organization_id ?? null]
  );
  if (!current.rows[0]) return null;
  const origins = await db.query<{ id: string }>(
    "SELECT unnest(debugbundle_project_origins($1::uuid))::text AS id",
    [input.project_id]
  );
  const ids = origins.rows.map((row) => row.id);
  await prepareOriginDeletion(db, ids);
  return ids;
}

/** Account deletion already owns its complete physical project set. */
export async function prepareOriginDeletion(
  db: Queryable,
  ids: string[],
  organizationId?: string
): Promise<void> {
  if (!ids.length) return;
  await db.query("SELECT id FROM projects WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE NOWAIT", [
    ids
  ]);
  await db.query("SELECT debugbundle_assert_project_scope_current(id) FROM unnest($1::uuid[]) id", [
    ids
  ]);
  const complete = await db.query<{ complete: boolean }>(
    `SELECT count(*)=cardinality($1::uuid[]) AND
    COALESCE(bool_and(debugbundle_project_origins(debugbundle_canonical_project(id))<@$1::uuid[]
      AND ($2::uuid IS NULL OR organization_id=$2::uuid)),false) AS complete
    FROM projects WHERE id=ANY($1::uuid[])`,
    [ids, organizationId ?? null]
  );
  if (complete.rows[0]?.complete !== true)
    throw Object.assign(new Error("project_scope_changed_retry"), { code: "40001" });
  await db.query(
    "SELECT set_config('debugbundle.project_deletion_origins',$1::uuid[]::text,true)",
    [ids]
  );
  // Remove restrictive lineage references before their parent journals/catalogue.
  // This runs only for the complete, locked namespace set in a deletion transaction.
  await db.query(
    "DELETE FROM weekly_report_channel_aliases WHERE legacy_channel_id IN (SELECT id FROM weekly_report_channels WHERE project_id=ANY($1::uuid[]))",
    [ids]
  );
  await db.query(
    "DELETE FROM project_legacy_bindings WHERE legacy_project_id=ANY($1::uuid[]) AND canonical_project_id=ANY($1::uuid[])",
    [ids]
  );
  for (const table of ["probe_activations", "availability_checks", "services"]) {
    await db.query(`DELETE FROM ${table} WHERE project_id=ANY($1::uuid[])`, [ids]);
  }
}
