import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import {
  AnalyticsIdentityAssociationSchema,
  AnalyticsIdentityContextCreateSchema,
  AnalyticsIdentityContextSchema,
  AnalyticsIdentityRevokeSchema,
  AnalyticsIdentityRevocationSchema,
  AnalyticsRelayIdentityContextReferenceSchema,
  type AnalyticsIdentityAssociation,
  type AnalyticsIdentityContext,
  type AnalyticsIdentityContextCreate,
  type AnalyticsIdentityRevoke,
  type AnalyticsIdentityRevocation,
  type AnalyticsRelayIdentityContextReference
} from "../../shared-types/src/analytics-identity.js";
import { createAnalyticsWriterStore } from "./analytics-writer-store.js";
import { hasProjectAnalyticsSubjectErasureFence } from "./analytics-subject-erasure-fence.js";
import { loadCurrentProjectSemanticAnalyticsPolicy } from "./semantic-analytics-policy.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const digest = (value: unknown): string =>
  createHash("sha256").update(stableJson(value)).digest("hex");

type ContextRow = {
  context_id: string;
  project_id: string;
  writer_id: string;
  idempotency_key: string;
  mutation_hash: string;
  scope_revision: string;
  namespace_revision: string;
  producer_epoch: string;
  binding_hash: string;
  anonymous_id_hash: string;
  user_id_hash: string | null;
  account_id_hash: string | null;
  privacy_mode: "standard" | "custom";
  issued_at: Date;
  expires_at: Date;
  associated_at: Date | null;
  association_hash: string | null;
  revoked_at: Date | null;
};
type Failure = { kind: "invalid" | "unavailable" | "conflict" };
type ContextResult =
  | Failure
  | { kind: "created" | "associated"; context: AnalyticsIdentityContext; replayed: boolean };
type RevocationResult = Failure | { kind: "revoked"; receipt: AnalyticsIdentityRevocation };
type RevocationRow = {
  context_id: string;
  project_id: string;
  writer_id: string;
  producer_epoch: string;
  binding_hash: string;
  revoked_at: Date;
};
type Relay = {
  writerId: string;
  projectId: string;
  privacyMode: "strict" | "standard" | "custom";
  scopeRevision: number;
};
type RelayOwner = Pick<Relay, "writerId" | "projectId">;

function record(row: ContextRow): AnalyticsIdentityContext {
  return AnalyticsIdentityContextSchema.parse({
    protocol: "2026-09-analytics-identity-01",
    context_id: row.context_id,
    project_id: row.project_id,
    scope: { kind: "project", project_id: row.project_id },
    scope_revision: Number(row.scope_revision),
    namespace_revision: Number(row.namespace_revision),
    producer_epoch: row.producer_epoch,
    anonymous_id_hash: row.anonymous_id_hash,
    user_id_hash: row.user_id_hash,
    account_id_hash: row.account_id_hash,
    privacy_mode: row.privacy_mode,
    consent_granted: true,
    issued_at: row.issued_at.toISOString(),
    expires_at: row.expires_at.toISOString()
  });
}

async function currentLiveRelay(tx: Queryable, credentialHash: string): Promise<RelayOwner | null> {
  const writers = createAnalyticsWriterStore(tx);
  const candidate = await writers.resolveByTokenHash(credentialHash);
  if (candidate === null || candidate.kind !== "relay") return null;
  const organization = await tx.query(
    "SELECT id FROM organizations WHERE id=$1::uuid AND suspended_at IS NULL FOR SHARE",
    [candidate.organization_id]
  );
  if (organization.rows.length !== 1) return null;
  const project = await tx.query(
    "SELECT id FROM projects WHERE id=$1::uuid AND organization_id=$2::uuid FOR SHARE",
    [candidate.project_id, candidate.organization_id]
  );
  if (project.rows.length !== 1) return null;
  const writer = await writers.resolveByTokenHash(credentialHash);
  if (writer === null || writer.kind !== "relay" || writer.writer_id !== candidate.writer_id)
    return null;
  const live = (
    await tx.query<{ expires_at: Date; revoked_at: Date | null }>(
      `SELECT expires_at,revoked_at FROM analytics_writers
       WHERE id=$1::uuid AND token_hash=$2 AND project_id=$3::uuid FOR SHARE`,
      [writer.writer_id, credentialHash, writer.project_id]
    )
  ).rows[0];
  if (live === undefined || live.revoked_at !== null || live.expires_at.getTime() <= Date.now())
    return null;
  return { writerId: writer.writer_id, projectId: writer.project_id };
}

