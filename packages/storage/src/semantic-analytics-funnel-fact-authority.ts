import { AnalyticsScopeSchema, getTierCapabilities } from "../../shared-types/src/index.js";

export interface FunnelFactAuthorityRow {
  fact: unknown;
  receipt_present: boolean;
  identity_scope: unknown;
  identity_context_id: string | null;
  identity_writer_id: string | null;
  identity_producer_epoch: string | null;
  indexed_subject_ref: string | null;
  fact_subject: string | null;
  erasure_fenced: boolean;
  identity_verification: string | null;
  namespace_revision: string | null;
  revoked: boolean;
  writer_kind: string | null;
  writer_revoked_at: Date | null;
  writer_expires_at: Date | null;
  issuer_user_id: string | null;
  owner_user_id: string;
  organization_plan: string;
  organization_suspended_at: Date | null;
  member_present: boolean;
  member_suspended_at: Date | null;
  project_role: string | null;
  current_namespace_revision: string | null;
  namespace_revoked_at: Date | null;
  analytics_enabled: boolean | null;
  privacy_mode: string | null;
}

/** Exact protected subject or retained anonymous association is fenced at request time. */
export const FUNNEL_FACT_ERASURE_FENCE_SQL = `EXISTS (
  SELECT 1 FROM analytics_project_subject_erasures erasure
  JOIN semantic_analytics_receipt_subjects erased_subject
    ON erased_subject.project_id=fact.project_id
      AND erased_subject.event_id=fact.event_id
      AND erased_subject.namespace_revision=erasure.namespace_revision
  WHERE erasure.project_id=fact.project_id
    AND erasure.namespace_revision=receipt.namespace_revision
    AND fact.occurred_at<=erasure.cutoff_at
    AND ((erased_subject.subject_kind=erasure.subject_kind
          AND erased_subject.subject_ref=erasure.subject_ref)
      OR (erasure.subject_kind IN ('user','account')
        AND erased_subject.subject_kind='anonymous'
        AND EXISTS (
          SELECT 1 FROM analytics_project_identity_associations association
          WHERE association.project_id=fact.project_id
            AND association.namespace_revision=erasure.namespace_revision
            AND association.anonymous_id_hash=erased_subject.subject_ref
            AND ((erasure.subject_kind='user'
                  AND association.user_id_hash=erasure.subject_ref)
              OR (erasure.subject_kind='account'
                  AND association.account_id_hash=erasure.subject_ref)))))
)`;

/** A retained fact remains usable only while its identity authority still holds. */
export function isUsableProjectFunnelFact(
  row: FunnelFactAuthorityRow,
  projectId: string,
  watermark: string
): boolean {
  if (!row.receipt_present || row.erasure_fenced) return false;
  if (row.identity_scope === null)
    return row.identity_context_id === null && row.identity_writer_id === null;
  const scope = AnalyticsScopeSchema.safeParse(row.identity_scope);
  if (
    !scope.success ||
    scope.data.kind !== "project" ||
    scope.data.project_id !== projectId ||
    row.identity_writer_id === null ||
    row.indexed_subject_ref === null ||
    !["session", "anonymous", "user", "account"].includes(row.fact_subject ?? "") ||
    row.writer_revoked_at !== null ||
    row.writer_expires_at === null ||
    row.writer_expires_at.toISOString() <= watermark ||
    row.organization_suspended_at !== null ||
    row.issuer_user_id === null ||
    !row.member_present ||
    row.member_suspended_at !== null ||
    row.current_namespace_revision === null ||
    row.namespace_revoked_at !== null ||
    row.current_namespace_revision !== row.namespace_revision ||
    row.analytics_enabled !== true ||
    row.privacy_mode === "strict"
  )
    return false;
  if (row.identity_verification === "server_namespace") {
    if (
      row.identity_context_id !== null ||
      row.identity_producer_epoch !== null ||
      row.writer_kind !== "server" ||
      ((row.fact_subject === "user" || row.fact_subject === "account") &&
        row.privacy_mode !== "custom")
    )
      return false;
  } else if (
    row.identity_context_id === null ||
    row.identity_producer_epoch === null ||
    row.revoked ||
    row.writer_kind !== "relay" ||
    !["project_anonymous", "first_party_association"].includes(row.identity_verification ?? "") ||
    (row.identity_verification === "first_party_association" && row.privacy_mode !== "custom")
  )
    return false;
  return (
    row.issuer_user_id === row.owner_user_id ||
    (getTierCapabilities(row.organization_plan).shared_dashboards && row.project_role === "admin")
  );
}
