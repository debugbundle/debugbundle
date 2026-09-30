import { createHash } from "node:crypto";
import { z } from "zod";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import type { SemanticAnalyticsAdmissionResult } from "../../event-normalizer/src/semantic-analytics-admission.js";
import {
  AnalyticsScopeSchema,
  SemanticAnalyticsEventSchema
} from "../../shared-types/src/index.js";
import {
  claimAnalyticsUsageInTransaction,
  type AnalyticsAllowanceUsageSummary
} from "./analytics-usage-store.js";
import { buildSemanticAnalyticsRawEventObjectKey } from "./helpers.js";
import type { ObjectStoreDeleteInput, ObjectStoreLister } from "./object-store-types.js";
import { sweepOldUnownedSemanticAnalyticsObjects } from "./semantic-analytics-orphan-sweep.js";
import { semanticAnalyticsSubjectRefs } from "./semantic-analytics-subject-refs.js";
import { hasProjectAnalyticsSubjectErasureFence } from "./analytics-subject-erasure-fence.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";
import { createWorkerJobStore } from "./worker-job-store.js";

type Admitted = Extract<SemanticAnalyticsAdmissionResult, { accepted: true }>;
const Id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const Hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const Timestamp = z.string().datetime({ precision: 3 });
const Limits = z
  .object({
    monthly_analytics_events: z.number().int().min(0),
    monthly_analytics_sessions: z.number().int().min(0),
    monthly_analytics_journey_samples: z.number().int().min(0),
    monthly_analytics_bundle_generations: z.number().int().min(0)
  })
  .strict();

export interface SemanticAnalyticsAcceptedReceipt {
  event_id: string;
  operation_id: string | null;
  content_hash: string;
  accepted_at: string;
  expires_at: string;
}
export type SemanticAnalyticsReceiptResult =
  | { kind: "accepted"; duplicate: boolean; receipt: SemanticAnalyticsAcceptedReceipt }
  | {
      kind:
        | "event_id_conflict"
        | "operation_conflict"
        | "authority_changed"
        | "quota_exceeded"
        | "receipt_expired"
        | "object_not_staged";
    };

export interface SemanticAnalyticsReceiptInput {
  admission: Admitted;
  principal: "server_writer" | "project_token" | "relay";
  periodStartsAt: string;
  limits: AnalyticsAllowanceUsageSummary;
  receiptRetentionDays?: number;
  identityContext?: { contextId: string; writerId: string; producerEpoch: string } | null;
  serverIdentityWriterId?: string | null;
  recheck: (tx: Queryable, admitted: Admitted) => Promise<boolean>;
}

export interface SemanticAnalyticsReceiptStore {
  /** Check a durable receipt and current policy before the caller writes S3. */
  checkBeforeWrite(
    input: SemanticAnalyticsReceiptInput
  ): Promise<
    | { kind: "ready"; object_key: string }
    | Exclude<SemanticAnalyticsReceiptResult, { kind: "quota_exceeded" }>
  >;
  /** The caller writes the protected content-addressed object before this transaction. */
  acceptPrepared(input: SemanticAnalyticsReceiptInput): Promise<SemanticAnalyticsReceiptResult>;
  /** Bounded worker maintenance; only staged objects without committed receipts can be deleted. */
  cleanOldOrphans(objectStore: {
    deleteObject(input: { key: string }): Promise<void>;
  }): Promise<number>;
  /** Bounded S3 scan catches late writes after their staging row was retired. */
  sweepOldUnownedObjects(input: {
    objectStore: ObjectStoreLister & {
      deleteObject(input: ObjectStoreDeleteInput): Promise<void>;
    };
    now: string;
  }): Promise<{ scanned: number; deleted: number; hasMore: boolean }>;
}

interface ReceiptRow extends Record<string, unknown> {
  event_id: string;
  operation_id: string | null;
  content_hash: string;
  accepted_at: Date;
  expires_at: Date;
  identity_context_id: string | null;
  identity_writer_id: string | null;
  identity_producer_epoch: string | null;
}

function asReceipt(row: ReceiptRow): SemanticAnalyticsAcceptedReceipt {
  return {
    event_id: row.event_id,
    operation_id: row.operation_id,
    content_hash: row.content_hash,
    accepted_at: row.accepted_at.toISOString(),
    expires_at: row.expires_at.toISOString()
  };
}

