import { z } from "zod";
import {
  AnalyticsCatalogEntrySchema,
  ANALYTICS_CURRENCY_EXPONENTS,
  getTierCapabilities,
  isSelfHostMode
} from "../../shared-types/src/index.js";
import {
  admitSemanticAnalyticsEvent,
  type SemanticAnalyticsAdmissionContext,
  type SemanticAnalyticsAdmissionResult
} from "../../event-normalizer/src/semantic-analytics-admission.js";
import { stableJson } from "../../event-normalizer/src/canonical-json.js";
import { createAnalyticsWriterStore } from "./analytics-writer-store.js";
import type { Queryable } from "./types.js";

const Input = z
  .object({
    projectId: z.string().uuid(),
    principal: z.enum(["server_writer", "project_token", "relay"]),
    credentialHash: z.string().regex(/^[a-f0-9]{64}$/),
    receivedAt: z.string().datetime({ precision: 3 })
  })
  .strict();
export type ProjectSemanticAnalyticsPolicyInput = z.infer<typeof Input>;
type Admitted = Extract<SemanticAnalyticsAdmissionResult, { accepted: true }>;
type PolicyRow = {
  organization_id: string;
  owner_user_id: string;
  plan: string;
  additional_capacity_units: number;
  billing_period_starts_at: Date | null;
  billing_period_ends_at: Date | null;
  enabled: boolean;
  privacy_mode: string;
  consent_required: boolean;
  hourly_retention_days: number;
  max_custom_dimensions: number;
  plan_revision: string | number;
  plan_catalog_revision: string | number;
  business_measurement_enabled: boolean;
  plan_catalog: unknown;
  current_catalog_revision: string | number;
  current_entries: unknown;
};

export interface CurrentProjectSemanticAnalyticsPolicy {
  context: SemanticAnalyticsAdmissionContext;
  serverIdentityAuthority: { writerId: string; namespaceRevision: number } | null;
  consentRequired: boolean;
  detailedRetentionDays: number;
  usageWindow: { startsAt: string; endsAt: string };
  limits: {
    monthly_analytics_events: number;
    monthly_analytics_sessions: number;
    monthly_analytics_journey_samples: number;
    monthly_analytics_bundle_generations: number;
  };
}