async function currentRelay(tx: Queryable, credentialHash: string): Promise<Relay | null> {
  const writer = await currentLiveRelay(tx, credentialHash);
  if (writer === null) return null;
  const policy = await loadCurrentProjectSemanticAnalyticsPolicy(tx, {
    projectId: writer.projectId,
    principal: "relay",
    credentialHash,
    receivedAt: new Date().toISOString()
  });
  if (policy === null || policy.context.scope.kind !== "project") return null;
  return {
    ...writer,
    privacyMode: policy.context.minimumPrivacy,
    scopeRevision: policy.context.scopeRevision
  };
}

async function currentNamespace(tx: Queryable, projectId: string): Promise<number | null> {
  const row = (
    await tx.query<{ namespace_revision: string }>(
      `SELECT namespace_revision FROM analytics_project_identity_namespaces
       WHERE project_id=$1::uuid AND revoked_at IS NULL FOR SHARE`,
      [projectId]
    )
  ).rows[0];
  return row === undefined ? null : Number(row.namespace_revision);
}

async function lockedContext(
  tx: Queryable,
  relay: RelayOwner,
  contextId: string
): Promise<ContextRow | null> {
  return (
    (
      await tx.query<ContextRow & Record<string, unknown>>(
        `SELECT * FROM analytics_project_identity_contexts
       WHERE context_id=$1::uuid AND project_id=$2::uuid AND writer_id=$3::uuid FOR UPDATE`,
        [contextId, relay.projectId, relay.writerId]
      )
    ).rows[0] ?? null
  );
}

async function isProducerEpochRevoked(
  tx: Queryable,
  relay: RelayOwner,
  producerEpoch: string
): Promise<boolean> {
  const fence = await tx.query(
    `SELECT 1 FROM analytics_project_identity_epoch_revocations
     WHERE project_id=$1::uuid AND writer_id=$2::uuid AND producer_epoch=$3::uuid`,
    [relay.projectId, relay.writerId, producerEpoch]
  );
  return fence.rows.length !== 0;
}

/** Candidate project-only lifecycle; no public route or identity-bearing ingress is enabled. */
export async function createProjectAnalyticsIdentityContext(
  db: Queryable,
  credentialHash: string,
  request: AnalyticsIdentityContextCreate
): Promise<ContextResult> {
  const parsed = AnalyticsIdentityContextCreateSchema.safeParse(request);
  if (!Hash.safeParse(credentialHash).success || !parsed.success) return { kind: "invalid" };
  return runInTransaction<ContextResult>(db, async (tx) => {
    const relay = await currentRelay(tx, credentialHash);
    if (relay === null || relay.privacyMode === "strict") return { kind: "unavailable" };
    const namespaceRevision = await currentNamespace(tx, relay.projectId);
    if (namespaceRevision !== parsed.data.namespace_revision) return { kind: "unavailable" };
    if (await isProducerEpochRevoked(tx, relay, parsed.data.producer_epoch))
      return { kind: "unavailable" };
    const mutationHash = digest(parsed.data);
    const inserted = await tx.query<{ context_id: string }>(
      `INSERT INTO analytics_project_identity_contexts(
         context_id,project_id,writer_id,idempotency_key,mutation_hash,scope_revision,
         namespace_revision,producer_epoch,binding_hash,anonymous_id_hash,privacy_mode,expires_at)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8::uuid,$9,$10,$11,
         now()+interval '5 minutes') ON CONFLICT(writer_id,idempotency_key) DO NOTHING
       RETURNING context_id`,
      [
        randomUUID(),
        relay.projectId,
        relay.writerId,
        parsed.data.idempotency_key,
        mutationHash,
        relay.scopeRevision,
        namespaceRevision,
        parsed.data.producer_epoch,
        parsed.data.binding_hash,
        parsed.data.anonymous_id_hash,
        relay.privacyMode
      ]
    );
    const row = (
      await tx.query<ContextRow & Record<string, unknown>>(
        `SELECT * FROM analytics_project_identity_contexts
         WHERE writer_id=$1::uuid AND idempotency_key=$2::uuid FOR UPDATE`,
        [relay.writerId, parsed.data.idempotency_key]
      )
    ).rows[0];
    if (row === undefined) throw new Error("semantic_identity_context_unavailable");
    if (row.mutation_hash !== mutationHash) return { kind: "conflict" };
    if (
      row.revoked_at !== null ||
      (await isProducerEpochRevoked(tx, relay, row.producer_epoch)) ||
      row.expires_at.getTime() <= Date.now() ||
      Number(row.scope_revision) !== relay.scopeRevision ||
      row.privacy_mode !== relay.privacyMode
    )
      return { kind: "unavailable" };
    return {
      kind: "created",
      context: record(row),
      replayed: inserted.rows.length === 0
    };
  });
}

