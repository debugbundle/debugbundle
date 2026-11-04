import type { Queryable } from "./types.js";

const identifier = (name: string): string => `"${name.replaceAll('"', '""')}"`;

/** Preserve PostgreSQL's existing user-FK cleanup, including collaborations in
 * other accounts. Only the deleted user's references may cascade there. */
export async function prepareAccountUserProjectCleanup(
  db: Queryable,
  userId: string
): Promise<void> {
  // Block new FK references before discovering the user's project participation.
  await db.query("SELECT id FROM users WHERE id=$1::uuid FOR UPDATE", [userId]);
  const references = await db.query<{
    table_name: string;
    user_column: string;
    project_column: string;
  }>(
    `SELECT DISTINCT rel.relname AS table_name,
   user_col.attname AS user_column,project_col.attname AS project_column
   FROM pg_constraint users_fk JOIN pg_class rel ON rel.oid=users_fk.conrelid
   JOIN pg_namespace ns ON ns.oid=rel.relnamespace AND ns.nspname='public'
   JOIN pg_attribute user_col ON user_col.attrelid=rel.oid AND user_col.attnum=users_fk.conkey[1]
   JOIN pg_constraint project_fk ON project_fk.conrelid=rel.oid AND project_fk.contype='f' AND project_fk.confrelid='public.projects'::regclass
   JOIN pg_attribute project_col ON project_col.attrelid=rel.oid AND project_col.attnum=project_fk.conkey[1]
   WHERE users_fk.contype='f' AND users_fk.confrelid='public.users'::regclass
     AND cardinality(users_fk.conkey)=1 AND cardinality(project_fk.conkey)=1
   ORDER BY table_name,user_column,project_column`,
    []
  );
  const ids = new Set<string>();
  for (const ref of references.rows) {
    const rows = await db.query<{ project_id: string }>(
      `SELECT DISTINCT ${identifier(ref.project_column)}::text AS project_id FROM public.${identifier(ref.table_name)}
     WHERE ${identifier(ref.user_column)}=$1::uuid AND ${identifier(ref.project_column)} IS NOT NULL`,
      [userId]
    );
    for (const row of rows.rows) ids.add(row.project_id);
  }
  if (!ids.size) return;
  const selected = [...ids].sort();
  let locked: { rows: { id: string }[] };
  try {
    locked = await db.query<{ id: string }>(
      `SELECT id FROM projects WHERE id=ANY(ARRAY(
   SELECT unnest(debugbundle_project_origins(debugbundle_canonical_project(id))) FROM projects WHERE id=ANY($1::uuid[]))) ORDER BY id FOR UPDATE NOWAIT`,
      [selected]
    );
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "55P03")
      throw Object.assign(new Error("project_merge_in_progress"), { code: "40001" });
    throw error;
  }
  const origins = locked.rows.map((row) => row.id);
  const complete = await db.query<{ complete: boolean }>(
    `SELECT count(*)=cardinality($1::uuid[]) AND
   COALESCE(bool_and(debugbundle_project_origins(debugbundle_canonical_project(id))<@$2::uuid[]),false) AS complete FROM projects WHERE id=ANY($1::uuid[])`,
    [selected, origins]
  );
  if (complete.rows[0]?.complete !== true)
    throw Object.assign(new Error("project_scope_changed_retry"), { code: "40001" });
  await db.query("SELECT debugbundle_assert_project_scope_current(id) FROM unnest($1::uuid[]) id", [
    origins
  ]);
  await db.query(
    "SELECT set_config('debugbundle.account_deletion_user',$1,true),set_config('debugbundle.account_deletion_projects',$2::uuid[]::text,true)",
    [userId, origins]
  );
}
