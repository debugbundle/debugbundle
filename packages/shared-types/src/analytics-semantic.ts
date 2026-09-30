import { z } from "zod";
import {
  SemanticAnalyticsKeySchema as StaticKeySchema,
  SemanticAnalyticsValueSchema,
  SemanticAnalyticsRevisionSchema as RevisionSchema,
  SemanticAnalyticsPropertyKeySchema as PropertyKeySchema,
  SemanticAnalyticsProducerSchema,
  SemanticAnalyticsPurposeSchema,
  SemanticAnalyticsKindSchema,
  SemanticAnalyticsUnitSchema
} from "./analytics-semantic-primitives.js";

import {
  AnalyticsAuthStateSchema,
  AnalyticsDeviceTypeSchema,
  AnalyticsPrivacyModeSchema,
  AnalyticsSafeHashSchema,
  AnalyticsViewportBucketSchema
} from "./analytics.js";

/** Additive wire contract. Do not widen V1 or the debug EventEnvelope union. */
export const SEMANTIC_ANALYTICS_SCHEMA_VERSION = "2026-09-analytics-02";
export const MAX_SEMANTIC_ANALYTICS_EVENT_BYTES = 16 * 1024;

const NullableReferenceSchema = AnalyticsSafeHashSchema.nullable();
const ContextReferenceSchema = z.string().min(1).max(128).nullable();

/** Preserve decimal values across JSON/languages without a floating-point round trip. */
export const AnalyticsDecimalSchema = z
  .string()
  .max(23)
  .regex(/^-?(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{0,5}[1-9])?$/)
  .refine((value) => value !== "-0", { message: "Negative zero is not canonical." });

const MinorUnitsSchema = z
  .string()
  .max(19)
  .regex(/^(?:0|[1-9][0-9]{0,18})$/)
  .refine((value) => value.length < 19 || value <= "9223372036854775807", {
    message: "Money exceeds the supported integer range."
  });

/** Currency/exponent support and financial source authority are enforced separately. */
export const AnalyticsMoneySchema = z
  .object({
    amount_minor: MinorUnitsSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    exponent: z.number().int().min(0).max(4)
  })
  .strict();
export type AnalyticsMoney = z.infer<typeof AnalyticsMoneySchema>;

export const AnalyticsReceiptOperationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("payment"),
      payment_id: AnalyticsSafeHashSchema,
      subscription_id: NullableReferenceSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal("refund"),
      refund_id: AnalyticsSafeHashSchema,
      payment_id: AnalyticsSafeHashSchema
    })
    .strict()
]);

const FinancialOperationSchema = z.discriminatedUnion("kind", [
  ...AnalyticsReceiptOperationSchema.options,
  z
    .object({
      kind: z.literal("subscription_state"),
      subscription_id: AnalyticsSafeHashSchema,
      status: z.enum(["trialing", "active", "past_due", "paused", "canceled"]),
      effective_at: z.string().datetime({ precision: 3 }),
      revision: RevisionSchema,
      billing_interval: z.enum(["day", "week", "month", "year"]),
      interval_count: z.number().int().min(1).max(12)
    })
    .strict()
]);

const LocaleSchema = z
  .string()
  .min(2)
  .max(35)
  .regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/)
  .nullable();
const ClientDimensionsSchema = z
  .object({
    auth_state: AnalyticsAuthStateSchema,
    device_type: AnalyticsDeviceTypeSchema,
    browser_family: StaticKeySchema.nullable(),
    browser_major: z.number().int().min(0).max(10000).nullable(),
    os_family: StaticKeySchema.nullable(),
    os_major: z.number().int().min(0).max(10000).nullable(),
    language: LocaleSchema,
    locale: LocaleSchema,
    viewport_bucket: AnalyticsViewportBucketSchema
  })
  .strict();

const MeasurementSchema = z
  .object({
    unit: SemanticAnalyticsUnitSchema,
    value: AnalyticsDecimalSchema
  })
  .strict();

const PropertiesSchema = z
  .record(PropertyKeySchema, z.union([SemanticAnalyticsValueSchema, z.boolean(), z.null()]))
  .refine((value) => Object.keys(value).length <= 20, {
    message: "At most twenty analytics properties are supported."
  });

