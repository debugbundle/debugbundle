import { z } from "zod";
import { AcceptedReportScopeSchema } from "../../smart-reports/src/report-definition.js";
import { ReportIdentitySetSchema } from "../../smart-reports/src/report-identity.js";
import type { Queryable } from "./types.js";

/** Caller must first authorise the entire saved scope. Only non-secret metadata
 * is selected; project-token hashes/credentials never enter this projection. */
export async function readReportIdentities(
  db: Queryable,
  scope: unknown,
  runId?: string
): Promise<string[]> {
  const ids = AcceptedReportScopeSchema.parse(scope).flatMap((view) => view.origin_project_ids);
  const rows = await db.query<{ identity: string }>(
    `SELECT DISTINCT identity FROM (
      SELECT name AS identity FROM projects WHERE id=ANY($1::uuid[])
      UNION ALL SELECT slug FROM projects WHERE id=ANY($1::uuid[])
      UNION ALL SELECT name FROM projects WHERE id IN (SELECT debugbundle_canonical_project(id) FROM unnest($1::uuid[]) AS origins(id))
      UNION ALL SELECT slug FROM projects WHERE id IN (SELECT debugbundle_canonical_project(id) FROM unnest($1::uuid[]) AS origins(id))
      UNION ALL SELECT name FROM services WHERE project_id=ANY($1::uuid[])
      UNION ALL SELECT name FROM service_definitions WHERE origin_project_id=ANY($1::uuid[])
      UNION ALL SELECT jsonb_array_elements_text(allowed_origins) FROM project_tokens WHERE COALESCE(scope_origin_ids,ARRAY[project_id]) && $1::uuid[]
      UNION ALL SELECT jsonb_array_elements_text(identities) FROM report_identity_snapshots WHERE run_id=$2::uuid
    ) aliases WHERE identity<>'' ORDER BY identity LIMIT 2049`,
    [ids, runId ?? null]
  );
  if (rows.rows.length > 2048) throw new Error("report_identity_limit_exceeded");
  const values = rows.rows.flatMap(({ identity }) => {
    if (identity.length > 320) throw new Error("report_identity_limit_exceeded");
    try {
      const url = new URL(identity);
      if (url.protocol === "https:" || url.protocol === "http:") return [url.hostname];
    } catch {
      /* Names and slugs are not URLs. */
    }
    return [identity];
  });
  return ReportIdentitySetSchema.parse([...new Set(values)]);
}
export async function captureReportIdentities(
  db: Queryable,
  runId: string,
  scope: unknown
): Promise<void> {
  const identities = await readReportIdentities(db, scope);
  await db.query("INSERT INTO report_identity_snapshots(run_id,identities) VALUES($1,$2::jsonb)", [
    z.uuid().parse(runId),
    JSON.stringify(identities)
  ]);
}
