import type { Queryable } from "./types.js";

/** Keep terminal invitation/acceptance hashes for 90 days, never active grants. */
export async function pruneExpiredOrganizationCredentials(
  db: Queryable,
  input: { now: string; limit: number }
): Promise<number> {
  let deleted = 0;
  for (const table of ["organization_invites", "organization_ownership_transfers"] as const) {
    const result = await db.query(
      `DELETE FROM ${table} WHERE id IN (
      SELECT id FROM ${table}
      WHERE COALESCE(accepted_at,canceled_at,expires_at) < $1::timestamptz - interval '90 days'
      ORDER BY COALESCE(accepted_at,canceled_at,expires_at),id LIMIT $2
    ) RETURNING id`,
      [input.now, input.limit]
    );
    deleted += result.rows.length;
  }
  return deleted;
}
