import { gzipSync } from "node:zlib";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import {
  admitSemanticAnalyticsEvent,
  type SemanticAnalyticsAdmissionReason
} from "../../event-normalizer/src/semantic-analytics-admission.js";
import {
  MAX_SEMANTIC_ANALYTICS_EVENT_BYTES,
  SemanticAnalyticsEventSchema,
  type AnalyticsRelayIdentityContextReference,
  type AnalyticsIdentityContext
} from "../../shared-types/src/index.js";
import { resolveProjectAnalyticsIdentityContextInTransaction } from "./analytics-identity-context-store.js";
import { runInTransaction } from "./transaction.js";
import type { ObjectStoreClient } from "./object-store-types.js";
import {
  loadCurrentProjectSemanticAnalyticsPolicy,
  recheckProjectSemanticAnalyticsAdmission,
  type ProjectSemanticAnalyticsPolicyInput
} from "./semantic-analytics-policy.js";
import type {
  SemanticAnalyticsReceiptInput,
  SemanticAnalyticsReceiptResult,
  SemanticAnalyticsReceiptStore
} from "./semantic-analytics-receipt-store.js";
import type { Queryable } from "./types.js";

/** Internal V2 handoff: no ACK until protected S3 bytes and a durable DB job both exist. */
export async function persistProtectedSemanticAnalyticsEvent(
  receipts: SemanticAnalyticsReceiptStore,
  input: SemanticAnalyticsReceiptInput,
  objectStore: Pick<ObjectStoreClient, "putObject">
): Promise<SemanticAnalyticsReceiptResult> {
  const preflight = await receipts.checkBeforeWrite(input);
  if (preflight.kind !== "ready") return preflight;
  const protectedJson = Buffer.from(stableJson(input.admission.event), "utf8");
  if (protectedJson.byteLength > MAX_SEMANTIC_ANALYTICS_EVENT_BYTES)
    throw new Error("semantic_analytics_protected_event_too_large");
  await objectStore.putObject({
    key: preflight.object_key,
    body: gzipSync(protectedJson),
    contentType: "application/json",
    contentEncoding: "gzip",
    signal: AbortSignal.timeout(10_000)
  });
  return receipts.acceptPrepared(input);
}

/** Internal project-only handoff; future routes must derive credentials server-side. */
export async function persistCurrentProjectSemanticAnalyticsEvent(
  db: Queryable,
  receipts: SemanticAnalyticsReceiptStore,
  objectStore: Pick<ObjectStoreClient, "putObject">,
  input: {
    policy: Omit<ProjectSemanticAnalyticsPolicyInput, "receivedAt">;
    event: unknown;
    identityContext?: AnalyticsRelayIdentityContextReference;
  },
  clock: () => Date = () => new Date()
): Promise<
  SemanticAnalyticsReceiptResult | { kind: "rejected"; reason: SemanticAnalyticsAdmissionReason }
