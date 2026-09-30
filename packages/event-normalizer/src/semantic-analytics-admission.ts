import { createHash } from "node:crypto";
import { sanitizeTelemetry } from "../../redaction/src/index.js";
import {
  SemanticAnalyticsEventSchema,
  AnalyticsScopeSchema,
  type AnalyticsScope,
  type AnalyticsCatalogEntry,
  type SemanticAnalyticsEvent
} from "../../shared-types/src/index.js";
import { stableJson } from "./canonical-json.js";

type Identity = Pick<
  SemanticAnalyticsEvent["correlation"],
  "namespace_revision" | "anonymous_id_hash" | "user_id_hash" | "account_id_hash"
> & {
  scope: AnalyticsScope;
  verification: "project_anonymous" | "first_party_association" | "server_namespace";
};

/** Values originate from authenticated current storage, never from submitted event fields. */
export interface SemanticAnalyticsAdmissionContext {
  projectId: string;
  scope: AnalyticsScope;
  scopeRevision: number;
  catalogRevision: number;
  principal: "server_writer" | "project_token" | "relay";
  receivedAt: string;
  enabled: boolean;
  businessMeasurementAllowed: boolean;
  minimumPrivacy: "strict" | "standard" | "custom";
  maxProperties: number;
  earliestOccurredAt: string;
  identity: Identity | null;
  supportedCurrencies: Readonly<Record<string, number>>;
  catalog: AnalyticsCatalogEntry[];
}
export type SemanticAnalyticsAdmissionReason =
  | "analytics_disabled"
  | "invalid_event"
  | "source_not_authorized"
  | "purpose_not_authorized"
  | "invalid_catalog"
  | "privacy_rejected"
  | "identity_not_authorized"
  | "future_timestamp"
  | "outside_correction_window"
  | "unsupported_currency"
  | "analytics_policy_unavailable";
export type SemanticAnalyticsAdmissionResult =
  | { accepted: false; reason: SemanticAnalyticsAdmissionReason }
  | {
      accepted: true;
      event: SemanticAnalyticsEvent;
      origin_project_id: string;
      scope: AnalyticsScope;
      scope_revision: number;
      catalog_revision: number;
      identity_scope: AnalyticsScope | null;
      identity_verification: Identity["verification"] | null;
      authority: "server_authoritative" | "client_observed";
      received_at: string;
      content_hash: string;
      withheld_fields: number;
    };

const privacyRank = { custom: 0, standard: 1, strict: 2 } as const;
const identityKeys = [
  "namespace_revision",
  "anonymous_id_hash",
  "user_id_hash",
  "account_id_hash"
] as const;

function identityAuthorized(
  event: SemanticAnalyticsEvent,
  context: SemanticAnalyticsAdmissionContext
): boolean {
  if (event.correlation.namespace_revision === null) return true;
  const identity = context.identity;
  if (identity === null || identityKeys.some((key) => identity[key] !== event.correlation[key]))
    return false;
  const scope = AnalyticsScopeSchema.safeParse(identity.scope);
  if (!scope.success) return false;
  if (
    scope.data.kind === "project"
      ? scope.data.project_id !== context.projectId
      : context.scope.kind !== "space" || scope.data.space_id !== context.scope.space_id
  )
    return false;
  switch (identity.verification) {
    case "project_anonymous":
      return (
        context.principal !== "server_writer" &&
        scope.data.kind === "project" &&
        identity.user_id_hash === null &&
        identity.account_id_hash === null
      );
    case "first_party_association":
      return context.principal === "relay";
    case "server_namespace":
      return context.principal === "server_writer";
  }
  return false;
}

function protectedEvent(event: SemanticAnalyticsEvent): SemanticAnalyticsEvent | null {
  for (const [key, measurement] of Object.entries(event.payload.measurements)) {
    for (const value of [key, measurement.unit]) {
      const checked = sanitizeTelemetry(value);
      if (!checked.ok || checked.value !== value) return null;
    }
  }
  for (const value of Object.values(event.correlation)) {
    if (typeof value !== "string") continue;
    const checked = sanitizeTelemetry(value);
    if (!checked.ok || checked.value !== value) return null;
  }
  // These schema-validated fields are closed hashes, canonical numbers and fixed enums.
  // Redacting a payment reference by its field name would destroy deduplication.
  const sanitized = sanitizeTelemetry(
    {
      ...event,
      correlation: null,
      operation_id: null,
      payload: { ...event.payload, financial: null, money: null, measurements: {} }
    },
    { maxTotalBytes: 16 * 1024 }
  );
  if (
    !sanitized.ok ||
    sanitized.value === null ||
    typeof sanitized.value !== "object" ||
    Array.isArray(sanitized.value)
  )
    return null;
  const payload = sanitized.value["payload"];
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const validated = SemanticAnalyticsEventSchema.safeParse({
    ...sanitized.value,
    correlation: event.correlation,
    operation_id: event.operation_id,
    payload: {
      ...payload,
      financial: event.payload.financial,
      money: event.payload.money,
      measurements: event.payload.measurements
    }
  });
  return validated.success ? validated.data : null;
}