export async function associateProjectAnalyticsIdentityContext(
  db: Queryable,
  credentialHash: string,
  request: AnalyticsIdentityAssociation
): Promise<ContextResult> {
  const parsed = AnalyticsIdentityAssociationSchema.safeParse(request);
  if (!Hash.safeParse(credentialHash).success || !parsed.success) return { kind: "invalid" };
  return runInTransaction<ContextResult>(db, async (tx) => {
    const relay = await currentRelay(tx, credentialHash);
    if (relay === null || relay.privacyMode !== "custom") return { kind: "unavailable" };
    const namespaceRevision = await currentNamespace(tx, relay.projectId);
    if (namespaceRevision !== parsed.data.namespace_revision) return { kind: "unavailable" };
    const row = await lockedContext(tx, relay, parsed.data.context_id);
    if (
      row === null ||
      row.revoked_at !== null ||
      (await isProducerEpochRevoked(tx, relay, parsed.data.producer_epoch)) ||
      row.expires_at.getTime() <= Date.now() ||
      row.namespace_revision !== String(namespaceRevision) ||
      Number(row.scope_revision) !== relay.scopeRevision ||
      row.privacy_mode !== "custom" ||
      row.producer_epoch !== parsed.data.producer_epoch ||
      row.binding_hash !== parsed.data.binding_hash ||
      row.anonymous_id_hash !== parsed.data.anonymous_id_hash
    )
      return { kind: "unavailable" };
    const associationRefs: Array<{
      kind: "anonymous" | "user" | "account";
      ref: string;
    }> = [
      { kind: "anonymous", ref: row.anonymous_id_hash },
      { kind: "user", ref: parsed.data.user_id_hash }
    ];
    if (parsed.data.account_id_hash !== null)
      associationRefs.push({ kind: "account", ref: parsed.data.account_id_hash });
    if (
      await hasProjectAnalyticsSubjectErasureFence(tx, {
        projectId: row.project_id,
        namespaceRevision,
        occurredAt: row.issued_at.toISOString(),
        subjectRefs: associationRefs
      })
    )
      return { kind: "unavailable" };
    const oldAnonymousEvidence = await tx.query(
      `SELECT 1 FROM analytics_project_subject_erasures erasure
       JOIN semantic_analytics_receipt_subjects subject
         ON subject.project_id=erasure.project_id
           AND subject.namespace_revision=erasure.namespace_revision
           AND subject.subject_kind='anonymous' AND subject.subject_ref=$4
       JOIN semantic_analytics_receipts receipt
         ON receipt.project_id=subject.project_id AND receipt.event_id=subject.event_id
           AND receipt.occurred_at<=erasure.cutoff_at
       WHERE erasure.project_id=$1::uuid AND erasure.namespace_revision=$2
         AND ((erasure.subject_kind='user' AND erasure.subject_ref=$3)
           OR (erasure.subject_kind='account' AND erasure.subject_ref=$5))
       LIMIT 1`,
      [
        row.project_id,
        namespaceRevision,
        parsed.data.user_id_hash,
        row.anonymous_id_hash,
        parsed.data.account_id_hash
      ]
    );
    if (oldAnonymousEvidence.rows.length !== 0) return { kind: "unavailable" };
    const associationHash = digest(parsed.data);
    if (row.user_id_hash !== null)
      return row.association_hash === associationHash
        ? { kind: "associated", context: record(row), replayed: true }
        : { kind: "conflict" };
    const changed = (
      await tx.query<ContextRow & Record<string, unknown>>(
        `UPDATE analytics_project_identity_contexts
         SET user_id_hash=$2,account_id_hash=$3,associated_at=now(),
           association_idempotency_key=$4::uuid,association_hash=$5
         WHERE context_id=$1::uuid RETURNING *`,
        [
          row.context_id,
          parsed.data.user_id_hash,
          parsed.data.account_id_hash,
          parsed.data.idempotency_key,
          associationHash
        ]
      )
    ).rows[0];
    if (changed === undefined) throw new Error("semantic_identity_association_unavailable");
    await tx.query(
      `INSERT INTO analytics_project_identity_associations(
         project_id,context_id,writer_id,namespace_revision,producer_epoch,
         anonymous_id_hash,user_id_hash,account_id_hash,associated_at,expires_at)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5::uuid,$6,$7,$8,$9::timestamptz,
         $9::timestamptz+interval '90 days')`,
      [
        changed.project_id,
        changed.context_id,
        changed.writer_id,
        changed.namespace_revision,
        changed.producer_epoch,
        changed.anonymous_id_hash,
        changed.user_id_hash,
        changed.account_id_hash,
        changed.associated_at
      ]
    );
    return { kind: "associated", context: record(changed), replayed: false };
  });
}

