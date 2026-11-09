import { z } from "zod";
import { lockReportRunClaim } from "./report-run-execution.js";
import { lockReportPdfClaim } from "./report-pdf-claim.js";
import { runInTransaction } from "./transaction.js";
import type { WorkerJobClaim } from "./worker-job-store.js";
import type { ObjectStoreClient, Queryable } from "./types.js";
import {
  ReportArtifactKindSchema as KindSchema,
  reportArtifactKey,
  reportArtifactDigest
} from "./report-artifact-key.js";
export { reportArtifactKey, reportArtifactDigest } from "./report-artifact-key.js";
type Kind = z.infer<typeof KindSchema>;
const columns = {
  facts: ["facts_object_key", "facts_sha256"],
  ready: ["ready_object_key", "ready_sha256"],
  pdf: ["pdf_object_key", "pdf_sha256"]
} as const;
const InputSchema = z
  .object({
    kind: KindSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    expires_at: z.string().datetime()
  })
  .strict();
export interface ReportArtifactStore {
  allocate(claim: WorkerJobClaim, input: z.infer<typeof InputSchema>): Promise<string>;
  attach(claim: WorkerJobClaim, input: z.infer<typeof InputSchema>): Promise<void>;
  persist(
    claim: WorkerJobClaim,
    input: { kind: Kind; body: Buffer; expires_at: string },
    objects: Pick<ObjectStoreClient, "putObject">
  ): Promise<void>;
  cleanupNext(objects: Pick<ObjectStoreClient, "deleteObject">): Promise<boolean>;
}

/** Content-addressed private objects cannot overwrite a newer worker's bytes.
 * The intent commits before PUT and survives account/run deletion. Cleanup
 * waits past the bounded PUT deadline; it never lists a user's whole bucket. */
export function createReportArtifactStore(db: Queryable): ReportArtifactStore {
  async function modify(
    claim: WorkerJobClaim,
    raw: z.infer<typeof InputSchema>,
    attach: boolean
  ): Promise<string> {
    const input = InputSchema.parse(raw);
    return runInTransaction(db, async (tx) => {
      if (claim.name === "render-smart-report-pdf" && input.kind !== "pdf")
        throw new Error("report_pdf_artifact_kind_invalid");
      const run = await (claim.name === "render-smart-report-pdf"
          ? lockReportPdfClaim(tx, claim)
          : lockReportRunClaim(tx, claim)),
        key = reportArtifactKey({
          organization_id: String(run["organization_id"]),
          definition_id: String(run["definition_id"]),
          run_id: String(run["id"]),
          kind: input.kind,
          sha256: input.sha256
        });
      const [keyColumn, hashColumn] = columns[input.kind];
      if (run[keyColumn] !== null && run[keyColumn] !== key)
        throw new Error("report_artifact_already_frozen");
      const valid = (
        await tx.query(
          "SELECT $1::timestamptz>clock_timestamp() AND $1::timestamptz<=$2::timestamptz+interval '91 days' AS valid",
          [input.expires_at, run["created_at"]]
        )
      ).rows[0]?.["valid"];
      if (valid !== true) throw new Error("report_artifact_expiry_invalid");
      if (!attach) {
        // Keep bounded upload grace without resetting a near-expiry object to ten minutes.
        const allocated = await tx.query(
          `INSERT INTO report_artifact_objects(object_key,organization_id,definition_id,run_id,artifact_kind,sha256,writer_lease_token,write_deadline_at,cleanup_after_at,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()+interval '60 seconds',GREATEST(clock_timestamp()+interval '2 minutes',LEAST(clock_timestamp()+interval '10 minutes',$8::timestamptz)),$8)
          ON CONFLICT(object_key) DO UPDATE SET writer_lease_token=EXCLUDED.writer_lease_token,write_deadline_at=EXCLUDED.write_deadline_at,
          cleanup_after_at=CASE WHEN report_artifact_objects.state='attached' THEN report_artifact_objects.cleanup_after_at ELSE EXCLUDED.cleanup_after_at END
          WHERE report_artifact_objects.state<>'deleting' AND report_artifact_objects.expires_at=EXCLUDED.expires_at RETURNING object_key`,
          [
            key,
            run["organization_id"],
            run["definition_id"],
            run["id"],
            input.kind,
            input.sha256,
            claim.token,
            input.expires_at
          ]
        );
        if (allocated.rows.length !== 1) throw new Error("report_artifact_intent_unavailable");
      } else {
        const attached = await tx.query(
          "UPDATE report_artifact_objects SET state='attached',cleanup_after_at=expires_at WHERE object_key=$1 AND writer_lease_token=$2 AND state IN ('allocated','attached') AND write_deadline_at>clock_timestamp() RETURNING object_key",
          [key, claim.token]
        );
        if (attached.rows.length !== 1) throw new Error("report_artifact_write_lease_lost");
        await tx.query(
          `UPDATE report_runs SET ${keyColumn}=$2,${hashColumn}=$3,expires_at=$4,updated_at=clock_timestamp() WHERE id=$1`,
          [run["id"], key, input.sha256, input.expires_at]
        );
      }
      return key;
    });
  }
  return {
    allocate: (claim, input) => modify(claim, input, false),
    async attach(claim, input): Promise<void> {
      await modify(claim, input, true);
    },
    async persist(claim, input, objects): Promise<void> {
      if (
        !Buffer.isBuffer(input.body) ||
        input.body.length > (input.kind === "pdf" ? 5 : 1) * 1024 * 1024
      )
        throw new Error("report_artifact_size_exceeded");
      const intent = {
        kind: KindSchema.parse(input.kind),
        sha256: reportArtifactDigest(input.body),
        expires_at: input.expires_at
      };
      const key = await modify(claim, intent, false);
      await objects.putObject({
        key,
        body: input.body,
        contentType: input.kind === "pdf" ? "application/pdf" : "application/json",
        timeoutMs: 55000
      });
      await modify(claim, intent, true);
    },
    async cleanupNext(objects): Promise<boolean> {
      if (!objects.deleteObject) throw new Error("report_object_deletion_unavailable");
      const row = (
        await db.query<Record<string, unknown>>(
          `WITH candidate AS (
        SELECT object_key FROM report_artifact_objects WHERE cleanup_after_at<=clock_timestamp()
        ORDER BY cleanup_after_at,object_key FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE report_artifact_objects a SET state='deleting',cleanup_after_at=clock_timestamp()+interval '1 minute'
        FROM candidate c WHERE a.object_key=c.object_key RETURNING a.*`,
          []
        )
      ).rows[0];
      if (!row) return false;
      const key = reportArtifactKey({
        organization_id: String(row["organization_id"]),
        definition_id: String(row["definition_id"]),
        run_id: String(row["run_id"]),
        kind: KindSchema.parse(row["artifact_kind"]),
        sha256: String(row["sha256"])
      });
      if (key !== row["object_key"]) throw new Error("report_artifact_namespace_invalid");
      await objects.deleteObject({ key, timeoutMs: 30000 });
      await db.query(
        "DELETE FROM report_artifact_objects WHERE object_key=$1 AND state='deleting'",
        [key]
      );
      return true;
    }
  };
}
