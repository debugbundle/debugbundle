import { z } from "zod";

/** CSPRNG-backed UUID v4 using Web Crypto API (available in all target runtimes: Node 18+, modern browsers). */
function createUuidV4(): string {
  const cryptoSource = globalThis.crypto;
  if (typeof cryptoSource?.randomUUID === "function") {
    return cryptoSource.randomUUID();
  }

  // getRandomValues fallback for environments where randomUUID isn't exposed (e.g. non-secure HTTP contexts)
  const bytes = cryptoSource.getRandomValues(new Uint8Array(16));
  const versionByte = bytes[6] ?? 0;
  const variantByte = bytes[8] ?? 0;
  bytes[6] = (versionByte & 0x0f) | 0x40;
  bytes[8] = (variantByte & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

export const EventTypeValues = [
  "backend_exception",
  "request_event",
  "log_event",
  "frontend_breadcrumb",
  "frontend_exception",
  "deploy_metadata",
  "error_suppressed",
  "probe_event"
] as const;

export const EventTypeSchema = z.enum(EventTypeValues);

const ServiceSchema = z
  .object({
    name: z.string().min(1),
    runtime: z.string().min(1).nullable().optional(),
    framework: z.string().min(1).nullable().optional(),
    environment: z.string().min(1)
  })
  .strict();

const CorrelationSchema = z
  .object({
    request_id: z.string().nullable().optional(),
    trace_id: z.string().nullable().optional(),
    session_id: z.string().nullable().optional(),
    user_id_hash: z.string().nullable().optional()
  })
  .strict()
  .transform((value) => ({
    request_id: value.request_id ?? null,
    trace_id: value.trace_id ?? null,
    session_id: value.session_id ?? null,
    user_id_hash: value.user_id_hash ?? null
  }));

const InlineProbeDataItemSchema = z
  .object({
    label: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
    timestamp: z.string().datetime(),
    activation_id: z.string().uuid().nullable()
  })
  .strict();

const InlineProbeDataSchema = z
  .object({
    version: z.literal(1),
    items: z.array(InlineProbeDataItemSchema)
  })
  .strict();

export const RuntimeMemoryStatsSchema = z
  .object({
    rss: z.number().nonnegative().nullable(),
    heap_total: z.number().nonnegative().nullable(),
    heap_used: z.number().nonnegative().nullable(),
    external: z.number().nonnegative().nullable(),
    peak: z.number().nonnegative().nullable()
  })
  .strict();

const BackendRuntimePayloadSchema = z
  .object({
    version: z.string().min(1),
    platform: z.string().min(1).nullable().optional(),
    arch: z.string().min(1).nullable().optional(),
    pid: z.number().int().nonnegative().nullable().optional(),
    cwd: z.string().min(1).nullable().optional(),
    uptime_sec: z.number().nonnegative().nullable().optional(),
    hostname: z.string().min(1).nullable().optional(),
    thread_id: z.union([z.string(), z.number()]).nullable().optional(),
    framework_version: z.string().min(1).nullable().optional(),
    memory: RuntimeMemoryStatsSchema.nullable().optional(),
    framework_extras: z.record(z.string(), z.unknown()).nullable().optional()
  })
  .strict();

const BackendExceptionPayloadSchema = z
  .object({
    name: z.string().min(1),
    message: z.string().min(1),
    stack: z.string().min(1),
    handled: z.boolean(),
    request: z.object({
      method: z.string().min(1),
      path: z.string().min(1),
      query: z.record(z.string(), z.unknown()),
      headers: z.record(z.string(), z.unknown()),
      body: z.unknown().nullable().optional()
    }),
    response: z.object({
      status_code: z.number().int().nonnegative(),
      headers: z.record(z.string(), z.unknown()).optional(),
      body: z.unknown().optional()
    }),
    runtime: BackendRuntimePayloadSchema,
    probe_data: InlineProbeDataSchema.optional()
  })
  .strict();

const ClientDeviceInfoFields = {
  user_agent: z.string().nullable(),
  os: z.object({
    name: z.string().nullable(),
    version: z.string().nullable()
  }),
  device_type: z.enum(["desktop", "mobile", "tablet", "unknown"]),
  screen: z.object({
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative()
  }),
  viewport: z.object({
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative()
  }),
  device_pixel_ratio: z.number().positive().nullable(),
  touch_capable: z.boolean().nullable(),
  language: z.string().nullable(),
  connection_type: z.string().nullable(),
  color_scheme_preference: z.enum(["light", "dark", "no-preference"]).nullable()
};

export const MobileDeviceInfoSchema = z
  .object({
    ...ClientDeviceInfoFields,
    app_version: z.string().nullable().optional(),
    build_number: z.string().nullable().optional(),
    release_channel: z.string().nullable().optional(),
    api_level: z.number().int().nonnegative().nullable().optional(),
    manufacturer: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    timezone: z.string().nullable().optional(),
    battery_level: z.number().nonnegative().nullable().optional(),
    battery_charging: z.boolean().nullable().optional(),
    free_disk_bytes: z.number().int().nonnegative().nullable().optional(),
    free_memory_bytes: z.number().int().nonnegative().nullable().optional(),
    jailbroken: z.boolean().nullable().optional()
  })
  .strict();

const RequestEventPayloadFields = {
  method: z.string().min(1),
  path: z.string().min(1),
  query: z.record(z.string(), z.unknown()),
  headers: z.record(z.string(), z.unknown()),
  body: z.unknown().nullable().optional(),
  response_status: z.number().int().nonnegative(),
  duration_ms: z.number().nonnegative(),
  route_template: z.string().min(1).nullable().optional(),
  response_headers: z.record(z.string(), z.unknown()).optional(),
  response_body: z.unknown().optional()
};

const RequestEventPayloadSchema = z.union([
  z.object(RequestEventPayloadFields).strict(),
  z.object({ ...RequestEventPayloadFields, device: MobileDeviceInfoSchema }).strict()
]);

const LogEventPayloadFields = {
  level: z.string().min(1),
  message: z.string().min(1),
  attributes: z.record(z.string(), z.unknown())
};

const LogEventPayloadSchema = z.union([
  z.object(LogEventPayloadFields).strict(),
  z.object({ ...LogEventPayloadFields, device: MobileDeviceInfoSchema }).strict()
]);

const FrontendBreadcrumbPayloadFields = {
  breadcrumb_type: z.enum([
    "route_change",
    "click",
    "form_submit",
    "console_log",
    "network_request"
  ]),
  route: z.string().min(1).nullable().optional(),
  data: z.record(z.string(), z.unknown())
};

const FrontendBreadcrumbPayloadSchema = z.union([
  z.object(FrontendBreadcrumbPayloadFields).strict(),
  z
    .object({
      breadcrumb_type: z.string().min(1),
      route: z.string().min(1).nullable().optional(),
      data: z.record(z.string(), z.unknown()),
      device: MobileDeviceInfoSchema
    })
    .strict()
]);

const FrontendExceptionBreadcrumbSchema = z
  .object({
    ...FrontendBreadcrumbPayloadFields,
    ts: z.string().datetime()
  })
  .strict();

const MobileExceptionBreadcrumbSchema = z
  .object({
    breadcrumb_type: z.string().min(1),
    route: z.string().min(1).nullable().optional(),
    data: z.record(z.string(), z.unknown()),
    ts: z.string().datetime()
  })
  .strict();

const BrowserDeviceInfoSchema = z.object(ClientDeviceInfoFields).strict();

const BrowserExceptionEventSchema = z
  .object({
    kind: z.enum(["window_error", "resource_error"]),
    message: z.string().nullable(),
    file_name: z.string().nullable(),
    line_number: z.number().int().nonnegative().nullable(),
    column_number: z.number().int().nonnegative().nullable(),
    target: z
      .object({
        tag_name: z.string().nullable(),
        source_url: z.string().nullable(),
        attributes: z
          .object({
            rel: z.string().optional(),
            as: z.string().optional(),
            type: z.string().optional(),
            media: z.string().optional(),
            cross_origin: z.string().optional(),
            async: z.boolean().optional(),
            defer: z.boolean().optional(),
            integrity_present: z.boolean().optional()
          })
          .strict()
          .optional()
      })
      .strict()
      .nullable(),
    page: z
      .object({
        url: z.string().nullable(),
        referrer: z.string().nullable(),
        ready_state: z.enum(["loading", "interactive", "complete"]).nullable(),
        visibility_state: z.enum(["visible", "hidden", "prerender", "unloaded"]).nullable()
      })
      .strict()
      .optional(),
    opaque: z.boolean()
  })
  .strict();

const FrontendRejectionReasonSchema = z
  .object({
    kind: z.enum(["error", "string", "object", "null", "undefined", "unknown"]),
    name: z.string().min(1).optional(),
    message: z.string().min(1).optional(),
    preview: z.string().min(1).optional()
  })
  .strict();

const FrontendExceptionPayloadSchema = z
  .object({
    name: z.string().min(1),
    message: z.string().min(1),
    stack: z.string().min(1),
    route: z.string().min(1).nullable().optional(),
    browser: z
      .object({
        name: z.string().min(1),
        version: z.string().min(1)
      })
      .optional(),
    breadcrumbs: z
      .array(z.union([FrontendExceptionBreadcrumbSchema, MobileExceptionBreadcrumbSchema]))
      .optional(),
    device: z.union([BrowserDeviceInfoSchema, MobileDeviceInfoSchema]).nullable().optional(),
    browser_event: BrowserExceptionEventSchema.optional(),
    rejection_reason: FrontendRejectionReasonSchema.optional(),
    dom_context: z
      .object({
        mode: z.literal("lightweight"),
        html_excerpt: z.string().min(1)
      })
      .nullable()
      .optional(),
    probe_data: InlineProbeDataSchema.optional()
  })
  .strict();

const DeployMetadataPayloadSchema = z
  .object({
    commit_sha: z.string().min(1),
    version: z.string().min(1),
    branch: z.string().min(1),
    environment: z.string().min(1),
    deployed_at: z.string().datetime()
  })
  .strict();

const ErrorSuppressedPayloadFields = {
  fingerprint: z.string().min(1),
  suppressed_count: z.number().int().nonnegative(),
  window_seconds: z.number().int().positive(),
  first_seen: z.string().datetime(),
  last_seen: z.string().datetime()
};

const ErrorSuppressedPayloadSchema = z.union([
  z.object(ErrorSuppressedPayloadFields).strict(),
  z.object({ ...ErrorSuppressedPayloadFields, device: MobileDeviceInfoSchema }).strict()
]);

const ProbeEventPayloadFields = {
  label: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  activation_id: z.string().uuid().nullable(),
  probe_label_pattern: z.string().min(1)
};

const ProbeEventPayloadSchema = z.union([
  z.object(ProbeEventPayloadFields).strict(),
  z.object({ ...ProbeEventPayloadFields, device: MobileDeviceInfoSchema }).strict()
]);

const EnvelopeBaseSchema = z
  .object({
    schema_version: z.string().min(1),
    event_id: z.string().uuid(),
    event_type: EventTypeSchema,
    project_token: z.string().min(1).optional(),
    project_id: z.string().uuid().nullable().optional(),
    sdk_name: z.string().min(1),
    sdk_version: z.string().min(1),
    service: ServiceSchema,
    occurred_at: z.string().datetime(),
    correlation: CorrelationSchema.optional(),
    context: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

const MOBILE_SDK_NAMES = new Set([
  "@debugbundle/sdk-android",
  "@debugbundle/sdk-swift",
  "@debugbundle/sdk-react-native"
]);

export const EventEnvelopeSchema = z
  .discriminatedUnion("event_type", [
    EnvelopeBaseSchema.extend({
      event_type: z.literal("backend_exception"),
      payload: BackendExceptionPayloadSchema
    }),
    EnvelopeBaseSchema.extend({
      event_type: z.literal("request_event"),
      payload: RequestEventPayloadSchema
    }),
    EnvelopeBaseSchema.extend({
      event_type: z.literal("log_event"),
      payload: LogEventPayloadSchema
    }),
    EnvelopeBaseSchema.extend({
      event_type: z.literal("frontend_breadcrumb"),
      payload: FrontendBreadcrumbPayloadSchema
    }),
    EnvelopeBaseSchema.extend({
      event_type: z.literal("frontend_exception"),
      payload: FrontendExceptionPayloadSchema
    }),
    EnvelopeBaseSchema.extend({
      event_type: z.literal("deploy_metadata"),
      payload: DeployMetadataPayloadSchema
    }),
    EnvelopeBaseSchema.extend({
      event_type: z.literal("error_suppressed"),
      payload: ErrorSuppressedPayloadSchema
    }),
    EnvelopeBaseSchema.extend({
      event_type: z.literal("probe_event"),
      payload: ProbeEventPayloadSchema
    })
  ])
  .superRefine((event, context) => {
    if (event.event_type !== "frontend_exception") {
      return;
    }
    if (MOBILE_SDK_NAMES.has(event.sdk_name)) {
      if (event.payload.device === undefined || event.payload.device === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Required",
          path: ["payload", "device"]
        });
      }
      return;
    }
    if (event.payload.browser === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Required",
        path: ["payload", "browser"]
      });
    }
  });

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

