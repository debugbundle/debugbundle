import { z } from "zod";
import { SmartReportError } from "../../smart-reports/src/report-errors.js";
import { ReportReadInitiatorSchema, canReadReportScope } from "./report-read-authorization.js";
import { reportArtifactKey } from "./report-artifact-key.js";
import type { Queryable } from "./types.js";
export const ReportContentInputSchema = z
  .object({ organization_id: z.uuid(), id: z.uuid(), initiator: ReportReadInitiatorSchema })
  .strict();
export type ReportContentInput = z.infer<typeof ReportContentInputSchema>;
export async function readPublishedReportRun(
  db: Queryable,
  input: ReportContentInput,
  lock = false
): Promise<Record<string, unknown>> {
  const row = (
    await db.query<Record<string, unknown>>(
      `SELECT r.*,o.plan AS current_plan FROM report_runs r JOIN report_definitions d ON d.id=r.definition_id JOIN organizations o ON o.id=r.organization_id
      JOIN report_artifact_objects a ON a.object_key=r.ready_object_key AND a.run_id=r.id AND a.organization_id=r.organization_id
      AND a.artifact_kind='ready' AND a.sha256=r.ready_sha256 AND a.state='attached' AND a.expires_at>clock_timestamp()
      WHERE r.organization_id=$1 AND r.id=$2 AND r.status IN ('ready','factual_only') AND r.published_at IS NOT NULL
      AND r.expires_at>clock_timestamp() AND r.privacy_invalidated_at IS NULL
      AND (r.privacy_mode='restricted' OR (d.privacy_mode='full' AND d.source_collection_consent)) ${lock ? "FOR UPDATE OF r" : ""}`,
      [input.organization_id, input.id]
    )
  ).rows[0];
  if (
    !row ||
    !(await canReadReportScope(db, {
      organization_id: input.organization_id,
      scope: row["accepted_scope"],
      initiator: input.initiator
    }))
  )
    throw new SmartReportError("report_not_found");
  const key = reportArtifactKey({
    organization_id: input.organization_id,
    definition_id: z.uuid().parse(row["definition_id"]),
    run_id: input.id,
    kind: "ready",
    sha256: z.string().parse(row["ready_sha256"])
  });
  if (key !== row["ready_object_key"]) throw new Error("report_artifact_namespace_invalid");
  return row;
}
