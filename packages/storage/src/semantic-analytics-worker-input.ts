import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import {
  AnalyticsScopeSchema,
  MAX_SEMANTIC_ANALYTICS_EVENT_BYTES,
  SemanticAnalyticsEventSchema,
  type SemanticAnalyticsEvent
} from "../../shared-types/src/index.js";
import { buildSemanticAnalyticsRawEventObjectKey } from "./helpers.js";
import { loadCurrentProjectSemanticAnalyticsPolicy } from "./semantic-analytics-policy.js";
import { semanticAnalyticsSubjectRefs } from "./semantic-analytics-subject-refs.js";
import { hasProjectAnalyticsSubjectErasureFence } from "./analytics-subject-erasure-fence.js";
import type { ObjectStoreReader, Queryable } from "./types.js";

const JobSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  payload: z
    .object({
      project_id: z.string().uuid(),
      event_id: z.string().uuid(),
      content_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      object_key: z.string().min(1).max(512)
    })
    .strict()
});

interface ReceiptRow extends Record<string, unknown> {
  content_hash: string;
  operation_id: string | null;
  raw_object_key: string;
  worker_job_id: string;
  principal: "server_writer" | "project_token" | "relay";
  authority: "server_authoritative" | "client_observed";
  scope: unknown;
  scope_revision: string;
  catalog_revision: string;
  identity_scope: unknown;
  identity_verification: string | null;
  identity_context_id: string | null;
  identity_writer_id: string | null;
  identity_producer_epoch: string | null;
  namespace_revision: string | null;
  accepted_at: Date;
}

export interface VerifiedSemanticAnalyticsWorkerInput {
  event: SemanticAnalyticsEvent;
  provenance: {
    principal: ReceiptRow["principal"];
    authority: ReceiptRow["authority"];
    scope: z.infer<typeof AnalyticsScopeSchema>;
    scope_revision: number;
    catalog_revision: number;
    identity_scope: z.infer<typeof AnalyticsScopeSchema> | null;
    identity_verification:
      | "project_anonymous"
      | "first_party_association"
      | "server_namespace"
      | null;
    identity_context_id: string | null;
    identity_writer_id: string | null;
    identity_producer_epoch: string | null;
    accepted_at: string;
  };
}

function positiveRevision(value: string): number {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw new Error("semantic_worker_receipt_invalid");
  return revision;
}

