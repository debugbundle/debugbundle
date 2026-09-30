import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import {
  AnalyticsSubjectErasureReceiptSchema,
  AnalyticsSubjectErasureRequestSchema,
  AnalyticsSubjectErasureTaskStatusSchema,
  type AnalyticsSubjectErasureReceipt,
  type AnalyticsSubjectErasureRequest,
  type AnalyticsSubjectErasureTaskStatus
} from "../../shared-types/src/analytics-identity.js";
import { lockAnalyticsWriterProject } from "./analytics-writer-access.js";
import { createAnalyticsWriterStore } from "./analytics-writer-store.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

const TokenHash = z.string().regex(/^[a-f0-9]{64}$/);
type Result =
  | { kind: "invalid" | "unavailable" | "conflict" }
  | { kind: "accepted"; receipt: AnalyticsSubjectErasureReceipt };
type Row = {
  task_id: string;
  mutation_hash: string;
  cutoff_at: Date;
  status: "pending" | "complete";
};
const StatusInput = z
  .object({
    actorUserId: z.string().uuid(),
    projectId: z.string().uuid(),
    taskId: z.string().uuid()
  })
  .strict();

/** Member status is scoped to one currently authorized project and contains no subject reference. */
export async function readProjectAnalyticsSubjectErasureStatus(
  db: Queryable,
  input: z.infer<typeof StatusInput>
): Promise<
  | { kind: "invalid" | "forbidden" | "not_found" }
  | { kind: "status"; task: AnalyticsSubjectErasureTaskStatus }
> {
  const parsed = StatusInput.safeParse(input);
  if (!parsed.success) return { kind: "invalid" };
  return runInTransaction(db, async (tx) => {
    if (
      (await lockAnalyticsWriterProject(tx, parsed.data.projectId, parsed.data.actorUserId)) ===
      null
    )
      return { kind: "forbidden" as const };
    const row = (
      await tx.query<{
        task_id: string;
        project_id: string;
        cutoff_at: Date;
        status: "pending" | "complete";
        completed_at: Date | null;
      }>(
        `SELECT task_id,project_id,cutoff_at,status,completed_at
         FROM analytics_project_subject_erasures
         WHERE project_id=$1::uuid AND task_id=$2::uuid`,
        [parsed.data.projectId, parsed.data.taskId]
      )
    ).rows[0];
    if (row === undefined) return { kind: "not_found" as const };
    return {
      kind: "status" as const,
      task: AnalyticsSubjectErasureTaskStatusSchema.parse({
        protocol: "2026-09-analytics-erasure-01",
        task_id: row.task_id,
        project_id: row.project_id,
        cutoff_at: row.cutoff_at.toISOString(),
        status: row.status,
        completed_at: row.completed_at?.toISOString() ?? null
      })
    };
  });
}

function receipt(row: Row, replayed: boolean): AnalyticsSubjectErasureReceipt {
  return AnalyticsSubjectErasureReceiptSchema.parse({
    protocol: "2026-09-analytics-erasure-01",
    task_id: row.task_id,
    cutoff_at: row.cutoff_at.toISOString(),
    status: row.status,
    replayed
  });
}

