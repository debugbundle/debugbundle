import { z } from "zod";

const CAPTURE_RULE_EVENT_TYPES = [
  "backend_exception",
  "request_event",
  "log_event",
  "frontend_breadcrumb",
  "frontend_exception",
  "deploy_metadata",
  "error_suppressed",
  "probe_event",
] as const;

const CAPTURE_RULE_RUNTIME_VALUES = [
  "browser",
  "node",
  "python",
  "php",
  "java",
  "go",
  "ruby",
  "unknown",
] as const;

export const CaptureRuleActionValues = ["demote", "sample", "drop"] as const;
export const CaptureRuleActionSchema = z.enum(CaptureRuleActionValues);
export type CaptureRuleAction = z.infer<typeof CaptureRuleActionSchema>;

export const CaptureRuleSampleEventClassValues = ["preserve", "context"] as const;
export const CaptureRuleSampleEventClassSchema = z.enum(CaptureRuleSampleEventClassValues);
export type CaptureRuleSampleEventClass = z.infer<typeof CaptureRuleSampleEventClassSchema>;

export const CaptureRuleRuntimeSchema = z.enum(CAPTURE_RULE_RUNTIME_VALUES);
export type CaptureRuleRuntime = z.infer<typeof CaptureRuleRuntimeSchema>;

export const CaptureRuleEventTypeSchema = z.enum(CAPTURE_RULE_EVENT_TYPES);
export type CaptureRuleEventType = z.infer<typeof CaptureRuleEventTypeSchema>;

export const BrowserEventKindSchema = z.enum(["window_error", "resource_error"]);
export type BrowserEventKind = z.infer<typeof BrowserEventKindSchema>;

function normalizeOptionalTrimmedString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalLowercaseHost(value: string | undefined): string | undefined {
  const trimmed = normalizeOptionalTrimmedString(value);
  return trimmed?.toLowerCase();
}

function normalizeOptionalPath(value: string | undefined): string | undefined {
  const trimmed = normalizeOptionalTrimmedString(value);
  if (trimmed === undefined) {
    return undefined;
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null;
}

export interface CaptureRuleUrlMatcher {
  host?: string;
  host_suffix?: string;
  path_prefix?: string;
  path_equals?: string;
}

const UrlMatcherSchema = z
  .object({
    host: z.string().min(1).max(255).optional(),
    host_suffix: z.string().min(1).max(255).optional(),
    path_prefix: z.string().min(1).max(1024).optional(),
    path_equals: z.string().min(1).max(1024).optional(),
  })
  .transform((value) => {
    const normalized: CaptureRuleUrlMatcher = {};
    const host = normalizeOptionalLowercaseHost(value.host);
    const hostSuffix = normalizeOptionalLowercaseHost(value.host_suffix);
    const pathPrefix = normalizeOptionalPath(value.path_prefix);
    const pathEquals = normalizeOptionalPath(value.path_equals);

    if (host !== undefined) {
      normalized.host = host;
    }
    if (hostSuffix !== undefined) {
      normalized.host_suffix = hostSuffix;
    }
    if (pathPrefix !== undefined) {
      normalized.path_prefix = pathPrefix;
    }
    if (pathEquals !== undefined) {
      normalized.path_equals = pathEquals;
    }

    return normalized;
  })
  .refine((value) => hasValue(value.host) || hasValue(value.host_suffix) || hasValue(value.path_prefix) || hasValue(value.path_equals), {
    message: "URL matchers must include at least one host or path constraint.",
  });

const StatusRangeSchema = z
  .object({
    start: z.number().int().min(100).max(599),
    end: z.number().int().min(100).max(599),
  })
  .refine((value) => value.start <= value.end, {
    message: "Status range start must be less than or equal to end.",
  });

const CaptureRuleFingerprintSchema = z.object({
  version: z.string().min(1).max(32),
  value: z.string().min(1).max(256),
});

export type CaptureRuleFingerprint = z.infer<typeof CaptureRuleFingerprintSchema>;

function normalizeStringArray(values: readonly string[] | undefined): string[] | undefined {
  if (values === undefined) {
    return undefined;
  }

  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)));
}