/** Call inside the job's projection transaction; organization precedes project/receipt locks. */
export async function loadVerifiedSemanticAnalyticsWorkerInput(
  tx: Queryable,
  objectStore: Pick<ObjectStoreReader, "getObject">,
  input: { id: string; payload: Record<string, unknown> }
): Promise<VerifiedSemanticAnalyticsWorkerInput | null> {
  const job = JobSchema.parse(input);
  const owner = (
    await tx.query<{ organization_id: string }>(
      "SELECT organization_id FROM projects WHERE id=$1::uuid",
      [job.payload.project_id]
    )
  ).rows[0];
  if (owner === undefined) return null;
  const organization = await tx.query(
    "SELECT id FROM organizations WHERE id=$1::uuid AND suspended_at IS NULL FOR SHARE",
    [owner.organization_id]
  );
  if (organization.rows.length !== 1) return null;
  const project = await tx.query(
    "SELECT id FROM projects WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
    [job.payload.project_id, owner.organization_id]
  );
  if (project.rows.length !== 1) return null;
  const receipt = await tx.query<ReceiptRow>(
    `SELECT r.content_hash,r.operation_id,r.raw_object_key,r.worker_job_id,
       r.principal,r.authority,r.scope,r.scope_revision,r.catalog_revision,
       r.identity_scope,r.identity_verification,r.namespace_revision,r.accepted_at
       ,r.identity_context_id,r.identity_writer_id,r.identity_producer_epoch
     FROM semantic_analytics_receipts r
     WHERE r.project_id=$1::uuid AND r.event_id=$2::uuid AND r.expires_at>now()
       AND r.raw_status='active'
     FOR UPDATE OF r`,
    [job.payload.project_id, job.payload.event_id]
  );
  const row = receipt.rows[0];
  if (row === undefined) return null;
  if (
    row.worker_job_id !== job.id ||
    row.content_hash !== job.payload.content_hash ||
    row.raw_object_key !== job.payload.object_key
  )
    throw new Error("semantic_worker_job_receipt_mismatch");

  const scope = AnalyticsScopeSchema.parse(row.scope);
  const identityScope = AnalyticsScopeSchema.nullable().parse(row.identity_scope);
  const identityVerification = z
    .enum(["project_anonymous", "first_party_association", "server_namespace"])
    .nullable()
    .parse(row.identity_verification);
  const scopeRevision = positiveRevision(row.scope_revision);
  const catalogRevision = positiveRevision(row.catalog_revision);
  const namespaceRevision =
    row.namespace_revision === null ? null : positiveRevision(row.namespace_revision);
  if (
    (scope.kind === "project" && scope.project_id !== job.payload.project_id) ||
    (identityScope === null) !== (identityVerification === null) ||
    (identityScope === null) !== (namespaceRevision === null) ||
    (row.principal === "server_writer") !== (row.authority === "server_authoritative") ||
    (identityScope === null && row.identity_writer_id !== null) ||
    (row.identity_producer_epoch !== null && row.identity_context_id === null) ||
    (identityVerification === "server_namespace" &&
      (row.principal !== "server_writer" ||
        row.identity_context_id !== null ||
        row.identity_writer_id === null ||
        row.identity_producer_epoch !== null)) ||
    (identityScope !== null &&
      identityVerification !== "server_namespace" &&
      (row.identity_context_id === null || row.identity_writer_id === null)) ||
    (row.identity_context_id !== null &&
      (row.principal !== "relay" ||
        identityScope === null ||
        !["project_anonymous", "first_party_association"].includes(identityVerification ?? "")))
  )
    throw new Error("semantic_worker_receipt_invalid");

  let currentIdentityPrivacy: string | null = null;
  if (row.identity_writer_id !== null) {
    const serverIdentity = identityVerification === "server_namespace";
    const writer = (
      await tx.query<{ token_hash: string }>(
        `SELECT token_hash FROM analytics_writers
         WHERE id=$1::uuid AND project_id=$2::uuid AND kind=$3 FOR SHARE`,
        [row.identity_writer_id, job.payload.project_id, serverIdentity ? "server" : "relay"]
      )
    ).rows[0];
    if (writer === undefined) throw new Error("semantic_worker_identity_authority_unavailable");
    if (!serverIdentity && row.identity_producer_epoch === null)
      throw new Error("semantic_worker_identity_authority_unavailable");
    const policy = await loadCurrentProjectSemanticAnalyticsPolicy(tx, {
      projectId: job.payload.project_id,
      principal: serverIdentity ? "server_writer" : "relay",
      credentialHash: writer.token_hash,
      receivedAt: new Date().toISOString()
    });
    const namespace = (
      await tx.query<{ namespace_revision: string }>(
        `SELECT namespace_revision FROM analytics_project_identity_namespaces
         WHERE project_id=$1::uuid AND revoked_at IS NULL FOR SHARE`,
        [job.payload.project_id]
      )
    ).rows[0];
    const revoked = serverIdentity
      ? { rows: [] }
      : await tx.query(
          `SELECT 1 FROM analytics_project_identity_epoch_revocations
           WHERE project_id=$1::uuid AND writer_id=$2::uuid AND producer_epoch=$3::uuid`,
          [job.payload.project_id, row.identity_writer_id, row.identity_producer_epoch]
        );
    if (
      policy === null ||
      policy.context.minimumPrivacy === "strict" ||
      (serverIdentity && policy.serverIdentityAuthority?.writerId !== row.identity_writer_id) ||
      namespace === undefined ||
      Number(namespace.namespace_revision) !== namespaceRevision ||
      revoked.rows.length !== 0
    )
      throw new Error("semantic_worker_identity_authority_unavailable");
    currentIdentityPrivacy = policy.context.minimumPrivacy;
  }

  const compressed = await objectStore.getObject({
    key: row.raw_object_key,
    signal: AbortSignal.timeout(10_000)
  });
  let event: SemanticAnalyticsEvent;
  try {
    if (compressed.byteLength > 64 * 1024) throw new Error("object too large");
    const bytes = gunzipSync(compressed, {
      maxOutputLength: MAX_SEMANTIC_ANALYTICS_EVENT_BYTES
    });
    const parsed = SemanticAnalyticsEventSchema.parse(JSON.parse(bytes.toString("utf8")));
    const canonical = stableJson(parsed);
    if (!bytes.equals(Buffer.from(canonical, "utf8"))) throw new Error("noncanonical object");
    const hash = `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
    if (
      hash !== row.content_hash ||
      parsed.event_id !== job.payload.event_id ||
      parsed.operation_id !== row.operation_id ||
      parsed.correlation.namespace_revision !== namespaceRevision ||
      (row.principal === "server_writer") !== (parsed.producer.kind === "server") ||
      buildSemanticAnalyticsRawEventObjectKey({
        projectId: job.payload.project_id,
        eventId: parsed.event_id,
        occurredAt: new Date(parsed.occurred_at),
        contentHash: hash
      }) !== row.raw_object_key
    )
      throw new Error("object does not match receipt");
    event = parsed;
  } catch {
    throw new Error("semantic_worker_object_invalid");
  }

  if (
    identityVerification === "server_namespace" &&
    (event.correlation.user_id_hash !== null || event.correlation.account_id_hash !== null) &&
    currentIdentityPrivacy !== "custom"
  )
    throw new Error("semantic_worker_identity_authority_unavailable");

  if (identityScope !== null) {
    const indexed = (
      await tx.query<{ subject_kind: string; subject_ref: string; namespace_revision: string }>(
        `SELECT subject_kind,subject_ref,namespace_revision
         FROM semantic_analytics_receipt_subjects
         WHERE project_id=$1::uuid AND event_id=$2::uuid ORDER BY subject_kind`,
        [job.payload.project_id, job.payload.event_id]
      )
    ).rows;
    const expected = semanticAnalyticsSubjectRefs(event)
      .map(({ kind, ref }) => ({
        subject_kind: kind,
        subject_ref: ref,
        namespace_revision: String(namespaceRevision)
      }))
      .sort((left, right) => left.subject_kind.localeCompare(right.subject_kind));
    if (expected.length === 0 || stableJson(indexed) !== stableJson(expected))
      throw new Error("semantic_worker_identity_authority_unavailable");
    if (
      await hasProjectAnalyticsSubjectErasureFence(tx, {
        projectId: job.payload.project_id,
        namespaceRevision: namespaceRevision!,
        occurredAt: event.occurred_at,
        subjectRefs: semanticAnalyticsSubjectRefs(event)
      })
    )
      throw new Error("semantic_worker_identity_authority_unavailable");
  }

  return {
    event,
    provenance: {
      principal: row.principal,
      authority: row.authority,
      scope,
      scope_revision: scopeRevision,
      catalog_revision: catalogRevision,
      identity_scope: identityScope,
      identity_verification: identityVerification,
      identity_context_id: row.identity_context_id,
      identity_writer_id: row.identity_writer_id,
      identity_producer_epoch: row.identity_producer_epoch,
      accepted_at: row.accepted_at.toISOString()
    }
  };
}
