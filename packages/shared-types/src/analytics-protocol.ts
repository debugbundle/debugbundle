import { z } from "zod";
import { AnalyticsPrivacyModeSchema, AnalyticsSafeHashSchema } from "./analytics.js";
import { AnalyticsScopeSchema } from "./analytics-definitions.js";
import {
  SEMANTIC_ANALYTICS_SCHEMA_VERSION,
  MAX_SEMANTIC_ANALYTICS_EVENT_BYTES
} from "./analytics-semantic.js";
import {
  SemanticAnalyticsProducerSchema,
  SemanticAnalyticsPurposeSchema
} from "./analytics-semantic-primitives.js";

const Timestamp = z.string().datetime({ precision: 3 });
const Revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const boundedInteger = (max: number): z.ZodNumber => z.number().int().min(1).max(max);
const unique = <T>(values: T[]): boolean => new Set(values).size === values.length;
export const ANALYTICS_RETRYABLE_REASONS = [
  "rate_limited",
  "monthly_quota_exceeded",
  "analytics_quota_exceeded"
] as const;

/** Only an authenticated, non-cacheable server response can establish these capabilities. */
export const AnalyticsCapabilitiesSchema = z
  .object({
    protocol: z.literal("2026-09-analytics-capabilities-01"),
    project_id: z.string().uuid(),
    principal: z.enum(["server_writer", "project_token", "relay"]),
    server_time: Timestamp,
    expires_at: Timestamp,
    enabled: z.boolean(),
    unavailable_reason: z
      .enum(["not_enabled", "catalog_unavailable", "policy_rejected", "migration_required"])
      .nullable(),
    schema_version: z.literal(SEMANTIC_ANALYTICS_SCHEMA_VERSION),
    scope: AnalyticsScopeSchema,
    scope_revision: Revision,
    catalog_revision: Revision.nullable(),
    namespace_revision: Revision.nullable(),
    identity_scope: AnalyticsScopeSchema.nullable(),
    known_identity_allowed: z.boolean(),
    allowed_producers: z.array(SemanticAnalyticsProducerSchema).max(3).refine(unique),
    allowed_purposes: z.array(SemanticAnalyticsPurposeSchema).max(2).refine(unique),
    consent_required: z.boolean(),
    privacy_mode: AnalyticsPrivacyModeSchema,
    sample_rate: z.number().min(0).max(1),
    max_event_bytes: boundedInteger(MAX_SEMANTIC_ANALYTICS_EVENT_BYTES),
    max_batch_events: boundedInteger(256),
    max_batch_bytes: boundedInteger(256 * 1024),
    max_properties: z.number().int().min(0).max(20),
    detailed_retention_days: boundedInteger(90),
    max_event_age_seconds: boundedInteger(7 * 24 * 3600),
    correction_seconds: boundedInteger(48 * 3600),
    receipt_retention_days: boundedInteger(90),
    retry_after_max_ms: boundedInteger(300000)
  })
  .strict()
  .superRefine((value, ctx) => {
    const reject = (message: string): void => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    };
    const lifetime = Date.parse(value.expires_at) - Date.parse(value.server_time);
    if (lifetime <= 0 || lifetime > 300000)
      reject("Capability lifetime must be positive and at most five minutes.");
    if (value.scope.kind === "project" && value.scope.project_id !== value.project_id)
      reject("Capability project scope mismatch.");
    if (value.enabled) {
      if (
        value.unavailable_reason !== null ||
        value.catalog_revision === null ||
        value.allowed_producers.length === 0 ||
        value.allowed_purposes.length === 0
      )
        reject("Enabled capture requires a catalog and explicit producer/purpose authority.");
    } else if (
      value.unavailable_reason === null ||
      value.allowed_producers.length > 0 ||
      value.allowed_purposes.length > 0
    )
      reject("Disabled capture must not grant authority.");
    if (value.principal === "server_writer") {
      if (value.allowed_producers.some((kind) => kind !== "server") || value.sample_rate !== 1)
        reject("Server writers are unsampled server sources only.");
    } else if (
      value.allowed_producers.includes("server") ||
      value.allowed_purposes.includes("business_measurement")
    )
      reject("Client and relay credentials cannot grant server business authority.");
    if (value.max_event_bytes > value.max_batch_bytes) reject("Event bound exceeds batch bound.");
    if (value.privacy_mode === "strict" && value.namespace_revision !== null)
      reject("Strict privacy cannot enable an identity namespace.");
    if ((value.identity_scope === null) !== (value.namespace_revision === null))
      reject("Identity scope and namespace revision must be present together.");
    if (
      value.identity_scope?.kind === "project" &&
      value.identity_scope.project_id !== value.project_id
    )
      reject("Project identity is isolated to the authenticated source.");
    if (
      value.identity_scope?.kind === "space" &&
      (value.scope.kind !== "space" ||
        value.identity_scope.space_id !== value.scope.space_id ||
        value.principal === "project_token")
    )
      reject("Space identity requires an authenticated server integration in the same space.");
    if (
      value.known_identity_allowed &&
      (value.privacy_mode !== "custom" ||
        value.identity_scope === null ||
        value.principal === "project_token")
    )
      reject("Known identity requires explicit custom first-party authority.");
    if (!value.enabled && (value.identity_scope !== null || value.known_identity_allowed))
      reject("Disabled capabilities cannot grant identity authority.");
  });