> {
  let receivedAt: string;
  try {
    const now = clock();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
      return { kind: "authority_changed" };
    receivedAt = now.toISOString();
  } catch {
    return { kind: "authority_changed" };
  }
  const policyInput: ProjectSemanticAnalyticsPolicyInput = {
    projectId: input.policy.projectId,
    principal: input.policy.principal,
    credentialHash: input.policy.credentialHash,
    receivedAt
  };
  const policy = await loadCurrentProjectSemanticAnalyticsPolicy(db, policyInput);
  if (policy === null) return { kind: "authority_changed" };
  let submittedEvent = input.event;
  let verifiedContext: AnalyticsIdentityContext | null = null;
  let verifiedWriterId: string | null = null;
  let serverIdentity: typeof policy.context.identity = null;
  if (policyInput.principal === "server_writer") {
    const parsed = SemanticAnalyticsEventSchema.safeParse(input.event);
    if (!parsed.success) return { kind: "rejected", reason: "invalid_event" };
    if (parsed.data.correlation.namespace_revision !== null) {
      const authority = policy.serverIdentityAuthority;
      if (
        authority === null ||
        parsed.data.correlation.namespace_revision !== authority.namespaceRevision ||
        ((parsed.data.correlation.user_id_hash !== null ||
          parsed.data.correlation.account_id_hash !== null) &&
          policy.context.minimumPrivacy !== "custom")
      )
        return { kind: "rejected", reason: "identity_not_authorized" };
      serverIdentity = {
        scope: { kind: "project", project_id: policyInput.projectId },
        namespace_revision: authority.namespaceRevision,
        anonymous_id_hash: parsed.data.correlation.anonymous_id_hash,
        user_id_hash: parsed.data.correlation.user_id_hash,
        account_id_hash: parsed.data.correlation.account_id_hash,
        verification: "server_namespace"
      };
    }
  }
  if (input.identityContext !== undefined) {
    if (policyInput.principal !== "relay")
      return { kind: "rejected", reason: "source_not_authorized" };
    const parsed = SemanticAnalyticsEventSchema.safeParse(input.event);
    if (!parsed.success) return { kind: "rejected", reason: "invalid_event" };
    if (
      parsed.data.correlation.namespace_revision !== null ||
      parsed.data.correlation.anonymous_id_hash !== null ||
      parsed.data.correlation.user_id_hash !== null ||
      parsed.data.correlation.account_id_hash !== null
    )
      return { kind: "rejected", reason: "identity_not_authorized" };
    const resolved = await runInTransaction(db, (tx) =>
      resolveProjectAnalyticsIdentityContextInTransaction(
        tx,
        policyInput.credentialHash,
        input.identityContext!
      )
    );
    verifiedContext = resolved?.context ?? null;
    verifiedWriterId = resolved?.writerId ?? null;
    if (verifiedContext === null || verifiedContext.project_id !== policyInput.projectId)
      return { kind: "rejected", reason: "identity_not_authorized" };
    submittedEvent = {
      ...parsed.data,
      correlation: {
        ...parsed.data.correlation,
        namespace_revision: verifiedContext.namespace_revision,
        anonymous_id_hash: verifiedContext.anonymous_id_hash,
        user_id_hash: verifiedContext.user_id_hash,
        account_id_hash: verifiedContext.account_id_hash
      }
    };
  }
  const policyContext =
    verifiedContext === null
      ? { ...policy.context, identity: serverIdentity }
      : {
          ...policy.context,
          identity: {
            scope: verifiedContext.scope,
            namespace_revision: verifiedContext.namespace_revision,
            anonymous_id_hash: verifiedContext.anonymous_id_hash,
            user_id_hash: verifiedContext.user_id_hash,
            account_id_hash: verifiedContext.account_id_hash,
            verification:
              verifiedContext.user_id_hash === null
                ? ("project_anonymous" as const)
                : ("first_party_association" as const)
          }
        };
  let admission = admitSemanticAnalyticsEvent(submittedEvent, policyContext);
  let lateReplay = false;
  if (!admission.accepted && admission.reason === "outside_correction_window") {
    let parsed: ReturnType<typeof SemanticAnalyticsEventSchema.safeParse>;
    try {
      parsed = SemanticAnalyticsEventSchema.safeParse(submittedEvent);
    } catch {
      return { kind: "rejected", reason: "invalid_event" };
    }
    if (parsed.success) {
      const existing = await db.query(
        `SELECT 1 FROM semantic_analytics_receipts
         WHERE project_id=$1::uuid AND event_id=$2::uuid`,
        [policy.context.projectId, parsed.data.event_id]
      );
      if (existing.rows.length === 1) {
        // Current policy/privacy still re-admits the protected event. The
        // receipt transaction must prove that the original row still exists.
        admission = admitSemanticAnalyticsEvent(submittedEvent, {
          ...policyContext,
          earliestOccurredAt: parsed.data.occurred_at
        });
        lateReplay = admission.accepted;
      }
    }
  }
  if (!admission.accepted) return { kind: "rejected", reason: admission.reason };
  // Financial receipt identity needs an authenticated billing-source namespace,
  // distinct from the subject namespace currently stored by this project-only path.
  if (admission.event.payload.financial !== null)
    return { kind: "rejected", reason: "source_not_authorized" };
  return persistProtectedSemanticAnalyticsEvent(
    receipts,
    {
      admission,
      principal: policyInput.principal,
      periodStartsAt: policy.usageWindow.startsAt,
      limits: policy.limits,
      identityContext:
        verifiedContext === null
          ? null
          : {
              contextId: verifiedContext.context_id,
              writerId: verifiedWriterId!,
              producerEpoch: verifiedContext.producer_epoch
            },
      serverIdentityWriterId:
        serverIdentity === null ? null : policy.serverIdentityAuthority!.writerId,
      recheck: async (tx, admitted) => {
        if (input.identityContext !== undefined) {
          const current = await resolveProjectAnalyticsIdentityContextInTransaction(
            tx,
            policyInput.credentialHash,
            input.identityContext
          );
          if (
            current === null ||
            current.writerId !== verifiedWriterId ||
            stableJson(current.context) !== stableJson(verifiedContext)
          )
            return false;
        }
        return recheckProjectSemanticAnalyticsAdmission(
          tx,
          policyInput,
          admitted,
          policy,
          lateReplay,
          policyContext.identity
        );
      }
    },
    objectStore
  );
}