/** Match management's organization -> project lock order before policy and quota reads. */
async function lockReceiptProject(tx: Queryable, projectId: string): Promise<string | null> {
  const located = (
    await tx.query<{ organization_id: string }>(
      "SELECT organization_id FROM projects WHERE id=$1::uuid",
      [projectId]
    )
  ).rows[0];
  if (located === undefined) return null;
  const organization = await tx.query(
    "SELECT id FROM organizations WHERE id=$1::uuid AND suspended_at IS NULL FOR SHARE",
    [located.organization_id]
  );
  if (organization.rows.length !== 1) return null;
  const project = (
    await tx.query<{ organization_id: string }>(
      "SELECT organization_id FROM projects WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
      [projectId, located.organization_id]
    )
  ).rows[0];
  return project?.organization_id ?? null;
}

interface PreparedReceiptInput {
  admission: Admitted;
  projectId: string;
  event: Admitted["event"];
  eventId: string;
  contentHash: string;
  operationId: string | null;
  operationKind: string;
  operationNamespaceRevision: number;
  operationScope: z.infer<typeof AnalyticsScopeSchema>;
  operationScopeId: string;
  scope: z.infer<typeof AnalyticsScopeSchema>;
  identityScope: z.infer<typeof AnalyticsScopeSchema> | null;
  identityContext: { contextId: string; writerId: string; producerEpoch: string } | null;
  identityWriterId: string | null;
  subjectRefs: Array<{ kind: "anonymous" | "user" | "account"; ref: string }>;
  periodStartsAt: string;
  limits: AnalyticsAllowanceUsageSummary;
  receiptRetentionDays: number;
  objectKey: string;
}

function prepare(input: SemanticAnalyticsReceiptInput): PreparedReceiptInput {
  const admission = input.admission;
  const projectId = Id.parse(admission.origin_project_id);
  const event = SemanticAnalyticsEventSchema.parse(admission.event);
  const eventId = Id.parse(event.event_id);
  const contentHash = Hash.parse(admission.content_hash);
  const operationId =
    event.operation_id === null ? null : Hash.parse(event.operation_id.toLowerCase());
  const operationKind = event.payload.financial?.kind ?? event.payload.name;
  const operationNamespaceRevision = event.correlation.namespace_revision ?? 0;
  const scope = AnalyticsScopeSchema.parse(admission.scope);
  const identityScope =
    admission.identity_scope === null ? null : AnalyticsScopeSchema.parse(admission.identity_scope);
  const identityContext =
    input.identityContext === undefined || input.identityContext === null
      ? null
      : {
          contextId: Id.parse(input.identityContext.contextId),
          writerId: Id.parse(input.identityContext.writerId),
          producerEpoch: Id.parse(input.identityContext.producerEpoch)
        };
  const serverIdentityWriterId =
    input.serverIdentityWriterId === undefined || input.serverIdentityWriterId === null
      ? null
      : Id.parse(input.serverIdentityWriterId);
  const identityWriterId = identityContext?.writerId ?? serverIdentityWriterId;
  const subjectRefs = semanticAnalyticsSubjectRefs(event).map(({ kind, ref }) => ({
    kind,
    ref: Hash.parse(ref)
  }));
  const operationScope = identityScope ?? { kind: "project" as const, project_id: projectId };
  const operationScopeId =
    operationScope.kind === "project" ? operationScope.project_id : operationScope.space_id;
  Timestamp.parse(admission.received_at);
  const periodStartsAt = Timestamp.parse(input.periodStartsAt);
  const limits = Limits.parse(input.limits);
  const receiptRetentionDays = z
    .number()
    .int()
    .min(7)
    .max(90)
    .parse(input.receiptRetentionDays ?? 90);
  if (
    contentHash !== `sha256:${createHash("sha256").update(stableJson(event)).digest("hex")}` ||
    (scope.kind === "project" && scope.project_id.toLowerCase() !== projectId) ||
    (input.principal === "server_writer") !== (admission.authority === "server_authoritative") ||
    (input.principal === "server_writer") !== (event.producer.kind === "server") ||
    !Number.isSafeInteger(admission.scope_revision) ||
    admission.scope_revision < 1 ||
    !Number.isSafeInteger(admission.catalog_revision) ||
    admission.catalog_revision < 1 ||
    (identityScope === null) !== (admission.identity_verification === null) ||
    (event.correlation.namespace_revision === null) !== (identityScope === null) ||
    (identityScope !== null && subjectRefs.length === 0) ||
    (serverIdentityWriterId !== null &&
      (input.principal !== "server_writer" ||
        admission.identity_verification !== "server_namespace" ||
        identityContext !== null)) ||
    (admission.identity_verification === "server_namespace" && serverIdentityWriterId === null) ||
    (identityContext !== null &&
      (input.principal !== "relay" ||
        identityScope === null ||
        !["project_anonymous", "first_party_association"].includes(
          admission.identity_verification ?? ""
        )))
  )
    throw new Error("semantic_receipt_admission_invalid");
  const objectKey = buildSemanticAnalyticsRawEventObjectKey({
    projectId,
    eventId,
    occurredAt: new Date(event.occurred_at),
    contentHash
  });

  return {
    admission,
    projectId,
    event,
    eventId,
    contentHash,
    operationId,
    operationKind,
    operationNamespaceRevision,
    operationScope,
    operationScopeId,
    scope,
    identityScope,
    identityContext,
    identityWriterId,
    subjectRefs,
    periodStartsAt,
    limits,
    receiptRetentionDays,
    objectKey
  };
}