/** The first-party writer token selects the project; the HTTP adapter remains disabled by default. */
export async function requestProjectAnalyticsSubjectErasure(
  db: Queryable,
  credentialHash: string,
  request: AnalyticsSubjectErasureRequest
): Promise<Result> {
  const parsed = AnalyticsSubjectErasureRequestSchema.safeParse(request);
  if (!TokenHash.safeParse(credentialHash).success || !parsed.success) return { kind: "invalid" };
  const hash = createHash("sha256").update(stableJson(parsed.data)).digest("hex");
  return runInTransaction<Result>(db, async (tx) => {
    const writerStore = createAnalyticsWriterStore(tx);
    const candidate = await writerStore.resolveByTokenHash(credentialHash);
    if (candidate === null || !["relay", "server"].includes(candidate.kind))
      return { kind: "unavailable" };
    const organization = await tx.query(
      "SELECT id FROM organizations WHERE id=$1::uuid AND suspended_at IS NULL FOR SHARE",
      [candidate.organization_id]
    );
    if (organization.rows.length !== 1) return { kind: "unavailable" };
    const project = await tx.query(
      "SELECT id FROM projects WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
      [candidate.project_id, candidate.organization_id]
    );
    if (project.rows.length !== 1) return { kind: "unavailable" };
    const writer = await writerStore.resolveByTokenHash(credentialHash);
    const live =
      writer === null || writer.writer_id !== candidate.writer_id || writer.kind !== candidate.kind
        ? undefined
        : (
            await tx.query<{ expires_at: Date; revoked_at: Date | null }>(
              `SELECT expires_at,revoked_at FROM analytics_writers
               WHERE id=$1::uuid AND project_id=$2::uuid AND token_hash=$3 FOR SHARE`,
              [writer.writer_id, writer.project_id, credentialHash]
            )
          ).rows[0];
    if (live === undefined || live.revoked_at !== null || live.expires_at.getTime() <= Date.now())
      return { kind: "unavailable" };
    const namespace = (
      await tx.query<{ namespace_revision: string }>(
        `SELECT namespace_revision FROM analytics_project_identity_namespaces
         WHERE project_id=$1::uuid FOR SHARE`,
        [writer!.project_id]
      )
    ).rows[0];
    if (
      namespace === undefined ||
      Number(namespace.namespace_revision) < parsed.data.namespace_revision
    )
      return { kind: "unavailable" };

    const prior = (
      await tx.query<Row>(
        `SELECT task_id,mutation_hash,cutoff_at,status
         FROM analytics_project_subject_erasures
         WHERE project_id=$1::uuid AND writer_id=$2::uuid AND idempotency_key=$3::uuid
         FOR UPDATE`,
        [writer!.project_id, writer!.writer_id, parsed.data.idempotency_key]
      )
    ).rows[0];
    if (prior !== undefined)
      return prior.mutation_hash === hash
        ? { kind: "accepted", receipt: receipt(prior, true) }
        : { kind: "conflict" };

    const created = (
      await tx.query<Row>(
        `INSERT INTO analytics_project_subject_erasures(
           task_id,project_id,writer_id,idempotency_key,mutation_hash,
           namespace_revision,subject_kind,subject_ref,cutoff_at)
         VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8,clock_timestamp())
         RETURNING task_id,mutation_hash,cutoff_at,status`,
        [
          randomUUID(),
          writer!.project_id,
          writer!.writer_id,
          parsed.data.idempotency_key,
          hash,
          parsed.data.namespace_revision,
          parsed.data.subject_kind,
          parsed.data.subject_ref
        ]
      )
    ).rows[0];
    if (created === undefined) throw new Error("semantic_subject_erasure_task_unavailable");
    const parameters = [
      writer!.project_id,
      parsed.data.namespace_revision,
      parsed.data.subject_kind,
      parsed.data.subject_ref,
      created.cutoff_at.toISOString()
    ];
    await tx.query(
      `INSERT INTO analytics_project_identity_epoch_revocations(
         project_id,writer_id,producer_epoch,revoked_at)
       SELECT DISTINCT project_id,writer_id,producer_epoch,$5::timestamptz
       FROM analytics_project_identity_contexts
       WHERE project_id=$1::uuid AND namespace_revision=$2
         AND (($3='anonymous' AND anonymous_id_hash=$4)
           OR ($3='user' AND user_id_hash=$4)
           OR ($3='account' AND account_id_hash=$4))
       ON CONFLICT(project_id,writer_id,producer_epoch) DO NOTHING`,
      parameters
    );
    await tx.query(
      `INSERT INTO analytics_project_identity_epoch_revocations(
         project_id,writer_id,producer_epoch,revoked_at)
       SELECT DISTINCT project_id,writer_id,producer_epoch,$5::timestamptz
       FROM analytics_project_identity_associations
       WHERE project_id=$1::uuid AND namespace_revision=$2
         AND (($3='anonymous' AND anonymous_id_hash=$4)
           OR ($3='user' AND user_id_hash=$4)
           OR ($3='account' AND account_id_hash=$4))
       ON CONFLICT(project_id,writer_id,producer_epoch) DO NOTHING`,
      parameters
    );
    await tx.query(
      `INSERT INTO analytics_project_identity_epoch_revocations(
         project_id,writer_id,producer_epoch,revoked_at)
       SELECT DISTINCT r.project_id,r.identity_writer_id,r.identity_producer_epoch,
         $5::timestamptz
       FROM semantic_analytics_receipts r
       JOIN semantic_analytics_receipt_subjects subject
         ON subject.project_id=r.project_id AND subject.event_id=r.event_id
           AND subject.namespace_revision=r.namespace_revision
       WHERE r.project_id=$1::uuid AND r.namespace_revision=$2
         AND r.identity_writer_id IS NOT NULL AND r.identity_producer_epoch IS NOT NULL
         AND r.occurred_at<=$5::timestamptz
         AND ((subject.subject_kind=$3 AND subject.subject_ref=$4)
           OR ($3 IN ('user','account') AND subject.subject_kind='anonymous'
             AND EXISTS (
               SELECT 1 FROM analytics_project_identity_associations association
               WHERE association.project_id=r.project_id
                 AND association.namespace_revision=r.namespace_revision
                 AND association.anonymous_id_hash=subject.subject_ref
                 AND (($3='user' AND association.user_id_hash=$4)
                   OR ($3='account' AND association.account_id_hash=$4)))))
       ON CONFLICT(project_id,writer_id,producer_epoch) DO NOTHING`,
      parameters
    );
    await tx.query(
      `DELETE FROM analytics_project_identity_contexts context
       WHERE context.project_id=$1::uuid AND context.namespace_revision=$2
         AND context.issued_at<=$5::timestamptz
         AND (($3='anonymous' AND context.anonymous_id_hash=$4)
           OR ($3='user' AND context.user_id_hash=$4)
           OR ($3='account' AND context.account_id_hash=$4)
           OR ($3 IN ('user','account') AND EXISTS (
             SELECT 1 FROM analytics_project_identity_associations association
             WHERE association.project_id=context.project_id
               AND association.namespace_revision=context.namespace_revision
               AND association.anonymous_id_hash=context.anonymous_id_hash
               AND (($3='user' AND association.user_id_hash=$4)
                 OR ($3='account' AND association.account_id_hash=$4)))))`,
      parameters
    );
    return { kind: "accepted", receipt: receipt(created, false) };
  });
}
