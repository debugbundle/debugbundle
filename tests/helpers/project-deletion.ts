/** SQL fixtures for the shared deletion fence. Data reads/deletes remain owned
 * by each functional test; integration tests exercise real FK/lock behaviour. */
export function projectDeletionControlRows(
  sql: string,
  projectIds: string[] = ["proj_123"]
): { rows: Record<string, unknown>[] } | null {
  if (sql.startsWith("SELECT organization_id FROM projects WHERE id="))
    return { rows: [{ organization_id: "org_123" }] };
  if (sql.startsWith("SELECT id FROM projects WHERE id=$1::uuid\n"))
    return { rows: projectIds.slice(0, 1).map((id) => ({ id })) };
  if (sql.startsWith("SELECT unnest(debugbundle_project_origins"))
    return { rows: projectIds.map((id) => ({ id })) };
  if (sql.startsWith("SELECT count(*)=cardinality")) return { rows: [{ complete: true }] };
  if (
    sql === "SELECT id FROM users WHERE id=$1::uuid FOR UPDATE" ||
    sql.includes("FROM pg_constraint users_fk") ||
    sql.startsWith("SELECT id FROM organizations WHERE id=$1::uuid FOR UPDATE") ||
    sql.startsWith("SELECT debugbundle_assert_") ||
    sql.startsWith(
      "SELECT id FROM projects WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE NOWAIT"
    ) ||
    sql.startsWith("SELECT set_config('debugbundle.project_deletion_origins'") ||
    sql.startsWith("DELETE FROM weekly_report_channel_aliases") ||
    sql.startsWith("DELETE FROM project_legacy_bindings") ||
    /^DELETE FROM (probe_activations|availability_checks|services) WHERE project_id=ANY/.test(sql)
  )
    return { rows: [] };
  return null;
}