function normalizeNumberArray(values: readonly number[] | undefined): number[] | undefined {
  if (values === undefined) {
    return undefined;
  }

  return Array.from(new Set(values)).sort((left, right) => left - right);
}

export interface CaptureRuleMatcher {
  event_types?: readonly CaptureRuleEventType[];
  services?: readonly string[];
  environments?: readonly string[];
  runtime?: readonly CaptureRuleRuntime[];
  first_party?: boolean;
  error_name?: string;
  message_contains?: string;
  message_equals?: string;
  browser_event_kind?: BrowserEventKind;
  resource_url?: CaptureRuleUrlMatcher;
  request_url?: CaptureRuleUrlMatcher;
  status_codes?: readonly number[];
  status_ranges?: readonly { start: number; end: number }[];
  fingerprint?: CaptureRuleFingerprint;
}

export const CaptureRuleMatcherSchema = z
  .object({
    event_types: z.array(CaptureRuleEventTypeSchema).min(1).optional(),
    services: z.array(z.string().min(1).max(120)).min(1).optional(),
    environments: z.array(z.string().min(1).max(120)).min(1).optional(),
    runtime: z.array(CaptureRuleRuntimeSchema).min(1).optional(),
    first_party: z.boolean().optional(),
    error_name: z.string().min(1).max(120).optional(),
    message_contains: z.string().min(1).max(500).optional(),
    message_equals: z.string().min(1).max(500).optional(),
    browser_event_kind: BrowserEventKindSchema.optional(),
    resource_url: UrlMatcherSchema.optional(),
    request_url: UrlMatcherSchema.optional(),
    status_codes: z.array(z.number().int().min(100).max(599)).min(1).optional(),
    status_ranges: z.array(StatusRangeSchema).min(1).optional(),
    fingerprint: CaptureRuleFingerprintSchema.optional(),
  })
  .transform((value) => {
    const normalized: CaptureRuleMatcher = {};
    const eventTypes = normalizeStringArray(value.event_types) as CaptureRuleEventType[] | undefined;
    const services = normalizeStringArray(value.services);
    const environments = normalizeStringArray(value.environments);
    const runtime = normalizeStringArray(value.runtime) as CaptureRuleRuntime[] | undefined;
    const errorName = normalizeOptionalTrimmedString(value.error_name);
    const messageContains = normalizeOptionalTrimmedString(value.message_contains);
    const messageEquals = normalizeOptionalTrimmedString(value.message_equals);
    const statusCodes = normalizeNumberArray(value.status_codes);

    if (eventTypes !== undefined) {
      normalized.event_types = eventTypes;
    }
    if (services !== undefined) {
      normalized.services = services;
    }
    if (environments !== undefined) {
      normalized.environments = environments;
    }
    if (runtime !== undefined) {
      normalized.runtime = runtime;
    }
    if (value.first_party !== undefined) {
      normalized.first_party = value.first_party;
    }
    if (errorName !== undefined) {
      normalized.error_name = errorName;
    }
    if (messageContains !== undefined) {
      normalized.message_contains = messageContains;
    }
    if (messageEquals !== undefined) {
      normalized.message_equals = messageEquals;
    }
    if (value.browser_event_kind !== undefined) {
      normalized.browser_event_kind = value.browser_event_kind;
    }
    if (value.resource_url !== undefined) {
      normalized.resource_url = value.resource_url;
    }
    if (value.request_url !== undefined) {
      normalized.request_url = value.request_url;
    }
    if (statusCodes !== undefined) {
      normalized.status_codes = statusCodes;
    }
    if (value.status_ranges !== undefined) {
      normalized.status_ranges = value.status_ranges;
    }
    if (value.fingerprint !== undefined) {
      normalized.fingerprint = value.fingerprint;
    }

    return normalized;
  })
  .superRefine((value, context) => {
    const narrowingKeys = [
      "services",
      "environments",
      "runtime",
      "first_party",
      "error_name",
      "message_contains",
      "message_equals",
      "browser_event_kind",
      "resource_url",
      "request_url",
      "status_codes",
      "status_ranges",
      "fingerprint",
    ] as const;

    if (!narrowingKeys.some((key) => hasValue(value[key]))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Capture rules must include at least one narrowing field beyond event_types.",
      });
    }

    if (value.browser_event_kind === "resource_error") {
      const hasResourceConstraint = hasValue(value.resource_url) || hasValue(value.fingerprint);
      if (!hasResourceConstraint) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Resource-error rules require a resource URL constraint or an exact fingerprint.",
        });
      }
    }
  });

const CaptureRuleCoreObjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable(),
    enabled: z.boolean(),
    action: CaptureRuleActionSchema,
    matcher: CaptureRuleMatcherSchema,
    sample_rate: z.number().min(0).max(1).nullable(),
    sample_event_class: CaptureRuleSampleEventClassSchema.nullable(),
    created_by_user_id: z.string().min(1).max(120).nullable(),
    created_from_incident_id: z.string().min(1).max(120).nullable(),
    created_from_event_id: z.string().min(1).max(120).nullable(),
    expires_at: z.string().datetime().nullable(),
  });

function addCaptureRuleActionValidation<Schema extends z.AnyZodObject>(schema: Schema): z.ZodEffects<Schema> {
  return schema.superRefine((value, context) => {
    if (value["action"] === "sample") {
      if (value["sample_rate"] === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_rate"],
          message: "Sample rules require sample_rate.",
        });
      }
      if (value["sample_event_class"] === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_event_class"],
          message: "Sample rules require sample_event_class.",
        });
      }
      return;
    }

    if (value["sample_rate"] !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sample_rate"],
        message: "Only sample rules can set sample_rate.",
      });
    }

    if (value["sample_event_class"] !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sample_event_class"],
        message: "Only sample rules can set sample_event_class.",
      });
    }
  });
}

export const CaptureRuleSchema = addCaptureRuleActionValidation(
  CaptureRuleCoreObjectSchema.extend({
  id: z.string().uuid(),
  project_id: z.string().min(1).max(120),
  hit_count: z.number().int().nonnegative(),
  last_matched_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  })
);

export type CaptureRule = z.infer<typeof CaptureRuleSchema>;

export const CaptureRuleCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable().default(null),
    enabled: z.boolean().default(true),
    action: CaptureRuleActionSchema,
    matcher: CaptureRuleMatcherSchema,
    sample_rate: z.number().min(0).max(1).nullable().optional(),
    sample_event_class: CaptureRuleSampleEventClassSchema.nullable().optional(),
    created_by_user_id: z.string().min(1).max(120).nullable().default(null),
    created_from_incident_id: z.string().min(1).max(120).nullable().default(null),
    created_from_event_id: z.string().min(1).max(120).nullable().default(null),
    expires_at: z.string().datetime().nullable().default(null),
  })
  .superRefine((value, context) => {
    if (value.action === "sample") {
      if (value.sample_rate === undefined || value.sample_rate === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_rate"],
          message: "Sample rules require sample_rate.",
        });
      }
      return;
    }

    if (value.sample_rate !== undefined && value.sample_rate !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sample_rate"],
        message: "Only sample rules can set sample_rate.",
      });
    }

    if (value.sample_event_class !== undefined && value.sample_event_class !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sample_event_class"],
        message: "Only sample rules can set sample_event_class.",
      });
    }
  })
  .transform((value) => ({
    ...value,
    sample_rate: value.action === "sample" ? value.sample_rate! : null,
    sample_event_class: value.action === "sample" ? (value.sample_event_class ?? "preserve") : null,
  }));

export type CaptureRuleCreate = z.infer<typeof CaptureRuleCreateSchema>;