export async function revokeProjectAnalyticsIdentityContext(
  db: Queryable,
  credentialHash: string,
  request: AnalyticsIdentityRevoke
): Promise<RevocationResult> {
  const parsed = AnalyticsIdentityRevokeSchema.safeParse(request);
  if (!Hash.safeParse(credentialHash).success || !parsed.success) return { kind: "invalid" };
  return runInTransaction<RevocationResult>(db, async (tx) => {
    const relay = await currentLiveRelay(tx, credentialHash);
    if (relay === null) return { kind: "unavailable" };
    // Worker projection locks this project FOR UPDATE; serializing here prevents
    // a revocation commit between its authority check and fact commit.
    const project = await tx.query("SELECT id FROM projects WHERE id=$1::uuid FOR SHARE", [
      relay.projectId
    ]);
    if (project.rows.length !== 1) return { kind: "unavailable" };
    const row = await lockedContext(tx, relay, parsed.data.context_id);
    if (row === null) {
      const fence = (
        await tx.query<RevocationRow>(
          `SELECT context_id,project_id,writer_id,producer_epoch,binding_hash,revoked_at
           FROM analytics_project_identity_revocations
           WHERE context_id=$1::uuid AND project_id=$2::uuid AND writer_id=$3::uuid`,
          [parsed.data.context_id, relay.projectId, relay.writerId]
        )
      ).rows[0];
      if (
        fence === undefined ||
        fence.producer_epoch !== parsed.data.producer_epoch ||
        fence.binding_hash !== parsed.data.binding_hash
      )
        return { kind: "unavailable" };
      if (!(await isProducerEpochRevoked(tx, relay, fence.producer_epoch)))
        throw new Error("semantic_identity_revocation_fence_unavailable");
      return {
        kind: "revoked",
        receipt: AnalyticsIdentityRevocationSchema.parse({
          protocol: "2026-09-analytics-identity-01",
          context_id: fence.context_id,
          producer_epoch: fence.producer_epoch,
          revoked_at: fence.revoked_at.toISOString(),
          replayed: true
        })
      };
    }
    if (
      row.producer_epoch !== parsed.data.producer_epoch ||
      row.binding_hash !== parsed.data.binding_hash
    )
      return { kind: "unavailable" };
    const replayed = row.revoked_at !== null;
    const revokedAt = replayed
      ? row.revoked_at!
      : (
          await tx.query<{ revoked_at: Date }>(
            `UPDATE analytics_project_identity_contexts SET revoked_at=now()
             WHERE context_id=$1::uuid RETURNING revoked_at`,
            [row.context_id]
          )
        ).rows[0]?.revoked_at;
    if (revokedAt === undefined) throw new Error("semantic_identity_revocation_unavailable");
    await tx.query(
      `INSERT INTO analytics_project_identity_revocations(
         context_id,project_id,writer_id,producer_epoch,binding_hash,revoked_at)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6::timestamptz)
       ON CONFLICT(context_id) DO NOTHING`,
      [
        row.context_id,
        row.project_id,
        row.writer_id,
        row.producer_epoch,
        row.binding_hash,
        revokedAt
      ]
    );
    await tx.query(
      `INSERT INTO analytics_project_identity_epoch_revocations(
         project_id,writer_id,producer_epoch,revoked_at)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4::timestamptz)
       ON CONFLICT(project_id,writer_id,producer_epoch) DO NOTHING`,
      [row.project_id, row.writer_id, row.producer_epoch, revokedAt]
    );
    if (!(await isProducerEpochRevoked(tx, relay, row.producer_epoch)))
      throw new Error("semantic_identity_revocation_fence_unavailable");
    const fence = (
      await tx.query<RevocationRow>(
        `SELECT context_id,project_id,writer_id,producer_epoch,binding_hash,revoked_at
         FROM analytics_project_identity_revocations WHERE context_id=$1::uuid`,
        [row.context_id]
      )
    ).rows[0];
    if (
      fence === undefined ||
      fence.project_id !== row.project_id ||
      fence.writer_id !== row.writer_id ||
      fence.producer_epoch !== row.producer_epoch ||
      fence.binding_hash !== row.binding_hash ||
      fence.revoked_at.getTime() !== revokedAt.getTime()
    )
      throw new Error("semantic_identity_revocation_fence_unavailable");
    const receipt = AnalyticsIdentityRevocationSchema.parse({
      protocol: "2026-09-analytics-identity-01",
      context_id: row.context_id,
      producer_epoch: row.producer_epoch,
      revoked_at: revokedAt.toISOString(),
      replayed
    });
    return { kind: "revoked", receipt };
  });
}