/** Never call acceptPrepared without protected admission and a durable object write. */
export function createSemanticAnalyticsReceiptStore(db: Queryable): SemanticAnalyticsReceiptStore {
  return {
    async checkBeforeWrite(input) {
      const prepared = prepare(input);
      // This ledger has subject-scope keys, not authenticated billing-source keys.
      if (prepared.event.payload.financial !== null) return { kind: "authority_changed" };
      const {
        admission,
        projectId,
        eventId,
        contentHash,
        operationId,
        operationKind,
        operationNamespaceRevision,
        operationScope,
        operationScopeId,
        identityContext,
        subjectRefs,
        event,
        objectKey
      } = prepared;
      return runInTransaction(db, async (tx) => {
        const organizationId = await lockReceiptProject(tx, projectId);
        if (organizationId === null || !(await input.recheck(tx, admission)))
          return { kind: "authority_changed" as const };
        if (
          prepared.identityScope !== null &&
          (await hasProjectAnalyticsSubjectErasureFence(tx, {
            projectId,
            namespaceRevision: event.correlation.namespace_revision!,
            occurredAt: event.occurred_at,
            subjectRefs
          }))
        )
          return { kind: "authority_changed" as const };
        const existing = await tx.query<ReceiptRow>(
          `SELECT event_id,operation_id,content_hash,accepted_at,expires_at,
                  identity_context_id,identity_writer_id,identity_producer_epoch
           FROM semantic_analytics_receipts WHERE project_id=$1::uuid AND event_id=$2::uuid`,
          [projectId, eventId]
        );
        if (existing.rows[0] !== undefined) {
          const row = existing.rows[0];
          if (
            row.content_hash !== contentHash ||
            row.operation_id !== operationId ||
            row.identity_context_id !== (identityContext?.contextId ?? null) ||
            row.identity_writer_id !== prepared.identityWriterId ||
            row.identity_producer_epoch !== (identityContext?.producerEpoch ?? null)
          )
            return { kind: "event_id_conflict" as const };
          if (row.expires_at.getTime() <= Date.now()) return { kind: "receipt_expired" as const };
          return { kind: "accepted" as const, duplicate: true, receipt: asReceipt(row) };
        }
        if (operationId !== null) {
          const operation = await tx.query(
            `SELECT first_event_id FROM semantic_analytics_operations
             WHERE project_id=$1::uuid AND namespace_scope_kind=$2 AND namespace_scope_id=$3::uuid
               AND namespace_revision=$4 AND operation_kind=$5 AND operation_id=$6`,
            [
              projectId,
              operationScope.kind,
              operationScopeId,
              operationNamespaceRevision,
              operationKind,
              operationId
            ]
          );
          if (operation.rows.length !== 0) return { kind: "operation_conflict" as const };
        }
        const staged = await tx.query(
          `INSERT INTO semantic_analytics_pending_objects(project_id,event_id,content_hash,raw_object_key)
           VALUES($1::uuid,$2::uuid,$3,$4)
           ON CONFLICT(project_id,event_id,content_hash)
           DO UPDATE SET updated_at=now()
             WHERE semantic_analytics_pending_objects.status='staged'
               AND semantic_analytics_pending_objects.raw_object_key=EXCLUDED.raw_object_key
           RETURNING status`,
          [projectId, eventId, contentHash, objectKey]
        );
        if (staged.rows.length !== 1) return { kind: "object_not_staged" as const };
        return { kind: "ready" as const, object_key: objectKey };
      });
    },
    async acceptPrepared(input) {
      const {
        admission,
        projectId,
        event,
        eventId,
        contentHash,
        operationId,
        operationKind,
        operationNamespaceRevision,
        operationScope,
        operationScopeId,
        scope,
        identityScope,
        identityContext,
        identityWriterId,
        subjectRefs,
        periodStartsAt,
        limits,
        receiptRetentionDays,
        objectKey
      } = prepare(input);

      if (event.payload.financial !== null) return { kind: "authority_changed" };

      return runInTransaction(db, async (tx): Promise<SemanticAnalyticsReceiptResult> => {
        // Organization and project locks serialize policy, first acceptance and deletion.
        const organizationId = await lockReceiptProject(tx, projectId);
        if (organizationId === null || !(await input.recheck(tx, admission)))
          return { kind: "authority_changed" };
        if (
          identityScope !== null &&
          (await hasProjectAnalyticsSubjectErasureFence(tx, {
            projectId,
            namespaceRevision: event.correlation.namespace_revision!,
            occurredAt: event.occurred_at,
            subjectRefs
          }))
        )
          return { kind: "authority_changed" };

        const existing = await tx.query<ReceiptRow>(
          `SELECT event_id,operation_id,content_hash,accepted_at,expires_at,
                  identity_context_id,identity_writer_id,identity_producer_epoch
           FROM semantic_analytics_receipts WHERE project_id=$1::uuid AND event_id=$2::uuid`,
          [projectId, eventId]
        );
        if (existing.rows[0] !== undefined) {
          const row = existing.rows[0];
          if (
            row.content_hash !== contentHash ||
            row.operation_id !== operationId ||
            row.identity_context_id !== (identityContext?.contextId ?? null) ||
            row.identity_writer_id !== identityWriterId ||
            row.identity_producer_epoch !== (identityContext?.producerEpoch ?? null)
          )
            return { kind: "event_id_conflict" };
          if (row.expires_at.getTime() <= Date.now()) return { kind: "receipt_expired" };
          return { kind: "accepted", duplicate: true, receipt: asReceipt(row) };
        }

        if (operationId !== null) {
          const operation = await tx.query(
            `SELECT first_event_id FROM semantic_analytics_operations
             WHERE project_id=$1::uuid AND namespace_scope_kind=$2 AND namespace_scope_id=$3::uuid
               AND namespace_revision=$4 AND operation_kind=$5 AND operation_id=$6`,
            [
              projectId,
              operationScope.kind,
              operationScopeId,
              operationNamespaceRevision,
              operationKind,
              operationId
            ]
          );
          if (operation.rows.length !== 0) return { kind: "operation_conflict" };
        }
        const staged = await tx.query<{ status: string; raw_object_key: string }>(
          `SELECT status,raw_object_key FROM semantic_analytics_pending_objects
           WHERE project_id=$1::uuid AND event_id=$2::uuid AND content_hash=$3 FOR UPDATE`,
          [projectId, eventId, contentHash]
        );
        if (staged.rows[0]?.status !== "staged" || staged.rows[0].raw_object_key !== objectKey)
          return { kind: "object_not_staged" };
        const quota = await claimAnalyticsUsageInTransaction(tx, {
          organization_id: organizationId,
          period_starts_at: periodStartsAt,
          analytics_events: 1,
          analytics_sessions: 0,
          analytics_journey_samples: 0,
          analytics_bundle_generations: 0,
          limits,
          claims: [
            { claim_key: `semantic-event:${projectId}:${eventId}`, metric: "analytics_events" }
          ]
        });
        if (!quota.allowed) return { kind: "quota_exceeded" };

        const workerJobId = await createWorkerJobStore(tx).enqueue(
          "process-semantic-analytics-event",
          {
            project_id: projectId,
            event_id: eventId,
            content_hash: contentHash,
            object_key: objectKey
          },
          { dedupeKey: `${projectId}:${eventId}` }
        );
        const saved = await tx.query<ReceiptRow>(
          `INSERT INTO semantic_analytics_receipts (
            project_id,event_id,content_hash,operation_id,raw_object_key,worker_job_id,
            principal,authority,scope,scope_revision,catalog_revision,identity_scope,
            identity_verification,namespace_revision,accepted_at,expires_at,occurred_at,
            identity_context_id,identity_writer_id,identity_producer_epoch
          ) VALUES (
            $1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb,
            $13,$14::bigint,now(),now()+$15*interval '1 day',$16::timestamptz,
            $17::uuid,$18::uuid,$19::uuid
          ) RETURNING event_id,operation_id,content_hash,accepted_at,expires_at`,
          [
            projectId,
            eventId,
            contentHash,
            operationId,
            objectKey,
            workerJobId,
            input.principal,
            admission.authority,
            JSON.stringify(scope),
            admission.scope_revision,
            admission.catalog_revision,
            identityScope === null ? null : JSON.stringify(identityScope),
            admission.identity_verification,
            event.correlation.namespace_revision,
            receiptRetentionDays,
            event.occurred_at,
            identityContext?.contextId ?? null,
            identityWriterId,
            identityContext?.producerEpoch ?? null
          ]
        );
        if (subjectRefs.length > 0) {
          await tx.query(
            `INSERT INTO semantic_analytics_receipt_subjects(
               project_id,event_id,namespace_revision,subject_kind,subject_ref)
             SELECT $1::uuid,$2::uuid,$3::bigint,subject_kind,subject_ref
             FROM unnest($4::text[],$5::text[]) AS subject(subject_kind,subject_ref)`,
            [
              projectId,
              eventId,
              event.correlation.namespace_revision,
              subjectRefs.map((item) => item.kind),
              subjectRefs.map((item) => item.ref)
            ]
          );
        }
        if (operationId !== null) {
          await tx.query(
            `INSERT INTO semantic_analytics_operations(
               project_id,namespace_scope_kind,namespace_scope_id,namespace_revision,
               operation_kind,operation_id,first_event_id,first_content_hash,accepted_at
             ) VALUES($1::uuid,$2,$3::uuid,$4,$5,$6,$7::uuid,$8,now())`,
            [
              projectId,
              operationScope.kind,
              operationScopeId,
              operationNamespaceRevision,
              operationKind,
              operationId,
              eventId,
              contentHash
            ]
          );
        }
        await tx.query(
          `DELETE FROM semantic_analytics_pending_objects
           WHERE project_id=$1::uuid AND event_id=$2::uuid AND content_hash=$3`,
          [projectId, eventId, contentHash]
        );
        return { kind: "accepted", duplicate: false, receipt: asReceipt(saved.rows[0]!) };
      });
    },
    async cleanOldOrphans(objectStore) {
      let cleaned = 0;
      for (let index = 0; index < 100; index += 1) {
        const candidate = await runInTransaction(db, async (tx) => {
          const selected = await tx.query<{
            project_id: string;
            event_id: string;
            content_hash: string;
            raw_object_key: string;
          }>(
            `SELECT project_id,event_id,content_hash,raw_object_key
             FROM semantic_analytics_pending_objects pending
             WHERE ((status='staged' AND updated_at < now()-interval '1 hour')
               OR (status='deleting' AND updated_at < now()-interval '5 minutes'))
               AND NOT EXISTS (
                 SELECT 1 FROM semantic_analytics_receipts receipt
                 WHERE receipt.project_id=pending.project_id AND receipt.event_id=pending.event_id
                   AND receipt.raw_object_key=pending.raw_object_key
                   AND receipt.raw_status IN ('active','deleting')
               )
             ORDER BY updated_at,project_id,event_id
             FOR UPDATE SKIP LOCKED LIMIT 1`,
            []
          );
          const row = selected.rows[0];
          if (row === undefined) return null;
          await tx.query(
            `UPDATE semantic_analytics_pending_objects SET status='deleting',updated_at=now()
             WHERE project_id=$1::uuid AND event_id=$2::uuid AND content_hash=$3`,
            [row.project_id, row.event_id, row.content_hash]
          );
          return row;
        });
        if (candidate === null) break;
        await objectStore.deleteObject({ key: candidate.raw_object_key });
        await db.query(
          `DELETE FROM semantic_analytics_pending_objects
           WHERE project_id=$1::uuid AND event_id=$2::uuid AND content_hash=$3 AND status='deleting'`,
          [candidate.project_id, candidate.event_id, candidate.content_hash]
        );
        cleaned += 1;
      }
      return cleaned;
    },
    sweepOldUnownedObjects(input) {
      return sweepOldUnownedSemanticAnalyticsObjects(db, input);
    }
  };
}