/** Project-only current authority. The ingress adapter must supply a server-owned receipt time. */
export async function loadCurrentProjectSemanticAnalyticsPolicy(
  db: Queryable,
  input: ProjectSemanticAnalyticsPolicyInput
): Promise<CurrentProjectSemanticAnalyticsPolicy | null> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return null;
  const { projectId, principal, credentialHash, receivedAt } = parsed.data;
  // Seven days is the maximum explicitly supported offline delivery age. The
  // 48-hour report correction window is a separate calculation/revision rule.
  const earliestTime = new Date(Date.parse(receivedAt) - 7 * 86_400_000);
  if (!Number.isFinite(earliestTime.getTime())) return null;
  const earliestOccurredAt = earliestTime.toISOString();

  const row = (
    await db.query<PolicyRow & Record<string, unknown>>(
      `SELECT p.organization_id,p.owner_user_id,org.plan,
       COALESCE(org.additional_capacity_units,0)::int AS additional_capacity_units,
       org.billing_period_starts_at,org.billing_period_ends_at,
       settings.enabled,settings.privacy_mode,settings.consent_required,
       settings.hourly_retention_days,settings.max_custom_dimensions,
       plan.revision AS plan_revision,plan.catalog_revision AS plan_catalog_revision,
       plan.business_measurement_enabled,plan.catalog AS plan_catalog,
       catalog.catalog_revision AS current_catalog_revision,catalog.entries AS current_entries
     FROM projects p
     JOIN organizations org ON org.id=p.organization_id AND org.suspended_at IS NULL
     JOIN project_analytics_settings settings ON settings.project_id=p.id
     JOIN analytics_project_plans plan ON plan.project_id=p.id
     JOIN analytics_project_catalogs catalog ON catalog.project_id=p.id
     WHERE p.id=$1::uuid FOR SHARE OF org,settings,plan,catalog`,
      [projectId]
    )
  ).rows[0];
  if (row === undefined || !row.enabled) return null;
  let serverWriterId: string | null = null;
  if (principal === "server_writer" || principal === "relay") {
    const writer = await createAnalyticsWriterStore(db).resolveByTokenHash(credentialHash);
    if (
      writer === null ||
      writer.project_id !== projectId ||
      writer.organization_id !== row.organization_id ||
      writer.kind !== (principal === "server_writer" ? "server" : "relay") ||
      writer.revoked_at !== null ||
      Date.parse(writer.expires_at) <= Date.now()
    )
      return null;
    const locked = (
      await db.query<{ issuer_user_id: string; expires_at: Date; revoked_at: Date | null }>(
        `SELECT issuer_user_id,expires_at,revoked_at FROM analytics_writers
         WHERE id=$1::uuid AND token_hash=$2 AND project_id=$3::uuid AND organization_id=$4::uuid
         FOR SHARE`,
        [writer.writer_id, credentialHash, projectId, row.organization_id]
      )
    ).rows[0];
    if (
      locked === undefined ||
      locked.issuer_user_id !== writer.issuer_user_id ||
      locked.revoked_at !== null ||
      locked.expires_at.getTime() <= Date.now()
    )
      return null;
    if (principal === "server_writer") serverWriterId = writer.writer_id;
    const organizationMember = (
      await db.query<{ suspended_at: Date | null }>(
        `SELECT suspended_at FROM organization_members
         WHERE organization_id=$1::uuid AND user_id=$2::uuid FOR SHARE`,
        [row.organization_id, writer.issuer_user_id]
      )
    ).rows[0];
    if (organizationMember !== undefined && organizationMember.suspended_at !== null) return null;
    if (row.owner_user_id === writer.issuer_user_id) {
      if (organizationMember === undefined) return null;
    } else {
      if (!getTierCapabilities(row.plan).shared_dashboards) return null;
      const collaborator = (
        await db.query<{ role: string }>(
          `SELECT role FROM project_members WHERE project_id=$1::uuid AND user_id=$2::uuid FOR SHARE`,
          [projectId, writer.issuer_user_id]
        )
      ).rows[0];
      if (collaborator?.role !== "admin") return null;
    }
  } else {
    const token = await db.query(
      `SELECT pt.id FROM project_tokens pt
       WHERE pt.token_hash=$1 AND pt.project_id=$2::uuid AND pt.revoked_at IS NULL
         AND (pt.expires_at IS NULL OR pt.expires_at>now())
       FOR SHARE OF pt`,
      [credentialHash, projectId]
    );
    if (token.rows.length !== 1) return null;
  }
  const entries = z.array(AnalyticsCatalogEntrySchema).max(100).safeParse(row.current_entries);
  const planEntries = z.array(AnalyticsCatalogEntrySchema).max(100).safeParse(row.plan_catalog);
  const caps = getTierCapabilities(row.plan);
  const paid = !isSelfHostMode() && (row.plan === "solo" || row.plan === "team");
  const capacityUnits = paid
    ? caps.included_capacity_units + Math.max(0, row.additional_capacity_units)
    : 1;
  const received = new Date(receivedAt);
  const starts = row.billing_period_starts_at;
  const ends = row.billing_period_ends_at;
  if ((starts === null) !== (ends === null)) return null;
  if (paid && starts !== null && ends !== null) {
    if (
      !(starts instanceof Date) ||
      !(ends instanceof Date) ||
      !Number.isFinite(starts.getTime()) ||
      !Number.isFinite(ends.getTime()) ||
      starts >= ends ||
      received < starts ||
      received >= ends
    )
      return null;
  }
  const usageWindow =
    paid && starts !== null && ends !== null
      ? { startsAt: starts.toISOString(), endsAt: ends.toISOString() }
      : {
          startsAt: new Date(
            Date.UTC(received.getUTCFullYear(), received.getUTCMonth(), 1)
          ).toISOString(),
          endsAt: new Date(
            Date.UTC(received.getUTCFullYear(), received.getUTCMonth() + 1, 1)
          ).toISOString()
        };
  const catalogRevision = Number(row.current_catalog_revision);
  const planRevision = Number(row.plan_revision);
  const maxProperties = Math.min(
    caps.max_analytics_custom_dimensions,
    Number(row.max_custom_dimensions)
  );
  if (
    !caps.analytics_bundle ||
    !entries.success ||
    !planEntries.success ||
    stableJson(entries.data) !== stableJson(planEntries.data) ||
    !Number.isSafeInteger(catalogRevision) ||
    catalogRevision < 1 ||
    Number(row.plan_catalog_revision) !== catalogRevision ||
    !Number.isSafeInteger(planRevision) ||
    planRevision < 1 ||
    !Number.isSafeInteger(maxProperties) ||
    maxProperties < 0 ||
    maxProperties > 20 ||
    !Number.isSafeInteger(row.hourly_retention_days) ||
    row.hourly_retention_days < 1 ||
    !["strict", "standard", "custom"].includes(row.privacy_mode)
  )
    return null;
  let serverIdentityAuthority: CurrentProjectSemanticAnalyticsPolicy["serverIdentityAuthority"] =
    null;
  if (serverWriterId !== null && row.privacy_mode !== "strict") {
    const namespace = (
      await db.query<{ namespace_revision: string }>(
        `SELECT namespace_revision FROM analytics_project_identity_namespaces
         WHERE project_id=$1::uuid AND revoked_at IS NULL FOR SHARE`,
        [projectId]
      )
    ).rows[0];
    const revision = Number(namespace?.namespace_revision);
    if (Number.isSafeInteger(revision) && revision > 0)
      serverIdentityAuthority = { writerId: serverWriterId, namespaceRevision: revision };
  }
  return {
    serverIdentityAuthority,
    usageWindow,
    consentRequired: row.consent_required,
    detailedRetentionDays: Math.min(row.hourly_retention_days, 90),
    context: {
      projectId,
      scope: { kind: "project", project_id: projectId },
      scopeRevision: 1,
      catalogRevision,
      principal,
      receivedAt,
      enabled: true,
      businessMeasurementAllowed: principal === "server_writer" && row.business_measurement_enabled,
      minimumPrivacy: row.privacy_mode as "strict" | "standard" | "custom",
      maxProperties,
      earliestOccurredAt,
      identity: null,
      supportedCurrencies: ANALYTICS_CURRENCY_EXPONENTS,
      catalog: entries.data
    },
    limits: {
      monthly_analytics_events: caps.monthly_analytics_events * capacityUnits,
      monthly_analytics_sessions: caps.monthly_analytics_sessions * capacityUnits,
      monthly_analytics_journey_samples: caps.monthly_analytics_journey_samples * capacityUnits,
      monthly_analytics_bundle_generations:
        caps.monthly_analytics_bundle_generations * capacityUnits
    }
  };
}