function applyCatalog(
  event: SemanticAnalyticsEvent,
  entry: AnalyticsCatalogEntry,
  maxProperties: number
): number | null {
  if (
    entry.revision !== event.payload.event_revision ||
    entry.purpose !== event.payload.purpose ||
    !entry.producers.includes(event.producer.kind)
  )
    return null;
  const properties: SemanticAnalyticsEvent["payload"]["properties"] = {};
  const measurements: SemanticAnalyticsEvent["payload"]["measurements"] = {};
  for (const [key, definition] of Object.entries(entry.properties)) {
    const value = event.payload.properties[key];
    if (value === undefined) {
      if (definition.required) return null;
      continue;
    }
    if (value === null) {
      if (definition.required) return null;
      properties[key] = null;
      continue;
    }
    if (
      definition.type === "enum"
        ? typeof value !== "string" || !definition.values.includes(value)
        : typeof value !== "boolean"
    )
      return null;
    properties[key] = value;
  }
  if (Object.keys(properties).length > maxProperties) return null;
  for (const [key, definition] of Object.entries(entry.measurements)) {
    const value = event.payload.measurements[key];
    if (value === undefined) {
      if (definition.required) return null;
      continue;
    }
    if (value.unit !== definition.unit) return null;
    measurements[key] = value;
  }
  const withheld =
    Object.keys(event.payload.properties).length -
    Object.keys(properties).length +
    Object.keys(event.payload.measurements).length -
    Object.keys(measurements).length;
  event.payload.properties = properties;
  event.payload.measurements = measurements;
  return withheld;
}

/** Lightweight admission only: callers own byte-limited parsing, auth, receipts, quota and persistence. */
export function admitSemanticAnalyticsEvent(
  input: unknown,
  context: SemanticAnalyticsAdmissionContext
): SemanticAnalyticsAdmissionResult {
  const reject = (reason: SemanticAnalyticsAdmissionReason): SemanticAnalyticsAdmissionResult => ({
    accepted: false,
    reason
  });
  if (!context.enabled) return reject("analytics_disabled");
  try {
    const received = Date.parse(context.receivedAt),
      earliest = Date.parse(context.earliestOccurredAt);
    const scope = AnalyticsScopeSchema.safeParse(context.scope);
    if (
      !scope.success ||
      (scope.data.kind === "project" && scope.data.project_id !== context.projectId) ||
      !Number.isSafeInteger(context.scopeRevision) ||
      context.scopeRevision < 1 ||
      !Number.isSafeInteger(context.catalogRevision) ||
      context.catalogRevision < 1 ||
      !["server_writer", "project_token", "relay"].includes(context.principal) ||
      !Number.isFinite(received) ||
      !Number.isFinite(earliest) ||
      earliest > received ||
      !Number.isInteger(context.maxProperties) ||
      context.maxProperties < 0 ||
      context.maxProperties > 20
    )
      return reject("analytics_policy_unavailable");
    const parsed = SemanticAnalyticsEventSchema.safeParse(input);
    if (!parsed.success) return reject("invalid_event");
    const event = parsed.data;
    const server = context.principal === "server_writer";
    if (server !== (event.producer.kind === "server")) return reject("source_not_authorized");
    if (event.payload.purpose === "business_measurement" && !context.businessMeasurementAllowed)
      return reject("purpose_not_authorized");
    if (privacyRank[event.payload.privacy.mode] < privacyRank[context.minimumPrivacy])
      return reject("privacy_rejected");
    if (!identityAuthorized(event, context)) return reject("identity_not_authorized");
    const occurred = Date.parse(event.occurred_at);
    if (occurred > received + 300000) return reject("future_timestamp");
    if (occurred < earliest) return reject("outside_correction_window");
    if (
      event.payload.money !== null &&
      (!Object.hasOwn(context.supportedCurrencies, event.payload.money.currency) ||
        context.supportedCurrencies[event.payload.money.currency] !== event.payload.money.exponent)
    )
      return reject("unsupported_currency");
    const entry = context.catalog.find((entry) => entry.name === event.payload.name);
    if (entry === undefined) return reject("invalid_catalog");
    const withheld = applyCatalog(event, entry, context.maxProperties);
    if (withheld === null) return reject("invalid_catalog");
    const protectedValue = protectedEvent(event);
    if (protectedValue === null) return reject("privacy_rejected");
    // Policy/catalog assertions must still hold after mandatory protection.
    if (
      protectedValue.payload.name !== entry.name ||
      applyCatalog(protectedValue, entry, context.maxProperties) === null
    )
      return reject("privacy_rejected");
    return {
      accepted: true,
      event: protectedValue,
      origin_project_id: context.projectId,
      scope: scope.data,
      scope_revision: context.scopeRevision,
      catalog_revision: context.catalogRevision,
      identity_scope:
        event.correlation.namespace_revision === null
          ? null
          : structuredClone(context.identity!.scope),
      identity_verification:
        event.correlation.namespace_revision === null ? null : context.identity!.verification,
      authority: server ? "server_authoritative" : "client_observed",
      received_at: context.receivedAt,
      content_hash: `sha256:${createHash("sha256").update(stableJson(protectedValue)).digest("hex")}`,
      withheld_fields: withheld
    };
  } catch {
    return reject("invalid_event");
  }
}