export const CaptureRuleUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    enabled: z.boolean().optional(),
    action: CaptureRuleActionSchema.optional(),
    matcher: CaptureRuleMatcherSchema.optional(),
    sample_rate: z.number().min(0).max(1).nullable().optional(),
    sample_event_class: CaptureRuleSampleEventClassSchema.nullable().optional(),
    expires_at: z.string().datetime().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one capture rule field must be provided.",
      });
    }

    const resolvedAction = value.action;
    if (resolvedAction === "sample") {
      if (!("sample_rate" in value)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_rate"],
          message: "Sample rule updates must include sample_rate when changing action to sample.",
        });
      }
      if (!("sample_event_class" in value)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sample_event_class"],
          message: "Sample rule updates must include sample_event_class when changing action to sample.",
        });
      }
      return;
    }

    if ("sample_rate" in value) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sample_rate"],
        message: "Sample rule fields can only be updated while setting action to sample.",
      });
    }

    if ("sample_event_class" in value) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sample_event_class"],
        message: "Sample rule fields can only be updated while setting action to sample.",
      });
    }
  });

export type CaptureRuleUpdate = z.infer<typeof CaptureRuleUpdateSchema>;

export const CaptureRuleResponseSchema = z.object({
  rule: CaptureRuleSchema,
});

export type CaptureRuleResponse = z.infer<typeof CaptureRuleResponseSchema>;

export const CaptureRulesResponseSchema = z.object({
  access_mode: z.enum(["manage", "preview"]),
  rules: z.array(CaptureRuleSchema),
});

export type CaptureRulesResponse = z.infer<typeof CaptureRulesResponseSchema>;

export const CaptureRulesFileSchema = z.object({
  version: z.literal(1),
  rules: z.array(CaptureRuleSchema),
});

export type CaptureRulesFile = z.infer<typeof CaptureRulesFileSchema>;

const CaptureRuleEvaluationUrlSchema = z.object({
  host: z.string().min(1).transform((value) => value.toLowerCase()).optional(),
  path: z.string().min(1).transform((value) => (value.startsWith("/") ? value : `/${value}`)),
});

export type CaptureRuleEvaluationUrl = z.infer<typeof CaptureRuleEvaluationUrlSchema>;

export const CaptureRuleEvaluationContextSchema = z.object({
  project_id: z.string().min(1).max(120),
  event_id: z.string().uuid(),
  event_type: CaptureRuleEventTypeSchema,
  service: z.string().min(1).optional(),
  environment: z.string().min(1).optional(),
  runtime: CaptureRuleRuntimeSchema,
  first_party: z.boolean().optional(),
  error_name: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  browser_event_kind: BrowserEventKindSchema.optional(),
  resource_url: CaptureRuleEvaluationUrlSchema.optional(),
  request_url: CaptureRuleEvaluationUrlSchema.optional(),
  status_code: z.number().int().min(0).max(599).optional(),
  fingerprint: CaptureRuleFingerprintSchema.optional(),
});

export type CaptureRuleEvaluationContext = z.infer<typeof CaptureRuleEvaluationContextSchema>;

export interface CaptureRuleEvaluationResult {
  rule_id: string;
  action: CaptureRuleAction;
  outcome: "demote" | "drop" | "sampled_in" | "sampled_out";
  sample_rate: number | null;
  sample_event_class: CaptureRuleSampleEventClass | null;
}

export type CaptureRuleEvaluableEvent = {
  event_id: string;
  event_type: CaptureRuleEventType;
  service: {
    name: string;
    environment: string;
    runtime?: string | null;
  };
  payload: Record<string, unknown>;
};

function normalizeRuntime(value: string | null | undefined): CaptureRuleRuntime {
  switch (value?.trim().toLowerCase()) {
    case "browser":
      return "browser";
    case "node":
    case "nodejs":
      return "node";
    case "python":
      return "python";
    case "php":
      return "php";
    case "java":
      return "java";
    case "go":
    case "golang":
      return "go";
    case "ruby":
      return "ruby";
    default:
      return "unknown";
  }
}