/** Run inside the receipt's project-locked transaction before either receipt path can ACK. */
export async function recheckProjectSemanticAnalyticsAdmission(
  tx: Queryable,
  input: ProjectSemanticAnalyticsPolicyInput,
  admitted: Admitted,
  expectedPolicy: Pick<CurrentProjectSemanticAnalyticsPolicy, "limits" | "usageWindow">,
  requireExistingReceipt = false,
  identity: SemanticAnalyticsAdmissionContext["identity"] = null
): Promise<boolean> {
  const policy = await loadCurrentProjectSemanticAnalyticsPolicy(tx, input);
  if (
    policy === null ||
    stableJson(policy.limits) !== stableJson(expectedPolicy.limits) ||
    stableJson(policy.usageWindow) !== stableJson(expectedPolicy.usageWindow) ||
    admitted.origin_project_id !== policy.context.projectId ||
    admitted.scope.kind !== "project" ||
    admitted.scope.project_id !== policy.context.projectId ||
    admitted.scope_revision !== policy.context.scopeRevision ||
    admitted.catalog_revision !== policy.context.catalogRevision ||
    stableJson(admitted.identity_scope) !== stableJson(identity?.scope ?? null) ||
    admitted.identity_verification !== (identity?.verification ?? null) ||
    (identity?.verification === "server_namespace" &&
      (policy.serverIdentityAuthority === null ||
        policy.serverIdentityAuthority.namespaceRevision !== identity.namespace_revision ||
        ((identity.user_id_hash !== null || identity.account_id_hash !== null) &&
          policy.context.minimumPrivacy !== "custom"))) ||
    admitted.received_at !== policy.context.receivedAt
  )
    return false;
  if (requireExistingReceipt) {
    // A late retry may bypass intake age only while the original receipt is
    // locked in this transaction. It can never create a new old event.
    const existing = await tx.query(
      `SELECT 1 FROM semantic_analytics_receipts
       WHERE project_id=$1::uuid AND event_id=$2::uuid FOR SHARE`,
      [admitted.origin_project_id, admitted.event.event_id]
    );
    if (existing.rows.length !== 1) return false;
  }
  const fresh = admitSemanticAnalyticsEvent(
    admitted.event,
    requireExistingReceipt
      ? { ...policy.context, identity, earliestOccurredAt: admitted.event.occurred_at }
      : { ...policy.context, identity }
  );
  return (
    fresh.accepted &&
    fresh.content_hash === admitted.content_hash &&
    fresh.authority === admitted.authority
  );
}
