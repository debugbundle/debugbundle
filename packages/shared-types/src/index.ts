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

const ServiceSchema = z.object({
  name: z.string().min(1),
  runtime: z.string().min(1).nullable().optional(),
  framework: z.string().min(1).nullable().optional(),
  environment: z.string().min(1)
});

const CorrelationSchema = z
  .object({
    request_id: z.string().nullable(),
    trace_id: z.string().nullable(),
    session_id: z.string().nullable(),
    user_id_hash: z.string().nullable()
  })
  .strict();

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

const RuntimeMemoryStatsSchema = z
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

const RequestEventPayloadSchema = z
  .object({
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
  })
  .strict();

const LogEventPayloadSchema = z
  .object({
    level: z.string().min(1),
    message: z.string().min(1),
    attributes: z.record(z.string(), z.unknown())
  })
  .strict();

const FrontendBreadcrumbPayloadSchema = z
  .object({
    breadcrumb_type: z.enum(["route_change", "click", "form_submit", "console_log", "network_request"]),
    route: z.string().min(1).nullable().optional(),
    data: z.record(z.string(), z.unknown())
  })
  .strict();

const FrontendExceptionBreadcrumbSchema = FrontendBreadcrumbPayloadSchema.extend({
  ts: z.string().datetime()
});

const DeviceInfoSchema = z
  .object({
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
  })
  .strict();

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

const FrontendExceptionPayloadSchema = z
  .object({
    name: z.string().min(1),
    message: z.string().min(1),
    stack: z.string().min(1),
    route: z.string().min(1).nullable().optional(),
    browser: z.object({
      name: z.string().min(1),
      version: z.string().min(1)
    }),
    breadcrumbs: z.array(FrontendExceptionBreadcrumbSchema).optional(),
    device: DeviceInfoSchema.nullable().optional(),
    browser_event: BrowserExceptionEventSchema.optional(),
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

const ErrorSuppressedPayloadSchema = z
  .object({
    fingerprint: z.string().min(1),
    suppressed_count: z.number().int().nonnegative(),
    window_seconds: z.number().int().positive(),
    first_seen: z.string().datetime(),
    last_seen: z.string().datetime()
  })
  .strict();

const ProbeEventPayloadSchema = z
  .object({
    label: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
    activation_id: z.string().uuid().nullable(),
    probe_label_pattern: z.string().min(1)
  })
  .strict();

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
    correlation: CorrelationSchema.optional()
  })
  .strict();

export const EventEnvelopeSchema = z.discriminatedUnion("event_type", [
  EnvelopeBaseSchema.extend({ event_type: z.literal("backend_exception"), payload: BackendExceptionPayloadSchema }),
  EnvelopeBaseSchema.extend({ event_type: z.literal("request_event"), payload: RequestEventPayloadSchema }),
  EnvelopeBaseSchema.extend({ event_type: z.literal("log_event"), payload: LogEventPayloadSchema }),
  EnvelopeBaseSchema.extend({ event_type: z.literal("frontend_breadcrumb"), payload: FrontendBreadcrumbPayloadSchema }),
  EnvelopeBaseSchema.extend({ event_type: z.literal("frontend_exception"), payload: FrontendExceptionPayloadSchema }),
  EnvelopeBaseSchema.extend({ event_type: z.literal("deploy_metadata"), payload: DeployMetadataPayloadSchema }),
  EnvelopeBaseSchema.extend({ event_type: z.literal("error_suppressed"), payload: ErrorSuppressedPayloadSchema }),
  EnvelopeBaseSchema.extend({ event_type: z.literal("probe_event"), payload: ProbeEventPayloadSchema })
]);

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

type CreateEnvelopeInput = Omit<EventEnvelope, "schema_version" | "event_id" | "occurred_at" | "correlation" | "sdk_name" | "sdk_version"> &
  Partial<Pick<EventEnvelope, "schema_version" | "event_id" | "occurred_at" | "correlation" | "sdk_name" | "sdk_version">>;

export function createEventEnvelope(input: CreateEnvelopeInput): EventEnvelope {
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
    payload: input.payload
  };

  return EventEnvelopeSchema.parse(candidate);
}

// ---------------------------------------------------------------------------
// Bundle V1 Schema
// ---------------------------------------------------------------------------

const SeveritySchema = z.enum(["low", "medium", "high", "critical"]);

const BundleSdkSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1)
});

const BundleProjectSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  environment: z.string().min(1)
});

const BundleServiceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  runtime: z.string().min(1).nullable(),
  framework: z.string().min(1).nullable(),
  version: z.string().min(1).nullable(),
  region: z.string().min(1).nullable()
});

const SignalTypeSchema = z.enum([
  "exception",
  "fatal_error",
  "request_failure",
  "frontend_exception",
  "warning",
  "deprecation",
  "performance_issue",
  "retry_loop",
  "slow_query"
]);

const BundleSignalSchema = z.object({
  signal_id: z.string().min(1),
  signal_type: SignalTypeSchema,
  severity: SeveritySchema,
  fingerprint: z.string().min(1),
  first_seen_at: z.string().datetime(),
  last_seen_at: z.string().datetime(),
  occurrence_count: z.number().int().nonnegative(),
  source_event_types: z.array(z.string().min(1))
});

const FirstApplicationFrameSchema = z.object({
  file: z.string().nullable(),
  line: z.number().int().nonnegative().nullable(),
  function: z.string().nullable()
});

const SummarySignalsSchema = z.object({
  new_deploy: z.boolean(),
  regression_suspected: z.boolean(),
  customer_visible: z.boolean()
});

const BundleSummarySchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  likely_cause: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  recommended_action: z.string().nullable(),
  severity: SeveritySchema,
  error_type: z.string().nullable(),
  error_message: z.string().nullable(),
  first_application_frame: FirstApplicationFrameSchema.nullable(),
  primary_signal: z.string().nullable(),
  signals: SummarySignalsSchema
});

const BundleImpactSchema = z.object({
  affected_users_estimate: z.number().int().nonnegative().nullable(),
  affected_requests_estimate: z.number().int().nonnegative().nullable(),
  business_criticality: SeveritySchema,
  customer_visible: z.boolean(),
  regression_suspected: z.boolean()
});

const ContextErrorSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1),
    message: z.string().min(1),
    stack: z.string().min(1),
    handled: z.boolean(),
    top_frames: z.array(z.string())
  })
  .nullable();

const ContextRequestSchema = z.object({
  version: z.literal(1),
  method: z.string().min(1),
  path: z.string().min(1),
  route_template: z.string().nullable(),
  query: z.record(z.string(), z.unknown()),
  headers: z.record(z.string(), z.unknown()),
  body: z.unknown().nullable(),
  request_id: z.string().nullable()
});

const ContextResponseSchema = z.object({
  version: z.literal(1),
  status_code: z.number().int(),
  duration_ms: z.number().nonnegative().nullable(),
  headers: z.record(z.string(), z.unknown()).optional(),
  body: z.unknown().optional()
});

const LogItemSchema = z.object({
  level: z.string().min(1),
  message: z.string().min(1),
  timestamp: z.string().datetime(),
  attributes: z.record(z.string(), z.unknown())
});

const ContextLogsSchema = z.object({
  version: z.literal(1),
  items: z.array(LogItemSchema)
});

const ContextFrontendSchema = z.object({
  version: z.literal(1),
  route_changes: z.array(z.object({ from: z.string(), to: z.string(), ts: z.string().datetime() })),
  clicks: z.array(z.object({ selector: z.string(), label: z.string(), ts: z.string().datetime() })),
  form_submissions: z.array(z.object({ form: z.string(), fields: z.record(z.string(), z.unknown()), ts: z.string().datetime() })),
  console_logs: z.array(z.unknown()),
  network_requests: z.array(z.object({
    method: z.string(),
    url: z.string(),
    status: z.number().int(),
    ts: z.string().datetime(),
    duration_ms: z.number().nonnegative().optional(),
    caller_trace: z.array(z.string()).optional(),
    response_body: z.unknown().optional(),
    request_body: z.unknown().optional(),
    response_headers: z.record(z.string(), z.string()).optional(),
    response_content_length: z.number().int().nonnegative().optional()
  })),
  exceptions: z.array(z.unknown()),
  dom_context: z
    .object({
      mode: z.literal("lightweight"),
      html_excerpt: z.string()
    })
    .nullable()
});

const ContextEnvironmentSchema = z.object({
  version: z.literal(1),
  os: z.string().nullable(),
  host: z.string().nullable(),
  container_id: z.string().nullable()
});

const ContextDeploySchema = z.object({
  version: z.literal(1),
  commit_sha: z.string().nullable(),
  deploy_version: z.string().nullable(),
  branch: z.string().nullable(),
  deployed_at: z.string().datetime().nullable(),
  regression_window: z.boolean().nullable()
});

const MemoryStatsSchema = RuntimeMemoryStatsSchema;

const ContextRuntimeSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  runtime_version: z.string().nullable(),
  platform: z.string().nullable(),
  arch: z.string().nullable(),
  pid: z.number().int().nullable(),
  cwd: z.string().nullable(),
  uptime_sec: z.number().nonnegative().nullable(),
  hostname: z.string().nullable(),
  thread_id: z.union([z.string(), z.number()]).nullable(),
  framework: z.string().nullable(),
  framework_version: z.string().nullable(),
  memory: MemoryStatsSchema.nullable(),
  framework_extras: z.record(z.string(), z.unknown()).nullable().optional()
});

const ContextGitSchema = z.object({
  version: z.literal(1),
  commit: z.string().nullable(),
  commit_short: z.string().nullable(),
  branch: z.string().nullable(),
  repo: z.string().nullable(),
  dirty: z.boolean(),
  source: z.enum(["config", "env", "local", "unknown"])
});

const DependencyItemSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["ok", "degraded", "failed", "unknown"]),
  notes: z.string().nullable()
});

const ContextDependenciesSchema = z.object({
  version: z.literal(1),
  items: z.array(DependencyItemSchema)
});

const ProbeDataItemSchema = z.object({
  label: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  timestamp: z.string().datetime(),
  activation_id: z.string().uuid().nullable()
});

const ContextProbeDataSchema = z.object({
  version: z.literal(1),
  items: z.array(ProbeDataItemSchema)
});

const ContextDeviceSchema = z.object({
  version: z.literal(1),
  user_agent: z.string().nullable(),
  browser: z.object({
    name: z.string().nullable(),
    version: z.string().nullable()
  }),
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
});

const BundleContextSchema = z.object({
  error: ContextErrorSchema.nullable().optional(),
  request: ContextRequestSchema.nullable().optional(),
  response: ContextResponseSchema.nullable().optional(),
  logs: ContextLogsSchema.nullable().optional(),
  frontend: ContextFrontendSchema.nullable().optional(),
  environment: ContextEnvironmentSchema.nullable().optional(),
  deploy: ContextDeploySchema.nullable().optional(),
  runtime: ContextRuntimeSchema.nullable().optional(),
  git: ContextGitSchema.nullable().optional(),
  dependencies: ContextDependenciesSchema.nullable().optional(),
  probe_data: ContextProbeDataSchema.nullable().optional(),
  device: ContextDeviceSchema.nullable().optional()
});

const ReproductionArtifactsSchema = z.object({
  curl: z.string().nullable(),
  httpie: z.string().nullable(),
  json_spec: z
    .object({
      method: z.string(),
      url: z.string(),
      headers: z.record(z.string(), z.unknown()),
      query: z.record(z.string(), z.unknown()).optional(),
      body: z.unknown().nullable()
    })
    .nullable()
});

const FeasibilityReferenceSchema = z.object({
  standard_http_bugs: z.string(),
  frontend_interaction_plus_failing_request: z.string(),
  background_jobs: z.string(),
  race_conditions: z.string(),
  external_outage_timing: z.string()
});

const BundleReproductionSchema = z.object({
  possible: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  artifacts: ReproductionArtifactsSchema.nullable(),
  feasibility_reference: FeasibilityReferenceSchema.nullable().optional()
});

const BundleVerificationSchema = z.object({
  verification_type: z.string().nullable(),
  synthetic: z.boolean(),
  local_verified: z.boolean(),
  production_verified: z.boolean()
});

const BundleLinksSchema = z.object({
  self: z.string().nullable(),
  reproduction: z.string().nullable(),
  incident: z.string().nullable(),
  project: z.string().nullable(),
  docs: z.string().nullable()
});

const BundleRedactionSchema = z.object({
  redacted: z.boolean(),
  fields: z.array(z.string()),
  notes: z.string().nullable()
});

const BundleMetadataSchema = z.object({
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  generator_version: z.string().min(1),
  generation_number: z.number().int().positive()
});

export const BundleV1Schema = z.object({
  bundle_version: z.literal(1),
  bundle_id: z.string().min(1),
  bundle_type: z.enum(["failure", "improvement"]),
  captured_at: z.string().datetime(),
  sdk: BundleSdkSchema,
  project: BundleProjectSchema,
  service: BundleServiceSchema,
  signal: BundleSignalSchema,
  summary: BundleSummarySchema,
  impact: BundleImpactSchema,
  context: BundleContextSchema,
  reproduction: BundleReproductionSchema,
  verification: BundleVerificationSchema,
  links: BundleLinksSchema,
  redaction: BundleRedactionSchema,
  metadata: BundleMetadataSchema
});

