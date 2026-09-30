import {
  AnalyticsCapabilitiesSchema,
  MAX_SEMANTIC_ANALYTICS_EVENT_BYTES,
  SEMANTIC_ANALYTICS_SCHEMA_VERSION,
  type AnalyticsCapabilities
} from "../../shared-types/src/index.js";
import {
  loadCurrentProjectSemanticAnalyticsPolicy,
  type ProjectSemanticAnalyticsPolicyInput
} from "./semantic-analytics-policy.js";
import type { Queryable } from "./types.js";

/** Candidate current-state grant. The API keeps this resolver behind disabled feature gates. */
export async function resolveCurrentProjectSemanticAnalyticsCapability(
  db: Queryable,
  input: Omit<ProjectSemanticAnalyticsPolicyInput, "principal"> & {
    principal: "server_writer" | "project_token";
  }
): Promise<AnalyticsCapabilities | null> {
  const policy = await loadCurrentProjectSemanticAnalyticsPolicy(db, input);
  if (policy === null) return null;
  const { context } = policy;
  const purpose =
    input.principal === "server_writer" ? "business_measurement" : "product_analytics";
  if (purpose === "business_measurement" && !context.businessMeasurementAllowed) return null;
  const allowedProducers = (
    input.principal === "server_writer" ? (["server"] as const) : (["browser", "mobile"] as const)
  ).filter((producer) =>
    context.catalog.some((entry) => entry.purpose === purpose && entry.producers.includes(producer))
  );
  if (allowedProducers.length === 0) return null;
  const at = Date.parse(input.receivedAt);
  return AnalyticsCapabilitiesSchema.parse({
    protocol: "2026-09-analytics-capabilities-01",
    project_id: input.projectId,
    principal: input.principal,
    server_time: input.receivedAt,
    expires_at: new Date(at + 300_000).toISOString(),
    enabled: true,
    unavailable_reason: null,
    schema_version: SEMANTIC_ANALYTICS_SCHEMA_VERSION,
    scope: context.scope,
    scope_revision: context.scopeRevision,
    catalog_revision: context.catalogRevision,
    namespace_revision: policy.serverIdentityAuthority?.namespaceRevision ?? null,
    identity_scope:
      policy.serverIdentityAuthority === null
        ? null
        : { kind: "project", project_id: input.projectId },
    known_identity_allowed:
      policy.serverIdentityAuthority !== null && context.minimumPrivacy === "custom",
    allowed_producers: allowedProducers,
    allowed_purposes: [purpose],
    consent_required: input.principal === "server_writer" ? false : policy.consentRequired,
    privacy_mode: context.minimumPrivacy,
    sample_rate: 1,
    max_event_bytes: MAX_SEMANTIC_ANALYTICS_EVENT_BYTES,
    max_batch_events: 256,
    max_batch_bytes: 262_144,
    max_properties: context.maxProperties,
    detailed_retention_days: policy.detailedRetentionDays,
    max_event_age_seconds: 604_800,
    correction_seconds: 172_800,
    receipt_retention_days: 90,
    retry_after_max_ms: 300_000
  });
}