const MeasurementsSchema = z
  .record(PropertyKeySchema, MeasurementSchema)
  .refine((value) => Object.keys(value).length <= 8, {
    message: "At most eight analytics measurements are supported."
  });

const RouteSchema = z
  .object({
    normalized_path: z
      .string()
      .min(1)
      .max(2048)
      .startsWith("/")
      .refine((value) => !value.startsWith("//") && !/[?#\\\s\u0000-\u001f]/.test(value), {
        message: "A relative route template without query, fragment or controls is required."
      })
  })
  .strict();

const CampaignKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/)
  .nullable();
const ReferrerDomainSchema = z
  .string()
  .min(1)
  .max(253)
  .refine(
    (value) => {
      const labels = value.split(".");
      return (
        labels.length >= 2 &&
        !/^[0-9.]+$/.test(value) &&
        labels.every(
          (label) => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
        )
      );
    },
    { message: "A canonical hostname without URL or IP data is required." }
  )
  .nullable();

const AcquisitionSchema = z
  .object({
    landing_route: RouteSchema.nullable(),
    referrer_domain: ReferrerDomainSchema,
    utm_source: CampaignKeySchema,
    utm_medium: CampaignKeySchema,
    utm_campaign: CampaignKeySchema
  })
  .strict();

const SessionSchema = z
  .object({
    duration_ms: z.number().int().min(0).max(86_400_000),
    active_duration_ms: z.number().int().min(0).max(86_400_000),
    views: z.number().int().min(0).max(100_000)
  })
  .strict()
  .refine((value) => value.active_duration_ms <= value.duration_ms, {
    message: "Active duration cannot exceed observed duration."
  });

const CorrelationSchema = z
  .object({
    session_id: z.string().uuid().nullable(),
    anonymous_id_hash: NullableReferenceSchema,
    user_id_hash: NullableReferenceSchema,
    account_id_hash: NullableReferenceSchema,
    namespace_revision: RevisionSchema.nullable(),
    trace_id: ContextReferenceSchema,
    deploy_id: ContextReferenceSchema
  })
  .strict();

const ProducerSchema = z
  .object({
    kind: SemanticAnalyticsProducerSchema,
    stream_id: z.string().uuid().nullable(),
    sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable()
  })
  .strict()
  .refine((value) => (value.sequence === null) === (value.stream_id === null), {
    message: "Producer sequence and stream must be supplied together."
  });

const PayloadSchema = z
  .object({
    kind: SemanticAnalyticsKindSchema,
    name: StaticKeySchema,
    event_revision: RevisionSchema,
    purpose: SemanticAnalyticsPurposeSchema,
    privacy: z.object({ mode: AnalyticsPrivacyModeSchema, consent_granted: z.boolean() }).strict(),
    route: RouteSchema.nullable(),
    previous_route: RouteSchema.nullable(),
    screen: StaticKeySchema.nullable(),
    session: SessionSchema.nullable(),
    acquisition: AcquisitionSchema.nullable(),
    client: ClientDimensionsSchema.nullable(),
    properties: PropertiesSchema,
    measurements: MeasurementsSchema,
    money: AnalyticsMoneySchema.nullable(),
    financial: FinancialOperationSchema.nullable()
  })
  .strict();

const SubmittedEventSchema = z
  .object({
    schema_version: z.literal(SEMANTIC_ANALYTICS_SCHEMA_VERSION),
    event_type: z.literal("analytics_event"),
    event_id: z.string().uuid(),
    occurred_at: z.string().datetime({ precision: 3 }),
    sdk_name: z.string().min(1).max(120),
    sdk_version: z.string().min(1).max(64),
    service: z
      .object({
        name: z.string().min(1).max(120),
        runtime: z.string().min(1).max(32),
        framework: z.string().min(1).max(80).nullable(),
        environment: z.string().min(1).max(120)
      })
      .strict(),
    producer: ProducerSchema,
    operation_id: NullableReferenceSchema,
    correlation: CorrelationSchema,
    payload: PayloadSchema
  })
  .strict();

