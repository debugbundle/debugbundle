import { z } from "zod";
import type { Queryable } from "./types.js";

const Input = z
  .object({
    projectId: z.string().uuid(),
    namespaceRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    occurredAt: z.string().datetime({ precision: 3 }),
    subjectRefs: z
      .array(
        z
          .object({
            kind: z.enum(["anonymous", "user", "account"]),
            ref: z.string().regex(/^sha256:[a-f0-9]{64}$/)
          })
          .strict()
      )
      .min(1)
      .max(3)
  })
  .strict();

/** Called under the project lock before ACK and before a worker may project. */
export async function hasProjectAnalyticsSubjectErasureFence(
  tx: Queryable,
  input: z.infer<typeof Input>
): Promise<boolean> {
  const parsed = Input.parse(input);
  const found = await tx.query(
    `SELECT 1 FROM analytics_project_subject_erasures erasure
     WHERE erasure.project_id=$1::uuid AND erasure.namespace_revision=$2
       AND erasure.cutoff_at>=$3::timestamptz
       AND (EXISTS (
         SELECT 1 FROM unnest($4::text[],$5::text[]) AS subject(kind,ref)
         WHERE subject.kind=erasure.subject_kind AND subject.ref=erasure.subject_ref
       ) OR (erasure.subject_kind IN ('user','account') AND EXISTS (
         SELECT 1 FROM analytics_project_identity_associations association
         JOIN unnest($4::text[],$5::text[]) AS subject(kind,ref)
           ON subject.kind='anonymous' AND subject.ref=association.anonymous_id_hash
         WHERE association.project_id=erasure.project_id
           AND association.namespace_revision=erasure.namespace_revision
           AND ((erasure.subject_kind='user'
               AND association.user_id_hash=erasure.subject_ref)
             OR (erasure.subject_kind='account'
               AND association.account_id_hash=erasure.subject_ref))
       ))) LIMIT 1`,
    [
      parsed.projectId,
      parsed.namespaceRevision,
      parsed.occurredAt,
      parsed.subjectRefs.map((subject) => subject.kind),
      parsed.subjectRefs.map((subject) => subject.ref)
    ]
  );
  return found.rows.length > 0;
}