export type AnalyticsCapabilities = z.infer<typeof AnalyticsCapabilitiesSchema>;

const Index = z.number().int().min(0).max(255);
const AcceptedEvent = z
  .object({
    index: Index,
    event_id: z.string().uuid(),
    operation_id: AnalyticsSafeHashSchema.nullable(),
    content_hash: AnalyticsSafeHashSchema,
    accepted_at: Timestamp,
    expires_at: Timestamp,
    duplicate: z.boolean()
  })
  .strict()
  .superRefine((value, ctx) => {
    const lifetime = Date.parse(value.expires_at) - Date.parse(value.accepted_at);
    if (lifetime <= 0 || lifetime > 90 * 86400000)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Receipt lifetime must be positive and at most ninety days."
      });
  });

/** Counts retain the canonical SDK ACK shape; accepted indices add durable outbox evidence. */
export const AnalyticsDeliveryReceiptSchema = z
  .object({
    protocol: z.literal("2026-09-analytics-delivery-01"),
    project_id: z.string().uuid(),
    submitted: boundedInteger(256),
    accepted: z.number().int().min(0).max(256),
    rejected: z.number().int().min(0).max(256),
    errors: z
      .array(
        z
          .object({
            index: Index,
            reason: z
              .string()
              .min(1)
              .max(80)
              .regex(/^[a-z][a-z0-9_]*$/)
          })
          .strict()
      )
      .max(256),
    accepted_events: z.array(AcceptedEvent).max(256)
  })
  .strict()
  .superRefine((value, ctx) => {
    const reject = (message: string): void => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    };
    if (
      value.accepted + value.rejected !== value.submitted ||
      value.errors.length !== value.rejected ||
      value.accepted_events.length !== value.accepted
    )
      reject("Receipt counts must cover the original submitted batch exactly.");
    const indices = [
      ...value.errors.map((entry) => entry.index),
      ...value.accepted_events.map((entry) => entry.index)
    ];
    if (!unique(indices) || indices.some((index) => index >= value.submitted))
      reject("Receipt indices must be unique and in range.");
    const identities = new Map<string, z.infer<typeof AcceptedEvent>>();
    for (const receipt of [...value.accepted_events].sort(
      (left, right) => left.index - right.index
    )) {
      const identity = receipt.event_id.toLowerCase();
      const prior = identities.get(identity);
      if (
        prior !== undefined &&
        (!receipt.duplicate ||
          prior.content_hash.toLowerCase() !== receipt.content_hash.toLowerCase() ||
          (prior.operation_id?.toLowerCase() ?? null) !==
            (receipt.operation_id?.toLowerCase() ?? null))
      )
        reject(
          "Repeated event identities must acknowledge the same protected content as duplicates."
        );
      identities.set(identity, receipt);
    }
  });
export type AnalyticsDeliveryReceipt = z.infer<typeof AnalyticsDeliveryReceiptSchema>;

/** SDK-local failures are not server rejections or evidence permitting outbox deletion. */
export const AnalyticsDeliveryResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("received"), receipt: AnalyticsDeliveryReceiptSchema }).strict(),
  z
    .object({
      status: z.literal("unavailable"),
      reason: z.enum([
        "disabled",
        "unsupported",
        "consent_required",
        "capability_unavailable",
        "capacity_exceeded",
        "unsafe_input",
        "authentication_required",
        "record_expired",
        "destination_mismatch",
        "integrity_failure",
        "policy_changed",
        "timeout",
        "transport_failure",
        "protocol_failure"
      ])
    })
    .strict()
]);
export type AnalyticsDeliveryResult = z.infer<typeof AnalyticsDeliveryResultSchema>;

export const AnalyticsWriterCreateSchema = z
  .object({
    kind: z.enum(["server", "relay"]),
    display_name: z.string().min(1).max(120),
    expected_revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    idempotency_key: z.string().uuid(),
    expires_in_days: boundedInteger(365)
  })
  .strict();
export type AnalyticsWriterCreate = z.infer<typeof AnalyticsWriterCreateSchema>;