export type BundleV1 = z.infer<typeof BundleV1Schema>;

export {
  MAX_BILLING_ADDITIONAL_CAPACITY_UNITS,
  TIER_CAPABILITIES,
  getTierCapabilities,
  isSelfHostMode,
  type TierName,
  type TierCapabilities
} from "./tier-capabilities.js";

export {
  EventClassValues,
  EventClassSchema,
  type EventClass,
  CapturePresetValues,
  CapturePresetSchema,
  type CapturePreset,
  CaptureLogsSchema,
  CaptureRequestEventsSchema,
  CaptureBreadcrumbsSchema,
  CaptureProbeEventsSchema,
  ImmediateClientErrorStatusesSchema,
  RECOMMENDED_IMMEDIATE_CLIENT_ERROR_STATUSES,
  type CaptureLogs,
  type CaptureRequestEvents,
  type CaptureBreadcrumbs,
  type CaptureProbeEvents,
  ResolvedCapturePolicySchema,
  type ResolvedCapturePolicy,
  CapturePolicyOverridesSchema,
  type CapturePolicyOverrides,
  CapturePolicyResponseSchema,
  type CapturePolicyResponse,
  CapturePolicySchema,
  type CapturePolicyRecord,
  CapturePolicyUpdateSchema,
  type CapturePolicyUpdate,
  PRESET_DEFAULTS,
  DEFAULT_PRESET_BY_TIER,
  RequestSignalClassificationValues,
  RequestSignalClassificationSchema,
  type RequestSignalClassification,
  normalizeImmediateClientErrorStatuses,
  getCapturePolicyOverrides,
  resolvePolicy,
  getDefaultPreset,
  classifyRequestStatus,
  isImmediateRequestIncident,
  getRequestAnomalyThreshold,
  shouldCaptureEvent,
} from "./capture-policy.js";

export {
  isLowValueExternalProbeRequestFailure404
} from "./request-failure-noise.js";

export {
  CaptureRuleActionValues,
  CaptureRuleActionSchema,
  type CaptureRuleAction,
  CaptureRuleSampleEventClassValues,
  CaptureRuleSampleEventClassSchema,
  type CaptureRuleSampleEventClass,
  CaptureRuleRuntimeSchema,
  type CaptureRuleRuntime,
  CaptureRuleEventTypeSchema,
  type CaptureRuleEventType,
  BrowserEventKindSchema,
  type BrowserEventKind,
  CaptureRuleMatcherSchema,
  type CaptureRuleMatcher,
  CaptureRuleSchema,
  type CaptureRule,
  CaptureRuleResponseSchema,
  type CaptureRuleResponse,
  CaptureRulesResponseSchema,
  type CaptureRulesResponse,
  CaptureRuleCreateSchema,
  type CaptureRuleCreate,
  CaptureRuleUpdateSchema,
  type CaptureRuleUpdate,
  CaptureRulesFileSchema,
  type CaptureRulesFile,
  CaptureRuleEvaluationContextSchema,
  type CaptureRuleEvaluationContext,
  type CaptureRuleEvaluationResult,
  type CaptureRuleEvaluableEvent,
  buildCaptureRuleEvaluationContext,
  applyCaptureRuleEventClass,
  matchesCaptureRule,
  isCaptureRuleActive,
  getCaptureRuleSpecificityScore,
  shouldSampleCaptureRuleEvent,
  evaluateCaptureRules,
} from "./capture-rules.js";

export {
  CaptureRuleSuggestionConfidenceSchema,
  type CaptureRuleSuggestionConfidence,
  CaptureRuleSuggestionSchema,
  type CaptureRuleSuggestion,
  CaptureRuleSuggestionsResponseSchema,
  type CaptureRuleSuggestionsResponse,
  CreateCaptureRuleFromSuggestionSchema,
  type CreateCaptureRuleFromSuggestion,
  type CaptureRuleSuggestionIncident,
  type CaptureRuleSuggestionBundle,
  buildCaptureRuleSuggestions
} from "./capture-rule-suggestions.js";

export {
  ImprovementBundleSensitivityValues,
  ImprovementBundleSensitivitySchema,
  type ImprovementBundleSensitivity,
  ImprovementSettingsSchema,
  type ImprovementSettings,
  ImprovementSettingsResponseSchema,
  type ImprovementSettingsResponse,
  ImprovementSettingsUpdateSchema,
  type ImprovementSettingsUpdate
} from "./improvement-settings.js";