/** Use inside the receipt transaction so revocation cannot race the final ACK. */
export async function resolveProjectAnalyticsIdentityContextInTransaction(
  tx: Queryable,
  credentialHash: string,
  lookup: AnalyticsRelayIdentityContextReference
): Promise<{ context: AnalyticsIdentityContext; writerId: string } | null> {
  const parsed = AnalyticsRelayIdentityContextReferenceSchema.safeParse(lookup);
  if (!Hash.safeParse(credentialHash).success || !parsed.success) return null;
  const relay = await currentRelay(tx, credentialHash);
  if (relay === null || relay.privacyMode === "strict") return null;
  const namespaceRevision = await currentNamespace(tx, relay.projectId);
  if (namespaceRevision === null) return null;
  const row = await lockedContext(tx, relay, parsed.data.context_id);
  if (
    row === null ||
    row.revoked_at !== null ||
    (await isProducerEpochRevoked(tx, relay, parsed.data.producer_epoch)) ||
    row.expires_at.getTime() <= Date.now() ||
    Number(row.namespace_revision) !== namespaceRevision ||
    Number(row.scope_revision) !== relay.scopeRevision ||
    row.producer_epoch !== parsed.data.producer_epoch ||
    row.binding_hash !== parsed.data.binding_hash ||
    row.privacy_mode !== relay.privacyMode ||
    (row.user_id_hash !== null && relay.privacyMode !== "custom")
  )
    return null;
  return { context: record(row), writerId: relay.writerId };
}

export async function resolveProjectAnalyticsIdentityContext(
  db: Queryable,
  credentialHash: string,
  lookup: { contextId: string; producerEpoch: string; bindingHash: string }
): Promise<AnalyticsIdentityContext | null> {
  return runInTransaction(db, async (tx) => {
    const resolved = await resolveProjectAnalyticsIdentityContextInTransaction(tx, credentialHash, {
      context_id: lookup.contextId,
      producer_epoch: lookup.producerEpoch,
      binding_hash: lookup.bindingHash
    });
    return resolved?.context ?? null;
  });
}