type CorrelationInput = {
  request_id?: string | null;
  trace_id?: string | null;
  session_id?: string | null;
  user_id_hash?: string | null;
};

type EventEnvelopeFor<TEventType extends EventEnvelope["event_type"]> = Extract<
  EventEnvelope,
  { event_type: TEventType }
>;

type CreateEnvelopeInput<TEventType extends EventEnvelope["event_type"]> =
  TEventType extends EventEnvelope["event_type"]
    ? Omit<
        EventEnvelopeFor<TEventType>,
        "schema_version" | "event_id" | "occurred_at" | "correlation" | "sdk_name" | "sdk_version"
      > &
        Partial<
          Pick<
            EventEnvelopeFor<TEventType>,
            "schema_version" | "event_id" | "occurred_at" | "sdk_name" | "sdk_version"
          >
        > & {
          correlation?: CorrelationInput | undefined;
        }
    : never;

type AnyCreateEnvelopeInput = CreateEnvelopeInput<EventEnvelope["event_type"]>;

type CompatibleCreateEnvelopeInput = Omit<
  EventEnvelope,
  "schema_version" | "event_id" | "occurred_at" | "correlation" | "sdk_name" | "sdk_version"
> &
  Partial<
    Pick<EventEnvelope, "schema_version" | "event_id" | "occurred_at" | "sdk_name" | "sdk_version">
  > & {
    correlation?: CorrelationInput | undefined;
  };

export function createEventEnvelope<const TInput extends AnyCreateEnvelopeInput>(
  input: TInput
): EventEnvelopeFor<TInput["event_type"]>;
export function createEventEnvelope(input: CompatibleCreateEnvelopeInput): EventEnvelope;
export function createEventEnvelope(
  input: AnyCreateEnvelopeInput | CompatibleCreateEnvelopeInput
): EventEnvelope {
  const candidate = {
    schema_version: input.schema_version ?? "2026-03-01",
    event_id: input.event_id ?? createUuidV4(),
    event_type: input.event_type,
    project_token: input.project_token,
    project_id: input.project_id,
    sdk_name: input.sdk_name ?? "debugbundle-node",
    sdk_version: input.sdk_version ?? "0.0.0",
    service: input.service,
    occurred_at: input.occurred_at ?? new Date().toISOString(),
    correlation: input.correlation ?? {
      request_id: null,
      trace_id: null,
      session_id: null,
      user_id_hash: null
    },
    context: input.context,
    payload: input.payload
  };

  return EventEnvelopeSchema.parse(candidate);
}