/** Structural validity never grants server authority or authorizes identity linkage. */
export const SemanticAnalyticsEventSchema = SubmittedEventSchema.superRefine((event, ctx) => {
  const { payload, producer, correlation, service } = event;
  const issue = (path: (string | number)[], message: string): void =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  const mobileRuntimes = ["android", "ios", "react-native"];
  if (producer.kind === "server") {
    if (
      payload.kind !== "semantic" ||
      correlation.session_id !== null ||
      payload.route !== null ||
      payload.screen !== null ||
      payload.session !== null ||
      payload.acquisition !== null ||
      payload.client !== null
    ) {
      issue(["producer"], "Server analytics is semantic and sessionless.");
    }
    if (service.runtime === "browser" || mobileRuntimes.includes(service.runtime)) {
      issue(["service", "runtime"], "Client runtime is incompatible with server capture.");
    }
  } else {
    if (correlation.session_id === null)
      issue(["correlation", "session_id"], "Client capture requires a session.");
    if (payload.purpose !== "product_analytics" || !payload.privacy.consent_granted) {
      issue(["payload", "privacy"], "Client analytics requires consent-granted product analytics.");
    }
    if (
      (producer.kind === "browser" && service.runtime !== "browser") ||
      (producer.kind === "mobile" && !mobileRuntimes.includes(service.runtime))
    ) {
      issue(["service", "runtime"], "Runtime must match the client producer kind.");
    }
  }
  if (payload.purpose === "product_analytics" && !payload.privacy.consent_granted) {
    issue(["payload", "privacy"], "Product analytics requires consent.");
  }
  if (payload.purpose === "business_measurement" && event.operation_id === null) {
    issue(["operation_id"], "Business measurement requires a stable operation reference.");
  }
  if (
    event.operation_id !== null &&
    (producer.kind !== "server" || payload.purpose !== "business_measurement")
  ) {
    issue(["operation_id"], "Operation identity is reserved for server business facts.");
  }
  if (
    payload.money !== null &&
    (producer.kind !== "server" || payload.purpose !== "business_measurement")
  ) {
    issue(["payload", "money"], "Money requires server business measurement.");
  }
  if ((payload.financial === null) !== (payload.money === null)) {
    issue(["payload", "financial"], "Money and a typed financial operation are required together.");
  }
  if ((payload.kind === "page_view" || payload.kind === "route_change") && payload.route === null) {
    issue(["payload", "route"], "Page and route events require route context.");
  }
  if (payload.previous_route !== null && payload.kind !== "route_change") {
    issue(["payload", "previous_route"], "Previous route is only valid for a route change.");
  }
  if (payload.kind === "screen_view" && payload.screen === null) {
    issue(["payload", "screen"], "Screen views require a screen key.");
  }
  if (payload.screen !== null && producer.kind !== "mobile") {
    issue(["payload", "screen"], "Screen context is mobile-only.");
  }
  if ((payload.session !== null) !== (payload.kind === "session_summary")) {
    issue(["payload", "session"], "Session metrics are required only for a session summary.");
  }
  const hasIdentity =
    correlation.anonymous_id_hash !== null ||
    correlation.user_id_hash !== null ||
    correlation.account_id_hash !== null;
  if (hasIdentity !== (correlation.namespace_revision !== null)) {
    issue(
      ["correlation", "namespace_revision"],
      "Subject references require a namespace revision."
    );
  }
  if (payload.privacy.mode === "strict" && hasIdentity) {
    issue(["correlation"], "Strict privacy does not allow persistent subject references.");
  }
  if (
    payload.privacy.mode !== "custom" &&
    (correlation.user_id_hash !== null || correlation.account_id_hash !== null)
  ) {
    issue(["correlation"], "Known subject references require custom identity integration.");
  }
}).transform((event, ctx) => {
  // This validates an already structurally bounded, SDK-owned JSON event. Callers
  // still enforce raw request/snapshot limits before invoking schema validation.
  if (
    new TextEncoder().encode(JSON.stringify(event)).byteLength > MAX_SEMANTIC_ANALYTICS_EVENT_BYTES
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Analytics event exceeds the encoded byte limit."
    });
    return z.NEVER;
  }
  return event;
});
export type SemanticAnalyticsEvent = z.infer<typeof SemanticAnalyticsEventSchema>;