function normalizeRoutePath(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return undefined;
  }

  const pathWithoutQueryOrFragment = trimmed.split(/[?#]/, 1)[0] ?? "";
  if (pathWithoutQueryOrFragment.length === 0) {
    return "/";
  }

  return pathWithoutQueryOrFragment.startsWith("/") ? pathWithoutQueryOrFragment : `/${pathWithoutQueryOrFragment}`;
}

function normalizeEvaluationUrl(value: string | null | undefined): {
  url?: CaptureRuleEvaluationUrl;
  first_party?: boolean;
} {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return {};
  }

  const relativePath = normalizeRoutePath(trimmed);
  if (relativePath !== undefined && trimmed.startsWith("/")) {
    return {
      url: { path: relativePath },
      first_party: true,
    };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return {
        url: {
          host: parsed.hostname.length > 0 ? parsed.hostname.toLowerCase() : undefined,
          path: normalizeRoutePath(parsed.pathname) ?? "/",
        },
        first_party: false,
      };
    }
  } catch {
    if (relativePath !== undefined) {
      return {
        url: { path: relativePath },
        first_party: true,
      };
    }
  }

  return {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function buildCaptureRuleEvaluationContext(input: {
  project_id: string;
  event: CaptureRuleEvaluableEvent;
  fingerprint?: CaptureRuleFingerprint;
}): CaptureRuleEvaluationContext {
  const context: CaptureRuleEvaluationContext = {
    project_id: input.project_id,
    event_id: input.event.event_id,
    event_type: input.event.event_type,
    service: input.event.service.name,
    environment: input.event.service.environment,
    runtime: normalizeRuntime(input.event.service.runtime),
    ...(input.fingerprint === undefined ? {} : { fingerprint: input.fingerprint }),
  };

  switch (input.event.event_type) {
    case "backend_exception": {
      const request = readRecord(input.event.payload["request"]);
      const response = readRecord(input.event.payload["response"]);
      const requestUrl = normalizeEvaluationUrl(readString(request?.["path"]));

      return CaptureRuleEvaluationContextSchema.parse({
        ...context,
        first_party: true,
        error_name: readString(input.event.payload["name"]),
        message: readString(input.event.payload["message"]),
        request_url: requestUrl.url,
        status_code: readNumber(response?.["status_code"]),
      });
    }

    case "request_event": {
      const requestUrl = normalizeEvaluationUrl(readString(input.event.payload["path"]));

      return CaptureRuleEvaluationContextSchema.parse({
        ...context,
        first_party: requestUrl.first_party ?? true,
        request_url: requestUrl.url,
        status_code: readNumber(input.event.payload["response_status"]),
      });
    }

    case "log_event":
      return CaptureRuleEvaluationContextSchema.parse({
        ...context,
        message: readString(input.event.payload["message"]),
      });

    case "frontend_exception": {
      const browserEvent = readRecord(input.event.payload["browser_event"]);
      const target = readRecord(browserEvent?.["target"]);
      const browserEventKind = browserEvent?.["kind"];
      const resourceSource =
        typeof target?.["source_url"] === "string"
          ? target["source_url"]
          : typeof browserEvent?.["file_name"] === "string"
            ? browserEvent["file_name"]
            : undefined;
      const resourceUrl = normalizeEvaluationUrl(resourceSource);

      return CaptureRuleEvaluationContextSchema.parse({
        ...context,
        ...(resourceUrl.first_party === undefined ? {} : { first_party: resourceUrl.first_party }),
        error_name: readString(input.event.payload["name"]),
        message: readString(input.event.payload["message"]),
        browser_event_kind:
          browserEventKind === "window_error" || browserEventKind === "resource_error"
            ? browserEventKind
            : undefined,
        resource_url: resourceUrl.url,
      });
    }

    case "frontend_breadcrumb": {
      if (input.event.payload["breadcrumb_type"] !== "network_request") {
        return CaptureRuleEvaluationContextSchema.parse(context);
      }

      const data = readRecord(input.event.payload["data"]);
      const requestUrl = normalizeEvaluationUrl(readString(data?.["url"]));

      return CaptureRuleEvaluationContextSchema.parse({
        ...context,
        ...(requestUrl.first_party === undefined ? {} : { first_party: requestUrl.first_party }),
        request_url: requestUrl.url,
        status_code: readNumber(data?.["status_code"]),
      });
    }

    default:
      return CaptureRuleEvaluationContextSchema.parse(context);
  }
}

export function applyCaptureRuleEventClass(input: {
  event_class: "incident_signal" | "context_signal" | "operational_signal";
  capture_rule: CaptureRuleEvaluationResult | null;
}): "incident_signal" | "context_signal" | "operational_signal" {
  if (input.capture_rule === null) {
    return input.event_class;
  }

  if (input.capture_rule.outcome === "demote") {
    return "context_signal";
  }

  if (input.capture_rule.action === "sample" && input.capture_rule.sample_event_class === "context") {
    return "context_signal";
  }

  return input.event_class;
}

function matchesUrlMatcher(
  matcher: CaptureRuleUrlMatcher | undefined,
  value: CaptureRuleEvaluationUrl | undefined
): boolean {
  if (matcher === undefined) {
    return true;
  }

  if (value === undefined) {
    return false;
  }

  if (matcher.host !== undefined && value.host !== matcher.host) {
    return false;
  }

  if (matcher.host_suffix !== undefined && (value.host === undefined || !value.host.endsWith(matcher.host_suffix))) {
    return false;
  }

  if (matcher.path_equals !== undefined && value.path !== matcher.path_equals) {
    return false;
  }

  if (matcher.path_prefix !== undefined && !value.path.startsWith(matcher.path_prefix)) {
    return false;
  }

  return true;
}

function matchesStatusRange(
  statusCode: number | undefined,
  ranges: ReadonlyArray<{ start: number; end: number }> | undefined
): boolean {
  if (ranges === undefined) {
    return true;
  }

  if (statusCode === undefined) {
    return false;
  }

  return ranges.some((range) => statusCode >= range.start && statusCode <= range.end);
}

function matchesStatusCodes(statusCode: number | undefined, statusCodes: readonly number[] | undefined): boolean {
  if (statusCodes === undefined) {
    return true;
  }

  if (statusCode === undefined) {
    return false;
  }

  return statusCodes.includes(statusCode);
}

export function matchesCaptureRule(rule: CaptureRule, contextInput: CaptureRuleEvaluationContext): boolean {
  const context = CaptureRuleEvaluationContextSchema.parse(contextInput);
  const matcher = rule.matcher;

  if (matcher.event_types !== undefined && !matcher.event_types.includes(context.event_type)) {
    return false;
  }

  if (matcher.services !== undefined && (context.service === undefined || !matcher.services.includes(context.service))) {
    return false;
  }

  if (
    matcher.environments !== undefined &&
    (context.environment === undefined || !matcher.environments.includes(context.environment))
  ) {
    return false;
  }

  if (matcher.runtime !== undefined && !matcher.runtime.includes(context.runtime)) {
    return false;
  }

  if (matcher.first_party !== undefined && context.first_party !== matcher.first_party) {
    return false;
  }

  if (matcher.error_name !== undefined && context.error_name !== matcher.error_name) {
    return false;
  }

  if (matcher.message_equals !== undefined && context.message !== matcher.message_equals) {
    return false;
  }

  if (matcher.message_contains !== undefined) {
    if (context.message === undefined || !context.message.includes(matcher.message_contains)) {
      return false;
    }
  }

  if (matcher.browser_event_kind !== undefined && context.browser_event_kind !== matcher.browser_event_kind) {
    return false;
  }

  if (!matchesUrlMatcher(matcher.resource_url, context.resource_url)) {
    return false;
  }

  if (!matchesUrlMatcher(matcher.request_url, context.request_url)) {
    return false;
  }

  if (!matchesStatusCodes(context.status_code, matcher.status_codes)) {
    return false;
  }

  if (!matchesStatusRange(context.status_code, matcher.status_ranges)) {
    return false;
  }

  if (matcher.fingerprint !== undefined) {
    if (context.fingerprint === undefined) {
      return false;
    }

    if (
      context.fingerprint.version !== matcher.fingerprint.version ||
      context.fingerprint.value !== matcher.fingerprint.value
    ) {
      return false;
    }
  }

  return true;
}

export function isCaptureRuleActive(rule: CaptureRule, now: string): boolean {
  if (!rule.enabled) {
    return false;
  }

  if (rule.expires_at === null) {
    return true;
  }

  return Date.parse(rule.expires_at) > Date.parse(now);
}

export function getCaptureRuleSpecificityScore(rule: CaptureRule): number {
  const matcher = rule.matcher;
  let score = 0;

  if (matcher.fingerprint !== undefined) {
    score += 1000;
  }
  if (matcher.resource_url?.host !== undefined) {
    score += 250;
  }
  if (matcher.request_url?.host !== undefined) {
    score += 250;
  }
  if (matcher.resource_url?.path_equals !== undefined || matcher.request_url?.path_equals !== undefined) {
    score += 200;
  }
  if (matcher.status_codes !== undefined) {
    score += 150;
  }
  if (matcher.browser_event_kind !== undefined) {
    score += 100;
  }
  if (matcher.resource_url?.host_suffix !== undefined || matcher.request_url?.host_suffix !== undefined) {
    score += 90;
  }
  if (matcher.resource_url?.path_prefix !== undefined || matcher.request_url?.path_prefix !== undefined) {
    score += 80;
  }
  if (matcher.error_name !== undefined) {
    score += 70;
  }
  if (matcher.message_equals !== undefined) {
    score += 60;
  }
  if (matcher.message_contains !== undefined) {
    score += 50;
  }
  if (matcher.first_party !== undefined) {
    score += 40;
  }
  if (matcher.services !== undefined) {
    score += 30;
  }
  if (matcher.environments !== undefined) {
    score += 20;
  }
  if (matcher.runtime !== undefined) {
    score += 10;
  }
  if (matcher.event_types !== undefined) {
    score += 5;
  }

  return score;
}

function compareCaptureRules(left: CaptureRule, right: CaptureRule): number {
  const specificityDifference = getCaptureRuleSpecificityScore(right) - getCaptureRuleSpecificityScore(left);
  if (specificityDifference !== 0) {
    return specificityDifference;
  }

  const updatedDifference = Date.parse(right.updated_at) - Date.parse(left.updated_at);
  if (updatedDifference !== 0) {
    return updatedDifference;
  }

  return left.id.localeCompare(right.id);
}

function stableUnitFloat(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 0x100000000;
}

export function shouldSampleCaptureRuleEvent(input: {
  project_id: string;
  rule_id: string;
  event_id: string;
  sample_rate: number;
}): boolean {
  if (input.sample_rate <= 0) {
    return false;
  }

  if (input.sample_rate >= 1) {
    return true;
  }

  const seed = `${input.project_id}:${input.rule_id}:${input.event_id}`;
  return stableUnitFloat(seed) < input.sample_rate;
}

export function evaluateCaptureRules(
  rules: readonly CaptureRule[],
  contextInput: CaptureRuleEvaluationContext,
  now: string
): CaptureRuleEvaluationResult | null {
  const context = CaptureRuleEvaluationContextSchema.parse(contextInput);
  const activeRules = rules.filter((rule) => isCaptureRuleActive(rule, now)).sort(compareCaptureRules);

  for (const rule of activeRules) {
    if (!matchesCaptureRule(rule, context)) {
      continue;
    }

    if (rule.action === "demote") {
      return {
        rule_id: rule.id,
        action: "demote",
        outcome: "demote",
        sample_rate: null,
        sample_event_class: null,
      };
    }

    if (rule.action === "drop") {
      return {
        rule_id: rule.id,
        action: "drop",
        outcome: "drop",
        sample_rate: null,
        sample_event_class: null,
      };
    }

    const sampledIn = shouldSampleCaptureRuleEvent({
      project_id: context.project_id,
      rule_id: rule.id,
      event_id: context.event_id,
      sample_rate: rule.sample_rate ?? 0,
    });

    return {
      rule_id: rule.id,
      action: "sample",
      outcome: sampledIn ? "sampled_in" : "sampled_out",
      sample_rate: rule.sample_rate,
      sample_event_class: rule.sample_event_class,
    };
  }

  return null;
}
